import { useEffect, useState } from 'react';
import Modal from '../Modal';
import FormField from '../FormField';
import LoadingSpinner from '../LoadingSpinner';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
} from '../../utils/inventoryConstants';
import {
  createInventoryItem,
  updateInventoryItem,
} from '../../services/inventoryService';

const EMPTY_FORM = {
  itemName: '',
  category: INVENTORY_CATEGORIES[0],
  unit: INVENTORY_UNITS[0],
  currentStock: '',
  reorderLevel: '',
  costPrice: '',
  sellingPrice: '',
  barcode: '',
  isActive: true,
};

function validate(form, isEdit) {
  const errors = {};
  if (!form.itemName?.trim()) errors.itemName = 'Item name is required.';
  if (!form.category) errors.category = 'Category is required.';
  if (!form.unit) errors.unit = 'Unit is required.';
  if (!isEdit) {
    const stock = Number(form.currentStock);
    if (form.currentStock === '' || !Number.isFinite(stock) || stock < 0) {
      errors.currentStock = 'Enter a non-negative opening stock.';
    }
  }
  const reorder = Number(form.reorderLevel);
  if (form.reorderLevel === '' || !Number.isFinite(reorder) || reorder < 0) {
    errors.reorderLevel = 'Enter a non-negative reorder level.';
  }
  const cost = Number(form.costPrice);
  if (form.costPrice === '' || !Number.isFinite(cost) || cost < 0) {
    errors.costPrice = 'Enter a non-negative cost price.';
  }
  const sell = Number(form.sellingPrice);
  if (form.sellingPrice === '' || !Number.isFinite(sell) || sell < 0) {
    errors.sellingPrice = 'Enter a non-negative selling price.';
  }
  return errors;
}

export default function ItemFormModal({ open, companyId, item, onClose, onSaved }) {
  const isEdit = !!item;
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        itemName: item.itemName ?? '',
        category: item.category ?? INVENTORY_CATEGORIES[0],
        unit: item.unit ?? INVENTORY_UNITS[0],
        currentStock: String(item.currentStock ?? 0),
        reorderLevel: String(item.reorderLevel ?? 0),
        costPrice: String(item.costPrice ?? 0),
        sellingPrice: String(item.sellingPrice ?? 0),
        barcode: item.barcode ?? '',
        isActive: item.isActive ?? true,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
    setServerError('');
  }, [open, item]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const v = validate(form, isEdit);
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await updateInventoryItem(companyId, item.itemId, form);
      } else {
        await createInventoryItem(companyId, form);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setServerError(err.message ?? 'Failed to save item.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={isEdit ? 'Edit inventory item' : 'Add inventory item'}
      size="lg"
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
            form="item-form"
            disabled={submitting}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting && <LoadingSpinner size="sm" />}
            {isEdit ? 'Save changes' : 'Create item'}
          </button>
        </>
      }
    >
      {serverError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form id="item-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField
            label="Item name"
            id="itemName"
            name="itemName"
            value={form.itemName}
            onChange={handleChange}
            error={errors.itemName}
            disabled={submitting}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-sm font-medium text-gray-700">Category</label>
          <select
            id="category"
            name="category"
            value={form.category}
            onChange={handleChange}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {INVENTORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {errors.category && <p className="text-xs text-red-600">{errors.category}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="unit" className="text-sm font-medium text-gray-700">Unit</label>
          <select
            id="unit"
            name="unit"
            value={form.unit}
            onChange={handleChange}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {INVENTORY_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          {errors.unit && <p className="text-xs text-red-600">{errors.unit}</p>}
        </div>

        {!isEdit && (
          <FormField
            label="Opening stock"
            id="currentStock"
            name="currentStock"
            type="number"
            min="0"
            step="0.001"
            value={form.currentStock}
            onChange={handleChange}
            error={errors.currentStock}
            disabled={submitting}
          />
        )}

        <FormField
          label="Reorder level"
          id="reorderLevel"
          name="reorderLevel"
          type="number"
          min="0"
          step="0.001"
          value={form.reorderLevel}
          onChange={handleChange}
          error={errors.reorderLevel}
          disabled={submitting}
        />

        <FormField
          label="Cost price"
          id="costPrice"
          name="costPrice"
          type="number"
          min="0"
          step="0.01"
          value={form.costPrice}
          onChange={handleChange}
          error={errors.costPrice}
          disabled={submitting}
        />

        <FormField
          label="Selling price"
          id="sellingPrice"
          name="sellingPrice"
          type="number"
          min="0"
          step="0.01"
          value={form.sellingPrice}
          onChange={handleChange}
          error={errors.sellingPrice}
          disabled={submitting}
        />

        <div className="sm:col-span-2">
          <FormField
            label="Barcode (optional)"
            id="barcode"
            name="barcode"
            placeholder="Scan or enter barcode"
            value={form.barcode}
            onChange={handleChange}
            disabled={submitting}
          />
        </div>

        {isEdit && (
          <label className="sm:col-span-2 mt-1 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="isActive"
              checked={form.isActive}
              onChange={handleChange}
              disabled={submitting}
            />
            Active (uncheck to hide from sales/purchases without deleting)
          </label>
        )}

        {isEdit && (
          <p className="sm:col-span-2 text-xs text-gray-500">
            Stock cannot be edited directly here. Use a stock adjustment from the item row.
          </p>
        )}
      </form>
    </Modal>
  );
}
