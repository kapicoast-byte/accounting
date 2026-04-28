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

const BT_CHIP = {
  'F&B':           { bg: 'oklch(0.78 0.14 55 / 0.18)',  color: 'oklch(0.82 0.12 60)'  },
  'Retail':        { bg: 'oklch(0.74 0.15 155 / 0.18)', color: 'oklch(0.74 0.15 155)' },
  'Manufacturing': { bg: 'oklch(0.70 0.15 300 / 0.18)', color: 'oklch(0.73 0.13 295)' },
  'Services':      { bg: 'oklch(0.68 0.15 240 / 0.18)', color: 'oklch(0.72 0.14 235)' },
  'Other':         { bg: 'oklch(0.45 0.008 250 / 0.25)', color: 'oklch(0.62 0.010 250)' },
};

function RefreshIcon({ spinning }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={`h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`}
    >
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

  const btChip = BT_CHIP[activeCompany?.businessType] ?? BT_CHIP['Other'];
  const btLabel = BUSINESS_TYPES.find((b) => b.value === activeCompany?.businessType)?.label
    ?? activeCompany?.businessType;
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div
      className="-mx-6 -mt-8 flex min-h-screen flex-col gap-5 px-6 pb-14 pt-8"
      style={{ background: 'var(--db-bg)', fontFamily: 'var(--font-sans)' }}
    >

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight"
              style={{ color: 'var(--db-text)' }}>
              {activeCompany?.companyName ?? 'Dashboard'}
            </h1>
            {activeCompany?.businessType && (
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ background: btChip.bg, color: btChip.color }}
              >
                {btLabel}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--db-text-3)' }}>
            {today}
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition disabled:opacity-50"
          style={{
            background:  'var(--db-card)',
            border:      '1px solid var(--db-border)',
            color:       'var(--db-text-2)',
          }}
        >
          <RefreshIcon spinning={loading} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'var(--db-red-dim)',
            border:     '1px solid var(--db-red)',
            color:      'var(--db-red)',
          }}
        >
          {error}
        </div>
      )}

      {/* ── 4 Stat cards ──────────────────────────────────────────────────── */}
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

      {/* ── Chart (left 3/5) + Low stock (right 2/5) ──────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SalesPurchasesChart data={data?.weeklyChart} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <LowStockCard data={data?.lowStock} loading={loading} />
        </div>
      </section>

      {/* ── Top selling (left 3/5) + Cash/Bank (right 2/5) ───────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TopSellingCard data={data?.topSelling} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <CashBankCard data={data?.cashBank} loading={loading} />
        </div>
      </section>

      {/* ── AI widgets (preserved as-is) ──────────────────────────────────── */}
      {!loading && activeCompanyId && (
        <ExpenseAnomalyAlert companyId={activeCompanyId} />
      )}
      <AskYourBooksWidget dashboardSnapshot={data} />
    </div>
  );
}
