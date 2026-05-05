import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, orderBy, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

function reportsCol(companyId) {
  return collection(db, 'companies', companyId, 'dailySalesReports');
}

function reportDoc(companyId, date) {
  // date is YYYY-MM-DD — used as document ID for O(1) lookup
  return doc(db, 'companies', companyId, 'dailySalesReports', date);
}

export async function getDailyReport(companyId, date) {
  const snap = await getDoc(reportDoc(companyId, date));
  return snap.exists() ? { date: snap.id, ...snap.data() } : null;
}

export async function listDailyReports(companyId, { fromDate, toDate } = {}) {
  let q;
  if (fromDate && toDate) {
    q = query(
      reportsCol(companyId),
      where('date', '>=', fromDate),
      where('date', '<=', toDate),
      orderBy('date', 'desc'),
    );
  } else {
    q = query(reportsCol(companyId), orderBy('date', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ date: d.id, ...d.data() }));
}

export async function saveDailyReport(companyId, date, data, uploadedBy) {
  await setDoc(
    reportDoc(companyId, date),
    {
      ...data,
      date,
      uploadedBy: uploadedBy ?? '',
      uploadedAt: serverTimestamp(),
      status: 'uploaded',
    },
    { merge: false },
  );
  return { date };
}

export async function deleteDailyReport(companyId, date) {
  await deleteDoc(reportDoc(companyId, date));
}

// Returns reports whose invoice number range overlaps [fromNum, toNum], excluding currentDate.
export async function checkInvoiceOverlap(companyId, currentDate, fromNum, toNum) {
  const from = Number(fromNum);
  const to   = Number(toNum);
  if (!from || !to || from > to) return [];
  const snap = await getDocs(reportsCol(companyId));
  return snap.docs
    .filter((d) => d.id !== currentDate)
    .map((d) => ({ date: d.id, ...d.data() }))
    .filter((r) => {
      const rFrom = Number(r.invoiceNumberFrom);
      const rTo   = Number(r.invoiceNumberTo);
      return rFrom && rTo && from <= rTo && to >= rFrom;
    });
}
