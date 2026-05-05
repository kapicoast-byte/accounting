import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../services/firebase';
import { useApp } from '../context/AppContext';
import { listVendors } from '../services/vendorService';
import { listInventoryItems } from '../services/inventoryService';
import { createPurchase, computePurchaseTotals, PURCHASE_PAYMENT_MODES } from '../services/purchaseService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import FormField from '../components/FormField';
import VendorSelector from '../components/purchases/VendorSelector';
import PurchaseLineItemEditor, { newPurchaseLineItem } from '../components/purchases/PurchaseLineItemEditor';
import BillScanModal from '../components/purchases/BillScanModal';
import BankAccountSelector from '../components/banks/BankAccountSelector';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function futureStr(days = 30) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function CreatePurchasePage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { activeCompanyId, taxLabel } = useApp();

  const [vendors, setVendors]             = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loadingData, setLoadingData]     = useState(true);

  const [vendor, setVendor]               = useState(null);
  const [vendorBillNumber, setVendorBillNumber] = useState('');
  const [billDate, setBillDate]           = useState(state?.prefill?.date ?? todayStr());
  const [dueDate, setDueDate]             = useState(futureStr());
  const [paymentMode, setPaymentMode]     = useState('Cash');
  const [notes, setNotes]                 = useState('');
  const [lineItems, setLineItems]         = useState([newPurchaseLineItem()]);
  const [discountType, setDiscountType]   = useState('flat');
  const [discountValue, setDiscountValue] = useState('0');

  const [bankAccountId, setBankAccountId] = useState(null);
  const [submitting, setSubmitting]       = useState(false);
  const [serverError, setServerError]     = useState('');

  // AI scan state
  const [scanOpen, setScanOpen]           = useState(false);
  const [billImageFile, setBillImageFile] = useState(null);
  const [aiFields, setAiFields]           = useState(new Set());

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

  // ── AI autofill ─────────────────────────────────────────────────────────────

  function handleScanned({ data, file }) {
    if (!data) return;
    setBillImageFile(file);
    const filled = new Set();

    if (data.vendorName) {
      const match = vendors.find((v) =>
        v.name.toLowerCase().includes(data.vendorName.toLowerCase()) ||
        data.vendorName.toLowerCase().includes(v.name.toLowerCase()),
      );
      if (match) { setVendor(match); filled.add('vendor'); }
    }

    if (data.billNumber) { setVendorBillNumber(data.billNumber); filled.add('billNumber'); }
    if (data.billDate)   { setBillDate(data.billDate);           filled.add('billDate'); }
    if (data.notes)      { setNotes(data.notes);                 filled.add('notes'); }

    if (data.items?.length > 0) {
      const newItems = data.items.map((item) => {
        const base = newPurchaseLineItem();
        const invMatch = inventoryItems.find((inv) =>
          inv.itemName.toLowerCase().includes((item.itemName ?? '').toLowerCase()) ||
          (item.itemName ?? '').toLowerCase().includes(inv.itemName.toLowerCase()),
        );
        if (invMatch) {
          return {
            ...base,
            itemId:    invMatch.itemId,
            itemName:  invMatch.itemName,
            unit:      invMatch.unit,
            quantity:  item.quantity  || 1,
            unitPrice: item.costPrice || Number(invMatch.costPrice) || 0,
            gstRate:   item.gstPercent != null ? item.gstPercent : base.gstRate,
          };
        }
        return {
          ...base,
          itemId:    'custom',
          itemName:  item.itemName || '',
          unit:      item.unit     || 'piece',
          quantity:  item.quantity  || 1,
          unitPrice: item.costPrice || 0,
          gstRate:   item.gstPercent != null ? item.gstPercent : base.gstRate,
        };
      });
      setLineItems(newItems);
      filled.add('lineItems');
    }

    setAiFields(filled);
  }

  // Inline ring style for AI-filled fields
  function aiRing(field) {
    return aiFields.has(field)
      ? { outline: '2px solid var(--pos)', outlineOffset: '2px', borderRadius: '8px' }
      : {};
  }

  // ── submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');

    if (!vendor) {
      setServerError('Select or add a vendor.');
      return;
    }
    const valid = lineItems.every(
      (l) => l.itemId && (l.itemId === 'custom' ? l.itemName?.trim() : true) &&
             Number(l.quantity) > 0 && Number(l.unitPrice) >= 0,
    );
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
        vendor, lineItems, discountType, discountValue,
        paymentMode, date: billDate,
        dueDate: isCredit ? dueDate : null,
        notes, vendorBillNumber,
        bankAccountId: (!isCredit && paymentMode !== 'Cash') ? (bankAccountId ?? null) : null,
      });

      // Upload bill image if user scanned one
      if (billImageFile) {
        try {
          const storageRef = ref(storage, `companies/${activeCompanyId}/bills/${purchaseId}`);
          await uploadBytes(storageRef, billImageFile);
          const url = await getDownloadURL(storageRef);
          await updateDoc(doc(db, 'companies', activeCompanyId, 'purchases', purchaseId), {
            billImageUrl: url,
          });
        } catch (imgErr) {
          console.warn('Bill image upload failed (non-fatal):', imgErr);
        }
      }

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
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>New Purchase</h1>
          <p className="text-sm" style={{ color: 'var(--fg-3)' }}>
            Bill number will be auto-generated on save. Inventory will be increased automatically.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition"
            style={{ background: 'var(--pos-soft)', border: '1px solid var(--pos)', color: 'var(--pos)' }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            Scan Bill
          </button>
          <Link to="/purchases" className="text-sm" style={{ color: 'var(--fg-3)' }}>← Back</Link>
        </div>
      </div>

      {/* AI fill banner */}
      {aiFields.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
          style={{ background: 'var(--pos-soft)', border: '1px solid var(--pos)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--pos)' }}>
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span>Form filled from scanned bill — review and edit as needed.</span>
            {billImageFile && <span className="opacity-70">· Bill image will be attached on save.</span>}
          </div>
          <button type="button" onClick={() => setAiFields(new Set())}
            className="text-xs shrink-0" style={{ color: 'var(--pos)' }}>Dismiss</button>
        </div>
      )}

      {serverError && (
        <div className="rounded-md border px-4 py-3 text-sm"
          style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg)', color: 'var(--neg)' }}>
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/* Header fields */}
        <div className="grid grid-cols-1 gap-4 rounded-xl p-5 sm:grid-cols-2 lg:grid-cols-3"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

          <div style={aiRing('vendor')}>
            <VendorSelector
              companyId={activeCompanyId}
              vendors={vendors}
              value={vendor}
              onChange={(v) => { setVendor(v); setAiFields((p) => { const n = new Set(p); n.delete('vendor'); return n; }); }}
            />
          </div>

          <div style={aiRing('billNumber')}>
            <FormField label="Vendor bill number (optional)"
              id="vendorBillNumber" name="vendorBillNumber"
              value={vendorBillNumber}
              onChange={(e) => setVendorBillNumber(e.target.value)}
              placeholder="From vendor's invoice" />
          </div>

          <div className="flex flex-col gap-1" style={aiRing('billDate')}>
            <label className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>Bill date</label>
            <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>Payment mode</label>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
              {PURCHASE_PAYMENT_MODES.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--fg-2)' }}>
                  <input type="radio" name="paymentMode" value={m}
                    checked={paymentMode === m} onChange={() => setPaymentMode(m)} />
                  {m}
                </label>
              ))}
            </div>
          </div>

          {isCredit && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={billDate} />
              <p className="text-xs" style={{ color: 'var(--warn)' }}>Credit — full amount will become outstanding payable.</p>
            </div>
          )}

          {!isCredit && paymentMode !== 'Cash' && (
            <BankAccountSelector
              companyId={activeCompanyId}
              value={bankAccountId}
              onChange={setBankAccountId}
              label="Paid from bank account"
            />
          )}

          <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-1" style={aiRing('notes')}>
            <label className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--fg-2)' }}>Items purchased</h2>
          </div>
          <div style={aiRing('lineItems')}>
            <PurchaseLineItemEditor
              items={lineItems}
              inventoryItems={inventoryItems}
              onChange={(items) => { setLineItems(items); setAiFields((p) => { const n = new Set(p); n.delete('lineItems'); return n; }); }}
            />
          </div>
          <button type="button"
            onClick={() => setLineItems((prev) => [...prev, newPurchaseLineItem()])}
            className="mt-3 text-sm" style={{ color: 'var(--info)' }}>+ Add line item</button>
        </div>

        {/* Totals */}
        <div className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex flex-col items-end gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm" style={{ color: 'var(--fg-3)' }}>Discount</label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} style={{ width: 'auto' }}>
                <option value="flat">Flat (fixed)</option>
                <option value="percent">Percent (%)</option>
              </select>
              <input type="number" min="0" step="0.01" value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                style={{ width: '6rem' }} />
            </div>

            <dl className="w-72 text-sm">
              <div className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                <dt style={{ color: 'var(--fg-3)' }}>Subtotal</dt>
                <dd className="font-medium">{formatCurrency(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                <dt style={{ color: 'var(--fg-3)' }}>{taxLabel ?? 'Tax'} input credit</dt>
                <dd style={{ color: 'var(--pos)' }}>{formatCurrency(totals.totalGST)}</dd>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                  <dt style={{ color: 'var(--fg-3)' }}>Discount</dt>
                  <dd style={{ color: 'var(--neg)' }}>− {formatCurrency(totals.discountAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between pt-2 text-base">
                <dt className="font-bold">Grand Total</dt>
                <dd className="font-bold" style={{ color: 'var(--info)' }}>{formatCurrency(totals.grandTotal)}</dd>
              </div>
              {isCredit && (
                <div className="flex justify-between pt-1 text-xs" style={{ color: 'var(--warn)' }}>
                  <dt>Outstanding payable</dt>
                  <dd className="font-semibold">{formatCurrency(totals.grandTotal)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link to="/purchases"
            className="rounded-md px-4 py-2 text-sm"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg)' }}>
            Cancel
          </Link>
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 rounded-md px-5 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--info)', color: '#fff' }}>
            {submitting && <LoadingSpinner size="sm" />}
            {submitting ? 'Saving…' : 'Save purchase'}
          </button>
        </div>
      </form>

      <BillScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onExtracted={handleScanned}
      />
    </div>
  );
}
