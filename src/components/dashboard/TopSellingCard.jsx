import { formatCurrency, formatNumber } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

const RANK_COLORS = [
  'var(--db-green)',
  'var(--db-blue)',
  'var(--db-amber)',
  'var(--db-text-2)',
  'var(--db-text-3)',
];
const RANK_BG = [
  'var(--db-green-dim)',
  'var(--db-blue-dim)',
  'var(--db-amber-dim)',
  'var(--db-border)',
  'transparent',
];

export default function TopSellingCard({ data, loading }) {
  const maxQty = data?.length ? Math.max(...data.map((d) => d.qty), 1) : 1;

  return (
    <div className="db-card h-full p-5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--db-text)' }}>
          Top Selling Items
        </h3>
        <span className="text-xs" style={{ color: 'var(--db-text-3)' }}>this month</span>
      </div>

      {loading ? (
        <div className="mt-4 flex h-24 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : !data?.length ? (
        <p className="mt-4 text-sm" style={{ color: 'var(--db-text-3)' }}>
          No sales recorded this month.
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {data.map((item, idx) => {
            const pct  = maxQty > 0 ? (item.qty / maxQty) * 100 : 0;
            const col  = RANK_COLORS[idx] ?? RANK_COLORS[4];
            const bg   = RANK_BG[idx]    ?? 'transparent';

            return (
              <li key={item.itemId ?? item.itemName}>
                {/* Name row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-5 w-5 flex-none items-center justify-center rounded text-[10px] font-bold"
                      style={{ background: bg, color: col }}
                    >
                      {idx + 1}
                    </span>
                    <span
                      className="truncate text-sm font-medium"
                      style={{ color: 'var(--db-text)' }}
                    >
                      {item.itemName}
                    </span>
                  </div>
                  <span
                    className="flex-none text-xs font-semibold"
                    style={{ color: col, fontFamily: 'var(--font-mono)' }}
                  >
                    {formatNumber(item.qty)} sold
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: 'var(--db-border)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: col }}
                  />
                </div>

                {/* Amount */}
                <p
                  className="mt-0.5 text-right text-xs"
                  style={{ color: 'var(--db-text-3)', fontFamily: 'var(--font-mono)' }}
                >
                  {formatCurrency(item.amount)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
