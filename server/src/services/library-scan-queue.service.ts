/**
 * Library Scan Queue Service
 *
 * BullMQ-powered job queue for background processing of library scans.
 * Scans are processed independently of HTTP request lifecycle.
 *
 * The queue processes jobs sequentially using BullMQ workers:
 * 1. Discovering - Find all comic files
 * 2. Cleaning - Remove orphaned database records
 * 3. Indexing - Create file records and extract ComicInfo.xml
 * 4. Linking - Link files to series (metadata-first, folder fallback)
 * 5. Covers - Extract and cache cover images
 */

import { scanQueueLogger as logger } from './logger.service.js';
import {
  enqueueScan,
  getScanQueueStats,
  getScanQueue,
  closeScanQueue,
} from './queue/scan-queue.js';
import {
  startScanWorker,
  stopScanWorker,
} from './queue/scan-worker.js';
import {
  recoverInterruptedScanJobs,
} from './library-scan-job.service.js';

// =============================================================================
// Types
// =============================================================================

export type QueueItemStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ScanQueueItem {
  jobId: string;
  status: QueueItemStatus;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// =============================================================================
// Queue Configuration
// =============================================================================

/** Maximum number of scan jobs allowed in the queue (for backward compatibility) */
const MAX_QUEUE_SIZE = 20;

/** Maximum number of concurrent library scans (1 = sequential to eliminate race conditions) */
const MAX_CONCURRENT_SCANS = 1;

// =============================================================================
// Queue Management
// =============================================================================

/**
 * Error thrown when the queue is at maximum capacity
 */
export class ScanQueueFullError extends Error {
  constructor(message: string = 'Scan queue is at maximum capacity') {
    super(message);
    this.name = 'ScanQueueFullError';
  }
}

/**
 * Get the current queue length
 */
export async function getQueueLength(): Promise<number> {
  const stats = await getScanQueueStats();
  return stats.waiting + stats.active;
}

/**
 * Get maximum queue size
 */
export function getMaxQueueSize(): number {
  return MAX_QUEUE_SIZE;
}

/**
 * Get the number of currently active scans.
 */
export async function getActiveScansCount(): Promise<number> {
  const stats = await getScanQueueStats();
  return stats.active;
}

/**
 * Get the maximum number of concurrent scans.
 */
export function getMaxConcurrentScans(): number {
  return MAX_CONCURRENT_SCANS;
}

/**
 * Enqueue a scan job for background processing.
 * Returns immediately - the job will be processed asynchronously by BullMQ worker.
 */
export async function enqueueScanJob(jobId: string): Promise<void> {
  await enqueueScan(jobId);
  logger.info({ jobId }, 'Scan job enqueued');
}

/**
 * Get the status of scan jobs in the queue
 */
export async function getScanQueueStatus() {
  return await getScanQueueStats();
}

/**
 * Request cancellation of a scan job
 * Note: BullMQ handles job cancellation via job.remove()
 */
export async function requestCancellation(jobId: string): Promise<boolean> {
  try {
    const queue = getScanQueue();
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed']);

    for (const job of jobs) {
      if (job.data.scanJobId === jobId) {
        await job.remove();
        logger.info({ jobId }, 'Scan job cancelled');
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error({ jobId, error }, 'Failed to cancel scan job');
    return false;
  }
}

// Note: Worker loop removed - BullMQ handles job processing via scan-worker.ts

// =============================================================================
// Startup & Recovery
// =============================================================================

/**
 * Initialize the scan queue and recover interrupted jobs
 */
export async function initializeScanQueue(): Promise<void> {
  logger.info('Initializing scan queue');

  try {
    // Start BullMQ worker
    startScanWorker();

    // Recover any interrupted scan jobs
    const recoveredJobIds = await recoverInterruptedScanJobs();

    // Re-enqueue recovered scan jobs
    for (const jobId of recoveredJobIds) {
      await enqueueScanJob(jobId);
    }

    // Recover interrupted cover jobs from the folder-first scanner
    const { recoverCoverJobs } = await import('./cover-job-queue.service.js');
    const recoveredCoverJobs = await recoverCoverJobs();

    logger.info(
      { recoveredScanJobs: recoveredJobIds.length, recoveredCoverJobs },
      'Scan queue initialized'
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize scan queue');
  }
}

/**
 * Shutdown the scan queue
 */
export async function shutdownScanQueue(): Promise<void> {
  logger.info('Shutting down scan queue');

  try {
    await stopScanWorker();
    await closeScanQueue();
    logger.info('Scan queue shut down');
  } catch (error) {
    logger.error({ err: error }, 'Failed to shutdown scan queue');
  }
}

// =============================================================================
// Export
// =============================================================================

export const ScanQueue = {
  enqueueScanJob,
  getScanQueueStatus,
  requestCancellation,
  getQueueLength,
  getMaxQueueSize,
  getActiveScansCount,
  getMaxConcurrentScans,
  initializeScanQueue,
  shutdownScanQueue,
  ScanQueueFullError,
};

export default ScanQueue;
