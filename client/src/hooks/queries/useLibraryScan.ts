/**
 * useLibraryScan Hook
 *
 * React Query hooks for library scan jobs with adaptive polling.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  startLibraryScan,
  getScanJobStatus,
  getActiveScanForLibrary,
  getScanHistory,
  cancelScanJob,
  deleteScanJob,
  getAllActiveScans,
} from '../../services/api/series';
import type { LibraryScanJob, ScanJobStatus } from '../../services/api/series';

// =============================================================================
// Constants
// =============================================================================

const TERMINAL_STATES: ScanJobStatus[] = ['complete', 'error', 'cancelled'];
const ACTIVE_STATES: ScanJobStatus[] = ['discovering', 'cleaning', 'indexing', 'linking', 'covers'];

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch scan job status with adaptive polling
 *
 * Polls faster (1s) during active stages, slower (5s) during waiting stages.
 * Stops polling when job reaches a terminal state.
 */
export function useScanJob(libraryId: string, jobId: string | null) {
  return useQuery({
    queryKey: queryKeys.libraryScans.detail(libraryId, jobId!),
    queryFn: () => getScanJobStatus(libraryId, jobId!),
    enabled: !!jobId,
    // Adaptive polling based on job status
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      if (!job) return false;

      // Stop polling for terminal states
      if (TERMINAL_STATES.includes(job.status)) return false;

      // Fast polling during active work
      if (ACTIVE_STATES.includes(job.status)) return 1000;

      // Slower polling during other states
      return 5000;
    },
    staleTime: 0, // Always fetch fresh during active scan
  });
}

/**
 * Check if a library has an active scan
 */
export function useActiveScan(libraryId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.libraryScans.active(libraryId!),
    queryFn: () => getActiveScanForLibrary(libraryId!),
    enabled: !!libraryId,
    refetchInterval: (query) => {
      // Poll while there's an active scan
      if (query.state.data?.hasActiveScan) {
        return 2000;
      }
      return false;
    },
  });
}

/**
 * Get all currently active scans across all libraries
 */
export function useAllActiveScans() {
  return useQuery({
    queryKey: queryKeys.libraryScans.list(),
    queryFn: async () => {
      const response = await getAllActiveScans();
      return response.jobs;
    },
    refetchInterval: (query) => {
      // Poll if there are any active scans
      if ((query.state.data?.length ?? 0) > 0) {
        return 2000;
      }
      return false;
    },
  });
}

/**
 * Get scan history for a library
 */
export function useScanHistory(libraryId: string | null | undefined, limit = 10) {
  return useQuery({
    queryKey: ['libraryScans', 'history', libraryId, limit] as const,
    queryFn: () => getScanHistory(libraryId!, limit),
    enabled: !!libraryId,
    staleTime: 30 * 1000,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Start a library scan
 */
export function useStartScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startLibraryScan,
    onSuccess: (_, libraryId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.libraryScans.active(libraryId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.libraryScans.list(),
      });
    },
  });
}

/**
 * Cancel an active scan
 */
export function useCancelScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ libraryId, jobId }: { libraryId: string; jobId: string }) =>
      cancelScanJob(libraryId, jobId),
    onSuccess: (_, { libraryId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.libraryScans.active(libraryId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.libraryScans.list(),
      });
    },
  });
}

/**
 * Delete a completed scan job
 */
export function useDeleteScanJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ libraryId, jobId }: { libraryId: string; jobId: string }) =>
      deleteScanJob(libraryId, jobId),
    onSuccess: (_, { libraryId }) => {
      queryClient.invalidateQueries({
        queryKey: ['libraryScans', 'history', libraryId],
      });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Invalidate all scan-related queries for a library
 */
export function useInvalidateLibraryScans() {
  const queryClient = useQueryClient();

  return (libraryId?: string) => {
    if (libraryId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.libraryScans.active(libraryId),
      });
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.libraryScans.all });
  };
}

// Re-export types for convenience
export type { LibraryScanJob, ScanJobStatus as LibraryScanJobStatus };
