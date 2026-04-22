import { formatCurrency, formatNumber } from '../../utils/format';
import { toJsDate } from '../../utils/dateUtils';

function fmt(ts) {
  const d = toJsDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

// Group line-item GST by rate for the tax summary rows
function gstBreakdown(lineItems) {
  const map = new Map();
  for (const l of lineItems ?? []) {
    const rate = l.gstRate ?? 0;
    const amt = l.lineGST ?? (l.lineSubtotal * rate) / 100;
    map.set(rate, (map.get(rate) ?? 0) + amt);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export default function InvoicePrintLayout({ sale, company }) {
  if (!sale) return null;
  const breakdown = gstBreakdown(sale.lineItems);

  return (
    <div id="print-invoice" className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-8 text-gray-800 print:max-w-none print:rounded-none print:border-0 print:p-0">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{company?.companyName ?? 'SmartBooks'}</h1>
          {company?.address && <p className="mt-0.5 text-xs text-gray-500">{company.address}</p>}
          {company?.GSTIN  && <p className="text-xs text-gray-500">GSTIN: {company.GSTIN}</p>}
          {company?.phone  && <p className="text-xs text-gray-500">Ph: {company.phone}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold uppercase tracking-widest text-gray-400">Tax Invoice</p>
          <p className="mt-1 text-xl font-bold text-blue-700">{sale.invoiceNumber}</p>
          <p className="text-xs text-gray-500">Date: {fmt(sale.date)}</p>
          {sale.dueDate && <p className="text-xs text-gray-500">Due: {fmt(sale.dueDate)}</p>}
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Bill to */}
      <div className="my-4 text-xs">
        <p className="font-semibold uppercase tracking-wide text-gray-500">Bill To</p>
        <p className="text-sm font-semibold text-gray-900">{sale.customerSnapshot?.name ?? 'Walk-in customer'}</p>
        {sale.customerSnapshot?.phone   && <p>{sale.customerSnapshot.phone}</p>}
        {sale.customerSnapshot?.address && <p>{sale.customerSnapshot.address}</p>}
        {sale.customerSnapshot?.GSTIN   && <p>GSTIN: {sale.customerSnapshot.GSTIN}</p>}
      </div>

      <hr className="border-gray-200" />

      {/* Line items */}
      <table className="mt-4 w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-left uppercase tracking-wide text-gray-500">
            <th className="pb-1.5">#</th>
            <th className="pb-1.5">Item</th>
            <th className="pb-1.5 text-right">Qty</th>
            <th className="pb-1.5 text-right">Unit</th>
            <th className="pb-1.5 text-right">Price</th>
            <th className="pb-1.5 text-right">GST%</th>
            <th className="pb-1.5 text-right">GST</th>
            <th className="pb-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {(sale.lineItems ?? []).map((l, i) => {
            const sub = l.lineSubtotal ?? l.quantity * l.unitPrice;
            const gst = l.lineGST ?? (sub * l.gstRate) / 100;
            return (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1.5">{i + 1}</td>
                <td className="py-1.5 font-medium">{l.itemName}</td>
                <td className="py-1.5 text-right">{formatNumber(l.quantity)}</td>
                <td className="py-1.5 text-right text-gray-500">{l.unit}</td>
                <td className="py-1.5 text-right">{formatCurrency(l.unitPrice)}</td>
                <td className="py-1.5 text-right">{l.gstRate}%</td>
                <td className="py-1.5 text-right">{formatCurrency(gst)}</td>
                <td className="py-1.5 text-right font-medium">{formatCurrency(sub + gst)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <dl className="w-64 text-xs">
          <div className="flex justify-between py-0.5">
            <dt className="text-gray-500">Subtotal</dt>
            <dd className="font-medium">{formatCurrency(sale.subtotal)}</dd>
          </div>
          {breakdown.map(([rate, amt]) => (
            <div key={rate} className="flex justify-between py-0.5">
              <dt className="text-gray-500">GST @ {rate}%</dt>
              <dd>{formatCurrency(amt)}</dd>
            </div>
          ))}
          {sale.discountAmount > 0 && (
            <div className="flex justify-between py-0.5">
              <dt className="text-gray-500">
                Discount{sale.discountType === 'percent' ? ` (${sale.discountValue}%)` : ''}
              </dt>
              <dd className="text-red-600">− {formatCurrency(sale.discountAmount)}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1.5 text-sm">
            <dt className="font-bold">Grand Total</dt>
            <dd className="font-bold text-blue-700">{formatCurrency(sale.grandTotal)}</dd>
          </div>
          {sale.balanceDue > 0 && (
            <div className="mt-1 flex justify-between text-red-600">
              <dt>Balance due</dt>
              <dd className="font-semibold">{formatCurrency(sale.balanceDue)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Payment info + notes */}
      <div className="mt-6 text-xs text-gray-500">
        <p>Payment mode: <span className="font-medium capitalize text-gray-700">{sale.paymentMode}</span></p>
        {sale.notes && <p className="mt-1">Notes: {sale.notes}</p>}
      </div>

      <div className="mt-8 border-t border-dashed border-gray-200 pt-4 text-center text-xs text-gray-400">
        Thank you for your business!
      </div>
    </div>
  );
}
