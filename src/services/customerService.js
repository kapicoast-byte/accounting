import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

function customersCol(companyId) {
  return collection(db, 'companies', companyId, 'customers');
}

function customerDoc(companyId, customerId) {
  return doc(db, 'companies', companyId, 'customers', customerId);
}

export async function listCustomers(companyId) {
  const q = query(customersCol(companyId), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ customerId: d.id, ...d.data() }));
}

export async function createCustomer(companyId, { name, phone = '', email = '', address = '', GSTIN = '' }) {
  if (!name?.trim()) throw new Error('Customer name is required.');
  const ref = await addDoc(customersCol(companyId), {
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim().toLowerCase(),
    address: address.trim(),
    GSTIN: GSTIN.trim().toUpperCase(),
    createdAt: serverTimestamp(),
  });
  return { customerId: ref.id, name: name.trim(), phone, email, address, GSTIN };
}

export async function updateCustomer(companyId, customerId, updates) {
  await updateDoc(customerDoc(companyId, customerId), updates);
}

export async function getCustomer(companyId, customerId) {
  const snap = await getDoc(customerDoc(companyId, customerId));
  return snap.exists() ? { customerId: snap.id, ...snap.data() } : null;
}
