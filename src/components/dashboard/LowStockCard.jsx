import LoadingSpinner from '../LoadingSpinner';

export default function LowStockCard({ data, loading }) {
  return (
    <div className="db-card flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--db-text)' }}>
          Low Stock Alerts
        </h3>
        {!loading && data != null && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-bold"
            style={{ background: 'var(--db-red-dim)', color: 'var(--db-red)' }}
          >
            {data.totalCount}
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-4 flex flex-1 items-center justify-center" style={{ minHeight: 120 }}>
          <LoadingSpinner />
        </div>
      ) : !data?.items?.length ? (
        <p className="mt-4 text-sm" style={{ color: 'var(--db-text-3)' }}>
          All items above reorder level ✓
        </p>
      ) : (
        <ul className="mt-3 flex-1 space-y-2 overflow-y-auto">
          {data.items.map((item) => {
            const stock   = Number(item.currentStock ?? item.quantity ?? 0);
            const reorder = Number(item.reorderLevel ?? 0);
            const isCrit  = stock === 0;
            const ac = isCrit
              ? { color: 'var(--db-red)',   bg: 'var(--db-red-dim)',   label: 'CRITICAL' }
              : { color: 'var(--db-amber)', bg: 'var(--db-amber-dim)', label: 'WARNING'  };

            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
                style={{ background: 'var(--db-card-inset)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--db-text)' }}>
                    {item.name ?? 'Unnamed item'}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--db-text-3)' }}>
                    reorder ≤ {reorder} {item.unit ?? 'units'}
                  </p>
                </div>

                <div className="flex flex-none flex-col items-end gap-1">
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-bold"
                    style={{ background: ac.bg, color: ac.color, fontFamily: 'var(--font-mono)' }}
                  >
                    {stock} left
                  </span>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: ac.color }}
                  >
                    {ac.label}
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
