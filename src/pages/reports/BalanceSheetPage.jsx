import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { computeTrialBalance } from '../../services/journalService';
import { formatCurrency } from '../../utils/format';
import ReportLayout from '../../components/reports/ReportLayout';
import { makePDF, sectionHeader, addLabelRow, addDivider, downloadPDF } from '../../utils/pdfUtils';

// Balance Sheet "as of" a date — reads all journal entries from epoch to selected date.
const EPOCH = new Date('2000-01-01');

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function Section({ title, rows, total, normalBalance, positiveColor }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 rounded-t-xl">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-gray-400">No entries found.</p>
        )}
        {rows.map((r) => {
          const balance = normalBalance === 'credit'
            ? r.totalCredit - r.totalDebit
            : r.totalDebit - r.totalCredit;
          return (
            <div key={r.accountId} className="flex justify-between text-sm text-gray-700">
              <span>{r.accountName}</span>
              <span className="font-medium">{formatCurrency(Math.max(balance, 0))}</span>
            </div>
          );
        })}
        <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold text-gray-900">
          <span>Total {title}</span>
          <span className={positiveColor}>{formatCurrency(total)}</span>
        </div>
      </div>
    </section>
  );
}

export default function BalanceSheetPage() {
  const { activeCompanyId, activeCompany } = useApp();
  const [asOf, setAsOf]     = useState(isoToday());
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const toDate = new Date(asOf + 'T23:59:59');
      const tb = await computeTrialBalance(activeCompanyId, { fromDate: EPOCH, toDate });

      const assets      = tb.rows.filter((r) => r.accountType === 'asset');
      const liabilities = tb.rows.filter((r) => r.accountType === 'liability');
      const income      = tb.rows.filter((r) => r.accountType === 'income');
      const expenses    = tb.rows.filter((r) => r.accountType === 'expense');

      const totalAssets      = assets.reduce((s, r) => s + Math.max(r.totalDebit - r.totalCredit, 0), 0);
      const totalLiabilities = liabilities.reduce((s, r) => s + Math.max(r.totalCredit - r.totalDebit, 0), 0);
      const totalIncome      = income.reduce((s, r) => s + Math.max(r.totalCredit - r.totalDebit, 0), 0);
      const totalExpenses    = expenses.reduce((s, r) => s + Math.max(r.totalDebit - r.totalCredit, 0), 0);
      const retainedEarnings = totalIncome - totalExpenses;
      const totalEquity      = retainedEarnings;

      setData({ assets, liabilities, income, expenses, totalAssets, totalLiabilities, totalIncome, totalExpenses, retainedEarnings, totalEquity });
    } catch (e) {
      setError(e.message ?? 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, asOf]);

  useEffect(() => { load(); }, [load]);

  function exportPDF() {
    if (!data) return;
    const doc = makePDF({ title: 'Balance Sheet', subtitle: `As of ${asOf}`, companyName: activeCompany?.companyName });

    sectionHeader(doc, 'Assets');
    for (const r of data.assets) {
      const bal = Math.max(r.totalDebit - r.totalCredit, 0);
      addLabelRow(doc, r.accountName, formatCurrency(bal), { indent: 4 });
    }
    addDivider(doc);
    addLabelRow(doc, 'Total Assets', formatCurrency(data.totalAssets), { bold: true });

    sectionHeader(doc, 'Liabilities');
    for (const r of data.liabilities) {
      const bal = Math.max(r.totalCredit - r.totalDebit, 0);
      addLabelRow(doc, r.accountName, formatCurrency(bal), { indent: 4 });
    }
    addDivider(doc);
    addLabelRow(doc, 'Total Liabilities', formatCurrency(data.totalLiabilities), { bold: true });

    sectionHeader(doc, "Owner's Equity");
    addLabelRow(doc, 'Retained Earnings (Net Profit/Loss)', formatCurrency(data.retainedEarnings), { indent: 4 });
    addDivider(doc);
    addLabelRow(doc, "Total Equity", formatCurrency(data.totalEquity), { bold: true });

    sectionHeader(doc, 'Check');
    addLabelRow(doc, 'Total Liabilities + Equity', formatCurrency(data.totalLiabilities + data.totalEquity), { bold: true });

    downloadPDF(doc, `balance-sheet-${asOf}.pdf`);
  }

  const balanced = data ? Math.abs(data.totalAssets - data.totalLiabilities - data.totalEquity) < 1 : true;

  return (
    <ReportLayout
      title="Balance Sheet"
      subtitle={`As of ${asOf}`}
      loading={loading}
      dateFilter={
        <div className="flex items-center gap-3 print:hidden">
          <label className="text-sm text-gray-600">As of</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
      }
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
          <Section
            title="Assets"
            rows={data.assets}
            total={data.totalAssets}
            normalBalance="debit"
            positiveColor="text-blue-700"
          />

          <Section
            title="Liabilities"
            rows={data.liabilities}
            total={data.totalLiabilities}
            normalBalance="credit"
            positiveColor="text-red-600"
          />

          {/* Equity */}
          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 rounded-t-xl">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Owner's Equity</h2>
            </div>
            <div className="px-5 py-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-700">
                <span className="text-gray-500">Income</span>
                <span className="font-medium text-green-700">{formatCurrency(data.totalIncome)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-700">
                <span className="text-gray-500">Expenses (incl. purchases)</span>
                <span className="font-medium text-red-600">{formatCurrency(data.totalExpenses)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-700">
                <span>Retained Earnings (Net Profit/Loss)</span>
                <span className={`font-medium ${data.retainedEarnings >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {formatCurrency(data.retainedEarnings)}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold text-gray-900">
                <span>Total Equity</span>
                <span className={data.totalEquity >= 0 ? 'text-green-700' : 'text-red-600'}>
                  {formatCurrency(data.totalEquity)}
                </span>
              </div>
            </div>
          </section>

          {/* Accounting equation check */}
          <div className={`rounded-xl border-2 px-5 py-4 ${balanced ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {balanced ? '✓ Balance Sheet is balanced' : '⚠ Balance sheet may not be balanced — ensure all transactions have journal entries'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Assets = Liabilities + Equity</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Total Assets: <span className="font-bold">{formatCurrency(data.totalAssets)}</span></p>
                <p className="text-sm text-gray-600">Liabilities + Equity: <span className="font-bold">{formatCurrency(data.totalLiabilities + data.totalEquity)}</span></p>
              </div>
            </div>
          </div>
        </div>
      )}
    </ReportLayout>
  );
}
