import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { logoutUser } from '../services/authService';
import { useRole } from '../hooks/useRole';
import { ROLE_LABELS } from '../services/memberService';
import { BUSINESS_TYPES } from '../services/companyService';
import { getThisMonthDeletionCount } from '../services/deletionLogService';
import CompanySwitcher from './CompanySwitcher';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/inventory',  label: 'Inventory'  },
  { to: '/sales',      label: 'Sales'      },
  { to: '/purchases',  label: 'Purchases'  },
  { to: '/expenses',   label: 'Expenses'   },
  { to: '/payables',   label: 'Payables'   },
  { to: '/gst',        label: 'GST'        },
  { to: '/reports',    label: 'Reports'    },
];

const ACCOUNTS_LINKS = [
  { to: '/accounts',       label: 'Chart of Accounts' },
  { to: '/ledger',         label: 'Account Ledger'    },
  { to: '/journal',        label: 'Journal Entries'   },
  { to: '/trial-balance',  label: 'Trial Balance'     },
];

const ACCOUNTS_PREFIXES = ACCOUNTS_LINKS.map((l) => l.to);

const FNB_LINKS = [
  { to: '/fnb/menu-master', label: 'Menu Master'      },
  { to: '/wastage',         label: 'Wastage Tracking'  },
  { to: '/production',      label: 'Production Log'    },
];

const FNB_PREFIXES = ['/fnb', '/wastage', '/production'];

// ─── Shared nav-link style ─────────────────────────────────────────────────────

function navLinkStyle(isActive) {
  return {
    display: 'flex',
    alignItems: 'center',
    height: '60px',
    padding: '0 12px',
    fontSize: '13.5px',
    fontWeight: isActive ? 500 : 400,
    color: isActive ? 'var(--pos)' : 'var(--fg-2)',
    borderBottom: isActive ? '2px solid var(--pos)' : '2px solid transparent',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: isActive ? '2px solid var(--pos)' : '2px solid transparent',
    outline: 'none',
  };
}

// ─── Dropdown popup styles ─────────────────────────────────────────────────────

const dropdownStyle = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  zIndex: 50,
  minWidth: '192px',
  borderRadius: '10px',
  border: '1px solid var(--border)',
  background: 'var(--card-2)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  padding: '6px 0',
  overflow: 'hidden',
};

const dropdownItemStyle = (isActive) => ({
  display: 'block',
  width: '100%',
  padding: '8px 16px',
  fontSize: '13.5px',
  textAlign: 'left',
  textDecoration: 'none',
  color: isActive ? 'var(--pos)' : 'var(--fg-2)',
  background: isActive ? 'var(--pos-soft)' : 'transparent',
  cursor: 'pointer',
  border: 'none',
  transition: 'background 0.12s, color 0.12s',
});

function DropdownItem({ to, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      style={({ isActive }) => dropdownItemStyle(isActive)}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = e.currentTarget.classList.contains('active') ? 'var(--pos-soft)' : 'transparent'; }}
    >
      {label}
    </NavLink>
  );
}

function DropdownSectionLabel({ children }) {
  return (
    <p style={{ padding: '8px 16px 4px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
      {children}
    </p>
  );
}

function DropdownDivider() {
  return <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />;
}

// ─── FnB dropdown ─────────────────────────────────────────────────────────────

function FnbDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const isActive = FNB_PREFIXES.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...navLinkStyle(isActive), gap: '4px' }}
      >
        F&amp;B Ops
        <svg style={{ width: 12, height: 12, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : '' }}
          viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div style={dropdownStyle}>
          <DropdownSectionLabel>F&amp;B Operations</DropdownSectionLabel>
          {FNB_LINKS.map((link) => (
            <DropdownItem key={link.to} to={link.to} label={link.label} onClick={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Accounts dropdown ────────────────────────────────────────────────────────

function AccountsDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const isActive = ACCOUNTS_PREFIXES.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...navLinkStyle(isActive), gap: '4px' }}
      >
        Accounts
        <svg style={{ width: 12, height: 12, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : '' }}
          viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div style={dropdownStyle}>
          {ACCOUNTS_LINKS.map((link) => (
            <DropdownItem key={link.to} to={link.to} label={link.label} onClick={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Admin dropdown ───────────────────────────────────────────────────────────

function AdminDropdown({ companyId }) {
  const [open, setOpen] = useState(false);
  const [monthCount, setMonthCount] = useState(null);
  const ref = useRef(null);
  const location = useLocation();
  const isActive = location.pathname.startsWith('/admin');

  useEffect(() => {
    if (!companyId) return;
    getThisMonthDeletionCount(companyId).then(setMonthCount).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...navLinkStyle(isActive), gap: '4px' }}
      >
        Admin
        {monthCount > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: 16, minWidth: 16, borderRadius: 8,
            background: 'var(--neg)', color: '#fff',
            fontSize: 10, fontWeight: 700, padding: '0 4px',
          }}>
            {monthCount}
          </span>
        )}
        <svg style={{ width: 12, height: 12, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : '' }}
          viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div style={{ ...dropdownStyle, left: 'auto', right: 0 }}>
          <DropdownSectionLabel>Admin Tools</DropdownSectionLabel>
          <NavLink
            to="/admin/deletion-logs"
            onClick={() => setOpen(false)}
            style={({ isActive: a }) => ({ ...dropdownItemStyle(a), display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}
          >
            <span>Deletion Audit Trail</span>
            {monthCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 16, minWidth: 16, borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 10, fontWeight: 700, padding: '0 4px' }}>
                {monthCount}
              </span>
            )}
          </NavLink>
        </div>
      )}
    </div>
  );
}

// ─── Main Navbar ──────────────────────────────────────────────────────────────

export default function Navbar() {
  const { user, activeCompany, isConsolidated, isParentCompany, toggleConsolidated, salesEntryMode, activeCompanyId } = useApp();
  const { role, isAdmin } = useRole();
  const businessType = activeCompany?.businessType;
  const navigate = useNavigate();

  async function handleLogout() {
    await logoutUser();
    navigate('/login', { replace: true });
  }

  const btLabel = businessType
    ? (BUSINESS_TYPES.find((b) => b.value === businessType)?.label ?? businessType)
    : null;

  return (
    <header
      className="print:hidden"
      style={{ height: 60, background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'stretch', padding: '0 28px', position: 'sticky', top: 0, zIndex: 40 }}
    >
      {/* Left: logo + nav */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1, minWidth: 0 }}>
        <Link
          to="/dashboard"
          style={{ display: 'flex', alignItems: 'center', fontSize: 17, fontWeight: 700, color: 'var(--fg)', textDecoration: 'none', paddingRight: 24, flexShrink: 0 }}
        >
          SmartBooks
        </Link>

        <nav style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              style={({ isActive }) => navLinkStyle(isActive)}
            >
              {link.label}
            </NavLink>
          ))}

          {(salesEntryMode === 'Document Upload' || salesEntryMode === 'Both') && (
            <NavLink
              to="/sales/import"
              style={({ isActive }) => navLinkStyle(isActive)}
            >
              Import Sales
            </NavLink>
          )}

          <AccountsDropdown />
          <FnbDropdown />
          {isAdmin && <AdminDropdown companyId={activeCompanyId} />}
        </nav>
      </div>

      {/* Right: company switcher + controls + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <CompanySwitcher />

        {isParentCompany && (
          <button
            type="button"
            onClick={toggleConsolidated}
            title={isConsolidated ? 'Switch to Single View' : 'Switch to Consolidated View'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              border: `1px solid ${isConsolidated ? 'var(--info)' : 'var(--border)'}`,
              background: isConsolidated ? 'var(--info-soft)' : 'transparent',
              color: isConsolidated ? 'var(--info)' : 'var(--fg-3)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 13, height: 13 }}>
              <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
            </svg>
            <span className="hidden sm:inline">{isConsolidated ? 'Consolidated' : 'Single View'}</span>
          </button>
        )}

        {btLabel && (
          <span
            className="hidden sm:inline-flex"
            style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: 'var(--card-2)', color: 'var(--fg-3)', border: '1px solid var(--border)' }}
          >
            {btLabel}
          </span>
        )}

        {(role === 'admin' || role === 'manager') && (
          <NavLink
            to="/members"
            title="Team Members"
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none',
              color: isActive ? 'var(--pos)' : 'var(--fg-3)',
              transition: 'color 0.15s',
            })}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 15, height: 15 }}>
              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
            </svg>
            <span className="hidden lg:inline">Members</span>
          </NavLink>
        )}

        <div className="hidden flex-col items-end sm:flex" style={{ lineHeight: 1.3 }}>
          <span style={{ fontSize: 13, color: 'var(--fg-2)', fontWeight: 500 }}>{user?.displayName}</span>
          {role && (
            <span style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'capitalize' }}>
              {ROLE_LABELS[role] ?? role}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-3)', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--fg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-3)'; }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
