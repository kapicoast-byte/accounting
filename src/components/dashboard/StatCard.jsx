import { formatCurrency } from '../../utils/format';

const TREND = {
  up:      { arrow: '↑', color: 'var(--pos)',  bg: 'var(--pos-soft)'  },
  down:    { arrow: '↓', color: 'var(--neg)',  bg: 'var(--neg-soft)'  },
  neutral: { arrow: '→', color: 'var(--fg-3)', bg: 'transparent'      },
};

export default function StatCard({ title, value, subtitle, trend = 'neutral', loading, breakdown }) {
  const hasBreakdown = Array.isArray(breakdown) && breakdown.length > 1;
  const t = TREND[trend] ?? TREND.neutral;
  const valueColor = trend === 'up' ? 'var(--pos)' : trend === 'down' ? 'var(--neg)' : 'var(--fg)';

  return (
    <div
      className="db-card group relative"
      style={{ padding: '20px 22px 18px', cursor: hasBreakdown && !loading ? 'help' : 'default' }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--fg-3)', lineHeight: 1,
        }}>
          {title}
          {hasBreakdown && (
            <span style={{
              marginLeft: 6, padding: '1px 5px', borderRadius: 4,
              fontSize: 9, fontWeight: 700,
              background: 'var(--info-soft)', color: 'var(--info)',
            }}>
              CONSOL
            </span>
          )}
        </h3>

        {/* Trend circle */}
        <span style={{
          flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: t.bg, color: t.color,
          fontSize: 13, fontWeight: 700, lineHeight: 1,
        }}>
          {t.arrow}
        </span>
      </div>

      {/* Value */}
      {loading ? (
        <>
          <div className="db-skeleton" style={{ marginTop: 16, height: 32, width: '72%' }} />
          <div className="db-skeleton" style={{ marginTop: 8, height: 12, width: '48%' }} />
        </>
      ) : (
        <>
          <p style={{
            marginTop: 14, fontSize: 28, fontWeight: 600, lineHeight: 1,
            fontFamily: 'var(--font-mono)', color: valueColor,
          }}>
            {value}
          </p>
          {subtitle && (
            <p style={{ marginTop: 6, fontSize: 12, color: 'var(--fg-3)' }}>
              {subtitle}
            </p>
          )}
        </>
      )}

      {/* Per-company breakdown tooltip */}
      {hasBreakdown && !loading && (
        <div className="pointer-events-none absolute left-0 right-0 top-full z-30 mt-2 hidden group-hover:block">
          <div style={{
            background: 'var(--card-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 12,
            boxShadow: '0 16px 40px oklch(0 0 0 / 0.5)', minWidth: 200,
          }}>
            <p style={{
              marginBottom: 8, fontSize: 10, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-3)',
            }}>
              Breakdown
            </p>
            {breakdown.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '3px 0' }}>
                <span style={{ fontSize: 12, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--fg)', flexShrink: 0 }}>
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
