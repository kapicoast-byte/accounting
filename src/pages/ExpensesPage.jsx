import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { listExpenses, deleteExpense } from '../services/expenseService';
import { formatCurrency } from '../utils/format';
import { startOfDay, endOfDay, toJsDate } from '../utils/dateUtils';
import LoadingSpinner from '../components/LoadingSpinner';
import RoleGuard from '../components/RoleGuard';
import FilterBar from '../components/FilterBar';
import ExpenseModal from '../components/expenses/ExpenseModal';

function fmtDate(ts) {
  const d = toJsDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function ExpensesPage() {
  const { activeCompanyId } = useApp();

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const from = fromDate ? startOfDay(new Date(fromDate)) : null;
      const to   = toDate   ? endOfDay(new Date(toDate))     : null;
      const data = await listExpenses(activeCompanyId, { fromDate: from, toDate: to });
      setExpenses(data);
    } catch (err) {
      setError(err.message ?? 'Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, fromDate, toDate]);

  useEffect(() => { setExpenses([]); load(); }, [load]);

  const categories = [...new Set(expenses.map((e) => e.category).filter(Boolean))].sort();
  const filtered = categoryFilter
    ? expenses.filter((e) => e.category === categoryFilter)
    : expenses;

  const total = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  function openAdd() { setEditTarget(null); setModalOpen(true); }
  function openEdit(exp) { setEditTarget(exp); setModalOpen(true); }

  async function handleDelete(exp) {
    if (!window.confirm(`Delete expense "${exp.payee || exp.category}" of ${formatCurrency(exp.amount)}?`)) return;
    try {
      await deleteExpense(activeCompanyId, exp.expenseId);
      setExpenses((prev) => prev.filter((e) => e.expenseId !== exp.expenseId));
    } catch (err) {
      alert(err.message ?? 'Failed to delete.');
    }
  }

  function handleSaved() {
    setModalOpen(false);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500">Non-inventory operational costs.</p>
        </div>
        <RoleGuard permission="edit">
          <button type="button" onClick={openAdd}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
            + Record expense
          </button>
        </RoleGuard>
      </div>

      <FilterBar
        fromDate={fromDate} onFromDate={setFromDate}
        toDate={toDate}     onToDate={setToDate}
        selects={[{
          value: categoryFilter,
          onChange: setCategoryFilter,
          options: [{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))],
        }]}
        onRefresh={load}
        count={`${filtered.length} records`}
      />

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {expenses.length === 0 ? 'No expenses recorded yet.' : 'No expenses match the filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Payee / description</th>
                  <th className="px-4 py-2">Paid by</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((exp) => (
                  <tr key={exp.expenseId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600">{fmtDate(exp.date)}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-800">{exp.payee || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-2 text-xs text-gray-600">{exp.paidBy}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-800">{formatCurrency(exp.amount)}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2 text-xs">
                        <RoleGuard permission="edit">
                          <button type="button" onClick={() => openEdit(exp)}
                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50">Edit</button>
                        </RoleGuard>
                        <RoleGuard permission="delete">
                          <button type="button" onClick={() => handleDelete(exp)}
                            className="rounded-md border border-red-200 bg-white px-2 py-1 text-red-600 hover:bg-red-50">Delete</button>
                        </RoleGuard>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Total
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900">{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <ExpenseModal
        open={modalOpen}
        companyId={activeCompanyId}
        expense={editTarget}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
