import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/format';
import { listBankAccounts } from '../services/bankAccountService';
import {
  loadRecordsForPeriod, runMatching,
  saveReconciliationSession, listReconciliationSessions,
} from '../services/reconciliationService';
import ExpenseModal from '../components/expenses/ExpenseModal';
import LoadingSpinner from '../components/LoadingSpinner';

// ── Parsing helpers ────────────────────────────────────────────────────────────

function parseAmount(val) {
  if (!val && val !== 0) return 0;
  const s = String(val).replace(/[,\s₹$€£()]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

function normalizeDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const mdy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (mdy) return `20${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 40000) {
    const d = new Date((Number(s) - 25569) * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return new Promise((resolve, reject) => {
    if (ext === 'csv') {
      Papa.parse(file, { header: false, skipEmptyLines: false, complete: (r) => resolve(r.data), error: reject });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }));
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('File read error'));
      reader.readAsArrayBuffer(file);
    }
  });
}

// ── Bank statement column detection ───────────────────────────────────────────

const BANK_COLS = {
  date:        ['transaction date', 'txn date', 'value date', 'posting date', 'trans date', 'date'],
  description: ['narration', 'particulars', 'transaction details', 'description', 'remarks', 'details', 'memo'],
  debit:       ['debit amount', 'debit amt', 'withdrawal amount', 'withdrawal', 'debit', 'dr'],
  credit:      ['credit amount', 'credit amt', 'deposit amount', 'deposit', 'credit', 'cr'],
  balance:     ['closing balance', 'available balance', 'running balance', 'balance', 'bal'],
};

function findHeaderRow(rows, kwSet) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const matched = rows[i].filter((c) => {
      const s = String(c ?? '').toLowerCase().trim();
      return s && [...kwSet].some((k) => s.includes(k));
    }).length;
    if (matched >= 2) return i;
  }
  return 0;
}

function detectCols(headers, colDefs) {
  const h = headers.map((x) => String(x ?? '').toLowerCase().trim());
  const find = (kws) => {
    for (const kw of kws) {
      const idx = h.findIndex((x) => x === kw || x.includes(kw));
      if (idx !== -1) return { idx, col: headers[idx] };
    }
    return null;
  };
  return Object.fromEntries(Object.entries(colDefs).map(([k, kws]) => [k, find(kws)]));
}

function buildBankRows(rawRows, headerIdx, colMap) {
  const rows = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const dateStr = colMap.date ? normalizeDate(row[colMap.date.idx]) : null;
    if (!dateStr) continue;
    const debit  = colMap.debit  ? parseAmount(row[colMap.debit.idx])  : 0;
    const credit = colMap.credit ? parseAmount(row[colMap.credit.idx]) : 0;
    if (debit === 0 && credit === 0) continue;
    rows.push({
      dateStr, date: new Date(dateStr),
      description: colMap.description ? String(row[colMap.description.idx] ?? '').trim() : '',
      debit, credit,
      balance: colMap.balance ? parseAmount(row[colMap.balance.idx]) : null,
    });
  }
  return rows;
}

// ── Delivery partner column detection ─────────────────────────────────────────

const DL_PARTNERS  = ['Zomato', 'Swiggy', 'Other'];
const DL_COLS = {
  orderId:    ['order id', 'order_id', 'sub order id', 'id', 'order number'],
  date:       ['order date', 'transaction date', 'date', 'delivery date'],
  orderAmt:   ['gross order value', 'order amount', 'total order value', 'gmv', 'gross sales', 'order value', 'total amount'],
  commission: ['restaurant commission', 'platform commission', 'commission amount', 'commission', 'platform fee', 'service fee'],
  gstComm:    ['gst on commission', 'gst on service', 'gst on platform', 'tax on commission', 'igst', 'cgst', 'sgst', 'gst'],
  netPayout:  ['net payout', 'settlement amount', 'amount payable', 'net settlement', 'payout amount', 'net amount', 'net'],
};

const DL_HEADER_KW = new Set(['order', 'commission', 'payout', 'settlement', 'amount', 'gst', 'id', 'date', 'gross', 'net', 'total', 'value', 'restaurant']);

function buildDeliveryRows(rawRows, headerIdx, colMap) {
  const rows = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const orderAmt   = colMap.orderAmt   ? parseAmount(row[colMap.orderAmt.idx])   : 0;
    const commission = colMap.commission ? parseAmount(row[colMap.commission.idx]) : 0;
    const gstComm    = colMap.gstComm    ? parseAmount(row[colMap.gstComm.idx])    : 0;
    const netPayout  = colMap.netPayout
      ? parseAmount(row[colMap.netPayout.idx])
      : Math.max(0, orderAmt - commission - gstComm);
    if (orderAmt === 0 && netPayout === 0) continue;
    rows.push({
      orderId:  colMap.orderId ? String(row[colMap.orderId.idx] ?? '').trim() : '',
      dateStr:  colMap.date   ? normalizeDate(row[colMap.date.idx]) : null,
      orderAmt, commission, gstComm, netPayout,
    });
  }
  return rows;
}

// ── UI atoms ───────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, sub }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', flex: 1, minWidth: 150 }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-4)' }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, color: color ?? 'var(--fg)', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '-0.5px' }}>{value}</p>
      {sub && <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--fg-4)' }}>{sub}</p>}
    </div>
  );
}

const STATUS_MAP = {
  MATCHED:          { label: '✓ Matched',  bg: 'var(--pos-soft)',   color: 'var(--pos)' },
  UNMATCHED_CREDIT: { label: '⚠ Credit',   bg: 'var(--warn-soft)',  color: 'var(--warn)' },
  UNMATCHED_DEBIT:  { label: '⚠ Debit',    bg: 'var(--neg-soft)',   color: 'var(--neg)' },
  IGNORED:          { label: '— Ignored',  bg: 'var(--bg-2)',       color: 'var(--fg-4)' },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] ?? { label: status, bg: 'var(--bg-2)', color: 'var(--fg-3)' };
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

function ColTag({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, color: 'var(--fg-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 80 }}>{label}</span>
      {value ? <span style={{ fontSize: 12, color: 'var(--pos)', fontWeight: 600 }}>→ "{value.col}"</span>
             : <span style={{ fontSize: 12, color: 'var(--warn)' }}>not detected</span>}
    </div>
  );
}

const ROW_BG = {
  MATCHED:          'transparent',
  UNMATCHED_CREDIT: 'rgba(251,191,36,0.05)',
  UNMATCHED_DEBIT:  'rgba(248,113,113,0.05)',
  IGNORED:          'transparent',
};

function DropZone({ id, onFile, parsing, error, label }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
        onClick={() => document.getElementById(id).click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--info)' : 'var(--border-2)'}`,
          borderRadius: 12, padding: '36px 24px', textAlign: 'center', cursor: 'pointer',
          background: dragging ? 'var(--info-soft)' : 'var(--bg-2)', transition: 'all 0.15s',
        }}
      >
        <input id={id} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
          onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
        {parsing ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <LoadingSpinner />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-3)' }}>Parsing…</p>
          </div>
        ) : (
          <>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--info-soft)', color: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{label ?? 'Drop file here'}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-3)' }}>CSV or Excel (.xlsx, .xls)</p>
          </>
        )}
      </div>
      {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--neg)', background: 'var(--neg-soft)', border: '1px solid var(--neg)', borderRadius: 8, padding: '10px 14px' }}>{error}</p>}
    </div>
  );
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTs(ts) {
  if (!ts) return '—';
  const d = ts.toDate?.() ?? new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Btn({ onClick, disabled, children, color = 'var(--info)', style: s }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: color, color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6, ...s }}>
      {children}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useApp();

  // ── Shared
  const [activeTab, setActiveTab]   = useState('bank');
  const [bankAccounts, setBankAccounts] = useState([]);

  useEffect(() => {
    if (!activeCompanyId) return;
    listBankAccounts(activeCompanyId).then(setBankAccounts).catch(() => {});
  }, [activeCompanyId]);

  // ── Bank statement state
  const [step,             setStep]           = useState(1);
  const [selectedAccId,    setSelectedAccId]  = useState('');
  const [parseError,       setParseError]     = useState('');
  const [parsing,          setParsing]        = useState(false);
  const [parsedRows,       setParsedRows]     = useState([]);
  const [colMap,           setColMap]         = useState({});
  const [fromDate,         setFromDate]       = useState('');
  const [toDate,           setToDate]         = useState('');
  const [fileName,         setFileName]       = useState('');
  const [matching,         setMatching]       = useState(false);
  const [matchError,       setMatchError]     = useState('');
  const [matchedRows,      setMatchedRows]    = useState([]);
  const [ignoredIdxs,      setIgnoredIdxs]   = useState(new Set());
  const [statusFilter,     setStatusFilter]   = useState('ALL');
  const [saving,           setSaving]         = useState(false);
  const [savedSessionId,   setSavedSessionId] = useState(null);

  // ── Expense modal
  const [expenseOpen,    setExpenseOpen]    = useState(false);
  const [expensePrefill, setExpensePrefill] = useState(null);

  // ── Delivery partner state
  const [dlPartner,      setDlPartner]      = useState('Zomato');
  const [dlFromDate,     setDlFromDate]     = useState('');
  const [dlToDate,       setDlToDate]       = useState('');
  const [dlParsing,      setDlParsing]      = useState(false);
  const [dlParseError,   setDlParseError]   = useState('');
  const [dlRows,         setDlRows]         = useState([]);
  const [dlColMap,       setDlColMap]       = useState({});
  const [dlFileName,     setDlFileName]     = useState('');
  const [dlReceivedInBank, setDlReceivedInBank] = useState('');
  const [dlSaving,       setDlSaving]       = useState(false);
  const [dlSavedId,      setDlSavedId]      = useState(null);

  // ── History state
  const [histSessions,   setHistSessions]   = useState([]);
  const [histLoading,    setHistLoading]    = useState(false);

  // ── Bank: file handling ────────────────────────────────────────────────────

  const handleBankFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) { setParseError('CSV or Excel only.'); return; }
    setParsing(true); setParseError('');
    try {
      const rows    = await parseFile(file);
      const kwSet   = new Set(['date', 'debit', 'credit', 'balance', 'narration', 'description', 'particulars', 'withdrawal', 'deposit', 'amount', 'dr', 'cr']);
      const hIdx    = findHeaderRow(rows, kwSet);
      const headers = rows[hIdx] ?? [];
      const cm      = detectCols(headers, BANK_COLS);
      const pr      = buildBankRows(rows, hIdx, cm);
      if (pr.length === 0) { setParseError('No valid transaction rows detected. Verify the file has Date, Debit and Credit columns.'); setParsing(false); return; }
      const dates   = pr.map((r) => r.dateStr).filter(Boolean).sort();
      setColMap(cm); setParsedRows(pr); setFileName(file.name);
      setFromDate(dates[0] ?? ''); setToDate(dates[dates.length - 1] ?? '');
      setStep(2);
    } catch (err) { setParseError(err.message ?? 'Failed to parse file.'); }
    finally { setParsing(false); }
  }, []);

  // ── Bank: run matching ─────────────────────────────────────────────────────

  async function runReconciliation() {
    if (!fromDate || !toDate) return;
    setMatching(true); setMatchError('');
    try {
      const filtered = parsedRows.filter((r) => r.dateStr >= fromDate && r.dateStr <= toDate);
      const records  = await loadRecordsForPeriod(activeCompanyId, new Date(fromDate), new Date(toDate));
      const results  = runMatching(filtered, records);
      setMatchedRows(results); setIgnoredIdxs(new Set()); setStatusFilter('ALL');
      setSavedSessionId(null); setStep(3);
    } catch (err) { setMatchError(err.message ?? 'Failed to run reconciliation.'); }
    finally { setMatching(false); }
  }

  // ── Bank: apply ignore overlay ─────────────────────────────────────────────

  const appliedRows = matchedRows.map((r) =>
    ignoredIdxs.has(r.idx) ? { ...r, status: 'IGNORED' } : r
  );
  const effectiveRows  = appliedRows.filter((r) => r.status !== 'IGNORED');
  const totalCredits   = effectiveRows.reduce((s, r) => s + r.credit, 0);
  const totalDebits    = effectiveRows.reduce((s, r) => s + r.debit,  0);
  const matchedCount   = effectiveRows.filter((r) => r.status === 'MATCHED').length;
  const unmatchedCount = effectiveRows.filter((r) => r.status !== 'MATCHED').length;
  const ignoredCount   = appliedRows.filter((r) => r.status === 'IGNORED').length;

  const displayRows = statusFilter === 'ALL'       ? appliedRows
    : statusFilter === 'IGNORED'                   ? appliedRows.filter((r) => r.status === 'IGNORED')
    : appliedRows.filter((r) => r.status === statusFilter && r.status !== 'IGNORED');

  function toggleIgnore(idx) {
    setIgnoredIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  // ── Bank: save session ─────────────────────────────────────────────────────

  async function saveBankSession() {
    setSaving(true);
    try {
      const acc   = bankAccounts.find((a) => a.accountId === selectedAccId);
      const label = acc ? `${acc.bankName} ···${acc.accountLast4}` : '';
      const { sessionId } = await saveReconciliationSession(activeCompanyId, {
        type: 'bank', bankAccountId: selectedAccId || null, bankAccountLabel: label,
        deliveryPartner: null, period: { from: fromDate, to: toDate },
        totalCredits, totalDebits, matchedCount, unmatchedCount, ignoredCount,
        rowCount: appliedRows.length,
        status: unmatchedCount === 0 ? 'complete' : 'partial',
        totalOrders: 0, commission: 0, gstOnCommission: 0, netPayout: 0, receivedInBank: 0,
      });
      setSavedSessionId(sessionId);
    } finally { setSaving(false); }
  }

  // ── Delivery: file handling ────────────────────────────────────────────────

  const handleDlFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) { setDlParseError('CSV or Excel only.'); return; }
    setDlParsing(true); setDlParseError('');
    try {
      const rows    = await parseFile(file);
      const hIdx    = findHeaderRow(rows, DL_HEADER_KW);
      const headers = rows[hIdx] ?? [];
      const cm      = detectCols(headers, DL_COLS);
      const pr      = buildDeliveryRows(rows, hIdx, cm);
      if (pr.length === 0) { setDlParseError('No order rows detected. Check the file has order amount columns.'); setDlParsing(false); return; }
      setDlColMap(cm); setDlRows(pr); setDlFileName(file.name); setDlSavedId(null);
      const dates = pr.map((r) => r.dateStr).filter(Boolean).sort();
      if (!dlFromDate && dates.length) { setDlFromDate(dates[0]); setDlToDate(dates[dates.length - 1]); }
    } catch (err) { setDlParseError(err.message ?? 'Failed to parse file.'); }
    finally { setDlParsing(false); }
  }, [dlFromDate]);

  // ── Delivery: derived totals ───────────────────────────────────────────────

  const dlTotalOrders = dlRows.reduce((s, r) => s + r.orderAmt,   0);
  const dlCommission  = dlRows.reduce((s, r) => s + r.commission, 0);
  const dlGstOnComm   = dlRows.reduce((s, r) => s + r.gstComm,    0);
  const dlNetPayout   = dlRows.reduce((s, r) => s + r.netPayout,  0);
  const dlReceived    = parseAmount(dlReceivedInBank);
  const dlDifference  = dlNetPayout - dlReceived;

  const commPct = dlTotalOrders > 0 ? ((dlCommission / dlTotalOrders) * 100).toFixed(1) : '0.0';

  // ── Delivery: save session ─────────────────────────────────────────────────

  async function saveDlSession() {
    setDlSaving(true);
    try {
      const { sessionId } = await saveReconciliationSession(activeCompanyId, {
        type: 'delivery', bankAccountId: null, bankAccountLabel: null,
        deliveryPartner: dlPartner, period: { from: dlFromDate, to: dlToDate },
        totalCredits: 0, totalDebits: 0, matchedCount: 0, unmatchedCount: 0, ignoredCount: 0,
        rowCount: dlRows.length, status: Math.abs(dlDifference) < 1 ? 'complete' : 'partial',
        totalOrders: dlTotalOrders, commission: dlCommission, gstOnCommission: dlGstOnComm,
        netPayout: dlNetPayout, receivedInBank: dlReceived,
      });
      setDlSavedId(sessionId);
    } finally { setDlSaving(false); }
  }

  // ── History: load ──────────────────────────────────────────────────────────

  async function loadHistory() {
    setHistLoading(true);
    try {
      const sessions = await listReconciliationSessions(activeCompanyId);
      setHistSessions(sessions);
    } finally { setHistLoading(false); }
  }

  useEffect(() => {
    if (activeTab === 'history' && activeCompanyId) loadHistory();
  }, [activeTab, activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────

  const cardStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 };

  return (
    <div className="flex flex-col gap-6">

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>Bank Reconciliation</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-3)' }}>Match transactions automatically and reconcile delivery partner payouts.</p>
        </div>
        {activeTab === 'bank' && step > 1 && (
          <button type="button" onClick={() => { setStep(1); setMatchedRows([]); setIgnoredIdxs(new Set()); }}
            style={{ borderRadius: 8, padding: '7px 14px', fontSize: 13, border: '1px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--fg-3)', cursor: 'pointer' }}>
            ← Start over
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: 0 }}>
        {[['bank', 'Bank Statement'], ['delivery', 'Delivery Partners'], ['history', 'History']].map(([val, lbl]) => (
          <button key={val} type="button" onClick={() => setActiveTab(val)}
            style={{
              padding: '10px 18px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
              color: activeTab === val ? 'var(--fg)' : 'var(--fg-4)',
              borderBottom: `2px solid ${activeTab === val ? 'var(--info)' : 'transparent'}`,
              marginBottom: -1,
            }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ════════════════════════ BANK STATEMENT TAB ═══════════════════════════ */}

      {activeTab === 'bank' && (
        <>
          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {[['1', 'Upload'], ['2', 'Confirm'], ['3', 'Results']].map(([n, label], i) => {
              const active = step === i + 1;
              const done   = step >  i + 1;
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700,
                      background: done ? 'var(--pos)' : active ? 'var(--info)' : 'var(--bg-2)',
                      color: (done || active) ? '#fff' : 'var(--fg-4)',
                      border: `1px solid ${done ? 'var(--pos)' : active ? 'var(--info)' : 'var(--border)'}`,
                    }}>{done ? '✓' : n}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--fg)' : done ? 'var(--pos)' : 'var(--fg-4)' }}>{label}</span>
                  </div>
                  {i < 2 && <div style={{ width: 36, height: 1, margin: '0 8px', background: 'var(--border)' }} />}
                </div>
              );
            })}
          </div>

          {/* ── Step 1: Upload ── */}
          {step === 1 && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 400 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)' }}>Bank account to reconcile</label>
                {bankAccounts.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--warn)' }}>
                    No accounts.{' '}
                    <button type="button" onClick={() => navigate('/accounts/banks')}
                      style={{ color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>
                      Add one first
                    </button>
                  </p>
                ) : (
                  <select value={selectedAccId} onChange={(e) => setSelectedAccId(e.target.value)}>
                    <option value="">— Select account —</option>
                    {bankAccounts.map((a) => (
                      <option key={a.accountId} value={a.accountId}>{a.bankName} ···{a.accountLast4} — {a.holderName}</option>
                    ))}
                  </select>
                )}
              </div>
              <DropZone id="bank-file-input" onFile={handleBankFile} parsing={parsing} error={parseError} label="Drop your bank statement here" />
            </div>
          )}

          {/* ── Step 2: Confirm ── */}
          {step === 2 && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--pos-soft)', color: 'var(--pos)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                    {parsedRows.length} transactions from <span style={{ fontFamily: 'monospace', color: 'var(--info)' }}>{fileName}</span>
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--fg-4)' }}>Confirm detected columns and set the reconciliation period.</p>
                </div>
              </div>

              <div>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-4)' }}>Detected columns</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <ColTag label="Date"        value={colMap.date} />
                  <ColTag label="Description" value={colMap.description} />
                  <ColTag label="Debit"       value={colMap.debit} />
                  <ColTag label="Credit"      value={colMap.credit} />
                  <ColTag label="Balance"     value={colMap.balance} />
                </div>
              </div>

              <div>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-4)' }}>Reconciliation period</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--fg-4)' }}>From</label>
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: 'auto' }} />
                  </div>
                  <span style={{ color: 'var(--fg-4)', marginTop: 14 }}>→</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--fg-4)' }}>To</label>
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: 'auto' }} />
                  </div>
                  <span style={{ marginTop: 14, fontSize: 12, color: 'var(--fg-4)' }}>
                    {parsedRows.filter((r) => r.dateStr >= fromDate && r.dateStr <= toDate).length} rows
                  </span>
                </div>
              </div>

              {/* 5-row preview */}
              <div>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-4)' }}>Preview</p>
                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: 'var(--bg-2)' }}>
                      {['Date', 'Description', 'Debit', 'Credit', 'Balance'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: ['Debit', 'Credit', 'Balance'].includes(h) ? 'right' : 'left', color: 'var(--fg-4)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {parsedRows.slice(0, 5).map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{fmtDate(r.dateStr)}</td>
                          <td style={{ padding: '8px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: r.debit > 0 ? 'var(--neg)' : 'var(--fg-4)' }}>{r.debit > 0 ? formatCurrency(r.debit) : '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: r.credit > 0 ? 'var(--pos)' : 'var(--fg-4)' }}>{r.credit > 0 ? formatCurrency(r.credit) : '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--fg-3)', fontFamily: 'monospace' }}>{r.balance != null ? formatCurrency(r.balance) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {matchError && <p style={{ margin: 0, fontSize: 13, color: 'var(--neg)', background: 'var(--neg-soft)', border: '1px solid var(--neg)', borderRadius: 8, padding: '10px 14px' }}>{matchError}</p>}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn onClick={runReconciliation} disabled={matching || !fromDate || !toDate}>
                  {matching && <LoadingSpinner size="sm" />}
                  Run Reconciliation
                </Btn>
              </div>
            </div>
          )}

          {/* ── Step 3: Results ── */}
          {step === 3 && (
            <>
              {/* Summary cards */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <SummaryCard label="Total Credits"      value={formatCurrency(totalCredits)}  color="var(--pos)" sub={`${effectiveRows.filter((r) => r.credit > 0).length} entries`} />
                <SummaryCard label="Total Debits"       value={formatCurrency(totalDebits)}   color="var(--neg)" sub={`${effectiveRows.filter((r) => r.debit  > 0).length} entries`} />
                <SummaryCard label="Matched"            value={matchedCount}                  color="var(--pos)" sub="transactions" />
                <SummaryCard label="Unmatched"          value={unmatchedCount}                color={unmatchedCount > 0 ? 'var(--warn)' : 'var(--fg)'} sub="need attention" />
                <SummaryCard label="Net (Credit−Debit)" value={formatCurrency(totalCredits - totalDebits)} color={totalCredits >= totalDebits ? 'var(--pos)' : 'var(--neg)'} />
              </div>

              {/* Filter bar + save */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {[['ALL', 'All'], ['MATCHED', '✓ Matched'], ['UNMATCHED_CREDIT', '⚠ Unmatched Credits'], ['UNMATCHED_DEBIT', '⚠ Unmatched Debits'], ['IGNORED', '— Ignored']].map(([val, lbl]) => (
                  <button key={val} type="button" onClick={() => setStatusFilter(val)}
                    style={{
                      borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${statusFilter === val ? 'var(--info)' : 'var(--border)'}`,
                      background: statusFilter === val ? 'var(--info-soft)' : 'var(--bg-2)',
                      color: statusFilter === val ? 'var(--info)' : 'var(--fg-3)',
                    }}>{lbl}</button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-4)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  {ignoredCount > 0 && <span style={{ color: 'var(--fg-4)' }}>{ignoredCount} ignored</span>}
                  {displayRows.length} rows
                </span>
                {savedSessionId ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--pos)', display: 'flex', alignItems: 'center', gap: 4 }}>✓ Saved</span>
                ) : (
                  <Btn onClick={saveBankSession} disabled={saving} color="var(--accent)" style={{ fontSize: 12, padding: '6px 14px' }}>
                    {saving && <LoadingSpinner size="sm" />}
                    Save Session
                  </Btn>
                )}
              </div>

              {/* Results table */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: 'var(--bg-2)' }}>
                      {['Date', 'Description', 'Debit', 'Credit', 'Status', 'Matched With', 'Actions'].map((h) => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: ['Debit', 'Credit'].includes(h) ? 'right' : 'left', color: 'var(--fg-4)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {displayRows.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--fg-4)', fontSize: 13 }}>No rows for this filter.</td></tr>
                      ) : displayRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: ROW_BG[row.status] ?? 'transparent', opacity: row.status === 'IGNORED' ? 0.55 : 1 }}>
                          <td style={{ padding: '10px 14px', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{fmtDate(row.dateStr)}</td>
                          <td style={{ padding: '10px 14px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: row.status === 'IGNORED' ? 'line-through' : 'none' }}>{row.description || '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: row.debit > 0 ? 'var(--neg)' : 'var(--fg-4)', fontWeight: row.debit > 0 ? 600 : 400 }}>{row.debit > 0 ? formatCurrency(row.debit) : '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: row.credit > 0 ? 'var(--pos)' : 'var(--fg-4)', fontWeight: row.credit > 0 ? 600 : 400 }}>{row.credit > 0 ? formatCurrency(row.credit) : '—'}</td>
                          <td style={{ padding: '10px 14px' }}><StatusBadge status={row.status} /></td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--fg-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.matchedWith ?? '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                              {row.status === 'UNMATCHED_CREDIT' && (
                                <button type="button" onClick={() => navigate('/sales/new', { state: { prefill: { date: row.dateStr } } })}
                                  style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--pos)', background: 'var(--pos-soft)', color: 'var(--pos)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  + Sale
                                </button>
                              )}
                              {row.status === 'UNMATCHED_DEBIT' && (
                                <>
                                  <button type="button" onClick={() => { setExpensePrefill({ date: row.dateStr, amount: String(row.debit) }); setExpenseOpen(true); }}
                                    style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--warn)', background: 'var(--warn-soft)', color: 'var(--warn)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    + Expense
                                  </button>
                                  <button type="button" onClick={() => navigate('/purchases/new', { state: { prefill: { date: row.dateStr } } })}
                                    style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--info)', background: 'var(--info-soft)', color: 'var(--info)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    + Purchase
                                  </button>
                                </>
                              )}
                              {row.status !== 'MATCHED' && (
                                <button type="button" onClick={() => toggleIgnore(row.idx)}
                                  style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--fg-4)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  {row.status === 'IGNORED' ? 'Unignore' : 'Ignore'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════ DELIVERY PARTNERS TAB ══════════════════════════ */}

      {activeTab === 'delivery' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {/* Partner selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Partner</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DL_PARTNERS.map((p) => (
                    <button key={p} type="button" onClick={() => setDlPartner(p)}
                      style={{
                        padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${dlPartner === p ? 'var(--info)' : 'var(--border)'}`,
                        background: dlPartner === p ? 'var(--info-soft)' : 'var(--bg-2)',
                        color: dlPartner === p ? 'var(--info)' : 'var(--fg-3)',
                      }}>{p}</button>
                  ))}
                </div>
              </div>
              {/* Date range */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>From</label>
                  <input type="date" value={dlFromDate} onChange={(e) => setDlFromDate(e.target.value)} style={{ width: 'auto' }} />
                </div>
                <span style={{ color: 'var(--fg-4)', marginTop: 18 }}>→</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>To</label>
                  <input type="date" value={dlToDate} onChange={(e) => setDlToDate(e.target.value)} style={{ width: 'auto' }} />
                </div>
              </div>
            </div>

            <DropZone id="dl-file-input" onFile={handleDlFile} parsing={dlParsing} error={dlParseError}
              label={`Drop ${dlPartner} payout report here`} />
          </div>

          {dlRows.length > 0 && (
            <>
              {/* Detected columns */}
              <div style={cardStyle}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-4)' }}>
                  Detected columns from <span style={{ fontFamily: 'monospace', color: 'var(--info)', textTransform: 'none' }}>{dlFileName}</span> — {dlRows.length} orders
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <ColTag label="Order ID"    value={dlColMap.orderId} />
                  <ColTag label="Date"        value={dlColMap.date} />
                  <ColTag label="Order Amt"   value={dlColMap.orderAmt} />
                  <ColTag label="Commission"  value={dlColMap.commission} />
                  <ColTag label="GST on Comm" value={dlColMap.gstComm} />
                  <ColTag label="Net Payout"  value={dlColMap.netPayout} />
                </div>
              </div>

              {/* Summary cards */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <SummaryCard label="Total Orders"        value={formatCurrency(dlTotalOrders)} color="var(--fg)"   sub={`${dlRows.length} orders`} />
                <SummaryCard label="Platform Commission" value={formatCurrency(dlCommission)}  color="var(--neg)"  sub={`${commPct}% of orders`} />
                <SummaryCard label="GST on Commission"   value={formatCurrency(dlGstOnComm)}   color="var(--warn)" />
                <SummaryCard label="Net Payout Expected" value={formatCurrency(dlNetPayout)}   color="var(--info)" sub="orders − comm − GST" />
              </div>

              {/* Received in bank + difference */}
              <div style={cardStyle}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-4)' }}>Match with bank receipt</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 240px' }}>
                    <label style={{ fontSize: 12, color: 'var(--fg-3)' }}>Amount received in bank</label>
                    <input type="number" min="0" step="0.01" value={dlReceivedInBank}
                      onChange={(e) => setDlReceivedInBank(e.target.value)}
                      placeholder="0.00" style={{ width: 'auto' }} />
                  </div>
                  {dlReceived > 0 && (
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <SummaryCard label="Received in Bank" value={formatCurrency(dlReceived)}    color="var(--pos)" />
                      <SummaryCard label="Difference"       value={formatCurrency(Math.abs(dlDifference))}
                        color={Math.abs(dlDifference) < 1 ? 'var(--pos)' : 'var(--neg)'}
                        sub={Math.abs(dlDifference) < 1 ? '✓ Reconciled' : dlDifference > 0 ? 'Shortfall' : 'Excess received'} />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {dlSavedId ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pos)', display: 'flex', alignItems: 'center', gap: 4 }}>✓ Session saved</span>
                  ) : (
                    <Btn onClick={saveDlSession} disabled={dlSaving} color="var(--accent)">
                      {dlSaving && <LoadingSpinner size="sm" />}
                      Save Session
                    </Btn>
                  )}
                </div>
              </div>

              {/* Orders table */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: 'var(--bg-2)' }}>
                      {['Order ID', 'Date', 'Order Amount', 'Commission', 'GST on Comm', 'Net Payout'].map((h) => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: ['Order Amount', 'Commission', 'GST on Comm', 'Net Payout'].includes(h) ? 'right' : 'left', color: 'var(--fg-4)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {dlRows.slice(0, 100).map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--fg-3)' }}>{r.orderId || '—'}</td>
                          <td style={{ padding: '9px 14px', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{fmtDate(r.dateStr)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(r.orderAmt)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--neg)' }}>{r.commission > 0 ? formatCurrency(r.commission) : '—'}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--warn)' }}>{r.gstComm > 0 ? formatCurrency(r.gstComm) : '—'}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--pos)', fontWeight: 600 }}>{formatCurrency(r.netPayout)}</td>
                        </tr>
                      ))}
                      {dlRows.length > 100 && (
                        <tr><td colSpan={6} style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, color: 'var(--fg-4)' }}>Showing first 100 of {dlRows.length} rows.</td></tr>
                      )}
                      {/* Totals row */}
                      <tr style={{ background: 'var(--bg-2)', fontWeight: 700 }}>
                        <td colSpan={2} style={{ padding: '10px 14px', fontSize: 12, color: 'var(--fg-3)' }}>TOTAL ({dlRows.length} orders)</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(dlTotalOrders)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--neg)' }}>{formatCurrency(dlCommission)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--warn)' }}>{formatCurrency(dlGstOnComm)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--pos)' }}>{formatCurrency(dlNetPayout)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════ HISTORY TAB ════════════════════════════════ */}

      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={loadHistory} disabled={histLoading}
              style={{ borderRadius: 8, padding: '7px 14px', fontSize: 13, border: '1px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--fg-3)', cursor: 'pointer' }}>
              ↻ Refresh
            </button>
          </div>

          {histLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><LoadingSpinner /></div>
          ) : histSessions.length === 0 ? (
            <div style={{ ...cardStyle, alignItems: 'center', padding: 48 }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-4)' }}>No saved reconciliation sessions yet.</p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-4)' }}>Run a reconciliation and click "Save Session" to record it here.</p>
            </div>
          ) : (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: 'var(--bg-2)' }}>
                    {['Date', 'Type', 'Account / Partner', 'Period', 'Rows', 'Matched', 'Unmatched', 'Status'].map((h) => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: ['Rows', 'Matched', 'Unmatched'].includes(h) ? 'right' : 'left', color: 'var(--fg-4)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {histSessions.map((s) => {
                      const isBank     = s.type === 'bank';
                      const isComplete = s.status === 'complete';
                      return (
                        <tr key={s.sessionId} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', color: 'var(--fg-3)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtTs(s.createdAt)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: isBank ? 'var(--info-soft)' : 'var(--accent-soft)', color: isBank ? 'var(--info)' : 'var(--accent)' }}>
                              {isBank ? 'Bank' : 'Delivery'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--fg)' }}>
                            {isBank ? (s.bankAccountLabel || '—') : (s.deliveryPartner || '—')}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--fg-3)', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {s.period?.from ? `${fmtDate(s.period.from)} – ${fmtDate(s.period.to)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--fg-3)' }}>{s.rowCount ?? '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--pos)', fontWeight: 600 }}>{s.matchedCount ?? '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: (s.unmatchedCount ?? 0) > 0 ? 'var(--warn)' : 'var(--fg-4)', fontWeight: (s.unmatchedCount ?? 0) > 0 ? 600 : 400 }}>{s.unmatchedCount ?? '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: isComplete ? 'var(--pos-soft)' : 'var(--warn-soft)', color: isComplete ? 'var(--pos)' : 'var(--warn)' }}>
                              {isComplete ? '✓ Complete' : '⚠ Partial'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expense quick-create modal */}
      <ExpenseModal
        open={expenseOpen}
        companyId={activeCompanyId}
        onClose={() => setExpenseOpen(false)}
        onSaved={() => setExpenseOpen(false)}
        prefill={expensePrefill}
      />
    </div>
  );
}
