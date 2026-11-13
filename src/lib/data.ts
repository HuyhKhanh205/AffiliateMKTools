import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `load` whenever the screen gains focus (so lists refresh after editing
 * on another screen) or `key` changes, and exposes loading/error/refresh state.
 */
export function useFocusedQuery<T>(load: () => Promise<T>, key: string = '') {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // `key` is intentionally a dependency: changing it re-runs the query.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh, key]),
  );

  return { data, error, loading, refresh };
}

/** Throws the Supabase error, otherwise returns data. */
export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
