import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export const BANK_NAMES = ['HDFC', 'SBI', 'ICICI', 'Axis', 'Kotak', 'Yes Bank', 'Other'];
export const ACCOUNT_TYPES = ['Current', 'Savings'];
export const LINKED_GATEWAYS = ['None', 'Razorpay', 'Paytm', 'PhonePe', 'Stripe'];

function bankAccountsCol(companyId) {
  return collection(db, 'companies', companyId, 'bankAccounts');
}
function bankAccountDoc(companyId, accountId) {
  return doc(db, 'companies', companyId, 'bankAccounts', accountId);
}

export async function listBankAccounts(companyId) {
  const q = query(bankAccountsCol(companyId), orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ accountId: d.id, ...d.data() }));
}

export async function createBankAccount(companyId, {
  bankName, holderName, accountLast4, accountType,
  openingBalance, asOfDate, upiId = '', linkedGateway = 'None',
}) {
  const bal = Number(openingBalance) || 0;
  const ref = await addDoc(bankAccountsCol(companyId), {
    bankName,
    holderName: holderName.trim(),
    accountLast4: String(accountLast4).slice(-4),
    accountType,
    openingBalance: bal,
    currentBalance: bal,
    asOfDate,
    upiId: upiId.trim(),
    linkedGateway,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { accountId: ref.id };
}

export async function updateBankAccount(companyId, accountId, updates) {
  const payload = { updatedAt: serverTimestamp() };
  if (updates.bankName        !== undefined) payload.bankName        = updates.bankName;
  if (updates.holderName      !== undefined) payload.holderName      = updates.holderName.trim();
  if (updates.accountLast4    !== undefined) payload.accountLast4    = String(updates.accountLast4).slice(-4);
  if (updates.accountType     !== undefined) payload.accountType     = updates.accountType;
  if (updates.openingBalance  !== undefined) payload.openingBalance  = Number(updates.openingBalance) || 0;
  if (updates.currentBalance  !== undefined) payload.currentBalance  = Number(updates.currentBalance) || 0;
  if (updates.asOfDate        !== undefined) payload.asOfDate        = updates.asOfDate;
  if (updates.upiId           !== undefined) payload.upiId           = updates.upiId.trim();
  if (updates.linkedGateway   !== undefined) payload.linkedGateway   = updates.linkedGateway;
  await updateDoc(bankAccountDoc(companyId, accountId), payload);
}

export async function deleteBankAccount(companyId, accountId) {
  await deleteDoc(bankAccountDoc(companyId, accountId));
}
