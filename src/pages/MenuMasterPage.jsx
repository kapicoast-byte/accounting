import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  MENU_CATEGORIES,
} from '../services/menuService';
import { listRecipes, computeRecipeCost } from '../services/recipeService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import RoleGuard from '../components/RoleGuard';

const ALL = 'All';

function MenuItemForm({ item, recipes, onSave, onClose, saving, error }) {
  const { taxRates, taxLabel } = useApp();
  const defaultRate = taxRates.find((r) => r > 0) ?? taxRates[0] ?? 0;

  const [form, setForm] = useState({
    itemName:       item?.itemName       ?? '',
    category:       item?.category       ?? MENU_CATEGORIES[0],
    sellingPrice:   item?.sellingPrice   ?? '',
    gstRate:        item?.gstRate        ?? defaultRate,
    linkedRecipeId: item?.linkedRecipeId ?? '',
    unit:           item?.unit           ?? 'portion',
    description:    item?.description    ?? '',
    isAvailable:    item?.isAvailable    !== false,
    displayOrder:   item?.displayOrder   ?? 0,
  });

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleRecipeChange(recipeId) {
    const recipe = recipes.find((r) => r.recipeId === recipeId);
    set('linkedRecipeId', recipeId);
    if (recipe) {
      if (!form.unit || form.unit === 'portion') set('unit', recipe.servingUnit ?? 'portion');
      if (!form.sellingPrice && recipe.sellingPrice > 0) set('sellingPrice', String(recipe.sellingPrice));
    }
  }

  const linkedRecipe = form.linkedRecipeId
    ? recipes.find((r) => r.recipeId === form.linkedRecipeId)
    : null;

  const recipeCost = linkedRecipe ? computeRecipeCost(linkedRecipe.ingredients ?? []) : null;
  const sellingNum = Number(form.sellingPrice) || 0;
  const margin = recipeCost !== null && sellingNum > 0
    ? ((sellingNum - recipeCost) / sellingNum) * 100
    : null;

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      itemName:       form.itemName,
      category:       form.category,
      sellingPrice:   Number(form.sellingPrice) || 0,
      gstRate:        Number(form.gstRate)       || 0,
      linkedRecipeId: form.linkedRecipeId        || null,
      unit:           form.unit,
      description:    form.description,
      isAvailable:    form.isAvailable,
      displayOrder:   Number(form.displayOrder)  || 0,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {item ? 'Edit Menu Item' : 'Add Menu Item'}
          </h2>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <p className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item name *</label>
            <input
              required
              value={form.itemName}
              onChange={(e) => set('itemName', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                {MENU_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{taxLabel ?? 'Tax'} Rate</label>
              <select
                value={form.gstRate}
                onChange={(e) => set('gstRate', Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                {taxRates.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling price *</label>
              <input
                required
                type="number" min="0" step="0.01"
                value={form.sellingPrice}
                onChange={(e) => set('sellingPrice', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              {margin !== null && (
                <p className={`text-xs mt-1 ${margin >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  Cost: {formatCurrency(recipeCost)} · Margin: {margin.toFixed(1)}%
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <input
                value={form.unit}
                onChange={(e) => set('unit', e.target.value)}
                placeholder="portion"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Linked Recipe <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={form.linkedRecipeId}
              onChange={(e) => handleRecipeChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— No recipe —</option>
              {recipes.map((r) => (
                <option key={r.recipeId} value={r.recipeId}>
                  {r.recipeName} (cost: {formatCurrency(computeRecipeCost(r.ingredients ?? []))}/portion)
                </option>
              ))}
            </select>
            {linkedRecipe && (
              <p className="text-xs text-indigo-600 mt-1">
                Ingredients will be automatically deducted from inventory on each sale.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(e) => set('isAvailable', e.target.checked)}
            />
            Available for ordering
          </label>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : item ? 'Update' : 'Add item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MenuMasterPage() {
  const { activeCompanyId } = useApp();

  const [menuItems, setMenuItems] = useState([]);
  const [recipes, setRecipes]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const [search, setSearch]               = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [showUnavailable, setShowUnavailable] = useState(true);

  const [formOpen, setFormOpen]       = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState('');

  const recipeMap = useMemo(
    () => Object.fromEntries(recipes.map((r) => [r.recipeId, r])),
    [recipes],
  );

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const [items, rs] = await Promise.all([
        listMenuItems(activeCompanyId),
        listRecipes(activeCompanyId),
      ]);
      setMenuItems(items);
      setRecipes(rs);
    } catch (err) {
      setError(err.message ?? 'Failed to load menu.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    setMenuItems([]);
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return menuItems.filter((it) => {
      if (categoryFilter !== ALL && it.category !== categoryFilter) return false;
      if (!showUnavailable && it.isAvailable === false) return false;
      if (term && !(it.itemName ?? '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [menuItems, categoryFilter, showUnavailable, search]);

  function openCreate() {
    setEditingItem(null);
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setFormError('');
    setFormOpen(true);
  }

  async function handleSave(payload) {
    setSaving(true);
    setFormError('');
    try {
      if (editingItem) {
        await updateMenuItem(activeCompanyId, editingItem.menuItemId, payload);
      } else {
        await createMenuItem(activeCompanyId, payload);
      }
      setFormOpen(false);
      setEditingItem(null);
      await load();
    } catch (err) {
      setFormError(err.message ?? 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Delete "${item.itemName}"? This cannot be undone.`)) return;
    try {
      await deleteMenuItem(activeCompanyId, item.menuItemId);
      await load();
    } catch (err) {
      alert(err.message ?? 'Failed to delete item.');
    }
  }

  async function handleToggle(item) {
    const next = item.isAvailable === false;
    try {
      await toggleMenuItemAvailability(activeCompanyId, item.menuItemId, next);
      setMenuItems((prev) =>
        prev.map((m) => m.menuItemId === item.menuItemId ? { ...m, isAvailable: next } : m),
      );
    } catch (err) {
      alert(err.message ?? 'Failed to update availability.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu Master</h1>
          <p className="text-sm text-gray-500">
            Manage your F&amp;B menu items, prices, and recipe links.
          </p>
        </div>
        <RoleGuard permission="edit">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Add item
          </button>
        </RoleGuard>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={ALL}>All categories</option>
            {MENU_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showUnavailable}
              onChange={(e) => setShowUnavailable(e.target.checked)}
            />
            Show unavailable
          </label>
          <div className="ml-auto text-xs text-gray-500">
            {filtered.length} of {menuItems.length} items
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {menuItems.length === 0
              ? 'No menu items yet. Click "+ Add item" to create your first one.'
              : 'No items match the current filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-right">Margin</th>
                  <th className="px-4 py-2 text-right">GST</th>
                  <th className="px-4 py-2">Linked Recipe</th>
                  <th className="px-4 py-2">Available</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => {
                  const recipe = item.linkedRecipeId ? recipeMap[item.linkedRecipeId] : null;
                  const cost   = recipe ? computeRecipeCost(recipe.ingredients ?? []) : null;
                  const margin = cost !== null && item.sellingPrice > 0
                    ? ((item.sellingPrice - cost) / item.sellingPrice) * 100
                    : null;

                  return (
                    <tr
                      key={item.menuItemId}
                      className={item.isAvailable === false ? 'opacity-50 bg-gray-50' : ''}
                    >
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">{item.itemName}</div>
                        {item.description && (
                          <div className="text-xs text-gray-400 truncate max-w-xs">{item.description}</div>
                        )}
                        <div className="text-xs text-gray-400">{item.unit}</div>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{item.category}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">
                        {formatCurrency(item.sellingPrice)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">
                        {cost !== null ? formatCurrency(cost) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${
                        margin === null  ? 'text-gray-400' :
                        margin >= 60     ? 'text-green-700' :
                        margin >= 30     ? 'text-amber-700' : 'text-red-600'
                      }`}>
                        {margin !== null ? `${margin.toFixed(1)}%` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">{item.gstRate}%</td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {recipe
                          ? <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 font-medium">{recipe.recipeName}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleToggle(item)}
                          title={item.isAvailable !== false ? 'Mark unavailable' : 'Mark available'}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                            item.isAvailable !== false ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${
                            item.isAvailable !== false ? 'translate-x-4' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-2 text-xs">
                          <RoleGuard permission="edit">
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                          </RoleGuard>
                          <RoleGuard permission="delete">
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="rounded-md border border-red-200 bg-white px-2 py-1 text-red-700 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </RoleGuard>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <MenuItemForm
          item={editingItem}
          recipes={recipes}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditingItem(null); setFormError(''); }}
          saving={saving}
          error={formError}
        />
      )}
    </div>
  );
}
