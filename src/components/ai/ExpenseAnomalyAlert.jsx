import { useState, useEffect, useCallback } from 'react';
import { listExpenses } from '../../services/expenseService';
import { explainExpenseAnomalies } from '../../services/aiService';
import { startOfMonth, endOfDay } from '../../utils/dateUtils';

const ANOMALY_THRESHOLD = 0.20; // 20% above average

function getMonthRange(monthsBack) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function groupByCategory(expenses) {
  const map = {};
  for (const e of expenses) {
    const cat = e.category ?? 'Other';
    map[cat] = (map[cat] ?? 0) + (Number(e.amount) || 0);
  }
  return map;
}

export default function ExpenseAnomalyAlert({ companyId }) {
  const [anomalies, setAnomalies] = useState([]);
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');

  const detectAndExplain = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const thisMonthFrom = startOfMonth();
      const thisMonthTo = endOfDay();

      const [thisMonthExpenses, m1Expenses, m2Expenses, m3Expenses] = await Promise.all([
        listExpenses(companyId, { fromDate: thisMonthFrom, toDate: thisMonthTo }),
        listExpenses(companyId, { fromDate: getMonthRange(1).start, toDate: getMonthRange(1).end }),
        listExpenses(companyId, { fromDate: getMonthRange(2).start, toDate: getMonthRange(2).end }),
        listExpenses(companyId, { fromDate: getMonthRange(3).start, toDate: getMonthRange(3).end }),
      ]);

      const thisByCategory   = groupByCategory(thisMonthExpenses);
      const m1ByCategory     = groupByCategory(m1Expenses);
      const m2ByCategory     = groupByCategory(m2Expenses);
      const m3ByCategory     = groupByCategory(m3Expenses);

      const allCategories = new Set([
        ...Object.keys(thisByCategory),
        ...Object.keys(m1ByCategory),
        ...Object.keys(m2ByCategory),
        ...Object.keys(m3ByCategory),
      ]);

      const found = [];
      for (const cat of allCategories) {
        const thisMonth = thisByCategory[cat] ?? 0;
        const avgLast3  = ((m1ByCategory[cat] ?? 0) + (m2ByCategory[cat] ?? 0) + (m3ByCategory[cat] ?? 0)) / 3;
        if (avgLast3 > 0 && thisMonth > avgLast3 * (1 + ANOMALY_THRESHOLD)) {
          const pctIncrease = ((thisMonth - avgLast3) / avgLast3) * 100;
          found.push({ category: cat, thisMonth, avgLast3, pctIncrease });
        }
      }

      found.sort((a, b) => b.pctIncrease - a.pctIncrease);
      setAnomalies(found);

      if (found.length > 0) {
        setAiLoading(true);
        try {
          const text = await explainExpenseAnomalies(found);
          setExplanation(text);
        } finally {
          setAiLoading(false);
        }
      }
    } catch (err) {
      setError(err.message ?? 'Failed to analyse expenses.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    detectAndExplain();
  }, [detectAndExplain]);

  if (loading || dismissed) return null;
  if (error) return null;
  if (anomalies.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚠️</span>
          <h3 className="font-semibold text-amber-900">Expense Anomaly Detected</h3>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-amber-400 hover:text-amber-600 transition"
          title="Dismiss"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      {/* Anomaly rows */}
      <div className="mt-3 flex flex-wrap gap-2">
        {anomalies.map((a) => (
          <div
            key={a.category}
            className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm"
          >
            <span className="font-medium text-gray-800">{a.category}</span>
            <span className="ml-2 text-red-600 font-semibold">+{a.pctIncrease.toFixed(0)}%</span>
            <span className="ml-1 text-gray-500 text-xs">
              (₹{a.thisMonth.toFixed(0)} vs avg ₹{a.avgLast3.toFixed(0)})
            </span>
          </div>
        ))}
      </div>

      {/* AI explanation */}
      {aiLoading && (
        <p className="mt-3 text-sm text-amber-700 animate-pulse">
          Analysing with AI…
        </p>
      )}
      {explanation && !aiLoading && (
        <p className="mt-3 text-sm text-amber-800 leading-relaxed">{explanation}</p>
      )}
    </div>
  );
}
