/**
 * Reading Queue Routes
 *
 * API endpoints for reading queue management:
 * - Get queue status
 * - Add/remove items
 * - Reorder queue
 * - Auto-advance navigation
 */

import { Router, Request, Response } from 'express';
import { logError } from '../services/logger.service.js';
import {
  getQueue,
  addToQueue,
  addManyToQueue,
  removeFromQueue,
  clearQueue,
  isInQueue,
  getQueuePosition,
  moveInQueue,
  reorderQueue,
  moveToFront,
  getNextInQueue,
  getNextAfter,
  popFromQueue,
} from '../services/reading-queue.service.js';

const router = Router();

// =============================================================================
// Queue CRUD
// =============================================================================

/**
 * GET /api/reading-queue
 * Get the full reading queue with status
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const queue = await getQueue();
    res.json(queue);
  } catch (error) {
    logError('reading-queue', error, { action: 'get-queue' });
    res.status(500).json({
      error: 'Failed to get reading queue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reading-queue/:fileId
 * Add a file to the reading queue
 */
router.post('/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const { position } = req.body as { position?: number };

    const item = await addToQueue(fileId!, position);
    res.status(201).json(item);
  } catch (error) {
    logError('reading-queue', error, { action: 'add-to-queue' });
    res.status(400).json({
      error: 'Failed to add to reading queue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reading-queue/batch
 * Add multiple files to the reading queue
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { fileIds } = req.body as { fileIds: string[] };

    if (!fileIds || !Array.isArray(fileIds)) {
      res.status(400).json({ error: 'fileIds must be an array' });
      return;
    }

    const items = await addManyToQueue(fileIds);
    res.status(201).json({ added: items.length, items });
  } catch (error) {
    logError('reading-queue', error, { action: 'add-batch-to-queue' });
    res.status(400).json({
      error: 'Failed to add batch to reading queue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/reading-queue/:fileId
 * Remove a file from the reading queue
 */
router.delete('/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    await removeFromQueue(fileId!);
    res.json({ success: true });
  } catch (error) {
    logError('reading-queue', error, { action: 'remove-from-queue' });
    res.status(500).json({
      error: 'Failed to remove from reading queue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/reading-queue
 * Clear the entire reading queue
 */
router.delete('/', async (_req: Request, res: Response) => {
  try {
    await clearQueue();
    res.json({ success: true });
  } catch (error) {
    logError('reading-queue', error, { action: 'clear-queue' });
    res.status(500).json({
      error: 'Failed to clear reading queue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Queue Status
// =============================================================================

/**
 * GET /api/reading-queue/check/:fileId
 * Check if a file is in the queue
 */
router.get('/check/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const inQueue = await isInQueue(fileId!);
    const position = await getQueuePosition(fileId!);
    res.json({ inQueue, position });
  } catch (error) {
    logError('reading-queue', error, { action: 'check-queue-status' });
    res.status(500).json({
      error: 'Failed to check queue status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reading-queue/next
 * Get the next item in the queue (position 0)
 */
router.get('/next', async (_req: Request, res: Response) => {
  try {
    const next = await getNextInQueue();
    res.json(next);
  } catch (error) {
    logError('reading-queue', error, { action: 'get-next-in-queue' });
    res.status(500).json({
      error: 'Failed to get next in queue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reading-queue/next-after/:fileId
 * Get the item after a specific file in the queue
 */
router.get('/next-after/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const next = await getNextAfter(fileId!);
    res.json(next);
  } catch (error) {
    logError('reading-queue', error, { action: 'get-next-after-in-queue' });
    res.status(500).json({
      error: 'Failed to get next after in queue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reading-queue/pop
 * Pop the first item from the queue (removes it and returns the file ID)
 */
router.post('/pop', async (_req: Request, res: Response) => {
  try {
    const fileId = await popFromQueue();
    res.json({ fileId });
  } catch (error) {
    logError('reading-queue', error, { action: 'pop-from-queue' });
    res.status(500).json({
      error: 'Failed to pop from queue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Queue Reordering
// =============================================================================

/**
 * PUT /api/reading-queue/:fileId/position
 * Move an item to a new position in the queue
 */
router.put('/:fileId/position', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const { position } = req.body as { position: number };

    if (typeof position !== 'number') {
      res.status(400).json({ error: 'position must be a number' });
      return;
    }

    await moveInQueue(fileId!, position);
    res.json({ success: true });
  } catch (error) {
    logError('reading-queue', error, { action: 'move-in-queue' });
    res.status(400).json({
      error: 'Failed to move item in queue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/reading-queue/:fileId/front
 * Move an item to the front of the queue
 */
router.put('/:fileId/front', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    await moveToFront(fileId!);
    res.json({ success: true });
  } catch (error) {
    logError('reading-queue', error, { action: 'move-to-front' });
    res.status(400).json({
      error: 'Failed to move item to front',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/reading-queue/reorder
 * Reorder the entire queue
 */
router.put('/reorder', async (req: Request, res: Response) => {
  try {
    const { fileIds } = req.body as { fileIds: string[] };

    if (!fileIds || !Array.isArray(fileIds)) {
      res.status(400).json({ error: 'fileIds must be an array' });
      return;
    }

    await reorderQueue(fileIds);
    res.json({ success: true });
  } catch (error) {
    logError('reading-queue', error, { action: 'reorder-queue' });
    res.status(400).json({
      error: 'Failed to reorder queue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
