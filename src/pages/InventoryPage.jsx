import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  listInventoryItems,
  deleteInventoryItem,
  computeStockValuation,
  isLowStock,
} from '../services/inventoryService';
import { INVENTORY_CATEGORIES } from '../utils/inventoryConstants';
import { formatCurrency, formatNumber } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import RoleGuard from '../components/RoleGuard';
import ItemFormModal from '../components/inventory/ItemFormModal';
import StockAdjustmentModal from '../components/inventory/StockAdjustmentModal';
import StockValuationCard from '../components/inventory/StockValuationCard';
import FilterBar from '../components/FilterBar';

const ALL = 'All';

export default function InventoryPage() {
  const { user, activeCompanyId, isConsolidated, consolidatedIds, companies } = useApp();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [editingItem, setEditingItem] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);

  const consolidatedKey = consolidatedIds.join(',');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      if (isConsolidated && consolidatedIds.length > 1) {
        const nameMap = Object.fromEntries(companies.map((c) => [c.companyId, c.companyName]));
        const results = await Promise.all(consolidatedIds.map((id) => listInventoryItems(id)));
        const allItems = results.flatMap((list, i) =>
          list.map((item) => ({
            ...item,
            _companyId:   consolidatedIds[i],
            _companyName: nameMap[consolidatedIds[i]] ?? consolidatedIds[i],
          })),
        );
        setItems(allItems);
      } else {
        const list = await listInventoryItems(activeCompanyId);
        setItems(list);
      }
    } catch (err) {
      setError(err.message ?? 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, consolidatedKey, isConsolidated]);

  useEffect(() => {
    setItems([]);
    load();
  }, [load]);

  const valuation = useMemo(() => computeStockValuation(items), [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((it) => {
      if (categoryFilter !== ALL && it.category !== categoryFilter) return false;
      if (lowStockOnly && !isLowStock(it)) return false;
      if (term && !(it.itemName ?? '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, search, categoryFilter, lowStockOnly]);

  function openCreate() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setFormOpen(true);
  }

  async function handleDelete(item) {
    if (!confirm(`Delete "${item.itemName}"? This cannot be undone.`)) return;
    try {
      await deleteInventoryItem(activeCompanyId, item.itemId);
      await load();
    } catch (err) {
      alert(err.message ?? 'Failed to delete item.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
            {isConsolidated && (
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                Consolidated
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {isConsolidated
              ? `Showing stock across ${consolidatedIds.length} companies`
              : 'Manage raw materials, finished dishes, beverages and packaging.'}
          </p>
        </div>
        {!isConsolidated && (
          <RoleGuard permission="edit">
            <button
              type="button"
              onClick={openCreate}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Add item
            </button>
          </RoleGuard>
        )}
      </div>

      <StockValuationCard valuation={valuation} />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <FilterBar
        search={search} onSearch={setSearch} searchPlaceholder="Search items…"
        selects={[{
          value: categoryFilter,
          onChange: setCategoryFilter,
          options: [{ value: ALL, label: 'All categories' }, ...INVENTORY_CATEGORIES.map((c) => ({ value: c, label: c }))],
        }]}
        extra={
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-3)', cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
            Low stock only
          </label>
        }
        count={`${filtered.length} of ${items.length}${isConsolidated ? ` (${consolidatedIds.length} cos)` : ''}`}
      />

      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {items.length === 0
              ? 'No inventory items yet. Click "Add item" to create your first one.'
              : 'No items match the current filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  {isConsolidated && <th className="px-4 py-2">Company</th>}
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Stock</th>
                  <th className="px-4 py-2 text-right">Reorder ≤</th>
                  <th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-right">Selling</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  {!isConsolidated && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => {
                  const low = isLowStock(item);
                  const value = (Number(item.currentStock) || 0) * (Number(item.costPrice) || 0);
                  return (
                    <tr key={`${item._companyId ?? activeCompanyId}-${item.itemId}`} className={low ? 'bg-red-50/50' : ''}>
                      {isConsolidated && (
                        <td className="px-4 py-2 text-xs text-indigo-700 font-medium whitespace-nowrap">
                          {item._companyName}
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-800">{item.itemName}</div>
                        <div className="text-xs text-gray-400">
                          {item.unit}
                          {item.isActive === false && (
                            <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] uppercase text-gray-600">
                              inactive
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{item.category}</td>
                      <td className={`px-4 py-2 text-right font-medium ${low ? 'text-red-700' : 'text-gray-800'}`}>
                        {formatNumber(item.currentStock ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">
                        {formatNumber(item.reorderLevel ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {formatCurrency(item.costPrice ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {formatCurrency(item.sellingPrice ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">
                        {formatCurrency(value)}
                      </td>
                      {!isConsolidated && (
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setAdjustItem(item)}
                              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50"
                            >
                              Adjust
                            </button>
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
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ItemFormModal
        open={formOpen}
        companyId={activeCompanyId}
        item={editingItem}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />

      <StockAdjustmentModal
        open={!!adjustItem}
        companyId={activeCompanyId}
        item={adjustItem}
        userId={user?.uid}
        onClose={() => setAdjustItem(null)}
        onSaved={load}
      />
    </div>
  );
}
