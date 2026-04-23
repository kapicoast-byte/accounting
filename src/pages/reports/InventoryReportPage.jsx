import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { listInventoryItems, computeStockValuation, isLowStock } from '../../services/inventoryService';
import { formatCurrency } from '../../utils/format';
import ReportLayout from '../../components/reports/ReportLayout';
import { makePDF, sectionHeader, addTable, downloadPDF } from '../../utils/pdfUtils';

const STATUS_ALL  = 'All';
const STATUS_LOW  = 'Low Stock';
const STATUS_OK   = 'In Stock';

export default function InventoryReportPage() {
  const { activeCompanyId, activeCompany } = useApp();
  const [items,  setItems]  = useState([]);
  const [filter, setFilter] = useState(STATUS_ALL);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError('');
    try {
      setItems(await listInventoryItems(activeCompanyId));
    } catch (e) {
      setError(e.message ?? 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const valuation = computeStockValuation(items);

  const filtered = items.filter((item) => {
    if (filter === STATUS_LOW && !isLowStock(item)) return false;
    if (filter === STATUS_OK  && isLowStock(item))  return false;
    if (search && !item.itemName?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const lowStockCount = items.filter(isLowStock).length;

  function exportPDF() {
    const doc = makePDF({
      title: 'Inventory Report',
      subtitle: `As of ${new Date().toLocaleDateString('en-IN')}`,
      companyName: activeCompany?.companyName,
    });

    sectionHeader(doc, 'Stock Valuation by Category');
    addTable(doc, {
      head: [['Category', 'Value']],
      body: Object.entries(valuation.byCategory).map(([cat, val]) => [cat, formatCurrency(val)]),
      foot: [['Total Inventory Value', formatCurrency(valuation.totalValue)]],
    });

    sectionHeader(doc, 'Low Stock Items');
    const lowItems = items.filter(isLowStock);
    if (lowItems.length === 0) {
      // no rows — addTable handles empty body fine
    }
    addTable(doc, {
      head: [['Item', 'Category', 'Current Stock', 'Reorder Level', 'Unit']],
      body: lowItems.length > 0
        ? lowItems.map((i) => [i.itemName, i.category ?? '', i.currentStock, i.reorderLevel ?? 0, i.unit ?? ''])
        : [['No low stock items', '', '', '', '']],
    });

    sectionHeader(doc, 'Full Inventory');
    addTable(doc, {
      head: [['Item', 'Category', 'Stock', 'Unit', 'Cost Price', 'Selling Price', 'Value']],
      body: items.map((i) => [
        i.itemName,
        i.category ?? '',
        i.currentStock,
        i.unit ?? '',
        formatCurrency(i.costPrice),
        formatCurrency(i.sellingPrice),
        formatCurrency((i.currentStock ?? 0) * (i.costPrice ?? 0)),
      ]),
      foot: [['', '', '', '', '', 'Total Value', formatCurrency(valuation.totalValue)]],
    });

    downloadPDF(doc, `inventory-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <ReportLayout
      title="Inventory Report"
      subtitle={`${items.length} items · ${lowStockCount} low stock`}
      loading={loading}
      dateFilter={
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400 w-52"
          />
          {[STATUS_ALL, STATUS_OK, STATUS_LOW].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
                filter === s
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      }
      actions={
        <button
          type="button"
          onClick={exportPDF}
          disabled={items.length === 0}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          Export PDF
        </button>
      }
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Valuation summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Stock Value</p>
          <p className="mt-1 text-xl font-bold text-blue-700">{formatCurrency(valuation.totalValue)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total SKUs</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{valuation.totalItems}</p>
        </div>
        <div className={`rounded-xl border px-5 py-4 ${lowStockCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Low Stock</p>
          <p className={`mt-1 text-xl font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-green-700'}`}>
            {lowStockCount} items
          </p>
        </div>
      </div>

      {/* By category */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Valuation by Category</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {Object.entries(valuation.byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, val]) => (
              <div key={cat} className="flex justify-between px-5 py-3 text-sm">
                <span className="text-gray-700">{cat}</span>
                <span className="font-medium">{formatCurrency(val)}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Item table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
            Item Details {filter !== STATUS_ALL && `· ${filter}`}
          </h2>
          <span className="text-xs text-gray-500">{filtered.length} of {items.length} items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left font-semibold text-gray-600">Item</th>
                <th className="px-5 py-3 text-left font-semibold text-gray-600">Category</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Stock</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Reorder</th>
                <th className="px-5 py-3 text-left font-semibold text-gray-600">Unit</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Cost Price</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Selling Price</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-gray-400">No items found.</td>
                </tr>
              )}
              {filtered.map((item) => {
                const low  = isLowStock(item);
                const val  = (Number(item.currentStock) || 0) * (Number(item.costPrice) || 0);
                return (
                  <tr key={item.itemId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800">{item.itemName}</span>
                        {low && (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">Low</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{item.category ?? '—'}</td>
                    <td className={`px-5 py-3 text-right font-semibold ${low ? 'text-red-600' : 'text-gray-900'}`}>
                      {Number(item.currentStock) || 0}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">{Number(item.reorderLevel) || 0}</td>
                    <td className="px-5 py-3 text-gray-600">{item.unit ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(item.costPrice)}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(item.sellingPrice)}</td>
                    <td className="px-5 py-3 text-right font-medium text-blue-700">{formatCurrency(val)}</td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={7} className="px-5 py-3 font-bold text-gray-900">Total Value (filtered)</td>
                  <td className="px-5 py-3 text-right font-bold text-blue-700">
                    {formatCurrency(filtered.reduce((s, i) => s + (Number(i.currentStock) || 0) * (Number(i.costPrice) || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </ReportLayout>
  );
}
