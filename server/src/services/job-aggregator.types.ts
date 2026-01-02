/**
 * Unified Job Types
 *
 * Common types for the job aggregator service.
 */

// =============================================================================
// Unified Job Types
// =============================================================================

export type UnifiedJobType =
  | 'metadata'
  | 'library-scan'
  | 'rating-sync'
  | 'review-sync'
  | 'similarity'
  | 'download';

export type UnifiedJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface UnifiedJob {
  id: string;
  type: UnifiedJobType;
  status: UnifiedJobStatus;
  title: string;
  subtitle?: string;
  progress?: number; // 0-100, undefined if indeterminate
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  canCancel: boolean;
  canRetry: boolean;
  /** Original job data for type-specific handling */
  _raw?: unknown;
}

// =============================================================================
// Scheduler Types
// =============================================================================

export interface SchedulerStatus {
  id: string;
  name: string;
  enabled: boolean;
  isRunning: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

// =============================================================================
// Aggregated Response
// =============================================================================

export interface AggregatedJobsResponse {
  active: UnifiedJob[];
  history: UnifiedJob[];
  schedulers: SchedulerStatus[];
  counts: {
    active: number;
    queued: number;
    running: number;
  };
}

// =============================================================================
// Job Details Types
// =============================================================================

export type UnifiedLogType = 'info' | 'success' | 'warning' | 'error';

export interface UnifiedJobLog {
  id: string;
  stage: string;
  message: string;
  detail?: string;
  type: UnifiedLogType;
  timestamp: Date;
}

export interface UnifiedJobDetails extends UnifiedJob {
  logs: UnifiedJobLog[];
}