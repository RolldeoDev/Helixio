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
  type ProgressCallback,
} from './library-scan-job.service.js';
import { parallelMap, getOptimalConcurrency } from './parallel.service.js';

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

/** Maximum number of concurrent library scans */
const MAX_CONCURRENT_SCANS = 3;

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
 * Execute the full library scan workflow
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

  // Helper to check cancellation
  const checkCancellation = async (): Promise<boolean> => {
    if (cancellationToken.cancelled) {
      await updateScanJobStatus(jobId, 'cancelled');
      await addScanJobLog(jobId, job.currentStage, 'Scan cancelled', undefined, 'warning');
      return true;
    }
    return false;
  };

  // Helper to create progress callback for a stage
  const createProgressCallback = (stage: string): ProgressCallback => {
    return async (message: string, detail?: string) => {
      await addScanJobLog(jobId, stage, message, detail, 'info');
    };
  };

  try {
    // Import services dynamically to avoid circular dependencies
    const { discoverFiles, applyScanResults, scanLibrary } = await import('./scanner.service.js');
    const { batchExtractCovers } = await import('./cover.service.js');
    const { getDatabase } = await import('./database.service.js');
    const { linkFileToSeriesWithFolderFallback, autoLinkAllFiles } = await import('./series-matcher.service.js');

    const prisma = getDatabase();

    // Get library
    const library = await prisma.library.findUnique({ where: { id: libraryId } });
    if (!library) {
      throw new Error('Library not found');
    }

    // =============================================================================
    // Stage 1: Discovering
    // =============================================================================
    await updateScanJobStatus(jobId, 'discovering', 'discovering');
    await addScanJobLog(jobId, 'discovering', 'Starting file discovery', library.rootPath, 'info');

    const discoveryResult = await discoverFiles(library.rootPath, {
      includeHash: true,
    });

    await updateScanJobProgress(jobId, {
      discoveredFiles: discoveryResult.files.length,
      totalFiles: discoveryResult.files.length,
    });
    await addScanJobLog(
      jobId,
      'discovering',
      `Discovered ${discoveryResult.files.length} files`,
      discoveryResult.errors.length > 0 ? `${discoveryResult.errors.length} errors` : undefined,
      'success'
    );

    if (await checkCancellation()) return;

    // =============================================================================
    // Stage 2: Cleaning (Orphan detection)
    // =============================================================================
    await updateScanJobStatus(jobId, 'cleaning', 'cleaning');
    await addScanJobLog(jobId, 'cleaning', 'Detecting changes and orphaned files', undefined, 'info');

    // Use existing scanLibrary to detect changes
    const scanResult = await scanLibrary(libraryId);

    await updateScanJobProgress(jobId, {
      orphanedFiles: scanResult.orphanedFiles.length,
    });

    // Apply scan results (creates new files, removes orphans)
    const hasChanges =
      scanResult.newFiles.length > 0 ||
      scanResult.movedFiles.length > 0 ||
      scanResult.orphanedFiles.length > 0;

    if (hasChanges) {
      await applyScanResults(scanResult);
      await addScanJobLog(
        jobId,
        'cleaning',
        'Applied scan changes',
        `New: ${scanResult.newFiles.length}, Moved: ${scanResult.movedFiles.length}, Orphaned: ${scanResult.orphanedFiles.length}`,
        'success'
      );
    } else {
      await addScanJobLog(jobId, 'cleaning', 'No file changes detected', undefined, 'info');
    }

    if (await checkCancellation()) return;

    // =============================================================================
    // Stage 3: Indexing (ComicInfo.xml extraction) - PARALLEL
    // =============================================================================
    await updateScanJobStatus(jobId, 'indexing', 'indexing');
    await addScanJobLog(jobId, 'indexing', 'Extracting metadata from files', undefined, 'info');

    // Get all files that need metadata extraction
    const filesToIndex = await prisma.comicFile.findMany({
      where: {
        libraryId,
        status: { in: ['pending', 'indexed'] },
      },
      include: {
        metadata: true,
      },
    });

    // Import metadata cache service
    const { refreshMetadataCache } = await import('./metadata-cache.service.js');

    // Filter to only files that need indexing
    const filesToActuallyIndex = filesToIndex.filter(
      (file) => !file.metadata || !file.metadata.lastScanned
    );

    let indexedCount = 0;
    let indexErrorCount = 0;
    const indexBatchSize = 20; // Increased batch size for parallel processing
    const indexConcurrency = getOptimalConcurrency('io'); // Metadata extraction is I/O bound

    for (let i = 0; i < filesToActuallyIndex.length; i += indexBatchSize) {
      if (await checkCancellation()) return;

      const batch = filesToActuallyIndex.slice(i, i + indexBatchSize);

      // Process batch in parallel
      const batchResult = await parallelMap(
        batch,
        async (file) => {
          await refreshMetadataCache(file.id);
          return { fileId: file.id, success: true };
        },
        {
          concurrency: indexConcurrency,
          shouldCancel: () => cancellationToken.cancelled,
        }
      );

      // Count results
      for (const result of batchResult.results) {
        if (result.success) {
          indexedCount++;
        } else {
          indexErrorCount++;
          logger.warn({ fileId: batch[result.index]?.id, error: result.error }, 'Failed to extract metadata');
        }
      }

      await updateScanJobProgress(jobId, {
        indexedFiles: indexedCount,
        errorCount: job.errorCount + indexErrorCount,
      });

      // Log progress every batch
      await addScanJobLog(
        jobId,
        'indexing',
        `Indexed ${indexedCount} of ${filesToActuallyIndex.length} files`,
        indexErrorCount > 0 ? `${indexErrorCount} errors` : undefined,
        'info'
      );
    }

    // Add files that didn't need indexing to the count
    indexedCount += filesToIndex.length - filesToActuallyIndex.length;

    await addScanJobLog(jobId, 'indexing', `Completed metadata extraction`, `${indexedCount} files indexed`, 'success');

    if (await checkCancellation()) return;

    // =============================================================================
    // Stage 4: Linking (Series assignment with folder fallback) - PARALLEL
    // =============================================================================
    await updateScanJobStatus(jobId, 'linking', 'linking');
    await addScanJobLog(jobId, 'linking', 'Linking files to series', undefined, 'info');

    // Get files that need linking
    const filesToLink = await prisma.comicFile.findMany({
      where: {
        libraryId,
        seriesId: null,
        status: { in: ['pending', 'indexed'] },
      },
      include: {
        metadata: true,
      },
    });

    let linkedCount = 0;
    let seriesCreatedCount = 0;
    const linkBatchSize = 20; // Increased batch size for parallel processing
    // Use lower concurrency for linking since it involves DB writes and potential series creation
    const linkConcurrency = Math.min(getOptimalConcurrency('io'), 4);

    for (let i = 0; i < filesToLink.length; i += linkBatchSize) {
      if (await checkCancellation()) return;

      const batch = filesToLink.slice(i, i + linkBatchSize);

      // Process batch in parallel
      const batchResult = await parallelMap(
        batch,
        async (file) => {
          const result = await linkFileToSeriesWithFolderFallback(file.id);
          return {
            fileId: file.id,
            linked: result.linked,
            seriesCreated: result.seriesCreated || false,
          };
        },
        {
          concurrency: linkConcurrency,
          shouldCancel: () => cancellationToken.cancelled,
        }
      );

      // Count results
      for (const result of batchResult.results) {
        if (result.success && result.result) {
          if (result.result.linked) {
            linkedCount++;
            if (result.result.seriesCreated) {
              seriesCreatedCount++;
            }
          }
        } else {
          logger.warn({ fileId: batch[result.index]?.id, error: result.error }, 'Failed to link file to series');
        }
      }

      await updateScanJobProgress(jobId, {
        linkedFiles: linkedCount,
        seriesCreated: seriesCreatedCount,
      });

      // Log progress every batch
      await addScanJobLog(
        jobId,
        'linking',
        `Linked ${linkedCount} of ${filesToLink.length} files`,
        `${seriesCreatedCount} series created`,
        'info'
      );
    }

    // Also run the standard auto-link for any remaining files
    await autoLinkAllFiles();

    await addScanJobLog(
      jobId,
      'linking',
      'Completed series linking',
      `${linkedCount} files linked, ${seriesCreatedCount} series created`,
      'success'
    );

    if (await checkCancellation()) return;

    // =============================================================================
    // Stage 5: Covers
    // =============================================================================
    await updateScanJobStatus(jobId, 'covers', 'covers');
    await addScanJobLog(jobId, 'covers', 'Extracting cover images', undefined, 'info');

    // Get all file IDs for cover extraction
    const allFiles = await prisma.comicFile.findMany({
      where: {
        libraryId,
        status: { in: ['pending', 'indexed'] },
      },
      select: { id: true },
    });

    const fileIds = allFiles.map((f) => f.id);
    let coversExtracted = 0;

    // Extract covers in batches with progress
    const coverBatchSize = 20;
    for (let i = 0; i < fileIds.length; i += coverBatchSize) {
      if (await checkCancellation()) return;

      const batch = fileIds.slice(i, i + coverBatchSize);
      const result = await batchExtractCovers(batch);

      coversExtracted += result.success + result.cached;
      await updateScanJobProgress(jobId, { coversExtracted });

      if (i % 100 === 0) {
        await addScanJobLog(
          jobId,
          'covers',
          `Extracted ${coversExtracted} of ${fileIds.length} covers`,
          undefined,
          'info'
        );
      }
    }

    await addScanJobLog(
      jobId,
      'covers',
      'Completed cover extraction',
      `${coversExtracted} covers cached`,
      'success'
    );

    // =============================================================================
    // Complete
    // =============================================================================
    await updateScanJobStatus(jobId, 'complete', 'complete');
    await addScanJobLog(
      jobId,
      'complete',
      'Library scan completed successfully',
      `${discoveryResult.files.length} files, ${linkedCount} linked, ${coversExtracted} covers`,
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
