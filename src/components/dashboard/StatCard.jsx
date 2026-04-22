import LoadingSpinner from '../LoadingSpinner';

export default function StatCard({ title, value, subtitle, accent = 'blue', loading, children }) {
  const accents = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    slate: 'text-slate-800',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      {loading ? (
        <div className="mt-3 flex h-8 items-center">
          <LoadingSpinner size="sm" />
        </div>
      ) : (
        <>
          {value !== undefined && (
            <p className={`mt-2 text-2xl font-bold ${accents[accent]}`}>{value}</p>
          )}
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
          {children}
        </>
      )}
    </div>
  );
}
