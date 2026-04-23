import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { listJournalEntries } from '../../services/journalService';
import { formatCurrency } from '../../utils/format';
import { toJsDate } from '../../utils/dateUtils';
import ReportLayout from '../../components/reports/ReportLayout';
import DateRangeFilter, { defaultRange, toDateRange } from '../../components/reports/DateRangeFilter';
import { makePDF, sectionHeader, addTable, downloadPDF } from '../../utils/pdfUtils';

const CASH_ACCOUNTS = new Set(['cash', 'bank']);

function weekLabel(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), 0, 1);
  const week  = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
function monthLabel(date) {
  const d = new Date(date);
  return d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

function buildFlowRows(entries, groupBy) {
  const map = new Map();
  for (const entry of entries) {
    const d = toJsDate(entry.date);
    if (!d) continue;
    const key = groupBy === 'week' ? weekLabel(d) : monthLabel(d);

    if (!map.has(key)) map.set(key, { key, label: key, inflow: 0, outflow: 0, entries: [] });
    const bucket = map.get(key);

    for (const line of (entry.lines ?? [])) {
      if (!CASH_ACCOUNTS.has(line.accountId)) continue;
      bucket.inflow  += Number(line.debit)  || 0;
      bucket.outflow += Number(line.credit) || 0;
    }
    bucket.entries.push(entry);
  }

  // Sort chronologically
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export default function CashFlowPage() {
  const { activeCompanyId, activeCompany } = useApp();
  const [range, setRange]   = useState(defaultRange());
  const [groupBy, setGroupBy] = useState('month');
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const { fromDate, toDate } = toDateRange(range.from, range.to);
      const entries = await listJournalEntries(activeCompanyId, { fromDate, toDate });
      setRows(buildFlowRows(entries, groupBy));
    } catch (e) {
      setError(e.message ?? 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, range, groupBy]);

  useEffect(() => { load(); }, [load]);

  const totalIn  = rows.reduce((s, r) => s + r.inflow,  0);
  const totalOut = rows.reduce((s, r) => s + r.outflow, 0);
  const netFlow  = totalIn - totalOut;

  function exportPDF() {
    const doc = makePDF({
      title: 'Cash Flow Summary',
      subtitle: `${range.from} to ${range.to}`,
      companyName: activeCompany?.companyName,
    });
    sectionHeader(doc, `Cash Flow by ${groupBy === 'week' ? 'Week' : 'Month'}`);
    addTable(doc, {
      head: [['Period', 'Cash In', 'Cash Out', 'Net Flow']],
      body: rows.map((r) => [
        r.label,
        formatCurrency(r.inflow),
        formatCurrency(r.outflow),
        formatCurrency(r.inflow - r.outflow),
      ]),
      foot: [['Total', formatCurrency(totalIn), formatCurrency(totalOut), formatCurrency(netFlow)]],
    });
    downloadPDF(doc, `cash-flow-${range.from}-${range.to}.pdf`);
  }

  return (
    <ReportLayout
      title="Cash Flow Summary"
      subtitle={`${range.from} to ${range.to}`}
      loading={loading}
      dateFilter={
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />
          <span className="text-gray-300 print:hidden">|</span>
          <div className="flex items-center gap-2 print:hidden">
            <label className="text-sm text-gray-600">Group by</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none"
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
        </div>
      }
      actions={
        <button
          type="button"
          onClick={exportPDF}
          disabled={rows.length === 0}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          Export PDF
        </button>
      }
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Total Cash In',  value: totalIn,  color: 'text-green-700' },
          { label: 'Total Cash Out', value: totalOut, color: 'text-red-600'   },
          { label: 'Net Cash Flow',  value: netFlow,  color: netFlow >= 0 ? 'text-green-700' : 'text-red-600' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white px-5 py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className={`mt-1 text-xl font-bold ${c.color}`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-5 py-3 text-left font-semibold text-gray-600">Period</th>
              <th className="px-5 py-3 text-right font-semibold text-gray-600">Cash In</th>
              <th className="px-5 py-3 text-right font-semibold text-gray-600">Cash Out</th>
              <th className="px-5 py-3 text-right font-semibold text-gray-600">Net Flow</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-gray-400">No cash movements in this period.</td>
              </tr>
            )}
            {rows.map((r) => {
              const net = r.inflow - r.outflow;
              return (
                <tr key={r.key} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{r.label}</td>
                  <td className="px-5 py-3 text-right text-green-700">{formatCurrency(r.inflow)}</td>
                  <td className="px-5 py-3 text-right text-red-600">{formatCurrency(r.outflow)}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {formatCurrency(net)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="px-5 py-3 font-bold text-gray-900">Total</td>
                <td className="px-5 py-3 text-right font-bold text-green-700">{formatCurrency(totalIn)}</td>
                <td className="px-5 py-3 text-right font-bold text-red-600">{formatCurrency(totalOut)}</td>
                <td className={`px-5 py-3 text-right font-bold ${netFlow >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {formatCurrency(netFlow)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportLayout>
  );
}
