import { useEffect, useState } from 'react';
import Modal from '../Modal';
import FormField from '../FormField';
import LoadingSpinner from '../LoadingSpinner';
import {
  STOCK_ADJUSTMENT_TYPES,
  STOCK_ADJUSTMENT_REASONS,
} from '../../utils/inventoryConstants';
import { createStockAdjustment } from '../../services/stockAdjustmentService';
import { formatNumber } from '../../utils/format';

const EMPTY_FORM = {
  type: STOCK_ADJUSTMENT_TYPES.IN,
  quantity: '',
  reason: STOCK_ADJUSTMENT_REASONS.in[0],
  note: '',
};

export default function StockAdjustmentModal({ open, companyId, item, userId, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setErrors({});
    setServerError('');
  }, [open]);

  if (!item) return null;

  const reasons = STOCK_ADJUSTMENT_REASONS[form.type] ?? [];
  const qty = Number(form.quantity) || 0;
  const projectedStock =
    form.type === STOCK_ADJUSTMENT_TYPES.IN
      ? (Number(item.currentStock) || 0) + qty
      : (Number(item.currentStock) || 0) - qty;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'type') {
        next.reason = STOCK_ADJUSTMENT_REASONS[value]?.[0] ?? '';
      }
      return next;
    });
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const v = {};
    const q = Number(form.quantity);
    if (form.quantity === '' || !Number.isFinite(q) || q <= 0) {
      v.quantity = 'Enter a quantity greater than 0.';
    }
    if (!form.reason) v.reason = 'Select a reason.';
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }

    setSubmitting(true);
    try {
      await createStockAdjustment(companyId, {
        itemId: item.itemId,
        type: form.type,
        quantity: q,
        reason: form.reason,
        note: form.note,
        createdBy: userId ?? null,
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      setServerError(err.message ?? 'Failed to record adjustment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={`Stock adjustment — ${item.itemName}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="stock-adj-form"
            disabled={submitting || projectedStock < 0}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting && <LoadingSpinner size="sm" />}
            Save adjustment
          </button>
        </>
      }
    >
      {serverError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
        Current stock: <strong>{formatNumber(item.currentStock ?? 0)} {item.unit}</strong>
      </div>

      <form id="stock-adj-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-gray-700">Type</legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="type"
                value={STOCK_ADJUSTMENT_TYPES.IN}
                checked={form.type === STOCK_ADJUSTMENT_TYPES.IN}
                onChange={handleChange}
                disabled={submitting}
              />
              Stock in
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="type"
                value={STOCK_ADJUSTMENT_TYPES.OUT}
                checked={form.type === STOCK_ADJUSTMENT_TYPES.OUT}
                onChange={handleChange}
                disabled={submitting}
              />
              Stock out
            </label>
          </div>
        </fieldset>

        <FormField
          label={`Quantity (${item.unit})`}
          id="quantity"
          name="quantity"
          type="number"
          min="0"
          step="0.001"
          value={form.quantity}
          onChange={handleChange}
          error={errors.quantity}
          disabled={submitting}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="reason" className="text-sm font-medium text-gray-700">Reason</label>
          <select
            id="reason"
            name="reason"
            value={form.reason}
            onChange={handleChange}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {reasons.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {errors.reason && <p className="text-xs text-red-600">{errors.reason}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="note" className="text-sm font-medium text-gray-700">Note (optional)</label>
          <textarea
            id="note"
            name="note"
            value={form.note}
            onChange={handleChange}
            rows={2}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div
          className={`rounded-md px-3 py-2 text-xs ${
            projectedStock < 0
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          New stock after adjustment:{' '}
          <strong>
            {formatNumber(projectedStock)} {item.unit}
          </strong>
          {projectedStock < 0 && ' — exceeds available stock'}
        </div>
      </form>
    </Modal>
  );
}
