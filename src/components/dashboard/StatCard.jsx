import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

// accent → CSS variable name: "pos" | "neg" | "info" | "warn"
// trend  → "up" | "down" | null

function TrendCircle({ trend }) {
  if (!trend) return null;
  const isUp = trend === 'up';
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: isUp ? 'var(--pos-soft)' : 'var(--neg-soft)',
    }}>
      {isUp ? (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--pos)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 16V4M4 10l6-6 6 6" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--neg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 4v12M4 10l6 6 6-6" />
        </svg>
      )}
    </div>
  );
}

export default function StatCard({ title, value, subtitle, accent = 'pos', trend, loading, breakdown, children }) {
  const accentVar = `var(--${accent})`;
  const hasBreakdown = Array.isArray(breakdown) && breakdown.length > 1;

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '20px 20px 16px',
        cursor: hasBreakdown ? 'help' : 'default',
      }}
      className={hasBreakdown ? 'group' : ''}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--fg-3)', margin: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {title}
            {hasBreakdown && (
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                background: 'var(--info-soft)', color: 'var(--info)',
                padding: '1px 5px', borderRadius: 4,
              }}>
                Consolidated
              </span>
            )}
          </h3>

          {loading ? (
            <div style={{ marginTop: 14, height: 32, display: 'flex', alignItems: 'center' }}>
              <LoadingSpinner size="sm" />
            </div>
          ) : (
            <>
              {value !== undefined && (
                <p style={{
                  marginTop: 10, marginBottom: 0,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 26, fontWeight: 600, lineHeight: 1.1,
                  color: accentVar,
                }}>
                  {value}
                </p>
              )}
              {subtitle && (
                <p style={{ marginTop: 4, fontSize: 12, color: 'var(--fg-3)' }}>{subtitle}</p>
              )}
              {children}
            </>
          )}
        </div>

        {!loading && <TrendCircle trend={trend} />}
      </div>

      {/* Per-company breakdown tooltip */}
      {hasBreakdown && !loading && (
        <div
          className="pointer-events-none hidden group-hover:block"
          style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 6, zIndex: 20 }}
        >
          <div style={{
            borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--card-2)', padding: '12px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', marginBottom: 8 }}>
              Breakdown
            </p>
            {breakdown.map((b, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '3px 0', fontSize: 12 }}>
                <span style={{ color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--fg)', flexShrink: 0 }}>
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
