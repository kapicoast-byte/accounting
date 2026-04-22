import { useState, useEffect } from 'react';
import Modal from '../Modal';
import FormField from '../FormField';
import LoadingSpinner from '../LoadingSpinner';
import { createExpense, updateExpense } from '../../services/expenseService';
import { EXPENSE_CATEGORIES, EXPENSE_PAID_BY } from '../../utils/expenseConstants';
import { toJsDate } from '../../utils/dateUtils';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function dateInputValue(ts) {
  const d = toJsDate(ts);
  return d ? d.toISOString().slice(0, 10) : todayStr();
}

const EMPTY = { date: '', category: 'Rent', amount: '', paidBy: 'Cash', payee: '', notes: '' };

export default function ExpenseModal({ open, companyId, expense, onClose, onSaved }) {
  const isEdit = !!expense;
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setForm({
        date: dateInputValue(expense.date),
        category: expense.category ?? 'Rent',
        amount: String(expense.amount ?? ''),
        paidBy: expense.paidBy ?? 'Cash',
        payee: expense.payee ?? '',
        notes: expense.notes ?? '',
      });
    } else {
      setForm({ ...EMPTY, date: todayStr() });
    }
    setErrors({});
    setServerError('');
  }, [open, expense]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }));
  }

  function validate() {
    const err = {};
    if (!form.date)     err.date = 'Date is required.';
    if (!form.category) err.category = 'Category is required.';
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) err.amount = 'Enter an amount greater than 0.';
    if (!form.paidBy)   err.paidBy = 'Select a payment source.';
    return err;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const v = validate();
    if (Object.keys(v).length) { setErrors(v); return; }
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateExpense(companyId, expense.expenseId, form);
      } else {
        await createExpense(companyId, form);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setServerError(err.message ?? 'Failed to save expense.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={submitting ? undefined : onClose}
      title={isEdit ? 'Edit expense' : 'Record expense'}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button type="submit" form="expense-form" disabled={submitting}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {submitting && <LoadingSpinner size="sm" />}
            {isEdit ? 'Save changes' : 'Record expense'}
          </button>
        </>
      }
    >
      {serverError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</div>
      )}

      <form id="expense-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Date" id="exp-date" name="date" type="date"
          value={form.date} onChange={handleChange} error={errors.date} disabled={submitting} />

        <div className="flex flex-col gap-1">
          <label htmlFor="exp-category" className="text-sm font-medium text-gray-700">Category</label>
          <select id="exp-category" name="category" value={form.category}
            onChange={handleChange} disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {errors.category && <p className="text-xs text-red-600">{errors.category}</p>}
        </div>

        <FormField label="Amount" id="exp-amount" name="amount" type="number"
          min="0.01" step="0.01" value={form.amount} onChange={handleChange}
          error={errors.amount} disabled={submitting} />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Paid by</label>
          <div className="mt-1 flex gap-4">
            {EXPENSE_PAID_BY.map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="paidBy" value={m}
                  checked={form.paidBy === m} onChange={handleChange} disabled={submitting} />
                {m}
              </label>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <FormField label="Payee / description" id="exp-payee" name="payee"
            value={form.payee} onChange={handleChange} disabled={submitting}
            placeholder="e.g. Landlord, Electricity board, Staff salaries" />
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="exp-notes" className="text-sm font-medium text-gray-700">Notes</label>
          <textarea id="exp-notes" name="notes" rows={2} value={form.notes}
            onChange={handleChange} disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </form>
    </Modal>
  );
}
