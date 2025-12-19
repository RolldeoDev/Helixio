/**
 * Batch Operation Routes
 *
 * API endpoints for batch operations including:
 * - Batch creation and execution
 * - Progress tracking
 * - Cancellation and resume
 * - Retry failed items
 * - Batch history
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  createBatch,
  createConversionBatch,
  executeBatch,
  requestCancellation,
  abandonBatch,
  getBatch,
  getLibraryBatches,
  getRecentBatches,
  findInterruptedBatches,
  retryFailedItems,
  cleanupOldBatches,
  hasActiveBatch,
  getActiveBatchId,
  type BatchCreateOptions,
  type BatchProgress,
} from '../services/batch.service.js';
import {
  generateRenamePreview,
  generateMovePreview,
  generateMetadataUpdatePreview,
  generateDeletePreview,
  type BatchPreviewItem,
} from '../services/batch-preview.service.js';
import { getDatabase } from '../services/database.service.js';

const router = Router();

// =============================================================================
// Batch Status & Active Batch
// =============================================================================

/**
 * GET /api/batches/active
 * Check if there's an active batch running.
 */
router.get('/active', (_req: Request, res: Response) => {
  const activeBatchId = getActiveBatchId();
  res.json({
    hasActiveBatch: hasActiveBatch(),
    activeBatchId,
  });
});

/**
 * GET /api/batches/interrupted
 * Find interrupted batches (for resume on startup).
 */
router.get('/interrupted', async (_req: Request, res: Response) => {
  try {
    const batches = await findInterruptedBatches();
    res.json({ batches });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/batches/recent
 * Get recent batches across all libraries.
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const batches = await getRecentBatches(limit);
    res.json({ batches });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// Batch Preview (Before Creation)
// =============================================================================

/**
 * POST /api/batches/preview/rename
 * Generate rename preview for files.
 */
router.post('/preview/rename', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds } = req.body as { fileIds: string[] };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: 'fileIds array required' });
      return;
    }

    const preview = await generateRenamePreview(fileIds);
    res.json(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/batches/preview/move
 * Generate move preview for files.
 */
router.post('/preview/move', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds, destinationFolder } = req.body as {
      fileIds: string[];
      destinationFolder: string;
    };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: 'fileIds array required' });
      return;
    }

    if (!destinationFolder) {
      res.status(400).json({ error: 'destinationFolder required' });
      return;
    }

    const preview = await generateMovePreview(fileIds, destinationFolder);
    res.json(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/batches/preview/metadata
 * Generate metadata update preview for files.
 */
router.post('/preview/metadata', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds, metadata } = req.body as {
      fileIds: string[];
      metadata: Record<string, unknown>;
    };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: 'fileIds array required' });
      return;
    }

    if (!metadata || Object.keys(metadata).length === 0) {
      res.status(400).json({ error: 'metadata object required' });
      return;
    }

    const preview = await generateMetadataUpdatePreview(fileIds, metadata);
    res.json(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/batches/preview/delete
 * Generate delete preview for files.
 */
router.post('/preview/delete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds } = req.body as { fileIds: string[] };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: 'fileIds array required' });
      return;
    }

    const preview = await generateDeletePreview(fileIds);
    res.json(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// Batch Creation
// =============================================================================

/**
 * POST /api/batches
 * Create a new batch operation.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const options = req.body as BatchCreateOptions;

    if (!options.type) {
      res.status(400).json({ error: 'Batch type required' });
      return;
    }

    if (!options.items || !Array.isArray(options.items) || options.items.length === 0) {
      res.status(400).json({ error: 'items array required' });
      return;
    }

    // Check if another batch is running
    if (hasActiveBatch()) {
      res.status(409).json({
        error: 'Another batch operation is already running',
        activeBatchId: getActiveBatchId(),
      });
      return;
    }

    const result = await createBatch(options);
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/batches/conversion/:libraryId
 * Create a conversion batch for all CBR files in a library.
 */
router.post('/conversion/:libraryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const libraryId = req.params.libraryId!;

    // Check if another batch is running
    if (hasActiveBatch()) {
      res.status(409).json({
        error: 'Another batch operation is already running',
        activeBatchId: getActiveBatchId(),
      });
      return;
    }

    const result = await createConversionBatch(libraryId);
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/batches/from-preview
 * Create a batch from a preview result (with user-approved items).
 */
router.post('/from-preview', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, libraryId, items } = req.body as {
      type: string;
      libraryId?: string;
      items: BatchPreviewItem[];
    };

    if (!type) {
      res.status(400).json({ error: 'type required' });
      return;
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items array required' });
      return;
    }

    // Filter to approved items only
    const approvedItems = items.filter((item) => item.approved !== false);

    if (approvedItems.length === 0) {
      res.status(400).json({ error: 'No approved items in preview' });
      return;
    }

    // Check if another batch is running
    if (hasActiveBatch()) {
      res.status(409).json({
        error: 'Another batch operation is already running',
        activeBatchId: getActiveBatchId(),
      });
      return;
    }

    // Create the batch
    const db = getDatabase();

    const batch = await db.batchOperation.create({
      data: {
        type,
        libraryId: libraryId || null,
        status: 'pending',
        totalItems: approvedItems.length,
        completedItems: 0,
        failedItems: 0,
      },
    });

    // Create pending operation log entries for each item
    for (const item of approvedItems) {
      await db.operationLog.create({
        data: {
          operation: type,
          source: item.sourcePath,
          destination: item.destinationPath || null,
          status: 'pending',
          reversible: type !== 'delete',
          metadata: item.metadata ? JSON.stringify(item.metadata) : null,
          batchId: batch.id,
        },
      });
    }

    res.status(201).json({
      id: batch.id,
      itemCount: approvedItems.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// Batch Execution & Control
// =============================================================================

/**
 * POST /api/batches/:id/execute
 * Execute a batch operation.
 */
router.post('/:id/execute', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;

    // Check if another batch is running
    if (hasActiveBatch() && getActiveBatchId() !== id) {
      res.status(409).json({
        error: 'Another batch operation is already running',
        activeBatchId: getActiveBatchId(),
      });
      return;
    }

    // Start execution
    // Note: This runs synchronously for now. In production, you might
    // want to use WebSocket or SSE for real-time progress updates.
    const result = await executeBatch(id, (progress) => {
      // Progress callback - could emit via WebSocket here
      console.log(`Batch ${id}: ${progress.progress}% (${progress.completedItems}/${progress.totalItems})`);
    });

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/batches/:id/cancel
 * Request cancellation of a running batch.
 */
router.post('/:id/cancel', (_req: Request, res: Response) => {
  try {
    const success = requestCancellation();

    if (success) {
      res.json({
        success: true,
        message: 'Cancellation requested. Batch will pause after completing current item.',
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'No active batch to cancel',
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/batches/:id/resume
 * Resume a paused batch.
 */
router.post('/:id/resume', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;

    // Check if another batch is running
    if (hasActiveBatch()) {
      res.status(409).json({
        error: 'Another batch operation is already running',
        activeBatchId: getActiveBatchId(),
      });
      return;
    }

    // Resume execution
    const result = await executeBatch(id, (progress) => {
      console.log(`Batch ${id}: ${progress.progress}% (${progress.completedItems}/${progress.totalItems})`);
    });

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/batches/:id/abandon
 * Abandon a paused batch (mark as cancelled).
 */
router.post('/:id/abandon', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    await abandonBatch(id);
    res.json({ success: true, message: 'Batch abandoned' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/batches/:id/retry
 * Create a new batch to retry failed items.
 */
router.post('/:id/retry', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;

    // Check if another batch is running
    if (hasActiveBatch()) {
      res.status(409).json({
        error: 'Another batch operation is already running',
        activeBatchId: getActiveBatchId(),
      });
      return;
    }

    const result = await retryFailedItems(id);
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// Batch Queries
// =============================================================================

/**
 * GET /api/batches/:id
 * Get batch status and details.
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const batch = await getBatch(id);

    if (!batch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    res.json(batch);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/batches/library/:libraryId
 * Get all batches for a library.
 */
router.get('/library/:libraryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const libraryId = req.params.libraryId!;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const batches = await getLibraryBatches(libraryId, {
      status: status as BatchProgress['status'] | undefined,
      limit,
    });

    res.json({ batches });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/batches/:id/operations
 * Get operation log entries for a batch.
 */
router.get('/:id/operations', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const db = getDatabase();

    const operations = await db.operationLog.findMany({
      where: {
        batchId: id,
        ...(status ? { status } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await db.operationLog.count({
      where: {
        batchId: id,
        ...(status ? { status } : {}),
      },
    });

    res.json({
      operations: operations.map((op) => ({
        id: op.id,
        operation: op.operation,
        source: op.source,
        destination: op.destination,
        status: op.status,
        error: op.error,
        timestamp: op.timestamp,
        reversible: op.reversible,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// =============================================================================
// Batch Cleanup
// =============================================================================

/**
 * POST /api/batches/cleanup
 * Delete old completed batches.
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const daysToKeep = parseInt(req.query.days as string) || 30;
    const deletedCount = await cleanupOldBatches(daysToKeep);

    res.json({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} batches older than ${daysToKeep} days`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/batches/:id
 * Delete a specific batch (must be completed, failed, or cancelled).
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const db = getDatabase();

    const batch = await db.batchOperation.findUnique({
      where: { id },
    });

    if (!batch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    if (['pending', 'in_progress', 'paused'].includes(batch.status)) {
      res.status(400).json({
        error: 'Cannot delete active or paused batch. Abandon it first.',
      });
      return;
    }

    // Delete associated operation logs first
    await db.operationLog.deleteMany({
      where: { batchId: id },
    });

    // Delete the batch
    await db.batchOperation.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Batch deleted' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
