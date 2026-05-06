import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useRole } from '../hooks/useRole';
import { logoutUser } from '../services/authService';
import { ROLE_LABELS } from '../services/memberService';
import { getThisMonthDeletionCount } from '../services/deletionLogService';
import CompanySwitcher from './CompanySwitcher';

// ── Tiny SVG icon ──────────────────────────────────────────────────────────────
function Ic({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      {(Array.isArray(d) ? d : [d]).map((path, i) => <path key={i} d={path} />)}
    </svg>
  );
}

const ICONS = {
  dailyrep:    ['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  reconcile:   ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11'],
  bank:        ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M9 22V12h6v10'],
  dashboard:   ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  sales:       ['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2', 'M9 5a2 2 0 012-2h2a2 2 0 012 2 2 2 0 01-2 2h-2a2 2 0 01-2-2z', 'M9 12h6M9 16h4'],
  purchases:   ['M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z', 'M3 6h18', 'M16 10a4 4 0 01-8 0'],
  expenses:    ['M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1z', 'M2 10h20'],
  inventory:   ['M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', 'M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12'],
  payables:    ['M12 1v22', 'M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'],
  accounts:    ['M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z', 'M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z'],
  ledger:      ['M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z', 'M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z'],
  journal:     ['M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z', 'M8 10h8M8 14h4'],
  trialbal:    ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  gst:         ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z', 'M14 2v6h6', 'M16 13H8M16 17H8M10 9H8'],
  reports:     ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  menu:        ['M18 8h1a4 4 0 010 8h-1', 'M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z', 'M6 1v3M10 1v3M14 1v3'],
  wastage:     ['M3 6h18', 'M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2'],
  production:  ['M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z'],
  members:     ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 7a4 4 0 100 8 4 4 0 000-8z', 'M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75'],
  shield:      ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  settings:    ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  menu_burger: ['M3 12h18', 'M3 6h18', 'M3 18h18'],
  logout:      ['M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
};

// ── Nav item ───────────────────────────────────────────────────────────────────

function NavItem({ to, iconKey, label, collapsed, badge, end = false, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      title={collapsed ? label : undefined}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '9px 0' : '8px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: isActive && !collapsed ? '0 8px 8px 0' : 8,
        color: isActive ? 'var(--pos)' : 'var(--fg-3)',
        background: isActive ? 'var(--pos-soft)' : 'transparent',
        boxShadow: isActive && !collapsed ? 'inset 3px 0 0 var(--pos)' : 'none',
        textDecoration: 'none',
        fontSize: 13.5,
        fontWeight: isActive ? 600 : 500,
        transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        position: 'relative',
      })}
      onMouseEnter={(e) => {
        if (!e.currentTarget.getAttribute('aria-current')) {
          e.currentTarget.style.background = 'var(--hover)';
          if (!collapsed) e.currentTarget.style.color = 'var(--fg-2)';
        }
      }}
      onMouseLeave={(e) => {
        const active = e.currentTarget.getAttribute('aria-current') === 'page';
        e.currentTarget.style.background = active ? 'var(--pos-soft)' : 'transparent';
        e.currentTarget.style.color      = active ? 'var(--pos)' : 'var(--fg-3)';
      }}
    >
      <Ic d={ICONS[iconKey]} size={16} />
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && badge}
    </NavLink>
  );
}

// ── Section header (collapsible) ───────────────────────────────────────────────

function SectionHeader({ label, open, onToggle, collapsed }) {
  if (collapsed) {
    return <div style={{ height: 1, margin: '6px 4px', background: 'var(--border)' }} />;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '12px 12px 4px',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--fg-4)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-4)'; }}
    >
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

// ── Section state (localStorage) ───────────────────────────────────────────────

const SECTIONS_LS = 'sidebar-sections-v1';

function loadSections() {
  try { return JSON.parse(localStorage.getItem(SECTIONS_LS)) ?? {}; } catch { return {}; }
}

// ── Main sidebar ───────────────────────────────────────────────────────────────

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onMobileClose }) {
  const navigate  = useNavigate();
  const { user, businessType, activeCompanyId } = useApp();
  const { role, isAdmin }                        = useRole();

  const [monthCount, setMonthCount] = useState(null);

  // Collapsible section state — default: main open, others closed
  const [sections, setSections] = useState(() => {
    const saved = loadSections();
    return {
      main:    saved.main    !== undefined ? saved.main    : true,
      finance: saved.finance !== undefined ? saved.finance : false,
      fnb:     saved.fnb     !== undefined ? saved.fnb     : false,
      admin:   saved.admin   !== undefined ? saved.admin   : false,
    };
  });

  function toggleSection(key) {
    setSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(SECTIONS_LS, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    if (!activeCompanyId) return;
    getThisMonthDeletionCount(activeCompanyId).then(setMonthCount).catch(() => {});
  }, [activeCompanyId]);

  async function handleLogout() {
    await logoutUser();
    navigate('/login', { replace: true });
  }

  const isFnB = businessType === 'F&B' || businessType === 'Mixed';

  const initials = (user?.displayName ?? user?.email ?? '?')
    .split(/[\s@]/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';

  const deletionBadge = monthCount > 0 ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      height: 16, minWidth: 16, borderRadius: 8, padding: '0 4px',
      background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 10, fontWeight: 700,
    }}>
      {monthCount}
    </span>
  ) : null;

  const W = collapsed ? 60 : 240;

  // In collapsed mode always show all items (section headers are just dividers)
  const show = (key) => collapsed || sections[key];

  return (
    <aside
      className={`sidebar-wrapper${mobileOpen ? ' mobile-open' : ''}`}
      style={{
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        width: W,
        transition: 'width 0.2s ease',
        background: 'var(--bg-2)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
        overflowX: 'hidden',
        overflowY: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {/* Logo area */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '16px 0' : '16px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        gap: 8,
      }}>
        {!collapsed && (
          <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img
              src="/balance-logo.png"
              alt="Balance"
              className="navbar-logo"
              style={{ height: 28, width: 'auto' }}
            />
          </Link>
        )}
        {collapsed && (
          <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            <span style={{
              width: 32, height: 32, borderRadius: 8, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'var(--pos-soft)', color: 'var(--pos)',
              fontSize: 14, fontWeight: 800,
            }}>B</span>
          </Link>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6, border: 'none',
            background: 'transparent', color: 'var(--fg-4)', cursor: 'pointer',
            flexShrink: 0, transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--fg-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-4)'; }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* Company switcher */}
      {!collapsed && (
        <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
          <CompanySwitcher />
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: collapsed ? '8px 6px' : '8px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>

        {/* ── MAIN ── */}
        <SectionHeader label="Main" open={sections.main} onToggle={() => toggleSection('main')} collapsed={collapsed} />
        {show('main') && (
          <>
            <NavItem to="/dashboard"  iconKey="dashboard"  label="Dashboard"      collapsed={collapsed} end onClick={onMobileClose} />
            <NavItem to="/sales"      iconKey="sales"      label="Sales"          collapsed={collapsed} end onClick={onMobileClose} />
            <NavItem to="/sales/import" iconKey="dailyrep" label="Sales Reports"  collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/purchases"  iconKey="purchases"  label="Purchases"      collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/expenses"   iconKey="expenses"   label="Expenses"       collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/inventory"  iconKey="inventory"  label="Inventory"      collapsed={collapsed} onClick={onMobileClose} />
          </>
        )}

        {/* ── FINANCE ── */}
        <SectionHeader label="Finance" open={sections.finance} onToggle={() => toggleSection('finance')} collapsed={collapsed} />
        {show('finance') && (
          <>
            <NavItem to="/payables"                iconKey="payables"  label="Payables"          collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/accounts/banks"          iconKey="bank"      label="Bank Accounts"     collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/accounts/reconciliation" iconKey="reconcile" label="Reconciliation"    collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/accounts"                iconKey="accounts"  label="Chart of Accounts" collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/ledger"                  iconKey="ledger"    label="Ledger"            collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/journal"                 iconKey="journal"   label="Journal"           collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/trial-balance"           iconKey="trialbal"  label="Trial Balance"     collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/gst"                     iconKey="gst"       label="GST Reports"       collapsed={collapsed} onClick={onMobileClose} />
            <NavItem to="/reports"                 iconKey="reports"   label="Reports"           collapsed={collapsed} onClick={onMobileClose} />
          </>
        )}

        {/* ── F&B OPS ── */}
        {isFnB && (
          <>
            <SectionHeader label="F&B Ops" open={sections.fnb} onToggle={() => toggleSection('fnb')} collapsed={collapsed} />
            {show('fnb') && (
              <>
                <NavItem to="/fnb/menu-master" iconKey="menu"       label="Menu Master" collapsed={collapsed} onClick={onMobileClose} />
                <NavItem to="/wastage"         iconKey="wastage"    label="Wastage"     collapsed={collapsed} onClick={onMobileClose} />
                <NavItem to="/production"      iconKey="production" label="Production"  collapsed={collapsed} onClick={onMobileClose} />
              </>
            )}
          </>
        )}

        {/* ── ADMIN ── */}
        <SectionHeader label="Admin" open={sections.admin} onToggle={() => toggleSection('admin')} collapsed={collapsed} />
        {show('admin') && (
          <>
            {isAdmin && (
              <NavItem to="/members" iconKey="members" label="Members" collapsed={collapsed} onClick={onMobileClose} />
            )}
            {isAdmin && (
              <NavItem to="/admin/deletion-logs" iconKey="shield" label="Deletion Logs"
                collapsed={collapsed} badge={deletionBadge} onClick={onMobileClose} />
            )}
            <NavItem to="/company/profile" iconKey="settings" label="Company Profile" collapsed={collapsed} onClick={onMobileClose} />
          </>
        )}
      </nav>

      {/* User section */}
      <div style={{
        borderTop: '1px solid var(--border)',
        padding: collapsed ? '12px 6px' : '12px 12px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          {/* Avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'var(--accent-soft)', color: 'var(--accent)',
            border: '1.5px solid rgba(99,102,241,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
          }}>
            {initials}
          </div>

          {/* Name + role */}
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </p>
              {role && (
                <p style={{ margin: 0, fontSize: 10, color: 'var(--fg-4)', textTransform: 'capitalize' }}>
                  {ROLE_LABELS[role] ?? role}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Sign out button */}
        {!collapsed ? (
          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '6px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--fg-4)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--neg-soft)'; e.currentTarget.style.color = 'var(--neg)'; e.currentTarget.style.borderColor = 'var(--neg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-4)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <Ic d={ICONS.logout} size={13} />
            Sign out
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 28, borderRadius: 6, border: 'none', alignSelf: 'center',
              background: 'transparent', color: 'var(--fg-4)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--neg-soft)'; e.currentTarget.style.color = 'var(--neg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-4)'; }}
          >
            <Ic d={ICONS.logout} size={14} />
          </button>
        )}
      </div>
    </aside>
  );
}
