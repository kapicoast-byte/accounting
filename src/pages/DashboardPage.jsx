import { useApp } from '../context/AppContext';

export default function DashboardPage() {
  const { user, activeCompany } = useApp();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {activeCompany?.companyName ?? 'Dashboard'}
        </h1>
        <p className="text-sm text-gray-500">Welcome back, {user?.displayName}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium text-gray-500">Active company</h2>
          <p className="mt-1 text-base font-semibold text-gray-900">
            {activeCompany?.companyName}
          </p>
          <p className="text-xs text-gray-500 capitalize">
            {activeCompany?.type}
            {activeCompany?.parentCompanyId && ' • linked to parent'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium text-gray-500">Financial year start</h2>
          <p className="mt-1 text-base font-semibold text-gray-900">
            {activeCompany?.financialYearStart}
          </p>
          {activeCompany?.GSTIN && (
            <p className="text-xs text-gray-500">GSTIN: {activeCompany.GSTIN}</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
        Inventory, sales, and ledger modules will live here, all scoped to{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
          /companies/{activeCompany?.companyId}/
        </code>
      </div>
    </div>
  );
}
