import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const ROUTE_TITLES = {
  '/dashboard':           'Dashboard',
  '/sales':               'Sales',
  '/sales/new':           'New Sale',
  '/sales/import':        'Sales Reports',
  '/purchases':           'Purchases',
  '/purchases/new':       'New Purchase',
  '/expenses':            'Expenses',
  '/expenses/new':        'New Expense',
  '/inventory':           'Inventory',
  '/payables':            'Payables',
  '/accounts/banks':          'Bank Accounts',
  '/accounts/reconciliation': 'Bank Reconciliation',
  '/accounts':                'Chart of Accounts',
  '/ledger':              'Ledger',
  '/journal':             'Journal',
  '/trial-balance':       'Trial Balance',
  '/gst':                 'GST Reports',
  '/reports':             'Reports',
  '/fnb/menu-master':     'Menu Master',
  '/wastage':             'Wastage',
  '/production':          'Production',
  '/members':             'Members',
  '/admin/deletion-logs': 'Deletion Logs',
  '/company/profile':     'Company Profile',
  '/company/new':         'New Company',
};

function getTitle(pathname) {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith('/sales/') && pathname !== '/sales/new') return 'Sale Details';
  if (pathname.startsWith('/purchases/') && pathname !== '/purchases/new') return 'Purchase Details';
  if (pathname.startsWith('/expenses/') && pathname !== '/expenses/new') return 'Expense Details';
  if (pathname.startsWith('/inventory/')) return 'Item Details';
  return '';
}

export default function TopBar({ onMobileOpen, collapsed, onToggleCollapse, sidebarW = 220 }) {
  const { pathname } = useLocation();
  const { activeCompany, user } = useApp();
  const title = getTitle(pathname);

  const initials = (user?.displayName ?? user?.email ?? '?')
    .split(/[\s@]/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  const companyName = activeCompany?.companyName ?? activeCompany?.name ?? '';

  return (
    <header
      className="topbar-header"
      style={{
        position: 'fixed',
        top: 0, right: 0,
        left: sidebarW,
        height: 'var(--topbar-h)',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px 0 16px',
        gap: 10,
        zIndex: 30,
        transition: 'left 0.2s ease',
      }}
    >
      {/* Mobile hamburger — hidden on desktop, visible on mobile */}
      <button
        type="button"
        onClick={onMobileOpen}
        className="topbar-burger"
        style={{
          display: 'none',
          alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 6, border: 'none',
          background: 'transparent', color: 'var(--fg-3)', cursor: 'pointer',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>

      {/* Desktop sidebar expand button — visible only on desktop when sidebar collapsed */}
      {collapsed && onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expand sidebar"
          className="topbar-expand"
          style={{
            display: 'none', /* overridden by .topbar-expand media query */
            alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 6, border: 'none',
            background: 'transparent', color: 'var(--fg-3)', cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--fg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-3)'; }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
      )}

      {/* Page title */}
      {title ? (
        <h1 style={{
          margin: 0, fontSize: 15, fontWeight: 600,
          color: 'var(--fg)', flex: 1, lineHeight: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </h1>
      ) : (
        <span style={{ flex: 1 }} />
      )}

      {/* Right side: company name + user avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {companyName && (
          <span style={{
            fontSize: 12, color: 'var(--fg-4)',
            maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {companyName}
          </span>
        )}
        {user && (
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'var(--accent-soft)', color: 'var(--accent)',
            border: '1.5px solid rgba(99,102,241,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
            cursor: 'default',
          }}
          title={user?.displayName ?? user?.email ?? ''}
          >
            {initials}
          </div>
        )}
      </div>
    </header>
  );
}
