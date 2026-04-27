import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

function col(companyId) {
  return collection(db, 'companies', companyId, 'salesItems');
}

export async function writeSalesItems(companyId, items) {
  if (!items || !items.length) return;
  await Promise.all(
    items.map((item) =>
      addDoc(col(companyId), { ...item, importedAt: serverTimestamp() }),
    ),
  );
}

export async function listSalesItems(companyId, { fromDate, toDate } = {}) {
  const clauses = [];
  if (fromDate) clauses.push(where('date', '>=', Timestamp.fromDate(fromDate)));
  if (toDate)   clauses.push(where('date', '<=', Timestamp.fromDate(toDate)));
  clauses.push(orderBy('date', 'desc'));
  const q = query(col(companyId), ...clauses);
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.date;
    const dateStr = ts?.toDate ? ts.toDate().toISOString().slice(0, 10) : '';
    return { id: d.id, ...data, dateStr };
  });
}

export async function getTopSellingFromSalesItems(companyId, { fromDate, toDate } = {}, limit = 5) {
  const items = await listSalesItems(companyId, { fromDate, toDate });
  const map = new Map();
  for (const it of items) {
    const key = it.itemName;
    if (!key) continue;
    const prev = map.get(key) ?? { itemId: null, itemName: key, qty: 0, amount: 0 };
    prev.qty    += Number(it.quantity)    || 0;
    prev.amount += Number(it.totalAmount) || 0;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}
