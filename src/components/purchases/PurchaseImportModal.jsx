import { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  collection, addDoc, serverTimestamp, Timestamp,
  doc, updateDoc, increment,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { listInventoryItems } from '../../services/inventoryService';
import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

// ── Column mapping ─────────────────────────────────────────────────────────────

function mapPurchaseColumns(headers) {
  const h = headers.map((x) => x?.toLowerCase()?.trim() ?? '');
  const find = (...options) => {
    for (const opt of options) {
      const idx = h.findIndex((x) => x === opt.toLowerCase());
      if (idx !== -1) return headers[idx];
    }
    return null;
  };
  const mapping = {
    itemName:    find('item', 'name', 'item name', 'product', 'description'),
    vendorName:  find('vendor', 'supplier', 'party name', 'party'),
    quantity:    find('qty', 'quantity'),
    costPrice:   find('price', 'rate', 'cost', 'amount', 'my amount'),
    totalAmount: find('total', 'gross', 'net amount', 'gross total'),
    taxAmount:   find('tax', 'gst', 'vat'),
    billDate:    find('date', 'bill date', 'invoice date'),
    billNumber:  find('bill no', 'invoice no', 'bill number'),
  };
  if (!mapping.itemName) {
    mapping.itemName = headers.find((c) => c && String(c).trim()) || null;
  }
  return mapping;
}

const FIELD_LABELS = {
  itemName:    'Item Name',
  vendorName:  'Vendor',
  quantity:    'Quantity',
  costPrice:   'Cost Price',
  totalAmount: 'Total Amount',
  taxAmount:   'Tax Amount',
  billDate:    'Bill Date',
  billNumber:  'Bill Number',
};

const SKIP_ITEM_VALUES = new Set([
  'total', 'min', 'max', 'avg', 'average', 'subtotal', 'grand total',
  'taxable', 'non-taxable', 'category', 'item', 'name', 'header',
]);

// ── Date helpers ───────────────────────────────────────────────────────────────

function normalizeDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 40000) {
    const d = new Date((Number(s) - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function findReportDate(headerRows) {
  for (const row of headerRows) {
    const text = row.join(' ');
    const match = text.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4})/);
    if (match) { const nd = normalizeDate(match[1]); if (nd) return nd; }
  }
  return null;
}

function dateToTs(dateStr) {
  if (!dateStr) return Timestamp.now();
  const d = new Date(dateStr + 'T12:00:00');
  return isNaN(d.getTime()) ? Timestamp.now() : Timestamp.fromDate(d);
}

// ── Excel parser ───────────────────────────────────────────────────────────────

async function parseExcel(file) {
  const buf      = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array' });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const allRows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Find header row: first row containing a purchase-relevant keyword
  let headerIdx = -1;
  for (let i = 0; i < allRows.length; i++) {
    const cells = allRows[i].map((c) => c?.toString()?.toLowerCase()?.trim());
    if (
      cells.includes('item') || cells.includes('name') || cells.includes('product') ||
      cells.includes('qty')  || cells.includes('quantity') ||
      cells.includes('vendor') || cells.includes('supplier')
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) headerIdx = 0;

  const headers  = allRows[headerIdx].map((h) => h?.toString()?.trim());
  const dataRows = allRows.slice(headerIdx + 1);

  const fi = (...opts) => {
    for (const opt of opts) {
      const idx = headers.findIndex((h) => h?.toLowerCase() === opt.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colMap = {
    itemName:    fi('item', 'name', 'item name', 'product', 'description'),
    vendorName:  fi('vendor', 'supplier', 'party name', 'party'),
    quantity:    fi('qty', 'quantity'),
    costPrice:   fi('price', 'rate', 'cost', 'amount', 'my amount'),
    totalAmount: fi('total', 'gross', 'net amount', 'gross total'),
    taxAmount:   fi('tax', 'gst', 'vat'),
    billDate:    fi('date', 'bill date', 'invoice date'),
    billNumber:  fi('bill no', 'invoice no', 'bill number'),
  };

  let reportDate = null;
  if (colMap.billDate !== -1 && dataRows[0]?.[colMap.billDate]) {
    reportDate = normalizeDate(dataRows[0][colMap.billDate]);
  }
  if (!reportDate) reportDate = findReportDate(allRows.slice(0, headerIdx));

  const mapRow = (row) => ({
    itemName:    String(colMap.itemName    !== -1 ? row[colMap.itemName]    : row[0]).trim(),
    vendorName:  String(colMap.vendorName  !== -1 ? row[colMap.vendorName]  : '').trim(),
    quantity:    colMap.quantity    !== -1 ? Number(row[colMap.quantity])    || 1   : 1,
    costPrice:   colMap.costPrice   !== -1 ? Number(row[colMap.costPrice])   || 0   : 0,
    totalAmount: colMap.totalAmount !== -1 ? Number(row[colMap.totalAmount]) || 0   : 0,
    taxAmount:   colMap.taxAmount   !== -1 ? Number(row[colMap.taxAmount])   || 0   : 0,
    billDate:    colMap.billDate    !== -1 ? normalizeDate(row[colMap.billDate])    : null,
    billNumber:  colMap.billNumber  !== -1 ? String(row[colMap.billNumber]   ?? '').trim() : '',
  });

  const SKIP = new Set(['total','min','max','avg','taxable','non-taxable','category','item','name']);

  let rows = dataRows
    .filter((row) => {
      const v = colMap.itemName !== -1 ? row[colMap.itemName] : row[0];
      if (!v || v.toString().trim() === '') return false;
      if (SKIP.has(v.toString().toLowerCase().trim())) return false;
      return true;
    })
    .map(mapRow);

  if (!rows.length && dataRows.length) {
    rows = dataRows
      .filter((row) => (row[0] ?? '').toString().trim() !== '')
      .map(mapRow);
  }

  const mapped  = [];
  const missing = [];
  for (const [field, idx] of Object.entries(colMap)) {
    if (field === 'billDate') continue;
    if (idx !== -1) mapped.push(`${FIELD_LABELS[field]} → ${headers[idx]}`);
    else if (!['itemName', 'vendorName', 'billNumber'].includes(field)) missing.push(FIELD_LABELS[field]);
  }
  if (reportDate) mapped.push(`Report Date → ${reportDate}`);

  return { rows, reportDate, mappingInfo: { mapped, missing } };
}

// ── Firestore write ────────────────────────────────────────────────────────────

async function saveImportedRow(companyId, row, inventoryItems) {
  const qty        = Number(row.quantity)    || 1;
  const costPrice  = Number(row.costPrice)   || 0;
  const taxAmount  = Number(row.taxAmount)   || 0;
  const totalAmt   = Number(row.totalAmount) || (qty * costPrice + taxAmount);
  const subtotal   = qty * costPrice;

  await addDoc(collection(db, 'companies', companyId, 'purchases'), {
    source:          'imported',
    billNumber:      row.billNumber || '',
    vendorBillNumber: row.billNumber || '',
    vendorName:      row.vendorName || '',
    vendorSnapshot:  { name: row.vendorName || '', phone: '', address: '', GSTIN: '' },
    vendorId:        null,
    date:            dateToTs(row.billDate),
    dueDate:         null,
    lineItems: [{
      itemId:       null,
      itemName:     row.itemName || 'Imported Item',
      unit:         'piece',
      quantity:     qty,
      unitPrice:    costPrice,
      gstRate:      0,
      lineSubtotal: subtotal,
      lineGST:      taxAmount,
    }],
    subtotal,
    totalGST:       taxAmount,
    discountType:   'flat',
    discountValue:  0,
    discountAmount: 0,
    grandTotal:     totalAmt,
    totalAmount:    totalAmt,
    paymentMode:    'Cash',
    paidAmount:     totalAmt,
    balanceDue:     0,
    status:         'paid',
    notes:          '',
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
  });

  // Update inventory stock if item name matches
  const needle = (row.itemName || '').toLowerCase().trim();
  const match  = inventoryItems.find((inv) => {
    const hay = inv.itemName.toLowerCase().trim();
    return hay === needle || hay.includes(needle) || needle.includes(hay);
  });
  if (match) {
    try {
      await updateDoc(doc(db, 'companies', companyId, 'inventory', match.itemId), {
        currentStock: increment(qty),
        updatedAt:    serverTimestamp(),
      });
    } catch (e) {
      console.warn('Stock update failed for', match.itemName, e);
    }
  }
}

// ── Modal component ────────────────────────────────────────────────────────────

const EMERALD  = 'oklch(0.55 0.18 155)';
const iStyle   = (extra = {}) => ({
  background:  'var(--bg-2)',
  border:      '1px solid var(--border)',
  color:       'var(--fg)',
  colorScheme: 'dark',
  borderRadius: '6px',
  padding:     '4px 8px',
  ...extra,
});

export default function PurchaseImportModal({ open, onClose, companyId, onImported }) {
  const [step,           setStep]           = useState('upload');
  const [file,           setFile]           = useState(null);
  const [extracting,     setExtracting]     = useState(false);
  const [extractErr,     setExtractErr]     = useState('');
  const [progress,       setProgress]       = useState('');
  const [rows,           setRows]           = useState([]);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [mappingInfo,    setMappingInfo]    = useState(null);
  const [billDate,       setBillDate]       = useState('');
  const [saving,         setSaving]         = useState(false);
  const [saveErr,        setSaveErr]        = useState('');
  const [savedCount,     setSavedCount]     = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const fileRef = useRef(null);

  const today = new Date().toISOString().slice(0, 10);

  // Load inventory items once when modal opens
  useEffect(() => {
    if (!open || !companyId) return;
    listInventoryItems(companyId)
      .then((items) => setInventoryItems(items.filter((i) => i.isActive !== false)))
      .catch(() => {});
  }, [open, companyId]);

  // Reset on close
  useEffect(() => {
    if (open) return;
    setStep('upload'); setFile(null); setExtracting(false); setExtractErr('');
    setProgress(''); setRows([]); setSelectedRowIds(new Set()); setMappingInfo(null);
    setBillDate(''); setSaving(false); setSaveErr(''); setSavedCount(null);
  }, [open]);

  function setRowsAndSelect(newRows) {
    setRows(newRows);
    setSelectedRowIds(new Set(newRows.map((r) => r.id)));
  }

  function applyDateToAllRows(dateStr) {
    setBillDate(dateStr);
    setRows((prev) => prev.map((r) => ({ ...r, billDate: dateStr })));
  }

  function updateRow(id, field, val) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  // ── CSV / Excel extraction ─────────────────────────────────────────────────

  async function handleExtract() {
    if (!file) return;
    const isExcel = /\.(xlsx|xls)$/i.test(file.name) ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel';
    const isCsv = /\.(csv|txt)$/i.test(file.name) || file.type.startsWith('text/');

    setExtracting(true);
    setExtractErr('');

    try {
      if (isExcel) {
        setProgress('Parsing Excel…');
        const { rows: extracted, reportDate, mappingInfo: mi } = await parseExcel(file);
        if (!extracted.length) throw new Error('No data rows found in this Excel file.');

        const fallback = reportDate || today;
        setBillDate(fallback);
        setMappingInfo(mi);

        setRowsAndSelect(extracted.map((e) => ({
          id:          Math.random().toString(36).slice(2),
          billDate:    e.billDate || fallback,
          billNumber:  e.billNumber || '',
          vendorName:  e.vendorName || '',
          itemName:    e.itemName   || 'Item',
          quantity:    e.quantity,
          costPrice:   e.costPrice,
          totalAmount: e.totalAmount || (e.quantity * e.costPrice + e.taxAmount),
          taxAmount:   e.taxAmount,
        })));
        setStep('preview');

      } else if (isCsv) {
        setProgress('Parsing CSV…');
        const content = await file.text();
        const parsed  = Papa.parse(content, { header: true, skipEmptyLines: true });
        if (!parsed.data.length) throw new Error('CSV file appears to be empty.');

        const headers = Object.keys(parsed.data[0]);
        const mapping = mapPurchaseColumns(headers);

        const mapped  = [];
        const missing = [];
        for (const [field, col] of Object.entries(mapping)) {
          if (field === 'billDate') continue;
          if (col) mapped.push(`${FIELD_LABELS[field]} → ${col}`);
          else if (!['itemName','vendorName','billNumber'].includes(field)) missing.push(FIELD_LABELS[field]);
        }
        setMappingInfo({ mapped, missing });

        const itemCol = mapping.itemName;
        const rows = parsed.data
          .filter((row) => {
            const v = itemCol ? row[itemCol] : Object.values(row)[0];
            if (!v || v.toString().trim() === '') return false;
            if (SKIP_ITEM_VALUES.has(v.toString().toLowerCase().trim())) return false;
            return true;
          })
          .map((row) => {
            const qty       = Number(row[mapping.quantity])    || 1;
            const costPrice = Number(row[mapping.costPrice])   || 0;
            const taxAmt    = Number(row[mapping.taxAmount])   || 0;
            const totalAmt  = Number(row[mapping.totalAmount]) || (qty * costPrice + taxAmt);
            const rawDate   = mapping.billDate ? row[mapping.billDate] : null;
            return {
              id:          Math.random().toString(36).slice(2),
              billDate:    normalizeDate(rawDate) || today,
              billNumber:  mapping.billNumber ? String(row[mapping.billNumber] ?? '').trim() : '',
              vendorName:  mapping.vendorName ? String(row[mapping.vendorName] ?? '').trim() : '',
              itemName:    String(row[itemCol] ?? '').trim() || 'Item',
              quantity:    qty,
              costPrice,
              totalAmount: totalAmt,
              taxAmount:   taxAmt,
            };
          });

        if (!rows.length) throw new Error('Could not map any rows from this file.');
        setBillDate(rows[0]?.billDate || today);
        setRowsAndSelect(rows);
        setStep('preview');

      } else {
        throw new Error('Unsupported file type. Please use CSV or Excel (.xlsx/.xls).');
      }
    } catch (e) {
      setExtractErr(e.message ?? 'Extraction failed.');
    } finally {
      setExtracting(false);
      setProgress('');
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSaveAll() {
    const toSave = rows.filter((r) => selectedRowIds.has(r.id));
    if (!toSave.length) return;
    setSaving(true);
    setSaveErr('');
    let saved = 0;
    const errs = [];

    for (const row of toSave) {
      try {
        await saveImportedRow(companyId, row, inventoryItems);
        saved++;
      } catch (e) {
        errs.push(e.message);
      }
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

  const selectedCount = rows.filter((r) => selectedRowIds.has(r.id)).length;
  const allSelected   = rows.length > 0 && rows.every((r) => selectedRowIds.has(r.id));
  const selectedRows  = rows.filter((r) => selectedRowIds.has(r.id));
  const totalCost     = selectedRows.reduce((s, r) => s + (r.totalAmount || r.quantity * r.costPrice), 0);
  const totalGST      = selectedRows.reduce((s, r) => s + (r.taxAmount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)' }}>
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--fg)' }}>Import Purchases</h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--fg-3)' }}>
              {step === 'upload'  && 'CSV · Excel'}
              {step === 'preview' && `${rows.length} rows extracted — review & import`}
              {step === 'done'    && 'Import complete'}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ color: 'var(--fg-3)' }}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── UPLOAD step ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className="cursor-pointer rounded-2xl px-6 py-12 text-center transition"
                style={{
                  border:     `2px dashed var(--border-2)`,
                  background: file ? 'var(--card)' : 'var(--bg-2)',
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = EMERALD; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-2)'; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = 'var(--border-2)';
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
                      style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>{file.name}</p>
                    <p className="text-xs" style={{ color: 'var(--fg-3)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                    <button type="button" className="mt-0.5 text-xs underline"
                      style={{ color: 'var(--fg-4)' }}
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}>Remove</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ background: 'var(--border)', color: 'var(--fg-3)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                        <polyline points="16 16 12 12 8 16"/>
                        <line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>Drop a file here or click to browse</p>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--fg-4)' }}>CSV · Excel</p>
                    </div>
                    <div className="flex gap-2">
                      {[{ label: 'CSV', color: 'var(--pos)', bg: 'var(--pos-soft)' },
                        { label: 'XLS', color: 'var(--info)', bg: 'var(--info-soft)' }]
                        .map(({ label, color, bg }) => (
                          <span key={label} className="rounded px-2 py-0.5 text-[10px] font-bold tracking-wide"
                            style={{ background: bg, color }}>{label}</span>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {extracting && (
                <div className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                  <LoadingSpinner size="sm" />
                  <p className="text-xs" style={{ color: 'var(--fg-2)' }}>{progress || 'Processing…'}</p>
                </div>
              )}

              {extractErr && (
                <div className="rounded-xl px-4 py-3 text-sm"
                  style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg)', color: 'var(--neg)' }}>
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

              {/* Controls row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 cursor-pointer"
                    style={{ accentColor: EMERALD }}
                    checked={allSelected}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedRowIds(new Set(rows.map((r) => r.id)));
                      else setSelectedRowIds(new Set());
                    }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--fg-2)' }}>
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--fg-3)' }}>({selectedCount} / {rows.length})</span>
                </label>
                <button type="button"
                  onClick={() => { setStep('upload'); setRows([]); setSelectedRowIds(new Set()); }}
                  className="text-xs underline" style={{ color: 'var(--fg-4)' }}>
                  Start over
                </button>
              </div>

              {/* Bill Date picker */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                <label className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--fg-2)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 flex-none">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Bill Date
                </label>
                <input type="date" value={billDate} onChange={(e) => applyDateToAllRows(e.target.value)}
                  style={{ ...iStyle(), width: '8.5rem' }} />
                <p className="text-xs" style={{ color: 'var(--fg-4)' }}>Applied to all rows that have no date column</p>
              </div>

              {/* Mapping info */}
              {mappingInfo && (
                <div className="rounded-xl px-4 py-3 space-y-1"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                  {mappingInfo.mapped.length > 0 && (
                    <p className="text-xs" style={{ color: 'var(--pos)' }}>
                      ✅ Mapped: {mappingInfo.mapped.join(', ')}
                    </p>
                  )}
                  {mappingInfo.missing.length > 0 && (
                    <p className="text-xs" style={{ color: 'var(--warn)' }}>
                      ⚠️ Could not find: {mappingInfo.missing.join(', ')} (will use defaults)
                    </p>
                  )}
                </div>
              )}

              {/* Summary chips */}
              <div className="flex flex-wrap gap-2">
                <span className="rounded-lg px-3 py-1 text-xs font-medium"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg-2)' }}>
                  {rows.length} rows
                </span>
                <span className="rounded-lg px-3 py-1 text-xs font-semibold"
                  style={{ background: 'var(--pos-soft)', color: 'var(--pos)', fontFamily: 'monospace' }}>
                  {formatCurrency(totalCost)} total cost
                </span>
                {totalGST > 0 && (
                  <span className="rounded-lg px-3 py-1 text-xs font-semibold"
                    style={{ background: 'var(--warn-soft)', color: 'var(--warn)', fontFamily: 'monospace' }}>
                    +{formatCurrency(totalGST)} GST
                  </span>
                )}
                <span className="rounded-lg px-3 py-1 text-xs font-medium"
                  style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
                  {selectedCount} selected
                </span>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-left text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
                      <th className="w-8 px-3 py-2.5" />
                      {['Date', 'Vendor', 'Item', 'Qty', 'Cost', 'GST', 'Total', ''].map((h, i) => (
                        <th key={i}
                          className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider${[3,4,5,6].includes(i) ? ' text-right' : ''}`}
                          style={{ color: 'var(--fg-3)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const total = row.totalAmount || (row.quantity * row.costPrice + row.taxAmount);
                      const sel   = selectedRowIds.has(row.id);
                      return (
                        <tr key={row.id}
                          style={{
                            background:   sel
                              ? 'oklch(0.74 0.15 155 / 0.06)'
                              : idx % 2 === 0 ? 'var(--card)' : 'var(--bg-2)',
                            borderBottom: '1px solid var(--border)',
                            opacity:      sel ? 1 : 0.5,
                            transition:   'opacity 0.15s',
                          }}>
                          <td className="px-3 py-2">
                            <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer"
                              style={{ accentColor: EMERALD }}
                              checked={sel}
                              onChange={(e) => {
                                const next = new Set(selectedRowIds);
                                if (e.target.checked) next.add(row.id); else next.delete(row.id);
                                setSelectedRowIds(next);
                              }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="date" value={row.billDate || ''}
                              onChange={(e) => updateRow(row.id, 'billDate', e.target.value)}
                              style={{ ...iStyle(), width: '7.5rem' }} />
                          </td>
                          <td className="px-3 py-2" style={{ maxWidth: '8rem' }}>
                            <input type="text" value={row.vendorName}
                              onChange={(e) => updateRow(row.id, 'vendorName', e.target.value)}
                              placeholder="Vendor"
                              style={{ ...iStyle(), width: '100%' }} />
                          </td>
                          <td className="px-3 py-2" style={{ maxWidth: '10rem' }}>
                            <input type="text" value={row.itemName}
                              onChange={(e) => updateRow(row.id, 'itemName', e.target.value)}
                              style={{ ...iStyle(), width: '100%' }} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" value={row.quantity} min="0"
                              onChange={(e) => updateRow(row.id, 'quantity', Number(e.target.value) || 0)}
                              style={{ ...iStyle(), width: '3.5rem', textAlign: 'right' }} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" value={row.costPrice} min="0" step="0.01"
                              onChange={(e) => updateRow(row.id, 'costPrice', Number(e.target.value) || 0)}
                              style={{ ...iStyle(), width: '5rem', textAlign: 'right', fontFamily: 'monospace' }} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" value={row.taxAmount} min="0" step="0.01"
                              onChange={(e) => updateRow(row.id, 'taxAmount', Number(e.target.value) || 0)}
                              style={{ ...iStyle(), width: '4.5rem', textAlign: 'right', fontFamily: 'monospace' }} />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold"
                            style={{ color: 'var(--pos)', fontFamily: 'monospace' }}>
                            {formatCurrency(total)}
                          </td>
                          <td className="px-3 py-2">
                            <button type="button"
                              onClick={() => {
                                setRows((p) => p.filter((r) => r.id !== row.id));
                                setSelectedRowIds((p) => { const n = new Set(p); n.delete(row.id); return n; });
                              }}
                              className="flex h-5 w-5 items-center justify-center rounded text-base leading-none"
                              style={{ color: 'var(--fg-4)' }}
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
                  style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg)', color: 'var(--neg)' }}>
                  {saveErr}
                </div>
              )}
            </div>
          )}

          {/* ── DONE step ── */}
          {step === 'done' && (
            <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
              style={{ background: 'var(--pos-soft)', border: '1px solid var(--pos)', color: 'var(--pos)' }}>
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-none">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {savedCount} purchase {savedCount === 1 ? 'entry' : 'entries'} imported successfully!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-end gap-3 px-6 py-4"
          style={{ borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm transition"
            style={{ border: '1px solid var(--border)', color: 'var(--fg-2)', background: 'transparent' }}>
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
