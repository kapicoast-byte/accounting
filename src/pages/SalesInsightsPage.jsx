import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { listSalesItems } from '../services/salesItemService';
import { startOfDay, endOfDay } from '../utils/dateUtils';
import { formatCurrency, formatNumber } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6'];

function SummaryCard({ label, value, sub, colorClass }) {
  return (
    <div className={`rounded-xl border p-4 ${colorClass ?? 'border-gray-200 bg-white'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 truncate text-xl font-bold leading-tight text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank === 0) return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-white">1</span>;
  if (rank === 1) return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-400 text-xs font-bold text-white">2</span>;
  if (rank === 2) return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-400 text-xs font-bold text-white">3</span>;
  return <span className="text-xs text-gray-400">{rank + 1}</span>;
}

function SortIcon({ active, asc }) {
  if (!active) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1">{asc ? '↑' : '↓'}</span>;
}

export default function SalesInsightsPage() {
  const { activeCompanyId } = useApp();
  const [fromDate,  setFromDate]  = useState('');
  const [toDate,    setToDate]    = useState('');
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [sortCol,   setSortCol]   = useState('qty');
  const [sortAsc,   setSortAsc]   = useState(false);

  async function load() {
    if (!activeCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const from = fromDate ? startOfDay(new Date(fromDate)) : null;
      const to   = toDate   ? endOfDay(new Date(toDate))     : null;
      const data = await listSalesItems(activeCompanyId, { fromDate: from, toDate: to });
      setItems(data);
    } catch (e) {
      setError(e.message ?? 'Failed to load insights.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const aggregated = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = it.itemName;
      if (!key) continue;
      const prev = map.get(key) ?? {
        itemName: key,
        category: it.category || 'Other',
        qty: 0,
        revenue: 0,
        gst: 0,
      };
      prev.qty     += Number(it.quantity)    || 0;
      prev.revenue += Number(it.totalAmount) || 0;
      prev.gst     += Number(it.GSTAmount)   || 0;
      map.set(key, prev);
    }
    return [...map.values()];
  }, [items]);

  const ranked      = useMemo(() => [...aggregated].sort((a, b) => b.qty - a.qty), [aggregated]);
  const totalQty    = useMemo(() => aggregated.reduce((s, x) => s + x.qty,     0), [aggregated]);
  const totalRev    = useMemo(() => aggregated.reduce((s, x) => s + x.revenue, 0), [aggregated]);
  const bestSeller  = ranked[0];
  const worstSeller = ranked[ranked.length - 1];

  const categories = useMemo(
    () => [...new Set(aggregated.map((x) => x.category))].sort(),
    [aggregated],
  );

  const tableData = useMemo(() => {
    const filtered = aggregated.filter((x) => {
      if (search    && !x.itemName.toLowerCase().includes(search.toLowerCase())) return false;
      if (catFilter && x.category !== catFilter)                                 return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const v = sortCol === 'revenue'   ? a.revenue - b.revenue
              : sortCol === 'itemName'  ? a.itemName.localeCompare(b.itemName)
              :                          a.qty - b.qty;
      return sortAsc ? v : -v;
    });
  }, [aggregated, search, catFilter, sortCol, sortAsc]);

  const top10    = ranked.slice(0, 10);
  const bottom10 = ranked.length > 1 ? ranked.slice(-Math.min(10, ranked.length)).reverse() : [];

  const catData = useMemo(() => {
    const map = new Map();
    for (const it of aggregated) {
      const cat  = it.category || 'Other';
      const prev = map.get(cat) ?? { category: cat, qty: 0, revenue: 0 };
      prev.qty     += it.qty;
      prev.revenue += it.revenue;
      map.set(cat, prev);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [aggregated]);

  function toggleSort(col) {
    if (sortCol === col) setSortAsc((v) => !v);
    else { setSortCol(col); setSortAsc(false); }
  }

  function rowBg(rank) {
    if (rank === 0) return 'bg-yellow-50';
    if (rank === 1) return 'bg-gray-50/80';
    if (rank === 2) return 'bg-orange-50';
    if (ranked.length > 10 && rank >= ranked.length - 10) return 'bg-amber-50/60';
    return '';
  }

  if (loading && !items.length) {
    return <div className="flex items-center justify-center py-24"><LoadingSpinner /></div>;
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Insights</h1>
          <p className="text-sm text-gray-500">Item-level performance from imported sales reports</p>
        </div>
        <Link to="/sales" className="text-sm text-blue-600 hover:underline">← Back to Sales</Link>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" onClick={load}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
          Apply
        </button>
        {(fromDate || toDate) && (
          <button type="button" onClick={() => { setFromDate(''); setToDate(''); }}
            className="text-sm text-gray-400 underline hover:text-gray-600">
            Clear
          </button>
        )}
        {loading && <LoadingSpinner size="sm" />}
        <span className="ml-auto text-xs text-gray-400">{aggregated.length} unique items</span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!items.length && !loading && (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
          <p className="text-gray-400">No imported sales data found for this period.</p>
          <Link to="/sales"
            className="mt-3 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Import a Sales Report
          </Link>
        </div>
      )}

      {aggregated.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard
              label="Total Units Sold"
              value={formatNumber(totalQty)}
              sub={`${aggregated.length} unique items`}
            />
            <SummaryCard
              label="Total Revenue"
              value={formatCurrency(totalRev)}
              sub="from imported reports"
            />
            <SummaryCard
              label="Best Selling Item"
              value={bestSeller?.itemName ?? '—'}
              sub={bestSeller ? `${formatNumber(bestSeller.qty)} units sold` : ''}
              colorClass="border-green-200 bg-green-50"
            />
            <SummaryCard
              label="Lowest Selling Item"
              value={worstSeller?.itemName ?? '—'}
              sub={worstSeller ? `${formatNumber(worstSeller.qty)} units sold` : ''}
              colorClass="border-amber-200 bg-amber-50"
            />
          </div>

          {/* Item-wise table */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-700">Item Performance</h2>
              <div className="flex flex-wrap gap-2">
                <input
                  type="search"
                  placeholder="Search item…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                {categories.length > 1 && (
                  <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">All categories</option>
                    {categories.map((c) => <option key={c}>{c}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="w-12 px-4 py-2">Rank</th>
                    <th className="cursor-pointer select-none px-4 py-2" onClick={() => toggleSort('itemName')}>
                      Item Name <SortIcon active={sortCol === 'itemName'} asc={sortAsc} />
                    </th>
                    <th className="px-4 py-2">Category</th>
                    <th className="cursor-pointer select-none px-4 py-2 text-right" onClick={() => toggleSort('qty')}>
                      Qty Sold <SortIcon active={sortCol === 'qty'} asc={sortAsc} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-2 text-right" onClick={() => toggleSort('revenue')}>
                      Revenue <SortIcon active={sortCol === 'revenue'} asc={sortAsc} />
                    </th>
                    <th className="px-4 py-2 text-right">Avg Price</th>
                    <th className="px-4 py-2 text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tableData.map((item) => {
                    const rank     = ranked.findIndex((x) => x.itemName === item.itemName);
                    const avgPrice = item.qty > 0 ? item.revenue / item.qty : 0;
                    const pct      = totalRev > 0 ? (item.revenue / totalRev) * 100 : 0;
                    return (
                      <tr key={item.itemName} className={`${rowBg(rank)} transition-colors`}>
                        <td className="px-4 py-2">
                          <RankBadge rank={rank} />
                        </td>
                        <td className="px-4 py-2 font-medium text-gray-800">{item.itemName}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{item.category}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-800">{formatNumber(item.qty)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-800">{formatCurrency(item.revenue)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{formatCurrency(avgPrice)}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="w-10 text-right text-xs text-gray-500">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">Units Sold by Category</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={catData} margin={{ top: 0, right: 10, bottom: 30, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 11 }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [formatNumber(v), 'Units']} />
                  <Bar dataKey="qty" name="Units" radius={[4, 4, 0, 0]}>
                    {catData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">Revenue Share by Category</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={catData}
                    dataKey="revenue"
                    nameKey="category"
                    cx="50%"
                    cy="45%"
                    outerRadius={80}
                  >
                    {catData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                  <Tooltip formatter={(v) => [formatCurrency(v), 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top 10 / Bottom 10 */}
          {ranked.length > 1 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="mb-4 text-sm font-semibold text-gray-700">Top 10 — by Units Sold</h2>
                <div className="space-y-2.5">
                  {top10.map((item, i) => {
                    const pct = top10[0]?.qty > 0 ? (item.qty / top10[0].qty) * 100 : 0;
                    return (
                      <div key={item.itemName} className="flex items-center gap-3">
                        <span className="w-5 flex-none text-right text-xs font-semibold text-gray-400">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                            <span className="truncate font-medium text-gray-700">{item.itemName}</span>
                            <span className="flex-none text-gray-500">{formatNumber(item.qty)}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="mb-4 text-sm font-semibold text-gray-700">Bottom 10 — by Units Sold</h2>
                <div className="space-y-2.5">
                  {bottom10.map((item) => {
                    const absRank = ranked.findIndex((x) => x.itemName === item.itemName);
                    const maxQty  = bottom10[bottom10.length - 1]?.qty || 1;
                    const pct     = maxQty > 0 ? (item.qty / maxQty) * 100 : 0;
                    return (
                      <div key={item.itemName} className="flex items-center gap-3">
                        <span className="w-5 flex-none text-right text-xs font-semibold text-gray-400">
                          #{absRank + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                            <span className="truncate font-medium text-amber-700">{item.itemName}</span>
                            <span className="flex-none text-gray-500">{formatNumber(item.qty)}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
