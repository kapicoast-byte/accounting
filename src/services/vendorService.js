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

function vendorsCol(companyId) {
  return collection(db, 'companies', companyId, 'vendors');
}
function vendorDoc(companyId, vendorId) {
  return doc(db, 'companies', companyId, 'vendors', vendorId);
}

export async function listVendors(companyId) {
  const q = query(vendorsCol(companyId), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ vendorId: d.id, ...d.data() }));
}

export async function createVendor(companyId, { name, phone = '', email = '', address = '', GSTIN = '' }) {
  if (!name?.trim()) throw new Error('Vendor name is required.');
  const ref = await addDoc(vendorsCol(companyId), {
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim().toLowerCase(),
    address: address.trim(),
    GSTIN: GSTIN.trim().toUpperCase(),
    createdAt: serverTimestamp(),
  });
  return { vendorId: ref.id, name: name.trim(), phone, email, address, GSTIN };
}

export async function updateVendor(companyId, vendorId, updates) {
  await updateDoc(vendorDoc(companyId, vendorId), updates);
}

export async function getVendor(companyId, vendorId) {
  const snap = await getDoc(vendorDoc(companyId, vendorId));
  return snap.exists() ? { vendorId: snap.id, ...snap.data() } : null;
}
