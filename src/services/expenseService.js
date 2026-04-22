import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

function expensesCol(companyId) {
  return collection(db, 'companies', companyId, 'expenses');
}
function expenseDoc(companyId, expenseId) {
  return doc(db, 'companies', companyId, 'expenses', expenseId);
}

export async function listExpenses(companyId, { fromDate, toDate } = {}) {
  let q;
  if (fromDate && toDate) {
    q = query(
      expensesCol(companyId),
      where('date', '>=', Timestamp.fromDate(fromDate)),
      where('date', '<=', Timestamp.fromDate(toDate)),
      orderBy('date', 'desc'),
    );
  } else {
    q = query(expensesCol(companyId), orderBy('date', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ expenseId: d.id, ...d.data() }));
}

export async function createExpense(companyId, { date, category, amount, paidBy, payee = '', notes = '' }) {
  if (!category) throw new Error('Category is required.');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Amount must be greater than 0.');

  const ref = await addDoc(expensesCol(companyId), {
    date: Timestamp.fromDate(new Date(date)),
    category,
    amount: amt,
    paidBy,
    payee: payee.trim(),
    notes: notes.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { expenseId: ref.id };
}

export async function updateExpense(companyId, expenseId, updates) {
  const payload = { updatedAt: serverTimestamp() };
  if (updates.date !== undefined)     payload.date = Timestamp.fromDate(new Date(updates.date));
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.amount !== undefined)   payload.amount = Number(updates.amount);
  if (updates.paidBy !== undefined)   payload.paidBy = updates.paidBy;
  if (updates.payee !== undefined)    payload.payee = updates.payee.trim();
  if (updates.notes !== undefined)    payload.notes = updates.notes.trim();
  await updateDoc(expenseDoc(companyId, expenseId), payload);
}

export async function deleteExpense(companyId, expenseId) {
  await deleteDoc(expenseDoc(companyId, expenseId));
}
