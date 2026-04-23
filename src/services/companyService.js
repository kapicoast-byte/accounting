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
  deleteDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase';
import { listMemberCompanyIds, ROLES } from './memberService';

export const COMPANY_TYPE = {
  PARENT: 'parent',
  SUBSIDIARY: 'subsidiary',
};

const companiesCol = collection(db, 'companies');

// ─── create ───────────────────────────────────────────────────────────────────

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
    logoUrl: null,
    createdAt: serverTimestamp(),
  });

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

// ─── read ─────────────────────────────────────────────────────────────────────

export async function getCompany(companyId) {
  const snap = await getDoc(doc(db, 'companies', companyId));
  return snap.exists() ? { companyId: snap.id, ...snap.data() } : null;
}

export async function listUserCompanies(uid) {
  const [rbacIds, ownerSnap] = await Promise.all([
    listMemberCompanyIds(uid),
    getDocs(query(companiesCol, where('ownerUid', '==', uid), orderBy('createdAt', 'asc'))),
  ]);

  const map = new Map();
  ownerSnap.docs.forEach((d) => map.set(d.id, { companyId: d.id, ...d.data() }));

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

// ─── update profile ───────────────────────────────────────────────────────────

export async function updateCompanyProfile(companyId, {
  companyName, address, GSTIN, phone, email, financialYearStart,
}) {
  const updates = { updatedAt: serverTimestamp() };
  if (companyName        !== undefined) updates.companyName        = companyName.trim();
  if (address            !== undefined) updates.address            = address.trim();
  if (GSTIN              !== undefined) updates.GSTIN              = GSTIN.trim().toUpperCase();
  if (phone              !== undefined) updates.phone              = phone.trim();
  if (email              !== undefined) updates.email              = email.trim().toLowerCase();
  if (financialYearStart !== undefined) updates.financialYearStart = financialYearStart;
  await updateDoc(doc(db, 'companies', companyId), updates);
}

export async function updateCompany(companyId, updates) {
  await updateDoc(doc(db, 'companies', companyId), updates);
}

// ─── logo ─────────────────────────────────────────────────────────────────────

export async function uploadCompanyLogo(companyId, file) {
  const logoRef = ref(storage, `logos/${companyId}`);
  const snapshot = await uploadBytes(logoRef, file);
  const url = await getDownloadURL(snapshot.ref);
  await updateDoc(doc(db, 'companies', companyId), { logoUrl: url });
  return url;
}

export async function removeCompanyLogo(companyId) {
  try {
    await deleteObject(ref(storage, `logos/${companyId}`));
  } catch { /* not found — nothing to do */ }
  await updateDoc(doc(db, 'companies', companyId), { logoUrl: null });
}

// ─── delete ───────────────────────────────────────────────────────────────────

const SUBCOLLECTIONS = [
  'members', 'inventory', 'sales', 'purchases',
  'expenses', 'journal', 'stockAdjustments', 'meta',
];

async function deleteSubcollection(companyId, name) {
  const snap = await getDocs(collection(db, 'companies', companyId, name));
  if (snap.empty) return;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export async function hardDeleteCompany(companyId) {
  // Block deletion if subsidiaries exist.
  const subSnap = await getDocs(
    query(companiesCol, where('parentCompanyId', '==', companyId)),
  );
  if (!subSnap.empty) {
    throw new Error('Remove all subsidiary companies before deleting this parent company.');
  }

  // Delete every subcollection in parallel.
  await Promise.all(SUBCOLLECTIONS.map((name) => deleteSubcollection(companyId, name)));

  // Delete company document.
  await deleteDoc(doc(db, 'companies', companyId));

  // Best-effort logo removal.
  try {
    await deleteObject(ref(storage, `logos/${companyId}`));
  } catch { /* may not exist */ }
}

// ─── misc ─────────────────────────────────────────────────────────────────────

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
