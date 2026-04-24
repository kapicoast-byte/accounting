import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { listProductionLogs, createProductionLog } from '../services/productionService';
import { listRecipes, computeRecipeCost } from '../services/recipeService';
import { listInventoryItems } from '../services/inventoryService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';

function toDateStr(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProductionForm({ recipes, inventory, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    recipeId: '',
    portions: '',
    date:     today,
    notes:    '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const selectedRecipe = recipes.find((r) => r.recipeId === form.recipeId);

  const enrichedIngredients = useMemo(() => {
    if (!selectedRecipe) return [];
    return (selectedRecipe.ingredients ?? []).map((ing) => {
      const inv = inventory.find((it) => it.itemId === ing.itemId);
      return { ...ing, costPrice: inv?.costPrice ?? ing.costPrice ?? 0, currentStock: inv?.currentStock ?? 0 };
    });
  }, [selectedRecipe, inventory]);

  const costPerServing = useMemo(() => computeRecipeCost(enrichedIngredients), [enrichedIngredients]);
  const portions       = Number(form.portions) || 0;
  const totalCost      = costPerServing * portions;

  const insufficientIngredients = useMemo(() => {
    if (!portions) return [];
    return enrichedIngredients.filter((ing) => {
      const needed = (Number(ing.qty) || 0) * portions;
      return needed > (ing.currentStock || 0);
    });
  }, [enrichedIngredients, portions]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (insufficientIngredients.length > 0) {
      setError(`Insufficient stock for: ${insufficientIngredients.map((i) => i.itemName).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        recipeId:       form.recipeId,
        recipeName:     selectedRecipe.recipeName,
        portions,
        ingredients:    enrichedIngredients,
        costPerServing,
        date:           form.date,
        notes:          form.notes,
      });
    } catch (err) {
      setError(err.message ?? 'Failed to log production.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Recipe *</label>
        <select
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.recipeId}
          onChange={(e) => setField('recipeId', e.target.value)}
        >
          <option value="">Select recipe</option>
          {recipes.map((r) => (
            <option key={r.recipeId} value={r.recipeId}>{r.recipeName} ({r.category})</option>
          ))}
        </select>
      </div>

      {selectedRecipe && (
        <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <p className="font-medium text-gray-700 mb-1">{selectedRecipe.recipeName}</p>
          <p>{selectedRecipe.ingredients?.length ?? 0} ingredients · Cost/serving: {formatCurrency(costPerServing)}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Portions to Produce *</label>
          <input
            required type="number" min="0.01" step="0.01"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.portions}
            onChange={(e) => setField('portions', e.target.value)}
          />
          {portions > 0 && costPerServing > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">Total cost: {formatCurrency(totalCost)}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
          <input
            required type="date"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.date}
            onChange={(e) => setField('date', e.target.value)}
          />
        </div>
      </div>

      {/* Ingredient deduction preview */}
      {selectedRecipe && portions > 0 && enrichedIngredients.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Ingredient Deductions</p>
          <table className="w-full text-xs">
            <thead className="text-gray-500 border-b">
              <tr>
                <th className="text-left py-1">Item</th>
                <th className="text-right py-1">Need</th>
                <th className="text-right py-1">Available</th>
                <th className="text-right py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {enrichedIngredients.map((ing, i) => {
                const needed = (Number(ing.qty) || 0) * portions;
                const ok     = ing.currentStock >= needed;
                return (
                  <tr key={i} className={`border-b border-gray-100 ${!ok ? 'bg-red-50' : ''}`}>
                    <td className="py-1">{ing.itemName}</td>
                    <td className="py-1 text-right">{needed.toFixed(3)} {ing.unit}</td>
                    <td className="py-1 text-right">{ing.currentStock} {ing.unit}</td>
                    <td className="py-1 text-right">
                      {ok ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-red-600">✗ Short {(needed - ing.currentStock).toFixed(3)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <input
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.notes}
          onChange={(e) => setField('notes', e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded border border-gray-300 px-4 py-2 text-sm">Cancel</button>
        <button
          type="submit" disabled={saving || insufficientIngredients.length > 0}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Logging…' : 'Log Production'}
        </button>
      </div>
    </form>
  );
}

export default function ProductionPage() {
  const { activeCompanyId, user } = useApp();
  const [logs, setLogs]           = useState([]);
  const [recipes, setRecipes]     = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [formOpen, setFormOpen]   = useState(false);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const [ls, rs, inv] = await Promise.all([
        listProductionLogs(activeCompanyId),
        listRecipes(activeCompanyId),
        listInventoryItems(activeCompanyId),
      ]);
      setLogs(ls);
      setRecipes(rs);
      setInventory(inv);
    } catch (err) {
      setError(err.message ?? 'Failed to load production data.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    await createProductionLog(activeCompanyId, { ...form, createdBy: user?.uid });
    setFormOpen(false);
    await load();
  }

  const totalCostThisMonth = useMemo(() => {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return logs
      .filter((l) => {
        const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
        return d >= start;
      })
      .reduce((s, l) => s + (l.totalCost || 0), 0);
  }, [logs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production Log</h1>
          <p className="text-sm text-gray-500">Track bulk recipe preparation and ingredient deductions</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          + Log Production
        </button>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Summary card */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 w-64">
        <p className="text-sm text-gray-500">Production Cost This Month</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalCostThisMonth)}</p>
      </div>

      {loading ? <LoadingSpinner /> : logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-gray-400">
          No production logs yet.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Recipe</th>
                <th className="px-4 py-3 text-right">Portions</th>
                <th className="px-4 py-3 text-right">Cost/serving</th>
                <th className="px-4 py-3 text-right">Total Cost</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.productionId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{toDateStr(log.date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{log.recipeName}</td>
                  <td className="px-4 py-3 text-right">{log.portions}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(log.costPerServing)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(log.totalCost)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{log.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Log Production Run" size="lg">
        <ProductionForm
          recipes={recipes}
          inventory={inventory}
          onSave={handleSave}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>
    </div>
  );
}
