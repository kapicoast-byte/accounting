import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { listSales } from '../services/saleService';
import { listPurchases } from '../services/purchaseService';
import { listExpenses } from '../services/expenseService';
import { generateMonthlySummary } from '../services/aiService';
import { startOfMonth, endOfDay } from '../utils/dateUtils';

function groupExpensesByCategory(expenses) {
  const map = {};
  for (const e of expenses) {
    const cat = e.category ?? 'Other';
    map[cat] = (map[cat] ?? 0) + (Number(e.amount) || 0);
  }
  return Object.entries(map)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

const REPORTS = [
  {
    to: '/reports/profit-loss',
    label: 'Profit & Loss',
    desc: 'Revenue vs expenses, net profit or loss for any period.',
    icon: '📊',
    color: 'green',
  },
  {
    to: '/reports/balance-sheet',
    label: 'Balance Sheet',
    desc: 'Assets, liabilities and owner equity as of any date.',
    icon: '⚖️',
    color: 'blue',
  },
  {
    to: '/reports/cash-flow',
    label: 'Cash Flow',
    desc: 'Cash in vs cash out grouped by week or month.',
    icon: '💸',
    color: 'violet',
  },
  {
    to: '/reports/sales',
    label: 'Sales Report',
    desc: 'By item, by customer, or full invoice list for any period.',
    icon: '🧾',
    color: 'amber',
  },
  {
    to: '/reports/inventory',
    label: 'Inventory Report',
    desc: 'Current stock levels, low stock alerts, and valuation.',
    icon: '📦',
    color: 'orange',
  },
  {
    to: '/gst',
    label: 'GST Reports',
    desc: 'GSTR-1 outward supplies and GSTR-3B consolidated return.',
    icon: '🏛️',
    color: 'slate',
  },
  {
    to: '/trial-balance',
    label: 'Trial Balance',
    desc: 'Summarised debit/credit balances for all accounts.',
    icon: '📒',
    color: 'slate',
  },
  {
    to: '/journal',
    label: 'Journal Entries',
    desc: 'Double-entry transaction log with account drill-down.',
    icon: '📝',
    color: 'slate',
  },
];

const COLOR_MAP = {
  green:  'border-green-200  bg-green-50  text-green-700',
  blue:   'border-blue-200   bg-blue-50   text-blue-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  amber:  'border-amber-200  bg-amber-50  text-amber-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
  slate:  'border-gray-200   bg-gray-50   text-gray-700',
};

export default function ReportsPage() {
  const { activeCompanyId } = useApp();
  const [summary,  setSummary]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleGenerateSummary = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError('');
    setSummary('');

    try {
      const from = startOfMonth();
      const to   = endOfDay();

      const [sales, purchases, expenses] = await Promise.all([
        listSales(activeCompanyId,     { fromDate: from, toDate: to }),
        listPurchases(activeCompanyId, { fromDate: from, toDate: to }),
        listExpenses(activeCompanyId,  { fromDate: from, toDate: to }),
      ]);

      const totalSales     = sales.reduce((s, r)     => s + (Number(r.grandTotal) || 0), 0);
      const totalPurchases = purchases.reduce((s, r) => s + (Number(r.grandTotal) || 0), 0);
      const totalExpenses  = expenses.reduce((s, r)  => s + (Number(r.amount)     || 0), 0);
      const profit         = totalSales - totalPurchases - totalExpenses;

      const itemTotals = {};
      for (const sale of sales) {
        for (const line of (sale.lineItems ?? [])) {
          const name = line.itemName ?? 'Unknown';
          itemTotals[name] = (itemTotals[name] ?? 0) + (Number(line.lineSubtotal) || 0);
        }
      }
      const topItem = Object.entries(itemTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const expenseBreakdown = groupExpensesByCategory(expenses);
      const topCategory      = expenseBreakdown[0]?.category ?? null;
      const month            = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });

      const text = await generateMonthlySummary({
        month, totalSales, totalPurchases, totalExpenses, profit,
        topItem, topCategory, salesTrend: null, expenseBreakdown,
      });
      setSummary(text);
    } catch (err) {
      setError(err.message ?? 'Failed to generate summary.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">Financial reports, statements, and AI insights</p>
      </div>

      {/* Report cards grid */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-700">Available Reports</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {REPORTS.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className={`flex flex-col gap-2 rounded-xl border p-5 transition hover:shadow-sm ${COLOR_MAP[r.color]}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{r.icon}</span>
                <span className="font-semibold text-gray-900">{r.label}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{r.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* AI Monthly Summary */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">AI Monthly Summary</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Plain-English 5-line overview of this month — sales, expenses, profit, and a recommendation.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateSummary}
            disabled={loading || !activeCompanyId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? 'Generating…' : 'Generate Summary'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Analysing your books with Gemini AI…
          </div>
        )}

        {summary && !loading && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-blue-600 font-semibold text-sm">SmartBooks AI</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">This Month</span>
            </div>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{summary}</p>
          </div>
        )}
      </section>
    </div>
  );
}
