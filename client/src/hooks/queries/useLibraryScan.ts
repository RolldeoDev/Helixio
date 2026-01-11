/**
 * useLibraryScan Hook
 *
 * React Query hooks for library scan jobs with adaptive polling.
 *
 * Polling Strategy:
 * - Active scans: 3s intervals (balances responsiveness with DB load)
 * - Queued/waiting: 5s intervals
 * - Terminal states: no polling
 *
 * SSE provides real-time updates for immediate feedback; polling is backup.
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

/** Polling interval during active scan stages (ms) */
const ACTIVE_POLL_INTERVAL = 3000;

/** Polling interval during waiting/queued states (ms) */
const IDLE_POLL_INTERVAL = 5000;

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch scan job status with adaptive polling
 *
 * Polls at 3s during active stages, 5s during waiting stages.
 * Stops polling when job reaches a terminal state.
 * SSE provides real-time updates; polling is backup for reliability.
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

      // Active stages: 3s polling (SSE handles real-time, this is backup)
      if (ACTIVE_STATES.includes(job.status)) return ACTIVE_POLL_INTERVAL;

      // Waiting/queued states: 5s polling
      return IDLE_POLL_INTERVAL;
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
      // Poll while there's an active scan (3s to reduce DB load)
      if (query.state.data?.hasActiveScan) {
        return ACTIVE_POLL_INTERVAL;
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
      // Poll if there are any active scans (3s to reduce DB load)
      if ((query.state.data?.length ?? 0) > 0) {
        return ACTIVE_POLL_INTERVAL;
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
