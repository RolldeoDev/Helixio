/**
 * Rollback Routes
 *
 * API endpoints for viewing operation history and performing rollbacks.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  getOperationHistory,
  getOperation,
  rollbackOperation,
  rollbackBatch,
  cleanupOldOperationLogs,
  getOperationStats,
} from '../services/rollback.service.js';

const router = Router();

// =============================================================================
// Operation History
// =============================================================================

/**
 * GET /api/rollback/history
 * Get operation history with filters.
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const libraryId = req.query.libraryId as string | undefined;
    const operation = req.query.operation as string | undefined;
    const status = req.query.status as string | undefined;
    const daysBack = parseInt(req.query.daysBack as string) || undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await getOperationHistory({
      libraryId,
      operation,
      status,
      daysBack,
      limit,
      offset,
    });

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/rollback/history/:id
 * Get a specific operation.
 */
router.get('/history/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id!;
    const operation = await getOperation(id);

    if (!operation) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }

    res.json(operation);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/rollback/stats
 * Get operation statistics.
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const libraryId = req.query.libraryId as string | undefined;
    const daysBack = parseInt(req.query.daysBack as string) || undefined;

    const stats = await getOperationStats({ libraryId, daysBack });
    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// Rollback Operations
// =============================================================================

/**
 * POST /api/rollback/operation/:id
 * Rollback a single operation.
 */
router.post('/operation/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id!;
    const result = await rollbackOperation(id);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/rollback/batch/:batchId
 * Rollback all operations in a batch.
 */
router.post('/batch/:batchId', async (req: Request, res: Response) => {
  try {
    const batchId = req.params.batchId!;
    const result = await rollbackBatch(batchId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// Cleanup
// =============================================================================

/**
 * POST /api/rollback/cleanup
 * Cleanup old operation logs.
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const daysToKeep = parseInt(req.query.days as string) || undefined;
    const deletedCount = await cleanupOldOperationLogs(daysToKeep);

    res.json({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} operation logs`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
