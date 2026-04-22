import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export const COMPANY_TYPE = {
  PARENT: 'parent',
  SUBSIDIARY: 'subsidiary',
};

const companiesCol = collection(db, 'companies');

export async function createCompany({
  companyName,
  type,
  parentCompanyId = null,
  ownerUid,
  address = '',
  GSTIN = '',
  phone = '',
  email = '',
  financialYearStart = '04-01',
}) {
  if (type === COMPANY_TYPE.SUBSIDIARY && !parentCompanyId) {
    throw new Error('Subsidiary company requires a parentCompanyId.');
  }
  if (type === COMPANY_TYPE.PARENT && parentCompanyId) {
    throw new Error('Parent company cannot have a parentCompanyId.');
  }

  const docRef = await addDoc(companiesCol, {
    companyName: companyName.trim(),
    type,
    parentCompanyId,
    ownerUid,
    address: address.trim(),
    GSTIN: GSTIN.trim().toUpperCase(),
    phone: phone.trim(),
    email: email.trim().toLowerCase(),
    financialYearStart,
    createdAt: serverTimestamp(),
  });

  return { companyId: docRef.id };
}

export async function getCompany(companyId) {
  const snap = await getDoc(doc(db, 'companies', companyId));
  return snap.exists() ? { companyId: snap.id, ...snap.data() } : null;
}

export async function listUserCompanies(uid) {
  const q = query(
    companiesCol,
    where('ownerUid', '==', uid),
    orderBy('createdAt', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ companyId: d.id, ...d.data() }));
}

export async function listParentCompaniesForUser(uid) {
  const q = query(
    companiesCol,
    where('ownerUid', '==', uid),
    where('type', '==', COMPANY_TYPE.PARENT),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ companyId: d.id, ...d.data() }));
}

export async function updateCompany(companyId, updates) {
  await updateDoc(doc(db, 'companies', companyId), updates);
}

export async function setActiveCompanyForUser(uid, companyId) {
  await updateDoc(doc(db, 'users', uid), { activeCompanyId: companyId });
}

export function companyDoc(companyId) {
  return doc(db, 'companies', companyId);
}

export function companySubcollection(companyId, name) {
  return collection(db, 'companies', companyId, name);
}

export function companySubdoc(companyId, name, docId) {
  return doc(db, 'companies', companyId, name, docId);
}
