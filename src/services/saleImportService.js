import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

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
