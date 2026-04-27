import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { logoutUser } from '../services/authService';
import { useRole } from '../hooks/useRole';
import { ROLE_LABELS } from '../services/memberService';
import { BUSINESS_TYPES } from '../services/companyService';
import { getThisMonthDeletionCount } from '../services/deletionLogService';
import CompanySwitcher from './CompanySwitcher';

const BT_COLORS = {
  'F&B':           'bg-orange-100 text-orange-700',
  'Retail':        'bg-green-100 text-green-700',
  'Manufacturing': 'bg-purple-100 text-purple-700',
  'Services':      'bg-blue-100 text-blue-700',
  'Mixed':         'bg-teal-100 text-teal-700',
  'Other':         'bg-gray-100 text-gray-600',
};

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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition ${
          isActive
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        F&amp;B Ops
        <svg className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            F&amp;B Operations
          </p>
          {FNB_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className={({ isActive: a }) =>
                `block px-4 py-2 text-sm transition ${
                  a ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`
              }
            >
              {link.label}
            </NavLink>
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
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition ${
          isActive
            ? 'bg-red-50 text-red-700 font-medium'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        Admin
        {monthCount > 0 && (
          <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {monthCount}
          </span>
        )}
        <svg className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Admin Tools
          </p>
          <NavLink
            to="/admin/deletion-logs"
            onClick={() => setOpen(false)}
            className={({ isActive: a }) =>
              `flex items-center justify-between px-4 py-2 text-sm transition ${
                a ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            <span>Deletion Audit Trail</span>
            {monthCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-100 px-1 text-[10px] font-bold text-red-600">
                {monthCount}
              </span>
            )}
          </NavLink>
        </div>
      )}
    </div>
  );
}

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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition ${
          isActive
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        Accounts
        <svg className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {ACCOUNTS_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className={({ isActive: a }) =>
                `block px-4 py-2 text-sm transition ${
                  a ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user, activeCompany, isConsolidated, isParentCompany, toggleConsolidated, salesEntryMode, activeCompanyId } = useApp();
  const { role, isAdmin } = useRole();
  const businessType = activeCompany?.businessType;
  const navigate = useNavigate();

  async function handleLogout() {
    await logoutUser();
    navigate('/login', { replace: true });
  }

  return (
    <header className="border-b border-gray-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-lg font-bold text-gray-900">
            SmartBooks
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            {(salesEntryMode === 'Document Upload' || salesEntryMode === 'Both') && (
              <NavLink
                to="/sales/import"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                Import Sales
              </NavLink>
            )}
            <AccountsDropdown />
            <FnbDropdown />
            {isAdmin && <AdminDropdown companyId={activeCompanyId} />}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <CompanySwitcher />

          {/* Consolidated / Single view toggle — only shown for parent companies */}
          {isParentCompany && (
            <button
              type="button"
              onClick={toggleConsolidated}
              title={isConsolidated ? 'Switch to Single View' : 'Switch to Consolidated View'}
              className={`hidden sm:flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                isConsolidated
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
              </svg>
              {isConsolidated ? 'Consolidated' : 'Single View'}
            </button>
          )}

          {/* Business type badge */}
          {businessType && (
            <span className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${BT_COLORS[businessType] ?? BT_COLORS['Other']}`}>
              {BUSINESS_TYPES.find((b) => b.value === businessType)?.label ?? businessType}
            </span>
          )}

          {/* Team members link — visible to admins and managers */}
          {(role === 'admin' || role === 'manager') && (
            <NavLink
              to="/members"
              title="Team Members"
              className={({ isActive }) =>
                `flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
              </svg>
              <span className="hidden lg:inline">Members</span>
            </NavLink>
          )}

          <div className="hidden flex-col items-end sm:flex">
            <span className="text-sm text-gray-700">{user?.displayName}</span>
            {role && (
              <span className="text-xs text-gray-400 capitalize">{ROLE_LABELS[role] ?? role}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
