import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { useRole } from '../hooks/useRole';
import {
  listDailyReports,
  saveDailyReport,
  deleteDailyReport,
  checkInvoiceOverlap,
} from '../services/dailySalesReportService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';

// ─── helpers ──────────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0'); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function buildCalendarDays(year, month) {
  const today    = todayStr();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const total    = daysInMonth(year, month);
  const cells    = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    cells.push({
      d,
      dateStr,
      isPast:   dateStr < today,
      isToday:  dateStr === today,
      isFuture: dateStr > today,
    });
  }
  return cells;
}

function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseAmountStr(raw) {
  return Number(String(raw ?? '').replace(/[₹$€£,\s]/g, '')) || 0;
}

function normalizePM4(raw) {
  if (!raw) return 'Cash';
  const s = String(raw).toLowerCase();
  if (/zomato|swiggy|online\s*order|delivery\s*partner|aggregator|cloud\s*kitchen/.test(s)) return 'Online';
  if (/card|credit|debit|swipe|pos/.test(s)) return 'Card';
  if (/upi|gpay|google\s*pay|phonepe|paytm|bhim/.test(s)) return 'UPI';
  return 'Cash';
}

function detectColIdx(headers, keywords) {
  const lh = headers.map((h) => String(h).toLowerCase().trim());
  for (const kw of keywords) {
    const idx = lh.findIndex((h) => h === kw);
    if (idx >= 0) return idx;
  }
  for (const kw of keywords) {
    const idx = lh.findIndex((h) => h.includes(kw));
    if (idx >= 0) return idx;
  }
  return -1;
}

const HEADER_KW = new Set([
  'total', 'amount', 'payment', 'mode', 'cash', 'card', 'upi', 'gst', 'tax',
  'qty', 'item', 'order', 'invoice', 'bill', 'date', 'name', 'description',
  'zomato', 'swiggy', 'online', 'net', 'gross', 'value', 'sale', 'no',
]);

function parseFileForDay(rawRows) {
  if (!rawRows || rawRows.length < 2) return null;

  // Find header row by keyword density
  let headerIdx = 0, maxScore = 0;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const score = rawRows[i].filter((c) => {
      const s = String(c ?? '').toLowerCase().trim();
      return s.length > 1 && [...HEADER_KW].some((kw) => s.includes(kw));
    }).length;
    if (score > maxScore) { maxScore = score; headerIdx = i; }
  }

  const headers  = rawRows[headerIdx].map((h) => String(h ?? '').trim());
  const dataRows = rawRows.slice(headerIdx + 1).filter((r) =>
    r.some((c) => String(c ?? '').trim()),
  );
  if (!dataRows.length) return null;

  const amtIdx    = detectColIdx(headers, ['grand total', 'total amount', 'net amount', 'bill amount', 'total', 'amount', 'sale amount', 'net sale', 'value', 'sale']);
  const pmIdx     = detectColIdx(headers, ['payment mode', 'payment type', 'mode of payment', 'tender type', 'tender', 'mode', 'payment', 'pay mode', 'pay type']);
  const taxIdx    = detectColIdx(headers, ['gst amount', 'tax amount', 'total gst', 'total tax', 'gst', 'tax', 'vat', 'cgst', 'sgst', 'igst']);
  const cashColIdx   = detectColIdx(headers, ['cash']);
  const cardColIdx   = detectColIdx(headers, ['card', 'credit card', 'debit card']);
  const upiColIdx    = detectColIdx(headers, ['upi', 'gpay', 'paytm', 'phonepe', 'wallet']);
  const onlineColIdx = detectColIdx(headers, ['zomato', 'swiggy', 'online order', 'aggregator', 'online']);

  let cashSales = 0, cardSales = 0, upiSales = 0, onlineSales = 0, taxCollected = 0, itemCount = 0;

  if (cashColIdx >= 0 || cardColIdx >= 0 || upiColIdx >= 0) {
    // Summary-format: dedicated columns per payment mode
    dataRows.forEach((row) => {
      cashSales   += parseAmountStr(cashColIdx   >= 0 ? row[cashColIdx]   : 0);
      cardSales   += parseAmountStr(cardColIdx   >= 0 ? row[cardColIdx]   : 0);
      upiSales    += parseAmountStr(upiColIdx    >= 0 ? row[upiColIdx]    : 0);
      onlineSales += parseAmountStr(onlineColIdx >= 0 ? row[onlineColIdx] : 0);
      if (taxIdx >= 0) taxCollected += parseAmountStr(row[taxIdx]);
    });
    itemCount = dataRows.length;
  } else {
    // Line-item format: group by payment mode column
    dataRows.forEach((row) => {
      const amt = parseAmountStr(amtIdx >= 0 ? row[amtIdx] : row[row.length - 1]);
      if (!amt) return;
      itemCount++;
      const pm = normalizePM4(pmIdx >= 0 ? row[pmIdx] : '');
      if (pm === 'Cash')        cashSales   += amt;
      else if (pm === 'Card')   cardSales   += amt;
      else if (pm === 'UPI')    upiSales    += amt;
      else if (pm === 'Online') onlineSales += amt;
      if (taxIdx >= 0) taxCollected += parseAmountStr(row[taxIdx]);
    });
  }

  const totalSales = cashSales + cardSales + upiSales + onlineSales;
  if (!totalSales && !itemCount) return null;

  return { totalSales, cashSales, cardSales, upiSales, onlineSales, taxCollected, itemCount };
}

// ─── small atoms ─────────────────────────────────────────────────────────────

function StatChip({ label, value, accent = 'gray' }) {
  const ACCENTS = {
    blue:   'bg-blue-50 text-blue-900',
    green:  'bg-green-50 text-green-900',
    purple: 'bg-purple-50 text-purple-900',
    orange: 'bg-orange-50 text-orange-900',
    red:    'bg-red-50 text-red-900',
    gray:   'bg-gray-50 text-gray-900',
  };
  return (
    <div className={`rounded-lg px-4 py-3 ${ACCENTS[accent] ?? ACCENTS.gray}`}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="mt-1 text-base font-bold">{value}</p>
    </div>
  );
}

// ─── constants ────────────────────────────────────────────────────────────────

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── main page ────────────────────────────────────────────────────────────────

export default function SalesImportPage() {
  const { activeCompanyId, user } = useApp();
  const { canDelete } = useRole();

  const now = new Date();

  // ── month navigation ───────────────────────────────────────────────────────
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth());

  // ── reports cache for displayed month ─────────────────────────────────────
  const [reports,  setReports]  = useState({}); // { 'YYYY-MM-DD': reportObj }
  const [loadingR, setLoadingR] = useState(false);

  // ── view tab ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('list'); // 'list' | 'summary'

  // ── upload modal ──────────────────────────────────────────────────────────
  const [modalDate,   setModalDate]   = useState(null); // YYYY-MM-DD
  const [reUpload,    setReUpload]    = useState(false);
  const [uploadFile,  setUploadFile]  = useState(null);
  const [parsing,     setParsing]     = useState(false);
  const [parseError,  setParseError]  = useState('');
  const [parsedData,  setParsedData]  = useState(null);
  const [invFrom,     setInvFrom]     = useState('');
  const [invTo,       setInvTo]       = useState('');
  const [overlapW,    setOverlapW]    = useState([]);
  const [checkingOL,  setCheckingOL]  = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError,  setModalError]  = useState('');
  const fileInputRef = useRef(null);

  // ── delete modal ──────────────────────────────────────────────────────────
  const [delDate,   setDelDate]   = useState(null);
  const [delReason, setDelReason] = useState('');
  const [deleting,  setDeleting]  = useState(false);

  // ── load reports for displayed month ──────────────────────────────────────
  useEffect(() => {
    if (!activeCompanyId) return;
    loadReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, selYear, selMonth]);

  async function loadReports() {
    setLoadingR(true);
    const from = `${selYear}-${pad2(selMonth + 1)}-01`;
    const to   = `${selYear}-${pad2(selMonth + 1)}-${pad2(daysInMonth(selYear, selMonth))}`;
    try {
      const list = await listDailyReports(activeCompanyId, { fromDate: from, toDate: to });
      const map  = {};
      list.forEach((r) => { map[r.date] = r; });
      setReports(map);
    } catch (err) {
      console.error('Failed to load daily reports:', err);
    } finally {
      setLoadingR(false);
    }
  }

  // ── month navigation ───────────────────────────────────────────────────────
  function prevMonth() {
    if (selMonth === 0) { setSelYear((y) => y - 1); setSelMonth(11); }
    else setSelMonth((m) => m - 1);
  }
  function nextMonth() {
    if (selYear === now.getFullYear() && selMonth === now.getMonth()) return;
    if (selMonth === 11) { setSelYear((y) => y + 1); setSelMonth(0); }
    else setSelMonth((m) => m + 1);
  }
  const isCurrentMonth = selYear === now.getFullYear() && selMonth === now.getMonth();

  // ── calendar ───────────────────────────────────────────────────────────────
  const calDays      = buildCalendarDays(selYear, selMonth);
  const activeDays   = calDays.filter(Boolean);
  const pastOrToday  = activeDays.filter((d) => !d.isFuture);
  const uploadedCount = pastOrToday.filter((d) => reports[d.dateStr]).length;
  const missingCount  = pastOrToday.filter((d) => !reports[d.dateStr]).length;

  // ── modal open/close ───────────────────────────────────────────────────────
  function openModal(dateStr) {
    const existing = reports[dateStr];
    setModalDate(dateStr);
    setReUpload(!existing);
    setUploadFile(null);
    setParsedData(null);
    setParseError('');
    setInvFrom(existing?.invoiceNumberFrom ?? '');
    setInvTo(existing?.invoiceNumberTo ?? '');
    setOverlapW([]);
    setModalError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function closeModal() {
    if (modalSaving) return;
    setModalDate(null);
    setReUpload(false);
    setUploadFile(null);
    setParsedData(null);
    setParseError('');
  }

  // ── file parsing ───────────────────────────────────────────────────────────
  async function handleFile(f) {
    if (!f) return;
    setUploadFile(f);
    setParsedData(null);
    setParseError('');
    setParsing(true);
    try {
      const buf     = await f.arrayBuffer();
      const wb      = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const ws      = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const result  = parseFileForDay(rawRows);
      if (!result) {
        setParseError('Could not detect sales data in this file. Check the format and try again.');
      } else {
        setParsedData(result);
      }
    } catch (err) {
      setParseError(err.message ?? 'Failed to read file.');
    } finally {
      setParsing(false);
    }
  }

  // ── invoice overlap check ──────────────────────────────────────────────────
  async function checkOverlap(from, to) {
    if (!from || !to || !activeCompanyId) return;
    setCheckingOL(true);
    try {
      const conflicts = await checkInvoiceOverlap(activeCompanyId, modalDate, from, to);
      setOverlapW(conflicts);
    } finally {
      setCheckingOL(false);
    }
  }

  // ── save report ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!parsedData || !modalDate) return;
    setModalSaving(true);
    setModalError('');
    try {
      await saveDailyReport(
        activeCompanyId,
        modalDate,
        {
          ...parsedData,
          invoiceNumberFrom: invFrom || null,
          invoiceNumberTo:   invTo   || null,
          fileName:          uploadFile?.name ?? '',
        },
        user?.email ?? '',
      );
      await loadReports();
      closeModal();
    } catch (err) {
      setModalError(err.message ?? 'Failed to save report.');
    } finally {
      setModalSaving(false);
    }
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!delDate || !delReason.trim()) return;
    setDeleting(true);
    try {
      await deleteDailyReport(activeCompanyId, delDate);
      await loadReports();
      setDelDate(null);
      setDelReason('');
    } finally {
      setDeleting(false);
    }
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const reportsList = Object.values(reports).sort((a, b) => b.date.localeCompare(a.date));

  const monthlySummary = reportsList.reduce(
    (acc, r) => ({
      totalSales:   acc.totalSales   + (r.totalSales   ?? 0),
      cashSales:    acc.cashSales    + (r.cashSales    ?? 0),
      cardSales:    acc.cardSales    + (r.cardSales    ?? 0),
      upiSales:     acc.upiSales     + (r.upiSales     ?? 0),
      onlineSales:  acc.onlineSales  + (r.onlineSales  ?? 0),
      taxCollected: acc.taxCollected + (r.taxCollected ?? 0),
      itemCount:    acc.itemCount    + (r.itemCount    ?? 0),
    }),
    { totalSales: 0, cashSales: 0, cardSales: 0, upiSales: 0, onlineSales: 0, taxCollected: 0, itemCount: 0 },
  );

  const existingReport  = modalDate ? reports[modalDate] : null;
  const showUploadForm  = reUpload || !existingReport;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Reports</h1>
          <p className="text-sm text-gray-500">
            Day-wise upload tracker — upload each day's sales report to keep your records complete.
          </p>
        </div>
        {missingCount > 0 && !loadingR && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            <span>⚠️</span>
            <span className="font-medium">{missingCount} day{missingCount !== 1 ? 's' : ''} missing sales data</span>
          </div>
        )}
      </div>

      {/* ── Calendar tracker ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

        {/* Month navigation */}
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={prevMonth}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 transition">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="text-center">
            <h2 className="text-base font-semibold text-gray-900">{monthLabel(selYear, selMonth)}</h2>
            {loadingR
              ? <span className="inline-block mt-0.5"><LoadingSpinner size="sm" /></span>
              : (
                <p className="text-xs text-gray-500 mt-0.5">
                  {uploadedCount}/{pastOrToday.length} days uploaded
                  {missingCount > 0 && <span className="text-red-500 ml-1">· {missingCount} missing</span>}
                </p>
              )}
          </div>

          <button type="button" onClick={nextMonth} disabled={isCurrentMonth}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {DOW.map((d) => (
            <div key={d} className="py-1 text-center text-xs font-medium text-gray-400">{d}</div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 gap-1">
          {calDays.map((cell, i) => {
            if (!cell) return <div key={`blank-${i}`} />;
            const report   = reports[cell.dateStr];
            const uploaded = !!report;

            let cls = '';
            let icon = null;
            let amtEl = null;

            if (cell.isFuture) {
              cls = 'bg-gray-50 text-gray-300 cursor-default';
            } else if (uploaded) {
              cls  = 'bg-green-50 border border-green-200 text-green-900 cursor-pointer hover:bg-green-100';
              icon = <span className="text-green-500 text-[10px] leading-none font-bold">✓</span>;
              amtEl = (
                <span className="text-[9px] leading-none text-green-700 font-mono mt-0.5 text-center block truncate w-full px-0.5">
                  {formatCurrency(report.totalSales ?? 0)}
                </span>
              );
            } else if (cell.isToday) {
              cls  = 'bg-amber-50 border border-amber-300 text-amber-900 cursor-pointer hover:bg-amber-100';
              icon = <span className="text-amber-400 text-[10px] leading-none">●</span>;
            } else {
              cls  = 'bg-red-50 border border-red-200 text-red-800 cursor-pointer hover:bg-red-100';
              icon = <span className="text-red-400 text-[10px] leading-none">✕</span>;
            }

            return (
              <div
                key={cell.dateStr}
                onClick={() => !cell.isFuture && openModal(cell.dateStr)}
                className={`rounded-md p-1.5 min-h-[52px] flex flex-col items-center transition select-none ${cls}`}
              >
                <span className="text-sm font-medium leading-none">{cell.d}</span>
                <span className="mt-0.5">{icon}</span>
                {amtEl}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3">
          {[
            ['bg-green-100 border-green-300', 'Uploaded'],
            ['bg-red-100 border-red-300',     'Missing'],
            ['bg-amber-100 border-amber-300',  'Today'],
            ['bg-gray-100 border-gray-200',    'Future'],
          ].map(([bg, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded border ${bg}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex w-fit overflow-hidden rounded-lg border border-gray-300">
        {[['list', 'Reports'], ['summary', 'Monthly Summary']].map(([t, label], i) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition
              ${i > 0 ? 'border-l border-gray-300' : ''}
              ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Reports list ── */}
      {tab === 'list' && (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Invoice Range</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Cash</th>
                  <th className="px-4 py-2.5 text-right">Card</th>
                  <th className="px-4 py-2.5 text-right">UPI</th>
                  <th className="px-4 py-2.5 text-right">Online</th>
                  <th className="px-4 py-2.5 text-right">Tax</th>
                  <th className="px-4 py-2.5 text-left">Uploaded By</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reportsList.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">
                      No reports uploaded for {monthLabel(selYear, selMonth)} yet.
                      <br />
                      <span className="text-xs">Click a date on the calendar above to upload.</span>
                    </td>
                  </tr>
                )}
                {reportsList.map((r) => (
                  <tr key={r.date} className="hover:bg-gray-50 transition">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-800">
                      {fmtDate(r.date)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                      {r.invoiceNumberFrom && r.invoiceNumberTo
                        ? `#${r.invoiceNumberFrom} – #${r.invoiceNumberTo}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                      {formatCurrency(r.totalSales ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(r.cashSales ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(r.cardSales ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(r.upiSales ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(r.onlineSales ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(r.taxCollected ?? 0)}</td>
                    <td className="max-w-[120px] truncate px-4 py-2.5 text-xs text-gray-500">
                      {r.uploadedBy || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-3">
                        <button type="button" onClick={() => openModal(r.date)}
                          className="text-xs text-blue-600 hover:underline">View</button>
                        {canDelete && (
                          <button type="button" onClick={() => { setDelDate(r.date); setDelReason(''); }}
                            className="text-xs text-red-500 hover:underline">Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Monthly summary ── */}
      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatChip label="Total Sales"   value={formatCurrency(monthlySummary.totalSales)}   accent="blue" />
            <StatChip label="Tax Collected" value={formatCurrency(monthlySummary.taxCollected)} accent="gray" />
            <StatChip label="Days Uploaded" value={`${uploadedCount} / ${pastOrToday.length}`} accent="green" />
            <StatChip label="Missing Days"  value={String(missingCount)} accent={missingCount > 0 ? 'red' : 'green'} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatChip label="Cash"               value={formatCurrency(monthlySummary.cashSales)}   accent="green" />
            <StatChip label="Card"               value={formatCurrency(monthlySummary.cardSales)}   accent="blue" />
            <StatChip label="UPI"                value={formatCurrency(monthlySummary.upiSales)}    accent="purple" />
            <StatChip label="Online (Zomato/Swiggy)" value={formatCurrency(monthlySummary.onlineSales)} accent="orange" />
          </div>

          {/* Payment breakdown bar chart */}
          {monthlySummary.totalSales > 0 && (
            <div className="rounded-xl border border-gray-200 p-5">
              <p className="mb-3 text-sm font-semibold text-gray-700">Payment Mode Breakdown</p>
              <div className="space-y-2.5">
                {[
                  { label: 'Cash',   val: monthlySummary.cashSales,   color: 'bg-green-500' },
                  { label: 'Card',   val: monthlySummary.cardSales,   color: 'bg-blue-500' },
                  { label: 'UPI',    val: monthlySummary.upiSales,    color: 'bg-purple-500' },
                  { label: 'Online', val: monthlySummary.onlineSales, color: 'bg-orange-500' },
                ].filter((x) => x.val > 0).map(({ label, val, color }) => {
                  const pct = ((val / monthlySummary.totalSales) * 100).toFixed(1);
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs text-gray-600">{label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs text-gray-700">{formatCurrency(val)}</span>
                      <span className="w-10 shrink-0 text-right text-xs text-gray-400">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {monthlySummary.totalSales === 0 && (
            <p className="text-sm text-gray-400">No sales data for {monthLabel(selYear, selMonth)} yet.</p>
          )}
        </div>
      )}

      {/* ── Upload / View modal ── */}
      <Modal
        open={!!modalDate}
        onClose={closeModal}
        title={`Sales Report — ${fmtDate(modalDate ?? '')}`}
        size="lg"
        footer={
          showUploadForm ? (
            <>
              <button type="button" onClick={closeModal} disabled={modalSaving}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleSave}
                disabled={modalSaving || !parsedData}
                className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {modalSaving && <LoadingSpinner size="sm" />}
                Save Report
              </button>
            </>
          ) : (
            <>
              <button type="button"
                onClick={() => { setReUpload(true); setParsedData(null); setUploadFile(null); setParseError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Re-upload
              </button>
              <button type="button" onClick={closeModal}
                className="rounded-md bg-gray-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gray-700">
                Close
              </button>
            </>
          )
        }
      >
        <div className="space-y-4">

          {/* ─ Existing report view ─ */}
          {existingReport && !showUploadForm && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatChip label="Total Sales"          value={formatCurrency(existingReport.totalSales ?? 0)}   accent="blue" />
                <StatChip label="Cash"                 value={formatCurrency(existingReport.cashSales ?? 0)}    accent="green" />
                <StatChip label="Card"                 value={formatCurrency(existingReport.cardSales ?? 0)}    accent="blue" />
                <StatChip label="UPI"                  value={formatCurrency(existingReport.upiSales ?? 0)}     accent="purple" />
                <StatChip label="Online (Zomato/Swiggy)" value={formatCurrency(existingReport.onlineSales ?? 0)} accent="orange" />
                <StatChip label="Tax Collected"        value={formatCurrency(existingReport.taxCollected ?? 0)} accent="gray" />
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm">
                {existingReport.invoiceNumberFrom && (
                  <div>
                    <p className="text-xs text-gray-500">Invoice Range</p>
                    <p className="mt-0.5 font-mono font-medium text-gray-800">
                      #{existingReport.invoiceNumberFrom} – #{existingReport.invoiceNumberTo}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500">Items / Transactions</p>
                  <p className="mt-0.5 font-medium text-gray-800">{existingReport.itemCount ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Uploaded By</p>
                  <p className="mt-0.5 text-gray-700">{existingReport.uploadedBy || '—'}</p>
                </div>
                {existingReport.fileName && (
                  <div>
                    <p className="text-xs text-gray-500">File</p>
                    <p className="mt-0.5 truncate text-gray-700">{existingReport.fileName}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─ Upload form ─ */}
          {showUploadForm && (
            <>
              {/* Drop zone */}
              {!parsedData && !parsing && (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 transition hover:border-blue-400 hover:bg-blue-50">
                  <svg className="h-9 w-9 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm text-gray-500">
                    {uploadFile ? uploadFile.name : 'Click to upload .xlsx or .csv'}
                  </span>
                  <span className="text-xs text-gray-400">Petpooja, Zomato, Swiggy, or any POS export</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files[0] ?? null)}
                  />
                </label>
              )}

              {parsing && (
                <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
                  <LoadingSpinner size="sm" />
                  <p className="text-sm text-indigo-700">Parsing file…</p>
                </div>
              )}

              {parseError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{parseError}</p>
              )}

              {/* Parsed summary */}
              {parsedData && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">Parsed Summary</p>
                    <button type="button"
                      onClick={() => { setUploadFile(null); setParsedData(null); setParseError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="text-xs text-gray-400 hover:text-gray-600">
                      ← Change file
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <StatChip label="Total Sales"          value={formatCurrency(parsedData.totalSales)}   accent="blue" />
                    <StatChip label="Cash"                 value={formatCurrency(parsedData.cashSales)}    accent="green" />
                    <StatChip label="Card"                 value={formatCurrency(parsedData.cardSales)}    accent="blue" />
                    <StatChip label="UPI"                  value={formatCurrency(parsedData.upiSales)}     accent="purple" />
                    <StatChip label="Online (Zomato/Swiggy)" value={formatCurrency(parsedData.onlineSales)} accent="orange" />
                    <StatChip label="Tax Collected"        value={formatCurrency(parsedData.taxCollected)} accent="gray" />
                  </div>
                  <div className="flex items-center gap-6 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Items / Transactions</p>
                      <p className="font-medium text-gray-800">{parsedData.itemCount}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500">File</p>
                      <p className="truncate text-gray-700">{uploadFile?.name}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Invoice range */}
              {parsedData && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    Invoice Number Range
                    <span className="ml-1 font-normal text-gray-400">(optional)</span>
                  </p>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500">From #</label>
                      <input type="number" min="1" value={invFrom}
                        onChange={(e) => setInvFrom(e.target.value)}
                        onBlur={() => checkOverlap(invFrom, invTo)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. 101" />
                    </div>
                    <span className="mb-2 text-gray-400">—</span>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500">To #</label>
                      <input type="number" min="1" value={invTo}
                        onChange={(e) => setInvTo(e.target.value)}
                        onBlur={() => checkOverlap(invFrom, invTo)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. 145" />
                    </div>
                  </div>
                  {checkingOL && <p className="text-xs text-gray-400">Checking for conflicts…</p>}
                  {overlapW.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      ⚠️ Invoice number overlap detected with:
                      {overlapW.map((w) => (
                        <span key={w.date} className="ml-1 font-medium">
                          {fmtDate(w.date)} (#{w.invoiceNumberFrom}–#{w.invoiceNumberTo})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {modalError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{modalError}</p>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* ── Delete confirmation modal ── */}
      <Modal
        open={!!delDate}
        onClose={() => !deleting && setDelDate(null)}
        title={`Delete Report — ${fmtDate(delDate ?? '')}`}
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setDelDate(null)} disabled={deleting}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleDelete}
              disabled={deleting || !delReason.trim()}
              className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {deleting && <LoadingSpinner size="sm" />}
              Delete
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            This will permanently delete the sales report for{' '}
            <span className="font-medium">{fmtDate(delDate ?? '')}</span>.
          </p>
          <div>
            <label className="text-sm font-medium text-gray-700">
              Reason for deletion <span className="text-red-500">*</span>
            </label>
            <textarea rows={2} value={delReason} onChange={(e) => setDelReason(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
              placeholder="e.g. Incorrect data, re-uploading with correct figures" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
