/**
 * Library Scan Queue Service
 *
 * Provides an in-memory job queue for background processing of library scans.
 * Scans are processed independently of HTTP request lifecycle.
 *
 * The queue processes jobs sequentially, executing the full scan workflow:
 * 1. Discovering - Find all comic files
 * 2. Cleaning - Remove orphaned database records
 * 3. Indexing - Create file records and extract ComicInfo.xml
 * 4. Linking - Link files to series (metadata-first, folder fallback)
 * 5. Covers - Extract and cache cover images
 */

import { scanQueueLogger as logger } from './logger.service.js';
import {
  getScanJob,
  updateScanJobStatus,
  updateScanJobProgress,
  addScanJobLog,
  failScanJob,
  recoverInterruptedScanJobs,
  type ScanJobStatus,
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

/** Maximum number of scan jobs allowed in the queue */
const MAX_QUEUE_SIZE = 20;

/** Maximum number of concurrent library scans (1 = sequential to eliminate race conditions) */
const MAX_CONCURRENT_SCANS = 1;

// =============================================================================
// Queue State
// =============================================================================

/** In-memory queue of pending scan jobs */
const queue: ScanQueueItem[] = [];

/** Currently processing items (multiple allowed for multi-library parallelism) */
const activeScans = new Map<string, ScanQueueItem>();

/** Whether the worker loop is running */
let isWorkerRunning = false;

/** Cancellation tokens for active scans */
const cancellationTokens = new Map<string, { cancelled: boolean }>();

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
 * Get the number of currently active scans.
 */
export function getActiveScansCount(): number {
  return activeScans.size;
}

/**
 * Get the maximum number of concurrent scans.
 */
export function getMaxConcurrentScans(): number {
  return MAX_CONCURRENT_SCANS;
}

/**
 * Enqueue a scan job for background processing.
 * Returns immediately - the job will be processed asynchronously.
 * @throws {ScanQueueFullError} When the queue is at maximum capacity
 */
export function enqueueScanJob(jobId: string): ScanQueueItem {
  // Check if this job is already queued or processing
  const existing = queue.find((item) => item.jobId === jobId && item.status === 'queued');
  if (existing) {
    return existing;
  }

  // Check if already processing
  const activeItem = activeScans.get(jobId);
  if (activeItem) {
    return activeItem;
  }

  // Check queue capacity before adding new items
  if (queue.length >= MAX_QUEUE_SIZE) {
    throw new ScanQueueFullError(`Scan queue is full (max: ${MAX_QUEUE_SIZE} items). Please try again later.`);
  }

  const item: ScanQueueItem = {
    jobId,
    status: 'queued',
    queuedAt: new Date(),
  };

  queue.push(item);
  logger.info({ jobId }, 'Scan job enqueued');

  // Ensure worker is running
  startWorker();

  return item;
}

/**
 * Get the status of a scan job in the queue
 */
export function getScanQueueStatus(jobId: string): ScanQueueItem | null {
  // Check if currently processing
  const activeItem = activeScans.get(jobId);
  if (activeItem) {
    return activeItem;
  }

  // Check queue
  return queue.find((item) => item.jobId === jobId) || null;
}

/**
 * Check if a scan job is in the queue
 */
export function isScanJobInQueue(jobId: string): boolean {
  if (activeScans.has(jobId)) {
    return true;
  }
  return queue.some((item) => item.jobId === jobId && item.status === 'queued');
}

/**
 * Request cancellation of a scan job
 */
export function requestCancellation(jobId: string): boolean {
  const token = cancellationTokens.get(jobId);
  if (token) {
    token.cancelled = true;
    return true;
  }

  // Also remove from queue if not yet started
  const index = queue.findIndex((item) => item.jobId === jobId && item.status === 'queued');
  if (index !== -1) {
    queue.splice(index, 1);
    return true;
  }

  return false;
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
 * Handle successful scan completion
 */
function handleScanComplete(item: ScanQueueItem): void {
  item.status = 'completed';
  item.completedAt = new Date();
  logger.info({ jobId: item.jobId }, 'Scan job completed');
  cleanupScan(item);
}

/**
 * Handle scan error
 * Note: SSE error broadcast is handled by failScanJob() in library-scan-job.service.ts
 */
function handleScanError(item: ScanQueueItem, error: unknown): void {
  item.status = 'failed';
  item.completedAt = new Date();
  item.error = error instanceof Error ? error.message : 'Unknown error';
  logger.error({ jobId: item.jobId, err: error }, 'Scan job failed');

  cleanupScan(item);
}

/**
 * Clean up after a scan completes or fails
 */
function cleanupScan(item: ScanQueueItem): void {
  // Cleanup cancellation token
  cancellationTokens.delete(item.jobId);

  // Remove from active scans
  activeScans.delete(item.jobId);

  // Remove from queue
  const index = queue.indexOf(item);
  if (index !== -1) {
    queue.splice(index, 1);
  }

  // Check for more items to process
  scheduleNextProcess();
}

/**
 * Process the queue - supports multiple concurrent scans
 */
async function processQueue(): Promise<void> {
  // Check how many slots are available
  const availableSlots = MAX_CONCURRENT_SCANS - activeScans.size;
  if (availableSlots <= 0) {
    // All slots full, wait for a scan to complete
    return;
  }

  // Get queued items that can be started
  const queuedItems = queue.filter((item) => item.status === 'queued');
  if (queuedItems.length === 0) {
    // No more items to process
    if (activeScans.size === 0) {
      isWorkerRunning = false;
    }
    return;
  }

  // Start up to availableSlots scans
  const itemsToStart = queuedItems.slice(0, availableSlots);

  for (const item of itemsToStart) {
    // Mark as processing
    item.status = 'processing';
    item.startedAt = new Date();

    // Add to active scans
    activeScans.set(item.jobId, item);

    // Create cancellation token
    const cancellationToken = { cancelled: false };
    cancellationTokens.set(item.jobId, cancellationToken);

    logger.info({
      jobId: item.jobId,
      activeScans: activeScans.size,
      maxConcurrent: MAX_CONCURRENT_SCANS,
    }, 'Starting scan job (parallel mode)');

    // Start scan without awaiting - fire and forget with callbacks
    executeFullScan(item.jobId, cancellationToken)
      .then(() => handleScanComplete(item))
      .catch((err) => handleScanError(item, err));
  }
}

/**
 * Schedule the next queue processing
 */
function scheduleNextProcess(): void {
  setImmediate(() => {
    processQueue().catch((err) => {
      logger.error({ err }, 'Queue processing error');
    });
  });
}

// =============================================================================
// Scan Execution
// =============================================================================

/**
 * Execute the full library scan workflow using new 5-phase scanner.
 */
async function executeFullScan(
  jobId: string,
  cancellationToken: { cancelled: boolean }
): Promise<void> {
  const job = await getScanJob(jobId);
  if (!job) {
    throw new Error('Scan job not found');
  }

  const libraryId = job.libraryId;
  const forceFullScan = job.options?.forceFullScan ?? false;

  try {
    // Import new scanner
    const { scanLibrary } = await import('./library-scanner/index.js');

    // Run the scan with the new 5-phase scanner
    // Delta scanning is enabled by default; forceFullScan disables it
    const result = await scanLibrary(libraryId, {
      forceFullScan,
      onProgress: async (progress) => {
        // Map phase to job stage
        const stageMap: Record<string, string> = {
          discovery: 'discovering',
          metadata: 'indexing',
          series: 'linking',
          linking: 'linking',
          covers: 'covers',
          complete: 'complete',
        };

        const stage = stageMap[progress.phase] ?? progress.phase;

        await updateScanJobStatus(jobId, stage as ScanJobStatus, stage);
        await updateScanJobProgress(jobId, {
          discoveredFiles: progress.phase === 'discovery' ? progress.current : undefined,
          indexedFiles: progress.phase === 'metadata' ? progress.current : undefined,
          linkedFiles: progress.phase === 'linking' ? progress.current : undefined,
          coversExtracted: progress.phase === 'covers' ? progress.current : undefined,
          totalFiles: progress.total > 0 ? progress.total : undefined,
        });
        await addScanJobLog(jobId, stage, progress.message, progress.detail, 'info');
      },
      shouldCancel: () => cancellationToken.cancelled,
    });

    if (!result.success) {
      if (result.error === 'Scan cancelled') {
        await updateScanJobStatus(jobId, 'cancelled');
        await addScanJobLog(jobId, 'cancelled', 'Scan cancelled by user', undefined, 'warning');
        return;
      }
      throw new Error(result.error ?? 'Scan failed');
    }

    await updateScanJobStatus(jobId, 'complete', 'complete');
    await addScanJobLog(
      jobId,
      'complete',
      'Library scan completed successfully',
      `Duration: ${Math.round(result.totalDuration / 1000)}s`,
      'success'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await failScanJob(jobId, errorMessage);
    throw error;
  }
}

// =============================================================================
// Startup Recovery
// =============================================================================

/**
 * Initialize the scan queue and recover interrupted jobs
 */
export async function initializeScanQueue(): Promise<void> {
  logger.info('Initializing scan queue');

  try {
    // Recover any interrupted jobs
    const recoveredJobIds = await recoverInterruptedScanJobs();

    // Re-enqueue recovered jobs
    for (const jobId of recoveredJobIds) {
      enqueueScanJob(jobId);
    }

    logger.info({ recoveredCount: recoveredJobIds.length }, 'Scan queue initialized');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize scan queue');
  }
}

// =============================================================================
// Export
// =============================================================================

export const ScanQueue = {
  enqueueScanJob,
  getScanQueueStatus,
  isScanJobInQueue,
  requestCancellation,
  getQueueLength,
  getMaxQueueSize,
  getActiveScansCount,
  getMaxConcurrentScans,
  initializeScanQueue,
  ScanQueueFullError,
};

export default ScanQueue;
