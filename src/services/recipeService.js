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

function recipesCol(companyId) {
  return collection(db, 'companies', companyId, 'recipes');
}

function recipeDocRef(companyId, recipeId) {
  return doc(db, 'companies', companyId, 'recipes', recipeId);
}

export const RECIPE_CATEGORIES = ['Food', 'Beverage', 'Dessert', 'Snack', 'Other'];

export const SERVING_UNITS = ['portions', 'plates', 'glasses', 'bowls', 'pieces', 'litres'];

export async function listRecipes(companyId) {
  const q = query(recipesCol(companyId), orderBy('recipeName', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ recipeId: d.id, ...d.data() }));
}

export async function getRecipe(companyId, recipeId) {
  const snap = await getDoc(recipeDocRef(companyId, recipeId));
  return snap.exists() ? { recipeId: snap.id, ...snap.data() } : null;
}

export async function createRecipe(companyId, payload) {
  const ref = await addDoc(recipesCol(companyId), {
    recipeName:      payload.recipeName.trim(),
    category:        payload.category,
    servingSize:     Number(payload.servingSize) || 1,
    servingUnit:     payload.servingUnit,
    prepTime:        Number(payload.prepTime) || 0,
    cookTime:        Number(payload.cookTime) || 0,
    instructions:   (payload.instructions ?? '').trim(),
    sellingPrice:    Number(payload.sellingPrice) || 0,
    ingredients:     payload.ingredients ?? [],
    createdAt:       serverTimestamp(),
    updatedAt:       serverTimestamp(),
  });
  return { recipeId: ref.id };
}

export async function updateRecipe(companyId, recipeId, payload) {
  const updates = { updatedAt: serverTimestamp() };
  if (payload.recipeName   !== undefined) updates.recipeName   = payload.recipeName.trim();
  if (payload.category     !== undefined) updates.category     = payload.category;
  if (payload.servingSize  !== undefined) updates.servingSize  = Number(payload.servingSize) || 1;
  if (payload.servingUnit  !== undefined) updates.servingUnit  = payload.servingUnit;
  if (payload.prepTime     !== undefined) updates.prepTime     = Number(payload.prepTime) || 0;
  if (payload.cookTime     !== undefined) updates.cookTime     = Number(payload.cookTime) || 0;
  if (payload.instructions !== undefined) updates.instructions = payload.instructions.trim();
  if (payload.sellingPrice !== undefined) updates.sellingPrice = Number(payload.sellingPrice) || 0;
  if (payload.ingredients  !== undefined) updates.ingredients  = payload.ingredients;
  await updateDoc(recipeDocRef(companyId, recipeId), updates);
}

export async function deleteRecipe(companyId, recipeId) {
  await deleteDoc(recipeDocRef(companyId, recipeId));
}

// Each ingredient: { itemId, itemName, unit, qty, costPrice }
// Returns cost per serving
export function computeRecipeCost(ingredients) {
  return ingredients.reduce(
    (sum, ing) => sum + (Number(ing.qty) || 0) * (Number(ing.costPrice) || 0),
    0,
  );
}
