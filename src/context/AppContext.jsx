import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { getUserProfile } from '../services/authService';
import { listUserCompanies, setActiveCompanyForUser, COMPANY_TYPE } from '../services/companyService';
import { getMemberRole } from '../services/memberService';

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

  // Re-fetch role whenever user or active company changes.
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

  // Reset consolidated view whenever the active company changes.
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

  const activeCompany = companies.find((c) => c.companyId === activeCompanyId) ?? null;

  // Subsidiaries of the active company that are in the user's accessible company list.
  const subsidiaryIds = useMemo(
    () => companies.filter((c) => c.parentCompanyId === activeCompanyId).map((c) => c.companyId),
    [companies, activeCompanyId],
  );

  // Only true when the active company is a parent AND the user can see at least one subsidiary.
  const isParentCompany = activeCompany?.type === COMPANY_TYPE.PARENT && subsidiaryIds.length > 0;

  // All company IDs in scope for the current view mode.
  const consolidatedIds = useMemo(
    () => (isConsolidated && isParentCompany ? [activeCompanyId, ...subsidiaryIds] : [activeCompanyId]),
    [isConsolidated, isParentCompany, activeCompanyId, subsidiaryIds],
  );

  function toggleConsolidated() {
    if (isParentCompany) setIsConsolidated((v) => !v);
  }

  const value = {
    user,
    profile,
    companies,
    activeCompany,
    activeCompanyId,
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
