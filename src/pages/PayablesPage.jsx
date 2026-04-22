import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { listOutstandingPayables, PURCHASE_STATUS } from '../services/purchaseService';
import { formatCurrency } from '../utils/format';
import { toJsDate } from '../utils/dateUtils';
import LoadingSpinner from '../components/LoadingSpinner';
import PaymentStatusBadge from '../components/sales/PaymentStatusBadge';
import PayablePaymentModal from '../components/purchases/PayablePaymentModal';

function fmtDate(ts) {
  const d = toJsDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function PayablesPage() {
  const { activeCompanyId } = useApp();

  const [payables, setPayables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payTarget, setPayTarget] = useState(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listOutstandingPayables(activeCompanyId);
      setPayables(data);
    } catch (err) {
      setError(err.message ?? 'Failed to load payables.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { setPayables([]); load(); }, [load]);

  const totalDue = payables.reduce((s, p) => s + (Number(p.balanceDue) || 0), 0);

  function handlePaid(updated, purchaseId) {
    if (updated.status === PURCHASE_STATUS.PAID) {
      setPayables((prev) => prev.filter((p) => p.purchaseId !== purchaseId));
    } else {
      setPayables((prev) => prev.map((p) => (p.purchaseId === purchaseId ? { ...p, ...updated } : p)));
    }
    setPayTarget(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Outstanding Payables</h1>
          <p className="text-sm text-gray-500">Vendor bills with a remaining balance due.</p>
        </div>
        <button type="button" onClick={load}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          Refresh
        </button>
      </div>

      {payables.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm text-amber-700">
            <span className="font-semibold">{payables.length} bill{payables.length !== 1 ? 's' : ''}</span> with outstanding balance —{' '}
            Total due: <span className="font-bold text-red-700">{formatCurrency(totalDue)}</span>
          </p>
        </div>
      )}

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
        ) : payables.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm font-medium text-gray-500">No outstanding payables</p>
            <p className="mt-1 text-xs text-gray-400">All vendor bills are settled.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Bill #</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Due date</th>
                  <th className="px-4 py-2">Vendor</th>
                  <th className="px-4 py-2 text-right">Grand total</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Balance due</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payables.map((p) => {
                  const isOverdue = p.dueDate && toJsDate(p.dueDate) < new Date();
                  return (
                    <tr key={p.purchaseId} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{p.billNumber}</td>
                      <td className="px-4 py-2 text-gray-600">{fmtDate(p.date)}</td>
                      <td className={`px-4 py-2 text-xs ${isOverdue ? 'font-semibold text-red-600' : 'text-gray-600'}`}>
                        {p.dueDate ? fmtDate(p.dueDate) : '—'}
                        {isOverdue && <span className="ml-1 text-red-500">Overdue</span>}
                      </td>
                      <td className="px-4 py-2 font-medium text-gray-800">{p.vendorSnapshot?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(p.grandTotal)}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{formatCurrency(p.paidAmount)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-red-700">{formatCurrency(p.balanceDue)}</td>
                      <td className="px-4 py-2"><PaymentStatusBadge status={p.status} /></td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-2 text-xs">
                          <Link to={`/purchases/${p.purchaseId}`}
                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50">View</Link>
                          <button type="button" onClick={() => setPayTarget(p)}
                            className="rounded-md border border-green-300 bg-white px-2 py-1 text-green-700 hover:bg-green-50">Pay</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={6} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Total outstanding
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-red-700">{formatCurrency(totalDue)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <PayablePaymentModal
        open={!!payTarget}
        companyId={activeCompanyId}
        purchase={payTarget}
        onClose={() => setPayTarget(null)}
        onPaid={(updated) => handlePaid(updated, payTarget?.purchaseId)}
      />
    </div>
  );
}
