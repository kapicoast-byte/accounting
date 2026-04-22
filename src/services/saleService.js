import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  runTransaction,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Credit'];
export const GST_RATES = [0, 5, 12, 18, 28];
export const SALE_STATUS = { PAID: 'paid', UNPAID: 'unpaid', PARTIAL: 'partial' };

// ─── helpers ────────────────────────────────────────────────────────────────

function salesCol(companyId) {
  return collection(db, 'companies', companyId, 'sales');
}
function adjustmentsCol(companyId) {
  return collection(db, 'companies', companyId, 'stockAdjustments');
}
function inventoryDocRef(companyId, itemId) {
  return doc(db, 'companies', companyId, 'inventory', itemId);
}
function counterDocRef(companyId) {
  return doc(db, 'companies', companyId, 'meta', 'invoiceCounter');
}

// ─── totals calculator (pure, used in both UI and service) ──────────────────

export function computeInvoiceTotals({ lineItems, discountType, discountValue }) {
  const subtotal = lineItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const totalGST = lineItems.reduce(
    (s, l) => s + (l.quantity * l.unitPrice * l.gstRate) / 100,
    0,
  );
  const rawDiscount =
    discountType === 'percent'
      ? (subtotal * (Number(discountValue) || 0)) / 100
      : Number(discountValue) || 0;
  const discountAmount = Math.min(rawDiscount, subtotal);
  const grandTotal = Math.max(subtotal - discountAmount + totalGST, 0);
  return { subtotal, totalGST, discountAmount, grandTotal };
}

// ─── invoice number ──────────────────────────────────────────────────────────

// Called inside a transaction — takes existing tx reads as arguments.
function resolveNextInvoiceNumber(counterData, currentYear) {
  if (!counterData || counterData.year !== currentYear) {
    return { newCount: 1, year: currentYear };
  }
  return { newCount: (counterData.count ?? 0) + 1, year: currentYear };
}

function formatInvoiceNumber(year, count) {
  return `INV-${year}-${String(count).padStart(3, '0')}`;
}

// ─── create sale (transaction) ───────────────────────────────────────────────

export async function createSale(companyId, { customer, lineItems, discountType, discountValue, paymentMode, date, dueDate, notes }) {
  const inventoryLines = lineItems.filter((l) => l.itemId && l.itemId !== 'custom');
  const totals = computeInvoiceTotals({ lineItems, discountType, discountValue });
  const isPaid = paymentMode !== 'Credit';
  const paidAmount = isPaid ? totals.grandTotal : 0;
  const balanceDue = totals.grandTotal - paidAmount;
  const status = isPaid ? SALE_STATUS.PAID : SALE_STATUS.UNPAID;
  const currentYear = new Date().getFullYear();

  const counterRef = counterDocRef(companyId);
  const saleRef = doc(salesCol(companyId));
  const adjRefs = inventoryLines.map(() => doc(adjustmentsCol(companyId)));
  const invRefs = inventoryLines.map((l) => inventoryDocRef(companyId, l.itemId));

  return await runTransaction(db, async (tx) => {
    // ── reads first ──
    const counterSnap = await tx.get(counterRef);
    const invSnaps = await Promise.all(invRefs.map((r) => tx.get(r)));

    // ── validate stock ──
    for (let i = 0; i < inventoryLines.length; i++) {
      const line = inventoryLines[i];
      const snap = invSnaps[i];
      if (!snap.exists()) throw new Error(`Item "${line.itemName}" not found in inventory.`);
      const available = Number(snap.data().currentStock) || 0;
      if (available < line.quantity) {
        throw new Error(
          `Insufficient stock for "${line.itemName}". Available: ${available} ${snap.data().unit}, requested: ${line.quantity}.`,
        );
      }
    }

    // ── resolve invoice number ──
    const { newCount, year } = resolveNextInvoiceNumber(
      counterSnap.exists() ? counterSnap.data() : null,
      currentYear,
    );
    const invoiceNumber = formatInvoiceNumber(year, newCount);

    // ── writes ──
    tx.set(counterRef, { count: newCount, year });

    const saleData = {
      invoiceNumber,
      date: Timestamp.fromDate(new Date(date)),
      dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
      customerId: customer.customerId ?? null,
      customerSnapshot: {
        name: customer.name ?? '',
        phone: customer.phone ?? '',
        address: customer.address ?? '',
        GSTIN: customer.GSTIN ?? '',
      },
      lineItems: lineItems.map((l) => ({
        itemId: l.itemId === 'custom' ? null : (l.itemId ?? null),
        itemName: l.itemName,
        unit: l.unit,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        gstRate: Number(l.gstRate),
        lineSubtotal: Number(l.quantity) * Number(l.unitPrice),
        lineGST: (Number(l.quantity) * Number(l.unitPrice) * Number(l.gstRate)) / 100,
      })),
      subtotal: totals.subtotal,
      totalGST: totals.totalGST,
      discountType,
      discountValue: Number(discountValue) || 0,
      discountAmount: totals.discountAmount,
      grandTotal: totals.grandTotal,
      paymentMode,
      paidAmount,
      balanceDue,
      status,
      notes: notes ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    tx.set(saleRef, saleData);

    for (let i = 0; i < inventoryLines.length; i++) {
      const line = inventoryLines[i];
      const snap = invSnaps[i];
      const prevStock = Number(snap.data().currentStock) || 0;
      const newStock = prevStock - line.quantity;

      tx.update(invRefs[i], { currentStock: newStock, updatedAt: serverTimestamp() });

      tx.set(adjRefs[i], {
        itemId: line.itemId,
        itemName: line.itemName,
        type: 'out',
        quantity: line.quantity,
        reason: 'Sale',
        previousStock: prevStock,
        newStock,
        saleId: saleRef.id,
        saleInvoiceNumber: invoiceNumber,
        createdBy: null,
        createdAt: serverTimestamp(),
      });
    }

    return { saleId: saleRef.id, invoiceNumber };
  });
}

// ─── read operations ─────────────────────────────────────────────────────────

export async function getSale(companyId, saleId) {
  const snap = await getDoc(doc(db, 'companies', companyId, 'sales', saleId));
  return snap.exists() ? { saleId: snap.id, ...snap.data() } : null;
}

export async function listSales(companyId, { fromDate, toDate } = {}) {
  let q;
  if (fromDate && toDate) {
    q = query(
      salesCol(companyId),
      where('date', '>=', Timestamp.fromDate(fromDate)),
      where('date', '<=', Timestamp.fromDate(toDate)),
      orderBy('date', 'desc'),
    );
  } else {
    q = query(salesCol(companyId), orderBy('date', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ saleId: d.id, ...d.data() }));
}

// ─── mark as paid ────────────────────────────────────────────────────────────

export async function recordPayment(companyId, saleId, { amount, paymentMode }) {
  const saleRef = doc(db, 'companies', companyId, 'sales', saleId);
  const snap = await getDoc(saleRef);
  if (!snap.exists()) throw new Error('Invoice not found.');

  const sale = snap.data();
  const newPaid = Math.min((sale.paidAmount ?? 0) + Number(amount), sale.grandTotal);
  const newBalance = sale.grandTotal - newPaid;
  const newStatus =
    newBalance <= 0
      ? SALE_STATUS.PAID
      : newPaid > 0
        ? SALE_STATUS.PARTIAL
        : SALE_STATUS.UNPAID;

  await updateDoc(saleRef, {
    paidAmount: newPaid,
    balanceDue: newBalance,
    status: newStatus,
    paymentMode,
    updatedAt: serverTimestamp(),
  });

  return { paidAmount: newPaid, balanceDue: newBalance, status: newStatus };
}
