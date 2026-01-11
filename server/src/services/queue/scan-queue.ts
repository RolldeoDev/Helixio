/**
 * Library Scan Queue
 *
 * BullMQ queue for library scanning with folder batching.
 * Uses BullMQ Flow for parallel batch processing.
 */

import { Queue, FlowProducer } from 'bullmq';
import { REDIS_CONFIG, QUEUE_NAMES, SCAN_QUEUE_CONFIG } from './bull-config.js';
import { getDatabase } from '../database.service.js';
import { scanQueueLogger as logger } from '../logger.service.js';

// =============================================================================
// Types
// =============================================================================

export interface ScanJobData {
  scanJobId: string; // LibraryScanJob.id from database
  libraryId: string;
  libraryPath: string;
  forceFullScan: boolean;
}

export interface FolderBatchJobData extends ScanJobData {
  folders: string[]; // Batch of folder paths
  batchIndex: number;
  totalBatches: number;
}

// =============================================================================
// Queue and Flow Setup
// =============================================================================

let scanQueue: Queue<ScanJobData | FolderBatchJobData> | null = null;
let flowProducer: FlowProducer | null = null;

/**
 * Get or create the scan queue
 */
export function getScanQueue(): Queue<ScanJobData | FolderBatchJobData> {
  if (scanQueue) return scanQueue;

  scanQueue = new Queue(QUEUE_NAMES.SCAN, {
    connection: REDIS_CONFIG,
  });

  logger.info({ queueName: QUEUE_NAMES.SCAN }, 'Scan queue created');

  return scanQueue;
}

/**
 * Get or create the flow producer
 */
function getFlowProducer(): FlowProducer {
  if (flowProducer) return flowProducer;

  flowProducer = new FlowProducer({
    connection: REDIS_CONFIG,
  });

  logger.info('Scan flow producer created');

  return flowProducer;
}

/**
 * Close scan queue and flow producer
 */
export async function closeScanQueue(): Promise<void> {
  if (scanQueue) {
    await scanQueue.close();
    scanQueue = null;
  }

  if (flowProducer) {
    await flowProducer.close();
    flowProducer = null;
  }

  logger.info('Scan queue closed');
}

// =============================================================================
// Enqueue Functions
// =============================================================================

/**
 * Enqueue a library scan job with folder batching
 */
export async function enqueueScan(scanJobId: string): Promise<void> {
  const db = getDatabase();

  // Get scan job from database
  const job = await db.libraryScanJob.findUnique({
    where: { id: scanJobId },
    include: { library: true },
  });

  if (!job) {
    throw new Error(`Scan job ${scanJobId} not found`);
  }

  logger.info(
    { scanJobId, libraryId: job.libraryId },
    'Enqueueing library scan job'
  );

  // For now, enqueue as single job (batching logic will be in worker)
  // This simplifies the implementation while still using BullMQ
  const queue = getScanQueue();

  // Parse options from JSON string
  const options = job.options ? JSON.parse(job.options) : {};

  await queue.add('scan', {
    scanJobId,
    libraryId: job.libraryId,
    libraryPath: job.library.rootPath,
    forceFullScan: options.forceFullScan ?? false,
  });

  logger.info({ scanJobId }, 'Scan job added to queue');
}

/**
 * Get scan queue statistics
 */
export async function getScanQueueStats() {
  const queue = getScanQueue();

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
