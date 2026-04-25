import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  computeMenuItemCost,
  computeMargin,
  MENU_CATEGORIES,
  MENU_GST_RATES,
  MENU_PORTION_UNITS,
} from '../services/menuItemService';
import { listInventoryItems } from '../services/inventoryService';
import { extractMenuFromImage, extractMenuFromText } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import RoleGuard from '../components/RoleGuard';
import Modal from '../components/Modal';

// ─── helpers ──────────────────────────────────────────────────────────────────

function invMap(items) {
  const m = {};
  items.forEach((it) => { m[it.itemId] = it; });
  return m;
}

function hasLowStock(ingredients, inventoryMap) {
  return (ingredients ?? []).some((ing) => {
    const inv = inventoryMap[ing.inventoryItemId];
    if (!inv) return false;
    return (Number(inv.currentStock) || 0) <= (Number(inv.reorderLevel) || 0);
  });
}

const CATEGORY_BADGE = {
  Food:     'bg-orange-50 text-orange-700',
  Beverage: 'bg-blue-50 text-blue-700',
  Dessert:  'bg-pink-50 text-pink-700',
  Extras:   'bg-gray-100 text-gray-600',
  Specials: 'bg-purple-50 text-purple-700',
};

// ─── Ingredients sub-editor used inside MenuItemForm ─────────────────────────

const EMPTY_ING = { inventoryItemId: '', inventoryItemName: '', quantity: '', unit: '', costPrice: 0 };

function IngredientsEditor({ ingredients, inventory, onChange }) {
  function add() {
    onChange([...ingredients, { ...EMPTY_ING }]);
  }

  function remove(i) {
    onChange(ingredients.filter((_, idx) => idx !== i));
  }

  function patch(i, key, value) {
    const next = [...ingredients];
    next[i] = { ...next[i], [key]: value };

    if (key === 'inventoryItemId') {
      const inv = inventory.find((it) => it.itemId === value);
      if (inv) {
        next[i].inventoryItemName = inv.itemName;
        next[i].unit              = inv.unit;
        next[i].costPrice         = Number(inv.costPrice) || 0;
      } else {
        next[i].inventoryItemName = '';
        next[i].unit              = '';
        next[i].costPrice         = 0;
      }
    }

    onChange(next);
  }

  const totalCost = computeMenuItemCost(ingredients);

  return (
    <div className="space-y-2">
      {/* Column headers — only when rows exist */}
      {ingredients.length > 0 && (
        <div className="grid grid-cols-[1fr_18%_12%_16%_24px] gap-2 px-1">
          <p className="text-xs text-gray-500">Inventory item</p>
          <p className="text-xs text-gray-500">Qty / portion</p>
          <p className="text-xs text-gray-500">Unit</p>
          <p className="text-xs text-gray-500">Cost / unit</p>
          <span />
        </div>
      )}

      {ingredients.map((ing, i) => (
        <div key={i} className="grid grid-cols-[1fr_18%_12%_16%_24px] gap-2 items-center">
          <select
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={ing.inventoryItemId}
            onChange={(e) => patch(i, 'inventoryItemId', e.target.value)}
          >
            <option value="">— Select item —</option>
            {inventory.map((it) => (
              <option key={it.itemId} value={it.itemId}>{it.itemName}</option>
            ))}
          </select>

          <input
            type="number" min="0" step="0.001" placeholder="0"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={ing.quantity}
            onChange={(e) => patch(i, 'quantity', e.target.value)}
          />

          <input
            readOnly
            className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
            value={ing.unit}
          />

          <input
            readOnly
            className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
            value={ing.costPrice ? formatCurrency(ing.costPrice) : '—'}
          />

          <button
            type="button"
            onClick={() => remove(i)}
            className="text-gray-400 hover:text-red-500 text-lg leading-none"
          >
            &times;
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="mt-1 text-sm text-blue-600 hover:text-blue-500"
      >
        + Add Ingredient
      </button>

      {ingredients.length > 0 && (
        <p className="text-xs text-gray-500 pt-1">
          Total cost / portion: <span className="font-semibold text-gray-800">{formatCurrency(totalCost)}</span>
        </p>
      )}
    </div>
  );
}

// ─── Menu item form ───────────────────────────────────────────────────────────

function MenuItemForm({ item, inventory, onSave, onCancel }) {
  const isEdit = !!item?.menuItemId;

  const [form, setForm] = useState({
    itemName:     item?.itemName     ?? '',
    category:     item?.category     ?? MENU_CATEGORIES[0],
    sellingPrice: item?.sellingPrice ?? '',
    gstRate:      item?.gstRate      ?? 5,
    ingredients:  item?.ingredients  ?? [],
    portionSize:  item?.portionSize  ?? 1,
    unit:         item?.unit         ?? 'portion',
    description:  item?.description  ?? '',
    isAvailable:  item?.isAvailable  !== false,
    displayOrder: item?.displayOrder ?? 0,
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const costPrice = computeMenuItemCost(form.ingredients);
  const sell      = Number(form.sellingPrice) || 0;
  const margin    = computeMargin(sell, costPrice);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.itemName.trim())   { setError('Item name is required.');              return; }
    if (sell <= 0)               { setError('Selling price must be greater than 0.'); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message ?? 'Failed to save menu item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* ── Basic details ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
          <input
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.itemName}
            onChange={(e) => setField('itemName', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.category}
            onChange={(e) => setField('category', e.target.value)}
          >
            {MENU_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GST %</label>
          <select
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.gstRate}
            onChange={(e) => setField('gstRate', Number(e.target.value))}
          >
            {MENU_GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (₹) *</label>
          <input
            type="number" min="0.01" step="0.01" required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.sellingPrice}
            onChange={(e) => setField('sellingPrice', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
          <input
            type="number" min="0" step="1"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.displayOrder}
            onChange={(e) => setField('displayOrder', e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Portion Size</label>
            <input
              type="number" min="0.01" step="0.01"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.portionSize}
              onChange={(e) => setField('portionSize', e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.unit}
              onChange={(e) => setField('unit', e.target.value)}
            >
              {MENU_PORTION_UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            rows={2}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
          />
        </div>

        <div className="col-span-2">
          <button
            type="button"
            onClick={() => setField('isAvailable', !form.isAvailable)}
            className="flex items-center gap-2 select-none"
          >
            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.isAvailable ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.isAvailable ? 'translate-x-4' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm text-gray-700">Available on billing screen</span>
          </button>
        </div>
      </div>

      {/* ── Ingredients ── */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Ingredients <span className="font-normal text-gray-400">(optional — for cost tracking & inventory deduction)</span>
        </h3>
        <IngredientsEditor
          ingredients={form.ingredients}
          inventory={inventory}
          onChange={(ings) => setField('ingredients', ings)}
        />

        {/* Live cost + margin summary */}
        {form.ingredients.length > 0 && (
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-white border border-gray-200 p-3 text-sm mt-2">
            <div>
              <p className="text-xs text-gray-500">Cost / portion</p>
              <p className="font-semibold text-gray-800">{formatCurrency(costPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Selling price</p>
              <p className="font-semibold text-gray-800">{sell > 0 ? formatCurrency(sell) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Profit margin</p>
              <p className={`font-semibold ${margin === null ? 'text-gray-400' : margin < 0 ? 'text-red-600' : margin < 20 ? 'text-amber-600' : 'text-green-600'}`}>
                {margin !== null ? `${margin.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel}
          className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Saving…' : isEdit ? 'Update Item' : 'Create Item'}
        </button>
      </div>
    </form>
  );
}

// ─── Bulk Upload Modal (AI image / AI text / Excel) ──────────────────────────

const TABS = [
  ['image', 'AI Image Scan'],
  ['text',  'Paste Text'],
  ['excel', 'Excel Upload'],
];

function normaliseCategoryLocal(raw) {
  if (!raw) return MENU_CATEGORIES[0];
  const lower = String(raw).toLowerCase();
  return MENU_CATEGORIES.find((c) => c.toLowerCase() === lower) ?? MENU_CATEGORIES[0];
}

function normaliseGstRate(raw) {
  const n = Number(raw);
  return MENU_GST_RATES.includes(n) ? n : 5;
}

function rowIsValid(row) {
  return !!String(row.itemName ?? '').trim() && Number(row.sellingPrice) > 0;
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Item Name',                                                    'Category',  'Selling Price',            'GST%',           'Description'],
    ['(Valid categories: Food / Beverage / Dessert / Extras / Specials)', '',    '(number only, e.g. 280)',  '(0/5/12/18)',    '(optional)'],
    ['Butter Chicken',                                               'Food',       280,                        5,                'Rich creamy tomato curry'],
    ['Mango Lassi',                                                  'Beverage',    80,                        5,                'Fresh mango smoothie'],
  ]);
  ws['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 8 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Menu Items');
  XLSX.writeFile(wb, 'menu_master_template.xlsx');
}

function AiBulkUploadModal({ onClose, onSaved }) {
  const { activeCompanyId } = useApp();
  const [tab, setTab]           = useState('image');
  const [imgFile, setImgFile]   = useState(null);
  const [xlsFile, setXlsFile]   = useState(null);
  const [menuText, setMenuText] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [preview, setPreview]   = useState(null);
  const [saving, setSaving]     = useState(false);
  const [savedCount, setSavedCount] = useState(null);

  function switchTab(t) {
    setTab(t);
    setPreview(null);
    setError(null);
    setSavedCount(null);
  }

  // ── AI extraction ─────────────────────────────────────────────────────────

  async function handleAiExtract() {
    setError(null);
    setPreview(null);
    setSavedCount(null);
    setLoading(true);
    try {
      const items = tab === 'image'
        ? await extractMenuFromImage(imgFile)
        : await extractMenuFromText(menuText);
      setPreview(items);
    } catch (err) {
      setError(err.message ?? 'Extraction failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Excel parsing ─────────────────────────────────────────────────────────

  function handleExcelFile(f) {
    setXlsFile(f);
    setPreview(null);
    setSavedCount(null);
    setError(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Row 0 = header; skip note rows whose first cell starts with "("
        const dataRows = rows.slice(1).filter(
          (r) => r.length > 0 && !String(r[0] ?? '').startsWith('('),
        );

        if (dataRows.length === 0) {
          setError('No data rows found. Download the template to see the expected format.');
          return;
        }

        setPreview(dataRows.map((r, i) => {
          const name  = String(r[0] ?? '').trim();
          const price = Number(r[2]) || 0;
          return {
            _id:          i + 1,
            itemName:     name,
            category:     normaliseCategoryLocal(r[1]),
            sellingPrice: price,
            gstRate:      normaliseGstRate(r[3]),
            description:  String(r[4] ?? '').trim(),
            _invalid:     !name || price <= 0,
          };
        }));
      } catch {
        setError('Could not parse the file. Please ensure it is a valid .xlsx or .csv file.');
      }
    };
    reader.onerror = () => setError('Failed to read the file.');
    reader.readAsArrayBuffer(f);
  }

  // ── Shared preview helpers ────────────────────────────────────────────────

  function patchRow(id, key, value) {
    setPreview((prev) => prev.map((r) => {
      if (r._id !== id) return r;
      const updated = { ...r, [key]: value };
      // Recompute _invalid only for rows that carry the flag (Excel rows)
      if ('_invalid' in r) updated._invalid = !rowIsValid(updated);
      return updated;
    }));
  }

  function removeRow(id) {
    setPreview((prev) => prev.filter((r) => r._id !== id));
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSaveAll() {
    const rowsToSave = (preview ?? []).filter((r) => r._invalid !== true);
    if (!rowsToSave.length) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all(
        rowsToSave.map((row, idx) =>
          createMenuItem(activeCompanyId, {
            itemName:     row.itemName,
            category:     row.category,
            sellingPrice: Number(row.sellingPrice) || 0,
            gstRate:      Number(row.gstRate) || 5,
            description:  row.description ?? '',
            ingredients:  [],
            portionSize:  1,
            unit:         'portion',
            isAvailable:  true,
            displayOrder: idx,
          }),
        ),
      );
      setSavedCount(rowsToSave.length);
      onSaved();
    } catch (err) {
      setError(err.message ?? 'Failed to save items. Please try again.');
      setSaving(false);
    }
  }

  // ── Derived counts ────────────────────────────────────────────────────────

  const validCount   = (preview ?? []).filter((r) => r._invalid !== true).length;
  const invalidCount = (preview ?? []).filter((r) => r._invalid === true).length;
  const isAiTab      = tab === 'image' || tab === 'text';
  const canAiExtract = tab === 'image' ? !!imgFile : menuText.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
        {TABS.map(([t, label], i) => (
          <button key={t} type="button" onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm font-medium transition ${i > 0 ? 'border-l border-gray-300' : ''} ${
              tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── AI Image input ── */}
      {tab === 'image' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Upload a photo of your physical menu card. Gemini Vision will extract all items automatically.
          </p>
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
            <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm text-gray-500">
              {imgFile ? imgFile.name : 'Click to upload menu image (JPG, PNG…)'}
            </span>
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => { setImgFile(e.target.files[0] ?? null); setPreview(null); setSavedCount(null); }} />
          </label>
        </div>
      )}

      {/* ── Paste Text input ── */}
      {tab === 'text' && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Paste plain text from a PDF or typed menu.</p>
          <textarea
            rows={7}
            placeholder={"Butter Chicken - ₹280\nMango Lassi - ₹80\nGulab Jamun - ₹60\n…"}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm resize-none font-mono"
            value={menuText}
            onChange={(e) => { setMenuText(e.target.value); setPreview(null); setSavedCount(null); }}
          />
        </div>
      )}

      {/* ── Excel Upload input ── */}
      {tab === 'excel' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm text-gray-500 flex-1">
              Upload an <span className="font-medium text-gray-700">.xlsx</span> or{' '}
              <span className="font-medium text-gray-700">.csv</span> file. Required columns:{' '}
              <span className="font-medium text-gray-700">Item Name, Category, Selling Price, GST%, Description</span>
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex-shrink-0 flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Template
            </button>
          </div>
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 cursor-pointer hover:border-green-400 hover:bg-green-50 transition">
            <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm text-gray-500">
              {xlsFile ? xlsFile.name : 'Click to upload .xlsx or .csv'}
            </span>
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => handleExcelFile(e.target.files[0] ?? null)}
            />
          </label>
        </div>
      )}

      {error && <p className="rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</p>}

      {/* AI Extract button — only for AI tabs, hidden after save */}
      {isAiTab && savedCount === null && (
        <button
          type="button"
          disabled={!canAiExtract || loading || saving}
          onClick={handleAiExtract}
          className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {loading && <LoadingSpinner size="sm" />}
          {loading ? 'Extracting with AI…' : 'Extract with Gemini AI'}
        </button>
      )}

      {/* Empty result */}
      {preview !== null && preview.length === 0 && savedCount === null && (
        <p className="rounded bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
          No items found. Try a clearer image, different text, or check the file format.
        </p>
      )}

      {/* Preview table */}
      {preview !== null && preview.length > 0 && savedCount === null && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-gray-700">
              {preview.length} item{preview.length !== 1 ? 's' : ''} found — review and edit before saving:
            </p>
            {invalidCount > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                {invalidCount} row{invalidCount !== 1 ? 's' : ''} missing name or price
              </span>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_32px] gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <div>Item Name</div>
              <div>Category</div>
              <div>Price (₹)</div>
              <div>GST %</div>
              <div />
            </div>
            <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {preview.map((row) => {
                const nameMissing  = row._invalid && !String(row.itemName ?? '').trim();
                const priceMissing = row._invalid && Number(row.sellingPrice) <= 0;
                return (
                  <div key={row._id}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_32px] gap-2 items-center px-3 py-2 ${row._invalid ? 'bg-red-50' : ''}`}>
                    <input
                      className={`rounded border px-2 py-1 text-sm w-full ${nameMissing ? 'border-red-400' : 'border-gray-300'}`}
                      value={row.itemName}
                      onChange={(e) => patchRow(row._id, 'itemName', e.target.value)}
                    />
                    <select
                      className="rounded border border-gray-300 px-1 py-1 text-sm w-full"
                      value={row.category}
                      onChange={(e) => patchRow(row._id, 'category', e.target.value)}
                    >
                      {MENU_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <input
                      type="number" min="0" step="0.01"
                      className={`rounded border px-2 py-1 text-sm w-full ${priceMissing ? 'border-red-400' : 'border-gray-300'}`}
                      value={row.sellingPrice}
                      onChange={(e) => patchRow(row._id, 'sellingPrice', e.target.value)}
                    />
                    <select
                      className="rounded border border-gray-300 px-1 py-1 text-sm w-full"
                      value={row.gstRate}
                      onChange={(e) => patchRow(row._id, 'gstRate', Number(e.target.value))}
                    >
                      {MENU_GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                    <button type="button" onClick={() => removeRow(row._id)}
                      className="text-gray-400 hover:text-red-500 text-xl leading-none flex items-center justify-center">
                      &times;
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={() => setPreview(null)}
              className="text-sm text-gray-500 hover:text-gray-700 transition">
              &larr; {tab === 'excel' ? 'Re-upload' : 'Re-extract'}
            </button>
            <button
              type="button"
              disabled={saving || validCount === 0}
              onClick={handleSaveAll}
              className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition"
            >
              {saving && <LoadingSpinner size="sm" />}
              {saving
                ? 'Saving…'
                : invalidCount > 0
                ? `Save Valid (${validCount} of ${preview.length})`
                : `Save All (${preview.length} item${preview.length !== 1 ? 's' : ''})`}
            </button>
          </div>
        </div>
      )}

      {/* Success */}
      {savedCount !== null && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-6 text-center space-y-3">
          <p className="text-green-700 font-bold text-xl">
            {savedCount} item{savedCount !== 1 ? 's' : ''} added successfully!
          </p>
          <p className="text-sm text-green-600">You can edit each item individually from the menu list.</p>
          <button type="button" onClick={onClose}
            className="rounded-md bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MenuMasterPage() {
  const { activeCompanyId } = useApp();
  const [menuItems, setMenuItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [formOpen,  setFormOpen]  = useState(false);
  const [editItem,  setEditItem]  = useState(null);
  const [aiOpen,    setAiOpen]    = useState(false);
  const [catFilter, setCatFilter] = useState('All');
  const [search,    setSearch]    = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const [items, inv] = await Promise.all([
        listMenuItems(activeCompanyId),
        listInventoryItems(activeCompanyId),
      ]);
      setMenuItems(items);
      setInventory(inv);
    } catch (err) {
      setError(err.message ?? 'Failed to load menu items.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const iMap = useMemo(() => invMap(inventory), [inventory]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return menuItems
      .filter((m) => {
        if (catFilter !== 'All' && m.category !== catFilter) return false;
        if (term && !(m.itemName ?? '').toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => {
        const cd = MENU_CATEGORIES.indexOf(a.category) - MENU_CATEGORIES.indexOf(b.category);
        if (cd !== 0) return cd;
        return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      });
  }, [menuItems, catFilter, search]);

  async function handleSave(form) {
    if (editItem) {
      await updateMenuItem(activeCompanyId, editItem.menuItemId, form);
    } else {
      await createMenuItem(activeCompanyId, form);
    }
    setFormOpen(false);
    setEditItem(null);
    await load();
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.itemName}" from menu?`)) return;
    await deleteMenuItem(activeCompanyId, item.menuItemId);
    await load();
  }

  async function handleToggle(item) {
    await toggleMenuItemAvailability(activeCompanyId, item.menuItemId, !item.isAvailable);
    setMenuItems((prev) =>
      prev.map((m) => m.menuItemId === item.menuItemId ? { ...m, isAvailable: !m.isAvailable } : m),
    );
  }

  function openEdit(item) { setEditItem(item); setFormOpen(true); }
  function openNew()      { setEditItem(null); setFormOpen(true); }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu Master</h1>
          <p className="text-sm text-gray-500">
            {menuItems.length} item{menuItems.length !== 1 ? 's' : ''} · F&amp;B billing menu
          </p>
        </div>
        <RoleGuard permission="edit">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAiOpen(true)}
              className="rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition"
            >
              Bulk Upload with AI
            </button>
            <button onClick={openNew}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              + New Menu Item
            </button>
          </div>
        </RoleGuard>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search items…"
          className="rounded border border-gray-300 px-3 py-2 text-sm w-56"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {['All', ...MENU_CATEGORIES].map((c) => (
            <button key={c} type="button" onClick={() => setCatFilter(c)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                catFilter === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-gray-400">
          {menuItems.length === 0
            ? 'No menu items yet. Add your first item to start building your menu.'
            : 'No items match your filter.'}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <div>Item</div>
            <div>Selling Price</div>
            <div>Cost Price</div>
            <div>Margin</div>
            <div>GST</div>
            <div>Actions</div>
          </div>

          <div className="divide-y divide-gray-100">
            {filtered.map((item) => {
              // Use stored derived fields; fall back to live calc if missing (old docs)
              const cost     = item.costPrice    ?? computeMenuItemCost(item.ingredients);
              const margin   = item.profitMargin ?? computeMargin(item.sellingPrice, cost);
              const sell     = Number(item.sellingPrice) || 0;
              const lowStock = hasLowStock(item.ingredients, iMap);

              return (
                <div
                  key={item.menuItemId}
                  className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 items-center px-5 py-3 text-sm transition hover:bg-gray-50 ${
                    !item.isAvailable ? 'opacity-50' : ''
                  }`}
                >
                  {/* Name + meta */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 truncate">{item.itemName}</p>
                      {lowStock && (
                        <span title="An ingredient is below reorder level" className="flex-shrink-0 text-amber-500">
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_BADGE[item.category] ?? 'bg-gray-100 text-gray-600'}`}>
                        {item.category}
                      </span>
                      {(item.ingredients?.length > 0) && (
                        <span className="text-[10px] text-gray-400">
                          {item.ingredients.length} ingredient{item.ingredients.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {item.description && (
                        <span className="text-[10px] text-gray-400 truncate max-w-[160px]" title={item.description}>
                          {item.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="font-medium text-gray-900">{formatCurrency(sell)}</div>

                  <div className="text-gray-600">
                    {(item.ingredients?.length > 0)
                      ? formatCurrency(cost)
                      : <span className="text-gray-300">—</span>}
                  </div>

                  <div>
                    {margin !== null && (item.ingredients?.length > 0) ? (
                      <span className={`font-medium ${margin < 0 ? 'text-red-600' : margin < 20 ? 'text-amber-600' : 'text-green-600'}`}>
                        {margin.toFixed(1)}%
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </div>

                  <div className="text-gray-500">{item.gstRate}%</div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <RoleGuard permission="edit">
                      <button
                        type="button"
                        title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}
                        onClick={() => handleToggle(item)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${item.isAvailable ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${item.isAvailable ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </RoleGuard>
                    <RoleGuard permission="edit">
                      <button onClick={() => openEdit(item)} className="text-xs text-blue-600 hover:underline">Edit</button>
                    </RoleGuard>
                    <RoleGuard permission="delete">
                      <button onClick={() => handleDelete(item)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </RoleGuard>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditItem(null); }}
        title={editItem ? 'Edit Menu Item' : 'New Menu Item'}
        size="lg"
      >
        <MenuItemForm
          item={editItem}
          inventory={inventory}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditItem(null); }}
        />
      </Modal>

      <Modal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title="Bulk Upload with AI"
        size="lg"
      >
        <AiBulkUploadModal
          onClose={() => setAiOpen(false)}
          onSaved={() => { load(); }}
        />
      </Modal>
    </div>
  );
}
