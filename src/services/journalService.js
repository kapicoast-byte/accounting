import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { ACCOUNTS_BY_ID, ACCOUNT_TYPE_ORDER, getAccount } from '../utils/accountConstants';

function journalCol(companyId) {
  return collection(db, 'companies', companyId, 'journal');
}

// Returns a new doc ref inside the journal collection — use inside transactions/batches.
export function newJournalRef(companyId) {
  return doc(journalCol(companyId));
}

// ─── build entry object (pure) ────────────────────────────────────────────────
// lines: [{ accountId, debit, credit }]
// Filters zero-amount lines, validates balance, attaches account metadata.
export function buildJournalEntry({ date, description, sourceType, sourceId, sourceRef, lines }) {
  const nonZero = lines.filter((l) => (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0);
  const totalDebit  = nonZero.reduce((s, l) => s + (Number(l.debit)  || 0), 0);
  const totalCredit = nonZero.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`Journal entry not balanced: debit ${totalDebit.toFixed(2)}, credit ${totalCredit.toFixed(2)}`);
  }
  const entryDate = date instanceof Date ? date : new Date(date);
  return {
    date: Timestamp.fromDate(entryDate),
    description: description ?? '',
    sourceType: sourceType ?? 'manual',
    sourceId: sourceId ?? null,
    sourceRef: sourceRef ?? null,
    lines: nonZero.map((l) => {
      const acc = ACCOUNTS_BY_ID[l.accountId];
      return {
        accountId:   l.accountId,
        accountName: acc?.name ?? l.accountId,
        accountType: acc?.type ?? null,
        debit:  Number(l.debit)  || 0,
        credit: Number(l.credit) || 0,
      };
    }),
    totalDebit,
    totalCredit,
    createdAt: serverTimestamp(),
  };
}

// ─── query helpers ────────────────────────────────────────────────────────────

export async function listJournalEntries(companyId, { fromDate, toDate } = {}) {
  let q;
  if (fromDate && toDate) {
    q = query(
      journalCol(companyId),
      where('date', '>=', Timestamp.fromDate(fromDate)),
      where('date', '<=', Timestamp.fromDate(toDate)),
      orderBy('date', 'desc'),
    );
  } else {
    q = query(journalCol(companyId), orderBy('date', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ entryId: d.id, ...d.data() }));
}

// ─── ledger for a single account ─────────────────────────────────────────────
// Returns rows sorted ascending (oldest first) with a running balance.
export async function getLedgerForAccount(companyId, accountId, { fromDate, toDate } = {}) {
  const entries = await listJournalEntries(companyId, { fromDate, toDate });

  const rows = [];
  for (const entry of entries) {
    for (const line of (entry.lines ?? [])) {
      if (line.accountId === accountId) {
        rows.push({
          entryId:     entry.entryId,
          date:        entry.date,
          description: entry.description,
          sourceType:  entry.sourceType,
          sourceRef:   entry.sourceRef,
          debit:       line.debit,
          credit:      line.credit,
        });
      }
    }
  }

  // Sort ascending for running balance
  rows.sort((a, b) => {
    const ta = a.date?.toDate?.().getTime() ?? 0;
    const tb = b.date?.toDate?.().getTime() ?? 0;
    return ta - tb;
  });

  const account = getAccount(accountId);
  // Debit-normal: balance increases on debit; credit-normal: balance increases on credit.
  const sign = account?.normalBalance === 'credit' ? -1 : 1;
  let running = 0;
  for (const row of rows) {
    running += sign * (row.debit - row.credit);
    row.runningBalance = running;
  }
  return rows;
}

// ─── trial balance ────────────────────────────────────────────────────────────

export async function computeTrialBalance(companyId, { fromDate, toDate } = {}) {
  const entries = await listJournalEntries(companyId, { fromDate, toDate });

  const map = {};
  for (const entry of entries) {
    for (const line of (entry.lines ?? [])) {
      if (!map[line.accountId]) {
        const acc = ACCOUNTS_BY_ID[line.accountId];
        map[line.accountId] = {
          accountId:     line.accountId,
          accountName:   acc?.name ?? line.accountId,
          accountType:   acc?.type ?? 'other',
          normalBalance: acc?.normalBalance ?? 'debit',
          totalDebit:    0,
          totalCredit:   0,
        };
      }
      map[line.accountId].totalDebit  += Number(line.debit)  || 0;
      map[line.accountId].totalCredit += Number(line.credit) || 0;
    }
  }

  const rows = Object.values(map).map((r) => {
    const net = r.totalDebit - r.totalCredit;
    return {
      ...r,
      // Show the net position on its natural side
      balanceDebit:  net > 0 ? net : 0,
      balanceCredit: net < 0 ? -net : 0,
    };
  });

  rows.sort((a, b) => {
    const ao = ACCOUNT_TYPE_ORDER[a.accountType] ?? 9;
    const bo = ACCOUNT_TYPE_ORDER[b.accountType] ?? 9;
    return ao !== bo ? ao - bo : a.accountName.localeCompare(b.accountName);
  });

  const totalDebit  = rows.reduce((s, r) => s + r.balanceDebit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.balanceCredit, 0);
  return { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}
