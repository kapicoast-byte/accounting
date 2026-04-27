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
  const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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

    // Sort rows top-to-bottom (PDF y=0 is at bottom, so sort y descending)
    const pageLines = [...lineMap.entries()]
      .sort(([ya], [yb]) => yb - ya)
      .map(([, items]) =>
        items
          .sort((a, b) => a.x - b.x)
          .map(it => it.str)
          .filter(s => s)
          .join('\t'),
      )
      .filter(l => l.trim());

    fullText += pageLines.join('\n') + '\n';
  }

  return fullText;
}

// ─── Gemini column-mapping prompt ─────────────────────────────────────────────

export function buildPdfMappingPrompt(sampleText) {
  return `This is a sample from a restaurant sales report:
"${sampleText}"

Identify which words/headers correspond to these fields:
itemName, category, quantity, totalAmount, taxAmount

Return ONLY a JSON object like:
{"itemName": "Item", "category": "Category", "quantity": "Qty", "totalAmount": "Gross Sales", "taxAmount": "Tax"}
No markdown, no explanation.`;
}

// ─── Local row parser ──────────────────────────────────────────────────────────

const SKIP_ROW = /^(total|grand\s+total|min\b|max\b|avg\b|average|subtotal|sub\s+total|summary)\b/i;

function findColIdx(headerCols, name) {
  if (!name) return -1;
  const n = name.toLowerCase().trim();
  // Exact match
  let i = headerCols.findIndex(h => h.toLowerCase().trim() === n);
  if (i !== -1) return i;
  // Header cell contains the search name
  i = headerCols.findIndex(h => h.toLowerCase().includes(n));
  if (i !== -1) return i;
  // Search name contains the header cell (e.g. mapping "Gross Sales" vs header "Gross")
  i = headerCols.findIndex(h => {
    const hh = h.toLowerCase().trim();
    return hh.length > 2 && n.includes(hh);
  });
  return i;
}

export function parsePdfRows(fullText, mapping) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

  // Locate the header row (line that contains the itemName column header)
  const itemHeader = (mapping.itemName || 'Item').toLowerCase();
  const headerIdx  = lines.findIndex(l => l.toLowerCase().includes(itemHeader));
  if (headerIdx === -1) return [];

  const headerCols = lines[headerIdx].split('\t');

  // Map each field to its column index
  const idxMap = {};
  for (const [field, colName] of Object.entries(mapping)) {
    if (colName) idxMap[field] = findColIdx(headerCols, colName);
  }

  if (idxMap.itemName === undefined || idxMap.itemName === -1) return [];

  const today  = new Date().toISOString().slice(0, 10);
  const result = [];

  for (const line of lines.slice(headerIdx + 1)) {
    if (SKIP_ROW.test(line)) continue;
    const cols     = line.split('\t');
    const itemName = cols[idxMap.itemName]?.trim();
    if (!itemName) continue;

    const qty         = Number((cols[idxMap.quantity]    ?? '').replace(/[,\s]/g, '')) || 1;
    const totalAmount = Number((cols[idxMap.totalAmount] ?? '').replace(/[,\s]/g, '')) || 0;
    const taxAmount   = Number((cols[idxMap.taxAmount]   ?? '').replace(/[,\s]/g, '')) || 0;
    const category    = cols[idxMap.category]?.trim() || 'Other';

    const subtotal  = Math.max(totalAmount - taxAmount, 0);
    const unitPrice = qty > 0 ? subtotal / qty : 0;
    const gstRate   = subtotal > 0 ? (taxAmount / subtotal) * 100 : 0;

    result.push({
      id:           Math.random().toString(36).slice(2),
      date:         today,
      customerName: 'Walk-in',
      lineItems:    [{ itemName, quantity: qty, unitPrice, gstRate }],
      paymentMode:  'Cash',
      notes:        category,
    });
  }

  return result;
}

// ─── Date-range extractor ──────────────────────────────────────────────────────

export function extractDateRangeFromText(text) {
  // Match "DD/MM/YYYY to DD/MM/YYYY" or "DD-MM-YYYY to DD-MM-YYYY"
  const m = text.match(
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s+to\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
  );
  if (!m) return { dateFrom: '', dateTo: '' };
  function toISO(s) {
    const p = s.split(/[\/\-]/);
    if (p.length !== 3) return '';
    const [d, mo, y] = p;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return { dateFrom: toISO(m[1]), dateTo: toISO(m[2]) };
}

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
  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y.length === 2 ? `20${y}` : y;
    const date = new Date(`${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    if (!isNaN(date.getTime())) return Timestamp.fromDate(date);
  }
  const date = new Date(cleaned);
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
    lineItems: [
      {
        itemName:     String(row.itemName ?? '').trim() || 'Imported Item',
        itemId:       null,
        unit:         'portion',
        quantity:     qty,
        unitPrice,
        gstRate:      0,
        lineSubtotal: subtotal,
        lineGST:      gstAmount,
      },
    ],
    subtotal,
    totalGST:      gstAmount,
    discountAmount: 0,
    grandTotal:    totalAmount,
    paymentMode,
    paidAmount:    totalAmount,
    balanceDue:    0,
    status:        'paid',
    customerSnapshot: { name: '', phone: '', address: '', GSTIN: '' },
    customerId:    null,
    notes:         '',
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  });
}
