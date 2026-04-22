import { useApp } from '../context/AppContext';
import { logoutUser } from '../services/authService';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
  const { user, company } = useApp();
  const navigate = useNavigate();

  async function handleLogout() {
    await logoutUser();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {company?.name ?? 'SmartBooks'}
            </h1>
            <p className="text-sm text-gray-500">Welcome back, {user?.displayName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            Sign out
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500 text-sm">
          Dashboard coming soon. Authentication is working.
        </div>
      </div>
    </div>
  );
}
