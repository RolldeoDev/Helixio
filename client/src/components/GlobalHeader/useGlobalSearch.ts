/**
 * useGlobalSearch Hook
 *
 * Debounced search hook for the global search bar.
 * Returns search results from the unified global search API.
 */

import { useState, useEffect, useRef } from 'react';
import { globalSearch, type GlobalSearchResult } from '../../services/api.service';

interface UseGlobalSearchResult {
  results: GlobalSearchResult[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for debounced global search
 * @param query - Search query string
 * @param debounceMs - Debounce delay in milliseconds (default 200)
 */
export function useGlobalSearch(query: string, debounceMs = 200): UseGlobalSearchResult {
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Clear results for short queries
    if (query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);

    const timer = setTimeout(async () => {
      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const response = await globalSearch(query.trim(), 6);
        setResults(response.results);
        setError(null);
      } catch (e) {
        // Ignore abort errors
        if (e instanceof Error && e.name === 'AbortError') {
          return;
        }
        setError(e instanceof Error ? e : new Error('Search failed'));
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [query, debounceMs]);

  return { results, isLoading, error };
}
