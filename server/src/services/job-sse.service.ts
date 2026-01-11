/**
 * Job SSE Service
 *
 * Generic job progress broadcasting utilities.
 * Builds on existing sse.service patterns with convenient wrappers.
 */

import {
  sendJobProgress,
  sendJobStatusChange,
  sendJobComplete,
  sendJobError,
  sendJobLog,
} from './sse.service.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Job progress update data
 */
export interface JobProgressUpdate {
  current: number;
  total: number;
  message?: string;
  detail?: string;
}

/**
 * Job log entry
 */
export interface JobLogEntry {
  step: string;
  message: string;
  detail?: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

// =============================================================================
// Progress Broadcasting
// =============================================================================

/**
 * Broadcast job progress update to all connected clients
 *
 * @param jobId - Job identifier
 * @param progress - Progress data (current, total, message, detail)
 * @param status - Job status (default: 'processing')
 * @returns Number of clients that received the update
 */
export function broadcastJobProgress(
  jobId: string,
  progress: JobProgressUpdate,
  status: string = 'processing'
): number {
  return sendJobProgress(jobId, status, progress);
}

/**
 * Broadcast job status change to all connected clients
 *
 * @param jobId - Job identifier
 * @param status - New job status
 * @param data - Additional status-specific data
 * @returns Number of clients that received the update
 */
export function broadcastJobStatus(
  jobId: string,
  status: string,
  data?: unknown
): number {
  return sendJobStatusChange(jobId, status, data);
}

/**
 * Broadcast job completion to all connected clients
 *
 * @param jobId - Job identifier
 * @param result - Job result data
 * @returns Number of clients that received the update
 */
export function broadcastJobComplete(jobId: string, result: unknown): number {
  return sendJobComplete(jobId, result);
}

/**
 * Broadcast job error to all connected clients
 *
 * @param jobId - Job identifier
 * @param error - Error message or error object
 * @returns Number of clients that received the update
 */
export function broadcastJobError(jobId: string, error: string | Error): number {
  const errorMessage = error instanceof Error ? error.message : error;
  return sendJobError(jobId, errorMessage);
}

/**
 * Broadcast job log entry to all connected clients
 *
 * @param jobId - Job identifier
 * @param log - Log entry data
 * @returns Number of clients that received the update
 */
export function broadcastJobLog(jobId: string, log: JobLogEntry): number {
  return sendJobLog(jobId, log);
}

// =============================================================================
// Convenience Wrappers
// =============================================================================

/**
 * Broadcast job start to all connected clients
 * Convenience wrapper for status change to 'processing'
 *
 * @param jobId - Job identifier
 * @param data - Additional start data
 * @returns Number of clients that received the update
 */
export function broadcastJobStart(jobId: string, data?: unknown): number {
  return broadcastJobStatus(jobId, 'processing', data);
}

/**
 * Broadcast job cancellation to all connected clients
 * Convenience wrapper for status change to 'cancelled'
 *
 * @param jobId - Job identifier
 * @param data - Additional cancellation data
 * @returns Number of clients that received the update
 */
export function broadcastJobCancelled(jobId: string, data?: unknown): number {
  return broadcastJobStatus(jobId, 'cancelled', data);
}

/**
 * Create a progress callback function for use with async operations
 *
 * Returns a callback that broadcasts progress updates via SSE.
 * Useful for passing to operations that support progress callbacks.
 *
 * @param jobId - Job identifier
 * @param status - Job status (default: 'processing')
 * @returns Progress callback function
 *
 * @example
 * ```typescript
 * const onProgress = createProgressCallback(jobId);
 * await processItems(items, onProgress);
 * ```
 */
export function createProgressCallback(
  jobId: string,
  status: string = 'processing'
): (message: string, detail?: string, current?: number, total?: number) => void {
  return (message: string, detail?: string, current?: number, total?: number) => {
    broadcastJobProgress(
      jobId,
      {
        current: current ?? 0,
        total: total ?? 0,
        message,
        detail,
      },
      status
    );
  };
}

/**
 * Create a log callback function for use with async operations
 *
 * Returns a callback that broadcasts log entries via SSE.
 * Useful for detailed step-by-step progress tracking.
 *
 * @param jobId - Job identifier
 * @returns Log callback function
 *
 * @example
 * ```typescript
 * const log = createLogCallback(jobId);
 * log.info('fetching', 'Fetching metadata');
 * log.success('fetching', 'Metadata fetched successfully');
 * log.error('applying', 'Failed to apply changes', 'Permission denied');
 * ```
 */
export function createLogCallback(jobId: string) {
  return {
    info: (step: string, message: string, detail?: string) => {
      broadcastJobLog(jobId, { step, message, detail, type: 'info' });
    },
    success: (step: string, message: string, detail?: string) => {
      broadcastJobLog(jobId, { step, message, detail, type: 'success' });
    },
    warning: (step: string, message: string, detail?: string) => {
      broadcastJobLog(jobId, { step, message, detail, type: 'warning' });
    },
    error: (step: string, message: string, detail?: string) => {
      broadcastJobLog(jobId, { step, message, detail, type: 'error' });
    },
  };
}
