import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

export default function StatCard({ title, value, subtitle, accent = 'blue', loading, breakdown, children }) {
  const accents = {
    blue:  'text-blue-700',
    green: 'text-green-700',
    red:   'text-red-700',
    amber: 'text-amber-700',
    slate: 'text-slate-800',
  };

  // Only show breakdown when there are at least 2 companies worth of data.
  const hasBreakdown = Array.isArray(breakdown) && breakdown.length > 1;

  return (
    <div className={`group relative rounded-xl border border-gray-200 bg-white p-5 ${hasBreakdown ? 'cursor-help' : ''}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
        {hasBreakdown && (
          <span className="ml-1.5 rounded bg-indigo-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-500">
            Consolidated
          </span>
        )}
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

      {/* Per-company breakdown tooltip shown on hover */}
      {hasBreakdown && !loading && (
        <div className="pointer-events-none absolute left-0 right-0 top-full z-20 mt-1.5 hidden group-hover:block">
          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Breakdown
            </p>
            {breakdown.map((b, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-0.5 text-xs">
                <span className="truncate text-gray-500">{b.label}</span>
                <span className="font-semibold tabular-nums text-gray-800">
                  {formatCurrency(b.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
