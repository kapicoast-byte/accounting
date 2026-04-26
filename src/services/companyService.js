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

export const BUSINESS_TYPES = [
  {
    value: 'F&B',
    label: 'F&B Only',
    icon:  '🍽️',
    desc:  'Menu Master POS — category tabs, item cards with +/− buttons, table orders, order type (Dine In / Takeaway / Delivery), and KOT printing. No manual item typing.',
  },
  {
    value: 'Retail',
    label: 'Retail / Supermarket',
    icon:  '🛒',
    desc:  'Inventory item picker with name search and barcode scan. Quantity and price are editable per line. Customer name is optional.',
  },
  {
    value: 'Manufacturing',
    label: 'Manufacturing',
    icon:  '🏭',
    desc:  'Select finished goods from inventory. Add batch number and quantity per line. Optional link to a production log run.',
  },
  {
    value: 'Services',
    label: 'Services',
    icon:  '💼',
    desc:  'Free text line items with description, quantity, rate, and unit (hours / days / pieces). Hourly billing toggle available. Customer name and contact required.',
  },
  {
    value: 'Mixed',
    label: 'Mixed (F&B + Retail)',
    icon:  '🔀',
    desc:  'Toggle between Menu POS for table orders and inventory picker for retail sales. Both create separate invoices under the same company.',
  },
];

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

export const SALES_ENTRY_MODES = [
  {
    value: 'POS',
    label: 'POS / Live Billing',
    icon:  '🖥️',
    desc:  'Live billing screen — create invoices from the menu or inventory in real time.',
  },
  {
    value: 'Document Upload',
    label: 'Document Upload',
    icon:  '📄',
    desc:  'Upload daily or monthly sales reports (CSV, PDF, or image) — AI extracts and imports the data.',
  },
  {
    value: 'Both',
    label: 'Both',
    icon:  '🔄',
    desc:  'Use live POS for billing and also upload external reports from third-party apps.',
  },
];

export async function updateCompanyProfile(companyId, {
  companyName, address, GSTIN, phone, email, financialYearStart, businessType,
  country, state, taxSystem, currencyCode, customTaxRates, salesEntryMode,
}) {
  const updates = { updatedAt: serverTimestamp() };
  if (companyName        !== undefined) updates.companyName        = companyName.trim();
  if (address            !== undefined) updates.address            = address.trim();
  if (GSTIN              !== undefined) updates.GSTIN              = GSTIN.trim().toUpperCase();
  if (phone              !== undefined) updates.phone              = phone.trim();
  if (email              !== undefined) updates.email              = email.trim().toLowerCase();
  if (financialYearStart !== undefined) updates.financialYearStart = financialYearStart;
  if (businessType       !== undefined) updates.businessType       = businessType;
  if (country            !== undefined) updates.country            = country;
  if (state              !== undefined) updates.state              = state.trim();
  if (taxSystem          !== undefined) updates.taxSystem          = taxSystem;
  if (currencyCode       !== undefined) updates.currencyCode       = currencyCode.trim().toUpperCase();
  if (customTaxRates     !== undefined) updates.customTaxRates     = customTaxRates;
  if (salesEntryMode     !== undefined) updates.salesEntryMode     = salesEntryMode;
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
