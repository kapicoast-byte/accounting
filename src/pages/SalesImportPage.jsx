import { useState } from 'react';
import { useApp } from '../context/AppContext';
import * as XLSX from 'xlsx';
import { extractSalesFromImage, mapSalesCsvColumns } from '../services/geminiService';
import { importSaleRow, normalizePaymentMode } from '../services/saleImportService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function parseNum(raw) {
  return Number(String(raw ?? '').replace(/[₹$€£,\s]/g, '')) || 0;
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const TABS = [
  ['csv',   'CSV / Excel'],
  ['pdf',   'PDF Report'],
  ['image', 'Image / Scan'],
];

const PAYMENT_OPTIONS = ['Cash', 'Card', 'UPI'];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SalesImportPage() {
  const { activeCompanyId } = useApp();

  const [tab, setTab]               = useState('csv');
  const [csvFile, setCsvFile]       = useState(null);
  const [pdfFile, setPdfFile]       = useState(null);
  const [imgFile, setImgFile]       = useState(null);
  const [csvKey, setCsvKey]         = useState(0);

  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError]           = useState(null);
  const [preview, setPreview]       = useState(null);

  const [saving, setSaving]         = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [savedCount, setSavedCount]     = useState(null);
  const [skippedCount, setSkippedCount] = useState(null);

  const [dateOverride, setDateOverride] = useState('');

  // ── Tab switch ─────────────────────────────────────────────────────────────

  function switchTab(t) {
    setTab(t);
    setPreview(null);
    setError(null);
    setSavedCount(null);
    setSkippedCount(null);
    setSaveProgress(0);
  }

  // ── Row selection helpers ──────────────────────────────────────────────────

  function selectAll()    { setPreview((p) => p.map((r) => ({ ...r, _selected: true  }))); }
  function deselectAll()  { setPreview((p) => p.map((r) => ({ ...r, _selected: false }))); }
  function toggleSelect(id) {
    setPreview((p) => p.map((r) => (r._id === id ? { ...r, _selected: !r._selected } : r)));
  }
  function patchRow(id, key, value) {
    setPreview((p) => p.map((r) => (r._id !== id ? r : { ...r, [key]: value })));
  }
  function removeRow(id) {
    setPreview((p) => p.filter((r) => r._id !== id));
  }

  // ── CSV / Excel ────────────────────────────────────────────────────────────

  async function handleCsvFile(f) {
    setCsvFile(f);
    setPreview(null);
    setSavedCount(null);
    setError(null);
    if (!f) return;

    setLoading(true);
    setLoadingMsg('Parsing file…');
    try {
      const buffer  = await f.arrayBuffer();
      const wb      = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const ws      = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (rawRows.length < 2) {
        setError('File appears empty — no header or data rows found.');
        return;
      }

      const headers  = rawRows[0].map(String);
      const dataRows = rawRows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));

      if (dataRows.length === 0) {
        setError('No data rows found in the file.');
        return;
      }

      setLoadingMsg('Mapping columns with Gemini AI…');
      const sampleRows = dataRows.slice(0, 5).map((r) => headers.map((_, i) => r[i] ?? ''));
      const mapping    = await mapSalesCsvColumns(headers, sampleRows);

      function getCell(row, field) {
        const col = mapping[field];
        if (!col) return '';
        const idx = headers.indexOf(col);
        return idx >= 0 ? String(row[idx] ?? '') : '';
      }

      const items = dataRows
        .map((row, i) => {
          const name  = String(getCell(row, 'itemName')).trim();
          const qty   = Number(getCell(row, 'quantity'))    || 1;
          const up    = parseNum(getCell(row, 'unitPrice'));
          const total = parseNum(getCell(row, 'totalAmount')) || qty * up;
          const gst   = parseNum(getCell(row, 'gstAmount'));
          if (!name || total <= 0) return null;
          return {
            _id:         i + 1,
            _selected:   true,
            itemName:    name,
            category:    String(getCell(row, 'category')).trim() || 'Food',
            quantity:    qty,
            unitPrice:   up || (total - gst) / qty,
            totalAmount: total,
            gstAmount:   gst,
            date:        getCell(row, 'date') || todayStr(),
            paymentMode: normalizePaymentMode(getCell(row, 'paymentMode')),
          };
        })
        .filter(Boolean);

      if (items.length === 0) {
        setError('No valid rows found — all rows were missing item name or total amount.');
        return;
      }

      setPreview(items);
    } catch (err) {
      setError(err.message ?? 'Failed to process file. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  // ── PDF / Image extraction ────────────────────────────────────────────────

  async function handleExtract() {
    const fileToUse = tab === 'image' ? imgFile : pdfFile;
    if (!fileToUse) return;
    setError(null);
    setPreview(null);
    setSavedCount(null);
    setLoading(true);
    setLoadingMsg(tab === 'image' ? 'Scanning image with AI…' : 'Extracting data from PDF…');
    try {
      const items = await extractSalesFromImage(fileToUse);
      if (items.length === 0) {
        setError('No sales rows found. Try a clearer image or PDF.');
        return;
      }
      setPreview(items);
    } catch (err) {
      setError(err.message ?? 'Extraction failed. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleImport() {
    const rowsToSave = (preview ?? []).filter((r) => r._selected);
    if (!rowsToSave.length) return;

    setSaving(true);
    setSaveProgress(0);
    setError(null);

    const batchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const CHUNK   = 20;
    let saved     = 0;
    let skipped   = 0;

    for (let i = 0; i < rowsToSave.length; i += CHUNK) {
      const chunk   = rowsToSave.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        chunk.map((row, idx) =>
          importSaleRow(
            activeCompanyId,
            { ...row, date: dateOverride || row.date },
            batchId,
            i + idx,
          ),
        ),
      );
      results.forEach((r) => (r.status === 'fulfilled' ? saved++ : skipped++));
      setSaveProgress(Math.round(((i + chunk.length) / rowsToSave.length) * 100));
    }

    setSavedCount(saved);
    setSkippedCount(skipped);
    setSaving(false);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedRows  = (preview ?? []).filter((r) => r._selected);
  const selectedCount = selectedRows.length;
  const totalSales    = selectedRows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
  const totalGst      = selectedRows.reduce((s, r) => s + (Number(r.gstAmount)   || 0), 0);
  const canExtract    = tab === 'image' ? !!imgFile : !!pdfFile;
  const hasDone       = savedCount !== null;

  // Date range of preview data
  const previewDates = (preview ?? [])
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  const minDate = previewDates[0];
  const maxDate = previewDates[previewDates.length - 1];
  const multiDay = minDate && maxDate && minDate !== maxDate;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Sales</h1>
        <p className="text-sm text-gray-500">
          Upload sales reports from any POS system — Gemini AI extracts and maps the data automatically.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
        {TABS.map(([t, label], i) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm font-medium transition ${
              i > 0 ? 'border-l border-gray-300' : ''
            } ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── CSV / Excel upload ── */}
      {tab === 'csv' && !preview && !loading && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Upload a <span className="font-medium text-gray-700">.xlsx</span> or{' '}
            <span className="font-medium text-gray-700">.csv</span> export from Petpooja, Zomato,
            Swiggy, or any POS system — Gemini AI maps the columns automatically.
          </p>
          <label
            key={csvKey}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
          >
            <svg className="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm text-gray-500 text-center">
              {csvFile ? csvFile.name : 'Click to upload .xlsx or .csv'}
            </span>
            <span className="text-xs text-gray-400">Supports Petpooja, Zomato, Swiggy, and any POS export</span>
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => handleCsvFile(e.target.files[0] ?? null)}
            />
          </label>
        </div>
      )}

      {/* ── PDF upload ── */}
      {tab === 'pdf' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Upload a PDF sales report — Gemini Vision reads the document and extracts sales data.
          </p>
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
            <svg className="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-sm text-gray-500">
              {pdfFile ? pdfFile.name : 'Click to upload PDF sales report'}
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => { setPdfFile(e.target.files[0] ?? null); setPreview(null); setSavedCount(null); }}
            />
          </label>
          {pdfFile && savedCount === null && !loading && (
            <button
              type="button"
              onClick={handleExtract}
              className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
            >
              Extract with Gemini AI
            </button>
          )}
        </div>
      )}

      {/* ── Image / Scan upload ── */}
      {tab === 'image' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Upload a photo or scan of a printed sales report. Gemini Vision will extract all rows.
          </p>
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
            <svg className="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm text-gray-500">
              {imgFile ? imgFile.name : 'Click to upload image (JPG, PNG…)'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { setImgFile(e.target.files[0] ?? null); setPreview(null); setSavedCount(null); }}
            />
          </label>
          {imgFile && savedCount === null && !loading && (
            <button
              type="button"
              onClick={handleExtract}
              className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Extract with Gemini AI
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
          <LoadingSpinner size="sm" />
          <p className="text-sm text-indigo-700">{loadingMsg || 'Processing…'}</p>
        </div>
      )}

      {error && (
        <p className="rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* ── Preview table ── */}
      {preview !== null && preview.length > 0 && !hasDone && (
        <div className="space-y-4">
          {/* Info bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {preview.length} row{preview.length !== 1 ? 's' : ''} found,{' '}
                <span className="text-blue-600">{selectedCount} selected</span>
              </p>
              {multiDay && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Date range: {fmtDate(minDate)} — {fmtDate(maxDate)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={selectAll} className="text-blue-600 hover:underline">
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={deselectAll} className="text-gray-500 hover:underline">
                  Deselect All
                </button>
              </div>
              {/* Date override — useful when report covers one day */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500 whitespace-nowrap">Override date:</label>
                <input
                  type="date"
                  value={dateOverride}
                  onChange={(e) => setDateOverride(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                />
                {dateOverride && (
                  <button type="button" onClick={() => setDateOverride('')}
                    className="text-xs text-gray-400 hover:text-gray-600">&times;</button>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[20px_2fr_80px_80px_90px_70px_90px_28px] gap-2 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <div />
              <div>Item Name</div>
              <div>Date</div>
              <div className="text-right">Qty</div>
              <div className="text-right">Unit Price</div>
              <div className="text-right">GST</div>
              <div>Payment</div>
              <div />
            </div>

            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {preview.map((row) => (
                <div
                  key={row._id}
                  className={`grid grid-cols-[20px_2fr_80px_80px_90px_70px_90px_28px] gap-2 items-center px-4 py-2 transition ${
                    !row._selected ? 'opacity-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={row._selected}
                    onChange={() => toggleSelect(row._id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <input
                    className="rounded border border-gray-300 px-2 py-1 text-sm w-full"
                    value={row.itemName}
                    onChange={(e) => patchRow(row._id, 'itemName', e.target.value)}
                  />
                  <input
                    type="date"
                    className="rounded border border-gray-200 px-1 py-1 text-xs w-full"
                    value={dateOverride || row.date}
                    onChange={(e) => patchRow(row._id, 'date', e.target.value)}
                    disabled={!!dateOverride}
                  />
                  <input
                    type="number" min="0" step="0.001"
                    className="rounded border border-gray-200 px-2 py-1 text-sm text-right w-full"
                    value={row.quantity}
                    onChange={(e) => patchRow(row._id, 'quantity', e.target.value)}
                  />
                  <input
                    type="number" min="0" step="0.01"
                    className="rounded border border-gray-200 px-2 py-1 text-sm text-right w-full"
                    value={row.totalAmount}
                    onChange={(e) => patchRow(row._id, 'totalAmount', e.target.value)}
                  />
                  <input
                    type="number" min="0" step="0.01"
                    className="rounded border border-gray-200 px-2 py-1 text-sm text-right w-full"
                    value={row.gstAmount}
                    onChange={(e) => patchRow(row._id, 'gstAmount', e.target.value)}
                  />
                  <select
                    className="rounded border border-gray-200 px-1 py-1 text-xs w-full"
                    value={row.paymentMode}
                    onChange={(e) => patchRow(row._id, 'paymentMode', e.target.value)}
                  >
                    {PAYMENT_OPTIONS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRow(row._id)}
                    className="text-gray-400 hover:text-red-500 text-xl leading-none flex items-center justify-center"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Total Selected Items</p>
              <p className="font-semibold text-gray-800 text-lg">{selectedCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Sales Value</p>
              <p className="font-semibold text-gray-800 text-lg">{formatCurrency(totalSales)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total GST</p>
              <p className="font-semibold text-gray-800 text-lg">{formatCurrency(totalGst)}</p>
            </div>
          </div>

          {/* Progress bar */}
          {saving && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Importing…</span>
                <span>{saveProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${saveProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setCsvFile(null);
                setCsvKey((k) => k + 1);
                setPdfFile(null);
                setImgFile(null);
              }}
              className="text-sm text-gray-500 hover:text-gray-700 transition"
            >
              &larr; Re-upload
            </button>
            <button
              type="button"
              disabled={saving || selectedCount === 0}
              onClick={handleImport}
              className="flex items-center gap-2 rounded-md bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition"
            >
              {saving && <LoadingSpinner size="sm" />}
              {saving
                ? `Importing… ${saveProgress}%`
                : `Import Sales (${selectedCount} row${selectedCount !== 1 ? 's' : ''})`}
            </button>
          </div>
        </div>
      )}

      {/* ── Success ── */}
      {hasDone && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-8 text-center space-y-4">
          <div className="flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </span>
          </div>
          <p className="text-green-700 font-bold text-xl">
            {savedCount} sale entr{savedCount !== 1 ? 'ies' : 'y'} imported successfully!
          </p>
          {skippedCount > 0 && (
            <p className="text-sm text-amber-600">
              {skippedCount} row{skippedCount !== 1 ? 's' : ''} could not be saved and were skipped.
            </p>
          )}
          <p className="text-sm text-green-600">
            The data is now visible in Sales &amp; Invoices and reflected in Dashboard totals.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setSavedCount(null);
                setSkippedCount(null);
                setPreview(null);
                setCsvFile(null);
                setCsvKey((k) => k + 1);
                setPdfFile(null);
                setImgFile(null);
              }}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
