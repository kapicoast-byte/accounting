import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { listCustomers } from '../services/customerService';
import { listInventoryItems } from '../services/inventoryService';
import { listRecipes } from '../services/recipeService';
import { listMenuItems } from '../services/menuItemService';
import { BUSINESS_TYPES } from '../services/companyService';
import { createSale, computeInvoiceTotals, PAYMENT_MODES } from '../services/saleService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import CustomerSelector from '../components/sales/CustomerSelector';
import LineItemEditor, {
  newLineItem,
  newServiceLineItem,
  newManufacturingLineItem,
} from '../components/sales/LineItemEditor';
import FnbBillingPanel from '../components/sales/FnbBillingPanel';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function futureDateStr(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Business-type badge ─────────────────────────────────────────────────────

const BT_COLORS = {
  'F&B':           'bg-orange-50 text-orange-700 border-orange-200',
  'Retail':        'bg-green-50 text-green-700 border-green-200',
  'Manufacturing': 'bg-purple-50 text-purple-700 border-purple-200',
  'Services':      'bg-blue-50 text-blue-700 border-blue-200',
  'Mixed':         'bg-teal-50 text-teal-700 border-teal-200',
};

function BizTypeBadge({ businessType }) {
  if (!businessType) return null;
  const bt = BUSINESS_TYPES.find((b) => b.value === businessType);
  if (!bt) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${BT_COLORS[businessType] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {bt.icon} {bt.label}
    </span>
  );
}

// ─── Shared invoice header / totals section ───────────────────────────────────

function InvoiceHeader({ title, subtitle, businessType }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <BizTypeBadge businessType={businessType} />
        </div>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      <Link to="/sales" className="text-sm text-gray-500 hover:text-gray-700">← Back to sales</Link>
    </div>
  );
}

function TotalsPanel({ totals, discountType, discountValue, onDiscountTypeChange, onDiscountValueChange, isCredit }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col items-end gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Discount</label>
          <select value={discountType} onChange={(e) => onDiscountTypeChange(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
            <option value="flat">Flat (₹)</option>
            <option value="percent">Percent (%)</option>
          </select>
          <input type="number" min="0" step="0.01" value={discountValue}
            onChange={(e) => onDiscountValueChange(e.target.value)}
            className="w-24 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <dl className="w-72 text-sm">
          <div className="flex justify-between border-b border-gray-100 py-1">
            <dt className="text-gray-500">Subtotal</dt><dd className="font-medium">{formatCurrency(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 py-1">
            <dt className="text-gray-500">Total GST</dt><dd>{formatCurrency(totals.totalGST)}</dd>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between border-b border-gray-100 py-1">
              <dt className="text-gray-500">Discount</dt><dd className="text-red-600">− {formatCurrency(totals.discountAmount)}</dd>
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
  );
}

// ─── Standard invoice form (Retail / Manufacturing / Services) ────────────────

function StandardInvoiceForm({ inventoryItems, mode, businessType }) {
  const navigate = useNavigate();
  const { activeCompanyId } = useApp();

  const [customers, setCustomers]       = useState([]);
  const [loadingCust, setLoadingCust]   = useState(true);
  const [customer, setCustomer]         = useState(null);
  const [invoiceDate, setInvoiceDate]   = useState(todayStr);
  const [dueDate, setDueDate]           = useState(futureDateStr());
  const [paymentMode, setPaymentMode]   = useState('Cash');
  const [notes, setNotes]               = useState('');
  const [lineItems, setLineItems]       = useState(() => {
    if (mode === 'services')      return [newServiceLineItem()];
    if (mode === 'manufacturing') return [newManufacturingLineItem()];
    return [newLineItem()];
  });
  const [discountType, setDiscountType]   = useState('flat');
  const [discountValue, setDiscountValue] = useState('0');
  const [submitting, setSubmitting]       = useState(false);
  const [serverError, setServerError]     = useState('');

  useEffect(() => {
    if (!activeCompanyId) return;
    setLoadingCust(true);
    listCustomers(activeCompanyId)
      .then(setCustomers)
      .finally(() => setLoadingCust(false));
  }, [activeCompanyId]);

  const totals  = useMemo(
    () => computeInvoiceTotals({ lineItems, discountType, discountValue }),
    [lineItems, discountType, discountValue],
  );
  const isCredit = paymentMode === 'Credit';

  async function handleSubmit(e) {
    e.preventDefault();
    // Services requires a customer
    if (mode === 'services' && !customer) {
      setServerError('Customer name and contact are required for service invoices.');
      return;
    }
    const hasItems = lineItems.every(
      (l) => l.itemName && Number(l.quantity) > 0 && Number(l.unitPrice) >= 0,
    );
    if (!hasItems) { setServerError('Fill in all line items (name, quantity, price).'); return; }
    if (mode !== 'services' && lineItems.some((l) => !l.itemId)) {
      setServerError('Select an inventory item for every line.'); return;
    }
    if (totals.grandTotal <= 0) { setServerError('Grand total must be greater than zero.'); return; }

    setSubmitting(true);
    setServerError('');
    try {
      const { saleId } = await createSale(activeCompanyId, {
        customer:     customer ?? { name: 'Walk-in customer', phone: '', address: '', GSTIN: '' },
        lineItems,
        discountType,
        discountValue,
        paymentMode,
        date:    invoiceDate,
        dueDate: isCredit ? dueDate : null,
        notes,
      });
      navigate(`/sales/${saleId}`, { replace: true });
    } catch (err) {
      setServerError(err.message ?? 'Failed to create invoice.');
      setSubmitting(false);
    }
  }

  const titles = {
    retail:        'Retail Invoice',
    manufacturing: 'Manufacturing Invoice',
    services:      'Service Invoice',
    standard:      'New Invoice',
  };

  const addLabels = {
    services:      '+ Add service line',
    manufacturing: '+ Add finished good',
    retail:        '+ Add line item',
    standard:      '+ Add line item',
  };

  const newItem = () => {
    if (mode === 'services')      return newServiceLineItem();
    if (mode === 'manufacturing') return newManufacturingLineItem();
    return newLineItem();
  };

  if (loadingCust) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div className="flex flex-col gap-6">
      <InvoiceHeader
        title={titles[mode] ?? 'New Invoice'}
        subtitle="Invoice number will be auto-generated on save."
        businessType={businessType}
      />

      {serverError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/* Header fields */}
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
          <CustomerSelector
            companyId={activeCompanyId}
            customers={customers}
            value={customer}
            onChange={setCustomer}
            required={mode === 'services'}
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
                  <input type="radio" name="paymentMode" value={m} checked={paymentMode === m} onChange={() => setPaymentMode(m)} />
                  {m}
                </label>
              ))}
            </div>
          </div>

          {isCredit && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={invoiceDate}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-amber-600">Credit — full amount will be outstanding.</p>
            </div>
          )}

          {mode === 'services' && (
            <div className="sm:col-span-2 lg:col-span-1 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
              Customer name and contact are required for service invoices.
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
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            {mode === 'services' ? 'Services' : mode === 'manufacturing' ? 'Finished Goods' : 'Line items'}
          </h2>
          <LineItemEditor
            items={lineItems}
            inventoryItems={mode === 'services' ? [] : inventoryItems}
            onChange={setLineItems}
            mode={mode}
          />
          <button type="button"
            onClick={() => setLineItems((prev) => [...prev, newItem()])}
            className="mt-3 text-sm text-blue-600 hover:text-blue-500">
            {addLabels[mode] ?? '+ Add line item'}
          </button>
        </div>

        <TotalsPanel
          totals={totals}
          discountType={discountType}
          discountValue={discountValue}
          onDiscountTypeChange={setDiscountType}
          onDiscountValueChange={setDiscountValue}
          isCredit={isCredit}
        />

        <div className="flex justify-end gap-3">
          <Link to="/sales" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
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

// ─── F&B billing wrapper ──────────────────────────────────────────────────────

function FnbInvoicePage({ menuItems, recipes, businessType }) {
  const navigate = useNavigate();
  const { activeCompanyId } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  async function handleSubmit(payload) {
    setSubmitting(true);
    setServerError('');
    try {
      const { saleId } = await createSale(activeCompanyId, payload);
      navigate(`/sales/${saleId}`, { replace: true });
    } catch (err) {
      setServerError(err.message ?? 'Failed to save bill.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <InvoiceHeader
        title="F&amp;B Billing"
        subtitle="Quick order &amp; billing for food and beverage"
        businessType={businessType}
      />
      <FnbBillingPanel
        menuItems={menuItems}
        recipes={recipes}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={serverError}
      />
    </div>
  );
}

// ─── Mixed mode: toggle between F&B POS and Retail invoice ───────────────────

function MixedInvoicePage({ menuItems, recipes, inventoryItems }) {
  const [salesMode, setSalesMode] = useState('menu'); // 'menu' | 'inventory'

  return (
    <div className="flex flex-col gap-4">
      {/* Mode toggle bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">New Sale</h1>
          <BizTypeBadge businessType="Mixed" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setSalesMode('menu')}
              className={`px-4 py-2 text-sm font-medium transition ${
                salesMode === 'menu'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              🍽️ Menu Order
            </button>
            <button
              type="button"
              onClick={() => setSalesMode('inventory')}
              className={`px-4 py-2 text-sm font-medium transition border-l border-gray-300 ${
                salesMode === 'inventory'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              🛒 Inventory Sale
            </button>
          </div>
          <Link to="/sales" className="text-sm text-gray-500 hover:text-gray-700">← Back</Link>
        </div>
      </div>

      {salesMode === 'menu' ? (
        <MixedFnbPanel menuItems={menuItems} recipes={recipes} />
      ) : (
        <StandardInvoiceForm inventoryItems={inventoryItems} mode="retail" businessType="Mixed" />
      )}
    </div>
  );
}

function MixedFnbPanel({ menuItems, recipes }) {
  const navigate = useNavigate();
  const { activeCompanyId } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  async function handleSubmit(payload) {
    setSubmitting(true);
    setServerError('');
    try {
      const { saleId } = await createSale(activeCompanyId, payload);
      navigate(`/sales/${saleId}`, { replace: true });
    } catch (err) {
      setServerError(err.message ?? 'Failed to save bill.');
      setSubmitting(false);
    }
  }

  return (
    <FnbBillingPanel
      menuItems={menuItems}
      recipes={recipes}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={serverError}
    />
  );
}

// ─── Entry point — dispatches based on businessType ──────────────────────────

export default function CreateInvoicePage() {
  const { activeCompanyId, businessType } = useApp();
  const [inventoryItems, setInventoryItems] = useState([]);
  const [recipes, setRecipes]               = useState([]);
  const [menuItems, setMenuItems]           = useState([]);
  const [loading, setLoading]               = useState(true);

  const isFnb    = businessType === 'F&B' || businessType === 'Mixed';
  const needsInv = businessType !== 'F&B' && businessType !== 'Services';

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const tasks = [];
      if (isFnb) {
        tasks.push(
          listMenuItems(activeCompanyId).then(setMenuItems),
          listRecipes(activeCompanyId).then(setRecipes),
        );
      }
      if (needsInv) {
        tasks.push(
          listInventoryItems(activeCompanyId).then((inv) =>
            setInventoryItems(inv.filter((i) => i.isActive !== false)),
          ),
        );
      }
      await Promise.all(tasks);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, isFnb, needsInv]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  if (businessType === 'F&B') {
    return <FnbInvoicePage menuItems={menuItems} recipes={recipes} businessType={businessType} />;
  }
  if (businessType === 'Mixed') {
    return <MixedInvoicePage menuItems={menuItems} recipes={recipes} inventoryItems={inventoryItems} />;
  }
  if (businessType === 'Manufacturing') {
    return <StandardInvoiceForm inventoryItems={inventoryItems} mode="manufacturing" businessType={businessType} />;
  }
  if (businessType === 'Services') {
    return <StandardInvoiceForm inventoryItems={[]} mode="services" businessType={businessType} />;
  }
  // Retail or anything else → retail mode
  return <StandardInvoiceForm inventoryItems={inventoryItems} mode="retail" businessType={businessType} />;
}
