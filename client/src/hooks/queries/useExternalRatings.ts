/**
 * useExternalRatings Hook
 *
 * React Query hooks for external community/critic ratings management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  getSeriesExternalRatings,
  syncSeriesRatings,
  deleteSeriesExternalRatings,
  getIssueExternalRatings,
  syncIssueRatings,
  syncSeriesIssueRatings,
  syncLibraryRatings,
  getSyncJobs,
  getSyncJobStatus,
  cancelSyncJob,
  getRatingSources,
  getExternalRatingsSettings,
  updateExternalRatingsSettings,
  type RatingSource,
  type ExternalRatingsSettings,
} from '../../services/api/external-ratings';

// =============================================================================
// Series External Ratings Hooks
// =============================================================================

/**
 * Fetch external ratings for a series
 */
export function useSeriesExternalRatings(seriesId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.externalRatings.series(seriesId!),
    queryFn: () => getSeriesExternalRatings(seriesId!),
    enabled: !!seriesId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Sync external ratings for a series
 */
export function useSyncSeriesRatings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      seriesId,
      sources,
      forceRefresh,
    }: {
      seriesId: string;
      sources?: RatingSource[];
      forceRefresh?: boolean;
    }) => syncSeriesRatings(seriesId, { sources, forceRefresh }),
    onSuccess: (_data, { seriesId }) => {
      // Update the cache with new ratings
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.series(seriesId),
      });
    },
  });
}

/**
 * Delete external ratings for a series
 */
export function useDeleteSeriesExternalRatings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (seriesId: string) => deleteSeriesExternalRatings(seriesId),
    onSuccess: (_, seriesId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.series(seriesId),
      });
    },
  });
}

// =============================================================================
// Issue External Ratings Hooks
// =============================================================================

/**
 * Fetch external ratings for an issue
 */
export function useIssueExternalRatings(fileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.externalRatings.issue(fileId!),
    queryFn: () => getIssueExternalRatings(fileId!),
    enabled: !!fileId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Sync external ratings for an issue
 */
export function useSyncIssueRatings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fileId,
      forceRefresh,
    }: {
      fileId: string;
      forceRefresh?: boolean;
    }) => syncIssueRatings(fileId, { forceRefresh }),
    onSuccess: (_data, { fileId }) => {
      // Update the cache with new ratings
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.issue(fileId),
      });
    },
  });
}

// =============================================================================
// Library Sync Hooks
// =============================================================================

/**
 * Start a library-wide rating sync job
 */
export function useSyncLibraryRatings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      libraryId,
      sources,
      forceRefresh,
    }: {
      libraryId: string;
      sources?: RatingSource[];
      forceRefresh?: boolean;
    }) => syncLibraryRatings(libraryId, { sources, forceRefresh }),
    onSuccess: () => {
      // Invalidate jobs list
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.jobs(),
      });
    },
  });
}

/**
 * Start a background job to sync ratings for all issues in a series
 */
export function useSyncSeriesIssueRatings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      seriesId,
      forceRefresh,
    }: {
      seriesId: string;
      forceRefresh?: boolean;
    }) => syncSeriesIssueRatings(seriesId, { forceRefresh }),
    onSuccess: () => {
      // Invalidate jobs list
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.jobs(),
      });
    },
  });
}

// =============================================================================
// Job Management Hooks
// =============================================================================

/**
 * Fetch sync jobs list
 */
export function useSyncJobs(options?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.externalRatings.jobs(options?.status),
    queryFn: () => getSyncJobs(options),
    refetchInterval: 5000, // Refresh every 5 seconds when viewing jobs
  });
}

/**
 * Fetch a specific sync job status
 */
export function useSyncJobStatus(
  jobId: string | undefined,
  options?: { refetchInterval?: number }
) {
  return useQuery({
    queryKey: queryKeys.externalRatings.job(jobId!),
    queryFn: () => getSyncJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: options?.refetchInterval ?? 2000, // Refresh every 2 seconds by default
  });
}

/**
 * Cancel a sync job
 */
export function useCancelSyncJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => cancelSyncJob(jobId),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.job(jobId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.jobs(),
      });
    },
  });
}

// =============================================================================
// Source Management Hooks
// =============================================================================

/**
 * Fetch available rating sources and their status
 */
export function useRatingSources() {
  return useQuery({
    queryKey: queryKeys.externalRatings.sources(),
    queryFn: getRatingSources,
    staleTime: 60 * 1000, // 1 minute
  });
}

// =============================================================================
// Settings Hooks
// =============================================================================

/**
 * Fetch external ratings settings
 */
export function useExternalRatingsSettings() {
  return useQuery({
    queryKey: queryKeys.externalRatings.settings(),
    queryFn: getExternalRatingsSettings,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Update external ratings settings
 */
export function useUpdateExternalRatingsSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<ExternalRatingsSettings>) =>
      updateExternalRatingsSettings(settings),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.externalRatings.settings(), data);
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Check if external ratings exist for a series or issue
 * Used to conditionally render UI elements (e.g., fetch ratings icon)
 */
export function useHasExternalRatings(seriesId?: string, fileId?: string) {
  const seriesQuery = useSeriesExternalRatings(seriesId);
  const issueQuery = useIssueExternalRatings(fileId);

  const isSeriesMode = !!seriesId;
  const { data: rawData, isLoading } = isSeriesMode ? seriesQuery : issueQuery;

  // Compute whether ratings exist
  let hasRatings = false;
  if (rawData) {
    if (isSeriesMode && 'averages' in rawData) {
      const averages = rawData.averages as {
        community: { average: number | null; count: number };
        critic: { average: number | null; count: number };
      };
      hasRatings =
        (averages.critic.average !== null && averages.critic.count > 0) ||
        (averages.community.average !== null && averages.community.count > 0);
    } else if ('ratings' in rawData) {
      hasRatings = (rawData.ratings as unknown[]).length > 0;
    }
  }

  return { hasRatings, isLoading };
}

/**
 * Invalidate all external ratings queries
 */
export function useInvalidateExternalRatings() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.externalRatings.all });
  };
}

// Re-export types
export type {
  RatingSource,
  ExternalRatingsResponse,
  SyncResult,
  SyncJobStatus,
  RatingSourceStatus,
  ExternalRatingsSettings,
  ExternalRatingDisplay,
} from '../../services/api/external-ratings';
