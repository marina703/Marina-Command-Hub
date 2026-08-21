import { useCallback, useEffect, useState } from "react";
import { getDashboardState } from "@/lib/api";
import type { DashboardState } from "@/types";

export interface UseDashboardResult {
  data: DashboardState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches the dashboard state from GET /api/dashboard and exposes a
 * refresh function. Used across dashboard feature components.
 */
export function useDashboard(): UseDashboardResult {
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await getDashboardState();
      setData(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
