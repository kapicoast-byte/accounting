import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listDailyReports } from '../services/dailySalesReportService';

function useMissingSalesCount(companyId) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    const d    = new Date();
    const year = d.getFullYear();
    const mon  = String(d.getMonth() + 1).padStart(2, '0');
    const from = `${year}-${mon}-01`;
    const to   = `${year}-${mon}-${String(d.getDate()).padStart(2, '0')}`;
    listDailyReports(companyId, { fromDate: from, toDate: to }).then((list) => {
      const uploaded = new Set(list.map((r) => r.date));
      let missing = 0;
      for (let i = 1; i <= d.getDate(); i++) {
        const ds = `${year}-${mon}-${String(i).padStart(2, '0')}`;
        if (!uploaded.has(ds)) missing++;
      }
      setCount(missing);
    }).catch(() => {});
  }, [companyId]);
  return count;
}

function RefreshCw({ size = 14, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }}
      className={className}>
      <path d="M3 12a9 9 0 109-9M3 3v6h6" />
    </svg>
  );
}
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

const TODAY = new Date().toLocaleDateString('en-IN', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

export default function DashboardPage() {
  const { activeCompany, activeCompanyId, isConsolidated, consolidatedIds, companies } = useApp();
  const missingSalesCount = useMissingSalesCount(activeCompanyId);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: 0, letterSpacing: '-0.02em' }}>
              {activeCompany?.companyName ?? 'Dashboard'}
            </h1>
            {btLabel && (
              <span style={{
                fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 20,
                background: 'var(--card-2)', color: 'var(--fg-3)',
                border: '1px solid var(--border)',
              }}>
                {btLabel}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: '5px 0 0' }}>{TODAY}</p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            padding: '6px 16px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-3)', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1, transition: 'all 0.15s', flexShrink: 0,
          }}
          onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--fg)'; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-3)'; }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--neg)', background: 'var(--neg-soft)', padding: '10px 14px', fontSize: 13, color: 'var(--neg)' }}>
          {error}
        </div>
      )}

      {/* ── Missing sales alert ── */}
      {missingSalesCount > 0 && (
        <Link to="/sales/import" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            borderRadius: 'var(--radius-sm)', border: '1px solid #f59e0b',
            background: '#fffbeb', padding: '10px 16px', fontSize: 13,
            color: '#b45309', cursor: 'pointer',
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              <strong>{missingSalesCount} day{missingSalesCount !== 1 ? 's' : ''} missing sales data</strong>
              {' '}this month —{' '}
              <span style={{ textDecoration: 'underline' }}>click to upload</span>
            </span>
          </div>
        </Link>
      )}

      {/* ── Row 1: 4 stat cards ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard
          title="Today's Sales"
          value={formatCurrency(data?.todaysSales?.total ?? 0)}
          subtitle={`${data?.todaysSales?.count ?? 0} invoices`}
          accent="pos"
          trend="up"
          loading={loading}
          breakdown={data?.todaysSales?.breakdown}
        />
        <StatCard
          title="Today's Purchases"
          value={formatCurrency(data?.todaysPurchases?.total ?? 0)}
          subtitle={`${data?.todaysPurchases?.count ?? 0} bills`}
          accent="info"
          loading={loading}
          breakdown={data?.todaysPurchases?.breakdown}
        />
        <StatCard
          title="Receivables"
          value={formatCurrency(data?.receivables?.total ?? 0)}
          subtitle={`${data?.receivables?.count ?? 0} open invoices`}
          accent="pos"
          trend="up"
          loading={loading}
          breakdown={data?.receivables?.breakdown}
        />
        <StatCard
          title="Payables"
          value={formatCurrency(data?.payables?.total ?? 0)}
          subtitle={`${data?.payables?.count ?? 0} open bills`}
          accent="neg"
          trend="down"
          loading={loading}
          breakdown={data?.payables?.breakdown}
        />
      </section>

      {/* ── Row 2: Chart (left) + Low Stock (right) ── */}
      <section style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <SalesPurchasesChart data={data?.weeklyChart} loading={loading} />
        <LowStockCard data={data?.lowStock} loading={loading} />
      </section>

      {/* ── Row 3: Top Selling (left) + Cash & Bank (right) ── */}
      <section style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <TopSellingCard data={data?.topSelling} loading={loading} />
        <CashBankCard data={data?.cashBank} loading={loading} />
      </section>

      {/* ── AI widgets ──────────────────────────────────────────────────── */}
      {!loading && activeCompanyId && (
        <ExpenseAnomalyAlert companyId={activeCompanyId} />
      )}
      <AskYourBooksWidget dashboardSnapshot={data} />
    </div>
  );
}
