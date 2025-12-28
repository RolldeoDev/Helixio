/**
 * useUserData Hook
 *
 * React Query hooks for user ratings and reviews management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  getSeriesUserData,
  updateSeriesUserData,
  deleteSeriesUserData,
  getSeriesAverageRating,
  getSeriesPublicReviews,
  getIssueUserData,
  updateIssueUserData,
  deleteIssueUserData,
  getIssuePublicReviews,
  getSeriesUserDataBatch,
  getIssuesUserDataBatch,
  migrateLocalStorageNotes,
  type UpdateUserDataInput,
  type LocalStorageNote,
} from '../../services/api/user-data';

// =============================================================================
// Series User Data Hooks
// =============================================================================

/**
 * Fetch user's data for a series (rating, notes, review, computed average)
 */
export function useSeriesUserData(seriesId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.userData.series(seriesId!),
    queryFn: () => getSeriesUserData(seriesId!),
    enabled: !!seriesId,
  });
}

/**
 * Update user's data for a series
 */
export function useUpdateSeriesUserData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      seriesId,
      input,
    }: {
      seriesId: string;
      input: UpdateUserDataInput;
    }) => updateSeriesUserData(seriesId, input),
    onSuccess: (data, { seriesId }) => {
      // Update the cache with new data
      queryClient.setQueryData(queryKeys.userData.series(seriesId), data);
      // Also invalidate series detail to refresh any related data
      queryClient.invalidateQueries({ queryKey: queryKeys.series.detail(seriesId) });
    },
  });
}

/**
 * Delete user's data for a series
 */
export function useDeleteSeriesUserData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (seriesId: string) => deleteSeriesUserData(seriesId),
    onSuccess: (_, seriesId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userData.series(seriesId) });
    },
  });
}

/**
 * Fetch average rating for a series from its issues
 */
export function useSeriesAverageRating(seriesId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.userData.series(seriesId!), 'average'] as const,
    queryFn: () => getSeriesAverageRating(seriesId!),
    enabled: !!seriesId,
  });
}

/**
 * Fetch public reviews for a series
 */
export function useSeriesPublicReviews(seriesId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.userData.series(seriesId!), 'reviews'] as const,
    queryFn: () => getSeriesPublicReviews(seriesId!),
    enabled: !!seriesId,
  });
}

// =============================================================================
// Issue User Data Hooks
// =============================================================================

/**
 * Fetch user's data for an issue (rating, notes, review)
 */
export function useIssueUserData(fileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.userData.issue(fileId!),
    queryFn: () => getIssueUserData(fileId!),
    enabled: !!fileId,
  });
}

/**
 * Update user's data for an issue
 */
export function useUpdateIssueUserData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fileId,
      input,
    }: {
      fileId: string;
      input: UpdateUserDataInput;
    }) => updateIssueUserData(fileId, input),
    onSuccess: (data, { fileId }) => {
      // Update the cache with new data
      queryClient.setQueryData(queryKeys.userData.issue(fileId), data);
      // Also invalidate file detail to refresh any related data
      queryClient.invalidateQueries({ queryKey: queryKeys.files.detail(fileId) });
      // Invalidate reading progress as rating might affect it
      queryClient.invalidateQueries({ queryKey: queryKeys.reading.progress(fileId) });
    },
  });
}

/**
 * Delete user's rating/review for an issue
 */
export function useDeleteIssueUserData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => deleteIssueUserData(fileId),
    onSuccess: (_, fileId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userData.issue(fileId) });
    },
  });
}

/**
 * Fetch public reviews for an issue
 */
export function useIssuePublicReviews(fileId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.userData.issue(fileId!), 'reviews'] as const,
    queryFn: () => getIssuePublicReviews(fileId!),
    enabled: !!fileId,
  });
}

// =============================================================================
// Batch Hooks
// =============================================================================

/**
 * Fetch user data for multiple series at once (for grid views)
 */
export function useSeriesUserDataBatch(seriesIds: string[]) {
  return useQuery({
    queryKey: queryKeys.userData.seriesBatch(seriesIds),
    queryFn: () => getSeriesUserDataBatch(seriesIds),
    enabled: seriesIds.length > 0,
  });
}

/**
 * Fetch user data for multiple issues at once (for grid views)
 */
export function useIssuesUserDataBatch(fileIds: string[]) {
  return useQuery({
    queryKey: queryKeys.userData.issuesBatch(fileIds),
    queryFn: () => getIssuesUserDataBatch(fileIds),
    enabled: fileIds.length > 0,
  });
}

// =============================================================================
// Migration Hook
// =============================================================================

/**
 * Migrate localStorage notes to database
 */
export function useMigrateNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notes: LocalStorageNote[]) => migrateLocalStorageNotes(notes),
    onSuccess: () => {
      // Invalidate all user data queries
      queryClient.invalidateQueries({ queryKey: queryKeys.userData.all });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Invalidate all user data queries
 */
export function useInvalidateUserData() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.userData.all });
  };
}

// Re-export types
export type {
  UpdateUserDataInput,
  LocalStorageNote,
} from '../../services/api/user-data';
