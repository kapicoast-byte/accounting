import LoadingSpinner from '../LoadingSpinner';
import { formatCurrency, formatNumber } from '../../utils/format';

export default function TopSellingCard({ data, loading }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700">
        Top 5 selling items — this month
      </h3>

      {loading ? (
        <div className="mt-4 flex h-24 items-center justify-center">
          <LoadingSpinner size="sm" />
        </div>
      ) : !data?.length ? (
        <p className="mt-4 text-sm text-gray-400">No sales recorded this month.</p>
      ) : (
        <ol className="mt-3 divide-y divide-gray-100">
          {data.map((item, idx) => (
            <li
              key={item.itemId ?? item.itemName}
              className="flex items-center justify-between py-2"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                  {idx + 1}
                </span>
                <p className="truncate text-sm font-medium text-gray-800">
                  {item.itemName}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-800">
                  {formatNumber(item.qty)} sold
                </p>
                <p className="text-xs text-gray-500">{formatCurrency(item.amount)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
