import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useRole } from '../../hooks/useRole';
import { listDeletionLogs } from '../../services/deletionLogService';
import { startOfDay, endOfDay } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';

function fmtTimestamp(ts) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtOriginal(raw) {
  try   { return JSON.stringify(JSON.parse(raw), null, 2); }
  catch { return raw ?? ''; }
}

function TypeCell({ log }) {
  const base = log.recordType === 'sale'
    ? 'bg-blue-50 text-blue-700'
    : 'bg-purple-50 text-purple-700';
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${base}`}>
        {log.recordType === 'sale' ? 'Sale' : 'Purchase'}
      </span>
      {log.isBulk && (
        <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
          BULK ×{log.recordCount}
        </span>
      )}
    </div>
  );
}

export default function DeletionLogsPage() {
  const { activeCompanyId } = useApp();
  const { isAdmin }         = useRole();

  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const [fromDate,    setFromDate]    = useState('');
  const [toDate,      setToDate]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [userFilter,  setUserFilter]  = useState('');

  const [viewLog,     setViewLog]     = useState(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      setLogs(await listDeletionLogs(activeCompanyId));
    } catch (err) {
      setError(err.message ?? 'Failed to load deletion logs.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-10 text-center">
        <p className="font-semibold text-red-700">Access Denied</p>
        <p className="mt-1 text-sm text-red-600">Only admins can view the deletion audit trail.</p>
      </div>
    );
  }

  const filtered = logs.filter((l) => {
    if (typeFilter && l.recordType !== typeFilter) return false;
    const who = (l.deletedBy?.name ?? l.deletedBy?.email ?? '').toLowerCase();
    if (userFilter && !who.includes(userFilter.toLowerCase())) return false;
    if (fromDate || toDate) {
      const d = l.deletedAt?.toDate?.() ?? new Date(l.deletedAt);
      if (fromDate && d < startOfDay(new Date(fromDate))) return false;
      if (toDate   && d > endOfDay(new Date(toDate)))     return false;
    }
    return true;
  });

  const deletors = [
    ...new Set(
      logs
        .map((l) => l.deletedBy?.name ?? l.deletedBy?.email)
        .filter(Boolean),
    ),
  ];

  const modalTitle = viewLog?.isBulk
    ? `Bulk Deletion — ${viewLog.recordCount} Records`
    : `Original Record — ${viewLog?.invoiceNumber ?? ''}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Deletion Audit Trail</h1>
        <p className="text-sm text-gray-500">
          Complete log of all deleted sales and purchase records — view-only, cannot restore from here.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All types</option>
          <option value="sale">Sales</option>
          <option value="purchase">Purchases</option>
        </select>
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All admins</option>
          {deletors.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button type="button" onClick={load}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          Refresh
        </button>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} records</span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {logs.length === 0
              ? 'No deletion logs yet.'
              : 'No logs match the current filters.'}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 whitespace-nowrap">Date Deleted</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Invoice #</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Deleted By</th>
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2">Notes</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((log) => (
                <tr key={log.logId} className={`hover:bg-gray-50 ${log.isBulk ? 'bg-orange-50/40' : ''}`}>
                  <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                    {fmtTimestamp(log.deletedAt)}
                  </td>
                  <td className="px-4 py-2">
                    <TypeCell log={log} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-700 max-w-[180px]">
                    <span className="block truncate" title={log.isBulk ? (log.invoiceNumbers ?? []).join(', ') : log.invoiceNumber}>
                      {log.invoiceNumber}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-800">
                    {formatCurrency(log.amount)}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-700">
                    {log.deletedBy?.name ?? log.deletedBy?.email ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">{log.reason}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 max-w-[160px]">
                    <span className="truncate block" title={log.notes}>
                      {log.notes || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setViewLog(log)}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                    >
                      {log.isBulk ? 'View All Records' : 'View Original'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail modal */}
      <Modal
        open={!!viewLog}
        title={modalTitle}
        onClose={() => setViewLog(null)}
        size="lg"
      >
        {viewLog && (
          <div className="space-y-4">
            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Deleted at</p>
                <p className="font-medium">{fmtTimestamp(viewLog.deletedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Deleted by</p>
                <p className="font-medium">
                  {viewLog.deletedBy?.name ?? viewLog.deletedBy?.email}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Reason</p>
                <p className="font-medium">{viewLog.reason}</p>
              </div>
              {viewLog.isBulk && (
                <div>
                  <p className="text-xs text-gray-500">Records deleted</p>
                  <p className="font-medium">{viewLog.recordCount}</p>
                </div>
              )}
              {viewLog.notes && (
                <div>
                  <p className="text-xs text-gray-500">Notes</p>
                  <p className="font-medium">{viewLog.notes}</p>
                </div>
              )}
            </div>

            {/* Bulk: list all invoice numbers */}
            {viewLog.isBulk && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Deleted {viewLog.recordType === 'sale' ? 'Invoice' : 'Bill'} Numbers ({viewLog.recordCount})
                </p>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-0.5">
                  {(viewLog.invoiceNumbers ?? []).map((inv, i) => (
                    <p key={i} className="font-mono text-xs text-gray-700">{inv}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Full original JSON */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {viewLog.isBulk ? 'All Original Records (JSON)' : 'Full Original Record'}
              </p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700">
                {fmtOriginal(viewLog.originalData)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
