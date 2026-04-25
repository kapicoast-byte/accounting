import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  MENU_CATEGORIES,
  MENU_GST_RATES,
  MENU_PORTION_UNITS,
} from '../services/menuItemService';
import { listRecipes, computeRecipeCost } from '../services/recipeService';
import { listInventoryItems } from '../services/inventoryService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import RoleGuard from '../components/RoleGuard';
import Modal from '../components/Modal';

// ─── helpers ─────────────────────────────────────────────────────────────────

function recipeMap(recipes) {
  const m = {};
  recipes.forEach((r) => { m[r.recipeId] = r; });
  return m;
}

function inventoryMap(items) {
  const m = {};
  items.forEach((it) => { m[it.itemId] = it; });
  return m;
}

function getLiveCost(recipe, invMap) {
  if (!recipe) return null;
  return computeRecipeCost(
    (recipe.ingredients ?? []).map((ing) => ({
      ...ing,
      costPrice: invMap[ing.itemId]?.costPrice ?? ing.costPrice ?? 0,
    })),
  );
}

function hasLowStockIngredient(recipe, invMap) {
  if (!recipe) return false;
  return (recipe.ingredients ?? []).some((ing) => {
    const inv = invMap[ing.itemId];
    if (!inv) return false;
    return (Number(inv.currentStock) || 0) <= (Number(inv.reorderLevel) || 0);
  });
}

// ─── Menu item form ───────────────────────────────────────────────────────────

function MenuItemForm({ item, recipes, onSave, onCancel }) {
  const isEdit = !!item?.menuItemId;
  const [form, setForm] = useState({
    itemName:       item?.itemName       ?? '',
    category:       item?.category       ?? MENU_CATEGORIES[0],
    sellingPrice:   item?.sellingPrice   ?? '',
    gstRate:        item?.gstRate        ?? 5,
    linkedRecipeId: item?.linkedRecipeId ?? '',
    portionSize:    item?.portionSize    ?? 1,
    unit:           item?.unit           ?? 'portion',
    description:    item?.description    ?? '',
    isAvailable:    item?.isAvailable    !== false,
    displayOrder:   item?.displayOrder   ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const linkedRecipe = recipes.find((r) => r.recipeId === form.linkedRecipeId) ?? null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.itemName.trim()) { setError('Item name is required.'); return; }
    if (Number(form.sellingPrice) <= 0) { setError('Selling price must be greater than 0.'); return; }
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Linked Recipe <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.linkedRecipeId}
            onChange={(e) => setField('linkedRecipeId', e.target.value)}
          >
            <option value="">— None —</option>
            {recipes.map((r) => (
              <option key={r.recipeId} value={r.recipeId}>{r.recipeName}</option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={2}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
          />
        </div>

        <div className="col-span-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setField('isAvailable', !form.isAvailable)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                form.isAvailable ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  form.isAvailable ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </div>
            <span className="text-sm text-gray-700">Available on billing screen</span>
          </label>
        </div>
      </div>

      {/* Recipe cost preview */}
      {linkedRecipe && (
        <RecipeCostPreview recipe={linkedRecipe} sellingPrice={Number(form.sellingPrice) || 0} />
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Saving…' : isEdit ? 'Update Item' : 'Create Item'}
        </button>
      </div>
    </form>
  );
}

function RecipeCostPreview({ recipe, sellingPrice }) {
  const cost   = computeRecipeCost(recipe.ingredients ?? []);
  const margin = sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : null;
  return (
    <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm grid grid-cols-3 gap-3">
      <div>
        <p className="text-gray-500 text-xs">Recipe Cost</p>
        <p className="font-semibold text-gray-800">{formatCurrency(cost)}</p>
        <p className="text-gray-400 text-xs">from {recipe.recipeName}</p>
      </div>
      <div>
        <p className="text-gray-500 text-xs">Selling Price</p>
        <p className="font-semibold text-gray-800">{sellingPrice > 0 ? formatCurrency(sellingPrice) : '—'}</p>
      </div>
      <div>
        <p className="text-gray-500 text-xs">Profit Margin</p>
        <p className={`font-semibold ${margin !== null && margin < 0 ? 'text-red-600' : 'text-green-600'}`}>
          {margin !== null ? `${margin.toFixed(1)}%` : '—'}
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MenuMasterPage() {
  const { activeCompanyId } = useApp();
  const [menuItems, setMenuItems]   = useState([]);
  const [recipes, setRecipes]       = useState([]);
  const [inventory, setInventory]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [formOpen, setFormOpen]     = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [catFilter, setCatFilter]   = useState('All');
  const [search, setSearch]         = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const [items, rs, inv] = await Promise.all([
        listMenuItems(activeCompanyId),
        listRecipes(activeCompanyId),
        listInventoryItems(activeCompanyId),
      ]);
      setMenuItems(items);
      setRecipes(rs);
      setInventory(inv);
    } catch (err) {
      setError(err.message ?? 'Failed to load menu items.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const recMap = useMemo(() => recipeMap(recipes), [recipes]);
  const invMap = useMemo(() => inventoryMap(inventory), [inventory]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return menuItems
      .filter((m) => {
        if (catFilter !== 'All' && m.category !== catFilter) return false;
        if (term && !(m.itemName ?? '').toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => {
        const catDiff = MENU_CATEGORIES.indexOf(a.category) - MENU_CATEGORIES.indexOf(b.category);
        if (catDiff !== 0) return catDiff;
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

  async function handleToggleAvailable(item) {
    await toggleMenuItemAvailability(activeCompanyId, item.menuItemId, !item.isAvailable);
    setMenuItems((prev) =>
      prev.map((m) => m.menuItemId === item.menuItemId ? { ...m, isAvailable: !m.isAvailable } : m)
    );
  }

  function openEdit(item) { setEditItem(item); setFormOpen(true); }
  function openNew()  { setEditItem(null); setFormOpen(true); }

  const categoryBadgeColor = {
    Food:     'bg-orange-50 text-orange-700',
    Beverage: 'bg-blue-50 text-blue-700',
    Dessert:  'bg-pink-50 text-pink-700',
    Extras:   'bg-gray-100 text-gray-600',
    Specials: 'bg-purple-50 text-purple-700',
  };

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
          <button onClick={openNew}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + New Menu Item
          </button>
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
        <div className="flex gap-1">
          {['All', ...MENU_CATEGORIES].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCatFilter(c)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                catFilter === c
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
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
          {/* Table header */}
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
              const recipe  = recMap[item.linkedRecipeId] ?? null;
              const cost    = getLiveCost(recipe, invMap);
              const sell    = Number(item.sellingPrice) || 0;
              const margin  = cost !== null && sell > 0
                ? ((sell - cost) / sell) * 100
                : null;
              const lowStock = hasLowStockIngredient(recipe, invMap);

              return (
                <div
                  key={item.menuItemId}
                  className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 items-center px-5 py-3 text-sm transition hover:bg-gray-50 ${
                    !item.isAvailable ? 'opacity-50' : ''
                  }`}
                >
                  {/* Item name + meta */}
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">{item.itemName}</p>
                        {lowStock && (
                          <span title="One or more ingredients are below reorder level" className="text-amber-500 flex-shrink-0">
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                            </svg>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryBadgeColor[item.category] ?? 'bg-gray-100 text-gray-600'}`}>
                          {item.category}
                        </span>
                        {item.linkedRecipeId && (
                          <span className="text-[10px] text-gray-400">
                            Recipe linked
                          </span>
                        )}
                        {item.description && (
                          <span className="text-[10px] text-gray-400 truncate max-w-[160px]" title={item.description}>
                            {item.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Selling price */}
                  <div className="font-medium text-gray-900">{formatCurrency(sell)}</div>

                  {/* Cost price (from recipe) */}
                  <div className="text-gray-600">
                    {cost !== null ? formatCurrency(cost) : <span className="text-gray-300">—</span>}
                  </div>

                  {/* Margin */}
                  <div>
                    {margin !== null ? (
                      <span className={`font-medium ${margin < 0 ? 'text-red-600' : margin < 20 ? 'text-amber-600' : 'text-green-600'}`}>
                        {margin.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>

                  {/* GST */}
                  <div className="text-gray-500">{item.gstRate}%</div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Available toggle */}
                    <RoleGuard permission="edit">
                      <button
                        type="button"
                        title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}
                        onClick={() => handleToggleAvailable(item)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                          item.isAvailable ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            item.isAvailable ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </RoleGuard>
                    <RoleGuard permission="edit">
                      <button onClick={() => openEdit(item)}
                        className="text-xs text-blue-600 hover:underline">Edit</button>
                    </RoleGuard>
                    <RoleGuard permission="delete">
                      <button onClick={() => handleDelete(item)}
                        className="text-xs text-red-500 hover:underline">Delete</button>
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
          recipes={recipes}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditItem(null); }}
        />
      </Modal>
    </div>
  );
}
