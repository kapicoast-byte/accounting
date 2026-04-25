import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toJsDate } from './dateUtils';

// Standard PDF fonts don't include ₹; use Rs. prefix throughout
function rs(n) {
  return `Rs.${(Number(n) || 0).toFixed(2)}`;
}

function fmt(ts) {
  const d = toJsDate(ts);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function gstBreakdown(lineItems) {
  const map = new Map();
  for (const l of lineItems ?? []) {
    const rate = Number(l.gstRate ?? 0);
    if (rate === 0) continue;
    const amt = Number(l.lineGST ?? ((l.lineSubtotal ?? 0) * rate) / 100);
    map.set(rate, (map.get(rate) ?? 0) + amt);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

const BLUE  = [37, 99, 235];
const TEXT  = [30, 30, 30];
const MUTED = [100, 100, 100];
const RED   = [220, 38, 38];

export function generateInvoicePDF(sale, company) {
  console.log('[InvoicePDF] Generating — sale:', JSON.stringify(sale, null, 2));
  console.log('[InvoicePDF] Company:', JSON.stringify(company, null, 2));

  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = 210;
  const L    = 14;   // left margin
  const R    = W - L; // right edge
  let y      = 14;

  // ── COMPANY HEADER (left) + INVOICE META (right) ─────────────────────────
  const companyName = company?.companyName ?? 'SmartBooks';
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT);
  doc.text(companyName, L, y);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MUTED);
  doc.text('TAX INVOICE', R, y, { align: 'right' });
  y += 6;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  const companyLines = [];
  if (company?.address) companyLines.push(company.address);
  if (company?.GSTIN)   companyLines.push(`GSTIN: ${company.GSTIN}`);
  if (company?.phone)   companyLines.push(`Ph: ${company.phone}`);
  companyLines.forEach((line) => { doc.text(line, L, y); y += 4; });

  // Invoice number + dates, right-aligned alongside company lines
  const metaY = 20; // fixed anchor so it doesn't depend on company line count
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLUE);
  doc.text(sale.invoiceNumber ?? '—', R, metaY, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`Date: ${fmt(sale.date)}`, R, metaY + 5, { align: 'right' });
  if (sale.dueDate) {
    doc.text(`Due: ${fmt(sale.dueDate)}`, R, metaY + 10, { align: 'right' });
  }

  y = Math.max(y, metaY + 16) + 3;

  // ── DIVIDER ───────────────────────────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.line(L, y, R, y);
  y += 5;

  // ── BILL TO ───────────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MUTED);
  doc.text('BILL TO', L, y);
  y += 4;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT);
  doc.text(sale.customerSnapshot?.name ?? 'Walk-in Customer', L, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  if (sale.customerSnapshot?.phone)   { doc.text(sale.customerSnapshot.phone, L, y);              y += 4; }
  if (sale.customerSnapshot?.address) { doc.text(sale.customerSnapshot.address, L, y);            y += 4; }
  if (sale.customerSnapshot?.GSTIN)   { doc.text(`GSTIN: ${sale.customerSnapshot.GSTIN}`, L, y);  y += 4; }

  if (sale.tableNumber || sale.orderType) {
    const meta = [sale.orderType, sale.tableNumber ? `Table: ${sale.tableNumber}` : ''].filter(Boolean).join('  |  ');
    doc.text(meta, L, y); y += 4;
  }

  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(L, y, R, y);
  y += 4;

  // ── LINE ITEMS TABLE ─────────────────────────────────────────────────────
  const tableRows = (sale.lineItems ?? []).map((l, i) => {
    const sub = Number(l.lineSubtotal ?? (Number(l.quantity) * Number(l.unitPrice))) || 0;
    const gst = Number(l.lineGST ?? (sub * Number(l.gstRate ?? 0)) / 100) || 0;
    return [
      String(i + 1),
      l.itemName ?? '—',
      String(l.quantity ?? 0),
      l.unit ?? '—',
      rs(l.unitPrice),
      `${l.gstRate ?? 0}%`,
      rs(gst),
      rs(sub + gst),
    ];
  });

  autoTable(doc, {
    startY:  y,
    head:    [['#', 'Item', 'Qty', 'Unit', 'Rate', 'GST%', 'GST Amt', 'Total']],
    body:    tableRows,
    styles:  { fontSize: 8, cellPadding: 2.5, textColor: TEXT },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      2: { cellWidth: 12, halign: 'right'  },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 22, halign: 'right'  },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 22, halign: 'right'  },
      7: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: L, right: L },
  });

  y = doc.lastAutoTable.finalY + 5;

  // ── TOTALS ────────────────────────────────────────────────────────────────
  const labelX = 130;

  function row(label, value, { bold = false, large = false, color = MUTED, valueColor } = {}) {
    const sz = large ? 10 : 8.5;
    doc.setFontSize(sz);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
    doc.text(label, labelX, y);
    doc.setTextColor(...(valueColor ?? (bold ? TEXT : MUTED)));
    doc.text(value, R, y, { align: 'right' });
    y += large ? 6 : 5;
  }

  row('Subtotal:', rs(sale.subtotal));

  const breakdown = gstBreakdown(sale.lineItems);
  if (breakdown.length > 0) {
    for (const [rate, amt] of breakdown) {
      const half = rate / 2;
      row(`GST @${rate}% (CGST ${half}% + SGST ${half}%):`, rs(amt));
    }
  } else if (Number(sale.totalGST) > 0) {
    row('Total GST:', rs(sale.totalGST));
  }

  if (Number(sale.discountAmount) > 0) {
    const dLabel = sale.discountType === 'percent'
      ? `Discount (${sale.discountValue}%):`
      : 'Discount:';
    row(dLabel, `- ${rs(sale.discountAmount)}`, { color: RED, valueColor: RED });
  }

  doc.setDrawColor(200, 200, 200);
  doc.line(labelX, y - 1, R, y - 1);
  y += 1;

  row('Grand Total:', rs(sale.grandTotal), { bold: true, large: true, valueColor: BLUE });

  if (Number(sale.balanceDue) > 0) {
    row('Balance Due:', rs(sale.balanceDue), { bold: true, color: RED, valueColor: RED });
  }
  if (Number(sale.paidAmount) > 0 && sale.status !== 'unpaid') {
    row('Amount Paid:', rs(sale.paidAmount), { color: [22, 163, 74], valueColor: [22, 163, 74] });
  }

  // ── PAYMENT + NOTES ───────────────────────────────────────────────────────
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(L, y, R, y);
  y += 5;

  const statusLabel =
    sale.status === 'paid'    ? 'Paid' :
    sale.status === 'partial' ? 'Partially Paid' :
                                'Unpaid';

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`Payment Mode: ${sale.paymentMode ?? '—'}`, L, y);
  doc.text(`Status: ${statusLabel}`, L + 60, y);
  y += 5;

  if (sale.notes) {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const noteLines = doc.splitTextToSize(`Notes: ${sale.notes}`, R - L);
    doc.text(noteLines, L, y);
    y += noteLines.length * 4 + 2;
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footerY = 285;
  doc.setDrawColor(200, 200, 200);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(L, footerY - 5, R, footerY - 5);
  doc.setLineDashPattern([], 0);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED);
  doc.text('Thank you for your business!', W / 2, footerY, { align: 'center' });

  const contact = [company?.phone, company?.GSTIN ? `GSTIN: ${company.GSTIN}` : ''].filter(Boolean).join('  |  ');
  if (contact) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(contact, W / 2, footerY + 4, { align: 'center' });
  }

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const filename = `Invoice-${sale.invoiceNumber ?? 'download'}.pdf`;
  doc.save(filename);
}
