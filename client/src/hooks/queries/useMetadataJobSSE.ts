/**
 * Metadata Job SSE Hook
 *
 * SSE integration for metadata approval jobs.
 * Wraps useJobSSE with metadata-specific configuration.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useJobSSE } from '../useJobSSE';
import { queryKeys } from '../../lib/queryClient';
import type {
  JobProgressEvent,
  JobCompleteEvent,
  JobStatusEvent,
  JobErrorEvent,
  JobLogEvent,
} from '../../types/sse-events';

// =============================================================================
// Hook
// =============================================================================

/**
 * Connect to SSE stream for a metadata job.
 * Automatically updates React Query cache when events are received.
 *
 * @param jobId - Metadata job ID
 * @param enabled - Whether to enable SSE connection (default: true if jobId exists)
 * @returns SSE connection status and controls
 *
 * @example
 * ```typescript
 * const { connected } = useMetadataJobSSE(jobId);
 * ```
 */
export function useMetadataJobSSE(
  jobId: string | undefined,
  enabled: boolean = true
) {
  const queryClient = useQueryClient();

  return useJobSSE({
    endpoint: `/api/metadata-jobs/${jobId}/stream`,
    enabled: !!jobId && enabled,

    // Progress events - invalidate job query
    onProgress: (_data: JobProgressEvent) => {
      // Metadata jobs don't have a specific job query in queryKeys
      // They're fetched directly via getMetadataJob API call in the context
      // So we don't need to invalidate here - the context polling will pick it up
    },

    // Status change events - trigger refetch
    onStatus: (_data: JobStatusEvent) => {
      // Similar to progress - context polling handles this
    },

    // Log events - trigger refetch to get new logs
    onLog: (_data: JobLogEvent) => {
      // Context polling will fetch updated logs
    },

    // Completion events - invalidate metadata-related queries
    onComplete: (_data: JobCompleteEvent) => {
      // Invalidate files and series queries since metadata has changed
      queryClient.invalidateQueries({
        queryKey: queryKeys.files.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.series.all,
      });
    },

    // Error events - context polling will pick up error state
    onError: (_data: JobErrorEvent) => {
      // Context polling handles error display
    },

    // Polling fallback - not needed for metadata jobs
    // The context already has its own polling mechanism
    fallbackPoll: undefined,

    // No fallback interval since context handles polling
    fallbackInterval: 0,
  });
}
