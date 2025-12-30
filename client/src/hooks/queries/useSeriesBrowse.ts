/**
 * useSeriesBrowse Hook
 *
 * React Query infinite query for cursor-based series pagination.
 * Optimized for virtual grid integration with large datasets (5000+ series).
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  getSeriesBrowse,
  type SeriesBrowseOptions,
  type SeriesBrowseResult,
  type SeriesBrowseItem,
} from '../../services/api/series';

// =============================================================================
// Types
// =============================================================================

export type { SeriesBrowseItem, SeriesBrowseResult, SeriesBrowseOptions };

// =============================================================================
// Hook
// =============================================================================

/**
 * Infinite query hook for cursor-based series browsing.
 *
 * Usage:
 * ```tsx
 * const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSeriesBrowse({
 *   limit: 100,
 *   sortBy: 'name',
 * });
 *
 * const allSeries = flattenSeriesBrowsePages(data?.pages);
 * ```
 */
export function useSeriesBrowse(options: Omit<SeriesBrowseOptions, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.series.browse(options),
    queryFn: async ({ pageParam }) => {
      return getSeriesBrowse({
        ...options,
        cursor: pageParam,
        limit: options.limit ?? 100,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Flatten paginated results into a single array for virtual grid consumption.
 *
 * @param pages Array of SeriesBrowseResult pages from infinite query
 * @returns Flat array of all SeriesBrowseItem from all pages
 */
export function flattenSeriesBrowsePages(
  pages: SeriesBrowseResult[] | undefined
): SeriesBrowseItem[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.items);
}
