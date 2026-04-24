import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

function productionCol(companyId) {
  return collection(db, 'companies', companyId, 'production');
}

function inventoryDocRef(companyId, itemId) {
  return doc(db, 'companies', companyId, 'inventory', itemId);
}

export async function listProductionLogs(companyId) {
  const q = query(productionCol(companyId), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ productionId: d.id, ...d.data() }));
}

export async function createProductionLog(companyId, {
  recipeId, recipeName, portions, ingredients, costPerServing, date, notes = '', createdBy = null,
}) {
  const qty = Number(portions);
  if (!recipeId) throw new Error('Recipe is required.');
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Portions must be greater than zero.');

  const prodRef = doc(productionCol(companyId));
  const totalCost = costPerServing * qty;

  await runTransaction(db, async (tx) => {
    // Deduct each ingredient from inventory
    for (const ing of ingredients) {
      const needed = (Number(ing.qty) || 0) * qty;
      if (needed <= 0) continue;

      const itemRef = inventoryDocRef(companyId, ing.itemId);
      const snap = await tx.get(itemRef);
      if (!snap.exists()) throw new Error(`Ingredient "${ing.itemName}" not found in inventory.`);

      const current = Number(snap.data().currentStock) || 0;
      if (current < needed) {
        throw new Error(`Insufficient stock for "${ing.itemName}". Need ${needed}, have ${current}.`);
      }
      tx.update(itemRef, { currentStock: current - needed, updatedAt: serverTimestamp() });
    }

    tx.set(prodRef, {
      recipeId,
      recipeName,
      portions:     qty,
      ingredients,
      costPerServing,
      totalCost,
      date:         Timestamp.fromDate(new Date(date)),
      notes:        notes.trim(),
      createdBy,
      createdAt:    serverTimestamp(),
    });
  });

  return { productionId: prodRef.id };
}
