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

export const MENU_CATEGORIES    = ['Food', 'Beverage', 'Dessert', 'Extras', 'Specials'];
export const MENU_GST_RATES     = [0, 5, 12, 18];
export const MENU_PORTION_UNITS = ['portion', 'plate', 'glass', 'bowl', 'piece', 'litre', 'ml', 'kg', 'g'];

// Each ingredient shape stored on menu item:
// { inventoryItemId, inventoryItemName, quantity, unit, costPrice }
// Returns total cost per portion.
export function computeMenuItemCost(ingredients) {
  return (ingredients ?? []).reduce(
    (sum, ing) => sum + (Number(ing.quantity) || 0) * (Number(ing.costPrice) || 0),
    0,
  );
}

export function computeMargin(sellingPrice, costPrice) {
  const sp = Number(sellingPrice) || 0;
  const cp = Number(costPrice)    || 0;
  if (sp <= 0) return null;
  return ((sp - cp) / sp) * 100;
}

// Build the derived fields that are always stored alongside the raw payload
function derived(payload) {
  const ingredients  = payload.ingredients  ?? [];
  const sellingPrice = Number(payload.sellingPrice) || 0;
  const costPrice    = computeMenuItemCost(ingredients);
  const profitMargin = computeMargin(sellingPrice, costPrice);
  return { costPrice, profitMargin: profitMargin ?? null };
}

export async function listMenuItems(companyId) {
  const q    = query(menuItemsCol(companyId), orderBy('displayOrder', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ menuItemId: d.id, ...d.data() }));
}

export async function createMenuItem(companyId, payload) {
  const ref = await addDoc(menuItemsCol(companyId), {
    itemName:     payload.itemName.trim(),
    category:     payload.category,
    sellingPrice: Number(payload.sellingPrice) || 0,
    gstRate:      Number(payload.gstRate)      || 0,
    ingredients:  payload.ingredients          ?? [],
    portionSize:  Number(payload.portionSize)  || 1,
    unit:         payload.unit                 || 'portion',
    description:  (payload.description         ?? '').trim(),
    isAvailable:  payload.isAvailable          !== false,
    displayOrder: Number(payload.displayOrder) || 0,
    isVeg:        payload.isVeg                ?? null,
    HSNCode:      (payload.HSNCode             ?? '').trim(),
    ...derived(payload),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { menuItemId: ref.id };
}

// The form always sends every editable field so we can always recompute derived values.
export async function updateMenuItem(companyId, itemId, payload) {
  await updateDoc(menuItemDoc(companyId, itemId), {
    itemName:     payload.itemName.trim(),
    category:     payload.category,
    sellingPrice: Number(payload.sellingPrice) || 0,
    gstRate:      Number(payload.gstRate)      || 0,
    ingredients:  payload.ingredients          ?? [],
    portionSize:  Number(payload.portionSize)  || 1,
    unit:         payload.unit                 || 'portion',
    description:  (payload.description         ?? '').trim(),
    isAvailable:  !!payload.isAvailable,
    displayOrder: Number(payload.displayOrder) || 0,
    isVeg:        payload.isVeg                ?? null,
    HSNCode:      (payload.HSNCode             ?? '').trim(),
    ...derived(payload),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMenuItem(companyId, itemId) {
  await deleteDoc(menuItemDoc(companyId, itemId));
}

export async function toggleMenuItemAvailability(companyId, itemId, isAvailable) {
  await updateDoc(menuItemDoc(companyId, itemId), {
    isAvailable: !!isAvailable,
    updatedAt:   serverTimestamp(),
  });
}
