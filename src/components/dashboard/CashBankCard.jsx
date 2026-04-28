import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

export default function CashBankCard({ data, loading }) {
  const total = (data?.cashTotal ?? 0) + (data?.bankTotal ?? 0);

  return (
    <div className="db-card flex h-full flex-col p-5">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--db-text)' }}>
        Cash &amp; Bank
      </h3>

      {loading ? (
        <div className="mt-4 flex flex-1 items-center justify-center" style={{ minHeight: 120 }}>
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Total balance */}
          <p
            className="mt-3 text-3xl font-bold leading-none"
            style={{ color: 'var(--db-text)', fontFamily: 'var(--font-mono)' }}
          >
            {formatCurrency(total)}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--db-text-3)' }}>
            total balance
          </p>

          {/* Cash / Bank summary chips */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { label: 'Cash', value: data?.cashTotal ?? 0, color: 'var(--db-green)', bg: 'var(--db-green-dim)' },
              { label: 'Bank', value: data?.bankTotal ?? 0, color: 'var(--db-blue)',  bg: 'var(--db-blue-dim)'  },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className="rounded-lg p-3" style={{ background: bg }}>
                <p className="text-xs" style={{ color: 'var(--db-text-3)' }}>{label}</p>
                <p
                  className="mt-0.5 text-sm font-bold"
                  style={{ color, fontFamily: 'var(--font-mono)' }}
                >
                  {formatCurrency(value)}
                </p>
              </div>
            ))}
          </div>

          {/* Individual account list */}
          {data?.accounts?.length > 0 && (
            <ul
              className="mt-3 flex-1 divide-y overflow-y-auto"
              style={{ borderColor: 'var(--db-border-subtle)' }}
            >
              {data.accounts.map((acc) => (
                <li
                  key={acc.id}
                  className="flex items-center justify-between gap-2 py-2 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 flex-none rounded-full"
                      style={{
                        background: acc.type === 'cash' ? 'var(--db-green)' : 'var(--db-blue)',
                      }}
                    />
                    <span className="truncate" style={{ color: 'var(--db-text-2)' }}>
                      {acc.name}
                      {acc.companyName && (
                        <span style={{ color: 'var(--db-text-3)' }}> · {acc.companyName}</span>
                      )}
                    </span>
                  </div>
                  <span
                    className="flex-none font-semibold"
                    style={{ color: 'var(--db-text)', fontFamily: 'var(--font-mono)' }}
                  >
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
