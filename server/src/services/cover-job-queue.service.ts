/**
 * Cover Job Queue Service
 *
 * DB-persisted cover extraction job queue with concurrent workers.
 * Designed for the folder-first scanning architecture where each folder
 * dispatches a cover job for its files immediately after processing.
 *
 * Features:
 * - DB-persisted jobs survive server restarts
 * - 8 concurrent workers for optimal throughput
 * - Per-folder granularity for immediate browsability
 * - Retry logic with hard fail after 5 attempts
 * - SSE integration for real-time progress updates
 */

import { getDatabase } from './database.service.js';
import { batchExtractCovers } from './cover.service.js';
import { broadcastToChannel } from './sse.service.js';
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

const MAX_CONCURRENT_WORKERS = 8;
const MAX_RETRIES = 5;
const WORKER_POLL_INTERVAL_MS = 500;
const PRIORITY_MAP = {
  high: 0,
  normal: 50,
  low: 100,
};

// =============================================================================
// State
// =============================================================================

let workerRunning = false;
let activeWorkers = 0;
let totalJobsProcessed = 0;
let totalCoversExtracted = 0;

// =============================================================================
// Public API
// =============================================================================

/**
 * Enqueue a cover extraction job for a folder's files.
 * Returns immediately - job is processed asynchronously.
 */
export async function enqueueCoverJob(options: CoverJobOptions): Promise<string> {
  const db = getDatabase();
  const { libraryId, folderPath, fileIds, priority = 'normal' } = options;

  if (fileIds.length === 0) {
    scannerLogger.debug(
      { libraryId, folderPath },
      'Skipping cover job for folder with no files'
    );
    return '';
  }

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

  scannerLogger.debug(
    { jobId: job.id, libraryId, folderPath, fileCount: fileIds.length },
    `Enqueued cover job for ${fileIds.length} files`
  );

  // Ensure worker is running
  startCoverQueueWorker();

  return job.id;
}

/**
 * Start the cover job worker.
 * Spawns up to MAX_CONCURRENT_WORKERS workers.
 */
export function startCoverQueueWorker(): void {
  if (workerRunning) return;
  workerRunning = true;

  jobQueueLogger.info(
    { maxConcurrent: MAX_CONCURRENT_WORKERS },
    'Starting cover job queue worker'
  );

  // Start the worker loop
  processQueueLoop();
}

/**
 * Stop the cover job worker.
 * Allows in-progress jobs to complete.
 */
export function stopCoverQueueWorker(): void {
  if (!workerRunning) return;
  workerRunning = false;
  jobQueueLogger.info('Stopping cover job queue worker');
}

/**
 * Get current queue status.
 */
export async function getCoverQueueStatus(): Promise<CoverQueueStats> {
  const db = getDatabase();

  const [pending, processing, complete, failed] = await Promise.all([
    db.coverJob.count({ where: { status: 'pending' } }),
    db.coverJob.count({ where: { status: 'processing' } }),
    db.coverJob.count({ where: { status: 'complete' } }),
    db.coverJob.count({ where: { status: 'failed' } }),
  ]);

  return {
    pending,
    processing,
    complete,
    failed,
    totalJobsProcessed,
    totalCoversExtracted,
  };
}

/**
 * Cancel all pending cover jobs for a library.
 */
export async function cancelLibraryCoverJobs(libraryId: string): Promise<number> {
  const db = getDatabase();

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
  const db = getDatabase();
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
  const db = getDatabase();

  // Find jobs that were "processing" when server stopped
  const stuckJobs = await db.coverJob.findMany({
    where: { status: 'processing' },
  });

  if (stuckJobs.length === 0) return 0;

  // Reset them to pending for retry
  await db.coverJob.updateMany({
    where: { status: 'processing' },
    data: {
      status: 'pending',
      startedAt: null,
    },
  });

  jobQueueLogger.info(
    { count: stuckJobs.length },
    `Recovered ${stuckJobs.length} interrupted cover jobs`
  );

  // Start worker to process them
  startCoverQueueWorker();

  return stuckJobs.length;
}

// =============================================================================
// Worker Implementation
// =============================================================================

/**
 * Main worker loop that spawns concurrent job processors.
 */
async function processQueueLoop(): Promise<void> {
  while (workerRunning) {
    try {
      // Check if we can spawn more workers
      if (activeWorkers < MAX_CONCURRENT_WORKERS) {
        const job = await claimNextJob();
        if (job) {
          // Spawn worker for this job (don't await - run concurrently)
          processJobAsync(job);
        }
      }

      // Poll interval
      await sleep(WORKER_POLL_INTERVAL_MS);
    } catch (error) {
      jobQueueLogger.error({ error }, 'Error in cover queue worker loop');
      await sleep(1000); // Back off on error
    }
  }
}

/**
 * Claim the next pending job atomically.
 * Uses database transaction to prevent race conditions.
 */
async function claimNextJob(): Promise<{ id: string; libraryId: string; folderPath: string; fileIds: string[] } | null> {
  const db = getDatabase();

  // Find next pending job (priority order: lower = higher priority)
  const job = await db.coverJob.findFirst({
    where: { status: 'pending' },
    orderBy: [
      { priority: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  if (!job) return null;

  // Atomically claim the job
  try {
    await db.coverJob.update({
      where: { id: job.id, status: 'pending' },
      data: {
        status: 'processing',
        startedAt: new Date(),
      },
    });

    return {
      id: job.id,
      libraryId: job.libraryId,
      folderPath: job.folderPath,
      fileIds: JSON.parse(job.fileIds) as string[],
    };
  } catch {
    // Another worker claimed it - try again
    return null;
  }
}

/**
 * Process a single job asynchronously.
 */
async function processJobAsync(job: {
  id: string;
  libraryId: string;
  folderPath: string;
  fileIds: string[];
}): Promise<void> {
  activeWorkers++;

  try {
    await processJob(job);
  } finally {
    activeWorkers--;
  }
}

/**
 * Process a single cover job.
 */
async function processJob(job: {
  id: string;
  libraryId: string;
  folderPath: string;
  fileIds: string[];
}): Promise<void> {
  const db = getDatabase();
  const { id, libraryId, folderPath, fileIds } = job;

  const startTime = Date.now();
  scannerLogger.debug(
    { jobId: id, libraryId, folderPath, fileCount: fileIds.length },
    `Processing cover job for ${fileIds.length} files`
  );

  // Emit progress start
  emitCoverProgress({
    jobId: id,
    libraryId,
    folderPath,
    status: 'processing',
    coversExtracted: 0,
    totalFiles: fileIds.length,
    retryCount: 0,
  });

  try {
    // Extract covers with progress updates
    const result = await batchExtractCovers(fileIds, (current, total) => {
      // Update DB progress periodically (every 10 files or at end)
      if (current % 10 === 0 || current === total) {
        db.coverJob.update({
          where: { id },
          data: { processedFiles: current },
        }).catch(() => {
          // Ignore update errors
        });
      }
    });

    const elapsedMs = Date.now() - startTime;

    // Mark as complete
    await db.coverJob.update({
      where: { id },
      data: {
        status: 'complete',
        processedFiles: result.success + result.cached,
        failedFiles: result.failed,
        completedAt: new Date(),
      },
    });

    totalJobsProcessed++;
    totalCoversExtracted += result.success;

    scannerLogger.info(
      {
        jobId: id,
        libraryId,
        folderPath,
        success: result.success,
        cached: result.cached,
        failed: result.failed,
        elapsedMs,
      },
      `Cover job complete: ${result.success} extracted, ${result.cached} cached, ${result.failed} failed in ${elapsedMs}ms`
    );

    // Emit progress complete
    emitCoverProgress({
      jobId: id,
      libraryId,
      folderPath,
      status: 'complete',
      coversExtracted: result.success + result.cached,
      totalFiles: fileIds.length,
      retryCount: 0,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Get current retry count
    const currentJob = await db.coverJob.findUnique({ where: { id } });
    const retryCount = (currentJob?.retryCount ?? 0) + 1;

    if (retryCount >= MAX_RETRIES) {
      // Hard fail after max retries
      await db.coverJob.update({
        where: { id },
        data: {
          status: 'failed',
          retryCount,
          errorMessage,
          completedAt: new Date(),
        },
      });

      scannerLogger.error(
        { jobId: id, libraryId, folderPath, retryCount, error: errorMessage },
        `Cover job failed permanently after ${MAX_RETRIES} retries`
      );

      // Emit progress failed
      emitCoverProgress({
        jobId: id,
        libraryId,
        folderPath,
        status: 'failed',
        coversExtracted: 0,
        totalFiles: fileIds.length,
        retryCount,
      });
    } else {
      // Reset to pending for retry
      await db.coverJob.update({
        where: { id },
        data: {
          status: 'pending',
          retryCount,
          errorMessage,
          startedAt: null,
        },
      });

      scannerLogger.warn(
        { jobId: id, libraryId, folderPath, retryCount, error: errorMessage },
        `Cover job failed, queued for retry ${retryCount}/${MAX_RETRIES}`
      );
    }
  }
}

// =============================================================================
// SSE Integration
// =============================================================================

/**
 * Emit cover progress event via SSE.
 */
function emitCoverProgress(progress: CoverJobProgress): void {
  broadcastToChannel('scan-progress', {
    type: 'cover-progress',
    data: progress,
  });
}

// =============================================================================
// Utilities
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
