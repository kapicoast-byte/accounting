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

export default function DashboardPage() {
  const { activeCompany, activeCompanyId, isConsolidated, consolidatedIds, companies } = useApp();
  const { data, loading, error, refresh } = useDashboard({
    companyId: activeCompanyId,
    isConsolidated,
    consolidatedIds,
    companies,
  });

  const btLabel = activeCompany?.businessType
    ? (BUSINESS_TYPES.find((b) => b.value === activeCompany.businessType)?.label ?? activeCompany.businessType)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
              {activeCompany?.companyName ?? 'Dashboard'}
            </h1>
            {btLabel && (
              <span style={{
                fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20,
                background: 'var(--card-2)', color: 'var(--fg-3)', border: '1px solid var(--border)',
              }}>
                {btLabel}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: '4px 0 0' }}>
            Live overview for the active company
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-3)', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1, transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--fg)'; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-3)'; }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ borderRadius: 8, border: '1px solid var(--neg)', background: 'var(--neg-soft)', padding: '10px 14px', fontSize: 13, color: 'var(--neg)' }}>
          {error}
        </div>
      )}

      {/* Stat cards */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <StatCard
          title="Today's sales"
          value={formatCurrency(data?.todaysSales?.total ?? 0)}
          subtitle={`${data?.todaysSales?.count ?? 0} invoices`}
          accent="pos"
          trend="up"
          loading={loading}
          breakdown={data?.todaysSales?.breakdown}
        />
        <StatCard
          title="Today's purchases"
          value={formatCurrency(data?.todaysPurchases?.total ?? 0)}
          subtitle={`${data?.todaysPurchases?.count ?? 0} bills`}
          accent="info"
          loading={loading}
          breakdown={data?.todaysPurchases?.breakdown}
        />
        <StatCard
          title="Receivables (owed to us)"
          value={formatCurrency(data?.receivables?.total ?? 0)}
          subtitle={`${data?.receivables?.count ?? 0} open invoices`}
          accent="pos"
          trend="up"
          loading={loading}
          breakdown={data?.receivables?.breakdown}
        />
        <StatCard
          title="Payables (we owe)"
          value={formatCurrency(data?.payables?.total ?? 0)}
          subtitle={`${data?.payables?.count ?? 0} open bills`}
          accent="neg"
          trend="down"
          loading={loading}
          breakdown={data?.payables?.breakdown}
        />
      </section>

      <SalesPurchasesChart data={data?.weeklyChart} loading={loading} />

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <CashBankCard data={data?.cashBank} loading={loading} />
        <LowStockCard data={data?.lowStock} loading={loading} />
        <TopSellingCard data={data?.topSelling} loading={loading} />
      </section>

      {!loading && activeCompanyId && (
        <ExpenseAnomalyAlert companyId={activeCompanyId} />
      )}

      <AskYourBooksWidget dashboardSnapshot={data} />
    </div>
  );
}
