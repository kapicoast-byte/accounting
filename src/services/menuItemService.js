import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

function menuItemsCol(companyId) {
  return collection(db, 'companies', companyId, 'menuItems');
}

function menuItemDoc(companyId, itemId) {
  return doc(db, 'companies', companyId, 'menuItems', itemId);
}

export const MENU_CATEGORIES = ['Food', 'Beverage', 'Dessert', 'Extras', 'Specials'];
export const MENU_GST_RATES = [0, 5, 12, 18];
export const MENU_PORTION_UNITS = ['portion', 'plate', 'glass', 'bowl', 'piece', 'litre', 'ml', 'kg', 'g'];

export async function listMenuItems(companyId) {
  const q = query(menuItemsCol(companyId), orderBy('displayOrder', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ menuItemId: d.id, ...d.data() }));
}

export async function createMenuItem(companyId, payload) {
  const ref = await addDoc(menuItemsCol(companyId), {
    itemName:       payload.itemName.trim(),
    category:       payload.category,
    sellingPrice:   Number(payload.sellingPrice) || 0,
    gstRate:        Number(payload.gstRate) || 0,
    linkedRecipeId: payload.linkedRecipeId || null,
    portionSize:    Number(payload.portionSize) || 1,
    unit:           payload.unit || 'portion',
    description:    (payload.description ?? '').trim(),
    isAvailable:    payload.isAvailable !== false,
    displayOrder:   Number(payload.displayOrder) || 0,
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
  });
  return { menuItemId: ref.id };
}

export async function updateMenuItem(companyId, itemId, payload) {
  const updates = { updatedAt: serverTimestamp() };
  if (payload.itemName       !== undefined) updates.itemName       = payload.itemName.trim();
  if (payload.category       !== undefined) updates.category       = payload.category;
  if (payload.sellingPrice   !== undefined) updates.sellingPrice   = Number(payload.sellingPrice) || 0;
  if (payload.gstRate        !== undefined) updates.gstRate        = Number(payload.gstRate) || 0;
  if (payload.linkedRecipeId !== undefined) updates.linkedRecipeId = payload.linkedRecipeId || null;
  if (payload.portionSize    !== undefined) updates.portionSize    = Number(payload.portionSize) || 1;
  if (payload.unit           !== undefined) updates.unit           = payload.unit;
  if (payload.description    !== undefined) updates.description    = (payload.description ?? '').trim();
  if (payload.isAvailable    !== undefined) updates.isAvailable    = !!payload.isAvailable;
  if (payload.displayOrder   !== undefined) updates.displayOrder   = Number(payload.displayOrder) || 0;
  await updateDoc(menuItemDoc(companyId, itemId), updates);
}

export async function deleteMenuItem(companyId, itemId) {
  await deleteDoc(menuItemDoc(companyId, itemId));
}

export async function toggleMenuItemAvailability(companyId, itemId, isAvailable) {
  await updateDoc(menuItemDoc(companyId, itemId), {
    isAvailable: !!isAvailable,
    updatedAt: serverTimestamp(),
  });
}
