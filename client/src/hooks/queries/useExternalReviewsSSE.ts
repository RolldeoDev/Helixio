/**
 * External Reviews SSE Hook
 *
 * SSE integration for external review sync jobs.
 * Wraps useJobSSE with reviews-specific configuration.
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
 * Connect to SSE stream for a review sync job.
 * Automatically updates React Query cache when events are received.
 *
 * @param jobId - Review sync job ID
 * @param enabled - Whether to enable SSE connection (default: true if jobId exists)
 * @returns SSE connection status and controls
 *
 * @example
 * ```typescript
 * const { connected } = useReviewSyncJobSSE(jobId);
 * ```
 */
export function useReviewSyncJobSSE(
  jobId: string | undefined,
  enabled: boolean = true
) {
  const queryClient = useQueryClient();

  return useJobSSE({
    endpoint: `/api/external-reviews/jobs/${jobId}/stream`,
    enabled: !!jobId && enabled,

    // Progress events - invalidate job status query
    onProgress: (_data: JobProgressEvent) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.job(jobId!),
      });
    },

    // Status change events - invalidate both job and jobs list
    onStatus: (_data: JobStatusEvent) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.job(jobId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.jobs(),
      });
    },

    // Completion events - invalidate all related queries
    onComplete: (_data: JobCompleteEvent) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.job(jobId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.jobs(),
      });
      // Also invalidate series reviews since they may have changed
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.all,
      });
    },

    // Error events - invalidate job status
    onError: (_data: JobErrorEvent) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.job(jobId!),
      });
    },

    // Polling fallback - refetch job status if SSE disconnects
    fallbackPoll: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.externalReviews.job(jobId!),
      });
    },

    // Poll every 5 seconds as fallback
    fallbackInterval: 5000,
  });
}
