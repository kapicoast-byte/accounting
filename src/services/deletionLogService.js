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
  writeBatch,
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

export async function createBulkDeletionLog(companyId, {
  recordType,
  recordIds,
  invoiceNumbers,
  totalAmount,
  deletedBy,
  reason,
  notes,
  records,
}) {
  const preview = invoiceNumbers.slice(0, 3).join(', ') +
    (invoiceNumbers.length > 3 ? ` +${invoiceNumbers.length - 3} more` : '');
  await addDoc(logsCol(companyId), {
    isBulk:        true,
    recordType,
    recordIds,
    invoiceNumbers,
    recordCount:   recordIds.length,
    invoiceNumber: preview,
    amount:        Number(totalAmount) || 0,
    deletedBy,
    reason,
    notes:         notes ?? '',
    originalData:  JSON.stringify(records),
    deletedAt:     serverTimestamp(),
  });
}

export async function bulkDeleteFirestoreRecords(companyId, recordType, recordIds) {
  const colName = recordType === 'sale' ? 'sales' : 'purchases';
  const colRef  = collection(db, 'companies', companyId, colName);
  const batch   = writeBatch(db);
  recordIds.forEach((id) => batch.delete(doc(colRef, id)));
  await batch.commit();
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
