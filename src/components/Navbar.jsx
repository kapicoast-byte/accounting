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

const DROPDOWN_PANEL = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  zIndex: 50,
  minWidth: 200,
  background: 'var(--card-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '6px',
  boxShadow: '0 16px 40px oklch(0 0 0 / 0.5)',
};

function DropdownItem({ to, children, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      style={({ isActive }) => ({
        display: 'block',
        padding: '7px 12px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? 'var(--pos)' : 'var(--fg-2)',
        background: isActive ? 'var(--pos-soft)' : 'transparent',
        textDecoration: 'none',
        transition: 'background 0.1s, color 0.1s',
      })}
    >
      {children}
    </NavLink>
  );
}

function NavDropdown({ label, links, prefixes }) {
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--fg)' : 'var(--fg-3)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'color 0.1s',
        }}
      >
        {label}
        <svg
          viewBox="0 0 20 20" fill="currentColor"
          style={{ width: 14, height: 14, transform: open ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}
        >
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
        <div style={DROPDOWN_PANEL}>
          {links.map((link) => (
            <DropdownItem key={link.to} to={link.to} onClick={() => setOpen(false)}>
              {link.label}
            </DropdownItem>
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 10px', borderRadius: 8, fontSize: 13,
          fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--neg)' : 'var(--fg-3)',
          background: 'transparent', border: 'none', cursor: 'pointer',
          position: 'relative',
        }}
      >
        Admin
        {monthCount > 0 && (
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 16, minWidth: 16, padding: '0 4px',
            borderRadius: 999, background: 'var(--neg)', color: 'white',
            fontSize: 10, fontWeight: 700,
          }}>
            {monthCount}
          </span>
        )}
        <svg viewBox="0 0 20 20" fill="currentColor"
          style={{ width: 14, height: 14, transform: open ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>
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
        <div style={{ ...DROPDOWN_PANEL, left: 'auto', right: 0 }}>
          <NavLink
            to="/admin/deletion-logs"
            onClick={() => setOpen(false)}
            style={({ isActive: a }) => ({
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 12px', borderRadius: 8, fontSize: 13,
              fontWeight: a ? 600 : 400,
              color: a ? 'var(--neg)' : 'var(--fg-2)',
              background: a ? 'var(--neg-soft)' : 'transparent',
              textDecoration: 'none',
            })}
          >
            <span>Deletion Audit Trail</span>
            {monthCount > 0 && (
              <span style={{
                height: 16, minWidth: 16, padding: '0 4px', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                borderRadius: 999, background: 'var(--neg-soft)',
                color: 'var(--neg)', fontSize: 10, fontWeight: 700,
              }}>
                {monthCount}
              </span>
            )}
          </NavLink>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user, activeCompany, isConsolidated, isParentCompany, toggleConsolidated, activeCompanyId } = useApp();
  const { role, isAdmin } = useRole();
  const businessType = activeCompany?.businessType;
  const navigate = useNavigate();

  async function handleLogout() {
    await logoutUser();
    navigate('/login', { replace: true });
  }

  return (
    <header
      className="print:hidden"
      style={{
        height: 60,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 28px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <div style={{ display: 'flex', width: '100%', maxWidth: 1152, margin: '0 auto', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>

        {/* ── Left: logo + nav ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link
            to="/dashboard"
            style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', textDecoration: 'none', letterSpacing: '-0.025em', flexShrink: 0 }}
          >
            SmartBooks
          </Link>

          <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                style={({ isActive }) => ({
                  position: 'relative',
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--fg)' : 'var(--fg-3)',
                  textDecoration: 'none',
                  transition: 'color 0.1s',
                })}
              >
                {({ isActive }) => (
                  <>
                    {link.label}
                    {isActive && (
                      <span style={{
                        position: 'absolute', bottom: 0, left: 10, right: 10,
                        height: 2, borderRadius: 999, background: 'var(--pos)',
                      }} />
                    )}
                  </>
                )}
              </NavLink>
            ))}
            <NavDropdown label="Accounts" links={ACCOUNTS_LINKS} prefixes={ACCOUNTS_PREFIXES} />
            {businessType === 'F&B' && (
              <NavDropdown label="F&B Ops" links={FNB_LINKS} prefixes={FNB_PREFIXES} />
            )}
            {isAdmin && <AdminDropdown companyId={activeCompanyId} />}
          </nav>
        </div>

        {/* ── Right: company switcher + controls + user ─────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <CompanySwitcher />

          {isParentCompany && (
            <button
              type="button"
              onClick={toggleConsolidated}
              title={isConsolidated ? 'Switch to Single View' : 'Switch to Consolidated View'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                background: isConsolidated ? 'var(--info-soft)' : 'var(--card-2)',
                color: isConsolidated ? 'var(--info)' : 'var(--fg-3)',
                border: '1px solid var(--border)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14 }}>
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
              </svg>
              {isConsolidated ? 'Consolidated' : 'Single'}
            </button>
          )}

          {(role === 'admin' || role === 'manager') && (
            <NavLink
              to="/members"
              title="Team Members"
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 13, textDecoration: 'none',
                color: isActive ? 'var(--pos)' : 'var(--fg-3)',
                transition: 'color 0.1s',
              })}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 15, height: 15 }}>
                <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
              </svg>
              <span className="hidden lg:inline">Members</span>
            </NavLink>
          )}

          <div className="hidden sm:flex" style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.2 }}>{user?.displayName}</span>
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
              padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 500,
              background: 'var(--card-2)', border: '1px solid var(--border)',
              color: 'var(--fg-2)', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
