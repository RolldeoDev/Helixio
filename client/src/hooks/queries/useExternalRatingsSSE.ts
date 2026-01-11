/**
 * External Ratings SSE Hook
 *
 * SSE integration for external rating sync jobs.
 * Wraps useJobSSE with ratings-specific configuration.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useJobSSE } from '../useJobSSE';
import { queryKeys } from '../../lib/queryClient';
import type {
  JobProgressEvent,
  JobCompleteEvent,
  JobStatusEvent,
  JobErrorEvent,
} from '../../types/sse-events';

// =============================================================================
// Hook
// =============================================================================

/**
 * Connect to SSE stream for a rating sync job.
 * Automatically updates React Query cache when events are received.
 *
 * @param jobId - Rating sync job ID
 * @param enabled - Whether to enable SSE connection (default: true if jobId exists)
 * @returns SSE connection status and controls
 *
 * @example
 * ```typescript
 * const { connected } = useRatingSyncJobSSE(jobId);
 * ```
 */
export function useRatingSyncJobSSE(
  jobId: string | undefined,
  enabled: boolean = true
) {
  const queryClient = useQueryClient();

  return useJobSSE({
    endpoint: `/api/external-ratings/jobs/${jobId}/stream`,
    enabled: !!jobId && enabled,

    // Progress events - invalidate job status query
    onProgress: (_data: JobProgressEvent) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.job(jobId!),
      });
    },

    // Status change events - invalidate both job and jobs list
    onStatus: (_data: JobStatusEvent) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.job(jobId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.jobs(),
      });
    },

    // Completion events - invalidate all related queries
    onComplete: (_data: JobCompleteEvent) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.job(jobId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.jobs(),
      });
      // Also invalidate series ratings since they may have changed
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.all,
      });
    },

    // Error events - invalidate job status
    onError: (_data: JobErrorEvent) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.job(jobId!),
      });
    },

    // Polling fallback - refetch job status if SSE disconnects
    fallbackPoll: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalRatings.job(jobId!),
      });
    },

    // Poll every 5 seconds as fallback
    fallbackInterval: 5000,
  });
}
