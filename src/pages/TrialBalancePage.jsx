import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { computeTrialBalance } from '../services/journalService';
import { ACCOUNT_TYPE_LABEL } from '../utils/accountConstants';
import { formatCurrency } from '../utils/format';
import { startOfDay, endOfDay } from '../utils/dateUtils';
import LoadingSpinner from '../components/LoadingSpinner';

const TYPE_HEADING_COLOR = {
  asset:     'bg-blue-50  text-blue-800',
  liability: 'bg-red-50   text-red-800',
  income:    'bg-green-50 text-green-800',
  expense:   'bg-amber-50 text-amber-800',
};

export default function TrialBalancePage() {
  const { activeCompanyId, activeCompany } = useApp();

  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const from = fromDate ? startOfDay(new Date(fromDate)) : null;
      const to   = toDate   ? endOfDay(new Date(toDate))     : null;
      const data = await computeTrialBalance(activeCompanyId, { fromDate: from, toDate: to });
      setResult(data);
    } catch (err) {
      setError(err.message ?? 'Failed to compute trial balance.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  // Group rows by account type for sectioned display
  const sections = result
    ? Object.entries(ACCOUNT_TYPE_LABEL).map(([type, label]) => ({
        type,
        label,
        rows: result.rows.filter((r) => r.accountType === type),
      })).filter((s) => s.rows.length > 0)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trial Balance</h1>
          <p className="text-sm text-gray-500">
            All accounts with debit and credit totals. Total debits must equal total credits.
          </p>
        </div>
        <Link to="/accounts" className="text-sm text-gray-500 hover:text-gray-700">← Chart of accounts</Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <span className="text-xs text-gray-500">Period:</span>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" onClick={load}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Refresh</button>
        {!fromDate && !toDate && (
          <span className="text-xs text-gray-400">All time</span>
        )}
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>
      ) : !result || result.rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-16 text-center text-sm text-gray-400">
          No journal entries found. Record sales, purchases, or expenses to see the trial balance.
        </div>
      ) : (
        <>
          {/* Balance status banner */}
          <div className={`rounded-xl border px-5 py-3 text-sm font-medium ${
            result.balanced
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200   bg-red-50   text-red-800'
          }`}>
            {result.balanced
              ? '✓ Trial balance is balanced — total debits equal total credits.'
              : `✗ Out of balance by ${formatCurrency(Math.abs(result.totalDebit - result.totalCredit))}. Check for missing entries.`
            }
          </div>

          {/* Report header */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-6 py-4 text-center">
              <p className="text-base font-bold text-gray-900">{activeCompany?.companyName ?? 'Company'}</p>
              <p className="text-sm font-semibold text-gray-600">Trial Balance</p>
              {(fromDate || toDate) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {fromDate && toDate
                    ? `${fromDate} to ${toDate}`
                    : fromDate ? `From ${fromDate}` : `Up to ${toDate}`}
                </p>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-6 py-2 text-left">Account</th>
                    <th className="px-6 py-2 text-right">Debit (Dr)</th>
                    <th className="px-6 py-2 text-right">Credit (Cr)</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(({ type, label, rows }) => (
                    <>
                      {/* Section heading */}
                      <tr key={`hd-${type}`}>
                        <td colSpan={3}
                          className={`px-6 py-1.5 text-xs font-bold uppercase tracking-widest ${TYPE_HEADING_COLOR[type] ?? 'bg-gray-50 text-gray-600'}`}>
                          {label}
                        </td>
                      </tr>
                      {rows.map((row) => (
                        <tr key={row.accountId} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-6 py-2">
                            <Link to={`/ledger/${row.accountId}`} className="text-blue-600 hover:underline">
                              {row.accountName}
                            </Link>
                          </td>
                          <td className="px-6 py-2 text-right font-medium text-blue-700">
                            {row.balanceDebit > 0 ? formatCurrency(row.balanceDebit) : ''}
                          </td>
                          <td className="px-6 py-2 text-right font-medium text-red-600">
                            {row.balanceCredit > 0 ? formatCurrency(row.balanceCredit) : ''}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-400 bg-gray-100">
                    <td className="px-6 py-3 text-sm font-bold text-gray-900 uppercase tracking-wide">Total</td>
                    <td className="px-6 py-3 text-right text-base font-bold text-blue-700">
                      {formatCurrency(result.totalDebit)}
                    </td>
                    <td className="px-6 py-3 text-right text-base font-bold text-red-600">
                      {formatCurrency(result.totalCredit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
