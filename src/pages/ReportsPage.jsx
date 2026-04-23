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

const QUICK_LINKS = [
  { to: '/gst',           label: 'GST Reports (GSTR-1 & GSTR-3B)', icon: '🧾' },
  { to: '/trial-balance', label: 'Trial Balance',                   icon: '⚖️' },
  { to: '/ledger',        label: 'Account Ledger',                  icon: '📒' },
  { to: '/journal',       label: 'Journal Entries',                 icon: '📝' },
  { to: '/inventory',     label: 'Inventory Valuation',             icon: '📦' },
];

export default function ReportsPage() {
  const { activeCompanyId } = useApp();
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleGenerateSummary = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError('');
    setSummary('');

    try {
      const from = startOfMonth();
      const to   = endOfDay();

      const [sales, purchases, expenses] = await Promise.all([
        listSales(activeCompanyId, { fromDate: from, toDate: to }),
        listPurchases(activeCompanyId, { fromDate: from, toDate: to }),
        listExpenses(activeCompanyId, { fromDate: from, toDate: to }),
      ]);

      const totalSales     = sales.reduce((s, r) => s + (Number(r.grandTotal)   || 0), 0);
      const totalPurchases = purchases.reduce((s, r) => s + (Number(r.grandTotal) || 0), 0);
      const totalExpenses  = expenses.reduce((s, r) => s + (Number(r.amount)     || 0), 0);
      const profit         = totalSales - totalPurchases - totalExpenses;

      // top selling item by line items
      const itemTotals = {};
      for (const sale of sales) {
        for (const line of (sale.lineItems ?? [])) {
          const name = line.itemName ?? 'Unknown';
          itemTotals[name] = (itemTotals[name] ?? 0) + (Number(line.lineSubtotal) || 0);
        }
      }
      const topItem = Object.entries(itemTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const expenseBreakdown = groupExpensesByCategory(expenses);
      const topCategory = expenseBreakdown[0]?.category ?? null;

      const now  = new Date();
      const month = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

      const text = await generateMonthlySummary({
        month,
        totalSales,
        totalPurchases,
        totalExpenses,
        profit,
        topItem,
        topCategory,
        salesTrend: null,
        expenseBreakdown,
      });

      setSummary(text);
    } catch (err) {
      setError(err.message ?? 'Failed to generate summary.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">Business reports and financial summaries</p>
      </div>

      {/* AI Monthly Summary */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI Monthly Summary</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Get a plain-English 5-line summary of this month's performance — sales, expenses, profit, and a recommendation.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateSummary}
            disabled={loading || !activeCompanyId}
            className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? 'Generating…' : 'Generate Summary'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Analysing your books with Claude AI…
          </div>
        )}

        {summary && !loading && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-blue-600 font-semibold text-sm">SmartBooks AI</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">This Month</span>
            </div>
            <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{summary}</div>
          </div>
        )}
      </section>

      {/* Quick report links */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-700">Financial Reports</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50 transition"
            >
              <span className="text-2xl">{link.icon}</span>
              <span className="text-sm font-medium text-gray-800">{link.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
