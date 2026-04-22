import { formatCurrency, formatNumber } from '../../utils/format';

export default function StockValuationCard({ valuation }) {
  if (!valuation) return null;

  const categories = Object.entries(valuation.byCategory ?? {})
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">Stock valuation (at cost)</h2>
        <span className="text-xs text-gray-500">{formatNumber(valuation.totalItems)} active items</span>
      </div>

      <p className="mt-2 text-2xl font-bold text-slate-800">
        {formatCurrency(valuation.totalValue)}
      </p>

      {categories.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {categories.map(([cat, value]) => (
            <li key={cat} className="flex items-center justify-between text-xs text-gray-600">
              <span className="truncate">{cat}</span>
              <span className="font-medium text-gray-800">{formatCurrency(value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
