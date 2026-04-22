import { useState, useEffect } from 'react';
import Modal from '../Modal';
import FormField from '../FormField';
import LoadingSpinner from '../LoadingSpinner';
import { recordPayment, PAYMENT_MODES } from '../../services/saleService';
import { formatCurrency } from '../../utils/format';

export default function PaymentModal({ open, companyId, sale, onClose, onPaid }) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !sale) return;
    setAmount(String(sale.balanceDue ?? ''));
    setMode(sale.paymentMode === 'Credit' ? 'Cash' : (sale.paymentMode ?? 'Cash'));
    setError('');
  }, [open, sale]);

  if (!sale) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter a valid amount greater than 0.');
      return;
    }
    if (n > sale.balanceDue) {
      setError(`Amount cannot exceed balance due (${formatCurrency(sale.balanceDue)}).`);
      return;
    }
    setSubmitting(true);
    try {
      const updated = await recordPayment(companyId, sale.saleId, { amount: n, paymentMode: mode });
      onPaid?.(updated);
      onClose?.();
    } catch (err) {
      setError(err.message ?? 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Record payment"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="payment-form" disabled={submitting}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {submitting && <LoadingSpinner size="sm" />}
            Confirm payment
          </button>
        </>
      }
    >
      <div className="mb-4 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
        Invoice <strong>{sale.invoiceNumber}</strong> — Grand total:{' '}
        <strong>{formatCurrency(sale.grandTotal)}</strong> · Balance due:{' '}
        <strong className="text-red-700">{formatCurrency(sale.balanceDue)}</strong>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form id="payment-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          label="Amount received"
          id="amount"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(''); }}
          disabled={submitting}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Payment mode</label>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_MODES.filter((m) => m !== 'Credit').map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="mode" value={m}
                  checked={mode === m} onChange={() => setMode(m)} disabled={submitting} />
                {m}
              </label>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
