import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { listWastageEntries, createWastageEntry, WASTAGE_REASONS } from '../services/wastageService';
import { listInventoryItems } from '../services/inventoryService';
import { formatCurrency } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';

function toDateStr(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfDay(d) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function WastageForm({ inventoryItems, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    itemId:   '',
    quantity: '',
    reason:   WASTAGE_REASONS[0],
    date:     today,
    notes:    '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const selectedItem = inventoryItems.find((it) => it.itemId === form.itemId);

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Inventory Item *</label>
        <select
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.itemId}
          onChange={(e) => setField('itemId', e.target.value)}
        >
          <option value="">Select item</option>
          {inventoryItems.map((it) => (
            <option key={it.itemId} value={it.itemId}>
              {it.itemName} (stock: {it.currentStock} {it.unit})
            </option>
          ))}
        </select>
      </div>

      {selectedItem && (
        <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 grid grid-cols-3 gap-3">
          <div><span className="text-gray-400">Unit</span><p className="font-medium">{selectedItem.unit}</p></div>
          <div><span className="text-gray-400">Cost/unit</span><p className="font-medium">{formatCurrency(selectedItem.costPrice)}</p></div>
          <div><span className="text-gray-400">Stock</span><p className="font-medium">{selectedItem.currentStock}</p></div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Wasted *</label>
          <input
            required type="number" min="0.001" step="0.001"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.quantity}
            onChange={(e) => setField('quantity', e.target.value)}
          />
          {selectedItem && form.quantity && (
            <p className="text-xs text-gray-400 mt-0.5">
              Wastage cost: {formatCurrency(Number(form.quantity) * (selectedItem.costPrice || 0))}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
          <select
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.reason}
            onChange={(e) => setField('reason', e.target.value)}
          >
            {WASTAGE_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded border border-gray-300 px-4 py-2 text-sm">Cancel</button>
        <button type="submit" disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Saving…' : 'Record Wastage'}
        </button>
      </div>
    </form>
  );
}

export default function WastagePage() {
  const { activeCompanyId, user } = useApp();

  const now      = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const defaultFrom = thisMonthStart.toISOString().slice(0, 10);
  const defaultTo   = now.toISOString().slice(0, 10);

  const [entries, setEntries]     = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [formOpen, setFormOpen]   = useState(false);
  const [fromDate, setFromDate]   = useState(defaultFrom);
  const [toDate, setToDate]       = useState(defaultTo);
  const [tab, setTab]             = useState('list'); // 'list' | 'report'

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const [ents, inv] = await Promise.all([
        listWastageEntries(activeCompanyId),
        listInventoryItems(activeCompanyId),
      ]);
      setEntries(ents);
      setInventory(inv);
    } catch (err) {
      setError(err.message ?? 'Failed to load wastage data.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  // Filtered for list tab
  const filtered = useMemo(() => {
    const from = new Date(fromDate);
    const to   = endOfDay(new Date(toDate));
    return entries.filter((e) => {
      const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
      return d >= from && d <= to;
    });
  }, [entries, fromDate, toDate]);

  // Report: this month vs last month
  const report = useMemo(() => {
    const thisMonth = entries.filter((e) => {
      const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
      return d >= thisMonthStart && d <= endOfDay(now);
    });
    const lastMonth = entries.filter((e) => {
      const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });

    const totalCostThis = thisMonth.reduce((s, e) => s + (e.totalCost || 0), 0);
    const totalCostLast = lastMonth.reduce((s, e) => s + (e.totalCost || 0), 0);

    // By item
    const byItem = {};
    thisMonth.forEach((e) => {
      if (!byItem[e.itemName]) byItem[e.itemName] = { qty: 0, cost: 0 };
      byItem[e.itemName].qty  += e.quantity || 0;
      byItem[e.itemName].cost += e.totalCost || 0;
    });

    // By reason
    const byReason = {};
    thisMonth.forEach((e) => {
      byReason[e.reason] = (byReason[e.reason] || 0) + (e.totalCost || 0);
    });

    return { totalCostThis, totalCostLast, byItem, byReason };
  }, [entries]);

  async function handleSave(form) {
    await createWastageEntry(activeCompanyId, { ...form, createdBy: user?.uid });
    setFormOpen(false);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wastage Tracking</h1>
          <p className="text-sm text-gray-500">Record and monitor ingredient wastage</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          + Record Wastage
        </button>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {['list', 'report'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'list' ? 'Wastage Log' : 'Report'}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : tab === 'list' ? (
        <>
          <div className="flex gap-3 items-center flex-wrap">
            <label className="text-sm text-gray-600">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
            <label className="text-sm text-gray-600">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
            <span className="text-xs text-gray-400">{filtered.length} entries</span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-gray-400">
              No wastage entries in this period.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((e) => (
                    <tr key={e.wastageId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{toDateStr(e.date)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{e.itemName}</td>
                      <td className="px-4 py-3 text-right">{e.quantity} {e.unit}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700">{e.reason}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-600">{formatCurrency(e.totalCost)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{e.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t">
                    <td colSpan={4} className="px-4 py-2 text-sm font-medium text-gray-600">Total</td>
                    <td className="px-4 py-2 text-right font-semibold text-red-600">
                      {formatCurrency(filtered.reduce((s, e) => s + (e.totalCost || 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      ) : (
        /* Report tab */
        <div className="space-y-6">
          {/* Month comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">This Month Wastage Cost</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(report.totalCostThis)}</p>
              {report.totalCostLast > 0 && (
                <p className={`text-xs mt-1 ${report.totalCostThis > report.totalCostLast ? 'text-red-500' : 'text-green-500'}`}>
                  {report.totalCostThis > report.totalCostLast ? '↑' : '↓'}{' '}
                  {Math.abs(((report.totalCostThis - report.totalCostLast) / report.totalCostLast) * 100).toFixed(1)}% vs last month
                </p>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Last Month Wastage Cost</p>
              <p className="text-2xl font-bold text-gray-700 mt-1">{formatCurrency(report.totalCostLast)}</p>
            </div>
          </div>

          {/* By item */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="font-medium text-gray-900">Wastage by Item (This Month)</p>
            </div>
            {Object.keys(report.byItem).length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No data for this month.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 bg-gray-50">
                  <tr>
                    <th className="px-5 py-2 text-left">Item</th>
                    <th className="px-5 py-2 text-right">Qty Wasted</th>
                    <th className="px-5 py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(report.byItem)
                    .sort((a, b) => b[1].cost - a[1].cost)
                    .map(([name, data]) => (
                      <tr key={name} className="hover:bg-gray-50">
                        <td className="px-5 py-2">{name}</td>
                        <td className="px-5 py-2 text-right">{data.qty.toFixed(2)}</td>
                        <td className="px-5 py-2 text-right font-medium text-red-600">{formatCurrency(data.cost)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>

          {/* By reason */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="font-medium text-gray-900">Wastage by Reason (This Month)</p>
            </div>
            {Object.keys(report.byReason).length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No data for this month.</p>
            ) : (
              <div className="p-5 space-y-3">
                {Object.entries(report.byReason)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, cost]) => {
                    const pct = report.totalCostThis > 0
                      ? (cost / report.totalCostThis) * 100
                      : 0;
                    return (
                      <div key={reason}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{reason}</span>
                          <span className="font-medium text-gray-900">{formatCurrency(cost)} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full bg-orange-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Record Wastage">
        <WastageForm
          inventoryItems={inventory}
          onSave={handleSave}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>
    </div>
  );
}
