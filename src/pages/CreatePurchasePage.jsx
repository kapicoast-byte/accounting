import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { listVendors } from '../services/vendorService';
import { listInventoryItems } from '../services/inventoryService';
import { createPurchase, computePurchaseTotals, PURCHASE_PAYMENT_MODES } from '../services/purchaseService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import FormField from '../components/FormField';
import VendorSelector from '../components/purchases/VendorSelector';
import PurchaseLineItemEditor, { newPurchaseLineItem } from '../components/purchases/PurchaseLineItemEditor';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function futureStr(days = 30) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function CreatePurchasePage() {
  const navigate = useNavigate();
  const { activeCompanyId, taxLabel } = useApp();

  const [vendors, setVendors] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [vendor, setVendor] = useState(null);
  const [vendorBillNumber, setVendorBillNumber] = useState('');
  const [billDate, setBillDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(futureStr());
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState([newPurchaseLineItem()]);
  const [discountType, setDiscountType] = useState('flat');
  const [discountValue, setDiscountValue] = useState('0');

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoadingData(true);
    try {
      const [v, inv] = await Promise.all([
        listVendors(activeCompanyId),
        listInventoryItems(activeCompanyId),
      ]);
      setVendors(v);
      setInventoryItems(inv.filter((i) => i.isActive !== false));
    } finally {
      setLoadingData(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(
    () => computePurchaseTotals({ lineItems, discountType, discountValue }),
    [lineItems, discountType, discountValue],
  );

  const isCredit = paymentMode === 'Credit';

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');

    if (!vendor) {
      setServerError('Select or add a vendor.');
      return;
    }
    const valid = lineItems.every((l) => l.itemId && (l.itemId === 'custom' ? l.itemName?.trim() : true) && Number(l.quantity) > 0 && Number(l.unitPrice) >= 0);
    if (!valid) {
      setServerError('Fill in all line items (select item, quantity, cost).');
      return;
    }
    if (totals.grandTotal <= 0) {
      setServerError('Grand total must be greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      const { purchaseId } = await createPurchase(activeCompanyId, {
        vendor,
        lineItems,
        discountType,
        discountValue,
        paymentMode,
        date: billDate,
        dueDate: isCredit ? dueDate : null,
        notes,
        vendorBillNumber,
      });
      navigate(`/purchases/${purchaseId}`, { replace: true });
    } catch (err) {
      setServerError(err.message ?? 'Failed to record purchase.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingData) return (
    <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Purchase</h1>
          <p className="text-sm text-gray-500">Bill number will be auto-generated on save. Inventory will be increased automatically.</p>
        </div>
        <Link to="/purchases" className="text-sm text-gray-500 hover:text-gray-700">← Back to purchases</Link>
      </div>

      {serverError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
          <VendorSelector
            companyId={activeCompanyId}
            vendors={vendors}
            value={vendor}
            onChange={setVendor}
          />

          <FormField label="Vendor bill number (optional)"
            id="vendorBillNumber" name="vendorBillNumber"
            value={vendorBillNumber}
            onChange={(e) => setVendorBillNumber(e.target.value)}
            placeholder="From vendor's invoice" />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Bill date</label>
            <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Payment mode</label>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
              {PURCHASE_PAYMENT_MODES.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="paymentMode" value={m}
                    checked={paymentMode === m} onChange={() => setPaymentMode(m)} />
                  {m}
                </label>
              ))}
            </div>
          </div>

          {isCredit && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                min={billDate}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-amber-600">Credit — full amount will become outstanding payable.</p>
            </div>
          )}

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Items purchased</h2>
          </div>
          <PurchaseLineItemEditor
            items={lineItems}
            inventoryItems={inventoryItems}
            onChange={setLineItems}
          />
          <button type="button"
            onClick={() => setLineItems((prev) => [...prev, newPurchaseLineItem()])}
            className="mt-3 text-sm text-blue-600 hover:text-blue-500">+ Add line item</button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col items-end gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">Discount</label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="flat">Flat (fixed)</option>
                <option value="percent">Percent (%)</option>
              </select>
              <input type="number" min="0" step="0.01" value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-24 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <dl className="w-72 text-sm">
              <div className="flex justify-between border-b border-gray-100 py-1">
                <dt className="text-gray-500">Subtotal</dt>
                <dd className="font-medium">{formatCurrency(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-1">
                <dt className="text-gray-500">{taxLabel ?? 'Tax'} input credit</dt>
                <dd className="text-green-700">{formatCurrency(totals.totalGST)}</dd>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between border-b border-gray-100 py-1">
                  <dt className="text-gray-500">Discount</dt>
                  <dd className="text-red-600">− {formatCurrency(totals.discountAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between pt-2 text-base">
                <dt className="font-bold text-gray-900">Grand Total</dt>
                <dd className="font-bold text-blue-700">{formatCurrency(totals.grandTotal)}</dd>
              </div>
              {isCredit && (
                <div className="flex justify-between pt-1 text-xs text-amber-700">
                  <dt>Outstanding payable</dt>
                  <dd className="font-semibold">{formatCurrency(totals.grandTotal)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link to="/purchases"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</Link>
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {submitting && <LoadingSpinner size="sm" />}
            {submitting ? 'Saving…' : 'Save purchase'}
          </button>
        </div>
      </form>
    </div>
  );
}
