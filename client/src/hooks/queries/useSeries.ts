/**
 * useSeries Hook
 *
 * React Query hooks for series management operations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import { invalidateAfterCoverUpdate } from '../../lib/cacheInvalidation';
import {
  getSeriesList,
  getUnifiedGridItems,
  getSeries,
  getSeriesIssues,
  getSeriesCover,
  getNextSeriesIssue,
  getSeriesPublishers,
  getSeriesGenres,
  updateSeries,
  searchSeries,
  getPotentialDuplicates,
  setSeriesCover,
  uploadSeriesCover,
} from '../../services/api/series';
import type {
  Series,
  SeriesListOptions,
  SeriesListResult,
  SeriesIssue,
  SeriesCover,
  UnifiedGridOptions,
} from '../../services/api/series';

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch paginated series list with filters
 */
export function useSeriesList(options?: SeriesListOptions) {
  return useQuery({
    queryKey: queryKeys.series.list(options),
    queryFn: async () => {
      const result = await getSeriesList(options);
      return result;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch unified grid items (series + promoted collections)
 */
export function useUnifiedGrid(options?: UnifiedGridOptions) {
  return useQuery({
    queryKey: queryKeys.series.grid(options),
    queryFn: async () => {
      const result = await getUnifiedGridItems(options);
      return result;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single series by ID
 */
export function useSeries(seriesId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.series.detail(seriesId!),
    queryFn: async () => {
      const response = await getSeries(seriesId!);
      return response.series;
    },
    enabled: !!seriesId,
  });
}

/**
 * Fetch issues for a series
 */
export function useSeriesIssues(
  seriesId: string | null | undefined,
  options?: { sortBy?: string; sortOrder?: 'asc' | 'desc'; all?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.series.issues(seriesId!, options),
    queryFn: async () => {
      const result = await getSeriesIssues(seriesId!, options);
      return result;
    },
    enabled: !!seriesId,
  });
}

/**
 * Get series cover information
 */
export function useSeriesCover(seriesId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.series.cover(seriesId!),
    queryFn: () => getSeriesCover(seriesId!),
    enabled: !!seriesId,
    staleTime: 5 * 60 * 1000, // Covers don't change often
  });
}

/**
 * Get next unread issue for a series
 */
export function useNextSeriesIssue(seriesId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.series.nextIssue(seriesId!),
    queryFn: () => getNextSeriesIssue(seriesId!),
    enabled: !!seriesId,
    staleTime: 10 * 1000,
  });
}

/**
 * Fetch all publishers for filtering
 * Cached for 1 day since publishers rarely change
 */
export function useSeriesPublishers() {
  return useQuery({
    queryKey: queryKeys.series.publishers(),
    queryFn: async () => {
      const result = await getSeriesPublishers();
      return result.publishers;
    },
    staleTime: 24 * 60 * 60 * 1000, // 1 day
  });
}

/**
 * Fetch all genres for filtering
 * Cached for 1 day since genres rarely change
 */
export function useSeriesGenres() {
  return useQuery({
    queryKey: queryKeys.series.genres(),
    queryFn: async () => {
      const result = await getSeriesGenres();
      return result.genres;
    },
    staleTime: 24 * 60 * 60 * 1000, // 1 day
  });
}

/**
 * Search series by name (for autocomplete)
 */
export function useSeriesSearch(query: string, limit = 10) {
  return useQuery({
    queryKey: ['series', 'search', query, limit] as const,
    queryFn: () => searchSeries(query, limit),
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  });
}

/**
 * Get potential duplicate series
 */
export function usePotentialDuplicates() {
  return useQuery({
    queryKey: queryKeys.series.duplicates(),
    queryFn: () => getPotentialDuplicates(),
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Update a series
 */
export function useUpdateSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seriesId, data }: { seriesId: string; data: Partial<Series> }) =>
      updateSeries(seriesId, data),
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.series.detail(seriesId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.series.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.series.grid() });
    },
  });
}

/**
 * Set series cover
 */
export function useSetSeriesCover() {
  return useMutation({
    mutationFn: ({
      seriesId,
      options,
    }: {
      seriesId: string;
      options: { source?: 'api' | 'user' | 'auto'; fileId?: string; url?: string };
    }) => setSeriesCover(seriesId, options),
    onSuccess: (_, { seriesId }) => {
      invalidateAfterCoverUpdate({ seriesId });
    },
  });
}

/**
 * Upload custom cover for a series
 */
export function useUploadSeriesCover() {
  return useMutation({
    mutationFn: ({ seriesId, file }: { seriesId: string; file: File }) =>
      uploadSeriesCover(seriesId, file),
    onSuccess: (_, { seriesId }) => {
      invalidateAfterCoverUpdate({ seriesId });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Invalidate all series-related queries
 */
export function useInvalidateSeries() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
  };
}

/**
 * Prefetch series data for navigation
 */
export function usePrefetchSeries() {
  const queryClient = useQueryClient();

  return (seriesId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.series.detail(seriesId),
      queryFn: async () => {
        const response = await getSeries(seriesId);
        return response.series;
      },
    });
  };
}

// Re-export types for convenience
export type { Series, SeriesListOptions, SeriesListResult, SeriesIssue, SeriesCover };
