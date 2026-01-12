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
// Types
// =============================================================================

/**
 * Callbacks for handling SSE events in the MetadataJobContext.
 * These allow the context to update its state when SSE events are received.
 */
export interface MetadataJobSSECallbacks {
  /** Called when a status change event is received */
  onStatusChange?: (data: { status: string }) => void;
  /** Called when a progress event is received */
  onProgressChange?: (data: { message?: string; detail?: string }) => void;
  /** Called when a log event is received */
  onLogReceived?: (data: { step: string; message: string; detail?: string; type: string }) => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Connect to SSE stream for a metadata job.
 * Automatically updates React Query cache when events are received.
 *
 * @param jobId - Metadata job ID
 * @param enabled - Whether to enable SSE connection (default: true if jobId exists)
 * @param callbacks - Optional callbacks to receive SSE events for state updates
 * @returns SSE connection status and controls
 *
 * @example
 * ```typescript
 * const { connected } = useMetadataJobSSE(jobId, true, {
 *   onStatusChange: (data) => setStep(data.status),
 *   onProgressChange: (data) => setProgress(data),
 * });
 * ```
 */
export function useMetadataJobSSE(
  jobId: string | undefined,
  enabled: boolean = true,
  callbacks?: MetadataJobSSECallbacks
) {
  const queryClient = useQueryClient();

  return useJobSSE({
    endpoint: `/api/metadata-jobs/${jobId}/stream`,
    enabled: !!jobId && enabled,

    // Progress events - call callback for context state update
    onProgress: (data: JobProgressEvent) => {
      callbacks?.onProgressChange?.({
        message: data.message,
        detail: data.detail,
      });
    },

    // Status change events - call callback for context state update
    onStatus: (data: JobStatusEvent) => {
      callbacks?.onStatusChange?.({
        status: data.status,
      });
    },

    // Log events - call callback for context state update
    onLog: (data: JobLogEvent) => {
      callbacks?.onLogReceived?.({
        step: data.step,
        message: data.message,
        detail: data.detail,
        type: data.type,
      });
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
