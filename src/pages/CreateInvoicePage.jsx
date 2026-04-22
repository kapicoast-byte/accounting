import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { listCustomers } from '../services/customerService';
import { listInventoryItems } from '../services/inventoryService';
import { createSale, computeInvoiceTotals, PAYMENT_MODES } from '../services/saleService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import CustomerSelector from '../components/sales/CustomerSelector';
import LineItemEditor, { newLineItem } from '../components/sales/LineItemEditor';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function futureDateStr(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function CreateInvoicePage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useApp();

  const [customers, setCustomers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [customer, setCustomer] = useState(null);
  const [invoiceDate, setInvoiceDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(futureDateStr());
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState([newLineItem()]);
  const [discountType, setDiscountType] = useState('flat');
  const [discountValue, setDiscountValue] = useState('0');

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoadingData(true);
    try {
      const [c, inv] = await Promise.all([
        listCustomers(activeCompanyId),
        listInventoryItems(activeCompanyId),
      ]);
      setCustomers(c);
      setInventoryItems(inv.filter((i) => i.isActive !== false));
    } finally {
      setLoadingData(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(
    () => computeInvoiceTotals({ lineItems, discountType, discountValue }),
    [lineItems, discountType, discountValue],
  );

  const isCredit = paymentMode === 'Credit';

  async function handleSubmit(e) {
    e.preventDefault();

    // Basic validation
    const hasItems = lineItems.every((l) => {
      const name = l.itemId === 'custom' ? l.itemName : l.itemName;
      return name && Number(l.quantity) > 0 && Number(l.unitPrice) >= 0;
    });
    if (!hasItems) {
      setServerError('Fill in all line items (name, quantity, price).');
      return;
    }
    if (lineItems.some((l) => !l.itemId)) {
      setServerError('Select an item for every line, or choose "Custom item".');
      return;
    }
    if (totals.grandTotal <= 0) {
      setServerError('Grand total must be greater than zero.');
      return;
    }

    setSubmitting(true);
    setServerError('');
    try {
      const { saleId } = await createSale(activeCompanyId, {
        customer: customer ?? { name: 'Walk-in customer', phone: '', address: '', GSTIN: '' },
        lineItems,
        discountType,
        discountValue,
        paymentMode,
        date: invoiceDate,
        dueDate: isCredit ? dueDate : null,
        notes,
      });
      navigate(`/sales/${saleId}`, { replace: true });
    } catch (err) {
      setServerError(err.message ?? 'Failed to create invoice.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingData) return (
    <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Invoice</h1>
          <p className="text-sm text-gray-500">Invoice number will be auto-generated on save.</p>
        </div>
        <Link to="/sales" className="text-sm text-gray-500 hover:text-gray-700">← Back to sales</Link>
      </div>

      {serverError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/* Invoice meta + Customer */}
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
          <CustomerSelector
            companyId={activeCompanyId}
            customers={customers}
            value={customer}
            onChange={setCustomer}
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Invoice date</label>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Payment mode</label>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
              {PAYMENT_MODES.map((m) => (
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
                min={invoiceDate}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-amber-600">Credit — full amount will be outstanding.</p>
            </div>
          )}

          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Line items</h2>
          </div>
          <LineItemEditor
            items={lineItems}
            inventoryItems={inventoryItems}
            onChange={setLineItems}
          />
          <button
            type="button"
            onClick={() => setLineItems((prev) => [...prev, newLineItem()])}
            className="mt-3 text-sm text-blue-600 hover:text-blue-500"
          >
            + Add line item
          </button>
        </div>

        {/* Discount + Totals */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col items-end gap-4">
            {/* Discount row */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">Discount</label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="flat">Flat (₹)</option>
                <option value="percent">Percent (%)</option>
              </select>
              <input type="number" min="0" step="0.01" value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-24 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Totals */}
            <dl className="w-72 text-sm">
              <div className="flex justify-between border-b border-gray-100 py-1">
                <dt className="text-gray-500">Subtotal</dt>
                <dd className="font-medium">{formatCurrency(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-1">
                <dt className="text-gray-500">Total GST</dt>
                <dd>{formatCurrency(totals.totalGST)}</dd>
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
                  <dt>Outstanding (credit)</dt>
                  <dd className="font-semibold">{formatCurrency(totals.grandTotal)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link to="/sales"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </Link>
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {submitting && <LoadingSpinner size="sm" />}
            {submitting ? 'Saving…' : 'Save invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
