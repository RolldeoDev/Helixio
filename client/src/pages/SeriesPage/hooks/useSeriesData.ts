/**
 * useSeriesData Hook
 *
 * Fetches series grid data based on filter state.
 * Uses React Query with keepPreviousData for smooth transitions.
 */

import { useQuery } from '@tanstack/react-query';
import { getUnifiedGridItems, GridItem, UnifiedGridOptions } from '../../../services/api/series';
import { SeriesFilterState, filtersToQueryKey } from '../utils/filterUtils';

export interface UseSeriesDataReturn {
  items: GridItem[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Convert filter state to API options.
 */
function filtersToApiOptions(filters: SeriesFilterState): UnifiedGridOptions {
  // If using preset, only include preset ID and sorting
  if (filters.presetId) {
    return {
      all: true,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      preset: filters.presetId,
      includePromotedCollections: true,
    };
  }

  // Manual filter mode
  return {
    all: true,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    search: filters.search || undefined,
    publisher: filters.publisher || undefined,
    type: filters.type || undefined,
    hasUnread: filters.hasUnread ?? undefined,
    includeHidden: filters.showHidden,
    libraryId: filters.libraryId || undefined,
    includePromotedCollections: true,
  };
}

export function useSeriesData(filters: SeriesFilterState): UseSeriesDataReturn {
  const queryKey = ['series', 'grid', filtersToQueryKey(filters)];

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => getUnifiedGridItems(filtersToApiOptions(filters)),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData, // Keep showing old data while fetching
    refetchOnWindowFocus: false,
  });

  return {
    items: data?.items ?? [],
    total: data?.pagination.total ?? 0,
    isLoading,
    isFetching,
    error: error as Error | null,
    refetch,
  };
}
