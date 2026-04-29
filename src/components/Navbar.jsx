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
  { to: '/sales',     label: 'Sales'     },
  { to: '/purchases', label: 'Purchases' },
  { to: '/expenses',  label: 'Expenses'  },
  { to: '/inventory', label: 'Inventory' },
  { to: '/gst',       label: 'GST'       },
  { to: '/reports',   label: 'Reports'   },
];

const ACCOUNTS_LINKS = [
  { to: '/payables',      label: 'Payables'          },
  { to: '/accounts',      label: 'Chart of Accounts' },
  { to: '/ledger',        label: 'Account Ledger'    },
  { to: '/journal',       label: 'Journal Entries'   },
  { to: '/trial-balance', label: 'Trial Balance'     },
];
const ACCOUNTS_PREFIXES = ACCOUNTS_LINKS.map((l) => l.to);

const FNB_LINKS = [
  { to: '/fnb/menu-master', label: 'Menu Master'     },
  { to: '/wastage',         label: 'Wastage Tracking' },
  { to: '/production',      label: 'Production Log'   },
];
const FNB_PREFIXES = ['/fnb', '/wastage', '/production'];

// ─── Nav link style ───────────────────────────────────────────────────────────

function navLinkStyle(isActive) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    fontSize: '13.5px',
    fontWeight: isActive ? 500 : 400,
    color: isActive ? 'var(--fg)' : 'var(--fg-2)',
    background: isActive ? 'var(--hover)' : 'transparent',
    borderRadius: '6px',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'background 0.12s, color 0.12s',
    cursor: 'pointer',
    border: 'none',
    outline: 'none',
  };
}

// ─── Dropdown popup ───────────────────────────────────────────────────────────

const popupStyle = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  zIndex: 50,
  minWidth: 192,
  borderRadius: 10,
  border: '1px solid var(--border-2)',
  background: 'var(--card-2)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  padding: '6px 0',
  overflow: 'hidden',
};

function PopupItem({ to, label, onClick, extra }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        fontSize: 13.5,
        color: isActive ? 'var(--fg)' : 'var(--fg-2)',
        background: isActive ? 'var(--hover)' : 'transparent',
        textDecoration: 'none',
        transition: 'background 0.1s',
        cursor: 'pointer',
      })}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
      onMouseLeave={(e) => {
        // Re-read isActive from the element
        const a = e.currentTarget.getAttribute('aria-current');
        e.currentTarget.style.background = a === 'page' ? 'var(--hover)' : 'transparent';
      }}
    >
      <span>{label}</span>
      {extra}
    </NavLink>
  );
}

function PopupSectionLabel({ children }) {
  return (
    <p style={{ padding: '6px 14px 2px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)', margin: 0 }}>
      {children}
    </p>
  );
}

// ─── Dropdown wrappers ────────────────────────────────────────────────────────

function NavDropdown({ label, prefixes, links, sectionLabel, alignRight }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const isActive = prefixes.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={navLinkStyle(isActive)}
      >
        {label}
        <svg style={{ width: 11, height: 11, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : '' }}
          viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
        {isActive && (
          <span style={{
            position: 'absolute', bottom: 0, left: 10, right: 10,
            height: 2, borderRadius: 999, background: 'var(--pos)',
          }} />
        )}
      </button>
      {open && (
        <div style={{ ...popupStyle, ...(alignRight ? { left: 'auto', right: 0 } : {}) }}>
          {sectionLabel && <PopupSectionLabel>{sectionLabel}</PopupSectionLabel>}
          {links.map((link) => (
            <PopupItem key={link.to} to={link.to} label={link.label} onClick={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

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
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const badge = monthCount > 0 ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 16, minWidth: 16, borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 10, fontWeight: 700, padding: '0 4px' }}>
      {monthCount}
    </span>
  ) : null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={navLinkStyle(isActive)}>
        Admin
        {monthCount > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 15, minWidth: 15, borderRadius: 8, background: 'var(--neg)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '0 3px' }}>
            {monthCount}
          </span>
        )}
        <svg style={{ width: 11, height: 11, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : '' }} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
        {isActive && (
          <span style={{
            position: 'absolute', bottom: 0, left: 10, right: 10,
            height: 2, borderRadius: 999, background: 'var(--neg)',
          }} />
        )}
      </button>
      {open && (
        <div style={{ ...popupStyle, left: 'auto', right: 0 }}>
          <PopupSectionLabel>Admin Tools</PopupSectionLabel>
          <PopupItem to="/admin/deletion-logs" label="Deletion Audit Trail" onClick={() => setOpen(false)} extra={badge} />
        </div>
      )}
    </div>
  );
}

// ─── User avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ displayName, role }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const initials = (displayName ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function handleLogout() {
    await logoutUser();
    navigate('/login', { replace: true });
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'var(--accent-soft)', color: 'var(--accent)',
          border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          flexShrink: 0, transition: 'background 0.12s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-soft)'; }}
        title={displayName}
      >
        {initials}
      </button>

      {open && (
        <div style={{ ...popupStyle, left: 'auto', right: 0, minWidth: 200 }}>
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>{displayName}</p>
            {role && <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: '2px 0 0', textTransform: 'capitalize' }}>{ROLE_LABELS[role] ?? role}</p>}
          </div>
          <NavLink
            to="/members"
            onClick={() => setOpen(false)}
            style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', fontSize: 13, color: 'var(--fg-2)', textDecoration: 'none', transition: 'background 0.1s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            Team Members
          </NavLink>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
            <button
              type="button"
              onClick={handleLogout}
              style={{ display: 'flex', width: '100%', alignItems: 'center', padding: '8px 14px', fontSize: 13, color: 'var(--neg)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--neg-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Navbar ──────────────────────────────────────────────────────────────

export default function Navbar() {
  const { user, activeCompany, isConsolidated, isParentCompany, toggleConsolidated, salesEntryMode, activeCompanyId } = useApp();
  const { role, isAdmin } = useRole();

  return (
    <header
      className="print:hidden"
      style={{
        height: 60, background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 16,
        position: 'sticky', top: 0, zIndex: 40,
      }}
    >
      {/* Logo + Company switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Link
          to="/dashboard"
          style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', textDecoration: 'none', letterSpacing: '-0.01em' }}
        >
          SmartBooks
        </Link>
        <CompanySwitcher />
      </div>

      {/* Center nav */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            style={({ isActive }) => navLinkStyle(isActive)}
            onMouseEnter={(e) => { if (e.currentTarget.style.background === 'transparent') e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={(e) => { if (e.currentTarget.style.background === 'rgba(255,255,255,0.04)') e.currentTarget.style.background = 'transparent'; }}
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

        <NavDropdown
          label="Accounts"
          prefixes={ACCOUNTS_PREFIXES}
          links={ACCOUNTS_LINKS}
        />
        <NavDropdown
          label="F&B Ops"
          prefixes={FNB_PREFIXES}
          links={FNB_LINKS}
          sectionLabel="F&B Operations"
        />
        {isAdmin && <AdminDropdown companyId={activeCompanyId} />}
      </nav>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {isParentCompany && (
          <button
            type="button"
            onClick={toggleConsolidated}
            title={isConsolidated ? 'Switch to Single View' : 'Switch to Consolidated View'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: `1px solid ${isConsolidated ? 'var(--info)' : 'var(--border)'}`,
              background: isConsolidated ? 'var(--info-soft)' : 'transparent',
              color: isConsolidated ? 'var(--info)' : 'var(--fg-3)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 12, height: 12 }}>
              <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
            </svg>
            <span className="hidden sm:inline">{isConsolidated ? 'Consolidated' : 'Single'}</span>
          </button>
        )}

        <UserAvatar displayName={user?.displayName} role={role} />
      </div>
    </header>
  );
}
