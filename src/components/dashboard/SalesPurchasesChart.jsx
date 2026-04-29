import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { shortLabel } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

const SALES_COLOR     = '#4ade80';  // --pos
const PURCHASES_COLOR = '#60a5fa';  // --info
const GRID_COLOR      = 'rgba(255,255,255,0.08)';
const AXIS_COLOR      = '#6b7494';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card-2)', border: '1px solid var(--border-2)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    }}>
      <p style={{ color: AXIS_COLOR, marginBottom: 8, fontWeight: 500, fontSize: 11 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
          <span style={{ color: '#9ba3c0', flex: 1 }}>{p.name}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: '#e8eaf0' }}>
            {formatCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SalesPurchasesChart({ data, loading }) {
  const chartData = (data ?? []).map((d) => ({
    label: shortLabel(d.date),
    Sales: d.sales,
    Purchases: d.purchases,
  }));

  const hasAny = chartData.some((d) => d.Sales > 0 || d.Purchases > 0);

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '20px 20px 16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Sales vs Purchases
        </h3>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
          background: 'var(--card-2)', color: 'var(--fg-3)',
          border: '1px solid var(--border)',
        }}>
          last 7 days
        </span>
      </div>

      <div style={{ height: 220 }}>
        {loading ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </div>
        ) : !hasAny ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--fg-3)' }}>
            No activity in the last 7 days
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: AXIS_COLOR }}
                axisLine={{ stroke: GRID_COLOR }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: AXIS_COLOR }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(v)}
                width={88}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend
                wrapperStyle={{ fontSize: 12, color: AXIS_COLOR, paddingTop: 12 }}
                iconType="square"
                iconSize={8}
              />
              <Bar dataKey="Sales" fill={SALES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="Purchases" fill={PURCHASES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
