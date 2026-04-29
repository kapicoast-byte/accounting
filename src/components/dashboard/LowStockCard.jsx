import LoadingSpinner from '../LoadingSpinner';
import { formatNumber } from '../../utils/format';

function severity(qty, reorder) {
  if ((qty ?? 0) <= 0) return 'critical';
  if (reorder > 0 && qty <= reorder * 0.5) return 'critical';
  return 'warning';
}

export default function LowStockCard({ data, loading }) {
  const count = data?.totalCount ?? data?.items?.length ?? 0;

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Low Stock Alerts
        </h3>
        {!loading && count > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: 'var(--neg-soft)', color: 'var(--neg)',
          }}>
            {count}
          </span>
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
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {data.items.map((item, i) => {
            const sev = severity(item.quantity, item.reorderLevel);
            const isCritical = sev === 'critical';
            const isLast = i === data.items.length - 1;
            return (
              <li
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  gap: 10,
                }}
              >
                {/* Left: dot + name + unit */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: isCritical ? 'var(--neg)' : 'var(--warn)',
                    boxShadow: isCritical
                      ? '0 0 6px rgba(248,113,113,0.6)'
                      : '0 0 6px rgba(251,191,36,0.6)',
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name ?? 'Unnamed item'}
                    </p>
                    {item.sku && (
                      <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>{item.sku}</p>
                    )}
                  </div>
                </div>

                {/* Right: qty + reorder */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{
                    fontSize: 13, fontWeight: 700, margin: 0,
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
