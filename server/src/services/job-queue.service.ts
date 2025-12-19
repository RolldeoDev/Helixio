/**
 * Job Queue Service
 *
 * Provides an in-memory job queue for background processing of metadata jobs.
 * Jobs are processed independently of HTTP request lifecycle, ensuring they
 * complete even if the browser disconnects.
 *
 * The queue handles two types of operations:
 * - 'start': Initialize a job session (search for series, etc.)
 * - 'apply': Apply approved metadata changes to files
 */

import { getDatabase } from './database.service.js';
import {
  startJob as executeStartJob,
  jobApplyChanges as executeApplyChanges,
  addJobLog,
  getJob,
} from './metadata-job.service.js';
import { jobQueueLogger as logger } from './logger.service.js';

// =============================================================================
// Types
// =============================================================================

export type JobOperation = 'start' | 'apply';

export type QueueItemStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface QueueItem {
  jobId: string;
  operation: JobOperation;
  status: QueueItemStatus;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// =============================================================================
// Queue Configuration
// =============================================================================

/** Maximum number of jobs allowed in the queue */
const MAX_QUEUE_SIZE = 100;

// =============================================================================
// Queue State
// =============================================================================

/** In-memory queue of pending job operations */
const queue: QueueItem[] = [];

/** Currently processing item (only one at a time) */
let currentItem: QueueItem | null = null;

/** Whether the worker loop is running */
let isWorkerRunning = false;

/** Worker loop interval ID */
let workerIntervalId: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// Queue Management
// =============================================================================

/**
 * Error thrown when the queue is at maximum capacity
 */
export class QueueFullError extends Error {
  constructor(message: string = 'Job queue is at maximum capacity') {
    super(message);
    this.name = 'QueueFullError';
  }
}

/**
 * Get the current queue length
 */
export function getQueueLength(): number {
  return queue.length;
}

/**
 * Get maximum queue size
 */
export function getMaxQueueSize(): number {
  return MAX_QUEUE_SIZE;
}

/**
 * Enqueue a job operation for background processing.
 * Returns immediately - the job will be processed asynchronously.
 * @throws {QueueFullError} When the queue is at maximum capacity
 */
export function enqueueJob(jobId: string, operation: JobOperation): QueueItem {
  // Check if this job+operation is already queued or processing
  const existing = queue.find(
    (item) => item.jobId === jobId && item.operation === operation && item.status === 'queued'
  );
  if (existing) {
    return existing;
  }

  if (currentItem?.jobId === jobId && currentItem.operation === operation) {
    return currentItem;
  }

  // Check queue capacity before adding new items
  if (queue.length >= MAX_QUEUE_SIZE) {
    throw new QueueFullError(`Job queue is full (max: ${MAX_QUEUE_SIZE} items). Please try again later.`);
  }

  const item: QueueItem = {
    jobId,
    operation,
    status: 'queued',
    queuedAt: new Date(),
  };

  queue.push(item);

  // Update job's queuedAt in database
  updateJobQueueStatus(jobId, 'queued').catch((err) => {
    logger.error({ jobId, err }, 'Failed to update job queue status');
  });

  // Ensure worker is running
  startWorker();

  return item;
}

/**
 * Get the status of a job in the queue
 */
export function getQueueStatus(jobId: string): QueueItem | null {
  // Check if currently processing
  if (currentItem?.jobId === jobId) {
    return currentItem;
  }

  // Check queue
  const queued = queue.find((item) => item.jobId === jobId);
  return queued || null;
}

/**
 * Check if a job has any pending or processing operations
 */
export function isJobInQueue(jobId: string): boolean {
  if (currentItem?.jobId === jobId) {
    return true;
  }
  return queue.some((item) => item.jobId === jobId && item.status === 'queued');
}

/**
 * Remove a job from the queue (e.g., when cancelled)
 */
export function removeFromQueue(jobId: string): void {
  const index = queue.findIndex((item) => item.jobId === jobId);
  if (index !== -1) {
    queue.splice(index, 1);
  }
}

// =============================================================================
// Worker Loop
// =============================================================================

/**
 * Start the worker loop if not already running
 */
function startWorker(): void {
  if (isWorkerRunning) return;

  isWorkerRunning = true;
  processQueue();
}

/**
 * Process the next item in the queue
 */
async function processQueue(): Promise<void> {
  // If already processing something, wait
  if (currentItem) {
    scheduleNextProcess();
    return;
  }

  // Get next queued item
  const nextItem = queue.find((item) => item.status === 'queued');
  if (!nextItem) {
    // No more items to process
    isWorkerRunning = false;
    return;
  }

  // Mark as processing
  currentItem = nextItem;
  currentItem.status = 'processing';
  currentItem.startedAt = new Date();

  // Update job's processingStartedAt in database
  await updateJobQueueStatus(currentItem.jobId, 'processing');

  try {
    // Execute the operation
    if (currentItem.operation === 'start') {
      await processStartOperation(currentItem.jobId);
    } else if (currentItem.operation === 'apply') {
      await processApplyOperation(currentItem.jobId);
    }

    // Mark as completed
    currentItem.status = 'completed';
    currentItem.completedAt = new Date();
  } catch (error) {
    // Mark as failed
    currentItem.status = 'failed';
    currentItem.completedAt = new Date();
    currentItem.error = error instanceof Error ? error.message : 'Unknown error';

    logger.error({ jobId: currentItem.jobId, operation: currentItem.operation, err: error }, 'Job operation failed');
  } finally {
    // Remove from queue
    const index = queue.indexOf(currentItem);
    if (index !== -1) {
      queue.splice(index, 1);
    }
    currentItem = null;

    // Process next item
    scheduleNextProcess();
  }
}

/**
 * Schedule the next queue processing
 */
function scheduleNextProcess(): void {
  // Use setImmediate to prevent stack overflow on large queues
  setImmediate(() => {
    processQueue().catch((err) => {
      logger.error({ err }, 'Queue processing error');
    });
  });
}

// =============================================================================
// Operation Handlers
// =============================================================================

/**
 * Process a 'start' operation - initialize job session
 */
async function processStartOperation(jobId: string): Promise<void> {
  // Progress callback updates the job's progress fields
  const onProgress = async (message: string, detail?: string) => {
    await addJobLog(jobId, 'initializing', message, detail, 'info');
  };

  await executeStartJob(jobId, onProgress);
}

/**
 * Process an 'apply' operation - apply metadata changes
 */
async function processApplyOperation(jobId: string): Promise<void> {
  // Progress callback updates the job's progress fields
  const onProgress = async (message: string, detail?: string) => {
    await addJobLog(jobId, 'applying', message, detail, 'info');
  };

  await executeApplyChanges(jobId, onProgress);
}

// =============================================================================
// Database Updates
// =============================================================================

/**
 * Update job's queue status in database
 */
async function updateJobQueueStatus(
  jobId: string,
  status: 'queued' | 'processing'
): Promise<void> {
  const prisma = getDatabase();
  const now = new Date();

  try {
    if (status === 'queued') {
      await prisma.metadataJob.update({
        where: { id: jobId },
        data: { queuedAt: now },
      });
    } else if (status === 'processing') {
      await prisma.metadataJob.update({
        where: { id: jobId },
        data: { processingStartedAt: now },
      });
    }
  } catch (error) {
    logger.error({ jobId, status, err: error }, 'Failed to update job queue status');
  }
}

// =============================================================================
// Startup Recovery
// =============================================================================

/**
 * On server startup, check for jobs that were processing or queued when server stopped.
 * These jobs should be re-queued to resume processing.
 *
 * Handles:
 * - Jobs actively processing (status: initializing, applying)
 * - Jobs queued for processing but server died before worker started
 *   (queuedAt set but processingStartedAt null)
 */
export async function recoverInterruptedJobs(): Promise<void> {
  const prisma = getDatabase();

  try {
    const interruptedJobs = await prisma.metadataJob.findMany({
      where: {
        OR: [
          // Jobs that were actively processing
          { status: { in: ['initializing', 'applying'] } },
          // Jobs queued for apply but server died before processing started
          {
            status: 'file_review',
            queuedAt: { not: null },
            processingStartedAt: null,
          },
          // Jobs queued for start but server died before processing started
          {
            status: 'options',
            queuedAt: { not: null },
            processingStartedAt: null,
          },
        ],
      },
    });

    for (const job of interruptedJobs) {
      logger.info({ jobId: job.id, status: job.status, queuedAt: job.queuedAt }, 'Recovering interrupted job');

      if (job.status === 'initializing') {
        // Re-queue start operation
        enqueueJob(job.id, 'start');
      } else if (job.status === 'applying') {
        // Re-queue apply operation
        enqueueJob(job.id, 'apply');
      } else if (job.status === 'file_review' && job.queuedAt) {
        // Was queued for apply but server died before processing started
        enqueueJob(job.id, 'apply');
      } else if (job.status === 'options' && job.queuedAt) {
        // Was queued for start but server died before processing started
        enqueueJob(job.id, 'start');
      }
    }

    if (interruptedJobs.length > 0) {
      logger.info({ count: interruptedJobs.length }, 'Recovered interrupted jobs');
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to recover interrupted jobs');
  }
}

// =============================================================================
// Export
// =============================================================================

export const JobQueue = {
  enqueueJob,
  getQueueStatus,
  isJobInQueue,
  removeFromQueue,
  recoverInterruptedJobs,
  getQueueLength,
  getMaxQueueSize,
  QueueFullError,
};

export default JobQueue;
