import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { computeGSTR1, computeGSTR3B } from '../services/gstService';
import { formatCurrency } from '../utils/format';
import { startOfDay, endOfDay } from '../utils/dateUtils';
import { exportCSV } from '../utils/csvUtils';
import LoadingSpinner from '../components/LoadingSpinner';

// ─── date helpers ─────────────────────────────────────────────────────────────

function monthStart(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}
function monthEnd(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
}
function toInputDate(date) {
  return date.toISOString().slice(0, 10);
}
function fmtPeriodLabel(from, to) {
  const opts = { month: 'short', year: 'numeric' };
  if (!from && !to) return 'All time';
  if (from === to) return new Date(from).toLocaleDateString('en-IN', opts);
  const f = from ? new Date(from).toLocaleDateString('en-IN', opts) : '—';
  const t = to   ? new Date(to).toLocaleDateString('en-IN', opts)   : '—';
  return `${f} – ${t}`;
}
function fmtDate(date) {
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── CSV column definitions ───────────────────────────────────────────────────

const GSTR1_RATE_COLS = [
  { key: 'rate',         header: 'GST Rate (%)',    format: (v) => `${v}%` },
  { key: 'taxableValue', header: 'Taxable Value (₹)', format: (v) => v.toFixed(2) },
  { key: 'cgst',         header: 'CGST (₹)',        format: (v) => v.toFixed(2) },
  { key: 'sgst',         header: 'SGST (₹)',        format: (v) => v.toFixed(2) },
  { key: 'totalGST',     header: 'Total GST (₹)',   format: (v) => v.toFixed(2) },
];

const GSTR1_INVOICE_COLS = [
  { key: 'invoiceNumber', header: 'Invoice Number' },
  { key: 'date',          header: 'Date',          format: (v) => fmtDate(v) },
  { key: 'customerName',  header: 'Customer Name' },
  { key: 'customerGSTIN', header: 'Customer GSTIN' },
  { key: 'taxableValue',  header: 'Taxable Value (₹)', format: (v) => Number(v).toFixed(2) },
  { key: 'discount',      header: 'Discount (₹)',      format: (v) => Number(v).toFixed(2) },
  { key: 'cgst',          header: 'CGST (₹)',          format: (v) => Number(v).toFixed(2) },
  { key: 'sgst',          header: 'SGST (₹)',          format: (v) => Number(v).toFixed(2) },
  { key: 'totalGST',      header: 'Total GST (₹)',     format: (v) => Number(v).toFixed(2) },
  { key: 'grandTotal',    header: 'Grand Total (₹)',   format: (v) => Number(v).toFixed(2) },
  { key: 'paymentMode',   header: 'Payment Mode' },
  { key: 'status',        header: 'Status' },
];

// ─── shared sub-components ────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent = 'blue' }) {
  const colors = {
    blue:  'border-blue-200  bg-blue-50  text-blue-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    red:   'border-red-200   bg-red-50   text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-xl border px-5 py-4 ${colors[accent] ?? colors.blue}`}>
      <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  );
}

function ExportBtn({ onClick, label = 'Export CSV' }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
      {label}
    </button>
  );
}

// ─── GSTR-1 tab ───────────────────────────────────────────────────────────────

function GSTR1Tab({ data, period, splitMode, taxLabel }) {
  if (!data) return null;
  const { byRate, summary, invoiceRows } = data;
  const filename = `GSTR1_${period.replace(/\s/g, '_').replace(/–/g, '-')}`;

  function exportRates() {
    exportCSV(`${filename}_RateWise.csv`, GSTR1_RATE_COLS, byRate);
  }
  function exportInvoices() {
    exportCSV(`${filename}_Invoices.csv`, GSTR1_INVOICE_COLS, invoiceRows);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Invoices"       value={data.totalInvoices}                   accent="blue"  />
        <SummaryCard label="Taxable value"  value={formatCurrency(summary.totalTaxable)} accent="blue"  />
        <SummaryCard label={`Total ${taxLabel ?? 'Tax'}`} value={formatCurrency(summary.totalGST)} accent="amber" />
        {splitMode === 'cgst_sgst' ? (
          <SummaryCard label="CGST + SGST"
            value={`${formatCurrency(summary.totalCGST)} + ${formatCurrency(summary.totalSGST)}`}
            accent="amber" />
        ) : (
          <SummaryCard label="Tax collected" value={formatCurrency(summary.totalGST)} accent="amber" />
        )}
      </div>

      {/* Rate-wise table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-700">Rate-wise Summary</h3>
          <ExportBtn onClick={exportRates} label="Export rate summary" />
        </div>
        {byRate.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No outward supply data for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-2 text-left">{taxLabel ?? 'Tax'} Rate</th>
                  <th className="px-5 py-2 text-right">Taxable Value</th>
                  {splitMode === 'cgst_sgst' && <th className="px-5 py-2 text-right">CGST</th>}
                  {splitMode === 'cgst_sgst' && <th className="px-5 py-2 text-right">SGST</th>}
                  <th className="px-5 py-2 text-right">Total {taxLabel ?? 'Tax'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byRate.map((r) => (
                  <tr key={r.rate} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 font-semibold text-gray-800">{r.rate}%</td>
                    <td className="px-5 py-2.5 text-right text-gray-700">{formatCurrency(r.taxableValue)}</td>
                    {splitMode === 'cgst_sgst' && <td className="px-5 py-2.5 text-right text-amber-700">{formatCurrency(r.cgst)}</td>}
                    {splitMode === 'cgst_sgst' && <td className="px-5 py-2.5 text-right text-amber-700">{formatCurrency(r.sgst)}</td>}
                    <td className="px-5 py-2.5 text-right font-semibold text-amber-800">{formatCurrency(r.totalGST)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                <tr>
                  <td className="px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-600">Total</td>
                  <td className="px-5 py-2.5 text-right font-bold text-gray-900">{formatCurrency(summary.totalTaxable)}</td>
                  {splitMode === 'cgst_sgst' && <td className="px-5 py-2.5 text-right font-bold text-amber-800">{formatCurrency(summary.totalCGST)}</td>}
                  {splitMode === 'cgst_sgst' && <td className="px-5 py-2.5 text-right font-bold text-amber-800">{formatCurrency(summary.totalSGST)}</td>}
                  <td className="px-5 py-2.5 text-right font-bold text-amber-900">{formatCurrency(summary.totalGST)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Invoice list */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-700">Invoice-wise Detail ({invoiceRows.length})</h3>
          <ExportBtn onClick={exportInvoices} label="Export invoices" />
        </div>
        {invoiceRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No invoices for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Invoice #</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Tax ID</th>
                  <th className="px-4 py-2 text-right">Taxable</th>
                  {splitMode === 'cgst_sgst' && <th className="px-4 py-2 text-right">CGST</th>}
                  {splitMode === 'cgst_sgst' && <th className="px-4 py-2 text-right">SGST</th>}
                  <th className="px-4 py-2 text-right">Total {taxLabel ?? 'Tax'}</th>
                  <th className="px-4 py-2 text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoiceRows.map((inv) => (
                  <tr key={inv.invoiceNumber} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">{inv.invoiceNumber}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-600">{fmtDate(inv.date)}</td>
                    <td className="px-4 py-2 text-gray-800">{inv.customerName || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{inv.customerGSTIN || '—'}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(inv.taxableValue)}</td>
                    {splitMode === 'cgst_sgst' && <td className="px-4 py-2 text-right text-amber-700">{formatCurrency(inv.cgst)}</td>}
                    {splitMode === 'cgst_sgst' && <td className="px-4 py-2 text-right text-amber-700">{formatCurrency(inv.sgst)}</td>}
                    <td className="px-4 py-2 text-right font-semibold text-amber-800">{formatCurrency(inv.totalGST)}</td>
                    <td className="px-4 py-2 text-right font-bold text-gray-900">{formatCurrency(inv.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {splitMode === 'cgst_sgst' && (
        <p className="text-xs text-gray-400">
          * Tax treated as intra-state (CGST = SGST = Total ÷ 2). For inter-state supplies, consult your tax advisor.
        </p>
      )}
    </div>
  );
}

// ─── GSTR-3B tab ─────────────────────────────────────────────────────────────

function FormRow({ label, taxable, cgst, sgst, totalGST, highlight = false, splitMode }) {
  const rowClass = highlight
    ? 'bg-amber-50 font-semibold text-amber-900'
    : 'text-gray-700 hover:bg-gray-50';
  return (
    <tr className={rowClass}>
      <td className="px-4 py-2.5 text-sm">{label}</td>
      <td className="px-4 py-2.5 text-right text-sm">{taxable !== undefined ? formatCurrency(taxable) : ''}</td>
      {splitMode === 'cgst_sgst' && <td className="px-4 py-2.5 text-right text-sm text-amber-700">{cgst !== undefined ? formatCurrency(cgst) : ''}</td>}
      {splitMode === 'cgst_sgst' && <td className="px-4 py-2.5 text-right text-sm text-amber-700">{sgst !== undefined ? formatCurrency(sgst) : ''}</td>}
      <td className="px-4 py-2.5 text-right text-sm font-semibold">{totalGST !== undefined ? formatCurrency(totalGST) : ''}</td>
    </tr>
  );
}

function SectionHead({ number, title }) {
  return (
    <tr className="bg-blue-50">
      <td colSpan={5} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-blue-700">
        {number}. {title}
      </td>
    </tr>
  );
}

function GSTR3BTab({ data, period, splitMode, taxLabel }) {
  if (!data) return null;
  const { outward, itc, net } = data;

  function export3B() {
    const rows = [
      { section: '3.1 Outward Supplies', description: 'Taxable supplies', taxableValue: outward.taxableValue.toFixed(2), cgst: outward.cgst.toFixed(2), sgst: outward.sgst.toFixed(2), totalGST: outward.totalGST.toFixed(2) },
      { section: '3.1 Outward Supplies', description: 'Nil-rated / exempt', taxableValue: outward.nilValue.toFixed(2), cgst: '', sgst: '', totalGST: '' },
      { section: '4 Input Tax Credit',   description: 'ITC from purchases', taxableValue: itc.taxableValue.toFixed(2), cgst: itc.cgst.toFixed(2), sgst: itc.sgst.toFixed(2), totalGST: itc.totalGST.toFixed(2) },
      { section: 'Net Payable',          description: 'GST payable after ITC', taxableValue: '', cgst: net.cgst.toFixed(2), sgst: net.sgst.toFixed(2), totalGST: net.totalGST.toFixed(2) },
      ...(net.creditCarry > 0 ? [{ section: 'Net Payable', description: 'Excess credit carry forward', taxableValue: '', cgst: '', sgst: '', totalGST: net.creditCarry.toFixed(2) }] : []),
    ];
    const cols = [
      { key: 'section',      header: 'Section' },
      { key: 'description',  header: 'Description' },
      { key: 'taxableValue', header: 'Taxable Value (₹)' },
      { key: 'cgst',         header: 'CGST (₹)' },
      { key: 'sgst',         header: 'SGST (₹)' },
      { key: 'totalGST',     header: 'Total GST (₹)' },
    ];
    exportCSV(`GSTR3B_${period.replace(/\s/g, '_').replace(/–/g, '-')}.csv`, cols, rows);
  }

  const tableHead = (
    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
      <tr>
        <th className="px-4 py-2 text-left">Description</th>
        <th className="px-4 py-2 text-right">Taxable Value</th>
        {splitMode === 'cgst_sgst' && <th className="px-4 py-2 text-right">CGST</th>}
        {splitMode === 'cgst_sgst' && <th className="px-4 py-2 text-right">SGST</th>}
        <th className="px-4 py-2 text-right">Total {taxLabel ?? 'Tax'}</th>
      </tr>
    </thead>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Top stat strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Sales invoices"                       value={data.totalSales}                  accent="blue"  />
        <SummaryCard label="Purchase bills"                       value={data.totalPurchases}              accent="blue"  />
        <SummaryCard label={`${taxLabel ?? 'Tax'} collected`}    value={formatCurrency(outward.totalGST)} accent="amber" />
        <SummaryCard label={`Net ${taxLabel ?? 'Tax'} payable`}  value={formatCurrency(net.totalGST)}
          sub={net.creditCarry > 0 ? `Excess credit: ${formatCurrency(net.creditCarry)}` : undefined}
          accent={net.totalGST > 0 ? 'red' : 'green'} />
      </div>

      {/* GSTR-3B table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">GSTR-3B Summary</h3>
            <p className="text-xs text-gray-500">Period: {period}</p>
          </div>
          <ExportBtn onClick={export3B} label="Export GSTR-3B" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            {tableHead}
            <tbody className="divide-y divide-gray-100">
              <SectionHead number="3.1" title="Details of Outward Supplies and Inward Supplies Liable to Reverse Charge" />
              <FormRow label="(a) Outward taxable supplies"
                taxable={outward.taxableValue} cgst={outward.cgst} sgst={outward.sgst} totalGST={outward.totalGST} splitMode={splitMode} />
              <FormRow label="(b) Nil rated / exempt / non-taxable supplies"
                taxable={outward.nilValue} splitMode={splitMode} />
              <tr className="bg-gray-50">
                <td className="px-4 py-2 text-xs font-semibold text-gray-600">Total outward</td>
                <td className="px-4 py-2 text-right text-xs font-semibold text-gray-800">{formatCurrency(outward.taxableValue + outward.nilValue)}</td>
                {splitMode === 'cgst_sgst' && <td className="px-4 py-2 text-right text-xs font-semibold text-amber-700">{formatCurrency(outward.cgst)}</td>}
                {splitMode === 'cgst_sgst' && <td className="px-4 py-2 text-right text-xs font-semibold text-amber-700">{formatCurrency(outward.sgst)}</td>}
                <td className="px-4 py-2 text-right text-xs font-semibold text-amber-800">{formatCurrency(outward.totalGST)}</td>
              </tr>

              <SectionHead number="4" title="Eligible Input Tax Credit" />
              <FormRow label="Input tax credit (from purchases)"
                taxable={itc.taxableValue} cgst={itc.cgst} sgst={itc.sgst} totalGST={itc.totalGST} splitMode={splitMode} />
              <tr className="bg-gray-50">
                <td className="px-4 py-2 text-xs font-semibold text-gray-600">Total ITC</td>
                <td className="px-4 py-2 text-right text-xs font-semibold text-gray-800">{formatCurrency(itc.taxableValue)}</td>
                {splitMode === 'cgst_sgst' && <td className="px-4 py-2 text-right text-xs font-semibold text-green-700">{formatCurrency(itc.cgst)}</td>}
                {splitMode === 'cgst_sgst' && <td className="px-4 py-2 text-right text-xs font-semibold text-green-700">{formatCurrency(itc.sgst)}</td>}
                <td className="px-4 py-2 text-right text-xs font-semibold text-green-800">{formatCurrency(itc.totalGST)}</td>
              </tr>

              <SectionHead number="6" title={`Net ${taxLabel ?? 'Tax'} Payable`} />
              <tr className={net.totalGST > 0 ? 'bg-red-50' : 'bg-green-50'}>
                <td className="px-4 py-2.5 text-sm font-semibold text-gray-800">
                  {net.totalGST > 0 ? `${taxLabel ?? 'Tax'} payable (Output − ITC)` : 'Excess ITC (credit carry forward)'}
                </td>
                <td className="px-4 py-2.5" />
                {splitMode === 'cgst_sgst' && <td className="px-4 py-2.5 text-right text-sm font-bold text-red-700">{formatCurrency(net.cgst)}</td>}
                {splitMode === 'cgst_sgst' && <td className="px-4 py-2.5 text-right text-sm font-bold text-red-700">{formatCurrency(net.sgst)}</td>}
                <td className={`px-4 py-2.5 text-right text-base font-extrabold ${net.totalGST > 0 ? 'text-red-800' : 'text-green-700'}`}>
                  {net.totalGST > 0 ? formatCurrency(net.totalGST) : formatCurrency(net.creditCarry)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-rate breakdown */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Output per rate */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-700">Output GST by Rate</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Rate</th>
                  <th className="px-4 py-2 text-right">Taxable</th>
                  <th className="px-4 py-2 text-right">GST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {outward.byRate.length === 0
                  ? <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">No data</td></tr>
                  : outward.byRate.map((r) => (
                    <tr key={r.rate} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{r.rate}%</td>
                      <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(r.taxableValue)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-amber-700">{formatCurrency(r.gst)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ITC per rate */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-700">Input Tax Credit by Rate</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Rate</th>
                  <th className="px-4 py-2 text-right">Taxable</th>
                  <th className="px-4 py-2 text-right">GST Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itc.byRate.length === 0
                  ? <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">No purchase data</td></tr>
                  : itc.byRate.map((r) => (
                    <tr key={r.rate} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{r.rate}%</td>
                      <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(r.taxableValue)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-green-700">{formatCurrency(r.gst)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        * This is a summary for reference only. Consult your tax advisor for filing. {splitMode === 'cgst_sgst' ? 'Intra-state split assumed (CGST = SGST).' : ''}
      </p>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function GSTPage() {
  const { activeCompanyId, taxLabel, taxReportTitle, tabA, tabB, splitMode } = useApp();

  const TABS = [
    { id: 'gstr1',  label: tabA  ?? 'Outward Supplies'    },
    { id: 'gstr3b', label: tabB  ?? 'Consolidated Return' },
  ];

  const [fromDate, setFromDate] = useState(toInputDate(monthStart()));
  const [toDate,   setToDate]   = useState(toInputDate(monthEnd()));
  const [tab,      setTab]      = useState('gstr1');

  const [gstr1,    setGstr1]   = useState(null);
  const [gstr3b,   setGstr3b]  = useState(null);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const from = fromDate ? startOfDay(new Date(fromDate)) : null;
      const to   = toDate   ? endOfDay(new Date(toDate))     : null;
      const [r1, r3b] = await Promise.all([
        computeGSTR1(activeCompanyId,  { fromDate: from, toDate: to }),
        computeGSTR3B(activeCompanyId, { fromDate: from, toDate: to }),
      ]);
      setGstr1(r1);
      setGstr3b(r3b);
    } catch (err) {
      setError(err.message ?? 'Failed to load GST data.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  function setQuick(offsetFrom, offsetTo) {
    setFromDate(toInputDate(monthStart(offsetFrom)));
    setToDate(toInputDate(monthEnd(offsetTo)));
  }

  const period = fmtPeriodLabel(fromDate, toDate);

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{taxReportTitle ?? 'Tax Reports'}</h1>
          <p className="text-sm text-gray-500">
            Tax summaries computed from recorded sales and purchases.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Quick:</span>
          <button type="button" onClick={() => setQuick(0, 0)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            This month
          </button>
          <button type="button" onClick={() => setQuick(-1, -1)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            Last month
          </button>
          <button type="button" onClick={() => setQuick(-2, -1)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            Last 2 months
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <span className="text-xs font-medium text-gray-500">Period:</span>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" onClick={load}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
          Generate
        </button>
        {period && (
          <span className="ml-auto text-xs font-medium text-gray-600">{period}</span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>
      ) : (
        <>
          {tab === 'gstr1'  && <GSTR1Tab  data={gstr1}  period={period} splitMode={splitMode} taxLabel={taxLabel} />}
          {tab === 'gstr3b' && <GSTR3BTab data={gstr3b} period={period} splitMode={splitMode} taxLabel={taxLabel} />}
        </>
      )}
    </div>
  );
}
