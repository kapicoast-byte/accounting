import {
  collection, addDoc, getDocs, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { listSales } from './saleService';
import { listPurchases } from './purchaseService';
import { listExpenses } from './expenseService';
import { startOfDay, endOfDay, toJsDate } from '../utils/dateUtils';

// ── Reconciliation sessions collection ────────────────────────────────────────

function reconCol(companyId) {
  return collection(db, 'companies', companyId, 'reconciliations');
}

export async function saveReconciliationSession(companyId, data) {
  const ref = await addDoc(reconCol(companyId), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return { sessionId: ref.id };
}

export async function listReconciliationSessions(companyId) {
  const q = query(reconCol(companyId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ sessionId: d.id, ...d.data() }));
}

// ── Financial records loader ───────────────────────────────────────────────────

export async function loadRecordsForPeriod(companyId, fromDate, toDate) {
  const from = new Date(fromDate);
  from.setDate(from.getDate() - 3);
  const to = new Date(toDate);
  to.setDate(to.getDate() + 3);

  const [sales, purchases, expenses] = await Promise.all([
    listSales(companyId,     { fromDate: startOfDay(from), toDate: endOfDay(to) }),
    listPurchases(companyId, { fromDate: startOfDay(from), toDate: endOfDay(to) }),
    listExpenses(companyId,  { fromDate: startOfDay(from), toDate: endOfDay(to) }),
  ]);

  return { sales, purchases, expenses };
}

// ── Matching logic ─────────────────────────────────────────────────────────────

function amountMatch(a, b, pct = 0.02) {
  const max = Math.max(Math.abs(a), Math.abs(b));
  return max > 0 && Math.abs(a - b) / max <= pct;
}

function dayMatch(d1, d2, days = 2) {
  return Math.abs(d1.getTime() - d2.getTime()) <= days * 86400000;
}

export function runMatching(bankRows, { sales, purchases, expenses }) {
  const usedSales     = new Set();
  const usedPurchases = new Set();
  const usedExpenses  = new Set();

  return bankRows.map((row, idx) => {
    const bd = row.date;

    if (row.credit > 0) {
      const sale = sales.find((s) =>
        !usedSales.has(s.saleId) &&
        amountMatch(row.credit, s.grandTotal) &&
        dayMatch(bd, toJsDate(s.date))
      );
      if (sale) {
        usedSales.add(sale.saleId);
        return { ...row, idx, status: 'MATCHED', matchedWith: `Sale ${sale.invoiceNumber ?? ''}`.trim(), matchedType: 'sale', matchedId: sale.saleId };
      }
      return { ...row, idx, status: 'UNMATCHED_CREDIT' };
    }

    if (row.debit > 0) {
      const purchase = purchases.find((p) =>
        !usedPurchases.has(p.purchaseId) &&
        amountMatch(row.debit, p.grandTotal) &&
        dayMatch(bd, toJsDate(p.date))
      );
      if (purchase) {
        usedPurchases.add(purchase.purchaseId);
        return { ...row, idx, status: 'MATCHED', matchedWith: `Bill ${purchase.billNumber ?? ''}`.trim(), matchedType: 'purchase', matchedId: purchase.purchaseId };
      }

      const expense = expenses.find((ex) =>
        !usedExpenses.has(ex.expenseId) &&
        amountMatch(row.debit, ex.amount) &&
        dayMatch(bd, toJsDate(ex.date))
      );
      if (expense) {
        usedExpenses.add(expense.expenseId);
        return { ...row, idx, status: 'MATCHED', matchedWith: `Expense: ${expense.category}`, matchedType: 'expense', matchedId: expense.expenseId };
      }

      return { ...row, idx, status: 'UNMATCHED_DEBIT' };
    }

    return { ...row, idx, status: 'MATCHED' };
  });
}
