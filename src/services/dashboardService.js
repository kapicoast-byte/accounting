import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  addDays,
  dateKey,
  toJsDate,
} from '../utils/dateUtils';

function companyCol(companyId, name) {
  return collection(db, 'companies', companyId, name);
}

function sumField(docs, field) {
  return docs.reduce((acc, d) => acc + (Number(d[field]) || 0), 0);
}

async function fetchInRange(companyId, name, dateField, start, end) {
  const q = query(
    companyCol(companyId, name),
    where(dateField, '>=', Timestamp.fromDate(start)),
    where(dateField, '<=', Timestamp.fromDate(end)),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchAll(companyId, name) {
  const snap = await getDocs(companyCol(companyId, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTodaysSalesTotal(companyId) {
  const docs = await fetchInRange(companyId, 'sales', 'date', startOfDay(), endOfDay());
  console.log('[Dashboard] getTodaysSalesTotal — companyId:', companyId, '| docs returned:', docs.length, '| raw:', docs);
  return { total: sumField(docs, 'grandTotal'), count: docs.length };
}

export async function getTodaysPurchasesTotal(companyId) {
  const docs = await fetchInRange(companyId, 'purchases', 'date', startOfDay(), endOfDay());
  console.log('[Dashboard] getTodaysPurchasesTotal — companyId:', companyId, '| docs returned:', docs.length, '| raw:', docs);
  return { total: sumField(docs, 'grandTotal'), count: docs.length };
}

export async function getOutstandingReceivables(companyId) {
  const q = query(companyCol(companyId, 'sales'), where('balanceDue', '>', 0));
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => d.data());
  return { total: sumField(docs, 'balanceDue'), count: docs.length };
}

export async function getOutstandingPayables(companyId) {
  const q = query(companyCol(companyId, 'purchases'), where('balanceDue', '>', 0));
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => d.data());
  return { total: sumField(docs, 'balanceDue'), count: docs.length };
}

export async function getLowStockItems(companyId, limit = 10) {
  const items = await fetchAll(companyId, 'inventory');
  const active = items.filter((i) => i.isActive !== false);
  const low = active
    .filter((i) => Number(i.currentStock ?? 0) <= Number(i.reorderLevel ?? 0) && Number(i.reorderLevel ?? 0) > 0)
    .sort((a, b) => Number(a.currentStock ?? 0) - Number(b.currentStock ?? 0));
  console.log('[Dashboard] getLowStockItems — companyId:', companyId, '| active items:', active.length, '| low stock:', low.length);
  return { items: low.slice(0, limit), totalCount: low.length };
}

export async function getTopSellingItemsThisMonth(companyId, limit = 5) {
  const sales = await fetchInRange(
    companyId,
    'sales',
    'date',
    startOfMonth(),
    endOfDay(),
  );
  console.log('[Dashboard] getTopSellingItemsThisMonth — companyId:', companyId, '| sales this month:', sales.length);

  const totals = new Map();
  for (const sale of sales) {
    const lines = Array.isArray(sale.lineItems) ? sale.lineItems : [];
    for (const line of lines) {
      const key = line.itemId ?? line.itemName;
      if (!key) continue;
      const qty    = Number(line.quantity ?? 0);
      const amount = Number(line.lineSubtotal ?? 0);
      const prev = totals.get(key) ?? {
        itemId:   line.itemId   ?? null,
        itemName: line.itemName ?? 'Unnamed item',
        qty:      0,
        amount:   0,
      };
      prev.qty    += qty;
      prev.amount += amount;
      totals.set(key, prev);
    }
  }

  return [...totals.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export async function getCashAndBankBalance(companyId) {
  const accounts = await fetchAll(companyId, 'accounts');
  const cashAccounts = accounts.filter((a) => a.type === 'cash');
  const bankAccounts = accounts.filter((a) => a.type === 'bank');

  return {
    cashTotal: sumField(cashAccounts, 'balance'),
    bankTotal: sumField(bankAccounts, 'balance'),
    accounts: [...cashAccounts, ...bankAccounts].map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: Number(a.balance) || 0,
    })),
  };
}

export async function getLast7DaysSalesVsPurchases(companyId) {
  const start = startOfDay(addDays(new Date(), -6));
  const end = endOfDay();

  const [sales, purchases] = await Promise.all([
    fetchInRange(companyId, 'sales', 'date', start, end),
    fetchInRange(companyId, 'purchases', 'date', start, end),
  ]);

  const buckets = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    buckets.set(dateKey(d), { date: dateKey(d), sales: 0, purchases: 0 });
  }

  console.log('[Dashboard] getLast7DaysSalesVsPurchases — companyId:', companyId, '| sales:', sales.length, '| purchases:', purchases.length);

  for (const s of sales) {
    const d = toJsDate(s.date);
    if (!d) continue;
    const k = dateKey(d);
    if (buckets.has(k)) buckets.get(k).sales += Number(s.grandTotal) || 0;
  }
  for (const p of purchases) {
    const d = toJsDate(p.date);
    if (!d) continue;
    const k = dateKey(d);
    if (buckets.has(k)) buckets.get(k).purchases += Number(p.grandTotal) || 0;
  }

  return [...buckets.values()];
}

export async function getDashboardSnapshot(companyId) {
  const [
    todaysSales,
    todaysPurchases,
    receivables,
    payables,
    lowStock,
    topSelling,
    cashBank,
    weeklyChart,
  ] = await Promise.all([
    getTodaysSalesTotal(companyId),
    getTodaysPurchasesTotal(companyId),
    getOutstandingReceivables(companyId),
    getOutstandingPayables(companyId),
    getLowStockItems(companyId),
    getTopSellingItemsThisMonth(companyId),
    getCashAndBankBalance(companyId),
    getLast7DaysSalesVsPurchases(companyId),
  ]);

  return {
    todaysSales,
    todaysPurchases,
    receivables,
    payables,
    lowStock,
    topSelling,
    cashBank,
    weeklyChart,
  };
}
