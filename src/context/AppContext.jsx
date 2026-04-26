import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { getUserProfile } from '../services/authService';
import { listUserCompanies, setActiveCompanyForUser, COMPANY_TYPE } from '../services/companyService';
import { getMemberRole } from '../services/memberService';
import { getCountryConfig, getTaxSystemConfig } from '../utils/countryConfig';
import { setCurrencyConfig } from '../utils/format';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user,              setUser]              = useState(null);
  const [profile,           setProfile]           = useState(null);
  const [companies,         setCompanies]         = useState([]);
  const [activeCompanyId,   setActiveCompanyIdState] = useState(null);
  const [userRole,          setUserRole]          = useState(null);
  const [authLoading,       setAuthLoading]       = useState(true);
  const [companiesLoading,  setCompaniesLoading]  = useState(false);
  const [roleLoading,       setRoleLoading]       = useState(false);
  const [isConsolidated,    setIsConsolidated]    = useState(false);

  const loadCompaniesFor = useCallback(async (uid, profileDoc) => {
    setCompaniesLoading(true);
    try {
      const list = await listUserCompanies(uid);
      setCompanies(list);

      const savedActive = profileDoc?.activeCompanyId;
      const validActive = list.some((c) => c.companyId === savedActive)
        ? savedActive
        : list[0]?.companyId ?? null;

      setActiveCompanyIdState(validActive);

      if (validActive && validActive !== savedActive) {
        await setActiveCompanyForUser(uid, validActive);
      }
    } finally {
      setCompaniesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !activeCompanyId) {
      setUserRole(null);
      return;
    }
    setRoleLoading(true);
    getMemberRole(activeCompanyId, user.uid)
      .then(setUserRole)
      .catch(() => setUserRole(null))
      .finally(() => setRoleLoading(false));
  }, [user, activeCompanyId]);

  useEffect(() => {
    setIsConsolidated(false);
  }, [activeCompanyId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userProfile = await getUserProfile(firebaseUser.uid);
        setProfile(userProfile);
        await loadCompaniesFor(firebaseUser.uid, userProfile);
      } else {
        setUser(null);
        setProfile(null);
        setCompanies([]);
        setActiveCompanyIdState(null);
        setUserRole(null);
        setIsConsolidated(false);
      }
      setAuthLoading(false);
    });

    return unsubscribe;
  }, [loadCompaniesFor]);

  const switchCompany = useCallback(
    async (companyId) => {
      if (!user) return;
      if (!companies.some((c) => c.companyId === companyId)) return;
      setActiveCompanyIdState(companyId);
      await setActiveCompanyForUser(user.uid, companyId);
    },
    [user, companies],
  );

  const refreshCompanies = useCallback(
    async (newActiveCompanyId) => {
      if (!user) return;
      const list = await listUserCompanies(user.uid);
      setCompanies(list);
      if (newActiveCompanyId && list.some((c) => c.companyId === newActiveCompanyId)) {
        setActiveCompanyIdState(newActiveCompanyId);
        await setActiveCompanyForUser(user.uid, newActiveCompanyId);
      }
    },
    [user],
  );

  const activeCompany  = companies.find((c) => c.companyId === activeCompanyId) ?? null;
  const businessType   = activeCompany?.businessType ?? '';
  const salesEntryMode = activeCompany?.salesEntryMode ?? 'POS';

  const subsidiaryIds = useMemo(
    () => companies.filter((c) => c.parentCompanyId === activeCompanyId).map((c) => c.companyId),
    [companies, activeCompanyId],
  );

  const isParentCompany = activeCompany?.type === COMPANY_TYPE.PARENT && subsidiaryIds.length > 0;

  const consolidatedIds = useMemo(
    () => (isConsolidated && isParentCompany ? [activeCompanyId, ...subsidiaryIds] : [activeCompanyId]),
    [isConsolidated, isParentCompany, activeCompanyId, subsidiaryIds],
  );

  function toggleConsolidated() {
    if (isParentCompany) setIsConsolidated((v) => !v);
  }

  // ── Tax + currency config derived from active company ─────────────────────
  const taxConfig = useMemo(() => {
    const cc         = getCountryConfig(activeCompany?.country);
    const taxSysKey  = activeCompany?.taxSystem ?? cc?.taxSystem ?? 'GST_IN';
    const ts         = getTaxSystemConfig(taxSysKey);
    const customRates = (activeCompany?.customTaxRates ?? [])
      .map((r) => Number(r.rate))
      .filter((n) => Number.isFinite(n) && n >= 0);

    const taxRates = taxSysKey === 'CUSTOM'
      ? (customRates.length > 0 ? customRates : [0])
      : (ts.rates.length > 0 ? ts.rates : [0]);

    return {
      taxSystem:      taxSysKey,
      taxLabel:       ts.label,
      taxRates,
      taxReportTitle: ts.reportTitle,
      tabA:           ts.tabA,
      tabB:           ts.tabB,
      splitMode:      ts.splitMode,
      currencyCode:   activeCompany?.currencyCode ?? cc?.currency ?? 'INR',
      currencyLocale: cc?.locale ?? 'en-IN',
    };
  }, [activeCompany]);

  // Synchronously update the module-level currency store so all formatCurrency()
  // calls throughout the app use the correct currency for the active company.
  setCurrencyConfig(taxConfig.currencyCode, taxConfig.currencyLocale);

  const value = {
    user,
    profile,
    companies,
    activeCompany,
    activeCompanyId,
    businessType,
    userRole,
    authLoading,
    companiesLoading,
    roleLoading,
    switchCompany,
    refreshCompanies,
    // Consolidated view
    isConsolidated: isConsolidated && isParentCompany,
    isParentCompany,
    subsidiaryIds,
    consolidatedIds,
    toggleConsolidated,
    // Tax & currency
    taxSystem:      taxConfig.taxSystem,
    taxLabel:       taxConfig.taxLabel,
    taxRates:       taxConfig.taxRates,
    taxReportTitle: taxConfig.taxReportTitle,
    tabA:           taxConfig.tabA,
    tabB:           taxConfig.tabB,
    splitMode:      taxConfig.splitMode,
    currencyCode:   taxConfig.currencyCode,
    // Sales
    salesEntryMode,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
