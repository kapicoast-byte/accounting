import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { shortLabel } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

// Explicit color values for recharts SVG attributes (CSS vars don't work in SVG fill attr)
const SALES_COLOR     = 'oklch(0.74 0.15 155)';
const PURCHASES_COLOR = 'oklch(0.72 0.13 240)';
const GRID_COLOR      = 'oklch(0.30 0.012 250 / 0.5)';
const AXIS_COLOR      = 'oklch(0.62 0.012 250)';
const CARD_COLOR      = 'oklch(0.22 0.013 250)';
const BORDER_COLOR    = 'oklch(0.30 0.012 250 / 0.7)';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: CARD_COLOR, border: `1px solid ${BORDER_COLOR}`,
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <p style={{ color: AXIS_COLOR, marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
          <span style={{ color: AXIS_COLOR }}>{p.name}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'oklch(0.97 0.005 250)', marginLeft: 'auto' }}>
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
      borderRadius: 'var(--radius)', padding: '20px',
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', margin: '0 0 16px' }}>
        Last 7 days — Sales vs Purchases
      </h3>

      <div style={{ height: 260 }}>
        {loading ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </div>
        ) : !hasAny ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--fg-3)' }}>
            No sales or purchases in the last 7 days.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: AXIS_COLOR, fontFamily: 'Inter, system-ui' }}
                axisLine={{ stroke: GRID_COLOR }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: AXIS_COLOR, fontFamily: 'Inter, system-ui' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(v)}
                width={88}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'oklch(0.27 0.014 250 / 0.4)' }} />
              <Legend
                wrapperStyle={{ fontSize: 12, color: AXIS_COLOR, paddingTop: 12 }}
                iconType="square"
                iconSize={8}
              />
              <Bar dataKey="Sales" fill={SALES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="Purchases" fill={PURCHASES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
