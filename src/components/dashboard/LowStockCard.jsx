import LoadingSpinner from '../LoadingSpinner';
import { formatNumber } from '../../utils/format';

function severity(qty, reorder) {
  if ((qty ?? 0) <= 0) return 'critical';
  if (reorder > 0 && qty <= reorder * 0.5) return 'critical';
  return 'warning';
}

export default function LowStockCard({ data, loading }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', margin: 0 }}>
          Low stock alerts
        </h3>
        {!loading && data && (
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{data.totalCount} items</span>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', height: 80, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner size="sm" />
        </div>
      ) : !data?.items?.length ? (
        <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: 0 }}>
          All inventory above reorder level.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {data.items.map((item) => {
            const sev = severity(item.quantity, item.reorderLevel);
            const isCritical = sev === 'critical';
            return (
              <li
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 0', borderBottom: '1px solid var(--border)',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  {/* Severity dot */}
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: isCritical ? 'var(--neg)' : 'var(--warn)',
                    boxShadow: isCritical ? '0 0 6px var(--neg)' : '0 0 6px var(--warn)',
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name ?? 'Unnamed item'}
                    </p>
                    {item.sku && (
                      <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>SKU: {item.sku}</p>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{
                    fontSize: 13, fontWeight: 600, margin: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: isCritical ? 'var(--neg)' : 'var(--warn)',
                  }}>
                    {formatNumber(item.quantity ?? 0)}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>
                    reorder ≤ {formatNumber(item.reorderLevel ?? 0)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
