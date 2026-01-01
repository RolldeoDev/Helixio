/**
 * useExternalReviews Hook
 *
 * React Query hooks for external review management.
 * Handles fetching reviews from AniList, MAL, and Comic Book Roundup.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  getSeriesReviews,
  syncSeriesReviews,
  deleteSeriesReviews,
  getIssueReviews,
  syncIssueReviews,
  deleteIssueReviews,
  syncLibraryReviews,
  getReviewSyncJobs,
  getReviewSyncJobStatus,
  cancelReviewSyncJob,
  getReviewSources,
  type SeriesReviewsResponse,
  type IssueReviewsResponse,
  type ReviewSyncResult,
  type IssueSyncResult,
  type ReviewSyncOptions,
  type ReviewSyncJobStatus,
  type ReviewSourceStatus,
  type ExternalReview,
  type UserReview,
  type ReviewSource,
} from '../../services/api/external-reviews';

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch all reviews (external + user) for a series
 */
export function useSeriesReviews(
  seriesId: string | undefined,
  options: {
    source?: ReviewSource;
    limit?: number;
    skipSpoilers?: boolean;
    includeUserReviews?: boolean;
  } = {}
) {
  // Destructure options with defaults to ensure stable queryKey identity
  const { source, limit, skipSpoilers = false, includeUserReviews = false } = options;

  return useQuery({
    queryKey: [
      ...queryKeys.externalReviews.series(seriesId!),
      { source, limit, skipSpoilers, includeUserReviews },
    ] as const,
    queryFn: () => getSeriesReviews(seriesId!, { source, limit, skipSpoilers, includeUserReviews }),
    enabled: !!seriesId,
    staleTime: 5 * 60 * 1000, // Reviews are semi-static, 5 min stale time
  });
}

/**
 * Fetch all reviews (external + user) for an issue
 */
export function useIssueReviews(
  fileId: string | undefined,
  options: {
    source?: ReviewSource;
    limit?: number;
    skipSpoilers?: boolean;
    includeUserReviews?: boolean;
  } = {}
) {
  // Destructure options with defaults to ensure stable queryKey identity
  const { source, limit, skipSpoilers = false, includeUserReviews = false } = options;

  return useQuery({
    queryKey: [
      ...queryKeys.externalReviews.issue(fileId!),
      { source, limit, skipSpoilers, includeUserReviews },
    ] as const,
    queryFn: () => getIssueReviews(fileId!, { source, limit, skipSpoilers, includeUserReviews }),
    enabled: !!fileId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get available review sources and their status
 */
export function useReviewSources() {
  return useQuery({
    queryKey: queryKeys.externalReviews.sources(),
    queryFn: async () => {
      const response = await getReviewSources();
      return response.sources;
    },
    staleTime: 10 * 60 * 1000, // Sources rarely change
  });
}

/**
 * Get list of recent review sync jobs
 */
export function useReviewSyncJobs(status?: string) {
  return useQuery({
    queryKey: queryKeys.externalReviews.jobs(status),
    queryFn: async () => {
      const response = await getReviewSyncJobs({ status });
      return response.jobs;
    },
    refetchInterval: (query) => {
      // Auto-refresh every 5s if there are running jobs
      const jobs = query.state.data;
      if (jobs?.some((j: ReviewSyncJobStatus) => j.status === 'running' || j.status === 'pending')) {
        return 5000;
      }
      return false;
    },
  });
}

/**
 * Get status of a specific review sync job
 */
export function useReviewSyncJobStatus(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.externalReviews.job(jobId!),
    queryFn: () => getReviewSyncJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'running' || status === 'pending') {
        return 2000; // More frequent updates for active jobs
      }
      return false;
    },
  });
}

/**
 * Check if a series has any external reviews
 */
export function useHasExternalReviews(seriesId: string | undefined) {
  const { data, isLoading } = useSeriesReviews(seriesId, {
    limit: 1,
    includeUserReviews: false,
  });

  return {
    hasReviews: (data?.counts?.external ?? 0) > 0,
    isLoading,
  };
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Sync external reviews for a series
 */
export function useSyncSeriesReviews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      seriesId,
      options = {},
    }: {
      seriesId: string;
      options?: ReviewSyncOptions;
    }) => syncSeriesReviews(seriesId, options),
    onSuccess: (_result, { seriesId }) => {
      // Invalidate the series reviews query
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.series(seriesId),
      });
    },
  });
}

/**
 * Delete all external reviews for a series
 */
export function useDeleteSeriesReviews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (seriesId: string) => deleteSeriesReviews(seriesId),
    onSuccess: (_, seriesId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.series(seriesId),
      });
    },
  });
}

/**
 * Sync external reviews for an issue
 */
export function useSyncIssueReviews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fileId,
      options = {},
    }: {
      fileId: string;
      options?: {
        forceRefresh?: boolean;
        reviewLimit?: number;
        skipSpoilers?: boolean;
      };
    }) => syncIssueReviews(fileId, options),
    onSuccess: (_result, { fileId }) => {
      // Invalidate the issue reviews query
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.issue(fileId),
      });
    },
  });
}

/**
 * Delete all external reviews for an issue
 */
export function useDeleteIssueReviews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => deleteIssueReviews(fileId),
    onSuccess: (_, fileId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.issue(fileId),
      });
    },
  });
}

/**
 * Queue a library-wide review sync job
 */
export function useSyncLibraryReviews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      libraryId,
      options = {},
    }: {
      libraryId: string;
      options?: ReviewSyncOptions;
    }) => syncLibraryReviews(libraryId, options),
    onSuccess: () => {
      // Invalidate jobs list to show new job
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.jobs(),
      });
    },
  });
}

/**
 * Cancel a running review sync job
 */
export function useCancelReviewSyncJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => cancelReviewSyncJob(jobId),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.job(jobId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.jobs(),
      });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Invalidate all external review-related queries
 */
export function useInvalidateExternalReviews() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.externalReviews.all });
  };
}

// =============================================================================
// Re-export Types
// =============================================================================

export type {
  SeriesReviewsResponse,
  IssueReviewsResponse,
  ReviewSyncResult,
  IssueSyncResult,
  ReviewSyncOptions,
  ReviewSyncJobStatus,
  ReviewSourceStatus,
  ExternalReview,
  UserReview,
  ReviewSource,
};
