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
  const { activeCompany, activeCompanyId } = useApp();
  const { data, loading, error, refresh } = useDashboard(activeCompanyId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {activeCompany?.companyName ?? 'Dashboard'}
            </h1>
            {activeCompany?.businessType && (() => {
              const bt = BUSINESS_TYPES.find((b) => b.value === activeCompany.businessType);
              const colors = {
                'F&B':           'bg-orange-100 text-orange-700',
                'Retail':        'bg-green-100 text-green-700',
                'Manufacturing': 'bg-purple-100 text-purple-700',
                'Services':      'bg-blue-100 text-blue-700',
                'Other':         'bg-gray-100 text-gray-600',
              };
              return (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[activeCompany.businessType] ?? colors['Other']}`}>
                  {bt?.label ?? activeCompany.businessType}
                </span>
              );
            })()}
          </div>
          <p className="text-sm text-gray-500">
            Live overview for the active company
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today's sales"
          value={formatCurrency(data?.todaysSales?.total ?? 0)}
          subtitle={`${data?.todaysSales?.count ?? 0} invoices`}
          accent="green"
          loading={loading}
        />
        <StatCard
          title="Today's purchases"
          value={formatCurrency(data?.todaysPurchases?.total ?? 0)}
          subtitle={`${data?.todaysPurchases?.count ?? 0} bills`}
          accent="blue"
          loading={loading}
        />
        <StatCard
          title="Receivables (owed to us)"
          value={formatCurrency(data?.receivables?.total ?? 0)}
          subtitle={`${data?.receivables?.count ?? 0} open invoices`}
          accent="green"
          loading={loading}
        />
        <StatCard
          title="Payables (we owe)"
          value={formatCurrency(data?.payables?.total ?? 0)}
          subtitle={`${data?.payables?.count ?? 0} open bills`}
          accent="red"
          loading={loading}
        />
      </section>

      <SalesPurchasesChart data={data?.weeklyChart} loading={loading} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
