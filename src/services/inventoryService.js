import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

function inventoryCol(companyId) {
  return collection(db, 'companies', companyId, 'inventory');
}

function inventoryDoc(companyId, itemId) {
  return doc(db, 'companies', companyId, 'inventory', itemId);
}

export async function listInventoryItems(companyId) {
  const q = query(inventoryCol(companyId), orderBy('itemName', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ itemId: d.id, ...d.data() }));
}

export async function getInventoryItem(companyId, itemId) {
  const snap = await getDoc(inventoryDoc(companyId, itemId));
  return snap.exists() ? { itemId: snap.id, ...snap.data() } : null;
}

export async function createInventoryItem(companyId, payload) {
  const ref = await addDoc(inventoryCol(companyId), {
    itemName:     payload.itemName.trim(),
    category:     payload.category,
    unit:         payload.unit,
    currentStock: Number(payload.currentStock) || 0,
    reorderLevel: Number(payload.reorderLevel) || 0,
    costPrice:    Number(payload.costPrice) || 0,
    sellingPrice: Number(payload.sellingPrice) || 0,
    barcode:      payload.barcode?.trim() ?? '',
    isActive:     payload.isActive ?? true,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
  });
  return { itemId: ref.id };
}

export async function updateInventoryItem(companyId, itemId, payload) {
  const updates = { updatedAt: serverTimestamp() };
  if (payload.itemName    !== undefined) updates.itemName    = payload.itemName.trim();
  if (payload.category    !== undefined) updates.category    = payload.category;
  if (payload.unit        !== undefined) updates.unit        = payload.unit;
  if (payload.reorderLevel !== undefined) updates.reorderLevel = Number(payload.reorderLevel) || 0;
  if (payload.costPrice   !== undefined) updates.costPrice   = Number(payload.costPrice) || 0;
  if (payload.sellingPrice !== undefined) updates.sellingPrice = Number(payload.sellingPrice) || 0;
  if (payload.barcode     !== undefined) updates.barcode     = payload.barcode?.trim() ?? '';
  if (payload.isActive    !== undefined) updates.isActive    = !!payload.isActive;
  await updateDoc(inventoryDoc(companyId, itemId), updates);
}

export async function deleteInventoryItem(companyId, itemId) {
  await deleteDoc(inventoryDoc(companyId, itemId));
}

export function computeStockValuation(items) {
  const active = items.filter((i) => i.isActive !== false);

  const totalValue = active.reduce(
    (acc, i) => acc + (Number(i.currentStock) || 0) * (Number(i.costPrice) || 0),
    0,
  );

  const byCategory = active.reduce((acc, i) => {
    const cat = i.category ?? 'Uncategorized';
    const value = (Number(i.currentStock) || 0) * (Number(i.costPrice) || 0);
    acc[cat] = (acc[cat] ?? 0) + value;
    return acc;
  }, {});

  return {
    totalValue,
    totalItems: active.length,
    byCategory,
  };
}

export function isLowStock(item) {
  return Number(item.currentStock ?? 0) <= Number(item.reorderLevel ?? 0);
}
