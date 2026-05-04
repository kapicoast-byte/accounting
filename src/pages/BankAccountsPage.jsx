import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useRole } from '../hooks/useRole';
import { formatCurrency } from '../utils/format';
import {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  BANK_NAMES,
  ACCOUNT_TYPES,
  LINKED_GATEWAYS,
} from '../services/bankAccountService';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';

function todayStr() { return new Date().toISOString().slice(0, 10); }

const EMPTY_FORM = {
  bankName: 'HDFC',
  holderName: '',
  accountLast4: '',
  accountType: 'Current',
  openingBalance: '',
  asOfDate: todayStr(),
  upiId: '',
  linkedGateway: 'None',
};

// Bank color palette keyed by bank name
const BANK_COLORS = {
  HDFC:       { bg: 'rgba(0,52,153,0.15)',    color: '#0034A0' },
  SBI:        { bg: 'rgba(37,108,65,0.15)',    color: '#256c41' },
  ICICI:      { bg: 'rgba(179,28,36,0.15)',    color: '#b31c24' },
  Axis:       { bg: 'rgba(172,0,58,0.15)',     color: '#ac003a' },
  Kotak:      { bg: 'rgba(237,28,36,0.15)',    color: '#c00' },
  'Yes Bank': { bg: 'rgba(0,147,68,0.15)',     color: '#009344' },
  Other:      { bg: 'rgba(99,102,241,0.15)',   color: '#6366f1' },
};

function BankAvatar({ bankName }) {
  const c = BANK_COLORS[bankName] ?? BANK_COLORS.Other;
  const initials = bankName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
      background: c.bg, color: c.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 800, letterSpacing: '-0.5px',
    }}>
      {initials}
    </div>
  );
}

function TypeBadge({ type }) {
  const color = type === 'Current' ? 'var(--info)' : 'var(--pos)';
  const bg    = type === 'Current' ? 'var(--info-soft)' : 'var(--pos-soft)';
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: bg, color,
    }}>
      {type}
    </span>
  );
}

function GatewayBadge({ gateway }) {
  if (!gateway || gateway === 'None') return null;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: 'var(--accent-soft)', color: 'var(--accent)',
    }}>
      {gateway}
    </span>
  );
}

function AccountCard({ account, isAdmin, onEdit, onDelete }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <BankAvatar bankName={account.bankName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: 'var(--fg)', lineHeight: 1.2 }}>
            {account.holderName}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--fg-3)', fontFamily: 'monospace' }}>
            {account.bankName} ···{account.accountLast4}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <TypeBadge type={account.accountType} />
          <GatewayBadge gateway={account.linkedGateway} />
        </div>
      </div>

      {/* Balance */}
      <div style={{
        background: 'var(--bg)', borderRadius: 8, padding: '12px 16px',
        display: 'flex', alignItems: 'baseline', gap: 6,
      }}>
        <span style={{ fontSize: 11, color: 'var(--fg-4)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Balance</span>
        <span style={{
          fontSize: 24, fontWeight: 700, color: 'var(--fg)',
          fontFamily: '"JetBrains Mono", "Fira Mono", "Courier New", monospace',
          letterSpacing: '-0.5px', marginLeft: 'auto',
        }}>
          {formatCurrency(account.currentBalance ?? account.openingBalance ?? 0)}
        </span>
      </div>

      {/* UPI row */}
      {account.upiId && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-4)' }}>
          UPI: <span style={{ color: 'var(--fg-3)', fontFamily: 'monospace' }}>{account.upiId}</span>
        </p>
      )}

      {/* Action buttons */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => onEdit(account)}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border-2)',
              background: 'var(--bg-2)', color: 'var(--fg-2)', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(account)}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--neg-soft)',
              background: 'transparent', color: 'var(--neg)', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--neg-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function BankAccountForm({ form, onChange, errors }) {
  function field(name, value) {
    return { name, value, onChange };
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Bank name */}
      <div className="flex flex-col gap-1">
        <label>Bank name</label>
        <select {...field('bankName', form.bankName)}>
          {BANK_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        {errors.bankName && <p style={{ margin: 0, fontSize: 12, color: 'var(--neg)' }}>{errors.bankName}</p>}
      </div>

      {/* Account type */}
      <div className="flex flex-col gap-1">
        <label>Account type</label>
        <select {...field('accountType', form.accountType)}>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Holder name */}
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label>Account holder name</label>
        <input type="text" name="holderName" value={form.holderName} onChange={onChange}
          placeholder="e.g. Acme Pvt Ltd" />
        {errors.holderName && <p style={{ margin: 0, fontSize: 12, color: 'var(--neg)' }}>{errors.holderName}</p>}
      </div>

      {/* Last 4 digits */}
      <div className="flex flex-col gap-1">
        <label>Account number (last 4 digits)</label>
        <input type="text" name="accountLast4" value={form.accountLast4} onChange={onChange}
          maxLength={4} placeholder="e.g. 1234" inputMode="numeric" />
        {errors.accountLast4 && <p style={{ margin: 0, fontSize: 12, color: 'var(--neg)' }}>{errors.accountLast4}</p>}
      </div>

      {/* Opening balance */}
      <div className="flex flex-col gap-1">
        <label>Opening balance</label>
        <input type="number" name="openingBalance" value={form.openingBalance} onChange={onChange}
          min="0" step="0.01" placeholder="0.00" />
        {errors.openingBalance && <p style={{ margin: 0, fontSize: 12, color: 'var(--neg)' }}>{errors.openingBalance}</p>}
      </div>

      {/* As of date */}
      <div className="flex flex-col gap-1">
        <label>As of date</label>
        <input type="date" name="asOfDate" value={form.asOfDate} onChange={onChange} />
        {errors.asOfDate && <p style={{ margin: 0, fontSize: 12, color: 'var(--neg)' }}>{errors.asOfDate}</p>}
      </div>

      {/* UPI ID */}
      <div className="flex flex-col gap-1">
        <label>UPI ID (optional)</label>
        <input type="text" name="upiId" value={form.upiId} onChange={onChange}
          placeholder="e.g. business@hdfc" />
      </div>

      {/* Payment gateway */}
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label>Linked payment gateway</label>
        <select {...field('linkedGateway', form.linkedGateway)}>
          {LINKED_GATEWAYS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function BankAccountsPage() {
  const { activeCompanyId } = useApp();
  const { isAdmin } = useRole();

  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const [deleteTarget,   setDeleteTarget]   = useState(null);
  const [deleteConfirm,  setDeleteConfirm]  = useState(false);
  const [deleting,       setDeleting]       = useState(false);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listBankAccounts(activeCompanyId);
      setAccounts(data);
    } catch (err) {
      setError(err.message ?? 'Failed to load bank accounts.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, asOfDate: todayStr() });
    setFormErrors({});
    setServerError('');
    setModalOpen(true);
  }

  function openEdit(account) {
    setEditTarget(account);
    setForm({
      bankName:       account.bankName       ?? 'HDFC',
      holderName:     account.holderName     ?? '',
      accountLast4:   account.accountLast4   ?? '',
      accountType:    account.accountType    ?? 'Current',
      openingBalance: String(account.openingBalance ?? ''),
      asOfDate:       account.asOfDate       ?? todayStr(),
      upiId:          account.upiId          ?? '',
      linkedGateway:  account.linkedGateway  ?? 'None',
    });
    setFormErrors({});
    setServerError('');
    setModalOpen(true);
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (formErrors[name]) setFormErrors((p) => ({ ...p, [name]: '' }));
  }

  function validate() {
    const err = {};
    if (!form.holderName.trim())   err.holderName   = 'Account holder name is required.';
    if (!/^\d{4}$/.test(form.accountLast4)) err.accountLast4 = 'Enter exactly 4 digits.';
    if (!form.asOfDate)            err.asOfDate     = 'Date is required.';
    return err;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const v = validate();
    if (Object.keys(v).length) { setFormErrors(v); return; }
    setSubmitting(true);
    setServerError('');
    try {
      if (editTarget) {
        await updateBankAccount(activeCompanyId, editTarget.accountId, {
          ...form,
          openingBalance: Number(form.openingBalance) || 0,
          currentBalance: Number(form.openingBalance) || 0,
        });
        setAccounts((prev) => prev.map((a) =>
          a.accountId === editTarget.accountId
            ? { ...a, ...form, openingBalance: Number(form.openingBalance) || 0, currentBalance: Number(form.openingBalance) || 0 }
            : a,
        ));
      } else {
        const { accountId } = await createBankAccount(activeCompanyId, {
          ...form,
          openingBalance: Number(form.openingBalance) || 0,
        });
        setAccounts((prev) => [...prev, {
          accountId,
          ...form,
          openingBalance: Number(form.openingBalance) || 0,
          currentBalance: Number(form.openingBalance) || 0,
        }]);
      }
      setModalOpen(false);
    } catch (err) {
      setServerError(err.message ?? 'Failed to save bank account.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteBankAccount(activeCompanyId, deleteTarget.accountId);
      setAccounts((prev) => prev.filter((a) => a.accountId !== deleteTarget.accountId));
      setDeleteTarget(null);
      setDeleteConfirm(false);
    } catch (err) {
      setServerError(err.message ?? 'Failed to delete.');
    } finally {
      setDeleting(false);
    }
  }

  const totalBalance = accounts.reduce((s, a) => s + (Number(a.currentBalance) || Number(a.openingBalance) || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>Bank Accounts</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-3)' }}>Manage your company's bank accounts for reconciliation.</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            style={{
              borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
              background: 'var(--info)', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            + Add Bank Account
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: 'var(--neg)' }}>
          {error}
        </div>
      )}

      {/* Summary card */}
      {accounts.length > 0 && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-4)' }}>
              Total Bank Balance
            </p>
            <p style={{
              margin: '6px 0 0', fontSize: 32, fontWeight: 700,
              fontFamily: '"JetBrains Mono", "Fira Mono", monospace',
              color: totalBalance >= 0 ? 'var(--pos)' : 'var(--neg)',
              letterSpacing: '-1px',
            }}>
              {formatCurrency(totalBalance)}
            </p>
          </div>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'var(--info-soft)', color: 'var(--info)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
        </div>
      )}

      {/* Accounts grid */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><LoadingSpinner /></div>
      ) : accounts.length === 0 ? (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: 'var(--info-soft)', color: 'var(--info)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <svg width={26} height={26} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M2 10h20" />
            </svg>
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>No bank accounts yet</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-3)' }}>
            Add your first bank account to start tracking balances.
          </p>
          {isAdmin && (
            <button
              type="button"
              onClick={openAdd}
              style={{
                marginTop: 16, borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600,
                background: 'var(--info)', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              + Add Bank Account
            </button>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {accounts.map((a) => (
            <AccountCard
              key={a.accountId}
              account={a}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={(acc) => { setDeleteTarget(acc); setDeleteConfirm(true); }}
            />
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={submitting ? undefined : () => setModalOpen(false)}
        title={editTarget ? 'Edit bank account' : 'Add bank account'}
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} disabled={submitting}
              style={{
                borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 500,
                border: '1px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--fg-2)',
                cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.5 : 1,
              }}>
              Cancel
            </button>
            <button type="submit" form="bank-account-form" disabled={submitting}
              style={{
                borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600,
                background: 'var(--info)', color: '#fff', border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {submitting && <LoadingSpinner size="sm" />}
              {editTarget ? 'Save changes' : 'Add account'}
            </button>
          </>
        }
      >
        {serverError && (
          <div style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--neg)', marginBottom: 12 }}>
            {serverError}
          </div>
        )}
        <form id="bank-account-form" onSubmit={handleSubmit} noValidate>
          <BankAccountForm form={form} onChange={handleFormChange} errors={formErrors} />
        </form>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={deleteConfirm}
        onClose={deleting ? undefined : () => { setDeleteConfirm(false); setDeleteTarget(null); }}
        title="Delete bank account"
        footer={
          <>
            <button type="button" onClick={() => { setDeleteConfirm(false); setDeleteTarget(null); }} disabled={deleting}
              style={{
                borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 500,
                border: '1px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--fg-2)',
                cursor: deleting ? 'not-allowed' : 'pointer',
              }}>
              Cancel
            </button>
            <button type="button" onClick={handleDelete} disabled={deleting}
              style={{
                borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600,
                background: 'var(--neg)', color: '#fff', border: 'none',
                cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {deleting && <LoadingSpinner size="sm" />}
              Delete
            </button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-2)' }}>
          Are you sure you want to delete{' '}
          <strong style={{ color: 'var(--fg)' }}>
            {deleteTarget?.bankName} ···{deleteTarget?.accountLast4}
          </strong>?{' '}
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
