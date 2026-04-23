import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { listSales } from '../../services/saleService';
import { listPurchases } from '../../services/purchaseService';
import { listExpenses } from '../../services/expenseService';
import { formatCurrency } from '../../utils/format';
import ReportLayout from '../../components/reports/ReportLayout';
import DateRangeFilter, { defaultRange, toDateRange } from '../../components/reports/DateRangeFilter';
import { makePDF, sectionHeader, addLabelRow, addDivider, addTable, downloadPDF } from '../../utils/pdfUtils';

function groupExpenses(expenses) {
  const map = {};
  for (const e of expenses) {
    const cat = e.category ?? 'Other';
    map[cat] = (map[cat] ?? 0) + (Number(e.amount) || 0);
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([category, total]) => ({ category, total }));
}

export default function ProfitLossPage() {
  const { activeCompanyId, activeCompany } = useApp();
  const [range, setRange]   = useState(defaultRange());
  const [data,  setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const { fromDate, toDate } = toDateRange(range.from, range.to);
      const [sales, purchases, expenses] = await Promise.all([
        listSales(activeCompanyId,     { fromDate, toDate }),
        listPurchases(activeCompanyId, { fromDate, toDate }),
        listExpenses(activeCompanyId,  { fromDate, toDate }),
      ]);

      const totalRevenue   = sales.reduce((s, r) => s + (Number(r.grandTotal) || 0), 0);
      const totalPurchases = purchases.reduce((s, r) => s + (Number(r.grandTotal) || 0), 0);
      const expGroups      = groupExpenses(expenses);
      const totalExpenses  = expGroups.reduce((s, r) => s + r.total, 0);
      const grossProfit    = totalRevenue - totalPurchases;
      const netProfit      = grossProfit - totalExpenses;

      setData({ totalRevenue, totalPurchases, expGroups, totalExpenses, grossProfit, netProfit, salesCount: sales.length });
    } catch (e) {
      setError(e.message ?? 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, range]);

  useEffect(() => { load(); }, [load]);

  function exportPDF() {
    if (!data) return;
    const subtitle = `Period: ${range.from} to ${range.to}`;
    const doc = makePDF({ title: 'Profit & Loss Statement', subtitle, companyName: activeCompany?.companyName });

    sectionHeader(doc, 'Revenue');
    addLabelRow(doc, 'Sales Revenue', formatCurrency(data.totalRevenue));
    addDivider(doc);
    addLabelRow(doc, 'Total Revenue', formatCurrency(data.totalRevenue), { bold: true });

    sectionHeader(doc, 'Cost of Goods Sold');
    addLabelRow(doc, 'Purchases', formatCurrency(data.totalPurchases));
    addDivider(doc);
    addLabelRow(doc, 'Gross Profit', formatCurrency(data.grossProfit), { bold: true });

    sectionHeader(doc, 'Operating Expenses');
    for (const g of data.expGroups) {
      addLabelRow(doc, g.category, formatCurrency(g.total), { indent: 4 });
    }
    addDivider(doc);
    addLabelRow(doc, 'Total Expenses', formatCurrency(data.totalExpenses), { bold: true });

    sectionHeader(doc, 'Net Result');
    addLabelRow(doc, data.netProfit >= 0 ? 'Net Profit' : 'Net Loss', formatCurrency(Math.abs(data.netProfit)), {
      bold: true,
      color: data.netProfit >= 0 ? [22, 163, 74] : [220, 38, 38],
    });

    downloadPDF(doc, `profit-loss-${range.from}-${range.to}.pdf`);
  }

  const subtitle = range.from && range.to ? `${range.from} to ${range.to}` : '';

  return (
    <ReportLayout
      title="Profit & Loss Statement"
      subtitle={subtitle}
      loading={loading}
      dateFilter={<DateRangeFilter from={range.from} to={range.to} onChange={setRange} />}
      actions={
        <button
          type="button"
          onClick={exportPDF}
          disabled={!data}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          Export PDF
        </button>
      }
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {data && (
        <div className="space-y-5">
          {/* Revenue */}
          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 rounded-t-xl">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Revenue</h2>
            </div>
            <div className="px-5 py-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-700">
                <span>Sales Revenue ({data.salesCount} invoices)</span>
                <span className="font-medium">{formatCurrency(data.totalRevenue)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold text-gray-900">
                <span>Total Revenue</span>
                <span>{formatCurrency(data.totalRevenue)}</span>
              </div>
            </div>
          </section>

          {/* COGS */}
          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 rounded-t-xl">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Cost of Goods Sold</h2>
            </div>
            <div className="px-5 py-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-700">
                <span>Purchases</span>
                <span className="font-medium text-red-600">{formatCurrency(data.totalPurchases)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold text-gray-900">
                <span>Gross Profit</span>
                <span className={data.grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}>
                  {formatCurrency(data.grossProfit)}
                </span>
              </div>
            </div>
          </section>

          {/* Operating Expenses */}
          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 rounded-t-xl">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Operating Expenses</h2>
            </div>
            <div className="px-5 py-4 space-y-2">
              {data.expGroups.length === 0 && (
                <p className="text-sm text-gray-400">No expenses recorded for this period.</p>
              )}
              {data.expGroups.map((g) => (
                <div key={g.category} className="flex justify-between text-sm text-gray-700">
                  <span>{g.category}</span>
                  <span className="font-medium text-red-600">{formatCurrency(g.total)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold text-gray-900">
                <span>Total Expenses</span>
                <span className="text-red-600">{formatCurrency(data.totalExpenses)}</span>
              </div>
            </div>
          </section>

          {/* Net Result */}
          <section className={`rounded-xl border-2 ${data.netProfit >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'} px-5 py-4`}>
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold text-gray-900">
                {data.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
              </span>
              <span className={`text-2xl font-bold ${data.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {formatCurrency(Math.abs(data.netProfit))}
              </span>
            </div>
          </section>
        </div>
      )}
    </ReportLayout>
  );
}
