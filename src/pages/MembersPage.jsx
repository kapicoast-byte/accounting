import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  listMembers,
  inviteMemberByEmail,
  updateMemberRole,
  removeMember,
  ROLES,
  ROLE_LABELS,
  ROLE_ORDER,
} from '../services/memberService';
import { useRole } from '../hooks/useRole';

const ROLE_OPTIONS = [
  { value: ROLES.MANAGER, label: 'Manager — view & edit, no member management' },
  { value: ROLES.STAFF,   label: 'Staff — read-only + add sales only' },
];

const ROLE_COLORS = {
  admin:   'bg-blue-100 text-blue-700',
  manager: 'bg-green-100 text-green-700',
  staff:   'bg-gray-100 text-gray-600',
};

function Initials({ name, email }) {
  const src = (name || email || '?').trim();
  const letters = src.includes(' ')
    ? src.split(' ').slice(0, 2).map((w) => w[0]).join('')
    : src.slice(0, 2);
  return (
    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 uppercase">
      {letters}
    </div>
  );
}

function MemberRow({ member, currentUid, onRoleChange, onRemove, canManage }) {
  const [saving, setSaving] = useState(false);
  const isSelf = member.uid === currentUid;

  async function handleRoleChange(e) {
    setSaving(true);
    try { await onRoleChange(member.uid, e.target.value); }
    finally { setSaving(false); }
  }

  async function handleRemove() {
    if (!confirm(`Remove ${member.displayName || member.email} from this company?`)) return;
    await onRemove(member.uid);
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <Initials name={member.displayName} email={member.email} />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {member.displayName || '—'}
              {isSelf && <span className="ml-2 text-xs text-gray-400">(you)</span>}
            </p>
            <p className="text-xs text-gray-500">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        {canManage && !isSelf ? (
          <select
            value={member.role}
            onChange={handleRoleChange}
            disabled={saving}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:border-blue-400 disabled:opacity-50"
          >
            {Object.entries(ROLES).map(([, val]) => (
              <option key={val} value={val}>{ROLE_LABELS[val]}</option>
            ))}
          </select>
        ) : (
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-600'}`}>
            {ROLE_LABELS[member.role] ?? member.role}
          </span>
        )}
      </td>
      <td className="px-5 py-3 text-xs text-gray-500">
        {member.addedAt?.toDate
          ? member.addedAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—'}
      </td>
      <td className="px-5 py-3 text-right">
        {canManage && !isSelf && (
          <button
            type="button"
            onClick={handleRemove}
            className="rounded-md px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 transition"
          >
            Remove
          </button>
        )}
      </td>
    </tr>
  );
}

function InviteForm({ onInvite }) {
  const [email,    setEmail]    = useState('');
  const [role,     setRole]     = useState(ROLES.STAFF);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await onInvite(email.trim(), role);
      setSuccess(`${result.displayName || email} added as ${ROLE_LABELS[role]}.`);
      setEmail('');
      setRole(ROLES.STAFF);
    } catch (err) {
      setError(err.message ?? 'Failed to invite member.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-4 font-semibold text-gray-800">Invite a member</h3>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-52">
          <label className="mb-1 block text-xs font-medium text-gray-600">Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); setSuccess(''); }}
            placeholder="colleague@example.com"
            required
            disabled={busy}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none disabled:opacity-50"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.value.charAt(0).toUpperCase() + o.value.slice(1)}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {busy ? 'Inviting…' : 'Invite'}
        </button>
      </div>

      {/* Role descriptions */}
      <div className="mt-3 flex flex-wrap gap-3">
        {ROLE_OPTIONS.map((o) => (
          <p key={o.value} className="text-xs text-gray-500">
            <span className={`inline-flex rounded-full px-2 py-0.5 font-medium mr-1 ${ROLE_COLORS[o.value]}`}>
              {ROLE_LABELS[o.value]}
            </span>
            {o.label.split('— ')[1]}
          </p>
        ))}
      </div>

      {error   && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 text-sm text-green-600">✓ {success}</p>}
    </form>
  );
}

export default function MembersPage() {
  const { activeCompanyId, activeCompany, user } = useApp();
  const { isAdmin } = useRole();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const loadMembers = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const list = await listMembers(activeCompanyId);
      setMembers(list.sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)));
    } catch (err) {
      setError(err.message ?? 'Failed to load members.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  async function handleInvite(email, role) {
    const result = await inviteMemberByEmail(activeCompanyId, {
      email,
      role,
      addedBy: user?.uid ?? null,
    });
    await loadMembers();
    return result;
  }

  async function handleRoleChange(uid, newRole) {
    await updateMemberRole(activeCompanyId, uid, newRole);
    setMembers((prev) =>
      prev.map((m) => (m.uid === uid ? { ...m, role: newRole } : m)),
    );
  }

  async function handleRemove(uid) {
    await removeMember(activeCompanyId, uid);
    setMembers((prev) => prev.filter((m) => m.uid !== uid));
  }

  const adminCount = members.filter((m) => m.role === ROLES.ADMIN).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
        <p className="text-sm text-gray-500">
          {activeCompany?.companyName} · {members.length} member{members.length !== 1 ? 's' : ''}
        </p>
      </div>

      {isAdmin && <InviteForm onInvite={handleInvite} />}

      {/* Role legend */}
      {!isAdmin && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 text-sm text-gray-600">
          You can see who has access to this company. Only admins can manage members.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-5 py-3 text-left font-semibold text-gray-600">Member</th>
              <th className="px-5 py-3 text-left font-semibold text-gray-600">Role</th>
              <th className="px-5 py-3 text-left font-semibold text-gray-600">Added</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-gray-400">Loading…</td>
              </tr>
            )}
            {!loading && members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-gray-400">No members yet.</td>
              </tr>
            )}
            {members.map((m) => (
              <MemberRow
                key={m.uid}
                member={m}
                currentUid={user?.uid}
                canManage={isAdmin && !(m.role === ROLES.ADMIN && adminCount <= 1)}
                onRoleChange={handleRoleChange}
                onRemove={handleRemove}
              />
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && adminCount <= 1 && members.length > 0 && (
        <p className="text-xs text-gray-400">
          You are the only admin. Promote another member to admin before you can change your own role or be removed.
        </p>
      )}
    </div>
  );
}
