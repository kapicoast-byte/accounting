import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { logoutUser } from '../services/authService';
import CompanySwitcher from './CompanySwitcher';

export default function Navbar() {
  const { user } = useApp();
  const navigate = useNavigate();

  async function handleLogout() {
    await logoutUser();
    navigate('/login', { replace: true });
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link to="/dashboard" className="text-lg font-bold text-gray-900">
          SmartBooks
        </Link>

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
