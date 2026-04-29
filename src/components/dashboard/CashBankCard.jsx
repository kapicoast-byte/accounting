import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

const AVATAR_COLORS = [
  { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
  { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' },
  { bg: 'rgba(99,102,241,0.15)', color: '#6366f1' },
  { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
];

function AccountAvatar({ name, index }) {
  const { bg, color } = AVATAR_COLORS[index % AVATAR_COLORS.length];
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: bg, color, fontSize: 12, fontWeight: 700,
    }}>
      {(name ?? '?')[0].toUpperCase()}
    </div>
  );
}

export default function CashBankCard({ data, loading }) {
  const total = (data?.cashTotal ?? 0) + (data?.bankTotal ?? 0);

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '20px',
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 4px' }}>
        Cash &amp; Bank
      </h3>

      {loading ? (
        <div style={{ display: 'flex', height: 80, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner size="sm" />
        </div>
      ) : (
        <>
          {/* Total balance */}
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 28, fontWeight: 600, color: 'var(--fg)',
            margin: '10px 0 16px', letterSpacing: '-0.02em',
          }}>
            {formatCurrency(total)}
          </p>

          {/* Cash + Bank summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Cash', value: data?.cashTotal ?? 0 },
              { label: 'Bank', value: data?.bankTotal ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: 'var(--card-2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '10px 12px',
              }}>
                <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: '0 0 4px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {label}
                </p>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
                  {formatCurrency(value)}
                </p>
              </div>
            ))}
          </div>

          {/* Individual accounts */}
          {data?.accounts?.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {data.accounts.map((acc, i) => (
                <li
                  key={acc.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <AccountAvatar name={acc.name} index={i} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acc.name}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0, textTransform: 'capitalize' }}>
                      {acc.type}
                    </p>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: 'var(--fg)', flexShrink: 0 }}>
                    {formatCurrency(acc.balance)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
