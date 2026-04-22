import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { shortLabel } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

export default function SalesPurchasesChart({ data, loading }) {
  const chartData = (data ?? []).map((d) => ({
    label: shortLabel(d.date),
    Sales: d.sales,
    Purchases: d.purchases,
  }));

  const hasAny = chartData.some((d) => d.Sales > 0 || d.Purchases > 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700">
        Last 7 days — Sales vs Purchases
      </h3>

      <div className="mt-4 h-64">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : !hasAny ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No sales or purchases in the last 7 days.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} width={90} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Purchases" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
