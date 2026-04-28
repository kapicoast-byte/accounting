import { formatCurrency } from '../../utils/format';

const TREND = {
  up:      { arrow: '↑', color: 'var(--db-green)', bg: 'var(--db-green-dim)' },
  down:    { arrow: '↓', color: 'var(--db-red)',   bg: 'var(--db-red-dim)'   },
  neutral: { arrow: '→', color: 'var(--db-text-3)', bg: 'transparent'         },
};

export default function StatCard({ title, value, subtitle, trend = 'neutral', loading, breakdown }) {
  const hasBreakdown = Array.isArray(breakdown) && breakdown.length > 1;
  const t = TREND[trend] ?? TREND.neutral;
  const valueColor = trend === 'up' ? 'var(--db-green)' : trend === 'down' ? 'var(--db-red)' : 'var(--db-text)';

  return (
    <div
      className="db-card group relative p-5"
      style={{ cursor: hasBreakdown && !loading ? 'help' : 'default' }}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <h3
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--db-text-3)' }}
        >
          {title}
          {hasBreakdown && (
            <span
              className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold"
              style={{ background: 'var(--db-blue-dim)', color: 'var(--db-blue)' }}
            >
              CONSOL
            </span>
          )}
        </h3>
        <span
          className="flex-none rounded px-1.5 py-0.5 text-xs font-bold"
          style={{ background: t.bg, color: t.color }}
        >
          {t.arrow}
        </span>
      </div>

      {/* Value */}
      {loading ? (
        <>
          <div className="db-skeleton mt-4 h-7 w-3/4 rounded" />
          <div className="db-skeleton mt-2 h-3 w-1/2 rounded" />
        </>
      ) : (
        <>
          <p
            className="mt-3 text-2xl font-bold leading-none"
            style={{ color: valueColor, fontFamily: 'var(--font-mono)' }}
          >
            {value}
          </p>
          {subtitle && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--db-text-3)' }}>
              {subtitle}
            </p>
          )}
        </>
      )}

      {/* Per-company breakdown tooltip */}
      {hasBreakdown && !loading && (
        <div className="pointer-events-none absolute left-0 right-0 top-full z-30 mt-2 hidden group-hover:block">
          <div
            className="rounded-xl p-3 shadow-2xl"
            style={{
              background: 'var(--db-card)',
              border:     '1px solid var(--db-border)',
              minWidth:   '200px',
            }}
          >
            <p
              className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--db-text-3)' }}
            >
              Breakdown
            </p>
            {breakdown.map((b, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-0.5 text-xs">
                <span className="truncate" style={{ color: 'var(--db-text-2)' }}>{b.label}</span>
                <span
                  className="font-semibold"
                  style={{ color: 'var(--db-text)', fontFamily: 'var(--font-mono)' }}
                >
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
