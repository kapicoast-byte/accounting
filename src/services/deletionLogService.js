import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export const DELETION_REASONS = [
  'Duplicate Entry',
  'Wrong Data Entry',
  'Test Entry',
  'Customer Cancellation',
  'Vendor Cancellation',
  'Other',
];

function logsCol(companyId) {
  return collection(db, 'companies', companyId, 'deletionLogs');
}

export async function createDeletionLog(companyId, {
  recordType,
  recordId,
  invoiceNumber,
  amount,
  date,
  deletedBy,
  reason,
  notes,
  originalData,
}) {
  await addDoc(logsCol(companyId), {
    recordType,
    recordId,
    invoiceNumber,
    amount:       Number(amount) || 0,
    date,
    deletedBy,
    reason,
    notes:        notes ?? '',
    originalData: JSON.stringify(originalData),
    deletedAt:    serverTimestamp(),
  });
}

export async function deleteFirestoreRecord(companyId, recordType, recordId) {
  const colName  = recordType === 'sale' ? 'sales' : 'purchases';
  const colRef   = collection(db, 'companies', companyId, colName);
  await deleteDoc(doc(colRef, recordId));
}

export async function listDeletionLogs(companyId) {
  const q    = query(logsCol(companyId), orderBy('deletedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ logId: d.id, ...d.data() }));
}

export async function getThisMonthDeletionCount(companyId) {
  if (!companyId) return 0;
  const now          = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const q = query(
    logsCol(companyId),
    where('deletedAt', '>=', Timestamp.fromDate(startOfMonth)),
  );
  const snap = await getDocs(q);
  return snap.size;
}
