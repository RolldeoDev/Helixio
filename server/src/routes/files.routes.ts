/**
 * Files Routes
 *
 * API endpoints for individual file operations:
 * - Get file details
 * - Move/rename files
 * - Delete files
 * - Quarantine/restore files
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../services/database.service.js';
import {
  moveFile,
  renameFile,
  deleteFile,
  quarantineFile,
  restoreFromQuarantine,
  verifyFile,
} from '../services/file-operations.service.js';

const router = Router();

// =============================================================================
// File Details
// =============================================================================

/**
 * GET /api/files/:id
 * Get details for a single file
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const file = await db.comicFile.findUnique({
      where: { id: req.params.id },
      include: {
        library: {
          select: {
            id: true,
            name: true,
            rootPath: true,
          },
        },
        metadata: true,
      },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json(file);
  } catch (error) {
    console.error('Error getting file:', error);
    res.status(500).json({
      error: 'Failed to get file',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/files/:id/verify
 * Verify a file exists and matches database record
 */
router.get('/:id/verify', async (req: Request, res: Response) => {
  try {
    const result = await verifyFile(req.params.id!);

    if (!result.exists) {
      res.json({
        verified: false,
        exists: false,
        message: 'File not found on disk',
      });
      return;
    }

    const verified = result.hashMatch !== false && result.sizeMatch !== false;

    res.json({
      verified,
      exists: result.exists,
      hashMatch: result.hashMatch,
      sizeMatch: result.sizeMatch,
      message: verified ? 'File verified' : 'File mismatch detected',
    });
  } catch (error) {
    console.error('Error verifying file:', error);
    res.status(500).json({
      error: 'Failed to verify file',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// File Operations
// =============================================================================

/**
 * POST /api/files/:id/move
 * Move a file to a new location
 */
router.post('/:id/move', async (req: Request, res: Response) => {
  try {
    const { destinationPath, createDirs = true, overwrite = false } = req.body as {
      destinationPath?: string;
      createDirs?: boolean;
      overwrite?: boolean;
    };

    if (!destinationPath) {
      res.status(400).json({
        error: 'Missing required field',
        required: ['destinationPath'],
      });
      return;
    }

    const result = await moveFile(req.params.id!, destinationPath, {
      createDirs,
      overwrite,
    });

    if (result.success) {
      res.json({
        success: true,
        operation: result.operation,
        source: result.source,
        destination: result.destination,
        logId: result.logId,
      });
    } else {
      res.status(400).json({
        success: false,
        operation: result.operation,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error moving file:', error);
    res.status(500).json({
      error: 'Failed to move file',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/files/:id/rename
 * Rename a file (same directory)
 */
router.post('/:id/rename', async (req: Request, res: Response) => {
  try {
    const { newFilename } = req.body as { newFilename?: string };

    if (!newFilename) {
      res.status(400).json({
        error: 'Missing required field',
        required: ['newFilename'],
      });
      return;
    }

    const result = await renameFile(req.params.id!, newFilename);

    if (result.success) {
      res.json({
        success: true,
        operation: result.operation,
        source: result.source,
        destination: result.destination,
        logId: result.logId,
      });
    } else {
      res.status(400).json({
        success: false,
        operation: result.operation,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error renaming file:', error);
    res.status(500).json({
      error: 'Failed to rename file',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/files/:id
 * Delete a file from disk and database
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await deleteFile(req.params.id!);

    if (result.success) {
      res.json({
        success: true,
        operation: result.operation,
        source: result.source,
        logId: result.logId,
      });
    } else {
      res.status(400).json({
        success: false,
        operation: result.operation,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/files/:id/quarantine
 * Move a file to quarantine
 */
router.post('/:id/quarantine', async (req: Request, res: Response) => {
  try {
    const { reason = 'Manual quarantine' } = req.body as { reason?: string };

    const result = await quarantineFile(req.params.id!, reason);

    if (result.success) {
      res.json({
        success: true,
        operation: result.operation,
        source: result.source,
        destination: result.destination,
        logId: result.logId,
      });
    } else {
      res.status(400).json({
        success: false,
        operation: result.operation,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error quarantining file:', error);
    res.status(500).json({
      error: 'Failed to quarantine file',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/files/:id/restore
 * Restore a file from quarantine
 */
router.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const result = await restoreFromQuarantine(req.params.id!);

    if (result.success) {
      res.json({
        success: true,
        operation: result.operation,
        source: result.source,
        destination: result.destination,
        logId: result.logId,
      });
    } else {
      res.status(400).json({
        success: false,
        operation: result.operation,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error restoring file:', error);
    res.status(500).json({
      error: 'Failed to restore file',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * POST /api/files/bulk/delete
 * Delete multiple files
 */
router.post('/bulk/delete', async (req: Request, res: Response) => {
  try {
    const { fileIds } = req.body as { fileIds?: string[] };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({
        error: 'Missing required field',
        required: ['fileIds (array)'],
      });
      return;
    }

    const results = await Promise.all(
      fileIds.map((id) => deleteFile(id))
    );

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    res.json({
      total: fileIds.length,
      successful: successful.length,
      failed: failed.length,
      results: results.map((r, i) => ({
        fileId: fileIds[i]!,
        success: r.success,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error('Error bulk deleting files:', error);
    res.status(500).json({
      error: 'Failed to bulk delete files',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/files/bulk/quarantine
 * Quarantine multiple files
 */
router.post('/bulk/quarantine', async (req: Request, res: Response) => {
  try {
    const { fileIds, reason = 'Bulk quarantine' } = req.body as {
      fileIds?: string[];
      reason?: string;
    };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({
        error: 'Missing required field',
        required: ['fileIds (array)'],
      });
      return;
    }

    const results = await Promise.all(
      fileIds.map((id) => quarantineFile(id, reason))
    );

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    res.json({
      total: fileIds.length,
      successful: successful.length,
      failed: failed.length,
      results: results.map((r, i) => ({
        fileId: fileIds[i]!,
        success: r.success,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error('Error bulk quarantining files:', error);
    res.status(500).json({
      error: 'Failed to bulk quarantine files',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
