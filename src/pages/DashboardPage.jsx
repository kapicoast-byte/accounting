import { useApp } from '../context/AppContext';
import { useDashboard } from '../hooks/useDashboard';
import { BUSINESS_TYPES } from '../services/companyService';
import { formatCurrency } from '../utils/format';
import StatCard from '../components/dashboard/StatCard';
import SalesPurchasesChart from '../components/dashboard/SalesPurchasesChart';
import LowStockCard from '../components/dashboard/LowStockCard';
import TopSellingCard from '../components/dashboard/TopSellingCard';
import CashBankCard from '../components/dashboard/CashBankCard';
import AskYourBooksWidget from '../components/ai/AskYourBooksWidget';
import ExpenseAnomalyAlert from '../components/ai/ExpenseAnomalyAlert';

const BT_CHIPS = {
  'F&B':           { bg: 'oklch(0.78 0.14 55 / 0.16)',  color: 'oklch(0.82 0.12 60)'  },
  'Retail':        { bg: 'oklch(0.74 0.15 155 / 0.16)', color: 'oklch(0.74 0.15 155)' },
  'Manufacturing': { bg: 'oklch(0.70 0.15 300 / 0.16)', color: 'oklch(0.73 0.13 295)' },
  'Services':      { bg: 'oklch(0.72 0.13 240 / 0.16)', color: 'oklch(0.72 0.13 240)' },
  'Other':         { bg: 'oklch(0.30 0.012 250 / 0.4)', color: 'oklch(0.62 0.010 250)' },
};

function RefreshIcon({ spinning }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ width: 14, height: 14 }}
      className={spinning ? 'animate-spin' : ''}>
      {spinning
        ? <path d="M21 12a9 9 0 11-6.219-8.56" />
        : <><path d="M3 12a9 9 0 109-9M3 3v6h6" /></>}
    </svg>
  );
}

export default function DashboardPage() {
  const { activeCompany, activeCompanyId, isConsolidated, consolidatedIds, companies } = useApp();
  const { data, loading, error, refresh } = useDashboard({
    companyId: activeCompanyId,
    isConsolidated,
    consolidatedIds,
    companies,
  });

  const chip = BT_CHIPS[activeCompany?.businessType] ?? BT_CHIPS['Other'];
  const btLabel = BUSINESS_TYPES.find((b) => b.value === activeCompany?.businessType)?.label
    ?? activeCompany?.businessType;
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div style={{ background: 'var(--bg)', fontFamily: 'var(--font-sans)' }}
      className="-mx-6 -mt-8 flex min-h-screen flex-col gap-5 px-6 pb-16 pt-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--fg)', lineHeight: 1.1 }}>
              {activeCompany?.companyName ?? 'Dashboard'}
            </h1>
            {activeCompany?.businessType && (
              <span style={{
                padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: chip.bg, color: chip.color,
              }}>
                {btLabel}
              </span>
            )}
          </div>
          <p style={{ marginTop: 4, fontSize: 12, color: 'var(--fg-3)' }}>{today}</p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 500,
            background: 'var(--card-2)', border: '1px solid var(--border)',
            color: 'var(--fg-2)', cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s',
          }}
        >
          <RefreshIcon spinning={loading} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius)', fontSize: 13,
          background: 'var(--neg-soft)', border: '1px solid var(--neg)', color: 'var(--neg)',
        }}>
          {error}
        </div>
      )}

      {/* ── 4 Stat cards ────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today's Sales"
          value={formatCurrency(data?.todaysSales?.total ?? 0)}
          subtitle={`${data?.todaysSales?.count ?? 0} invoices`}
          trend="up"
          loading={loading}
          breakdown={data?.todaysSales?.breakdown}
        />
        <StatCard
          title="Today's Purchases"
          value={formatCurrency(data?.todaysPurchases?.total ?? 0)}
          subtitle={`${data?.todaysPurchases?.count ?? 0} bills`}
          trend="down"
          loading={loading}
          breakdown={data?.todaysPurchases?.breakdown}
        />
        <StatCard
          title="Receivables"
          value={formatCurrency(data?.receivables?.total ?? 0)}
          subtitle={`${data?.receivables?.count ?? 0} open invoices`}
          trend="up"
          loading={loading}
          breakdown={data?.receivables?.breakdown}
        />
        <StatCard
          title="Payables"
          value={formatCurrency(data?.payables?.total ?? 0)}
          subtitle={`${data?.payables?.count ?? 0} open bills`}
          trend="down"
          loading={loading}
          breakdown={data?.payables?.breakdown}
        />
      </section>

      {/* ── Chart (3/5) + Low Stock (2/5) ───────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SalesPurchasesChart data={data?.weeklyChart} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <LowStockCard data={data?.lowStock} loading={loading} />
        </div>
      </section>

      {/* ── Top Selling (3/5) + Cash/Bank (2/5) ─────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TopSellingCard data={data?.topSelling} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <CashBankCard data={data?.cashBank} loading={loading} />
        </div>
      </section>

      {/* ── AI widgets ──────────────────────────────────────────────────── */}
      {!loading && activeCompanyId && (
        <ExpenseAnomalyAlert companyId={activeCompanyId} />
      )}
      <AskYourBooksWidget dashboardSnapshot={data} />
    </div>
  );
}
