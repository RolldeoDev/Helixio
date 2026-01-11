/**
 * Library Scan Worker
 *
 * BullMQ worker for processing library scan jobs.
 * Delegates to existing orchestrateScan() service for business logic.
 */

import { Worker, Job } from 'bullmq';
import { REDIS_CONFIG, QUEUE_NAMES, SCAN_QUEUE_CONFIG } from './bull-config.js';
import type { ScanJobData } from './scan-queue.js';
import {
  getScanJob,
  updateScanJobStatus,
  updateScanJobProgress,
  addScanJobLog,
  failScanJob,
  type ScanJobStatus,
} from '../library-scan-job.service.js';
import { orchestrateScan } from '../scanner.service.js';
import { setCoverQueueLowPriorityMode } from '../cover-job-queue.service.js';
import { memoryCache } from '../memory-cache.service.js';
import { scanQueueLogger as logger } from '../logger.service.js';

// =============================================================================
// Worker State
// =============================================================================

let worker: Worker<ScanJobData, void> | null = null;

// =============================================================================
// Worker Implementation
// =============================================================================

/**
 * Start the library scan worker
 */
export function startScanWorker(): void {
  if (worker) {
    logger.warn('Scan worker already running');
    return;
  }

  worker = new Worker<ScanJobData, void>(
    QUEUE_NAMES.SCAN,
    async (job: Job<ScanJobData>) => {
      return await processScanJob(job);
    },
    {
      connection: REDIS_CONFIG,
      concurrency: SCAN_QUEUE_CONFIG.concurrency, // Sequential processing (1 at a time)
    }
  );

  // Event handlers
  worker.on('completed', (job) => {
    logger.info(
      { scanJobId: job.data.scanJobId, duration: Date.now() - job.processedOn! },
      'Scan job completed'
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { scanJobId: job?.data.scanJobId, error: err.message },
      'Scan job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Scan worker error');
  });

  logger.info(
    { concurrency: SCAN_QUEUE_CONFIG.concurrency, queueName: QUEUE_NAMES.SCAN },
    'Scan worker started'
  );
}

/**
 * Stop the library scan worker
 */
export async function stopScanWorker(): Promise<void> {
  if (!worker) return;

  await worker.close();
  worker = null;

  logger.info('Scan worker stopped');
}

// =============================================================================
// Job Processing
// =============================================================================

/**
 * Process a single library scan job
 */
async function processScanJob(job: Job<ScanJobData>): Promise<void> {
  const { scanJobId, libraryId, forceFullScan } = job.data;

  const dbJob = await getScanJob(scanJobId);
  if (!dbJob) {
    throw new Error(`Scan job ${scanJobId} not found in database`);
  }

  logger.info(
    { scanJobId, libraryId, forceFullScan },
    'Starting library scan'
  );

  // Set cache scan state and reduce cover queue priority
  memoryCache.setScanActive(true);
  setCoverQueueLowPriorityMode(true);

  try {
    await updateScanJobStatus(scanJobId, 'discovering', 'discovering');

    // Create abort controller for cancellation support
    const abortController = new AbortController();

    // Run scan orchestrator (existing logic)
    const result = await orchestrateScan(libraryId, {
      forceFullScan,
      abortSignal: abortController.signal,
      onProgress: async (progress) => {
        // Update BullMQ job progress
        await job.updateProgress({
          current: progress.foldersComplete,
          total: progress.foldersTotal,
          message: `Phase: ${progress.phase}, Folder: ${progress.currentFolder || 'N/A'}`,
        });

        // Map scanner phases to job stages
        const stageMap: Record<string, ScanJobStatus> = {
          enumerating: 'discovering',
          processing: 'indexing',
          covers: 'covers',
          complete: 'complete',
          error: 'error',
        };

        const stage = stageMap[progress.phase] ?? progress.phase as ScanJobStatus;

        // Update DB job progress
        await updateScanJobProgress(scanJobId, {
          discoveredFiles: progress.foldersTotal,
          indexedFiles: progress.filesCreated + progress.filesUpdated,
          linkedFiles: progress.filesCreated + progress.filesUpdated,
          seriesCreated: progress.seriesCreated,
          coversExtracted: progress.coverJobsComplete,
          totalFiles: progress.filesCreated + progress.filesUpdated + progress.filesOrphaned,
        });

        // Update status
        await updateScanJobStatus(scanJobId, stage, stage);
      },
    });

    await updateScanJobStatus(scanJobId, 'complete', 'complete');
    await addScanJobLog(
      scanJobId,
      'complete',
      'Library scan completed successfully',
      `Duration: ${Math.round(result.elapsedMs / 1000)}s, Files: ${result.filesCreated} new, ${result.filesUpdated} updated, ${result.filesOrphaned} orphaned`,
      'success'
    );

    logger.info(
      {
        scanJobId,
        libraryId,
        duration: result.elapsedMs,
        filesCreated: result.filesCreated,
        filesUpdated: result.filesUpdated,
      },
      'Library scan completed'
    );
  } catch (error) {
    // Check if scan was aborted (cancellation)
    if (error instanceof Error && error.message === 'Scan aborted') {
      await updateScanJobStatus(scanJobId, 'cancelled');
      await addScanJobLog(
        scanJobId,
        'cancelled',
        'Scan cancelled by user',
        undefined,
        'warning'
      );
      logger.warn({ scanJobId }, 'Scan cancelled');
      return;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await failScanJob(scanJobId, errorMessage);
    logger.error({ scanJobId, error: errorMessage }, 'Scan job failed');
    throw error;
  } finally {
    // Cleanup: restore normal modes
    memoryCache.setScanActive(false);
    setCoverQueueLowPriorityMode(false);
  }
}
