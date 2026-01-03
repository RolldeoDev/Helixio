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
  validateCbrUrl,
  saveManualCbrMatch,
  getCbrMatchStatus,
  resetCbrMatch,
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
 * Also invalidates reviews queries since CBR syncs reviews alongside ratings
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
      // Also invalidate reviews since CBR syncs reviews alongside ratings
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.series(seriesId),
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
 * Also invalidates reviews queries since CBR syncs reviews alongside ratings
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
      // Also invalidate reviews since CBR syncs reviews alongside ratings
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.issue(fileId),
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

// =============================================================================
// Manual CBR Match Hooks
// =============================================================================

/**
 * Validate a CBR URL (preview only, does NOT save)
 */
export function useValidateCbrUrl() {
  return useMutation({
    mutationFn: ({ url }: { url: string }) => validateCbrUrl(url),
  });
}

/**
 * Apply a manual CBR match (validate + fetch + save)
 * Also invalidates reviews queries since CBR syncs reviews alongside ratings
 */
export function useSaveManualCbrMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seriesId, url }: { seriesId: string; url: string }) =>
      saveManualCbrMatch(seriesId, url),
    onSuccess: (_data, { seriesId }) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.series(seriesId),
      });
      // Also invalidate reviews since CBR syncs reviews alongside ratings
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.series(seriesId),
      });
    },
  });
}

/**
 * Get CBR match status for a series
 */
export function useCbrMatchStatus(seriesId: string | undefined) {
  return useQuery({
    queryKey: ['cbrMatchStatus', seriesId],
    queryFn: () => getCbrMatchStatus(seriesId!),
    enabled: !!seriesId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Reset CBR match for a series
 */
export function useResetCbrMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      seriesId,
      reSearch,
    }: {
      seriesId: string;
      reSearch: boolean;
    }) => resetCbrMatch(seriesId, reSearch),
    onSuccess: (_data, { seriesId }) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.series(seriesId),
      });
      queryClient.invalidateQueries({
        queryKey: ['cbrMatchStatus', seriesId],
      });
    },
  });
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
  CBRValidationResult,
  CBRMatchResult,
  CBRMatchStatus,
  CBRMatchPreview,
  CBRResetResult,
} from '../../services/api/external-ratings';
