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
  console.log('1. PDF pages:', pdf.numPages);

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

    if (pageNum === 1) {
      console.log('2. Page 1 text:', pageLines.join('\n'));
    }

    fullText += pageLines.join('\n') + '\n';
  }

  console.log('3. All extracted text:', fullText.substring(0, 500));
  const allLines = fullText.split('\n').filter(l => l.trim());
  console.log('4. Lines after split:', allLines.slice(0, 10));
  return fullText;
}

// ─── PDF row parser ────────────────────────────────────────────────────────────
//
// Format (Kapi Coast sales report):
//   [Taxable|Non-Taxable] [RESTAURANT] [CATEGORY] [Item Name] qty myAmt discount tax grossSales
//
// Strategy: extract the 5 trailing numbers, parse text before them for category + item.

const SKIP_ROW_START = /^(total|grand\s+total|min\.?|max\.?|avg\.?|average|subtotal|sub\s+total|summary)\b/i;
const ITEM_BLACKLIST  = new Set(['total', 'min.', 'max.', 'avg.', 'taxable', 'non-taxable', 'restaurant', 'category', 'item', 'name']);

export function parsePdfRows(fullText) {
  const today  = new Date().toISOString().slice(0, 10);
  const result = [];

  const validLines = fullText
    .split('\n')
    .map(l => l.replace(/\t+/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(l => l && !SKIP_ROW_START.test(l));
  console.log('5. Lines after filter:', validLines.slice(0, 5));

  for (const line of validLines) {
    const numMatches = [...line.matchAll(/\d+(?:[.,]\d+)*/g)];
    if (numMatches.length < 2) continue;

    // Last 5 numbers map to: qty | myAmount | discount | tax | grossSales
    const trailing  = numMatches.slice(-5);
    const n         = trailing.length;
    const grossSales = parseFloat(trailing[n - 1][0].replace(',', '')) || 0;
    const tax        = n >= 2 ? parseFloat(trailing[n - 2][0].replace(',', '')) || 0 : 0;
    // trailing[n-3] = discount (consumed for position, not stored separately)
    const myAmount   = n >= 4 ? parseFloat(trailing[n - 4][0].replace(',', '')) || 0 : 0;
    const qty        = n >= 5 ? parseFloat(trailing[n - 5][0].replace(',', '')) || 1 : 1;

    if (grossSales === 0 && myAmount === 0) continue;

    // Text before the first of the trailing numbers
    let textPart = line.slice(0, trailing[0].index).trim();

    // Strip leading tax-type word
    textPart = textPart.replace(/^non-taxable\s+/i, '').replace(/^taxable\s+/i, '').trim();

    // Strip restaurant name prefix ("KAPI COAST")
    const restaurantTag = 'KAPI COAST';
    const rIdx = textPart.toUpperCase().indexOf(restaurantTag);
    if (rIdx !== -1) {
      textPart = textPart.slice(rIdx + restaurantTag.length).trim();
    }

    // Leading ALL-CAPS words → category; first mixed-case word onwards → item name
    const words    = textPart.split(/\s+/).filter(Boolean);
    const catWords  = [];
    const itemWords = [];
    let inCat = true;
    for (const w of words) {
      if (inCat && !/[a-z]/.test(w)) catWords.push(w);
      else { inCat = false; itemWords.push(w); }
    }

    const category = catWords.join(' ').replace(/\s*[&\-]\s*$/, '').trim() || 'Other';
    const itemName = itemWords.join(' ').trim();

    if (!itemName || ITEM_BLACKLIST.has(itemName.toLowerCase())) continue;

    const unitPrice = myAmount > 0
      ? myAmount / Math.max(qty, 1)
      : grossSales / Math.max(qty, 1);

    result.push({
      id:           Math.random().toString(36).slice(2),
      date:         today,
      customerName: 'Walk-in',
      category,
      lineItems:    [{ itemName, quantity: qty, unitPrice, gstRate: 0 }],
      totalAmount:  grossSales,
      taxAmount:    tax,
      paymentMode:  'Cash',
      notes:        '',
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
