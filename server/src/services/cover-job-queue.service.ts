/**
 * Cover Job Queue Service
 *
 * DB-persisted cover extraction job queue with BullMQ workers.
 * Designed for the folder-first scanning architecture where each folder
 * dispatches a cover job for its files immediately after processing.
 *
 * Features:
 * - DB-persisted jobs survive server restarts
 * - BullMQ-powered concurrent workers (8 workers, 2 in low-priority mode)
 * - Per-folder granularity for immediate browsability
 * - Retry logic with exponential backoff (5 attempts)
 * - SSE integration for real-time progress updates
 */

import { getDatabase, getWriteDatabase } from './database.service.js';
import {
  startCoverWorker,
  stopCoverWorker,
  addCoverJob,
  setCoverWorkerLowPriorityMode,
  getCoverQueueStats,
  getCoverQueue,
  closeCoverQueue,
} from './queue/cover-worker.js';
import { scannerLogger, jobQueueLogger } from './logger.service.js';

// =============================================================================
// Types
// =============================================================================

export interface CoverJobOptions {
  libraryId: string;
  folderPath: string;
  fileIds: string[];
  priority?: 'high' | 'normal' | 'low';
  scanJobId?: string; // Link to parent scan job for tracking
}

export interface CoverJobProgress {
  jobId: string;
  libraryId: string;
  folderPath: string;
  status: CoverJobStatus;
  coversExtracted: number;
  totalFiles: number;
  retryCount: number;
}

export type CoverJobStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'cancelled';

export interface CoverQueueStats {
  pending: number;
  processing: number;
  complete: number;
  failed: number;
  totalJobsProcessed: number;
  totalCoversExtracted: number;
}

// =============================================================================
// Configuration
// =============================================================================

/** Maximum concurrent workers when not in low priority mode */
const MAX_CONCURRENT_WORKERS = 8;

/** Reduced concurrent workers during active library scans to reduce DB contention */
const LOW_PRIORITY_CONCURRENT_WORKERS = 2;

const MAX_RETRIES = 5;
const PRIORITY_MAP = {
  high: 0,
  normal: 50,
  low: 100,
};

// =============================================================================
// State
// =============================================================================

let totalJobsProcessed = 0;
let totalCoversExtracted = 0;

/**
 * Set low priority mode for cover extraction.
 * When enabled, reduces concurrent workers to minimize DB contention during scans.
 */
export function setCoverQueueLowPriorityMode(enabled: boolean): void {
  setCoverWorkerLowPriorityMode(enabled);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Enqueue a cover extraction job for a folder's files.
 * Returns immediately - job is processed asynchronously by BullMQ worker.
 */
export async function enqueueCoverJob(options: CoverJobOptions): Promise<string> {
  const db = getWriteDatabase();
  const { libraryId, folderPath, fileIds, priority = 'normal' } = options;

  if (fileIds.length === 0) {
    scannerLogger.debug(
      { libraryId, folderPath },
      'Skipping cover job for folder with no files'
    );
    return '';
  }

  // Create DB record first
  const job = await db.coverJob.create({
    data: {
      libraryId,
      folderPath,
      fileIds: JSON.stringify(fileIds),
      status: 'pending',
      priority: PRIORITY_MAP[priority],
      totalFiles: fileIds.length,
      processedFiles: 0,
      failedFiles: 0,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
    },
  });

  // Add to BullMQ queue
  await addCoverJob({
    jobId: job.id,
    libraryId,
    folderPath,
    fileIds,
    priority,
  });

  scannerLogger.debug(
    { jobId: job.id, libraryId, folderPath, fileCount: fileIds.length },
    `Enqueued cover job for ${fileIds.length} files`
  );

  return job.id;
}

/**
 * Start the cover job worker.
 * Initializes BullMQ worker with up to MAX_CONCURRENT_WORKERS concurrency.
 */
export function startCoverQueueWorker(): void {
  startCoverWorker();
}

/**
 * Stop the cover job worker.
 * Allows in-progress jobs to complete gracefully.
 */
export async function stopCoverQueueWorker(): Promise<void> {
  await stopCoverWorker();
  await closeCoverQueue();
}

/**
 * Get current queue status.
 */
export async function getCoverQueueStatus(): Promise<CoverQueueStats> {
  const db = getDatabase();

  // Get BullMQ queue stats
  const queueStats = await getCoverQueueStats();

  // Get DB stats for historical data
  const [dbComplete, dbFailed] = await Promise.all([
    db.coverJob.count({ where: { status: 'complete' } }),
    db.coverJob.count({ where: { status: 'failed' } }),
  ]);

  // Calculate total covers extracted
  const completeJobs = await db.coverJob.findMany({
    where: { status: 'complete' },
    select: { processedFiles: true },
  });

  const totalCovers = completeJobs.reduce((sum, job) => sum + job.processedFiles, 0);

  return {
    pending: queueStats.waiting + queueStats.delayed,
    processing: queueStats.active,
    complete: dbComplete,
    failed: dbFailed,
    totalJobsProcessed: dbComplete + dbFailed,
    totalCoversExtracted: totalCovers,
  };
}

/**
 * Cancel all pending cover jobs for a library.
 */
export async function cancelLibraryCoverJobs(libraryId: string): Promise<number> {
  const db = getWriteDatabase();

  const result = await db.coverJob.updateMany({
    where: {
      libraryId,
      status: 'pending',
    },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
    },
  });

  scannerLogger.info(
    { libraryId, cancelledCount: result.count },
    `Cancelled ${result.count} pending cover jobs for library`
  );

  return result.count;
}

/**
 * Clean up old completed/failed jobs.
 * Keeps jobs for 24 hours for debugging purposes.
 */
export async function cleanupOldJobs(olderThanHours = 24): Promise<number> {
  const db = getWriteDatabase();
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

  const result = await db.coverJob.deleteMany({
    where: {
      status: { in: ['complete', 'failed', 'cancelled'] },
      completedAt: { lt: cutoff },
    },
  });

  return result.count;
}

/**
 * Recover processing jobs on server restart.
 * Called during server startup.
 */
export async function recoverCoverJobs(): Promise<number> {
  const db = getWriteDatabase();

  // Find jobs that were "processing" when server stopped
  const stuckJobs = await db.coverJob.findMany({
    where: { status: 'processing' },
  });

  if (stuckJobs.length === 0) return 0;

  // Reset them to pending
  await db.coverJob.updateMany({
    where: { status: 'processing' },
    data: {
      status: 'pending',
      startedAt: null,
    },
  });

  // Re-enqueue to BullMQ
  for (const dbJob of stuckJobs) {
    await addCoverJob({
      jobId: dbJob.id,
      libraryId: dbJob.libraryId,
      folderPath: dbJob.folderPath,
      fileIds: JSON.parse(dbJob.fileIds) as string[],
      priority: dbJob.priority === 0 ? 'high' : dbJob.priority === 50 ? 'normal' : 'low',
    });
  }

  jobQueueLogger.info(
    { count: stuckJobs.length },
    `Recovered ${stuckJobs.length} interrupted cover jobs`
  );

  return stuckJobs.length;
}

// Note: Worker implementation moved to queue/cover-worker.ts
// All worker logic (processQueueLoop, claimNextJob, processJob) now handled by BullMQ
