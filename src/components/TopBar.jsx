import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const ROUTE_TITLES = {
  '/dashboard':           'Dashboard',
  '/sales':               'Sales',
  '/sales/new':           'New Sale',
  '/purchases':           'Purchases',
  '/purchases/new':       'New Purchase',
  '/expenses':            'Expenses',
  '/expenses/new':        'New Expense',
  '/inventory':           'Inventory',
  '/payables':            'Payables',
  '/accounts/banks':      'Bank Accounts',
  '/accounts':            'Chart of Accounts',
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

export default function TopBar({ onMobileOpen }) {
  const { pathname } = useLocation();
  const { activeCompany } = useApp();
  const title = getTitle(pathname);

  return (
    <header style={{
      position: 'fixed',
      top: 0, right: 0, left: 0,
      height: 'var(--topbar-h)',
      background: 'var(--bg)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px 0 16px',
      gap: 12,
      zIndex: 30,
    }}
    className="topbar-header"
    >
      {/* Mobile hamburger */}
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

      {title && (
        <h1 style={{
          margin: 0, fontSize: 16, fontWeight: 600,
          color: 'var(--fg)', flex: 1, lineHeight: 1,
        }}>
          {title}
        </h1>
      )}

      {!title && <span style={{ flex: 1 }} />}

      {activeCompany?.name && (
        <span style={{
          fontSize: 12, color: 'var(--fg-4)',
          maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {activeCompany.name}
        </span>
      )}
    </header>
  );
}
