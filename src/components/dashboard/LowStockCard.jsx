import LoadingSpinner from '../LoadingSpinner';
import { formatNumber } from '../../utils/format';

export default function LowStockCard({ data, loading }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Low stock alerts</h3>
        {!loading && data && (
          <span className="text-xs text-gray-500">{data.totalCount} items</span>
        )}
      </div>

      {loading ? (
        <div className="mt-4 flex h-24 items-center justify-center">
          <LoadingSpinner size="sm" />
        </div>
      ) : !data?.items?.length ? (
        <p className="mt-4 text-sm text-gray-400">All inventory above reorder level.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">
                  {item.name ?? 'Unnamed item'}
                </p>
                {item.sku && (
                  <p className="text-xs text-gray-400">SKU: {item.sku}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-amber-700">
                  {formatNumber(item.quantity ?? 0)}
                </p>
                <p className="text-xs text-gray-400">
                  reorder ≤ {formatNumber(item.reorderLevel ?? 0)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
