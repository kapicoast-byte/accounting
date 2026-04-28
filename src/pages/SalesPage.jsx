import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Timestamp } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { useRole } from '../hooks/useRole';
import { listSales, createSale, SALE_STATUS, PAYMENT_MODES } from '../services/saleService';
import { writeSalesItems } from '../services/salesItemService';
import {
  extractTextFromPDF,
  buildPdfMappingPrompt,
  parsePdfRows,
  extractDateRangeFromText,
} from '../services/saleImportService';
import { BUSINESS_TYPES } from '../services/companyService';
import { startOfDay, endOfDay, toJsDate } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import PaymentStatusBadge from '../components/sales/PaymentStatusBadge';
import PaymentModal from '../components/sales/PaymentModal';
import DeleteRecordModal from '../components/DeleteRecordModal';
import BulkDeleteModal from '../components/BulkDeleteModal';

const BT_COLORS = {
  'F&B':           'bg-orange-50 text-orange-700 border-orange-200',
  'Retail':        'bg-green-50 text-green-700 border-green-200',
  'Manufacturing': 'bg-purple-50 text-purple-700 border-purple-200',
  'Services':      'bg-blue-50 text-blue-700 border-blue-200',
  'Mixed':         'bg-teal-50 text-teal-700 border-teal-200',
};

function BizTypeBadge({ businessType }) {
  if (!businessType) return null;
  const bt = BUSINESS_TYPES.find((b) => b.value === businessType);
  if (!bt) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${BT_COLORS[businessType] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {bt.icon} {bt.label}
    </span>
  );
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: SALE_STATUS.PAID,    label: 'Paid' },
  { value: SALE_STATUS.UNPAID,  label: 'Unpaid' },
  { value: SALE_STATUS.PARTIAL, label: 'Partial' },
];

const SOURCE_OPTIONS = [
  { value: '',       label: 'All sources' },
  { value: 'import', label: 'Imported' },
  { value: 'pos',    label: 'POS' },
];

function SourceBadge({ entrySource }) {
  if (entrySource === 'import') {
    return (
      <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
        Imported
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
      POS
    </span>
  );
}

function fmtDate(ts) {
  const d = toJsDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

// ── Gemini AI extraction ───────────────────────────────────────────────────────

let geminiCallInProgress = false;

async function geminiExtract(parts, onRetry, retries = 3, delayMs = 10000) {
  if (geminiCallInProgress) {
    throw new Error('Please wait, AI is processing…');
  }
  geminiCallInProgress = true;
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    geminiCallInProgress = false;
    throw new Error('Gemini API key not configured (VITE_GEMINI_API_KEY).');
  }
  try {
    for (let attempt = 0; attempt < retries; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }] }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        console.log('Raw Gemini response:', raw);
        return raw;
      }
      const errBody = await res.json().catch(() => ({}));
      const msg   = errBody?.error?.message ?? `Gemini error ${res.status}`;
      const is429 = res.status === 429 || msg.includes('Resource exhausted');
      if (!is429 || attempt >= retries - 1) throw new Error(msg);
      if (onRetry) {
        let secs = Math.round(delayMs / 1000);
        onRetry(`AI is busy, retrying in ${secs} seconds…`);
        await new Promise((resolve) => {
          const iv = setInterval(() => {
            secs--;
            if (secs <= 0) { clearInterval(iv); resolve(); }
            else onRetry(`AI is busy, retrying in ${secs} seconds…`);
          }, 1000);
        });
        onRetry('');
      } else {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  } finally {
    geminiCallInProgress = false;
  }
}

function buildPrompt(today) {
  return `Extract all sales transactions from this document. Today's date is ${today}.
Return a JSON array. Each element must have:
- date: "YYYY-MM-DD" (use today if not found)
- customerName: string (use "Walk-in" if unknown)
- lineItems: array of { itemName: string, quantity: number, unitPrice: number, gstRate: number }
- paymentMode: one of "Cash","Card","UPI","Credit" (use "Cash" if unknown)
- notes: string (use "" if none)
Return ONLY a valid JSON array. No markdown, no explanation, no code blocks. Just raw JSON starting with [ and ending with ]`;
}

// Local column-name guesser — no Gemini needed for CSV/Excel
function guessMapping(headers) {
  const lower = headers.map((h) => String(h).toLowerCase().trim());
  const find = (candidates) => {
    for (const cand of candidates) {
      const c = cand.toLowerCase();
      let i = lower.findIndex((h) => h === c);
      if (i !== -1) return headers[i];
      i = lower.findIndex((h) => h.includes(c) || c.includes(h));
      if (i !== -1) return headers[i];
    }
    return '';
  };
  return {
    itemName:    find(['item_name', 'item', 'name', 'product', 'description']),
    category:    find(['parent_category', 'category name', 'category', 'type']),
    quantity:    find(['units sold', 'qty', 'quantity', 'units']),
    totalAmount: find(['gross sales', 'gross_sales', 'total_amount', 'total', 'amount']),
    taxAmount:   find(['tax_amount', 'tax amount', 'tax', 'gst']),
    unitPrice:   find(['unit_price', 'my amount', 'price', 'rate']),
    date:        find(['date', 'time', 'day']),
    paymentMode: find(['payment', 'mode', 'method']),
  };
}

function applyMappingToData(data, mapping, today) {
  return data
    .filter((row) => row[mapping.itemName])
    .map((row) => {
      const qty       = Number(row[mapping.quantity])    || 1;
      const unitPrice = Number(row[mapping.unitPrice])   || 0;
      return {
        id:           Math.random().toString(36).slice(2),
        date:         (mapping.date && row[mapping.date]) || today,
        customerName: 'Walk-in',
        lineItems:    [{ itemName: String(row[mapping.itemName] ?? '').trim() || 'Item', quantity: qty, unitPrice, gstRate: 0 }],
        paymentMode:  normalisePaymentMode((mapping.paymentMode && row[mapping.paymentMode]) || ''),
        notes:        '',
      };
    });
}


function toBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = (e) => resolve(e.target.result.split(',')[1]);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function formatISODate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function normalisePaymentMode(raw) {
  if (!raw) return 'Cash';
  const s = String(raw).toLowerCase();
  if (s.includes('card') || s.includes('credit') || s.includes('debit')) return 'Card';
  if (s.includes('upi') || s.includes('gpay') || s.includes('paytm') || s.includes('phone') || s.includes('online')) return 'UPI';
  return 'Cash';
}

function normaliseRows(arr, today) {
  return arr.map((item) => {
    if (!item.lineItems && item.itemName) {
      const qty       = Number(item.quantity)  || 1;
      const unitPrice = Number(item.unitPrice) || 0;
      return {
        id:           Math.random().toString(36).slice(2),
        date:         item.date || today,
        customerName: item.customerName || 'Walk-in',
        lineItems:    [{ itemName: String(item.itemName).trim() || 'Item', quantity: qty, unitPrice, gstRate: 0 }],
        paymentMode:  normalisePaymentMode(item.paymentMode),
        notes:        item.notes || '',
      };
    }
    return {
      id:           Math.random().toString(36).slice(2),
      date:         item.date || today,
      customerName: item.customerName || 'Walk-in',
      lineItems:    (item.lineItems || []).map((l) => ({
        itemName:  l.itemName  || 'Item',
        quantity:  Number(l.quantity)  || 1,
        unitPrice: Number(l.unitPrice) || 0,
        gstRate:   Number(l.gstRate)   || 0,
      })),
      paymentMode: PAYMENT_MODES.includes(item.paymentMode) ? item.paymentMode : 'Cash',
      notes:       item.notes || '',
    };
  });
}

function dateToTs(dateStr) {
  if (!dateStr) return Timestamp.now();
  const d = new Date(dateStr + 'T12:00:00');
  return isNaN(d.getTime()) ? Timestamp.now() : Timestamp.fromDate(d);
}

// ── Import Modal ───────────────────────────────────────────────────────────────

function ImportModal({ open, onClose, companyId, onImported }) {
  const [tab,        setTab]        = useState('upload');
  const [file,       setFile]       = useState(null);
  const [paste,      setPaste]      = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState('');
  const [rows,       setRows]       = useState([]);
  const [saving,     setSaving]     = useState(false);
  const [saveErr,    setSaveErr]    = useState('');
  const [savedCount, setSavedCount] = useState(null);
  const fileRef = useRef(null);
  const [csvHeaders,    setCsvHeaders]    = useState([]);
  const [csvRawRows,    setCsvRawRows]    = useState([]);
  const [colMapping,    setColMapping]    = useState({});
  const [showColMapper, setShowColMapper] = useState(false);
  const [retryMsg,       setRetryMsg]       = useState('');
  const [pdfDateStep,    setPdfDateStep]    = useState(false);
  const [pdfDetected,    setPdfDetected]    = useState('');
  const [importDate,     setImportDate]     = useState('');
  const [pendingRows,    setPendingRows]    = useState([]);
  const [pdfRangeFrom,   setPdfRangeFrom]   = useState('');
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo,   setReportDateTo]   = useState('');
  const [pdfProgress,    setPdfProgress]    = useState('');

  useEffect(() => {
    if (open) return;
    setFile(null); setPaste(''); setRows([]);
    setExtractErr(''); setSaveErr(''); setSavedCount(null);
    setExtracting(false); setSaving(false); setTab('upload');
    setCsvHeaders([]); setCsvRawRows([]); setColMapping({}); setShowColMapper(false);
    setRetryMsg('');
    setPdfDateStep(false); setPdfDetected(''); setImportDate(''); setPendingRows([]);
    setPdfRangeFrom(''); setReportDateFrom(''); setReportDateTo('');
    setPdfProgress('');
  }, [open]);

  function updateRow(id, field, val) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  }

  async function doExtract(parts) {
    setExtracting(true);
    setExtractErr('');
    setRows([]);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = await geminiExtract(parts, setRetryMsg);
      console.log('EXACT RAW RESPONSE:', JSON.stringify(raw));
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('AI could not read this file format. Please check the file and try again.');
      let arr;
      try { arr = JSON.parse(match[0]); }
      catch { throw new Error('AI could not read this file format. Please check the file and try again.'); }
      if (!Array.isArray(arr)) throw new Error('AI could not read this file format. Please check the file and try again.');
      setRows(normaliseRows(arr, today));
    } catch (e) {
      setExtractErr(e.message ?? 'Extraction failed.');
    } finally {
      setExtracting(false);
      setRetryMsg('');
    }
  }

  async function handleExtractFile() {
    if (!file) return;

    const isPdf     = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isCsvText = /\.(csv|txt)$/i.test(file.name) || file.type.startsWith('text/');

    // ── PDF path: local text extraction + 1 Gemini call for column mapping ──
    if (isPdf) {
      setExtracting(true);
      setExtractErr('');
      setRows([]);
      try {
        // Step 1 — extract text from PDF locally
        setPdfProgress('Step 1/3: Extracting text from PDF…');
        const fullText   = await extractTextFromPDF(file);
        const sampleText = fullText.trim().slice(0, 500);
        console.log('PDF text sample:', sampleText);

        // Fallback: if pdfjs couldn't extract text (scanned/image PDF), send to Gemini as document
        if (!sampleText) {
          setPdfProgress('Step 2/3: No text found — using AI vision fallback…');
          const base64  = await toBase64(file);
          const today   = new Date().toISOString().slice(0, 10);
          await doExtract([
            { text: buildPrompt(today) },
            { inlineData: { mimeType: 'application/pdf', data: base64 } },
          ]);
          return;
        }

        // Step 2 — one Gemini call to identify column headers
        setPdfProgress('Step 2/3: AI identifying columns (1 API call)…');
        await new Promise((r) => setTimeout(r, 3000));
        const mappingRaw = await geminiExtract(
          [{ text: buildPdfMappingPrompt(sampleText) }],
          setRetryMsg,
        );
        console.log('Column mapping response:', mappingRaw);

        let mapping = {};
        const objMatch = mappingRaw.match(/\{[\s\S]*\}/);
        if (objMatch) { try { mapping = JSON.parse(objMatch[0]); } catch { /* fall through */ } }

        // Step 3 — parse all rows locally
        const pending = parsePdfRows(fullText, mapping);
        setPdfProgress(`Step 3/3: Processing ${pending.length} rows locally…`);
        if (!pending.length) throw new Error('No item rows found in this PDF. Please check the file and try again.');

        const today              = new Date().toISOString().slice(0, 10);
        const { dateFrom, dateTo } = extractDateRangeFromText(fullText);

        setPendingRows(pending);
        setPdfRangeFrom(dateFrom || '');
        setPdfDetected(
          dateFrom && dateTo
            ? `${formatISODate(dateFrom)} to ${formatISODate(dateTo)}`
            : formatISODate(dateFrom || dateTo),
        );
        setImportDate(dateTo || dateFrom || today);
        setPdfProgress(`Done! ${pending.length} items found.`);
        await new Promise((r) => setTimeout(r, 700));
        setPdfDateStep(true);
      } catch (e) {
        setExtractErr(e.message ?? 'PDF extraction failed.');
      } finally {
        setExtracting(false);
        setPdfProgress('');
        setRetryMsg('');
      }
      return;
    }

    // ── Excel path (.xlsx / .xls) ─────────────────────────────────────────────
    const isExcel = /\.(xlsx|xls)$/i.test(file.name) ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel';

    if (isExcel) {
      setExtracting(true);
      setExtractErr('');
      setRows([]);
      try {
        const ab      = await file.arrayBuffer();
        const wb      = XLSX.read(ab, { type: 'array' });
        const ws      = wb.Sheets[wb.SheetNames[0]];
        const data    = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!data.length) throw new Error('Excel file appears to be empty.');
        const headers = Object.keys(data[0]);
        const mapping = guessMapping(headers);
        const today   = new Date().toISOString().slice(0, 10);
        if (!mapping.itemName) {
          setCsvHeaders(headers);
          setCsvRawRows(data);
          setColMapping({ itemName: '', category: '', quantity: '', totalAmount: '', taxAmount: '', unitPrice: '', date: '', paymentMode: '' });
          setShowColMapper(true);
        } else {
          setRows(applyMappingToData(data, mapping, today));
        }
      } catch (e) {
        setExtractErr(e.message ?? 'Excel parsing failed.');
      } finally {
        setExtracting(false);
      }
      return;
    }

    // ── Image path (JPG, PNG, WebP) ───────────────────────────────────────────
    if (!isCsvText) {
      const base64 = await toBase64(file);
      const today  = new Date().toISOString().slice(0, 10);
      const mime   = file.type || 'application/octet-stream';
      console.log('Data being sent to Gemini:', `[base64 ${mime} ${(base64.length * 0.75 / 1024).toFixed(1)} KB]`);
      await doExtract([{ text: buildPrompt(today) }, { inlineData: { mimeType: mime, data: base64 } }]);
      return;
    }

    // ── CSV path: parse locally, map columns without Gemini ──────────────────
    const content = await file.text();
    const parsed  = Papa.parse(content, { header: true, skipEmptyLines: true });
    if (!parsed.data.length) { setExtractErr('CSV file appears to be empty.'); return; }

    const headers = Object.keys(parsed.data[0]);
    const mapping = guessMapping(headers);
    const today   = new Date().toISOString().slice(0, 10);

    setExtracting(true);
    setExtractErr('');
    setRows([]);

    if (!mapping.itemName) {
      setCsvHeaders(headers);
      setCsvRawRows(parsed.data);
      setColMapping({ itemName: '', category: '', quantity: '', totalAmount: '', taxAmount: '', unitPrice: '', date: '', paymentMode: '' });
      setShowColMapper(true);
    } else {
      setRows(applyMappingToData(parsed.data, mapping, today));
    }
    setExtracting(false);
  }

  function applyColumnMapping() {
    if (!colMapping.itemName) return;
    const today = new Date().toISOString().slice(0, 10);
    const mapped = csvRawRows
      .filter((row) => row[colMapping.itemName])
      .map((row) => {
        const qty       = Number(row[colMapping.quantity])  || 1;
        const unitPrice = Number(row[colMapping.unitPrice]) || 0;
        return {
          id:           Math.random().toString(36).slice(2),
          date:         (colMapping.date && row[colMapping.date]) || today,
          customerName: 'Walk-in',
          lineItems:    [{ itemName: String(row[colMapping.itemName] ?? '').trim() || 'Item', quantity: qty, unitPrice, gstRate: 0 }],
          paymentMode:  normalisePaymentMode((colMapping.paymentMode && row[colMapping.paymentMode]) || ''),
          notes:        '',
        };
      });
    setRows(mapped);
    setShowColMapper(false);
    setCsvRawRows([]);
    setCsvHeaders([]);
  }

  function confirmPdfDate() {
    const date = importDate || new Date().toISOString().slice(0, 10);
    setReportDateFrom(pdfRangeFrom || date);
    setReportDateTo(date);
    setRows(pendingRows.map((r) => ({ ...r, date })));
    setPdfDateStep(false);
    setPendingRows([]);
  }

  async function handleExtractPaste() {
    if (!paste.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    console.log('Data being sent to Gemini:', paste.substring(0, 500));
    await doExtract([{ text: buildPrompt(today) + '\n\n' + paste }]);
  }

  async function handleSaveAll() {
    if (rows.length === 0) return;
    setSaving(true);
    setSaveErr('');
    let saved = 0;
    const errs = [];
    const salesItemBatch = [];

    for (const row of rows) {
      try {
        await createSale(companyId, {
          customer:      { name: row.customerName || 'Walk-in', phone: '', address: '', GSTIN: '' },
          lineItems:     row.lineItems.map((l) => ({
            itemId:    'custom',
            itemName:  l.itemName,
            unit:      'unit',
            quantity:  Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            gstRate:   Number(l.gstRate) || 0,
          })),
          discountType:  'flat',
          discountValue: '0',
          paymentMode:   row.paymentMode || 'Cash',
          date:          row.date || new Date().toISOString().slice(0, 10),
          dueDate:       null,
          notes:         row.notes || '',
          tableNumber:   null,
          orderType:     null,
          entrySource:   'import',
        });
        saved++;
        for (const l of row.lineItems) {
          const qty         = Number(l.quantity)  || 0;
          const unitPrice   = Number(l.unitPrice) || 0;
          const gstRate     = Number(l.gstRate)   || 0;
          const totalAmount = qty * unitPrice;
          salesItemBatch.push({
            itemName:       String(l.itemName ?? '').trim(),
            category:       row.notes || 'Other',
            quantity:       qty,
            unitPrice,
            totalAmount,
            GSTAmount:      totalAmount * gstRate / 100,
            date:           dateToTs(row.date),
            source:         'imported',
            reportDateFrom: dateToTs(reportDateFrom || row.date),
            reportDateTo:   dateToTs(reportDateTo   || row.date),
          });
        }
      } catch (e) {
        errs.push(e.message);
      }
    }

    if (salesItemBatch.length) {
      try { await writeSalesItems(companyId, salesItemBatch); }
      catch (e) { console.error('salesItems write failed:', e); }
    }

    setSaving(false);
    if (saved > 0) {
      setSavedCount(saved);
      setRows([]);
      onImported();
    }
    if (errs.length) setSaveErr(`${errs.length} failed: ${errs.slice(0, 2).join('; ')}`);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-4xl max-h-[90vh] flex-col rounded-xl bg-white shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Import Sales Report</h2>
          <button type="button" onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {savedCount !== null && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              ✓ {savedCount} {savedCount === 1 ? 'sale' : 'sales'} added successfully!
            </div>
          )}

          {/* PDF date confirmation — shown after PDF extraction, before preview */}
          {pdfDateStep && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                {pdfDetected ? (
                  <p className="text-sm font-semibold text-blue-800">
                    Report covers: <span className="font-bold">{pdfDetected}</span>
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-blue-800">No date range detected in the report.</p>
                )}
                <p className="mt-1 text-xs text-blue-600">
                  {pendingRows.length} items extracted — confirm or change the date to assign to all imported sales. You can adjust per row after.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Import date</label>
                <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={confirmPdfDate} disabled={!importDate}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition">
                  Preview {pendingRows.length} Items
                </button>
                <button type="button" onClick={() => { setPdfDateStep(false); setPendingRows([]); }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Column mapper — shown when AI fails for CSV */}
          {showColMapper && rows.length === 0 && savedCount === null && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                AI couldn't auto-parse this file. Please map the columns manually below.
              </div>
              <p className="text-sm text-gray-600">{csvRawRows.length} rows detected — map your CSV columns to the required fields:</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'itemName',    label: 'Item Name *' },
                  { key: 'quantity',    label: 'Quantity' },
                  { key: 'unitPrice',   label: 'Unit Price' },
                  { key: 'totalAmount', label: 'Total Amount' },
                  { key: 'date',        label: 'Date' },
                  { key: 'paymentMode', label: 'Payment Mode' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
                    <select
                      value={colMapping[key] ?? ''}
                      onChange={(e) => setColMapping((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">— skip —</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={applyColumnMapping} disabled={!colMapping.itemName}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition">
                  Import {csvRawRows.length} Rows
                </button>
                <button type="button"
                  onClick={() => { setShowColMapper(false); setCsvHeaders([]); setCsvRawRows([]); }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Input tabs — only shown before extraction */}
          {!showColMapper && !pdfDateStep && rows.length === 0 && savedCount === null && (
            <>
              <div className="flex border-b border-gray-200">
                {['upload', 'paste'].map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                      tab === t
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    {t === 'upload' ? 'Upload File' : 'Paste Text'}
                  </button>
                ))}
              </div>

              {tab === 'upload' ? (
                <div className="space-y-4">
                  <div
                    className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 px-6 py-10 text-center transition hover:border-blue-400"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
                  >
                    <input ref={fileRef} type="file" className="hidden"
                      accept=".csv,.txt,.pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => setFile(e.target.files[0] ?? null)} />
                    {file ? (
                      <div>
                        <p className="text-sm font-medium text-gray-800">{file.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                        <button type="button"
                          className="mt-1.5 text-xs text-blue-600 underline hover:text-blue-700"
                          onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-500">Drop a file here or click to select</p>
                        <p className="text-xs text-gray-400 mt-1">CSV, PDF, JPG, PNG, WebP</p>
                      </div>
                    )}
                  </div>
                  {extractErr && <p className="text-sm text-red-600">{extractErr}</p>}
                  <button type="button" onClick={handleExtractFile}
                    disabled={!file || extracting}
                    className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition">
                    {extracting && !pdfProgress && <LoadingSpinner size="sm" />}
                    {extracting && !pdfProgress ? 'Extracting…' : 'Extract with AI'}
                  </button>
                  {extracting && pdfProgress && (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
                      <LoadingSpinner size="sm" />
                      <span>{pdfProgress}</span>
                    </div>
                  )}
                  {retryMsg && <p className="text-sm font-medium text-amber-600">{retryMsg}</p>}
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea rows={8}
                    placeholder="Paste your sales report text here…"
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={paste} onChange={(e) => setPaste(e.target.value)} />
                  {extractErr && <p className="text-sm text-red-600">{extractErr}</p>}
                  <button type="button" onClick={handleExtractPaste}
                    disabled={!paste.trim() || extracting}
                    className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition">
                    {extracting && <LoadingSpinner size="sm" />}
                    {extracting ? 'Extracting…' : 'Extract with AI'}
                  </button>
                  {retryMsg && <p className="text-sm font-medium text-amber-600">{retryMsg}</p>}
                </div>
              )}
            </>
          )}

          {/* Preview table */}
          {rows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  {rows.length} {rows.length === 1 ? 'sale' : 'sales'} found — review and edit before saving
                </p>
                <button type="button" onClick={() => setRows([])}
                  className="text-xs text-gray-400 underline hover:text-gray-600 transition">
                  Start over
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Items</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2">Payment</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => {
                      const total = row.lineItems.reduce(
                        (s, l) => s + l.quantity * l.unitPrice * (1 + l.gstRate / 100), 0,
                      );
                      const summary = row.lineItems.length === 0
                        ? '—'
                        : row.lineItems.length === 1
                        ? row.lineItems[0].itemName
                        : `${row.lineItems[0].itemName} +${row.lineItems.length - 1} more`;
                      return (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <input type="date" value={row.date}
                              onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                              className="w-32 rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="text" value={row.customerName}
                              onChange={(e) => updateRow(row.id, 'customerName', e.target.value)}
                              className="w-28 rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                          </td>
                          <td className="max-w-[180px] px-3 py-2">
                            <span className="block truncate text-xs text-gray-600" title={summary}>{summary}</span>
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-gray-800">
                            {formatCurrency(total)}
                          </td>
                          <td className="px-3 py-2">
                            <select value={row.paymentMode}
                              onChange={(e) => updateRow(row.id, 'paymentMode', e.target.value)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500">
                              {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button type="button"
                              onClick={() => setRows((p) => p.filter((r) => r.id !== row.id))}
                              className="text-lg leading-none text-red-400 transition hover:text-red-600"
                              title="Remove">×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {saveErr && <p className="text-sm text-red-600">{saveErr}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition">
            {savedCount !== null ? 'Close' : 'Cancel'}
          </button>
          {rows.length > 0 && (
            <button type="button" onClick={handleSaveAll} disabled={saving}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition">
              {saving && <LoadingSpinner size="sm" />}
              {saving ? 'Saving…' : `Save All (${rows.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sales Page ─────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { activeCompanyId, businessType, salesEntryMode, activeCompany, user } = useApp();
  const { isAdmin } = useRole();

  const [sales,          setSales]          = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [fromDate,       setFromDate]       = useState('');
  const [toDate,         setToDate]         = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [sourceFilter,   setSourceFilter]   = useState('');
  const [payTarget,      setPayTarget]      = useState(null);
  const [importOpen,     setImportOpen]     = useState(false);

  const modeSet  = !!activeCompany?.salesEntryMode;
  const isPOS    = salesEntryMode === 'POS';
  const isImport = salesEntryMode === 'Document Upload';
  const isBoth   = salesEntryMode === 'Both';

  const [deleteTarget,   setDeleteTarget]   = useState(null);
  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const from = fromDate ? startOfDay(new Date(fromDate)) : null;
      const to   = toDate   ? endOfDay(new Date(toDate))     : null;
      const data = await listSales(activeCompanyId, { fromDate: from, toDate: to });
      setSales(data);
    } catch (err) {
      setError(err.message ?? 'Failed to load sales.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, fromDate, toDate]);

  useEffect(() => {
    setSales([]);
    load();
  }, [load]);

  const filtered = sales.filter((s) => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (isImport && s.entrySource !== 'import') return false;
    if (isBoth) {
      if (sourceFilter === 'import' && s.entrySource !== 'import') return false;
      if (sourceFilter === 'pos'    && s.entrySource === 'import') return false;
    }
    if (customerSearch) {
      const name = (s.customerSnapshot?.name ?? '').toLowerCase();
      if (!name.includes(customerSearch.toLowerCase())) return false;
    }
    return true;
  });

  function handlePaymentRecorded(updatedFields, saleId) {
    setSales((prev) =>
      prev.map((s) => (s.saleId === saleId ? { ...s, ...updatedFields } : s)),
    );
    setPayTarget(null);
  }

  const selectedRecords     = filtered.filter((s) => selectedIds.has(s.saleId));
  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selectedIds.has(s.saleId));

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((s) => next.delete(s.saleId));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((s) => next.add(s.saleId));
        return next;
      });
    }
  }

  // ── Sales Entry Mode not configured yet ───────────────────────────────────
  if (activeCompany && !modeSet) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <BizTypeBadge businessType={businessType} />
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <p className="text-base font-semibold text-amber-800">Sales Entry Mode not configured</p>
          <p className="mt-1 text-sm text-amber-700">
            Set your preferred sales entry mode in Company Profile to get started.
          </p>
          <Link to="/company/profile"
            className="mt-4 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition">
            Go to Company Profile
          </Link>
        </div>
      </div>
    );
  }

  // ── Main page ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {isImport ? 'Sales — Import Mode' : 'Sales & Invoices'}
            </h1>
            <BizTypeBadge businessType={businessType} />
          </div>
          <p className="text-sm text-gray-500">
            {isImport
              ? 'Import sales reports from your POS system.'
              : 'All invoices for the active company.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(isPOS || isBoth) && (
            <Link to="/sales/new"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
              {isBoth ? '+ New Sale (POS)' : '+ New Sale'}
            </Link>
          )}
          {(isImport || isBoth) && (
            <button type="button" onClick={() => setImportOpen(true)}
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
                isImport
                  ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}>
              Import Sales Report
            </button>
          )}
          {(isImport || isBoth) && (
            <Link to="/sales/insights"
              className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition">
              View Insights
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="search" value={customerSearch} placeholder="Search customer…"
          onChange={(e) => setCustomerSearch(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {isBoth && (
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
            {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <button type="button" onClick={load}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition">
          Refresh
        </button>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} invoices</span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Bulk action bar */}
      {isAdmin && selectedRecords.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-sm font-medium text-red-800">
            {selectedRecords.length} {selectedRecords.length === 1 ? 'record' : 'records'} selected
          </span>
          <button type="button" onClick={() => setBulkDeleteOpen(true)}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition">
            Delete Selected
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 transition">
            Clear Selection
          </button>
        </div>
      )}

      {/* Sales table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-400">
              {sales.length === 0
                ? isImport
                  ? 'No imported sales yet.'
                  : 'No invoices yet.'
                : 'No invoices match the filters.'}
            </p>
            {sales.length === 0 && isImport && (
              <button type="button" onClick={() => setImportOpen(true)}
                className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
                Import Sales Report
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  {isAdmin && (
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-gray-400 accent-red-600"
                      />
                    </th>
                  )}
                  <th className="px-4 py-2">Invoice #</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2">Mode</th>
                  {isBoth && <th className="px-4 py-2">Source</th>}
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((sale) => (
                  <tr key={sale.saleId} className={`hover:bg-gray-50 ${selectedIds.has(sale.saleId) ? 'bg-red-50' : ''}`}>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(sale.saleId)}
                          onChange={() => toggleSelect(sale.saleId)}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-400 accent-red-600"
                        />
                      </td>
                    )}
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">{sale.invoiceNumber}</td>
                    <td className="px-4 py-2 text-gray-600">{fmtDate(sale.date)}</td>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {sale.customerSnapshot?.name ?? 'Walk-in'}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-800">
                      {formatCurrency(sale.grandTotal)}
                    </td>
                    <td className="px-4 py-2 text-right text-green-700">
                      {formatCurrency(sale.paidAmount)}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${sale.balanceDue > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                      {sale.balanceDue > 0 ? formatCurrency(sale.balanceDue) : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">{sale.paymentMode}</td>
                    {isBoth && <td className="px-4 py-2"><SourceBadge entrySource={sale.entrySource} /></td>}
                    <td className="px-4 py-2"><PaymentStatusBadge status={sale.status} /></td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2 text-xs">
                        <Link to={`/sales/${sale.saleId}`}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50 transition">
                          View
                        </Link>
                        {sale.status !== SALE_STATUS.PAID && (
                          <button type="button" onClick={() => setPayTarget(sale)}
                            className="rounded-md border border-green-300 bg-white px-2 py-1 text-green-700 hover:bg-green-50 transition">
                            Collect
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(sale)}
                            title="Delete record"
                            className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-red-600 hover:bg-red-50"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaymentModal
        open={!!payTarget}
        companyId={activeCompanyId}
        sale={payTarget}
        onClose={() => setPayTarget(null)}
        onPaid={(updated) => handlePaymentRecorded(updated, payTarget?.saleId)}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        companyId={activeCompanyId}
        onImported={load}
      />

      <DeleteRecordModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          setSales((prev) => prev.filter((s) => s.saleId !== id));
          setDeleteTarget(null);
        }}
        companyId={activeCompanyId}
        record={deleteTarget}
        recordType="sale"
        user={user}
      />

      <BulkDeleteModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onDeleted={(ids) => {
          setSales((prev) => prev.filter((s) => !ids.includes(s.saleId)));
          setSelectedIds(new Set());
          setBulkDeleteOpen(false);
        }}
        companyId={activeCompanyId}
        records={selectedRecords}
        recordType="sale"
        user={user}
      />
    </div>
  );
}
