import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

export default function CashBankCard({ data, loading }) {
  const total = (data?.cashTotal ?? 0) + (data?.bankTotal ?? 0);

  return (
    <div className="db-card flex h-full flex-col p-5">
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
        Cash &amp; Bank
      </h3>

      {loading ? (
        <div style={{ marginTop: 16, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Total balance */}
          <p style={{ marginTop: 12, fontSize: 30, fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>
            {formatCurrency(total)}
          </p>
          <p style={{ marginTop: 4, fontSize: 11, color: 'var(--fg-3)' }}>
            total balance
          </p>

          {/* Cash / Bank chips */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Cash', value: data?.cashTotal ?? 0, color: 'var(--pos)', bg: 'var(--pos-soft)' },
              { label: 'Bank', value: data?.bankTotal ?? 0, color: 'var(--info)', bg: 'var(--info-soft)' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} style={{ padding: '10px 12px', borderRadius: 8, background: bg }}>
                <p style={{ fontSize: 11, color: 'var(--fg-3)' }}>{label}</p>
                <p style={{ marginTop: 2, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>
                  {formatCurrency(value)}
                </p>
              </div>
            ))}
          </div>

          {/* Account list */}
          {data?.accounts?.length > 0 && (
            <ul style={{
              marginTop: 12, flex: 1, overflowY: 'auto',
              borderTop: '1px solid var(--border)',
              paddingTop: 8, paddingLeft: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column', gap: 0,
            }}>
              {data.accounts.map((acc) => (
                <li
                  key={acc.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: acc.type === 'cash' ? 'var(--pos)' : 'var(--info)',
                    }} />
                    <span style={{ fontSize: 12, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acc.name}
                      {acc.companyName && (
                        <span style={{ color: 'var(--fg-3)' }}> · {acc.companyName}</span>
                      )}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--fg)', flexShrink: 0 }}>
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
