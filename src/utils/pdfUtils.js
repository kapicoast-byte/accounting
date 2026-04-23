import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BLUE  = [37, 99, 235];
const SLATE = [241, 245, 249];
const TEXT  = [30, 30, 30];
const MUTED = [100, 100, 100];

export function makePDF({ title, subtitle, companyName } = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 14;

  if (companyName) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(companyName, 14, y);
    y += 6;
  }

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT);
  doc.text(title ?? 'Report', 14, y);
  y += 7;

  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(subtitle, 14, y);
    y += 6;
  }

  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, 196, y);
  y += 5;

  doc._y = y;
  return doc;
}

export function sectionHeader(doc, label) {
  doc._y += 3;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLUE);
  doc.text(label, 14, doc._y);
  doc._y += 4;
}

export function addTable(doc, { head, body, foot } = {}) {
  autoTable(doc, {
    head,
    body,
    foot,
    startY: doc._y,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: SLATE, fontStyle: 'bold', textColor: TEXT },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });
  doc._y = doc.lastAutoTable.finalY + 5;
}

// Two-column label/value row (for P&L, Balance Sheet sections)
export function addLabelRow(doc, label, value, { bold = false, indent = 0, color } = {}) {
  doc._y += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setTextColor(...(color ?? TEXT));
  doc.text(label, 14 + indent, doc._y);
  doc.text(String(value), 196, doc._y, { align: 'right' });
}

export function addDivider(doc) {
  doc._y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(14, doc._y, 196, doc._y);
}

export function downloadPDF(doc, filename) {
  doc.save(filename);
}
