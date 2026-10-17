import { useCallback, useEffect, useState } from "react";

export interface LoadState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  token: string;
  data: T | undefined;
  error: unknown;
}

/**
 * Loads data on mount and whenever `key` changes. Loading is derived from
 * whether the latest settled result belongs to the current request, so no
 * state is set synchronously inside the effect.
 */
export function useLoad<T>(load: () => Promise<T>, key: string): LoadState<T> {
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const token = `${key}#${String(version)}`;

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setSettled({ token, data, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setSettled({ token, data: undefined, error });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is recreated on every render; `token` identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const loading = settled?.token !== token;
  return {
    data: loading ? undefined : settled.data,
    error: loading ? null : settled.error,
    loading,
    reload,
  };
}
