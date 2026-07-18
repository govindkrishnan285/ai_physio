"use client";

import { useCallback, useEffect, useState } from "react";

import { useSessionsVersion } from "@/lib/sessionStore";

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Manually re-run the fetch. */
  refetch: () => void;
}

/**
 * Generic data-fetching hook with loading / error state.
 *
 * `fetcher` should be stable (wrap in useCallback at the call site, or pass an
 * inline function plus the values it closes over in `deps`). When
 * `refetchOnSessionChange` is true (default), the fetch also re-runs whenever a
 * session is saved or deleted anywhere in the app, keeping every page in sync
 * with Postgres.
 */
export function useApiData<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
  refetchOnSessionChange = true
): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState(0);

  const sessionsVersion = useSessionsVersion();
  const versionDep = refetchOnSessionChange ? sessionsVersion : 0;

  const refetch = useCallback(() => setManualToken((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Request failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versionDep, manualToken]);

  return { data, loading, error, refetch };
}
