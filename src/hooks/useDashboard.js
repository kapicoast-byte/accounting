import { useCallback, useEffect, useState } from 'react';
import { getDashboardSnapshot } from '../services/dashboardService';

export function useDashboard(companyId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDashboardSnapshot(companyId);
      setData(snapshot);
    } catch (err) {
      setError(err.message ?? 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
