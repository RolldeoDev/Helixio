/**
 * Prefetch Hook
 *
 * Smart prefetching for improved perceived performance.
 * Prefetches data on hover and during scroll to make navigation feel instant.
 *
 * Features:
 * - Hover prefetching with debounce (150ms) to avoid spam
 * - Prefetch series details + issues on series card hover
 * - Prefetch file details on file card hover
 * - Configurable staleTime for prefetched data (default: 60s)
 * - Automatic deduplication (won't prefetch if already cached)
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { getSeries, getSeriesIssues } from '../services/api/series';
import { getFile } from '../services/api/files';

// =============================================================================
// Types
// =============================================================================

interface PrefetchOptions {
  /** Delay before prefetching (ms). Prevents spam on quick mouseovers. */
  delay?: number;
  /** How long prefetched data stays fresh (ms). Default: 60s */
  staleTime?: number;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for prefetching data on hover.
 * Prefetches series and file details to make navigation feel instant.
 *
 * @example
 * const { prefetchSeries, prefetchFile } = usePrefetch();
 *
 * <div onMouseEnter={() => prefetchSeries(seriesId)}>
 *   Series Card
 * </div>
 */
export function usePrefetch(options: PrefetchOptions = {}) {
  const { delay = 150, staleTime = 60_000 } = options;
  const queryClient = useQueryClient();

  /**
   * Prefetch a series and its issues.
   * Called on series card hover.
   *
   * NOTE: This function returns a cleanup function that clears the debounce timeout.
   * Call the cleanup if you need to cancel the prefetch (e.g., on mouseLeave).
   * If not canceled, the prefetch will fire after the debounce delay.
   *
   * @example
   * // Simple usage (no cleanup needed for most cases)
   * <div onMouseEnter={() => prefetchSeries(series.id)}>
   *
   * @example
   * // With cleanup (advanced use case)
   * const cleanup = useRef<(() => void) | null>(null);
   * <div
   *   onMouseEnter={() => { cleanup.current = prefetchSeries(series.id); }}
   *   onMouseLeave={() => { cleanup.current?.(); }}
   * >
   */
  const prefetchSeries = useCallback(
    (seriesId: string) => {
      // Debounce to avoid spam on quick mouseovers
      const timeoutId = setTimeout(() => {
        // Prefetch series details
        queryClient.prefetchQuery({
          queryKey: queryKeys.series.detail(seriesId),
          queryFn: () => getSeries(seriesId).then((res) => res.series),
          staleTime,
        });

        // Also prefetch issues for this series
        queryClient.prefetchQuery({
          queryKey: queryKeys.series.issues(seriesId),
          queryFn: () => getSeriesIssues(seriesId),
          staleTime,
        });
      }, delay);

      // Return cleanup function
      return () => clearTimeout(timeoutId);
    },
    [queryClient, delay, staleTime]
  );

  /**
   * Prefetch a file's details.
   * Called on file card hover.
   */
  const prefetchFile = useCallback(
    (fileId: string) => {
      const timeoutId = setTimeout(() => {
        queryClient.prefetchQuery({
          queryKey: queryKeys.files.detail(fileId),
          queryFn: () => getFile(fileId),
          staleTime,
        });
      }, delay);

      return () => clearTimeout(timeoutId);
    },
    [queryClient, delay, staleTime]
  );

  /**
   * Prefetch multiple series in a batch.
   * Useful for prefetching visible items in viewport.
   */
  const prefetchSeriesBatch = useCallback(
    (seriesIds: string[]) => {
      const timeoutId = setTimeout(() => {
        seriesIds.forEach((seriesId) => {
          queryClient.prefetchQuery({
            queryKey: queryKeys.series.detail(seriesId),
            queryFn: () => getSeries(seriesId).then((res) => res.series),
            staleTime,
          });
        });
      }, delay);

      return () => clearTimeout(timeoutId);
    },
    [queryClient, delay, staleTime]
  );

  /**
   * Prefetch multiple files in a batch.
   */
  const prefetchFilesBatch = useCallback(
    (fileIds: string[]) => {
      const timeoutId = setTimeout(() => {
        fileIds.forEach((fileId) => {
          queryClient.prefetchQuery({
            queryKey: queryKeys.files.detail(fileId),
            queryFn: () => getFile(fileId),
            staleTime,
          });
        });
      }, delay);

      return () => clearTimeout(timeoutId);
    },
    [queryClient, delay, staleTime]
  );

  return {
    prefetchSeries,
    prefetchFile,
    prefetchSeriesBatch,
    prefetchFilesBatch,
  };
}

// =============================================================================
// Infinite Scroll Prefetch Hook
// =============================================================================

/**
 * Hook for prefetching adjacent pages during infinite scroll.
 * Prefetches next page at 60% scroll, loads at 80%.
 *
 * @example
 * const { shouldPrefetch } = useInfiniteScrollPrefetch({
 *   visibleIndex: 45,
 *   totalLoaded: 50,
 *   hasNextPage: true,
 * });
 *
 * if (shouldPrefetch) {
 *   queryClient.prefetchInfiniteQuery(...);
 * }
 */
export function useInfiniteScrollPrefetch(options: {
  /** Index of item at end of visible range */
  visibleIndex: number;
  /** Total items currently loaded */
  totalLoaded: number;
  /** Whether there are more pages to load */
  hasNextPage: boolean;
  /** Whether currently fetching next page */
  isFetchingNextPage: boolean;
  /** Threshold to trigger prefetch (0-1). Default: 0.6 */
  prefetchThreshold?: number;
  /** Threshold to trigger load (0-1). Default: 0.8 */
  loadThreshold?: number;
}) {
  const {
    visibleIndex,
    totalLoaded,
    hasNextPage,
    isFetchingNextPage,
    prefetchThreshold = 0.6,
    loadThreshold = 0.8,
  } = options;

  // Calculate trigger indices
  const prefetchTriggerIndex = Math.floor(totalLoaded * prefetchThreshold);
  const loadTriggerIndex = Math.floor(totalLoaded * loadThreshold);

  // Determine if we should prefetch or load
  const shouldPrefetch =
    hasNextPage &&
    !isFetchingNextPage &&
    visibleIndex >= prefetchTriggerIndex &&
    visibleIndex < loadTriggerIndex;

  const shouldLoad = hasNextPage && !isFetchingNextPage && visibleIndex >= loadTriggerIndex;

  return {
    shouldPrefetch,
    shouldLoad,
    prefetchTriggerIndex,
    loadTriggerIndex,
  };
}
