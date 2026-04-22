import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getPurchase, PURCHASE_STATUS } from '../services/purchaseService';
import { formatCurrency } from '../utils/format';
import { toJsDate } from '../utils/dateUtils';
import LoadingSpinner from '../components/LoadingSpinner';
import PaymentStatusBadge from '../components/sales/PaymentStatusBadge';
import PayablePaymentModal from '../components/purchases/PayablePaymentModal';

function fmtDate(ts) {
  const d = toJsDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function ViewPurchasePage() {
  const { purchaseId } = useParams();
  const { activeCompanyId, activeCompany } = useApp();

  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompanyId || !purchaseId) return;
    setLoading(true);
    try {
      const data = await getPurchase(activeCompanyId, purchaseId);
      setPurchase(data ?? null);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, purchaseId]);

  useEffect(() => { load(); }, [load]);

  function handlePaid(updated) {
    setPurchase((prev) => ({ ...prev, ...updated }));
    setPayOpen(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  if (!purchase) return (
    <div className="py-20 text-center text-sm text-gray-500">
      Purchase bill not found. <Link to="/purchases" className="text-blue-600 hover:underline">Back to purchases</Link>
    </div>
  );

  const vendor = purchase.vendorSnapshot ?? {};
  const hasBalance = purchase.balanceDue > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/purchases" className="text-sm text-gray-500 hover:text-gray-700">← Purchases</Link>
        <div className="flex items-center gap-3">
          <PaymentStatusBadge status={purchase.status} />
          {purchase.status !== PURCHASE_STATUS.PAID && (
            <button type="button" onClick={() => setPayOpen(true)}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700">
              Pay vendor
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{purchase.billNumber}</h1>
            {purchase.vendorBillNumber && (
              <p className="text-sm text-gray-500">Vendor bill: {purchase.vendorBillNumber}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">Date: {fmtDate(purchase.date)}</p>
            {purchase.dueDate && (
              <p className="text-sm text-gray-500">Due: {fmtDate(purchase.dueDate)}</p>
            )}
            <p className="text-sm text-gray-500">Mode: {purchase.paymentMode}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Company</p>
            <p className="font-semibold text-gray-800">{activeCompany?.companyName ?? '—'}</p>
            {activeCompany?.GSTIN && <p className="text-xs text-gray-500">GSTIN: {activeCompany.GSTIN}</p>}
          </div>
        </div>

        {/* Vendor info */}
        <div className="mb-6 rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <p className="font-semibold uppercase tracking-wide text-xs text-gray-400 mb-1">Vendor</p>
          <p className="font-medium text-gray-800">{vendor.name || '—'}</p>
          {vendor.phone && <p className="text-gray-600">{vendor.phone}</p>}
          {vendor.address && <p className="text-gray-600">{vendor.address}</p>}
          {vendor.GSTIN && <p className="text-gray-600">GSTIN: {vendor.GSTIN}</p>}
        </div>

        {/* Line items */}
        <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">GST %</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2 text-right">GST in</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(purchase.lineItems ?? []).map((line, i) => {
                const sub = line.lineSubtotal ?? (line.quantity * line.unitPrice);
                const gst = line.lineGST ?? ((sub * line.gstRate) / 100);
                const total = sub + gst;
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{line.itemName}</td>
                    <td className="px-3 py-2 text-gray-600">{line.unit}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{line.quantity}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(line.unitPrice)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{line.gstRate}%</td>
                    <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(sub)}</td>
                    <td className="px-3 py-2 text-right text-green-700">{formatCurrency(gst)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatCurrency(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <dl className="w-72 text-sm">
            <div className="flex justify-between border-b border-gray-100 py-1.5">
              <dt className="text-gray-500">Subtotal</dt>
              <dd className="font-medium text-gray-800">{formatCurrency(purchase.subtotal)}</dd>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-1.5">
              <dt className="text-gray-500">GST input credit</dt>
              <dd className="font-medium text-green-700">{formatCurrency(purchase.totalGST)}</dd>
            </div>
            {purchase.discountAmount > 0 && (
              <div className="flex justify-between border-b border-gray-100 py-1.5">
                <dt className="text-gray-500">Discount</dt>
                <dd className="font-medium text-red-600">− {formatCurrency(purchase.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between py-2 text-base">
              <dt className="font-bold text-gray-900">Grand Total</dt>
              <dd className="font-bold text-blue-700">{formatCurrency(purchase.grandTotal)}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-100 py-1.5 text-xs text-gray-500">
              <dt>Paid</dt>
              <dd className="font-medium text-gray-700">{formatCurrency(purchase.paidAmount)}</dd>
            </div>
            {hasBalance && (
              <div className="flex justify-between py-1.5 text-sm">
                <dt className="font-semibold text-amber-700">Balance due</dt>
                <dd className="font-bold text-red-700">{formatCurrency(purchase.balanceDue)}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Notes */}
        {purchase.notes && (
          <div className="mt-6 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
            <span className="font-medium">Notes: </span>{purchase.notes}
          </div>
        )}
      </div>

      <PayablePaymentModal
        open={payOpen}
        companyId={activeCompanyId}
        purchase={purchase}
        onClose={() => setPayOpen(false)}
        onPaid={handlePaid}
      />
    </div>
  );
}
