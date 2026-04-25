import { toJsDate } from './dateUtils';

function fmt(ts) {
  const d = toJsDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function rs(n) {
  return `&#8377;${(Number(n) || 0).toFixed(2)}`;
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function gstBreakdown(lineItems) {
  const map = new Map();
  for (const l of lineItems ?? []) {
    const rate = Number(l.gstRate ?? 0);
    if (rate === 0) continue;
    const amt = Number(l.lineGST ?? ((Number(l.lineSubtotal) || 0) * rate) / 100);
    map.set(rate, (map.get(rate) ?? 0) + amt);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export function generateInvoiceHTML(sale, company) {
  console.log('[InvoiceHTML] sale:', sale, 'company:', company);

  const breakdown = gstBreakdown(sale.lineItems);
  const statusLabel =
    sale.status === 'paid'    ? 'Paid' :
    sale.status === 'partial' ? 'Partially Paid' : 'Unpaid';

  const lineRows = (sale.lineItems ?? []).map((l, i) => {
    const sub = Number(l.lineSubtotal ?? (Number(l.quantity) * Number(l.unitPrice))) || 0;
    const gst = Number(l.lineGST ?? (sub * Number(l.gstRate ?? 0)) / 100) || 0;
    return `
      <tr class="${i % 2 === 1 ? 'alt' : ''}">
        <td class="center">${i + 1}</td>
        <td><strong>${esc(l.itemName)}</strong></td>
        <td class="right">${Number(l.quantity)}</td>
        <td class="center muted">${esc(l.unit ?? '—')}</td>
        <td class="right">${rs(l.unitPrice)}</td>
        <td class="center">${Number(l.gstRate ?? 0)}%</td>
        <td class="right">${rs(gst)}</td>
        <td class="right bold">${rs(sub + gst)}</td>
      </tr>`;
  }).join('');

  const gstRows = breakdown.length > 0
    ? breakdown.map(([rate, amt]) => {
        const half = rate / 2;
        return `
          <tr>
            <td class="label muted">GST @ ${rate}% (CGST ${half}% + SGST ${half}%)</td>
            <td class="right">${rs(amt)}</td>
          </tr>`;
      }).join('')
    : Number(sale.totalGST) > 0
      ? `<tr><td class="label muted">Total GST</td><td class="right">${rs(sale.totalGST)}</td></tr>`
      : '';

  const discountRow = Number(sale.discountAmount) > 0
    ? `<tr>
        <td class="label muted">Discount${sale.discountType === 'percent' ? ` (${sale.discountValue}%)` : ''}</td>
        <td class="right red">&#8722; ${rs(sale.discountAmount)}</td>
       </tr>`
    : '';

  const balanceDueRow = Number(sale.balanceDue) > 0
    ? `<tr>
        <td class="label red">Balance Due</td>
        <td class="right red bold">${rs(sale.balanceDue)}</td>
       </tr>`
    : '';

  const fnbMeta = (sale.orderType || sale.tableNumber)
    ? `<p class="meta">${[sale.orderType, sale.tableNumber ? `Table: ${esc(sale.tableNumber)}` : ''].filter(Boolean).join(' &nbsp;|&nbsp; ')}</p>`
    : '';

  const noteRow = sale.notes
    ? `<p class="meta" style="margin-top:6px">Notes: ${esc(sale.notes)}</p>` : '';

  const contactLine = [company?.phone, company?.GSTIN ? `GSTIN: ${esc(company.GSTIN)}` : ''].filter(Boolean).join(' &nbsp;|&nbsp; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${esc(sale.invoiceNumber ?? '')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 portrait; margin: 14mm; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      color: #1e1e1e;
      background: #fff;
      padding: 14mm;
      width: 210mm;
      min-height: 297mm;
    }

    /* ── Header ── */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .company-name { font-size: 16pt; font-weight: 700; color: #1e1e1e; margin-bottom: 4px; }
    .company-meta { font-size: 8pt; color: #666; line-height: 1.6; }
    .invoice-label { font-size: 10pt; font-weight: 700; color: #999; text-align: right; letter-spacing: 1px; text-transform: uppercase; }
    .invoice-number { font-size: 13pt; font-weight: 700; color: #2563eb; text-align: right; margin: 4px 0; }
    .invoice-dates { font-size: 8pt; color: #666; text-align: right; line-height: 1.7; }

    hr { border: none; border-top: 1px solid #ddd; margin: 8px 0; }

    /* ── Bill To ── */
    .bill-to-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 4px; }
    .customer-name { font-size: 10pt; font-weight: 700; margin-bottom: 3px; }
    .meta { font-size: 8.5pt; color: #555; line-height: 1.6; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 8.5pt; }
    thead tr { background: #2563eb; color: #fff; }
    thead th { padding: 5px 6px; font-weight: 700; font-size: 8pt; }
    tbody td { padding: 4.5px 6px; border-bottom: 1px solid #f0f0f0; }
    tr.alt td { background: #f8fafc; }
    .center { text-align: center; }
    .right { text-align: right; }
    .muted { color: #666; }
    .bold { font-weight: 700; }
    .red { color: #dc2626; }

    /* ── Totals ── */
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 10px; }
    .totals-table { width: 55%; font-size: 8.5pt; border-collapse: collapse; }
    .totals-table td { padding: 3px 4px; }
    .totals-table .label { color: #666; padding-right: 10px; }
    .totals-divider { border-top: 1px solid #ddd; }
    .grand-total td { font-size: 11pt; font-weight: 700; padding-top: 5px; }
    .grand-total .right { color: #2563eb; }

    /* ── Payment ── */
    .payment-section { margin-top: 10px; font-size: 8.5pt; color: #555; border-top: 1px solid #ddd; padding-top: 8px; }
    .payment-section span { margin-right: 20px; }

    /* ── Footer ── */
    .footer { margin-top: 20px; border-top: 1px dashed #ccc; padding-top: 8px; text-align: center; font-size: 8pt; color: #999; font-style: italic; }
    .footer .contact { margin-top: 3px; font-style: normal; font-size: 7.5pt; }

    @media print {
      body { padding: 0; }
      @page { margin: 14mm; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div>
      <div class="company-name">${esc(company?.companyName ?? 'SmartBooks')}</div>
      <div class="company-meta">
        ${company?.address ? `<div>${esc(company.address)}</div>` : ''}
        ${company?.GSTIN   ? `<div>GSTIN: ${esc(company.GSTIN)}</div>` : ''}
        ${company?.phone   ? `<div>Ph: ${esc(company.phone)}</div>` : ''}
      </div>
    </div>
    <div>
      <div class="invoice-label">Tax Invoice</div>
      <div class="invoice-number">${esc(sale.invoiceNumber ?? '—')}</div>
      <div class="invoice-dates">
        Date: ${fmt(sale.date)}<br/>
        ${sale.dueDate ? `Due: ${fmt(sale.dueDate)}<br/>` : ''}
      </div>
    </div>
  </div>

  <hr/>

  <!-- Bill To -->
  <div style="margin: 8px 0 10px;">
    <div class="bill-to-label">Bill To</div>
    <div class="customer-name">${esc(sale.customerSnapshot?.name ?? 'Walk-in Customer')}</div>
    ${sale.customerSnapshot?.phone   ? `<p class="meta">${esc(sale.customerSnapshot.phone)}</p>` : ''}
    ${sale.customerSnapshot?.address ? `<p class="meta">${esc(sale.customerSnapshot.address)}</p>` : ''}
    ${sale.customerSnapshot?.GSTIN   ? `<p class="meta">GSTIN: ${esc(sale.customerSnapshot.GSTIN)}</p>` : ''}
    ${fnbMeta}
  </div>

  <hr/>

  <!-- Line Items -->
  <table>
    <thead>
      <tr>
        <th class="center" style="width:5%">#</th>
        <th style="width:28%">Item</th>
        <th class="right" style="width:7%">Qty</th>
        <th class="center" style="width:8%">Unit</th>
        <th class="right" style="width:13%">Rate</th>
        <th class="center" style="width:7%">GST%</th>
        <th class="right" style="width:13%">GST Amt</th>
        <th class="right" style="width:14%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals-wrap">
    <table class="totals-table">
      <tr>
        <td class="label">Subtotal</td>
        <td class="right">${rs(sale.subtotal)}</td>
      </tr>
      ${gstRows}
      ${discountRow}
      <tr class="totals-divider">
        <td style="padding-top:0;padding-bottom:0"></td><td></td>
      </tr>
      <tr class="grand-total">
        <td class="label" style="color:#1e1e1e;font-weight:700">Grand Total</td>
        <td class="right">${rs(sale.grandTotal)}</td>
      </tr>
      ${balanceDueRow}
      ${Number(sale.paidAmount) > 0 && sale.status !== 'unpaid'
        ? `<tr><td class="label" style="color:#16a34a">Amount Paid</td><td class="right" style="color:#16a34a">${rs(sale.paidAmount)}</td></tr>`
        : ''}
    </table>
  </div>

  <!-- Payment + notes -->
  <div class="payment-section">
    <span>Payment Mode: <strong>${esc(sale.paymentMode ?? '—')}</strong></span>
    <span>Status: <strong>${statusLabel}</strong></span>
    ${noteRow}
  </div>

  <!-- Footer -->
  <div class="footer">
    Thank you for your business!
    ${contactLine ? `<div class="contact">${contactLine}</div>` : ''}
  </div>

</body>
</html>`;
}

export function printInvoice(sale, company) {
  const html = generateInvoiceHTML(sale, company);
  const win  = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print invoices.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
    win.close();
  };
}
