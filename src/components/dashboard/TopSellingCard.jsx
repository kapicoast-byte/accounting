import LoadingSpinner from '../LoadingSpinner';
import { formatCurrency, formatNumber } from '../../utils/format';

export default function TopSellingCard({ data, loading }) {
  const maxAmount = data?.length ? Math.max(...data.map((d) => d.amount)) : 1;

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '20px',
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', margin: '0 0 16px' }}>
        Top 5 selling items — this month
      </h3>

      {loading ? (
        <div style={{ display: 'flex', height: 80, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner size="sm" />
        </div>
      ) : !data?.length ? (
        <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: 0 }}>No sales recorded this month.</p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {data.map((item, idx) => {
            const pct = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0;
            return (
              <li
                key={item.itemId ?? item.itemName}
                style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  {/* Rank badge */}
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--pos-soft)',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11, fontWeight: 600, color: 'var(--pos)',
                  }}>
                    {idx + 1}
                  </span>

                  <p style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.itemName}
                  </p>

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
                <div style={{ height: 3, background: 'var(--card-2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: 'var(--pos)',
                    width: `${pct}%`,
                    transition: 'width 0.6s ease',
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
