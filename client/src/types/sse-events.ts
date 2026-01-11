/**
 * SSE Event Type Definitions
 *
 * Strongly-typed event payloads for Server-Sent Events.
 * Matches server-side event structure from sse.service.ts.
 */

// =============================================================================
// Base Event Structure
// =============================================================================

/**
 * Base SSE event structure sent by the server
 */
export interface SSEEvent<T = unknown> {
  type: string;
  data: T;
}

// =============================================================================
// Job-Specific Events (Generic across all job types)
// =============================================================================

/**
 * Job progress update event
 * Emitted during active job processing
 */
export interface JobProgressEvent {
  jobId: string;
  status: string;
  current: number;
  total: number;
  message?: string;
  detail?: string;
  timestamp: number;
}

/**
 * Job status change event
 * Emitted when job transitions between states
 */
export interface JobStatusEvent {
  jobId: string;
  status: string;
  timestamp: number;
  [key: string]: unknown; // Allow additional status-specific data
}

/**
 * Job completion event
 * Emitted when job finishes successfully
 */
export interface JobCompleteEvent {
  jobId: string;
  result: unknown;
  timestamp: number;
}

/**
 * Job error event
 * Emitted when job encounters an error
 */
export interface JobErrorEvent {
  jobId: string;
  error: string;
  timestamp: number;
}

/**
 * Job log entry event
 * Emitted for detailed step-by-step logging
 */
export interface JobLogEvent {
  jobId: string;
  step: string;
  message: string;
  detail?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

/**
 * Connection established event
 * Sent immediately after SSE connection opens
 */
export interface ConnectedEvent {
  clientId: string;
  jobId?: string;
  timestamp: number;
}

/**
 * Ping/keepalive event
 * Sent every 30 seconds to maintain connection
 */
export interface PingEvent {
  timestamp: number;
}

// =============================================================================
// Metadata Job Specific Events
// =============================================================================

/**
 * Metadata job progress event
 * Extends base progress with metadata-specific fields
 */
export interface MetadataJobProgressEvent extends JobProgressEvent {
  phase?: 'initializing' | 'series_approval' | 'fetching_issues' | 'file_review' | 'applying';
  seriesProcessed?: number;
  filesProcessed?: number;
  currentSeries?: string;
}

/**
 * Metadata job status event
 * Contains full job state for metadata jobs
 */
export interface MetadataJobStatusEvent extends JobStatusEvent {
  job?: {
    id: string;
    status: string;
    step: string;
    currentProgressMessage?: string;
    currentProgressDetail?: string;
    error?: string;
    session?: unknown;
  };
}

// =============================================================================
// Rating Sync Specific Events
// =============================================================================

/**
 * Rating sync progress event
 * Extends base progress with rating-specific fields
 */
export interface RatingSyncProgressEvent extends JobProgressEvent {
  processedItems?: number;
  successItems?: number;
  failedItems?: number;
  unmatchedItems?: number;
  currentSeries?: string;
}

/**
 * Rating sync completion event
 */
export interface RatingSyncCompleteEvent extends JobCompleteEvent {
  result: {
    totalItems: number;
    processedItems: number;
    successItems: number;
    failedItems: number;
    unmatchedItems: number;
    errors?: string[];
    unmatchedSeries?: Array<{ id: string; name: string }>;
  };
}

// =============================================================================
// Review Sync Specific Events
// =============================================================================

/**
 * Review sync progress event
 * Extends base progress with review-specific fields
 */
export interface ReviewSyncProgressEvent extends JobProgressEvent {
  processedItems?: number;
  successItems?: number;
  failedItems?: number;
  unmatchedItems?: number;
  currentSeries?: string;
  reviewsAdded?: number;
}

/**
 * Review sync completion event
 */
export interface ReviewSyncCompleteEvent extends JobCompleteEvent {
  result: {
    totalItems: number;
    processedItems: number;
    successItems: number;
    failedItems: number;
    unmatchedItems: number;
    totalReviews: number;
    errors?: Array<{
      seriesId: string;
      seriesName: string;
      source: string;
      error: string;
    }>;
  };
}

// =============================================================================
// Event Type Guards
// =============================================================================

/**
 * Type guard to check if event is a progress event
 */
export function isProgressEvent(event: unknown): event is JobProgressEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'jobId' in event &&
    'current' in event &&
    'total' in event
  );
}

/**
 * Type guard to check if event is a status event
 */
export function isStatusEvent(event: unknown): event is JobStatusEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'jobId' in event &&
    'status' in event &&
    !('current' in event) // Distinguish from progress
  );
}

/**
 * Type guard to check if event is a complete event
 */
export function isCompleteEvent(event: unknown): event is JobCompleteEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'jobId' in event &&
    'result' in event
  );
}

/**
 * Type guard to check if event is an error event
 */
export function isErrorEvent(event: unknown): event is JobErrorEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'jobId' in event &&
    'error' in event &&
    typeof (event as JobErrorEvent).error === 'string'
  );
}

/**
 * Type guard to check if event is a log event
 */
export function isLogEvent(event: unknown): event is JobLogEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'jobId' in event &&
    'step' in event &&
    'message' in event &&
    'type' in event
  );
}
