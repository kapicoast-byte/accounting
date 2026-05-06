import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useRole } from '../hooks/useRole';
import { listPurchases, PURCHASE_STATUS } from '../services/purchaseService';
import { startOfDay, endOfDay, toJsDate } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import RoleGuard from '../components/RoleGuard';
import FilterBar from '../components/FilterBar';
import PaymentStatusBadge from '../components/sales/PaymentStatusBadge';
import PayablePaymentModal from '../components/purchases/PayablePaymentModal';
import DeleteRecordModal from '../components/DeleteRecordModal';
import BulkDeleteModal from '../components/BulkDeleteModal';
import PurchaseImportModal from '../components/purchases/PurchaseImportModal';

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
  const { activeCompanyId, user } = useApp();
  const { isAdmin } = useRole();

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [payTarget,      setPayTarget]      = useState(null);
  const [deleteTarget,   setDeleteTarget]   = useState(null);
  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [importOpen,     setImportOpen]     = useState(false);

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

  const selectedRecords     = filtered.filter((p) => selectedIds.has(p.purchaseId));
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.purchaseId));

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.purchaseId));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.add(p.purchaseId));
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-sm text-gray-500">All vendor bills for the active company.</p>
        </div>
        <RoleGuard permission="edit">
          <div className="flex gap-2">
            <button type="button" onClick={() => setImportOpen(true)}
              className="rounded-md px-3 py-1.5 text-sm font-semibold transition"
              style={{ background: 'var(--pos-soft)', border: '1px solid var(--pos)', color: 'var(--pos)' }}>
              ↑ Import Purchases
            </button>
            <Link to="/purchases/new"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
              + New purchase
            </Link>
          </div>
        </RoleGuard>
      </div>

      <FilterBar
        fromDate={fromDate} onFromDate={setFromDate}
        toDate={toDate}     onToDate={setToDate}
        search={vendorSearch} onSearch={setVendorSearch} searchPlaceholder="Search vendor…"
        selects={[{ value: statusFilter, onChange: setStatusFilter, options: STATUS_OPTIONS }]}
        onRefresh={load}
        count={`${filtered.length} bills`}
      />

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Bulk action bar */}
      {isAdmin && selectedRecords.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-sm font-medium text-red-800">
            {selectedRecords.length} {selectedRecords.length === 1 ? 'record' : 'records'} selected
          </span>
          <button type="button" onClick={() => setBulkDeleteOpen(true)}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition">
            Delete Selected
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 transition">
            Clear Selection
          </button>
        </div>
      )}

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
                  {isAdmin && (
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-gray-400 accent-red-600"
                      />
                    </th>
                  )}
                  <th className="px-4 py-2">Bill #</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Vendor</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">GST input</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2">Mode</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 w-6" title="Bill scan"></th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <tr key={p.purchaseId} className={`hover:bg-gray-50 ${selectedIds.has(p.purchaseId) ? 'bg-red-50' : ''}`}>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.purchaseId)}
                          onChange={() => toggleSelect(p.purchaseId)}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-400 accent-red-600"
                        />
                      </td>
                    )}
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
                      {p.billImageUrl && (
                        <button
                          type="button"
                          title="View scanned bill"
                          onClick={() => window.open(p.billImageUrl, '_blank')}
                          className="rounded p-1 transition hover:opacity-70"
                          style={{ color: 'var(--info)' }}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                          </svg>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2 text-xs">
                        <Link to={`/purchases/${p.purchaseId}`}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50">View</Link>
                        {p.status !== PURCHASE_STATUS.PAID && (
                          <button type="button" onClick={() => setPayTarget(p)}
                            className="rounded-md border border-green-300 bg-white px-2 py-1 text-green-700 hover:bg-green-50">Pay</button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            title="Delete record"
                            className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-red-600 hover:bg-red-50"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            Delete
                          </button>
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

      <DeleteRecordModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          setPurchases((prev) => prev.filter((p) => p.purchaseId !== id));
          setDeleteTarget(null);
        }}
        companyId={activeCompanyId}
        record={deleteTarget}
        recordType="purchase"
        user={user}
      />

      <BulkDeleteModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onDeleted={(ids) => {
          setPurchases((prev) => prev.filter((p) => !ids.includes(p.purchaseId)));
          setSelectedIds(new Set());
          setBulkDeleteOpen(false);
        }}
        companyId={activeCompanyId}
        records={selectedRecords}
        recordType="purchase"
        user={user}
      />

      <PurchaseImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        companyId={activeCompanyId}
        onImported={load}
      />
    </div>
  );
}
