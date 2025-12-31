/**
 * useUrlSnapshot Hook
 *
 * Handles URL ↔ filter state synchronization.
 * - Reads URL params on mount to get initial state
 * - Writes filter state to URL (debounced) when it changes
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeriesFilterState, parseUrlToFilters, filtersToUrl } from '../utils/filterUtils';

export interface UseUrlSnapshotReturn {
  /** Initial filters parsed from URL on mount */
  initialFilters: SeriesFilterState;
  /** Whether URL contains a preset parameter */
  hasPresetInUrl: boolean;
  /** Sync current filters to URL (debounced) */
  syncToUrl: (filters: SeriesFilterState) => void;
}

const URL_SYNC_DEBOUNCE = 500;

export function useUrlSnapshot(): UseUrlSnapshotReturn {
  const [searchParams] = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Parse initial filters from URL (only on mount)
  const initialFilters = useMemo(() => {
    return parseUrlToFilters(searchParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty - only read on mount

  const hasPresetInUrl = initialFilters.presetId !== null;

  // Sync filters to URL (debounced)
  const syncToUrl = useCallback(
    (filters: SeriesFilterState) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        const url = filtersToUrl(filters);

        // Use replaceState to avoid polluting history
        window.history.replaceState({}, '', url);
      }, URL_SYNC_DEBOUNCE);
    },
    []
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    initialFilters,
    hasPresetInUrl,
    syncToUrl,
  };
}
