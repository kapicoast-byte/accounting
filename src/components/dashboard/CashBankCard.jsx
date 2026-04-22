import LoadingSpinner from '../LoadingSpinner';
import { formatCurrency } from '../../utils/format';

export default function CashBankCard({ data, loading }) {
  const total = (data?.cashTotal ?? 0) + (data?.bankTotal ?? 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700">Cash &amp; Bank</h3>

      {loading ? (
        <div className="mt-4 flex h-24 items-center justify-center">
          <LoadingSpinner size="sm" />
        </div>
      ) : (
        <>
          <p className="mt-2 text-2xl font-bold text-slate-800">
            {formatCurrency(total)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md bg-gray-50 px-3 py-2">
              <p className="text-gray-500">Cash</p>
              <p className="font-semibold text-gray-800">
                {formatCurrency(data?.cashTotal ?? 0)}
              </p>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-2">
              <p className="text-gray-500">Bank</p>
              <p className="font-semibold text-gray-800">
                {formatCurrency(data?.bankTotal ?? 0)}
              </p>
            </div>
          </div>

          {data?.accounts?.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100">
              {data.accounts.map((acc) => (
                <li key={acc.id} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="truncate text-gray-700">
                    {acc.name}{' '}
                    <span className="text-gray-400">({acc.type})</span>
                  </span>
                  <span className="font-medium text-gray-800">
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
