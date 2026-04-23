import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export const ROLES = {
  ADMIN:   'admin',
  MANAGER: 'manager',
  STAFF:   'staff',
};

export const ROLE_LABELS = {
  admin:   'Admin',
  manager: 'Manager',
  staff:   'Staff',
};

export const ROLE_ORDER = { admin: 0, manager: 1, staff: 2 };

// ─── read ─────────────────────────────────────────────────────────────────────

export async function getMember(companyId, uid) {
  const snap = await getDoc(doc(db, 'companies', companyId, 'members', uid));
  return snap.exists() ? snap.data() : null;
}

export async function getMemberRole(companyId, uid) {
  const memberSnap = await getDoc(doc(db, 'companies', companyId, 'members', uid));
  if (memberSnap.exists()) return memberSnap.data().role;

  // Legacy fallback: company created before RBAC — ownerUid == uid means admin.
  const companySnap = await getDoc(doc(db, 'companies', companyId));
  if (companySnap.exists() && companySnap.data().ownerUid === uid) return ROLES.ADMIN;

  return null;
}

export async function listMembers(companyId) {
  const q = query(
    collection(db, 'companies', companyId, 'members'),
    orderBy('addedAt', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

// Returns all companyIds where this uid has a member record.
// Requires a Firestore collection-group index on members.uid — Firestore will
// print a console link to create it on first use.
export async function listMemberCompanyIds(uid) {
  try {
    const q = query(collectionGroup(db, 'members'), where('uid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.ref.parent.parent.id);
  } catch {
    return [];
  }
}

// ─── write ────────────────────────────────────────────────────────────────────

export async function addMember(companyId, { uid, email, displayName = '', role, addedBy = null }) {
  await setDoc(doc(db, 'companies', companyId, 'members', uid), {
    uid,
    email:       email.toLowerCase(),
    displayName: displayName ?? '',
    role,
    addedBy,
    addedAt: serverTimestamp(),
  });
}

export async function updateMemberRole(companyId, uid, role) {
  await setDoc(doc(db, 'companies', companyId, 'members', uid), { role }, { merge: true });
}

export async function removeMember(companyId, uid) {
  await deleteDoc(doc(db, 'companies', companyId, 'members', uid));
}

// Looks up a registered user by email then adds them as a member.
export async function inviteMemberByEmail(companyId, { email, role, addedBy }) {
  const userQuery = query(
    collection(db, 'users'),
    where('email', '==', email.toLowerCase()),
  );
  const snap = await getDocs(userQuery);
  if (snap.empty) {
    throw new Error('No account found with this email. The person must register first.');
  }
  const userData = snap.docs[0].data();

  const existing = await getMember(companyId, userData.uid);
  if (existing) throw new Error('This user is already a member of this company.');

  await addMember(companyId, {
    uid:         userData.uid,
    email:       userData.email,
    displayName: userData.displayName ?? '',
    role,
    addedBy,
  });

  return { uid: userData.uid, displayName: userData.displayName };
}
