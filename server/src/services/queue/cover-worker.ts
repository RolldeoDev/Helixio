/**
 * Cover Extraction Worker
 *
 * BullMQ worker for processing cover extraction jobs.
 * Delegates to existing batchExtractCovers() service for business logic.
 */

import { Worker, Job, Queue } from 'bullmq';
import { REDIS_CONFIG, QUEUE_NAMES, DEFAULT_JOB_OPTIONS, COVER_QUEUE_CONFIG } from './bull-config.js';
import { getWriteDatabase } from '../database.service.js';
import { batchExtractCovers } from '../cover.service.js';
import { sendCoverProgress } from '../sse.service.js';
import { jobQueueLogger, scannerLogger } from '../logger.service.js';

// =============================================================================
// Types
// =============================================================================

export interface CoverJobData {
  jobId: string; // CoverJob.id from database
  libraryId: string;
  folderPath: string;
  fileIds: string[];
  priority?: 'high' | 'normal' | 'low';
}

export interface CoverJobResult {
  success: number;
  cached: number;
  failed: number;
  elapsedMs: number;
}

// =============================================================================
// Worker State
// =============================================================================

let worker: Worker<CoverJobData, CoverJobResult> | null = null;
let queue: Queue<CoverJobData> | null = null;
let currentConcurrency: number = COVER_QUEUE_CONFIG.concurrency;

// =============================================================================
// Queue Setup
// =============================================================================

/**
 * Get or create the cover queue
 */
export function getCoverQueue(): Queue<CoverJobData> {
  if (queue) return queue;

  queue = new Queue<CoverJobData>(QUEUE_NAMES.COVER, {
    connection: REDIS_CONFIG,
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      priority: 5, // Default to normal priority
    },
  });

  jobQueueLogger.info({ queueName: QUEUE_NAMES.COVER }, 'Cover queue created');

  return queue;
}

// =============================================================================
// Worker Implementation
// =============================================================================

/**
 * Start the cover extraction worker
 */
export function startCoverWorker(): void {
  if (worker) {
    jobQueueLogger.warn('Cover worker already running');
    return;
  }

  worker = new Worker<CoverJobData, CoverJobResult>(
    QUEUE_NAMES.COVER,
    async (job: Job<CoverJobData>) => {
      return await processCoverJob(job);
    },
    {
      connection: REDIS_CONFIG,
      concurrency: currentConcurrency,
      limiter: COVER_QUEUE_CONFIG.rateLimiter,
    }
  );

  // Event handlers
  worker.on('completed', (job) => {
    jobQueueLogger.debug(
      { jobId: job.id, duration: Date.now() - job.processedOn! },
      'Cover job completed'
    );
  });

  worker.on('failed', (job, err) => {
    jobQueueLogger.error(
      { jobId: job?.id, error: err.message },
      'Cover job failed'
    );
  });

  worker.on('error', (err) => {
    jobQueueLogger.error({ error: err.message }, 'Cover worker error');
  });

  jobQueueLogger.info(
    { concurrency: currentConcurrency, queueName: QUEUE_NAMES.COVER },
    'Cover worker started'
  );
}

/**
 * Stop the cover extraction worker
 */
export async function stopCoverWorker(): Promise<void> {
  if (!worker) return;

  await worker.close();
  worker = null;

  jobQueueLogger.info('Cover worker stopped');
}

/**
 * Close the cover queue
 */
export async function closeCoverQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

/**
 * Set low priority mode (reduces concurrency)
 */
export function setCoverWorkerLowPriorityMode(enabled: boolean): void {
  const newConcurrency = enabled
    ? COVER_QUEUE_CONFIG.lowPriorityConcurrency
    : COVER_QUEUE_CONFIG.concurrency;

  if (newConcurrency === currentConcurrency) return;

  currentConcurrency = newConcurrency;

  jobQueueLogger.info(
    { enabled, concurrency: currentConcurrency },
    `Cover worker ${enabled ? 'entering' : 'exiting'} low priority mode`
  );

  // Note: BullMQ doesn't support dynamic concurrency changes
  // The concurrency change will take effect on worker restart
  // For now, we just track the state - future optimization could restart worker
}

// =============================================================================
// Job Processing
// =============================================================================

/**
 * Process a single cover extraction job
 */
async function processCoverJob(
  job: Job<CoverJobData>
): Promise<CoverJobResult> {
  const { jobId, libraryId, folderPath, fileIds } = job.data;
  const db = getWriteDatabase();
  const startTime = Date.now();

  scannerLogger.debug(
    { jobId, libraryId, folderPath, fileCount: fileIds.length },
    'Processing cover job'
  );

  // Update DB job status to processing
  await db.coverJob.update({
    where: { id: jobId },
    data: {
      status: 'processing',
      startedAt: new Date(),
    },
  });

  // Emit SSE progress start
  sendCoverProgress(libraryId, {
    jobId,
    folderPath,
    status: 'processing',
    coversExtracted: 0,
    totalFiles: fileIds.length,
    retryCount: job.attemptsMade,
  });

  try {
    // Extract covers with progress updates
    const result = await batchExtractCovers(fileIds, async (current, total) => {
      // Update DB progress periodically (every 10 files or at end)
      if (current % 10 === 0 || current === total) {
        await db.coverJob
          .update({
            where: { id: jobId },
            data: { processedFiles: current },
          })
          .catch(() => {
            // Ignore update errors - progress updates are best-effort
          });
      }

      // Update BullMQ job progress
      await job.updateProgress({
        current,
        total,
        message: `Extracting cover ${current}/${total}`,
      });
    });

    const elapsedMs = Date.now() - startTime;

    // Update DB job status to complete
    await db.coverJob.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        processedFiles: result.success + result.cached,
        failedFiles: result.failed,
        completedAt: new Date(),
      },
    });

    scannerLogger.info(
      {
        jobId,
        libraryId,
        folderPath,
        success: result.success,
        cached: result.cached,
        failed: result.failed,
        elapsedMs,
      },
      `Cover job complete: ${result.success} extracted, ${result.cached} cached, ${result.failed} failed`
    );

    // Emit SSE completion
    sendCoverProgress(libraryId, {
      jobId,
      folderPath,
      status: 'complete',
      coversExtracted: result.success + result.cached,
      totalFiles: fileIds.length,
      retryCount: job.attemptsMade,
    });

    return {
      success: result.success,
      cached: result.cached,
      failed: result.failed,
      elapsedMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // On final failure (retry exhaustion), mark as failed
    if (job.attemptsMade >= (job.opts.attempts || 5) - 1) {
      await db.coverJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          retryCount: job.attemptsMade + 1,
          errorMessage,
          completedAt: new Date(),
        },
      });

      scannerLogger.error(
        { jobId, libraryId, folderPath, retryCount: job.attemptsMade + 1, error: errorMessage },
        'Cover job failed permanently'
      );

      // Emit SSE failure
      sendCoverProgress(libraryId, {
        jobId,
        folderPath,
        status: 'failed',
        coversExtracted: 0,
        totalFiles: fileIds.length,
        retryCount: job.attemptsMade + 1,
      });
    } else {
      // Increment retry count in DB for tracking
      await db.coverJob.update({
        where: { id: jobId },
        data: {
          retryCount: job.attemptsMade + 1,
          errorMessage,
        },
      });

      scannerLogger.warn(
        { jobId, libraryId, folderPath, retryCount: job.attemptsMade + 1, error: errorMessage },
        `Cover job failed, BullMQ will retry (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`
      );
    }

    // Re-throw to let BullMQ handle retry logic
    throw error;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Add a cover extraction job to the queue
 */
export async function addCoverJob(data: Omit<CoverJobData, 'jobId'> & { jobId: string }): Promise<string> {
  const queue = getCoverQueue();

  const priorityMap = {
    high: 1,
    normal: 5,
    low: 10,
  };

  const job = await queue.add('extract-covers', data, {
    priority: priorityMap[data.priority || 'normal'],
    jobId: data.jobId, // Use DB job ID as BullMQ job ID for correlation
  });

  jobQueueLogger.debug(
    { jobId: job.id, libraryId: data.libraryId, fileCount: data.fileIds.length },
    'Cover job added to queue'
  );

  return job.id!;
}

/**
 * Get queue statistics
 */
export async function getCoverQueueStats() {
  const queue = getCoverQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
  };
}
