/**
 * Download Queue Service
 *
 * Manages background download job processing with one job per user limit.
 * Jobs are queued and processed asynchronously, with progress updates via SSE.
 */

import { EventEmitter } from 'events';
import {
  getDownloadJob,
  executeDownloadJob,
  updateDownloadJob,
  ProgressCallback,
} from './download.service.js';
import { downloadLogger as logger } from './logger.service.js';

// =============================================================================
// Types
// =============================================================================

export type QueueItemStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface QueueItem {
  jobId: string;
  userId: string;
  status: QueueItemStatus;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface ProgressEvent {
  jobId: string;
  current: number;
  total: number;
  message: string;
  status: 'preparing' | 'ready' | 'failed';
}

// =============================================================================
// Queue State
// =============================================================================

/** User queues (userId -> array of queued items) */
const userQueues: Map<string, QueueItem[]> = new Map();

/** Currently processing items (userId -> QueueItem) */
const activeJobs: Map<string, QueueItem> = new Map();

/** Event emitter for progress updates */
export const progressEmitter = new EventEmitter();

/** Whether the worker loop is running */
let isWorkerRunning = false;

/** Worker loop interval ID */
let workerIntervalId: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// Queue Management
// =============================================================================

/**
 * Get or create a user's queue.
 */
function getUserQueue(userId: string): QueueItem[] {
  let queue = userQueues.get(userId);
  if (!queue) {
    queue = [];
    userQueues.set(userId, queue);
  }
  return queue;
}

/**
 * Check if a user has an active or queued download.
 */
export function isUserDownloading(userId: string): boolean {
  if (activeJobs.has(userId)) {
    return true;
  }
  const queue = userQueues.get(userId);
  return queue !== undefined && queue.length > 0;
}

/**
 * Get the active download job ID for a user.
 */
export function getActiveDownload(userId: string): string | null {
  const active = activeJobs.get(userId);
  return active ? active.jobId : null;
}

/**
 * Enqueue a download job for processing.
 */
export function enqueueDownload(userId: string, jobId: string): QueueItem {
  // Check if already queued or processing
  const existing = activeJobs.get(userId);
  if (existing?.jobId === jobId) {
    return existing;
  }

  const queue = getUserQueue(userId);
  const existingQueued = queue.find((item) => item.jobId === jobId);
  if (existingQueued) {
    return existingQueued;
  }

  const item: QueueItem = {
    jobId,
    userId,
    status: 'queued',
    queuedAt: new Date(),
  };

  queue.push(item);
  logger.info(`Enqueued download job ${jobId} for user ${userId}`);

  // Start worker if not running
  startWorker();

  return item;
}

/**
 * Remove a job from the queue.
 */
export function dequeueDownload(userId: string, jobId: string): boolean {
  const queue = userQueues.get(userId);
  if (!queue) return false;

  const index = queue.findIndex((item) => item.jobId === jobId);
  if (index === -1) return false;

  queue.splice(index, 1);
  logger.info(`Dequeued download job ${jobId} for user ${userId}`);

  return true;
}

/**
 * Get queue status for a user.
 */
export function getQueueStatus(userId: string): {
  active: QueueItem | null;
  queued: QueueItem[];
} {
  return {
    active: activeJobs.get(userId) || null,
    queued: getUserQueue(userId),
  };
}

// =============================================================================
// Worker Loop
// =============================================================================

/**
 * Start the worker loop if not running.
 */
function startWorker(): void {
  if (isWorkerRunning) return;

  isWorkerRunning = true;
  logger.info('Starting download queue worker');

  // Process immediately
  processNextJobs();

  // Then check periodically
  workerIntervalId = setInterval(processNextJobs, 1000);
}

/**
 * Stop the worker loop.
 */
export function stopWorker(): void {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
  isWorkerRunning = false;
  logger.info('Stopped download queue worker');
}

/**
 * Process next jobs for all users.
 */
async function processNextJobs(): Promise<void> {
  // Check each user's queue
  for (const [userId, queue] of userQueues.entries()) {
    // Skip if user already has an active job
    if (activeJobs.has(userId)) continue;

    // Get next queued item
    const nextItem = queue.find((item) => item.status === 'queued');
    if (!nextItem) continue;

    // Process this job
    processJob(nextItem);
  }

  // Stop worker if no more work
  const hasWork = Array.from(userQueues.values()).some(
    (queue) => queue.some((item) => item.status === 'queued')
  ) || activeJobs.size > 0;

  if (!hasWork) {
    stopWorker();
  }
}

/**
 * Process a single job.
 */
async function processJob(item: QueueItem): Promise<void> {
  const { jobId, userId } = item;

  // Mark as processing
  item.status = 'processing';
  item.startedAt = new Date();
  activeJobs.set(userId, item);

  logger.info(`Processing download job ${jobId} for user ${userId}`);

  // Create progress callback
  const onProgress: ProgressCallback = (current, total, message) => {
    const event: ProgressEvent = {
      jobId,
      current,
      total,
      message,
      status: 'preparing',
    };
    progressEmitter.emit(`progress:${jobId}`, event);
  };

  try {
    // Execute the job
    await executeDownloadJob(jobId, onProgress);

    // Check final status
    const job = await getDownloadJob(jobId);

    if (job?.status === 'ready') {
      item.status = 'completed';
      item.completedAt = new Date();

      // Emit ready event
      progressEmitter.emit(`progress:${jobId}`, {
        jobId,
        current: job.totalFiles,
        total: job.totalFiles,
        message: 'Download ready',
        status: 'ready',
      } as ProgressEvent);

      logger.info(`Download job ${jobId} completed successfully`);
    } else if (job?.status === 'failed') {
      item.status = 'failed';
      item.error = job.error || 'Unknown error';
      item.completedAt = new Date();

      // Emit failed event
      progressEmitter.emit(`progress:${jobId}`, {
        jobId,
        current: 0,
        total: job.totalFiles,
        message: job.error || 'Download failed',
        status: 'failed',
      } as ProgressEvent);

      logger.error(`Download job ${jobId} failed: ${job.error}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    item.status = 'failed';
    item.error = errorMessage;
    item.completedAt = new Date();

    // Update job in database
    await updateDownloadJob(jobId, {
      status: 'failed',
      error: errorMessage,
    });

    // Emit failed event
    progressEmitter.emit(`progress:${jobId}`, {
      jobId,
      current: 0,
      total: 0,
      message: errorMessage,
      status: 'failed',
    } as ProgressEvent);

    logger.error(`Download job ${jobId} threw error: ${errorMessage}`);
  } finally {
    // Remove from active jobs
    activeJobs.delete(userId);

    // Remove from queue
    const queue = getUserQueue(userId);
    const index = queue.findIndex((i) => i.jobId === jobId);
    if (index !== -1) {
      queue.splice(index, 1);
    }
  }
}

// =============================================================================
// SSE Helpers
// =============================================================================

/**
 * Subscribe to progress events for a job.
 */
export function subscribeToProgress(
  jobId: string,
  callback: (event: ProgressEvent) => void
): () => void {
  const eventName = `progress:${jobId}`;
  progressEmitter.on(eventName, callback);

  return () => {
    progressEmitter.off(eventName, callback);
  };
}

/**
 * Get current progress for a job (for reconnection).
 */
export async function getCurrentProgress(jobId: string): Promise<ProgressEvent | null> {
  const job = await getDownloadJob(jobId);
  if (!job) return null;

  let status: 'preparing' | 'ready' | 'failed';
  switch (job.status) {
    case 'pending':
    case 'preparing':
      status = 'preparing';
      break;
    case 'ready':
    case 'completed':
    case 'downloading':
      status = 'ready';
      break;
    default:
      status = 'failed';
  }

  return {
    jobId,
    current: job.processedFiles,
    total: job.totalFiles,
    message: getStatusMessage(job.status, job.error),
    status,
  };
}

/**
 * Get a user-friendly status message.
 */
function getStatusMessage(status: string, error?: string | null): string {
  switch (status) {
    case 'pending':
      return 'Waiting in queue...';
    case 'preparing':
      return 'Creating archive...';
    case 'ready':
      return 'Ready to download';
    case 'downloading':
      return 'Downloading...';
    case 'completed':
      return 'Download complete';
    case 'failed':
      return error || 'Download failed';
    case 'expired':
      return 'Download expired';
    case 'cancelled':
      return 'Download cancelled';
    default:
      return 'Unknown status';
  }
}
