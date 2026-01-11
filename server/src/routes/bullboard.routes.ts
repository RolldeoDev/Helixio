/**
 * BullBoard Dashboard Routes
 *
 * Provides a web UI for monitoring BullMQ queues.
 * Accessible only to admin users at /api/admin/queues
 */

import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getCoverQueue } from '../services/queue/cover-worker.js';
import { getScanQueue } from '../services/queue/scan-queue.js';
import { jobQueueLogger as logger } from '../services/logger.service.js';

// Create Express adapter for BullBoard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/queues');

/**
 * Initialize BullBoard with all queues
 */
export function initializeBullBoard(): void {
  try {
    // Get queue instances
    const coverQueue = getCoverQueue();
    const scanQueue = getScanQueue();

    // Create BullBoard
    createBullBoard({
      queues: [
        new BullMQAdapter(coverQueue),
        new BullMQAdapter(scanQueue),
      ],
      serverAdapter,
    });

    logger.info('BullBoard dashboard initialized at /api/admin/queues');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize BullBoard');
  }
}

/**
 * Get BullBoard router
 * Note: Should be protected with requireAdmin middleware
 */
export function getBullBoardRouter(): Router {
  return serverAdapter.getRouter();
}

const router = Router();

// Re-export for convenience
export default router;
