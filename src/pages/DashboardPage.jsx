import { useApp } from '../context/AppContext';
import { useDashboard } from '../hooks/useDashboard';
import { formatCurrency } from '../utils/format';
import StatCard from '../components/dashboard/StatCard';
import SalesPurchasesChart from '../components/dashboard/SalesPurchasesChart';
import LowStockCard from '../components/dashboard/LowStockCard';
import TopSellingCard from '../components/dashboard/TopSellingCard';
import CashBankCard from '../components/dashboard/CashBankCard';

export default function DashboardPage() {
  const { activeCompany, activeCompanyId } = useApp();
  const { data, loading, error, refresh } = useDashboard(activeCompanyId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {activeCompany?.companyName ?? 'Dashboard'}
          </h1>
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
    </div>
  );
}
