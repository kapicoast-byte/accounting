import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Gemini File API ───────────────────────────────────────────────────────────

const uploadPDFToGemini = async (file) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const uploadRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'start, upload, finalize',
        'X-Goog-Upload-Header-Content-Type': 'application/pdf',
        'X-Goog-Upload-Header-Content-Length': uint8Array.length,
        'Content-Type': 'application/pdf',
      },
      body: uint8Array,
    },
  );
  const uploadData = await uploadRes.json();
  console.log('File upload response:', uploadData);
  return uploadData.file?.uri;
};

const extractFromFileURI = async (fileUri) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  await new Promise((r) => setTimeout(r, 3000));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              file_data: {
                mime_type: 'application/pdf',
                file_uri: fileUri,
              },
            },
            {
              text: `This is a restaurant sales report PDF with a table.
Extract ALL data rows. Skip rows containing: Total, Min, Max, Avg, or header words like Taxable/Restaurant/Category/Item.
For each valid item row return JSON with:
itemName, category, quantity, myAmount, tax, grossSales
All number fields must be numbers not strings.
Return ONLY a JSON array starting with [ no markdown no code blocks.`,
            },
          ],
        }],
      }),
    },
  );
  const data = await res.json();
  console.log('Gemini response:', data);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI could not extract data from PDF');
  return JSON.parse(match[0]);
};

export const importPDFSales = async (file, onProgress) => {
  try {
    onProgress('Uploading PDF to Gemini...');
    const fileUri = await uploadPDFToGemini(file);
    if (!fileUri) throw new Error('File upload failed - check API key');

    onProgress('AI is reading your sales report...');
    const items = await extractFromFileURI(fileUri);

    onProgress(`Done! Found ${items.length} items`);
    return items;
  } catch (err) {
    console.error('PDF import error:', err);
    throw err;
  }
};

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
  const date = new Date(isoDate);
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
    totalGST:       gstAmount,
    discountAmount: 0,
    grandTotal:     totalAmount,
    paymentMode,
    paidAmount:     totalAmount,
    balanceDue:     0,
    status:         'paid',
    customerSnapshot: { name: '', phone: '', address: '', GSTIN: '' },
    customerId:     null,
    notes:          '',
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
  });
}
