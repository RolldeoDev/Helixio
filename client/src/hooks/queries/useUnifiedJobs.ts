/**
 * useUnifiedJobs Hook
 *
 * React Query hooks for the unified jobs panel.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getJobs,
  getActiveJobCount,
  cancelJob,
  getJobDetails,
  type GetJobsOptions,
  type UnifiedJobType,
} from '../../services/api/jobs';
import { useUnifiedJobsSSE } from '../../contexts/UnifiedJobsSSEContext';

// =============================================================================
// Query Keys
// =============================================================================

export const unifiedJobsKeys = {
  all: ['unified-jobs'] as const,
  list: (options?: GetJobsOptions) => [...unifiedJobsKeys.all, 'list', options] as const,
  count: () => [...unifiedJobsKeys.all, 'count'] as const,
  detail: (type: UnifiedJobType | null, id: string | null) =>
    [...unifiedJobsKeys.all, 'detail', type, id] as const,
};

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch aggregated jobs with adaptive polling.
 * Uses SSE for real-time updates when connected, falls back to polling when disconnected.
 */
export function useUnifiedJobs(options: GetJobsOptions = {}) {
  // Connect to SSE for real-time updates (shared connection)
  const { connected } = useUnifiedJobsSSE();

  return useQuery({
    queryKey: unifiedJobsKeys.list(options),
    queryFn: () => getJobs(options),
    refetchInterval: (query) => {
      // If SSE connected, poll slowly as fallback (60s)
      if (connected) {
        return 60000;
      }

      // If SSE disconnected, use aggressive polling
      const data = query.state.data;
      if (data && data.counts.active > 0) {
        return 2000; // 2s when active jobs
      }
      return 30000; // 30s when idle
    },
    staleTime: 1000,
  });
}

/**
 * Get active job count (for sidebar badge).
 * Uses SSE for real-time updates when connected.
 */
export function useActiveJobCount() {
  // Use shared SSE connection
  const { connected } = useUnifiedJobsSSE();

  return useQuery({
    queryKey: unifiedJobsKeys.count(),
    queryFn: getActiveJobCount,
    // Reduce polling when SSE connected
    refetchInterval: connected ? 60000 : 5000,
    staleTime: 2000,
  });
}

/**
 * Fetch job details with logs
 * Polls every 2s for active jobs
 */
export function useJobDetails(type: UnifiedJobType | null, id: string | null) {
  return useQuery({
    queryKey: unifiedJobsKeys.detail(type, id),
    queryFn: () => getJobDetails(type!, id!),
    enabled: !!type && !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === 'queued' || data.status === 'running')) {
        return 2000;
      }
      return false;
    },
    staleTime: 1000,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Cancel a job
 */
export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, id }: { type: UnifiedJobType; id: string }) =>
      cancelJob(type, id),
    onSuccess: () => {
      // Invalidate all job queries
      queryClient.invalidateQueries({ queryKey: unifiedJobsKeys.all });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Invalidate all unified jobs queries
 */
export function useInvalidateUnifiedJobs() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: unifiedJobsKeys.all });
  };
}
