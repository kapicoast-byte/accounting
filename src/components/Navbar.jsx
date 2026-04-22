import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { logoutUser } from '../services/authService';
import CompanySwitcher from './CompanySwitcher';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/sales',     label: 'Sales' },
];

export default function Navbar() {
  const { user } = useApp();
  const navigate = useNavigate();

  async function handleLogout() {
    await logoutUser();
    navigate('/login', { replace: true });
  }

  return (
    <header className="border-b border-gray-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="text-lg font-bold text-gray-900">
            SmartBooks
          </Link>
          <nav className="flex items-center gap-1 text-sm">
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
