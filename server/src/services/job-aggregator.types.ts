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
  | 'download'
  | 'batch';

export type UnifiedJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

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
  // Batch-specific fields
  batchType?: 'convert' | 'rename' | 'move' | 'delete' | 'metadata_update' | 'template_rename' | 'restore_original';
  stats?: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
  // Library-scan specific fields (for SSE enrichment on client)
  libraryId?: string;
  // Library-scan stats (included directly so they display even without SSE context)
  scanStats?: {
    indexedFiles: number;
    totalFiles: number;
    coversExtracted: number;
    seriesCreated: number;
    foldersComplete?: number;
    foldersTotal?: number;
    foldersSkipped?: number;
    foldersErrored?: number;
    coverJobsComplete?: number;
    currentFolder?: string | null;
  };
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

export interface BatchOperationItem {
  id: string;
  operation: string;
  source: string;
  destination: string | null;
  status: 'pending' | 'success' | 'failed';
  error: string | null;
  timestamp: Date;
}

export interface UnifiedJobDetails extends UnifiedJob {
  logs?: UnifiedJobLog[];
  operations?: BatchOperationItem[];
}