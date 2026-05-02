import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ─── PDF text extraction ───────────────────────────────────────────────────────

export async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group text items by y-coordinate to reconstruct table rows
    const lineMap = new Map();
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ str: item.str.trim(), x });
    }

    const pageLines = [...lineMap.entries()]
      .sort(([ya], [yb]) => yb - ya)
      .map(([, items]) =>
        items.sort((a, b) => a.x - b.x).map(it => it.str).filter(s => s).join('\t'),
      )
      .filter(l => l.trim());

    fullText += pageLines.join('\n') + '\n';
  }

  return fullText;
}

// ─── PDF row parser ────────────────────────────────────────────────────────────

const SKIP_ROW = /^(total|grand\s+total|min\b|max\b|avg\b|average|subtotal|sub\s+total|summary)\b/i;

function findColIdx(headerCols, name) {
  if (!name) return -1;
  const n = name.toLowerCase().trim();
  let i = headerCols.findIndex(h => h.toLowerCase().trim() === n);
  if (i !== -1) return i;
  i = headerCols.findIndex(h => h.toLowerCase().includes(n));
  if (i !== -1) return i;
  i = headerCols.findIndex(h => {
    const hh = h.toLowerCase().trim();
    return hh.length > 2 && n.includes(hh);
  });
  return i;
}

export function parsePdfRows(fullText, mapping) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);
  const itemHeader = (mapping.itemName || 'Item').toLowerCase();
  const headerIdx  = lines.findIndex(l => l.toLowerCase().includes(itemHeader));
  if (headerIdx === -1) return [];

  const headerCols = lines[headerIdx].split('\t');
  const idxMap = {};
  for (const [field, colName] of Object.entries(mapping)) {
    if (colName) idxMap[field] = findColIdx(headerCols, colName);
  }
  if (idxMap.itemName == null || idxMap.itemName === -1) return [];

  const today  = new Date().toISOString().slice(0, 10);
  const result = [];

  for (const line of lines.slice(headerIdx + 1)) {
    if (SKIP_ROW.test(line)) continue;
    const cols     = line.split('\t');
    const itemName = cols[idxMap.itemName]?.trim();
    if (!itemName) continue;

    const qty      = Number((cols[idxMap.quantity]    ?? '').replace(/[,\s]/g, '')) || 1;
    const totalAmt = Number((cols[idxMap.totalAmount] ?? '').replace(/[,\s]/g, '')) || 0;
    const taxAmt   = Number((cols[idxMap.taxAmount]   ?? '').replace(/[,\s]/g, '')) || 0;
    const category = cols[idxMap.category]?.trim() || 'Other';
    const unitPri  = Number((cols[idxMap.unitPrice]   ?? '').replace(/[,\s]/g, ''))
      || (totalAmt > taxAmt ? (totalAmt - taxAmt) / Math.max(qty, 1) : totalAmt / Math.max(qty, 1));

    result.push({
      id:          Math.random().toString(36).slice(2),
      date:        today,
      customerName:'Walk-in',
      category,
      lineItems:   [{ itemName, quantity: qty, unitPrice: unitPri, gstRate: 0 }],
      totalAmount: totalAmt,
      taxAmount:   taxAmt,
      paymentMode: 'Cash',
      notes:       '',
    });
  }

  return result;
}

// ─── Firestore helpers ─────────────────────────────────────────────────────────

function salesCol(companyId) {
  return collection(db, 'companies', companyId, 'sales');
}

export function normalizePaymentMode(raw) {
  if (!raw) return 'Cash';
  const s = String(raw).toLowerCase();
  if (s.includes('card') || s.includes('credit') || s.includes('debit')) return 'Card';
  if (s.includes('upi') || s.includes('gpay') || s.includes('paytm') || s.includes('phone') || s.includes('online')) return 'UPI';
  return 'Cash';
}

function parseImportDate(str) {
  if (!str || String(str).trim() === '') return Timestamp.now();
  const cleaned = String(str).trim();
  const dmyMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y.length === 2 ? `20${y}` : y;
    const date = new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00`);
    if (!isNaN(date.getTime())) return Timestamp.fromDate(date);
  }
  const isoDate = cleaned.match(/^\d{4}-\d{2}-\d{2}$/) ? cleaned + 'T12:00:00' : cleaned;
  const date    = new Date(isoDate);
  if (!isNaN(date.getTime())) return Timestamp.fromDate(date);
  return Timestamp.now();
}

export async function importSaleRow(companyId, row, batchId, orderIndex) {
  const qty         = Number(row.quantity)    || 1;
  const unitPrice   = Number(row.unitPrice)   || 0;
  const totalAmount = Number(row.totalAmount) || (qty * unitPrice);
  const gstAmount   = Number(row.gstAmount)   || 0;
  const subtotal    = Math.max(totalAmount - gstAmount, 0);
  const paymentMode = normalizePaymentMode(row.paymentMode);
  const date        = parseImportDate(row.date);
  const serial      = String(orderIndex + 1).padStart(3, '0');

  await addDoc(salesCol(companyId), {
    source:        'imported',
    importBatchId: batchId,
    invoiceNumber: `IMP-${batchId.slice(-6).toUpperCase()}-${serial}`,
    date,
    lineItems: [{
      itemName:     String(row.itemName ?? '').trim() || 'Imported Item',
      itemId:       null,
      unit:         'portion',
      quantity:     qty,
      unitPrice,
      gstRate:      0,
      lineSubtotal: subtotal,
      lineGST:      gstAmount,
    }],
    subtotal,
    totalGST:         gstAmount,
    discountAmount:   0,
    grandTotal:       totalAmount,
    paymentMode,
    paidAmount:       totalAmount,
    balanceDue:       0,
    status:           'paid',
    customerSnapshot: { name: '', phone: '', address: '', GSTIN: '' },
    customerId:       null,
    notes:            '',
    createdAt:        serverTimestamp(),
    updatedAt:        serverTimestamp(),
  });
}
