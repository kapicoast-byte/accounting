import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  limit as fsLimit,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { STOCK_ADJUSTMENT_TYPES } from '../utils/inventoryConstants';

function adjustmentsCol(companyId) {
  return collection(db, 'companies', companyId, 'stockAdjustments');
}

function inventoryDocRef(companyId, itemId) {
  return doc(db, 'companies', companyId, 'inventory', itemId);
}

export async function createStockAdjustment(companyId, { itemId, type, quantity, reason, note = '', createdBy = null }) {
  const qty = Number(quantity);
  if (!itemId) throw new Error('Item is required.');
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be greater than zero.');
  if (type !== STOCK_ADJUSTMENT_TYPES.IN && type !== STOCK_ADJUSTMENT_TYPES.OUT) {
    throw new Error('Invalid adjustment type.');
  }
  if (!reason?.trim()) throw new Error('Reason is required.');

  const itemRef = inventoryDocRef(companyId, itemId);
  const adjRef = doc(adjustmentsCol(companyId));

  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists()) throw new Error('Inventory item not found.');

    const item = itemSnap.data();
    const previousStock = Number(item.currentStock) || 0;
    const newStock =
      type === STOCK_ADJUSTMENT_TYPES.IN ? previousStock + qty : previousStock - qty;

    if (newStock < 0) throw new Error('Insufficient stock for this adjustment.');

    tx.update(itemRef, {
      currentStock: newStock,
      updatedAt: serverTimestamp(),
    });

    tx.set(adjRef, {
      itemId,
      itemName: item.itemName ?? '',
      type,
      quantity: qty,
      reason: reason.trim(),
      note: note.trim(),
      previousStock,
      newStock,
      createdBy,
      createdAt: serverTimestamp(),
    });
  });

  return { adjustmentId: adjRef.id };
}

export async function listRecentAdjustments(companyId, limit = 25) {
  const q = query(adjustmentsCol(companyId), orderBy('createdAt', 'desc'), fsLimit(limit));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ adjustmentId: d.id, ...d.data() }));
}
