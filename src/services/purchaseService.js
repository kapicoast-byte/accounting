import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  runTransaction,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { buildJournalEntry, newJournalRef } from './journalService';
import { paymentModeToAccountId } from '../utils/accountConstants';

export const PURCHASE_PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Credit'];
export const PURCHASE_STATUS = { PAID: 'paid', UNPAID: 'unpaid', PARTIAL: 'partial' };

function purchasesCol(companyId) {
  return collection(db, 'companies', companyId, 'purchases');
}
function adjustmentsCol(companyId) {
  return collection(db, 'companies', companyId, 'stockAdjustments');
}
function inventoryDocRef(companyId, itemId) {
  return doc(db, 'companies', companyId, 'inventory', itemId);
}
function counterDocRef(companyId) {
  return doc(db, 'companies', companyId, 'meta', 'purchaseCounter');
}

// Pure helper shared with UI
export function computePurchaseTotals({ lineItems, discountType = 'flat', discountValue = 0 }) {
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

function nextBillNumber(counterData, currentYear) {
  if (!counterData || counterData.year !== currentYear) {
    return { newCount: 1, year: currentYear };
  }
  return { newCount: (counterData.count ?? 0) + 1, year: currentYear };
}
function formatBillNumber(year, count) {
  return `PUR-${year}-${String(count).padStart(3, '0')}`;
}

// ─── create purchase (transaction) ───────────────────────────────────────────

export async function createPurchase(companyId, { vendor, lineItems, discountType, discountValue, paymentMode, date, dueDate, notes, vendorBillNumber, bankAccountId = null }) {
  const inventoryLines = lineItems.filter((l) => l.itemId && l.itemId !== 'custom');
  const totals = computePurchaseTotals({ lineItems, discountType, discountValue });
  const isPaid = paymentMode !== 'Credit';
  const paidAmount = isPaid ? totals.grandTotal : 0;
  const balanceDue = totals.grandTotal - paidAmount;
  const status = isPaid ? PURCHASE_STATUS.PAID : PURCHASE_STATUS.UNPAID;
  const currentYear = new Date().getFullYear();

  const counterRef  = counterDocRef(companyId);
  const purchaseRef = doc(purchasesCol(companyId));
  const invRefs     = inventoryLines.map((l) => inventoryDocRef(companyId, l.itemId));
  const adjRefs     = inventoryLines.map(() => doc(adjustmentsCol(companyId)));
  const journalRef  = newJournalRef(companyId);

  return await runTransaction(db, async (tx) => {
    // Reads
    const counterSnap = await tx.get(counterRef);
    const invSnaps    = await Promise.all(invRefs.map((r) => tx.get(r)));

    for (let i = 0; i < inventoryLines.length; i++) {
      if (!invSnaps[i].exists()) {
        throw new Error(`Inventory item "${inventoryLines[i].itemName}" not found.`);
      }
    }

    // Bill number
    const { newCount, year } = nextBillNumber(
      counterSnap.exists() ? counterSnap.data() : null,
      currentYear,
    );
    const billNumber = formatBillNumber(year, newCount);

    tx.set(counterRef, { count: newCount, year });

    const purchaseData = {
      billNumber,
      vendorBillNumber: (vendorBillNumber ?? '').trim(),
      date:    Timestamp.fromDate(new Date(date)),
      dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
      vendorId: vendor?.vendorId ?? null,
      vendorSnapshot: {
        name:    vendor?.name    ?? '',
        phone:   vendor?.phone   ?? '',
        address: vendor?.address ?? '',
        GSTIN:   vendor?.GSTIN   ?? '',
      },
      lineItems: lineItems.map((l) => ({
        itemId:       l.itemId === 'custom' ? null : (l.itemId ?? null),
        itemName:     l.itemName,
        unit:         l.unit,
        quantity:     Number(l.quantity),
        unitPrice:    Number(l.unitPrice),
        gstRate:      Number(l.gstRate),
        lineSubtotal: Number(l.quantity) * Number(l.unitPrice),
        lineGST:      (Number(l.quantity) * Number(l.unitPrice) * Number(l.gstRate)) / 100,
      })),
      subtotal:       totals.subtotal,
      totalGST:       totals.totalGST,
      discountType,
      discountValue:  Number(discountValue) || 0,
      discountAmount: totals.discountAmount,
      grandTotal:     totals.grandTotal,
      totalAmount:    totals.grandTotal,
      paymentMode,
      paidAmount,
      balanceDue,
      status,
      notes:         notes ?? '',
      bankAccountId: bankAccountId ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    tx.set(purchaseRef, purchaseData);

    // Stock increases
    for (let i = 0; i < inventoryLines.length; i++) {
      const line      = inventoryLines[i];
      const snap      = invSnaps[i];
      const prevStock = Number(snap.data().currentStock) || 0;
      const newStock  = prevStock + line.quantity;
      tx.update(invRefs[i], { currentStock: newStock, updatedAt: serverTimestamp() });
      tx.set(adjRefs[i], {
        itemId: line.itemId, itemName: line.itemName,
        type: 'in', quantity: line.quantity, reason: 'Purchase',
        previousStock: prevStock, newStock,
        purchaseId: purchaseRef.id, purchaseBillNumber: billNumber,
        createdBy: null, createdAt: serverTimestamp(),
      });
    }

    // Journal entry
    const payingAccount = isPaid ? paymentModeToAccountId(paymentMode) : 'accounts_payable';
    const netCost = totals.subtotal - totals.discountAmount;
    tx.set(journalRef, buildJournalEntry({
      date,
      description: `Purchase — ${billNumber} from ${vendor?.name ?? 'Vendor'}`,
      sourceType:  'purchase',
      sourceId:    purchaseRef.id,
      sourceRef:   billNumber,
      lines: [
        { accountId: 'purchases',    debit: netCost,          credit: 0                },
        { accountId: 'gst_input',    debit: totals.totalGST,  credit: 0                },
        { accountId: payingAccount,  debit: 0,                credit: totals.grandTotal },
      ],
    }));

    return { purchaseId: purchaseRef.id, billNumber };
  });
}

// ─── read ─────────────────────────────────────────────────────────────────────

export async function getPurchase(companyId, purchaseId) {
  const snap = await getDoc(doc(db, 'companies', companyId, 'purchases', purchaseId));
  return snap.exists() ? { purchaseId: snap.id, ...snap.data() } : null;
}

export async function listPurchases(companyId, { fromDate, toDate } = {}) {
  let q;
  if (fromDate && toDate) {
    q = query(
      purchasesCol(companyId),
      where('date', '>=', Timestamp.fromDate(fromDate)),
      where('date', '<=', Timestamp.fromDate(toDate)),
      orderBy('date', 'desc'),
    );
  } else {
    q = query(purchasesCol(companyId), orderBy('date', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ purchaseId: d.id, ...d.data() }));
}

export async function listOutstandingPayables(companyId) {
  const q = query(
    purchasesCol(companyId),
    where('balanceDue', '>', 0),
    orderBy('balanceDue', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ purchaseId: d.id, ...d.data() }));
}

// ─── record payment (Accounts Payable → Cash/Bank) ───────────────────────────

export async function recordPurchasePayment(companyId, purchaseId, { amount, paymentMode }) {
  const purchaseRef = doc(db, 'companies', companyId, 'purchases', purchaseId);
  const journalRef  = newJournalRef(companyId);

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(purchaseRef);
    if (!snap.exists()) throw new Error('Purchase bill not found.');

    const p      = snap.data();
    const n      = Number(amount);
    const newPaid   = Math.min((p.paidAmount ?? 0) + n, p.grandTotal);
    const newBal    = p.grandTotal - newPaid;
    const newStatus =
      newBal  <= 0 ? PURCHASE_STATUS.PAID :
      newPaid  > 0 ? PURCHASE_STATUS.PARTIAL :
                     PURCHASE_STATUS.UNPAID;

    tx.update(purchaseRef, {
      paidAmount: newPaid, balanceDue: newBal,
      status: newStatus, paymentMode,
      updatedAt: serverTimestamp(),
    });

    tx.set(journalRef, buildJournalEntry({
      date:        new Date(),
      description: `Payment to vendor — ${p.billNumber}`,
      sourceType:  'payment_out',
      sourceId:    purchaseId,
      sourceRef:   p.billNumber,
      lines: [
        { accountId: 'accounts_payable',               debit: n, credit: 0 },
        { accountId: paymentModeToAccountId(paymentMode), debit: 0, credit: n },
      ],
    }));

    return { paidAmount: newPaid, balanceDue: newBal, status: newStatus };
  });
}
