import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { listSales } from '../../services/saleService';
import { formatCurrency } from '../../utils/format';
import { toJsDate } from '../../utils/dateUtils';
import ReportLayout from '../../components/reports/ReportLayout';
import DateRangeFilter, { defaultRange, toDateRange } from '../../components/reports/DateRangeFilter';
import { makePDF, sectionHeader, addTable, downloadPDF } from '../../utils/pdfUtils';

const TABS = ['By Item', 'By Customer', 'By Date'];

function buildItemRows(sales) {
  const map = {};
  for (const s of sales) {
    for (const line of (s.lineItems ?? [])) {
      const name = line.itemName ?? 'Unknown';
      if (!map[name]) map[name] = { itemName: name, qty: 0, revenue: 0, gst: 0, count: 0 };
      map[name].qty     += Number(line.quantity)    || 0;
      map[name].revenue += Number(line.lineSubtotal) || 0;
      map[name].gst     += Number(line.lineGST)     || 0;
      map[name].count   += 1;
    }
  }
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
}

function buildCustomerRows(sales) {
  const map = {};
  for (const s of sales) {
    const name = s.customerSnapshot?.name || 'Walk-in';
    if (!map[name]) map[name] = { customer: name, invoices: 0, revenue: 0, outstanding: 0 };
    map[name].invoices   += 1;
    map[name].revenue    += Number(s.grandTotal)  || 0;
    map[name].outstanding += Number(s.balanceDue)  || 0;
  }
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
}

export default function SalesReportPage() {
  const { activeCompanyId, activeCompany } = useApp();
  const [range, setRange]   = useState(defaultRange());
  const [sales, setSales]   = useState([]);
  const [activeTab, setActiveTab] = useState('By Item');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const { fromDate, toDate } = toDateRange(range.from, range.to);
      setSales(await listSales(activeCompanyId, { fromDate, toDate }));
    } catch (e) {
      setError(e.message ?? 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, range]);

  useEffect(() => { load(); }, [load]);

  const itemRows     = useMemo(() => buildItemRows(sales),    [sales]);
  const customerRows = useMemo(() => buildCustomerRows(sales), [sales]);

  const totalRevenue = sales.reduce((s, r) => s + (Number(r.grandTotal) || 0), 0);

  function exportPDF() {
    const doc = makePDF({
      title: 'Sales Report',
      subtitle: `${range.from} to ${range.to}`,
      companyName: activeCompany?.companyName,
    });

    sectionHeader(doc, 'Sales by Item');
    addTable(doc, {
      head: [['Item', 'Qty Sold', 'Revenue', 'GST']],
      body: itemRows.map((r) => [r.itemName, r.qty, formatCurrency(r.revenue), formatCurrency(r.gst)]),
      foot: [['Total', '', formatCurrency(totalRevenue), '']],
    });

    sectionHeader(doc, 'Sales by Customer');
    addTable(doc, {
      head: [['Customer', 'Invoices', 'Revenue', 'Outstanding']],
      body: customerRows.map((r) => [r.customer, r.invoices, formatCurrency(r.revenue), formatCurrency(r.outstanding)]),
    });

    sectionHeader(doc, 'Invoice List');
    addTable(doc, {
      head: [['Invoice #', 'Date', 'Customer', 'Total', 'Status']],
      body: sales.map((s) => [
        s.invoiceNumber ?? '',
        toJsDate(s.date)?.toLocaleDateString('en-IN') ?? '',
        s.customerSnapshot?.name ?? '',
        formatCurrency(s.grandTotal),
        s.status ?? '',
      ]),
    });

    downloadPDF(doc, `sales-report-${range.from}-${range.to}.pdf`);
  }

  return (
    <ReportLayout
      title="Sales Report"
      subtitle={`${range.from} to ${range.to} · ${sales.length} invoices`}
      loading={loading}
      dateFilter={<DateRangeFilter from={range.from} to={range.to} onChange={setRange} />}
      actions={
        <button
          type="button"
          onClick={exportPDF}
          disabled={sales.length === 0}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          Export PDF
        </button>
      }
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Revenue</p>
          <p className="mt-1 text-xl font-bold text-green-700">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Invoices</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{sales.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
          <p className="mt-1 text-xl font-bold text-amber-600">
            {formatCurrency(sales.reduce((s, r) => s + (Number(r.balanceDue) || 0), 0))}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex border-b border-gray-200 print:hidden">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium transition ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* By Item */}
        {(activeTab === 'By Item' || true) && (
          <div className={activeTab !== 'By Item' ? 'hidden print:block' : ''}>
            {activeTab === 'By Item' && <div className="hidden print:block border-b border-gray-200 px-5 py-2 font-semibold text-gray-700">By Item</div>}
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Item</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">Qty Sold</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">Revenue</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">GST</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-gray-400">No sales in this period.</td></tr>
                )}
                {itemRows.map((r) => (
                  <tr key={r.itemName} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{r.itemName}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{r.qty}</td>
                    <td className="px-5 py-3 text-right font-medium text-green-700">{formatCurrency(r.revenue)}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(r.gst)}</td>
                  </tr>
                ))}
              </tbody>
              {itemRows.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-5 py-3 font-bold text-gray-900">Total</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">
                      {itemRows.reduce((s, r) => s + r.qty, 0)}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-green-700">{formatCurrency(totalRevenue)}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">
                      {formatCurrency(itemRows.reduce((s, r) => s + r.gst, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* By Customer */}
        <div className={activeTab !== 'By Customer' ? 'hidden print:block' : ''}>
          {activeTab !== 'By Customer' && <div className="hidden print:block border-t border-gray-200 border-b px-5 py-2 font-semibold text-gray-700">By Customer</div>}
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left font-semibold text-gray-600">Customer</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Invoices</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Revenue</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {customerRows.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-gray-400">No sales in this period.</td></tr>
              )}
              {customerRows.map((r) => (
                <tr key={r.customer} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{r.customer}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{r.invoices}</td>
                  <td className="px-5 py-3 text-right font-medium text-green-700">{formatCurrency(r.revenue)}</td>
                  <td className="px-5 py-3 text-right text-amber-600">{formatCurrency(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* By Date */}
        <div className={activeTab !== 'By Date' ? 'hidden print:block' : ''}>
          {activeTab !== 'By Date' && <div className="hidden print:block border-t border-gray-200 border-b px-5 py-2 font-semibold text-gray-700">Invoice List</div>}
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left font-semibold text-gray-600">Invoice #</th>
                <th className="px-5 py-3 text-left font-semibold text-gray-600">Date</th>
                <th className="px-5 py-3 text-left font-semibold text-gray-600">Customer</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Total</th>
                <th className="px-5 py-3 text-center font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-gray-400">No invoices in this period.</td></tr>
              )}
              {sales.map((s) => (
                <tr key={s.saleId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs text-blue-700">{s.invoiceNumber}</td>
                  <td className="px-5 py-3 text-gray-700">
                    {toJsDate(s.date)?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3 text-gray-700">{s.customerSnapshot?.name || 'Walk-in'}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatCurrency(s.grandTotal)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === 'paid'    ? 'bg-green-100 text-green-700' :
                      s.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                                               'bg-red-100 text-red-700'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportLayout>
  );
}
