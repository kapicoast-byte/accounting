import { useApp } from '../context/AppContext';

export function useCompany() {
  const { activeCompany, activeCompanyId, companies, switchCompany, refreshCompanies, companiesLoading } = useApp();
  return {
    activeCompany,
    activeCompanyId,
    companies,
    switchCompany,
    refreshCompanies,
    companiesLoading,
    hasCompany: companies.length > 0,
  };
}
