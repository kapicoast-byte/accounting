import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Timestamp } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { useRole } from '../hooks/useRole';
import { listSales, createSale, SALE_STATUS, PAYMENT_MODES } from '../services/saleService';
import { writeSalesItems } from '../services/salesItemService';
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

// ── Helpers ────────────────────────────────────────────────────────────────────

// Pure local column mapping — no API calls, works offline
// Uses exact-match lookup; first matching option wins
function mapColumns(headers) {
  const h = headers.map(x => x?.toLowerCase()?.trim() ?? '');
  const find = (...options) => {
    for (const opt of options) {
      const idx = h.findIndex(x => x === opt.toLowerCase());
      if (idx !== -1) return headers[idx];
    }
    return null;
  };
  const mapping = {
    itemName:    find('item', 'name', 'item name', 'product', 'description'),
    category:    find('category', 'parent_category', 'type', 'group'),
    quantity:    find('qty', 'quantity', 'units', 'count', 'pieces'),
    unitPrice:   find('price', 'rate', 'unit price', 'my amount'),
    totalAmount: find('gross sales', 'total', 'amount', 'gross_sales', 'grosssales', 'net amount'),
    taxAmount:   find('tax', 'gst', 'tax amount', 'vat'),
  };
  if (!mapping.itemName) {
    mapping.itemName = headers.find(col => col && String(col).trim()) || null;
  }
  return mapping;
}

const FIELD_LABELS = {
  itemName:    'Item Name',
  category:    'Category',
  quantity:    'Quantity',
  unitPrice:   'Unit Price',
  totalAmount: 'Total Amount',
  taxAmount:   'Tax Amount',
};

function buildMappingInfo(mapping) {
  const mapped  = [];
  const missing = [];
  for (const [field, col] of Object.entries(mapping)) {
    if (col) mapped.push(`${FIELD_LABELS[field]} → ${col}`);
    else if (field !== 'itemName') missing.push(FIELD_LABELS[field]);
  }
  return { mapped, missing };
}

const SKIP_ITEM_VALUES = new Set([
  'total', 'min', 'max', 'avg', 'average', 'subtotal', 'grand total',
  'taxable', 'non-taxable', 'restaurant', 'category', 'item', 'name', 'header',
]);

// Applies a mapping object to parsed CSV/Excel rows
function applyMappingToRows(data, mapping, today) {
  console.log('Headers array:',   JSON.stringify(Object.keys(data[0] ?? {})));
  console.log('Mapping object:',  JSON.stringify(mapping));
  console.log('Raw rows[0]:',     JSON.stringify(data[0]));
  console.log('Raw rows[1]:',     JSON.stringify(data[1]));
  console.log('Raw rows[2]:',     JSON.stringify(data[2]));

  if (!mapping.itemName || !data.length) return [];

  const filteredRows = data.filter((row) => {
    const itemVal = row[mapping.itemName];
    if (!itemVal || itemVal.toString().trim() === '') return false;
    if (SKIP_ITEM_VALUES.has(itemVal.toString().toLowerCase().trim())) return false;
    return true;
  });

  console.log('Filtered rows count:', filteredRows.length);
  console.log('First filtered row:', JSON.stringify(filteredRows[0]));

  // If the filter wiped everything, use all rows as-is
  const rows = filteredRows.length > 0 ? filteredRows : (
    console.log('Filter removed all rows — using all rows without filter'),
    data
  );

  const itemCol = mapping.itemName;
  return rows.map((row) => {
    const qty      = Number(row[mapping.quantity])    || 1;
    const unitPri  = Number(row[mapping.unitPrice])   || 0;
    const totalAmt = Number(row[mapping.totalAmount]) || (qty * unitPri);
    const taxAmt   = Number(row[mapping.taxAmount])   || 0;
    return {
      id:           Math.random().toString(36).slice(2),
      date:         (mapping.date && row[mapping.date]) ? String(row[mapping.date]).trim() : today,
      customerName: 'Walk-in',
      category:     (mapping.category && row[mapping.category]) ? String(row[mapping.category]).trim() : 'Other',
      lineItems:    [{ itemName: String(row[itemCol] ?? '').trim() || 'Item', quantity: qty, unitPrice: unitPri, gstRate: 0 }],
      totalAmount:  totalAmt,
      taxAmount:    taxAmt,
      paymentMode:  'Cash',
      notes:        '',
    };
  });
}

function normalisePaymentMode(raw) {
  if (!raw) return 'Cash';
  const s = String(raw).toLowerCase();
  if (s.includes('card') || s.includes('credit') || s.includes('debit')) return 'Card';
  if (s.includes('upi') || s.includes('gpay') || s.includes('paytm') || s.includes('phone') || s.includes('online')) return 'UPI';
  return 'Cash';
}

function dateToTs(dateStr) {
  if (!dateStr) return Timestamp.now();
  const d = new Date(dateStr + 'T12:00:00');
  return isNaN(d.getTime()) ? Timestamp.now() : Timestamp.fromDate(d);
}

// ── Import Modal ───────────────────────────────────────────────────────────────

function normalizeDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  // Excel date serial (days since 1900-01-01)
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 40000) {
    const d = new Date((Number(s) - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function findReportDate(headerRows) {
  for (const row of headerRows) {
    const text  = row.join(' ');
    const match = text.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4})/);
    if (match) {
      const nd = normalizeDate(match[1]);
      if (nd) return nd;
    }
  }
  return null;
}

async function parseExcel(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook    = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet       = workbook.Sheets[workbook.SheetNames[0]];

  // Raw arrays — let us find the real header row ourselves
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  console.log('All rows raw:', allRows.slice(0, 10));

  // First row whose cells include 'item', 'name', 'qty', or 'quantity'
  let headerRowIndex = -1;
  for (let i = 0; i < allRows.length; i++) {
    const cells = allRows[i].map(c => c?.toString()?.toLowerCase()?.trim());
    if (cells.includes('item') || cells.includes('name') ||
        cells.includes('qty') || cells.includes('quantity')) {
      headerRowIndex = i;
      break;
    }
  }
  console.log('Header row found at index:', headerRowIndex);
  console.log('Header row:', allRows[headerRowIndex]);

  if (headerRowIndex === -1) headerRowIndex = 0;

  const headers  = allRows[headerRowIndex].map(h => h?.toString()?.trim());
  const dataRows = allRows.slice(headerRowIndex + 1);
  console.log('Headers:', headers);
  console.log('First data row:', dataRows[0]);
  console.log('Total data rows:', dataRows.length);

  const find = (...opts) => {
    for (const opt of opts) {
      const idx = headers.findIndex(h => h?.toLowerCase() === opt.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colMap = {
    itemName:    find('item', 'name', 'item name', 'product'),
    category:    find('category', 'parent_category'),
    quantity:    find('qty', 'quantity'),
    unitPrice:   find('price', 'my amount', 'rate'),
    totalAmount: find('gross sales', 'total', 'amount'),
    taxAmount:   find('tax', 'gst'),
    date:        find('date', 'sale date', 'order date', 'bill date', 'transaction date'),
  };
  console.log('Column index map:', colMap);

  // Derive a report-level date: prefer a date column in the data, else scan title rows
  let reportDate = null;
  if (colMap.date !== -1 && dataRows[0]?.[colMap.date]) {
    reportDate = normalizeDate(dataRows[0][colMap.date]);
  }
  if (!reportDate) {
    reportDate = findReportDate(allRows.slice(0, headerRowIndex));
  }
  console.log('Report date extracted:', reportDate);

  const SKIP = new Set(['total','min','max','avg','taxable','non-taxable','restaurant','category','item','name']);

  const mapRow = (row) => ({
    itemName:    String(colMap.itemName    !== -1 ? row[colMap.itemName]    : row[0]).trim(),
    category:    String(colMap.category    !== -1 ? row[colMap.category]    : '').trim(),
    quantity:    colMap.quantity    !== -1 ? Number(row[colMap.quantity])    || 1 : 1,
    unitPrice:   colMap.unitPrice   !== -1 ? Number(row[colMap.unitPrice])   || 0 : 0,
    totalAmount: colMap.totalAmount !== -1 ? Number(row[colMap.totalAmount]) || 0 : 0,
    taxAmount:   colMap.taxAmount   !== -1 ? Number(row[colMap.taxAmount])   || 0 : 0,
    date:        colMap.date        !== -1 ? normalizeDate(row[colMap.date]) : null,
  });

  let extracted = dataRows
    .filter(row => {
      const itemVal = colMap.itemName !== -1 ? row[colMap.itemName] : row[0];
      if (!itemVal || itemVal.toString().trim() === '') return false;
      if (SKIP.has(itemVal.toString().toLowerCase().trim())) return false;
      return true;
    })
    .map(mapRow);

  if (extracted.length === 0 && dataRows.length > 0) {
    console.log('Filter removed all rows — using all rows without filter');
    extracted = dataRows
      .filter(row => (row[0] ?? '').toString().trim() !== '')
      .map(mapRow);
  }

  console.log('Final extracted rows:', extracted.length);
  console.log('Sample:', extracted.slice(0, 3));

  return { rows: extracted, headers, colMap, reportDate };
}

function ImportModal({ open, onClose, companyId, onImported }) {
  const [step,           setStep]           = useState('upload'); // upload | preview | done
  const [file,           setFile]           = useState(null);
  const [extracting,     setExtracting]     = useState(false);
  const [extractErr,     setExtractErr]     = useState('');
  const [progress,       setProgress]       = useState('');
  const [rows,           setRows]           = useState([]);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [mappingInfo,    setMappingInfo]    = useState(null);
  const [reportDate,     setReportDate]     = useState('');
  const [saving,         setSaving]         = useState(false);
  const [saveErr,        setSaveErr]        = useState('');
  const [savedCount,     setSavedCount]     = useState(null);
  const fileRef = useRef(null);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (open) return;
    setStep('upload'); setFile(null); setExtracting(false); setExtractErr('');
    setProgress(''); setRows([]); setSelectedRowIds(new Set()); setMappingInfo(null);
    setReportDate('');
    setSaving(false); setSaveErr(''); setSavedCount(null);
  }, [open]);

  function applyReportDateToAllRows(dateStr) {
    setReportDate(dateStr);
    setRows(prev => prev.map(r => ({ ...r, date: dateStr })));
  }

  function setRowsAndSelect(newRows) {
    setRows(newRows);
    setSelectedRowIds(new Set(newRows.map((r) => r.id)));
  }

  function updateRow(id, field, val) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  function updateLineItem(rowId, field, val) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        lineItems: r.lineItems.map((l, i) =>
          i === 0 ? { ...l, [field]: field === 'itemName' ? val : (Number(val) || 0) } : l,
        ),
      };
    }));
  }

  async function handleExtract() {
    if (!file) return;
    const isExcel = /\.(xlsx|xls)$/i.test(file.name) ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel';
    const isCsv   = /\.(csv|txt)$/i.test(file.name) || file.type.startsWith('text/');

    setExtracting(true);
    setExtractErr('');

    console.log('─── IMPORT START ───────────────────────────────────');
    console.log('1. File name:', file.name);
    console.log('2. File type:', file.type);
    console.log('3. File size:', file.size);
    console.log('   Detected →', isExcel ? 'Excel' : isCsv ? 'CSV' : 'UNKNOWN');

    try {
      if (isExcel) {
        setProgress('Parsing Excel…');
        const { rows: extracted, headers, colMap, reportDate: detectedDate } = await parseExcel(file);
        if (!extracted.length) throw new Error('No data rows found in this Excel file.');

        const fallbackDate = detectedDate || today;
        setReportDate(fallbackDate);
        console.log('Report date used:', fallbackDate);

        // Build mapping info for the preview banner (skip the date field)
        const mapped  = [];
        const missing = [];
        for (const [field, idx] of Object.entries(colMap)) {
          if (field === 'date') continue;
          if (idx !== -1) mapped.push(`${FIELD_LABELS[field]} → ${headers[idx]}`);
          else if (field !== 'itemName') missing.push(FIELD_LABELS[field]);
        }
        if (detectedDate) mapped.push(`Report Date → ${detectedDate}`);
        setMappingInfo({ mapped, missing });

        // Convert extracted rows to preview format; use per-row date when available
        const previewRows = extracted.map(e => ({
          id:           Math.random().toString(36).slice(2),
          date:         e.date || fallbackDate,
          customerName: 'Walk-in',
          category:     e.category || 'Other',
          lineItems:    [{ itemName: e.itemName || 'Item', quantity: e.quantity, unitPrice: e.unitPrice, gstRate: 0 }],
          totalAmount:  e.totalAmount || (e.quantity * e.unitPrice),
          taxAmount:    e.taxAmount,
          paymentMode:  'Cash',
          notes:        '',
        }));

        setRowsAndSelect(previewRows);
        setStep('preview');

      } else if (isCsv) {
        setProgress('Parsing CSV…');
        const content = await file.text();
        const parsed  = Papa.parse(content, { header: true, skipEmptyLines: true });
        console.log('4. Raw parsed data:', parsed.data.slice(0, 3));
        if (!parsed.data.length) throw new Error('CSV file appears to be empty.');

        const headers = Object.keys(parsed.data[0]);
        console.log('5. Headers found:', headers);
        console.log('6. First 3 rows:', parsed.data.slice(0, 3));

        const mapping = mapColumns(headers);
        console.log('7. Column mapping result:', mapping);

        setProgress('Mapping columns…');
        const mapped = applyMappingToRows(parsed.data, mapping, today);
        console.log('8. Rows after filtering:', mapped.length);
        setMappingInfo(buildMappingInfo(mapping));

        if (!mapped.length) throw new Error('Could not map any rows from this file.');
        setRowsAndSelect(mapped);
        setStep('preview');

      } else {
        throw new Error('Unsupported file type. Please use CSV or Excel (.xlsx/.xls).');
      }
    } catch (e) {
      console.error('─── IMPORT ERROR ────────────────────────────────────');
      console.error(e);
      setExtractErr(e.message ?? 'Extraction failed.');
    } finally {
      setExtracting(false);
      setProgress('');
    }
  }

  async function handleSaveAll() {
    const toSave = rows.filter((r) => selectedRowIds.has(r.id));
    if (!toSave.length) return;
    setSaving(true);
    setSaveErr('');
    let saved = 0;
    const errs = [];
    const salesItemBatch = [];

    for (const row of toSave) {
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
          date:          row.date || today,
          dueDate:       null,
          notes:         row.notes || '',
          tableNumber:   null,
          orderType:     null,
          entrySource:   'import',
        });
        saved++;
        for (const l of row.lineItems) {
          const qty     = Number(l.quantity)  || 0;
          const unitPri = Number(l.unitPrice) || 0;
          const gstRate = Number(l.gstRate)   || 0;
          salesItemBatch.push({
            itemName:    String(l.itemName ?? '').trim(),
            category:    row.category || 'Other',
            quantity:    qty,
            unitPrice:   unitPri,
            totalAmount: row.totalAmount || (qty * unitPri),
            GSTAmount:   row.taxAmount   || (qty * unitPri * gstRate / 100),
            saleDate:    dateToTs(row.date),
            source:      'imported',
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
      setStep('done');
      onImported();
    }
    if (errs.length) setSaveErr(`${errs.length} row(s) failed: ${errs.slice(0, 2).join('; ')}`);
  }

  if (!open) return null;

  const EMERALD = 'oklch(0.55 0.18 155)';
  const iStyle  = (extra = {}) => ({
    background: 'var(--db-card-inset)',
    border: '1px solid var(--db-border)',
    color: 'var(--db-text)',
    colorScheme: 'dark',
    ...extra,
  });
  const allSelected   = rows.length > 0 && rows.every((r) => selectedRowIds.has(r.id));
  const selectedCount = rows.filter((r) => selectedRowIds.has(r.id)).length;
  const selectedRows  = rows.filter((r) => selectedRowIds.has(r.id));
  const totalSales    = selectedRows.reduce((s, r) => s + (r.totalAmount || r.lineItems.reduce((a, l) => a + l.quantity * l.unitPrice, 0)), 0);
  const totalGST      = selectedRows.reduce((s, r) => s + (r.taxAmount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)' }}>
      <div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--db-bg)', border: '1px solid var(--db-border)' }}>

        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--db-border-subtle)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--db-text)' }}>
              Import Sales Report
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--db-text-3)' }}>
              {step === 'upload'  && 'CSV · Excel'}
              {step === 'preview' && `${rows.length} rows extracted — review & import`}
              {step === 'done'    && 'Import complete'}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ color: 'var(--db-text-3)' }}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── UPLOAD step ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                className="cursor-pointer rounded-2xl px-6 py-12 text-center transition"
                style={{
                  border:     '2px dashed var(--db-border)',
                  background: file ? 'var(--db-card)' : 'var(--db-card-inset)',
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = EMERALD; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--db-border)'; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = 'var(--db-border)';
                  const f = e.dataTransfer.files[0];
                  if (f) { setFile(f); setExtractErr(''); }
                }}
              >
                <input ref={fileRef} type="file" className="hidden"
                  accept=".csv,.txt,.xlsx,.xls"
                  onChange={(e) => { setFile(e.target.files[0] ?? null); setExtractErr(''); }} />

                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ background: 'var(--db-green-dim)', color: 'var(--db-green)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--db-text)' }}>{file.name}</p>
                    <p className="text-xs" style={{ color: 'var(--db-text-3)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                    <button type="button" className="mt-0.5 text-xs underline"
                      style={{ color: 'var(--db-text-3)' }}
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ background: 'var(--db-border)', color: 'var(--db-text-2)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                        <polyline points="16 16 12 12 8 16"/>
                        <line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--db-text-2)' }}>
                        Drop a file here or click to browse
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--db-text-3)' }}>CSV · Excel</p>
                    </div>
                    <div className="flex gap-2">
                      {[
                        { label: 'CSV', color: 'var(--db-green)', bg: 'var(--db-green-dim)' },
                        { label: 'XLS', color: 'var(--db-blue)',  bg: 'var(--db-blue-dim)'  },
                      ].map(({ label, color, bg }) => (
                        <span key={label} className="rounded px-2 py-0.5 text-[10px] font-bold tracking-wide"
                          style={{ background: bg, color }}>{label}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Extraction progress */}
              {extracting && (
                <div className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ background: 'var(--db-card)', border: '1px solid var(--db-border-subtle)' }}>
                  <LoadingSpinner size="sm" />
                  <p className="text-xs" style={{ color: 'var(--db-text-2)' }}>{progress || 'Processing…'}</p>
                </div>
              )}

              {extractErr && (
                <div className="rounded-xl px-4 py-3 text-sm"
                  style={{ background: 'var(--db-red-dim)', border: '1px solid var(--db-red)', color: 'var(--db-red)' }}>
                  {extractErr}
                </div>
              )}

              {!extracting && (
                <button type="button" onClick={handleExtract} disabled={!file}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-40"
                  style={{ background: EMERALD, color: 'white' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  Extract
                </button>
              )}
            </div>
          )}

          {/* ── PREVIEW step ── */}
          {step === 'preview' && rows.length > 0 && (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 cursor-pointer accent-emerald-500"
                    checked={allSelected}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedRowIds(new Set(rows.map((r) => r.id)));
                      else setSelectedRowIds(new Set());
                    }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--db-text-2)' }}>
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--db-text-3)' }}>
                    ({selectedCount} / {rows.length})
                  </span>
                </label>
                <button type="button"
                  onClick={() => { setStep('upload'); setRows([]); setSelectedRowIds(new Set()); }}
                  className="text-xs underline" style={{ color: 'var(--db-text-3)' }}>
                  Start over
                </button>
              </div>

              {/* Report Date picker */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
                style={{ background: 'var(--db-card)', border: '1px solid var(--db-border-subtle)' }}>
                <label className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--db-text-2)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 flex-none">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Report Date
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => applyReportDateToAllRows(e.target.value)}
                  className="rounded-lg px-2 py-1 text-xs outline-none"
                  style={{ background: 'var(--db-card-inset)', border: '1px solid var(--db-border)', color: 'var(--db-text)', colorScheme: 'dark' }}
                />
                <p className="text-xs" style={{ color: 'var(--db-text-3)' }}>
                  Applied to all rows as sale date
                </p>
              </div>

              {/* Mapping info */}
              {mappingInfo && (
                <div className="rounded-xl px-4 py-3 space-y-1"
                  style={{ background: 'var(--db-card)', border: '1px solid var(--db-border-subtle)' }}>
                  {mappingInfo.mapped.length > 0 && (
                    <p className="text-xs" style={{ color: 'var(--db-green)' }}>
                      ✅ Mapped: {mappingInfo.mapped.join(', ')}
                    </p>
                  )}
                  {mappingInfo.missing.length > 0 && (
                    <p className="text-xs" style={{ color: 'var(--db-amber)' }}>
                      ⚠️ Could not find: {mappingInfo.missing.join(', ')} (will use defaults)
                    </p>
                  )}
                </div>
              )}

              {/* Summary bar */}
              <div className="flex flex-wrap gap-2">
                <span className="rounded-lg px-3 py-1 text-xs font-medium"
                  style={{ background: 'var(--db-card)', border: '1px solid var(--db-border-subtle)', color: 'var(--db-text-2)' }}>
                  {rows.length} items
                </span>
                <span className="rounded-lg px-3 py-1 text-xs font-semibold"
                  style={{ background: 'var(--db-green-dim)', color: 'var(--db-green)', fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(totalSales)} total
                </span>
                {totalGST > 0 && (
                  <span className="rounded-lg px-3 py-1 text-xs font-semibold"
                    style={{ background: 'var(--db-amber-dim)', color: 'var(--db-amber)', fontFamily: 'var(--font-mono)' }}>
                    +{formatCurrency(totalGST)} GST
                  </span>
                )}
                <span className="rounded-lg px-3 py-1 text-xs font-medium"
                  style={{ background: 'var(--db-blue-dim)', color: 'var(--db-blue)' }}>
                  {selectedCount} selected
                </span>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--db-border-subtle)' }}>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr style={{ background: 'var(--db-card-inset)', borderBottom: '1px solid var(--db-border-subtle)' }}>
                      <th className="w-8 px-3 py-2.5">
                        <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-emerald-500"
                          checked={allSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedRowIds(new Set(rows.map((r) => r.id)));
                            else setSelectedRowIds(new Set());
                          }} />
                      </th>
                      {['Date', 'Item', 'Qty', 'Unit Price', 'Total', 'Payment', ''].map((h, i) => (
                        <th key={i}
                          className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider${i >= 2 && i <= 4 ? ' text-right' : ''}`}
                          style={{ color: 'var(--db-text-3)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const li    = row.lineItems[0] ?? { itemName: '—', quantity: 1, unitPrice: 0, gstRate: 0 };
                      const total = row.totalAmount || (li.quantity * li.unitPrice);
                      const sel   = selectedRowIds.has(row.id);
                      return (
                        <tr key={row.id}
                          style={{
                            background:   sel ? 'oklch(0.74 0.15 155 / 0.06)' : idx % 2 === 0 ? 'var(--db-card)' : 'var(--db-card-inset)',
                            borderBottom: '1px solid var(--db-border-subtle)',
                            opacity:      sel ? 1 : 0.5,
                            transition:   'opacity 0.15s',
                          }}>
                          <td className="px-3 py-2">
                            <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-emerald-500"
                              checked={sel}
                              onChange={(e) => {
                                const next = new Set(selectedRowIds);
                                if (e.target.checked) next.add(row.id); else next.delete(row.id);
                                setSelectedRowIds(next);
                              }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="date" value={row.date}
                              onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                              className="rounded-md px-2 py-1 text-xs outline-none"
                              style={iStyle({ width: '7.5rem' })} />
                          </td>
                          <td className="px-3 py-2" style={{ maxWidth: '10rem' }}>
                            <input type="text" value={li.itemName}
                              onChange={(e) => updateLineItem(row.id, 'itemName', e.target.value)}
                              className="w-full rounded-md px-2 py-1 text-xs outline-none"
                              style={iStyle()} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" value={li.quantity} min="0"
                              onChange={(e) => updateLineItem(row.id, 'quantity', e.target.value)}
                              className="rounded-md px-2 py-1 text-xs text-right outline-none"
                              style={iStyle({ width: '3.5rem' })} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" value={li.unitPrice} min="0"
                              onChange={(e) => updateLineItem(row.id, 'unitPrice', e.target.value)}
                              className="rounded-md px-2 py-1 text-xs text-right outline-none"
                              style={iStyle({ width: '5rem', fontFamily: 'var(--font-mono)' })} />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold"
                            style={{ color: 'var(--db-green)', fontFamily: 'var(--font-mono)' }}>
                            {formatCurrency(total)}
                          </td>
                          <td className="px-3 py-2">
                            <select value={row.paymentMode}
                              onChange={(e) => updateRow(row.id, 'paymentMode', e.target.value)}
                              className="rounded-md px-2 py-1 text-xs outline-none"
                              style={iStyle()}>
                              {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <button type="button"
                              onClick={() => {
                                setRows((p) => p.filter((r) => r.id !== row.id));
                                setSelectedRowIds((p) => { const n = new Set(p); n.delete(row.id); return n; });
                              }}
                              className="flex h-5 w-5 items-center justify-center rounded text-base leading-none"
                              style={{ color: 'var(--db-text-3)' }}
                              title="Remove">×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {saveErr && (
                <div className="rounded-xl px-4 py-3 text-sm"
                  style={{ background: 'var(--db-red-dim)', border: '1px solid var(--db-red)', color: 'var(--db-red)' }}>
                  {saveErr}
                </div>
              )}
            </div>
          )}

          {/* ── DONE step ── */}
          {step === 'done' && (
            <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
              style={{ background: 'var(--db-green-dim)', border: '1px solid var(--db-green)', color: 'var(--db-green)' }}>
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-none">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {savedCount} {savedCount === 1 ? 'sale' : 'sales'} imported successfully!
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-end gap-3 px-6 py-4"
          style={{ borderTop: '1px solid var(--db-border-subtle)' }}>
          <button type="button" onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm transition"
            style={{ border: '1px solid var(--db-border)', color: 'var(--db-text-2)', background: 'transparent' }}>
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>
          {step === 'preview' && rows.length > 0 && (
            <button type="button" onClick={handleSaveAll}
              disabled={saving || selectedCount === 0}
              className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition disabled:opacity-40"
              style={{ background: EMERALD, color: 'white' }}>
              {saving && <LoadingSpinner size="sm" />}
              {saving ? 'Saving…' : `Import Selected (${selectedCount})`}
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

  // ── Import-mode stats (computed from sales array) ──────────────────────────
  const now = new Date();
  const thisMonthSales = sales.filter((s) => {
    const d = toJsDate(s.date);
    return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const thisMonthTotal = thisMonthSales.reduce((sum, s) => sum + (s.grandTotal ?? 0), 0);
  const importedCount  = sales.filter((s) => s.entrySource === 'import').length;
  const lastUpload     = sales.reduce((latest, s) => {
    const d = toJsDate(s.date);
    return d && (!latest || d > latest) ? d : latest;
  }, null);

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

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
            {isImport ? 'Sales' : 'Sales & Invoices'}
          </h1>
          <BizTypeBadge businessType={businessType} />
          {isImport && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: 'var(--pos-soft)', color: 'var(--pos)', border: '1px solid var(--pos)',
            }}>Import Mode</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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

      {/* ── Import-mode stat cards ── */}
      {(isImport || isBoth) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            {
              label: 'Total Uploaded', value: String(importedCount), accent: 'var(--pos)', accentSoft: 'var(--pos-soft)',
              icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
            },
            {
              label: 'This Month', value: formatCurrency(thisMonthTotal), accent: 'var(--info)', accentSoft: 'var(--info-soft)',
              icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
            },
            {
              label: 'Total Records', value: String(sales.length), accent: 'var(--accent)', accentSoft: 'var(--accent-soft)',
              icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
            },
            {
              label: 'Last Upload', accent: 'var(--warn)', accentSoft: 'var(--warn-soft)',
              value: lastUpload ? lastUpload.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—',
              icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
            },
          ].map(({ label, value, icon, accent, accentSoft }) => (
            <div key={label} style={{
              borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--card)', padding: '12px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: accentSoft, color: accent, flexShrink: 0 }}>
                  {icon}
                </span>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-4)', fontWeight: 500 }}>{label}</p>
              </div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--fg)' }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter bar (single row, scrollable) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        overflowX: 'auto', scrollbarWidth: 'none',
        borderRadius: 10, border: '1px solid var(--border)',
        background: 'var(--card)', padding: '10px 14px',
        flexShrink: 0,
      }}>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          style={{ flexShrink: 0, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', padding: '5px 10px', fontSize: 13, outline: 'none' }} />
        <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--fg-4)', userSelect: 'none' }}>to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          style={{ flexShrink: 0, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', padding: '5px 10px', fontSize: 13, outline: 'none' }} />
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <input type="search" value={customerSearch} placeholder="Search customer…"
          onChange={(e) => setCustomerSearch(e.target.value)}
          style={{ flex: 1, minWidth: 140, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', padding: '5px 10px', fontSize: 13, outline: 'none' }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ flexShrink: 0, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', padding: '5px 10px', fontSize: 13, outline: 'none' }}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {isBoth && (
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
            style={{ flexShrink: 0, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', padding: '5px 10px', fontSize: 13, outline: 'none' }}>
            {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <button type="button" onClick={load}
          style={{
            flexShrink: 0, borderRadius: 7, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--fg-3)', padding: '5px 12px',
            fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', fontWeight: 500,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--fg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-3)'; }}
        >
          Refresh
        </button>
        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 12, color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
          {filtered.length} {filtered.length === 1 ? 'invoice' : 'invoices'}
        </span>
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
          <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            {sales.length === 0 ? (
              <>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--pos-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pos)' }}>
                  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                    {isImport ? 'No sales reports yet' : 'No invoices yet'}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-4)' }}>
                    {isImport
                      ? 'Import your first sales report to get started'
                      : 'Create your first invoice to get started'}
                  </p>
                </div>
                {isImport && (
                  <button type="button" onClick={() => setImportOpen(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 16px', borderRadius: 7, border: 'none',
                      background: 'var(--pos)', color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Import Sales Report
                  </button>
                )}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-4)' }}>No invoices match the filters.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  {isAdmin && (
                    <th className="w-8 px-3 py-2">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-gray-400 accent-red-600" />
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
                        <input type="checkbox" checked={selectedIds.has(sale.saleId)}
                          onChange={() => toggleSelect(sale.saleId)}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-400 accent-red-600" />
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
                          <button type="button" onClick={() => setDeleteTarget(sale)}
                            title="Delete record"
                            className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-red-600 hover:bg-red-50">
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
