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
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { listMemberCompanyIds, ROLES } from './memberService';

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
  ownerEmail = '',
  ownerDisplayName = '',
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

  // Creator is always the admin member of their company.
  await setDoc(doc(db, 'companies', docRef.id, 'members', ownerUid), {
    uid:         ownerUid,
    email:       (ownerEmail || email).toLowerCase(),
    displayName: ownerDisplayName,
    role:        ROLES.ADMIN,
    addedBy:     null,
    addedAt:     serverTimestamp(),
  });

  return { companyId: docRef.id };
}

export async function getCompany(companyId) {
  const snap = await getDoc(doc(db, 'companies', companyId));
  return snap.exists() ? { companyId: snap.id, ...snap.data() } : null;
}

export async function listUserCompanies(uid) {
  // Fetch companies from both sources and merge.
  const [rbacIds, ownerSnap] = await Promise.all([
    listMemberCompanyIds(uid),
    getDocs(query(companiesCol, where('ownerUid', '==', uid), orderBy('createdAt', 'asc'))),
  ]);

  const map = new Map();
  ownerSnap.docs.forEach((d) => map.set(d.id, { companyId: d.id, ...d.data() }));

  // Fetch any RBAC-only companies (member of but not owner)
  await Promise.all(
    rbacIds
      .filter((id) => !map.has(id))
      .map(async (id) => {
        const snap = await getDoc(doc(db, 'companies', id));
        if (snap.exists()) map.set(id, { companyId: snap.id, ...snap.data() });
      }),
  );

  return [...map.values()].sort((a, b) => {
    const ta = a.createdAt?.toDate?.()?.getTime() ?? 0;
    const tb = b.createdAt?.toDate?.()?.getTime() ?? 0;
    return ta - tb;
  });
}

// Returns parent companies where the given uid is an admin member.
export async function listAdminParentCompaniesForUser(uid) {
  const all = await listUserCompanies(uid);
  const parents = all.filter((c) => c.type === COMPANY_TYPE.PARENT);

  const withRoles = await Promise.all(
    parents.map(async (c) => {
      const memberSnap = await getDoc(doc(db, 'companies', c.companyId, 'members', uid));
      const role = memberSnap.exists()
        ? memberSnap.data().role
        : c.ownerUid === uid
        ? ROLES.ADMIN
        : null;
      return { ...c, role };
    }),
  );

  return withRoles.filter((c) => c.role === ROLES.ADMIN);
}

export async function updateCompany(companyId, updates) {
  await updateDoc(doc(db, 'companies', companyId), updates);
}

export async function deleteCompany(companyId) {
  // Soft-delete: mark as deleted. Hard deletes need a Cloud Function to
  // cascade into subcollections, which can't be done client-side.
  await updateDoc(doc(db, 'companies', companyId), {
    deleted: true,
    deletedAt: serverTimestamp(),
  });
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
