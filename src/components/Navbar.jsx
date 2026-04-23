import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { logoutUser } from '../services/authService';
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
  const { user } = useApp();
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
            <AccountsDropdown />
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <CompanySwitcher />
          <div className="hidden text-sm text-gray-600 sm:block">
            {user?.displayName}
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
