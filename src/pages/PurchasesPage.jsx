import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { listPurchases, PURCHASE_STATUS } from '../services/purchaseService';
import { startOfDay, endOfDay, toJsDate } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import PaymentStatusBadge from '../components/sales/PaymentStatusBadge';
import PayablePaymentModal from '../components/purchases/PayablePaymentModal';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: PURCHASE_STATUS.PAID,    label: 'Paid' },
  { value: PURCHASE_STATUS.UNPAID,  label: 'Unpaid' },
  { value: PURCHASE_STATUS.PARTIAL, label: 'Partial' },
];

function fmtDate(ts) {
  const d = toJsDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function PurchasesPage() {
  const { activeCompanyId } = useApp();

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [payTarget, setPayTarget] = useState(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const from = fromDate ? startOfDay(new Date(fromDate)) : null;
      const to   = toDate   ? endOfDay(new Date(toDate))     : null;
      const data = await listPurchases(activeCompanyId, { fromDate: from, toDate: to });
      setPurchases(data);
    } catch (err) {
      setError(err.message ?? 'Failed to load purchases.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, fromDate, toDate]);

  useEffect(() => { setPurchases([]); load(); }, [load]);

  const filtered = purchases.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (vendorSearch) {
      const name = (p.vendorSnapshot?.name ?? '').toLowerCase();
      if (!name.includes(vendorSearch.toLowerCase())) return false;
    }
    return true;
  });

  function applyPaymentToRow(updated, purchaseId) {
    setPurchases((prev) => prev.map((p) => (p.purchaseId === purchaseId ? { ...p, ...updated } : p)));
    setPayTarget(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-sm text-gray-500">All vendor bills for the active company.</p>
        </div>
        <Link to="/purchases/new"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
          + New purchase
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="search" value={vendorSearch} placeholder="Search vendor…"
          onChange={(e) => setVendorSearch(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" onClick={load}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Refresh</button>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} bills</span>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {purchases.length === 0 ? 'No purchases yet.' : 'No bills match the filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Bill #</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Vendor</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">GST input</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2">Mode</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <tr key={p.purchaseId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">{p.billNumber}</td>
                    <td className="px-4 py-2 text-gray-600">{fmtDate(p.date)}</td>
                    <td className="px-4 py-2 font-medium text-gray-800">{p.vendorSnapshot?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-800">{formatCurrency(p.grandTotal)}</td>
                    <td className="px-4 py-2 text-right text-green-700">{formatCurrency(p.totalGST)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${p.balanceDue > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                      {p.balanceDue > 0 ? formatCurrency(p.balanceDue) : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">{p.paymentMode}</td>
                    <td className="px-4 py-2"><PaymentStatusBadge status={p.status} /></td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2 text-xs">
                        <Link to={`/purchases/${p.purchaseId}`}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50">View</Link>
                        {p.status !== PURCHASE_STATUS.PAID && (
                          <button type="button" onClick={() => setPayTarget(p)}
                            className="rounded-md border border-green-300 bg-white px-2 py-1 text-green-700 hover:bg-green-50">Pay</button>
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

      <PayablePaymentModal
        open={!!payTarget}
        companyId={activeCompanyId}
        purchase={payTarget}
        onClose={() => setPayTarget(null)}
        onPaid={(updated) => applyPaymentToRow(updated, payTarget?.purchaseId)}
      />
    </div>
  );
}
