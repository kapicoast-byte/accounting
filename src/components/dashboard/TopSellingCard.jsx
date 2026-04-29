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
  const maxAmount = data?.length ? Math.max(...data.map((d) => d.amount), 1) : 1;

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Top Selling Items
        </h3>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
          background: 'var(--card-2)', color: 'var(--fg-3)',
          border: '1px solid var(--border)',
        }}>
          this month
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', height: 80, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner size="sm" />
        </div>
      ) : !data?.length ? (
        <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: 0 }}>No sales recorded this month.</p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {data.map((item, idx) => {
            const pct = (item.amount / maxAmount) * 100;
            const isLast = idx === data.length - 1;
            return (
              <li
                key={item.itemId ?? item.itemName}
                style={{
                  padding: '10px 0',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                }}
              >
                {/* Top row: rank + name/category + revenue */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12, fontWeight: 500, color: 'var(--fg-3)',
                    width: 20, flexShrink: 0, textAlign: 'right',
                  }}>
                    {idx + 1}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.itemName}
                    </p>
                    {item.category && (
                      <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>{item.category}</p>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, color: 'var(--pos)', margin: 0 }}>
                      {formatCurrency(item.amount)}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>
                      {formatNumber(item.qty)} sold
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginLeft: 30, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: 'var(--pos)',
                    width: `${pct}%`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
