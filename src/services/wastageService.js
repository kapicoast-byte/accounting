import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  runTransaction,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

function wastageCol(companyId) {
  return collection(db, 'companies', companyId, 'wastage');
}

function inventoryDocRef(companyId, itemId) {
  return doc(db, 'companies', companyId, 'inventory', itemId);
}

export const WASTAGE_REASONS = ['Expired', 'Spoiled', 'Overcooked', 'Dropped', 'Other'];

export async function listWastageEntries(companyId, { fromDate, toDate } = {}) {
  let q;
  if (fromDate && toDate) {
    q = query(
      wastageCol(companyId),
      where('date', '>=', Timestamp.fromDate(fromDate)),
      where('date', '<=', Timestamp.fromDate(toDate)),
      orderBy('date', 'desc'),
    );
  } else {
    q = query(wastageCol(companyId), orderBy('date', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ wastageId: d.id, ...d.data() }));
}

export async function createWastageEntry(companyId, { itemId, quantity, reason, date, notes = '', createdBy = null }) {
  const qty = Number(quantity);
  if (!itemId) throw new Error('Item is required.');
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be greater than zero.');
  if (!reason?.trim()) throw new Error('Reason is required.');

  const itemRef = inventoryDocRef(companyId, itemId);
  const wastageRef = doc(wastageCol(companyId));

  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists()) throw new Error('Inventory item not found.');

    const item = itemSnap.data();
    const previousStock = Number(item.currentStock) || 0;
    const newStock = previousStock - qty;
    if (newStock < 0) throw new Error('Quantity exceeds available stock.');

    tx.update(itemRef, {
      currentStock: newStock,
      updatedAt:    serverTimestamp(),
    });

    tx.set(wastageRef, {
      itemId,
      itemName:      item.itemName ?? '',
      unit:          item.unit ?? '',
      costPrice:     Number(item.costPrice) || 0,
      quantity:      qty,
      totalCost:     qty * (Number(item.costPrice) || 0),
      reason:        reason.trim(),
      date:          Timestamp.fromDate(new Date(date)),
      notes:         notes.trim(),
      previousStock,
      newStock,
      createdBy,
      createdAt:     serverTimestamp(),
    });
  });

  return { wastageId: wastageRef.id };
}
