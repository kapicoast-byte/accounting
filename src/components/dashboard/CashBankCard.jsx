import LoadingSpinner from '../LoadingSpinner';
import { formatCurrency } from '../../utils/format';

export default function CashBankCard({ data, loading }) {
  const total = (data?.cashTotal ?? 0) + (data?.bankTotal ?? 0);

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '20px',
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', margin: '0 0 4px' }}>
        Cash &amp; Bank
      </h3>

      {loading ? (
        <div style={{ display: 'flex', height: 80, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner size="sm" />
        </div>
      ) : (
        <>
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 26, fontWeight: 600, color: 'var(--fg)',
            margin: '8px 0 14px',
          }}>
            {formatCurrency(total)}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Cash', value: data?.cashTotal ?? 0 },
              { label: 'Bank', value: data?.bankTotal ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: 'var(--card-2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px',
              }}>
                <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: '0 0 4px', fontWeight: 500 }}>{label}</p>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
                  {formatCurrency(value)}
                </p>
              </div>
            ))}
          </div>

          {data?.accounts?.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {data.accounts.map((acc) => (
                <li key={acc.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 0', borderTop: '1px solid var(--border)',
                  gap: 8, fontSize: 12,
                }}>
                  <span style={{ color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.name}{' '}
                    <span style={{ color: 'var(--fg-3)', opacity: 0.7 }}>({acc.type})</span>
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--fg)', flexShrink: 0 }}>
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
