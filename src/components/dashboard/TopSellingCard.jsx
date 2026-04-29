import { formatCurrency, formatNumber } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

const RANK_COLORS = [
  { fg: 'var(--pos)',  bg: 'var(--pos-soft)'  },
  { fg: 'var(--info)', bg: 'var(--info-soft)' },
  { fg: 'var(--warn)', bg: 'var(--warn-soft)' },
  { fg: 'var(--fg-2)', bg: 'var(--bg-2)'      },
  { fg: 'var(--fg-3)', bg: 'transparent'      },
];

export default function TopSellingCard({ data, loading }) {
  const maxQty = data?.length ? Math.max(...data.map((d) => d.qty), 1) : 1;

  return (
    <div className="db-card h-full p-5">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Top Selling Items
        </h3>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>this month</span>
      </div>

      {loading ? (
        <div style={{ marginTop: 16, display: 'flex', height: 96, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </div>
      ) : !data?.length ? (
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--fg-3)' }}>
          No sales recorded this month.
        </p>
      ) : (
        <ol style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14, padding: 0, listStyle: 'none' }}>
          {data.map((item, idx) => {
            const pct   = maxQty > 0 ? (item.qty / maxQty) * 100 : 0;
            const rank  = RANK_COLORS[idx] ?? RANK_COLORS[4];

            return (
              <li key={item.itemId ?? item.itemName}>
                {/* Name + qty row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: rank.bg, color: rank.fg,
                      fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    }}>
                      {idx + 1}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.itemName}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--pos)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {formatNumber(item.qty)} sold
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: 6, height: 5, width: '100%', overflow: 'hidden', borderRadius: 999, background: 'var(--bg-2)' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    width: `${pct}%`, background: 'var(--pos)',
                    transition: 'width 0.7s ease',
                  }} />
                </div>

                {/* Revenue */}
                <p style={{ marginTop: 3, textAlign: 'right', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
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
