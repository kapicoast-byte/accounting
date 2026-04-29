import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { shortLabel } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/format';
import LoadingSpinner from '../LoadingSpinner';

const GRID  = 'oklch(0.28 0.012 250)';
const TICK  = 'oklch(0.52 0.010 250)';
const SALES = 'oklch(0.74 0.15 155)';   /* --pos */
const PURCH = 'oklch(0.72 0.13 240)';   /* --info */
const MONO  = "'JetBrains Mono', 'Fira Code', monospace";

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'oklch(0.245 0.014 250)',
      border: '1px solid oklch(0.30 0.012 250 / 0.7)',
      borderRadius: 10, padding: '10px 14px',
    }}>
      <p style={{ color: 'oklch(0.97 0.005 250)', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
          <span style={{ color: p.color, fontSize: 11 }}>{p.name}</span>
          <span style={{ color: 'oklch(0.97 0.005 250)', fontFamily: MONO, fontWeight: 600, fontSize: 11 }}>
            {formatCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SalesPurchasesChart({ data, loading }) {
  const chartData = (data ?? []).map((d) => ({
    label:     shortLabel(d.date),
    Sales:     d.sales,
    Purchases: d.purchases,
  }));
  const hasAny = chartData.some((d) => d.Sales > 0 || d.Purchases > 0);

  return (
    <div className="db-card flex h-full flex-col p-5">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Sales vs Purchases
        </h3>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>last 7 days</span>
      </div>

      <div style={{ marginTop: 16, flex: 1, minHeight: 220 }}>
        {loading ? (
          <div className="flex h-full min-h-[220px] items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : !hasAny ? (
          <div className="flex h-full min-h-[220px] items-center justify-center"
            style={{ fontSize: 13, color: 'var(--fg-3)' }}>
            No activity in the last 7 days.
          </div>
        ) : (
          <div style={{ width: '100%', minWidth: 240, height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: TICK, fontSize: 11 }}
                  axisLine={{ stroke: GRID }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: TICK, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  width={40}
                />
                <Tooltip content={<DarkTooltip />} cursor={{ fill: 'oklch(0.28 0.012 250 / 0.45)' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: TICK, paddingTop: 10 }} />
                <Bar dataKey="Sales"     fill={SALES} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Purchases" fill={PURCH} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
