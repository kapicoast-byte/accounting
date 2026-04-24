import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  listRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  computeRecipeCost,
  RECIPE_CATEGORIES,
  SERVING_UNITS,
} from '../services/recipeService';
import { listInventoryItems } from '../services/inventoryService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import RoleGuard from '../components/RoleGuard';
import Modal from '../components/Modal';

const EMPTY_INGREDIENT = { itemId: '', itemName: '', unit: '', qty: '', costPrice: 0 };

function RecipeForm({ recipe, inventoryItems, onSave, onCancel }) {
  const isEdit = !!recipe?.recipeId;
  const [form, setForm] = useState({
    recipeName:   recipe?.recipeName   ?? '',
    category:     recipe?.category     ?? RECIPE_CATEGORIES[0],
    servingSize:  recipe?.servingSize  ?? 1,
    servingUnit:  recipe?.servingUnit  ?? SERVING_UNITS[0],
    prepTime:     recipe?.prepTime     ?? 0,
    cookTime:     recipe?.cookTime     ?? 0,
    instructions: recipe?.instructions ?? '',
    sellingPrice: recipe?.sellingPrice ?? '',
    ingredients:  recipe?.ingredients  ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addIngredient() {
    setForm((f) => ({ ...f, ingredients: [...f.ingredients, { ...EMPTY_INGREDIENT }] }));
  }

  function removeIngredient(i) {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, idx) => idx !== i) }));
  }

  function updateIngredient(i, key, value) {
    setForm((f) => {
      const ings = [...f.ingredients];
      ings[i] = { ...ings[i], [key]: value };
      if (key === 'itemId') {
        const inv = inventoryItems.find((it) => it.itemId === value);
        if (inv) {
          ings[i].itemName  = inv.itemName;
          ings[i].unit      = inv.unit;
          ings[i].costPrice = inv.costPrice;
        }
      }
      return { ...f, ingredients: ings };
    });
  }

  const costPerServing = useMemo(() => computeRecipeCost(form.ingredients), [form.ingredients]);
  const sellingPrice   = Number(form.sellingPrice) || 0;
  const margin         = sellingPrice > 0 ? ((sellingPrice - costPerServing) / sellingPrice) * 100 : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message ?? 'Failed to save recipe.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Recipe Name *</label>
          <input
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.recipeName}
            onChange={(e) => setField('recipeName', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.category}
            onChange={(e) => setField('category', e.target.value)}
          >
            {RECIPE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Serving Size</label>
            <input
              type="number" min="0.01" step="0.01"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.servingSize}
              onChange={(e) => setField('servingSize', e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.servingUnit}
              onChange={(e) => setField('servingUnit', e.target.value)}
            >
              {SERVING_UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prep Time (min)</label>
          <input
            type="number" min="0"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.prepTime}
            onChange={(e) => setField('prepTime', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cook Time (min)</label>
          <input
            type="number" min="0"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.cookTime}
            onChange={(e) => setField('cookTime', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (per serving)</label>
          <input
            type="number" min="0" step="0.01"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.sellingPrice}
            onChange={(e) => setField('sellingPrice', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Instructions / Notes</label>
        <textarea
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.instructions}
          onChange={(e) => setField('instructions', e.target.value)}
        />
      </div>

      {/* Ingredients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Ingredients</span>
          <button type="button" onClick={addIngredient}
            className="text-xs text-blue-600 hover:underline">
            + Add Ingredient
          </button>
        </div>
        {form.ingredients.length === 0 && (
          <p className="text-xs text-gray-400">No ingredients added yet.</p>
        )}
        <div className="space-y-2">
          {form.ingredients.map((ing, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                {i === 0 && <p className="text-xs text-gray-500 mb-1">Item</p>}
                <select
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={ing.itemId}
                  onChange={(e) => updateIngredient(i, 'itemId', e.target.value)}
                >
                  <option value="">Select item</option>
                  {inventoryItems.map((it) => (
                    <option key={it.itemId} value={it.itemId}>{it.itemName}</option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                {i === 0 && <p className="text-xs text-gray-500 mb-1">Qty / serving</p>}
                <input
                  type="number" min="0" step="0.001"
                  placeholder="Qty"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={ing.qty}
                  onChange={(e) => updateIngredient(i, 'qty', e.target.value)}
                />
              </div>
              <div className="w-20">
                {i === 0 && <p className="text-xs text-gray-500 mb-1">Unit</p>}
                <input
                  readOnly
                  className="w-full rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
                  value={ing.unit}
                />
              </div>
              <div className="w-28">
                {i === 0 && <p className="text-xs text-gray-500 mb-1">Cost/unit</p>}
                <input
                  readOnly
                  className="w-full rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
                  value={formatCurrency(ing.costPrice)}
                />
              </div>
              <button type="button" onClick={() => removeIngredient(i)}
                className="mb-0.5 text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
            </div>
          ))}
        </div>
      </div>

      {/* Cost summary */}
      {form.ingredients.length > 0 && (
        <div className="rounded-lg bg-blue-50 p-3 text-sm grid grid-cols-3 gap-3">
          <div>
            <p className="text-gray-500 text-xs">Cost / serving</p>
            <p className="font-semibold text-gray-800">{formatCurrency(costPerServing)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Selling price</p>
            <p className="font-semibold text-gray-800">{sellingPrice > 0 ? formatCurrency(sellingPrice) : '—'}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Margin</p>
            <p className={`font-semibold ${margin !== null && margin < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {margin !== null ? `${margin.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded border border-gray-300 px-4 py-2 text-sm">Cancel</button>
        <button type="submit" disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Saving…' : isEdit ? 'Update Recipe' : 'Create Recipe'}
        </button>
      </div>
    </form>
  );
}

export default function RecipesPage() {
  const { activeCompanyId } = useApp();
  const [recipes, setRecipes]       = useState([]);
  const [inventory, setInventory]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [formOpen, setFormOpen]     = useState(false);
  const [editRecipe, setEditRecipe] = useState(null);
  const [viewRecipe, setViewRecipe] = useState(null);
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('All');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const [rs, inv] = await Promise.all([
        listRecipes(activeCompanyId),
        listInventoryItems(activeCompanyId),
      ]);
      setRecipes(rs);
      setInventory(inv);
    } catch (err) {
      setError(err.message ?? 'Failed to load recipes.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return recipes.filter((r) => {
      if (catFilter !== 'All' && r.category !== catFilter) return false;
      if (term && !(r.recipeName ?? '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [recipes, search, catFilter]);

  async function handleSave(form) {
    if (editRecipe) {
      await updateRecipe(activeCompanyId, editRecipe.recipeId, form);
    } else {
      await createRecipe(activeCompanyId, form);
    }
    setFormOpen(false);
    setEditRecipe(null);
    await load();
  }

  async function handleDelete(recipe) {
    if (!window.confirm(`Delete recipe "${recipe.recipeName}"?`)) return;
    await deleteRecipe(activeCompanyId, recipe.recipeId);
    await load();
  }

  function openEdit(recipe) {
    setEditRecipe(recipe);
    setFormOpen(true);
  }

  function openNew() {
    setEditRecipe(null);
    setFormOpen(true);
  }

  // Resolve live costs from current inventory for a recipe
  function getLiveCost(recipe) {
    return computeRecipeCost(
      (recipe.ingredients ?? []).map((ing) => {
        const inv = inventory.find((it) => it.itemId === ing.itemId);
        return { ...ing, costPrice: inv?.costPrice ?? ing.costPrice ?? 0 };
      }),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
          <p className="text-sm text-gray-500">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>
        </div>
        <RoleGuard permission="edit">
          <button onClick={openNew}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            + New Recipe
          </button>
        </RoleGuard>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3 flex-wrap">
        <input
          placeholder="Search recipes…"
          className="rounded border border-gray-300 px-3 py-2 text-sm w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
        >
          <option value="All">All Categories</option>
          {RECIPE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-gray-400">
          {recipes.length === 0 ? 'No recipes yet. Create your first recipe.' : 'No recipes match your filter.'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => {
            const cost   = getLiveCost(recipe);
            const sell   = Number(recipe.sellingPrice) || 0;
            const margin = sell > 0 ? ((sell - cost) / sell) * 100 : null;
            return (
              <div key={recipe.recipeId}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => setViewRecipe(recipe)}
                      className="text-left font-semibold text-gray-900 hover:text-blue-600 truncate block w-full"
                    >
                      {recipe.recipeName}
                    </button>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {recipe.category} · {recipe.servingSize} {recipe.servingUnit}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 flex-shrink-0">
                    {recipe.ingredients?.length ?? 0} ingredients
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-gray-400">Cost</p>
                    <p className="font-medium text-gray-800">{formatCurrency(cost)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Selling</p>
                    <p className="font-medium text-gray-800">{sell > 0 ? formatCurrency(sell) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Margin</p>
                    <p className={`font-medium ${margin !== null && margin < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {margin !== null ? `${margin.toFixed(1)}%` : '—'}
                    </p>
                  </div>
                </div>
                {(recipe.prepTime > 0 || recipe.cookTime > 0) && (
                  <p className="mt-2 text-xs text-gray-400">
                    Prep {recipe.prepTime}m · Cook {recipe.cookTime}m
                  </p>
                )}
                <RoleGuard permission="edit">
                  <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                    <button onClick={() => openEdit(recipe)}
                      className="text-xs text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => handleDelete(recipe)}
                      className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </RoleGuard>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditRecipe(null); }}
        title={editRecipe ? 'Edit Recipe' : 'New Recipe'}
        size="lg"
      >
        <RecipeForm
          recipe={editRecipe}
          inventoryItems={inventory}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditRecipe(null); }}
        />
      </Modal>

      {/* View detail modal */}
      {viewRecipe && (
        <Modal
          open={!!viewRecipe}
          onClose={() => setViewRecipe(null)}
          title={viewRecipe.recipeName}
          size="lg"
        >
          <RecipeDetail recipe={viewRecipe} inventory={inventory} />
        </Modal>
      )}
    </div>
  );
}

function RecipeDetail({ recipe, inventory }) {
  const cost   = computeRecipeCost(
    (recipe.ingredients ?? []).map((ing) => {
      const inv = inventory.find((it) => it.itemId === ing.itemId);
      return { ...ing, costPrice: inv?.costPrice ?? ing.costPrice ?? 0 };
    }),
  );
  const sell   = Number(recipe.sellingPrice) || 0;
  const margin = sell > 0 ? ((sell - cost) / sell) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4 text-sm">
        <div>
          <p className="text-gray-400 text-xs">Category</p>
          <p className="font-medium">{recipe.category}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Serving</p>
          <p className="font-medium">{recipe.servingSize} {recipe.servingUnit}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Prep + Cook</p>
          <p className="font-medium">{recipe.prepTime + recipe.cookTime} min</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 rounded-lg bg-blue-50 p-4 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Cost / serving</p>
          <p className="font-semibold text-gray-900">{formatCurrency(cost)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Selling price</p>
          <p className="font-semibold text-gray-900">{sell > 0 ? formatCurrency(sell) : '—'}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Margin</p>
          <p className={`font-semibold ${margin !== null && margin < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {margin !== null ? `${margin.toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      {recipe.ingredients?.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Ingredients</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b">
                <th className="text-left py-1">Item</th>
                <th className="text-right py-1">Qty</th>
                <th className="text-right py-1">Unit</th>
                <th className="text-right py-1">Cost/unit</th>
                <th className="text-right py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {recipe.ingredients.map((ing, i) => {
                const inv  = inventory.find((it) => it.itemId === ing.itemId);
                const cp   = inv?.costPrice ?? ing.costPrice ?? 0;
                const total = (Number(ing.qty) || 0) * cp;
                return (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5">{ing.itemName || '—'}</td>
                    <td className="py-1.5 text-right">{ing.qty}</td>
                    <td className="py-1.5 text-right text-gray-500">{ing.unit}</td>
                    <td className="py-1.5 text-right">{formatCurrency(cp)}</td>
                    <td className="py-1.5 text-right font-medium">{formatCurrency(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {recipe.instructions && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">Instructions</p>
          <p className="text-sm text-gray-600 whitespace-pre-line">{recipe.instructions}</p>
        </div>
      )}
    </div>
  );
}
