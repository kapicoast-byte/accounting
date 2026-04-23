import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { listJournalEntries } from '../services/journalService';
import { formatCurrency } from '../utils/format';
import { startOfDay, endOfDay, toJsDate } from '../utils/dateUtils';
import LoadingSpinner from '../components/LoadingSpinner';

function fmtDate(ts) {
  const d = toJsDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

const SOURCE_LABELS = {
  sale:        { label: 'Sale',        color: 'bg-green-100 text-green-700'  },
  purchase:    { label: 'Purchase',    color: 'bg-blue-100  text-blue-700'   },
  expense:     { label: 'Expense',     color: 'bg-amber-100 text-amber-700'  },
  payment_in:  { label: 'Payment in',  color: 'bg-teal-100  text-teal-700'   },
  payment_out: { label: 'Payment out', color: 'bg-rose-100  text-rose-700'   },
  manual:      { label: 'Manual',      color: 'bg-gray-100  text-gray-600'   },
};

export default function JournalPage() {
  const { activeCompanyId } = useApp();

  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [expanded, setExpanded] = useState(new Set());

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const from = fromDate ? startOfDay(new Date(fromDate)) : null;
      const to   = toDate   ? endOfDay(new Date(toDate))     : null;
      const data = await listJournalEntries(activeCompanyId, { fromDate: from, toDate: to });
      setEntries(data);
      setExpanded(new Set());
    } catch (err) {
      setError(err.message ?? 'Failed to load journal entries.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, fromDate, toDate]);

  useEffect(() => { setEntries([]); load(); }, [load]);

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function expandAll()   { setExpanded(new Set(entries.map((e) => e.entryId))); }
  function collapseAll() { setExpanded(new Set()); }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journal Entries</h1>
          <p className="text-sm text-gray-500">All double-entry postings auto-generated from sales, purchases, and expenses.</p>
        </div>
        <Link to="/accounts" className="text-sm text-gray-500 hover:text-gray-700">← Chart of accounts</Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" onClick={load}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Refresh</button>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={expandAll}   className="text-xs text-blue-600 hover:underline">Expand all</button>
          <button type="button" onClick={collapseAll} className="text-xs text-gray-500 hover:underline">Collapse all</button>
          <span className="text-xs text-gray-400">{entries.length} entries</span>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            No journal entries yet. They are created automatically when you record sales, purchases, and expenses.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => {
              const isOpen  = expanded.has(entry.entryId);
              const srcInfo = SOURCE_LABELS[entry.sourceType] ?? SOURCE_LABELS.manual;
              return (
                <div key={entry.entryId}>
                  {/* Entry header row */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(entry.entryId)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="w-24 shrink-0 text-sm text-gray-500">{fmtDate(entry.date)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${srcInfo.color}`}>
                        {srcInfo.label}
                      </span>
                      {entry.sourceRef && (
                        <span className="font-mono text-xs text-gray-500">{entry.sourceRef}</span>
                      )}
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{entry.description}</span>
                      <span className="shrink-0 text-xs text-gray-400">
                        {formatCurrency(entry.totalDebit)}
                      </span>
                      <span className="shrink-0 text-gray-300">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Expanded lines */}
                  {isOpen && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 pb-3 pt-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs uppercase tracking-wide text-gray-400">
                            <th className="pb-1 text-left font-medium">Account</th>
                            <th className="pb-1 text-right font-medium">Debit</th>
                            <th className="pb-1 text-right font-medium">Credit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(entry.lines ?? []).map((line, i) => (
                            <tr key={i}>
                              <td className="py-1">
                                <Link
                                  to={`/ledger/${line.accountId}`}
                                  className="text-blue-600 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {line.accountName}
                                </Link>
                              </td>
                              <td className="py-1 text-right font-medium text-blue-700">
                                {line.debit > 0 ? formatCurrency(line.debit) : ''}
                              </td>
                              <td className="py-1 text-right font-medium text-red-600">
                                {line.credit > 0 ? formatCurrency(line.credit) : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t border-gray-200">
                          <tr className="text-xs font-semibold text-gray-600">
                            <td className="pt-1">Total</td>
                            <td className="pt-1 text-right">{formatCurrency(entry.totalDebit)}</td>
                            <td className="pt-1 text-right">{formatCurrency(entry.totalCredit)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
