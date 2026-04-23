import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getLedgerForAccount } from '../services/journalService';
import { CHART_OF_ACCOUNTS, getAccount } from '../utils/accountConstants';
import { formatCurrency } from '../utils/format';
import { startOfDay, endOfDay, toJsDate } from '../utils/dateUtils';
import LoadingSpinner from '../components/LoadingSpinner';

function fmtDate(ts) {
  const d = toJsDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

const SOURCE_TYPE_LABEL = {
  sale:        'Sale',
  purchase:    'Purchase',
  expense:     'Expense',
  payment_in:  'Payment in',
  payment_out: 'Payment out',
  manual:      'Manual',
};

export default function LedgerPage() {
  const { accountId: paramAccountId } = useParams();
  const navigate = useNavigate();
  const { activeCompanyId } = useApp();

  const [accountId, setAccountId] = useState(paramAccountId ?? CHART_OF_ACCOUNTS[0]?.accountId ?? '');
  const [fromDate,  setFromDate]  = useState('');
  const [toDate,    setToDate]    = useState('');
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  const account = getAccount(accountId);

  // Sync URL param → state when navigating from Accounts page
  useEffect(() => {
    if (paramAccountId && paramAccountId !== accountId) {
      setAccountId(paramAccountId);
    }
  }, [paramAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!activeCompanyId || !accountId) return;
    setLoading(true);
    setError(null);
    try {
      const from = fromDate ? startOfDay(new Date(fromDate)) : null;
      const to   = toDate   ? endOfDay(new Date(toDate))     : null;
      const data = await getLedgerForAccount(activeCompanyId, accountId, { fromDate: from, toDate: to });
      setRows(data);
    } catch (err) {
      setError(err.message ?? 'Failed to load ledger.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, accountId, fromDate, toDate]);

  useEffect(() => { setRows([]); load(); }, [load]);

  function handleAccountChange(e) {
    const id = e.target.value;
    setAccountId(id);
    navigate(`/ledger/${id}`, { replace: true });
  }

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Ledger</h1>
          <p className="text-sm text-gray-500">Transaction history with running balance for a selected account.</p>
        </div>
        <Link to="/accounts" className="text-sm text-gray-500 hover:text-gray-700">← Chart of accounts</Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <select value={accountId} onChange={handleAccountChange}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500">
          {CHART_OF_ACCOUNTS.map((a) => (
            <option key={a.accountId} value={a.accountId}>{a.name}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">from</span>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" onClick={load}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Refresh</button>
        <span className="ml-auto text-xs text-gray-400">{rows.length} entries</span>
      </div>

      {/* Account summary strip */}
      {account && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Account',        value: account.name },
            { label: 'Type',           value: account.type.charAt(0).toUpperCase() + account.type.slice(1) },
            { label: 'Total debits',   value: formatCurrency(totalDebit) },
            { label: 'Total credits',  value: formatCurrency(totalCredit) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="mt-0.5 font-semibold text-gray-900 truncate">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Ledger table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            No transactions for this account{fromDate || toDate ? ' in the selected period' : ''}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Ref</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <tr key={`${row.entryId}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap text-gray-600">{fmtDate(row.date)}</td>
                    <td className="px-4 py-2 text-gray-800">{row.description}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{row.sourceRef ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {SOURCE_TYPE_LABEL[row.sourceType] ?? row.sourceType}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-blue-700">
                      {row.debit > 0 ? formatCurrency(row.debit) : ''}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-red-600">
                      {row.credit > 0 ? formatCurrency(row.credit) : ''}
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${row.runningBalance >= 0 ? 'text-gray-800' : 'text-red-700'}`}>
                      {formatCurrency(Math.abs(row.runningBalance))}
                      {row.runningBalance < 0 && <span className="ml-1 text-xs font-normal text-red-500">Cr</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Totals</td>
                  <td className="px-4 py-2 text-right font-bold text-blue-700">{formatCurrency(totalDebit)}</td>
                  <td className="px-4 py-2 text-right font-bold text-red-600">{formatCurrency(totalCredit)}</td>
                  <td className={`px-4 py-2 text-right font-bold ${finalBalance >= 0 ? 'text-gray-900' : 'text-red-700'}`}>
                    {formatCurrency(Math.abs(finalBalance))}
                    {finalBalance < 0 && <span className="ml-1 text-xs font-normal">Cr</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
