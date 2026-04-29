import LoadingSpinner from '../LoadingSpinner';

export default function LowStockCard({ data, loading }) {
  return (
    <div className="db-card flex h-full flex-col p-5">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Low Stock Alerts
        </h3>
        {!loading && data != null && (
          <span style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: 'var(--neg-soft)', color: 'var(--neg)',
          }}>
            {data.totalCount}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ marginTop: 16, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
          <LoadingSpinner />
        </div>
      ) : !data?.items?.length ? (
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--fg-3)' }}>
          All items above reorder level ✓
        </p>
      ) : (
        <ul style={{ marginTop: 12, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {data.items.map((item) => {
            const stock   = Number(item.currentStock ?? item.quantity ?? 0);
            const reorder = Number(item.reorderLevel ?? 0);
            const isCrit  = stock === 0;
            const dotColor  = isCrit ? 'var(--neg)'  : 'var(--warn)';
            const qtyColor  = isCrit ? 'var(--neg)'  : 'var(--warn)';
            const qtyBg     = isCrit ? 'var(--neg-soft)' : 'var(--warn-soft)';
            const badgeLabel = isCrit ? 'CRITICAL' : 'WARNING';

            return (
              <li
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '9px 12px', borderRadius: 8, background: 'var(--bg-2)',
                }}
              >
                {/* Severity dot + name + SKU */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: 1 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                    background: dotColor, boxShadow: `0 0 6px ${dotColor}`,
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name ?? 'Unnamed item'}
                    </p>
                    <p style={{ marginTop: 1, fontSize: 11, color: 'var(--fg-3)' }}>
                      reorder ≤ {reorder} {item.unit ?? 'units'}
                    </p>
                  </div>
                </div>

                {/* Qty badge + severity label */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  <span style={{
                    padding: '2px 7px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    background: qtyBg, color: qtyColor,
                  }}>
                    {stock} left
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: dotColor }}>
                    {badgeLabel}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
