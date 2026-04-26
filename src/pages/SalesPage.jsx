import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { listSales, createSale, SALE_STATUS, PAYMENT_MODES } from '../services/saleService';
import { BUSINESS_TYPES } from '../services/companyService';
import { startOfDay, endOfDay, toJsDate } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import PaymentStatusBadge from '../components/sales/PaymentStatusBadge';
import PaymentModal from '../components/sales/PaymentModal';

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

async function geminiExtract(parts) {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API key not configured (VITE_GEMINI_API_KEY).');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Gemini error ${res.status}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

function buildPrompt(today) {
  return `Extract all sales transactions from this document. Today's date is ${today}.
Return a JSON array. Each element must have:
- date: "YYYY-MM-DD" (use today if not found)
- customerName: string (use "Walk-in" if unknown)
- lineItems: array of { itemName: string, quantity: number, unitPrice: number, gstRate: number }
- paymentMode: one of "Cash","Card","UPI","Credit" (use "Cash" if unknown)
- notes: string (use "" if none)
Return ONLY the raw JSON array. No markdown, no extra text.`;
}

function normaliseRows(arr, today) {
  return arr.map((item) => ({
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
  }));
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

  useEffect(() => {
    if (open) return;
    setFile(null); setPaste(''); setRows([]);
    setExtractErr(''); setSaveErr(''); setSavedCount(null);
    setExtracting(false); setSaving(false); setTab('upload');
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
      const text = await geminiExtract(parts);
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error('AI returned unexpected format.');
      setRows(normaliseRows(arr, today));
    } catch (e) {
      setExtractErr(e.message ?? 'Extraction failed.');
    } finally {
      setExtracting(false);
    }
  }

  async function handleExtractFile() {
    if (!file) return;
    const today = new Date().toISOString().slice(0, 10);
    const prompt = buildPrompt(today);
    const isText = /\.(csv|txt)$/i.test(file.name) || file.type.startsWith('text/');
    if (isText) {
      const content = await file.text();
      await doExtract([{ text: prompt + '\n\n' + content }]);
    } else {
      const base64 = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload  = (e) => res(e.target.result.split(',')[1]);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      const mime = file.type || 'application/octet-stream';
      await doExtract([{ text: prompt }, { inlineData: { mimeType: mime, data: base64 } }]);
    }
  }

  async function handleExtractPaste() {
    if (!paste.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    await doExtract([{ text: buildPrompt(today) + '\n\n' + paste }]);
  }

  async function handleSaveAll() {
    if (rows.length === 0) return;
    setSaving(true);
    setSaveErr('');
    let saved = 0;
    const errs = [];
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
      } catch (e) {
        errs.push(e.message);
      }
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

          {/* Input tabs — only shown before extraction */}
          {rows.length === 0 && savedCount === null && (
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
                    {extracting && <LoadingSpinner size="sm" />}
                    {extracting ? 'Extracting…' : 'Extract with AI'}
                  </button>
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
  const { activeCompanyId, businessType, salesEntryMode } = useApp();

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

  const showPOS    = salesEntryMode === 'POS'              || salesEntryMode === 'Both';
  const showImport = salesEntryMode === 'Document Upload'  || salesEntryMode === 'Both';

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
    if (sourceFilter === 'import' && s.entrySource !== 'import') return false;
    if (sourceFilter === 'pos'    && s.entrySource === 'import') return false;
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Sales &amp; Invoices</h1>
            <BizTypeBadge businessType={businessType} />
          </div>
          <p className="text-sm text-gray-500">All invoices for the active company.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showPOS && (
            <Link to="/sales/new"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
              + New Sale
            </Link>
          )}
          {showImport && (
            <button type="button" onClick={() => setImportOpen(true)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
              Import Sales Report
            </button>
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
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
          {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" onClick={load}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition">
          Refresh
        </button>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} invoices</span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {sales.length === 0 ? 'No invoices yet.' : 'No invoices match the filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Invoice #</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2">Mode</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((sale) => (
                  <tr key={sale.saleId} className="hover:bg-gray-50">
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
                    <td className="px-4 py-2"><SourceBadge entrySource={sale.entrySource} /></td>
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
    </div>
  );
}
