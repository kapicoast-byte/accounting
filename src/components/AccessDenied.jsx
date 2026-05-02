import { useNavigate } from 'react-router-dom';

export default function AccessDenied({ message = "You don't have permission to view this page." }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">
        🔒
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900">Access Denied</h1>
        <p className="mt-1 text-sm text-gray-500 max-w-sm">{message}</p>
      </div>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="rounded-md border px-4 py-2 text-sm transition"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg)' }}
      >
        Go back
      </button>
    </div>
  );
}
