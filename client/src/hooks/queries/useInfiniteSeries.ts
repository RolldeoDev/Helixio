/**
 * useInfiniteSeries Hook
 *
 * React Query infinite scroll hooks for series.
 * Enables seamless infinite scrolling through large series libraries.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  getSeriesList,
  getUnifiedGridItems,
  type SeriesListOptions,
  type SeriesListResult,
  type UnifiedGridOptions,
  type UnifiedGridResult,
} from '../../services/api/series';

// =============================================================================
// Types
// =============================================================================

export interface UseInfiniteSeriesOptions extends Omit<SeriesListOptions, 'page'> {
  enabled?: boolean;
}

export interface UseInfiniteUnifiedGridOptions extends Omit<UnifiedGridOptions, 'page'> {
  enabled?: boolean;
}

// =============================================================================
// Infinite Query Hooks
// =============================================================================

/**
 * Fetch series list with infinite scroll support.
 * Uses offset-based pagination (page number).
 *
 * @example
 * const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteSeries({
 *   libraryId: 'lib-123',
 *   limit: 50,
 * });
 *
 * // Flatten pages for virtual grid
 * const allSeries = data?.pages.flatMap(page => page.series) ?? [];
 */
export function useInfiniteSeries(options: UseInfiniteSeriesOptions = {}) {
  const { enabled = true, ...params } = options;

  return useInfiniteQuery({
    queryKey: [...queryKeys.series.list(params), 'infinite'],
    queryFn: async ({ pageParam = 1 }) => {
      const pageParams: SeriesListOptions = {
        ...params,
        page: pageParam,
        limit: params.limit ?? 50,
      };

      return await getSeriesList(pageParams);
    },
    getNextPageParam: (lastPage: SeriesListResult) => {
      const { page, pages } = lastPage.pagination;
      // Return next page number if there are more pages, undefined otherwise
      return page < pages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled,
    staleTime: 30 * 1000, // Match traditional useSeriesList staleTime
  });
}

/**
 * Fetch unified grid items (series + promoted collections) with infinite scroll support.
 * Uses offset-based pagination (page number).
 *
 * @example
 * const { data, fetchNextPage, hasNextPage } = useInfiniteUnifiedGrid({
 *   libraryId: 'lib-123',
 *   limit: 50,
 * });
 *
 * // Flatten pages for virtual grid
 * const allItems = data?.pages.flatMap(page => page.items) ?? [];
 */
export function useInfiniteUnifiedGrid(options: UseInfiniteUnifiedGridOptions = {}) {
  const { enabled = true, ...params } = options;

  return useInfiniteQuery({
    queryKey: [...queryKeys.series.grid(params), 'infinite'],
    queryFn: async ({ pageParam = 1 }) => {
      const pageParams: UnifiedGridOptions = {
        ...params,
        page: pageParam,
        limit: params.limit ?? 50,
      };

      return await getUnifiedGridItems(pageParams);
    },
    getNextPageParam: (lastPage: UnifiedGridResult) => {
      const { page, pages } = lastPage.pagination;
      // Return next page number if there are more pages, undefined otherwise
      return page < pages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled,
    staleTime: 30 * 1000,
  });
}

// Re-export types for convenience
export type { SeriesListOptions, SeriesListResult };
