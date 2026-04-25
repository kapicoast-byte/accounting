import { useCallback, useEffect, useState } from 'react';
import { getDashboardSnapshot, getConsolidatedDashboardSnapshot } from '../services/dashboardService';

// Accepts either the legacy single-arg form useDashboard(companyId)
// or the new object form useDashboard({ companyId, isConsolidated, consolidatedIds, companies }).
export function useDashboard(arg) {
  const isLegacy = typeof arg === 'string' || arg == null;
  const companyId       = isLegacy ? arg                    : arg?.companyId;
  const isConsolidated  = isLegacy ? false                  : (arg?.isConsolidated ?? false);
  const consolidatedIds = isLegacy ? [companyId]            : (arg?.consolidatedIds ?? [companyId]);
  const companies       = isLegacy ? []                     : (arg?.companies ?? []);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Stable string key so useCallback doesn't fire on every array reference change.
  const idsKey = consolidatedIds?.filter(Boolean).join(',') ?? companyId ?? '';

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      let snapshot;
      if (isConsolidated && consolidatedIds.length > 1) {
        snapshot = await getConsolidatedDashboardSnapshot(consolidatedIds, companies);
      } else {
        snapshot = await getDashboardSnapshot(companyId);
      }
      setData(snapshot);
    } catch (err) {
      setError(err.message ?? 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, idsKey, isConsolidated]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
