import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/format';
import { listBankAccounts } from '../services/bankAccountService';
import { loadRecordsForPeriod, runMatching } from '../services/reconciliationService';
import ExpenseModal from '../components/expenses/ExpenseModal';
import LoadingSpinner from '../components/LoadingSpinner';

// ── Parsing helpers ────────────────────────────────────────────────────────────

function parseAmount(val) {
  if (!val && val !== 0) return 0;
  const s = String(val).replace(/[,\s₹$€£()₹]/g, '');
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

const BANK_COL_KEYWORDS = {
  date:        ['transaction date', 'txn date', 'value date', 'posting date', 'trans date', 'date'],
  description: ['narration', 'particulars', 'transaction details', 'description', 'remarks', 'details', 'memo'],
  debit:       ['debit amount', 'debit amt', 'withdrawal amount', 'withdrawal', 'debit', 'dr'],
  credit:      ['credit amount', 'credit amt', 'deposit amount', 'deposit', 'credit', 'cr'],
  balance:     ['closing balance', 'available balance', 'running balance', 'balance', 'bal'],
};

function detectColumns(headers) {
  const h = headers.map((x) => String(x ?? '').toLowerCase().trim());
  const find = (keywords) => {
    for (const kw of keywords) {
      const idx = h.findIndex((x) => x === kw || x.includes(kw));
      if (idx !== -1) return { idx, col: headers[idx] };
    }
    return null;
  };
  return Object.fromEntries(
    Object.entries(BANK_COL_KEYWORDS).map(([k, kws]) => [k, find(kws)])
  );
}

function findHeaderRow(rows) {
  const kwSet = new Set(['date', 'debit', 'credit', 'balance', 'narration', 'description',
    'particulars', 'withdrawal', 'deposit', 'amount', 'dr', 'cr']);
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    const matched = row.filter((c) => {
      const s = String(c ?? '').toLowerCase().trim();
      return s && [...kwSet].some((k) => s.includes(k));
    }).length;
    if (matched >= 2) return i;
  }
  return 0;
}

async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return new Promise((resolve, reject) => {
    if (ext === 'csv') {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: false,
        complete: (r) => resolve(r.data),
        error: reject,
      });
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

function buildRows(rawRows, headerIdx, colMap) {
  const rows = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const dateStr = colMap.date ? normalizeDate(row[colMap.date.idx]) : null;
    if (!dateStr) continue;
    const debit  = colMap.debit   ? parseAmount(row[colMap.debit.idx])   : 0;
    const credit = colMap.credit  ? parseAmount(row[colMap.credit.idx])  : 0;
    if (debit === 0 && credit === 0) continue;
    rows.push({
      dateStr,
      date:        new Date(dateStr),
      description: colMap.description ? String(row[colMap.description.idx] ?? '').trim() : '',
      debit,
      credit,
      balance:     colMap.balance ? parseAmount(row[colMap.balance.idx]) : null,
    });
  }
  return rows;
}

// ── UI atoms ───────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '16px 20px', flex: 1, minWidth: 150,
    }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-4)' }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, color: color ?? 'var(--fg)', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '-0.5px' }}>{value}</p>
      {sub && <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--fg-4)' }}>{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    MATCHED:          { label: '✓ Matched',  bg: 'var(--pos-soft)',  color: 'var(--pos)' },
    UNMATCHED_CREDIT: { label: '⚠ Credit',   bg: 'var(--warn-soft)', color: 'var(--warn)' },
    UNMATCHED_DEBIT:  { label: '⚠ Debit',    bg: 'var(--neg-soft)',  color: 'var(--neg)' },
  };
  const s = map[status] ?? { label: status, bg: 'var(--bg-2)', color: 'var(--fg-3)' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function ColTag({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, color: 'var(--fg-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 70 }}>{label}</span>
      {value
        ? <span style={{ fontSize: 12, color: 'var(--pos)', fontWeight: 600 }}>→ "{value.col}"</span>
        : <span style={{ fontSize: 12, color: 'var(--warn)' }}>not detected</span>
      }
    </div>
  );
}

const ROW_BG = {
  MATCHED:          'transparent',
  UNMATCHED_CREDIT: 'rgba(251,191,36,0.05)',
  UNMATCHED_DEBIT:  'rgba(248,113,113,0.05)',
};

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useApp();

  const [step, setStep] = useState(1); // 1 upload | 2 confirm | 3 results
  const dropRef = useRef(null);

  // Step 1
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [dragging, setDragging]     = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing]       = useState(false);

  // Step 2
  const [rawRows,    setRawRows]    = useState([]);
  const [headerIdx,  setHeaderIdx]  = useState(0);
  const [colMap,     setColMap]     = useState({});
  const [parsedRows, setParsedRows] = useState([]);
  const [fromDate,   setFromDate]   = useState('');
  const [toDate,     setToDate]     = useState('');
  const [fileName,   setFileName]   = useState('');

  // Step 3
  const [matching,     setMatching]     = useState(false);
  const [matchError,   setMatchError]   = useState('');
  const [matchedRows,  setMatchedRows]  = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Expense modal
  const [expenseOpen,    setExpenseOpen]    = useState(false);
  const [expensePrefill, setExpensePrefill] = useState(null);

  useEffect(() => {
    if (!activeCompanyId) return;
    listBankAccounts(activeCompanyId).then(setBankAccounts).catch(() => {});
  }, [activeCompanyId]);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setParseError('Please upload a CSV or Excel file.');
      return;
    }
    setParsing(true);
    setParseError('');
    try {
      const rows = await parseFile(file);
      const hIdx = findHeaderRow(rows);
      const headers = rows[hIdx] ?? [];
      const cm = detectColumns(headers);
      const pr = buildRows(rows, hIdx, cm);

      if (pr.length === 0) {
        setParseError('No valid transaction rows detected. Check that the file has Date, Debit and Credit columns.');
        setParsing(false);
        return;
      }

      const dates = pr.map((r) => r.dateStr).filter(Boolean).sort();
      setRawRows(rows);
      setHeaderIdx(hIdx);
      setColMap(cm);
      setParsedRows(pr);
      setFromDate(dates[0] ?? '');
      setToDate(dates[dates.length - 1] ?? '');
      setFileName(file.name);
      setStep(2);
    } catch (err) {
      setParseError(err.message ?? 'Failed to parse file.');
    } finally {
      setParsing(false);
    }
  }, []);

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  // ── Run matching ───────────────────────────────────────────────────────────

  async function runReconciliation() {
    if (!fromDate || !toDate) return;
    setMatching(true);
    setMatchError('');
    try {
      const filtered = parsedRows.filter((r) => r.dateStr >= fromDate && r.dateStr <= toDate);
      const records  = await loadRecordsForPeriod(activeCompanyId, new Date(fromDate), new Date(toDate));
      const results  = runMatching(filtered, records);
      setMatchedRows(results);
      setStatusFilter('ALL');
      setStep(3);
    } catch (err) {
      setMatchError(err.message ?? 'Failed to run reconciliation.');
    } finally {
      setMatching(false);
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const totalCredits   = matchedRows.reduce((s, r) => s + r.credit, 0);
  const totalDebits    = matchedRows.reduce((s, r) => s + r.debit,  0);
  const matchedCount   = matchedRows.filter((r) => r.status === 'MATCHED').length;
  const unmatchedCount = matchedRows.filter((r) => r.status !== 'MATCHED').length;

  const displayRows = statusFilter === 'ALL'
    ? matchedRows
    : matchedRows.filter((r) => r.status === statusFilter);

  function handleCreateExpense(row) {
    setExpensePrefill({ date: row.dateStr, amount: String(row.debit) });
    setExpenseOpen(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>Bank Reconciliation</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-3)' }}>Import a bank statement and match transactions automatically.</p>
        </div>
        {step > 1 && (
          <button
            type="button"
            onClick={() => { setStep(1); setMatchedRows([]); setParseError(''); }}
            style={{ borderRadius: 8, padding: '8px 14px', fontSize: 13, border: '1px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--fg-3)', cursor: 'pointer' }}
          >
            ← Start over
          </button>
        )}
      </div>

      {/* ── Step indicator ── */}
      <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
        {[['1', 'Upload'], ['2', 'Confirm'], ['3', 'Results']].map(([n, label], i) => {
          const active = step === i + 1;
          const done   = step >  i + 1;
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  background: done ? 'var(--pos)' : active ? 'var(--info)' : 'var(--bg-2)',
                  color: (done || active) ? '#fff' : 'var(--fg-4)',
                  border: '1px solid ' + (done ? 'var(--pos)' : active ? 'var(--info)' : 'var(--border)'),
                }}>
                  {done ? '✓' : n}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--fg)' : done ? 'var(--pos)' : 'var(--fg-4)' }}>{label}</span>
              </div>
              {i < 2 && <div style={{ width: 40, height: 1, margin: '0 8px', background: 'var(--border)' }} />}
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 1 — Upload
          ════════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Bank account selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 400 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)' }}>Bank account to reconcile</label>
            {bankAccounts.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--warn)' }}>
                No bank accounts found.{' '}
                <button type="button" onClick={() => navigate('/accounts/banks')}
                  style={{ color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>
                  Add one first
                </button>
              </p>
            ) : (
              <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                <option value="">— Select account —</option>
                {bankAccounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.bankName} ···{a.accountLast4} — {a.holderName}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Drop zone */}
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById('recon-file-input').click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--info)' : 'var(--border-2)'}`,
              borderRadius: 12,
              padding: '48px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? 'var(--info-soft)' : 'var(--bg-2)',
              transition: 'all 0.15s',
            }}
          >
            <input
              id="recon-file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ''; }}
            />
            {parsing ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <LoadingSpinner />
                <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-3)' }}>Parsing statement…</p>
              </div>
            ) : (
              <>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, background: 'var(--info-soft)', color: 'var(--info)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
                }}>
                  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Drop your bank statement here</p>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-3)' }}>or click to browse — CSV or Excel (.xlsx, .xls)</p>
              </>
            )}
          </div>

          {parseError && (
            <div style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: 'var(--neg)' }}>
              {parseError}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 2 — Confirm columns + date range
          ════════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, background: 'var(--pos-soft)', color: 'var(--pos)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                {parsedRows.length} transactions parsed from <span style={{ fontFamily: 'monospace', color: 'var(--info)' }}>{fileName}</span>
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--fg-4)' }}>
                Review detected columns, set the reconciliation period, then run matching.
              </p>
            </div>
          </div>

          {/* Column mapping */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-4)' }}>
              Detected columns
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <ColTag label="Date"        value={colMap.date} />
              <ColTag label="Description" value={colMap.description} />
              <ColTag label="Debit"       value={colMap.debit} />
              <ColTag label="Credit"      value={colMap.credit} />
              <ColTag label="Balance"     value={colMap.balance} />
            </div>
            {(!colMap.date || (!colMap.debit && !colMap.credit)) && (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--warn)' }}>
                ⚠ Some key columns were not detected. Results may be incomplete.
              </p>
            )}
          </div>

          {/* Date range */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-4)' }}>
              Reconciliation period
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--fg-4)' }}>From</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: 'auto' }} />
              </div>
              <span style={{ color: 'var(--fg-4)', marginTop: 16 }}>→</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--fg-4)' }}>To</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: 'auto' }} />
              </div>
              <div style={{ marginTop: 16, fontSize: 12, color: 'var(--fg-4)' }}>
                {parsedRows.filter((r) => r.dateStr >= fromDate && r.dateStr <= toDate).length} rows in range
              </div>
            </div>
          </div>

          {/* Preview table */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-4)' }}>
              Preview (first 5 rows)
            </p>
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)' }}>
                    {['Date', 'Description', 'Debit', 'Credit', 'Balance'].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Date' || h === 'Description' ? 'left' : 'right', color: 'var(--fg-4)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 5).map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{fmtDate(r.dateStr)}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--fg)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: r.debit > 0 ? 'var(--neg)' : 'var(--fg-4)' }}>{r.debit > 0 ? formatCurrency(r.debit) : '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: r.credit > 0 ? 'var(--pos)' : 'var(--fg-4)' }}>{r.credit > 0 ? formatCurrency(r.credit) : '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--fg-3)', fontFamily: 'monospace' }}>{r.balance != null ? formatCurrency(r.balance) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {matchError && (
            <div style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: 'var(--neg)' }}>
              {matchError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={runReconciliation}
              disabled={matching || !fromDate || !toDate}
              style={{
                borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700,
                background: 'var(--info)', color: '#fff', border: 'none',
                cursor: matching ? 'not-allowed' : 'pointer', opacity: matching ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {matching && <LoadingSpinner size="sm" />}
              Run Reconciliation
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 3 — Results
          ════════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <SummaryCard label="Total Credits"     value={formatCurrency(totalCredits)}   color="var(--pos)" sub={`${matchedRows.filter((r) => r.credit > 0).length} entries`} />
            <SummaryCard label="Total Debits"      value={formatCurrency(totalDebits)}    color="var(--neg)" sub={`${matchedRows.filter((r) => r.debit  > 0).length} entries`} />
            <SummaryCard label="Matched"           value={matchedCount}                   color="var(--pos)" sub="transactions" />
            <SummaryCard label="Unmatched"         value={unmatchedCount}                 color={unmatchedCount > 0 ? 'var(--warn)' : 'var(--fg)'} sub="need attention" />
            <SummaryCard label="Net (Credit−Debit)" value={formatCurrency(totalCredits - totalDebits)} color={totalCredits >= totalDebits ? 'var(--pos)' : 'var(--neg)'} />
          </div>

          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['ALL', 'All'], ['MATCHED', '✓ Matched'], ['UNMATCHED_CREDIT', '⚠ Unmatched Credits'], ['UNMATCHED_DEBIT', '⚠ Unmatched Debits']].map(([val, lbl]) => (
              <button key={val} type="button" onClick={() => setStatusFilter(val)}
                style={{
                  borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid ' + (statusFilter === val ? 'var(--info)' : 'var(--border)'),
                  background: statusFilter === val ? 'var(--info-soft)' : 'var(--bg-2)',
                  color: statusFilter === val ? 'var(--info)' : 'var(--fg-3)',
                }}>
                {lbl}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-4)', display: 'flex', alignItems: 'center' }}>
              {displayRows.length} rows
            </span>
          </div>

          {/* Table */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)' }}>
                    {['Date', 'Description', 'Debit', 'Credit', 'Status', 'Matched With', 'Actions'].map((h) => (
                      <th key={h} style={{
                        padding: '10px 14px',
                        textAlign: ['Debit', 'Credit'].includes(h) ? 'right' : 'left',
                        color: 'var(--fg-4)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
                        borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--fg-4)', fontSize: 13 }}>
                        No rows for this filter.
                      </td>
                    </tr>
                  ) : displayRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: ROW_BG[row.status] ?? 'transparent' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{fmtDate(row.dateStr)}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--fg)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.description || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: row.debit > 0 ? 'var(--neg)' : 'var(--fg-4)', fontWeight: row.debit > 0 ? 600 : 400 }}>
                        {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: row.credit > 0 ? 'var(--pos)' : 'var(--fg-4)', fontWeight: row.credit > 0 ? 600 : 400 }}>
                        {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <StatusBadge status={row.status} />
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--fg-3)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.matchedWith ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {row.status === 'UNMATCHED_CREDIT' && (
                          <button type="button"
                            onClick={() => navigate('/sales/new', { state: { prefill: { date: row.dateStr } } })}
                            style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--pos)', background: 'var(--pos-soft)', color: 'var(--pos)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            + Add Sale
                          </button>
                        )}
                        {row.status === 'UNMATCHED_DEBIT' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button"
                              onClick={() => handleCreateExpense(row)}
                              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--warn)', background: 'var(--warn-soft)', color: 'var(--warn)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              + Expense
                            </button>
                            <button type="button"
                              onClick={() => navigate('/purchases/new', { state: { prefill: { date: row.dateStr } } })}
                              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--info)', background: 'var(--info-soft)', color: 'var(--info)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              + Purchase
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
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
