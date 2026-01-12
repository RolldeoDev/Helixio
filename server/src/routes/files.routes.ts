/**
 * Files Routes
 *
 * API endpoints for individual file operations:
 * - Get file details
 * - Move/rename files
 * - Delete files
 * - Quarantine/restore files
 * - Cover management
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { getDatabase } from '../services/database.service.js';
import { logError } from '../services/logger.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  moveFile,
  renameFile,
  deleteFile,
  quarantineFile,
  restoreFromQuarantine,
  verifyFile,
} from '../services/file-operations.service.js';
import {
  getArchivePages,
  extractPageAsCover,
  saveUploadedCover,
  downloadApiCover,
  getFileCover,
  getSeriesCoverData,
} from '../services/cover.service.js';

const router = Router();

// All file routes require authentication
router.use(requireAuth);

// Configure multer for cover image uploads
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (validTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, WebP, GIF) are allowed'));
    }
  },
});

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
    logError('files', error, { action: 'get-file' });
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
    logError('files', error, { action: 'verify-file' });
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

    // SECURITY: Validate destination is within library root
    const db = getDatabase();
    const file = await db.comicFile.findUnique({
      where: { id: req.params.id },
      include: { library: { select: { rootPath: true } } },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const resolvedRoot = path.resolve(file.library.rootPath);
    const resolvedDest = path.resolve(destinationPath);
    if (!resolvedDest.startsWith(resolvedRoot + path.sep) && resolvedDest !== resolvedRoot) {
      res.status(400).json({
        error: 'Invalid destination',
        message: 'Destination must be within the library root path',
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
    logError('files', error, { action: 'move-file' });
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
    logError('files', error, { action: 'rename-file' });
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
    logError('files', error, { action: 'delete-file' });
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
    logError('files', error, { action: 'quarantine-file' });
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
    logError('files', error, { action: 'restore-file' });
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
    logError('files', error, { action: 'bulk-delete-files' });
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
    logError('files', error, { action: 'bulk-quarantine-files' });
    res.status(500).json({
      error: 'Failed to bulk quarantine files',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Cover Management
// =============================================================================

/**
 * GET /api/files/:id/pages
 * Get list of pages in the archive for cover selection
 * Returns pages with both index (0-based) and filename for thumbnail generation
 */
router.get('/:id/pages', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const file = await db.comicFile.findUnique({
      where: { id: req.params.id! },
      select: { id: true, path: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const result = await getArchivePages(file.path);

    if (!result.success) {
      res.status(500).json({
        error: 'Failed to list pages',
        message: result.error,
      });
      return;
    }

    // Map pages to objects with index and filename for thumbnail URLs
    const pages = result.pages?.map((filename, index) => ({
      index,
      filename,
    })) || [];

    res.json({
      fileId: file.id,
      pages,
      pageCount: pages.length,
    });
  } catch (error) {
    logError('files', error, { action: 'list-pages' });
    res.status(500).json({
      error: 'Failed to list pages',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/files/:id/cover-info
 * Get current cover settings for a file
 */
router.get('/:id/cover-info', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const file = await db.comicFile.findUnique({
      where: { id: req.params.id! },
      select: {
        id: true,
        coverSource: true,
        coverPageIndex: true,
        coverHash: true,
        coverUrl: true,
      },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json(file);
  } catch (error) {
    logError('files', error, { action: 'get-cover-info' });
    res.status(500).json({
      error: 'Failed to get cover info',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/files/:id/cover
 * Set cover for a file
 * Body: { source: 'auto' | 'page' | 'custom', pageIndex?: number, url?: string }
 */
router.post('/:id/cover', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { source, pageIndex, url } = req.body as {
      source?: 'auto' | 'page' | 'custom';
      pageIndex?: number;
      url?: string;
    };

    const file = await db.comicFile.findUnique({
      where: { id: req.params.id! },
      select: { id: true, path: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Handle different sources
    if (source === 'auto') {
      // Reset to auto (default behavior)
      await db.comicFile.update({
        where: { id: file.id },
        data: {
          coverSource: 'auto',
          coverPageIndex: null,
          coverHash: null,
          coverUrl: null,
        },
      });

      res.json({ success: true, coverSource: 'auto' });
      return;
    }

    if (source === 'page') {
      if (pageIndex === undefined || pageIndex < 0) {
        res.status(400).json({ error: 'Invalid page index' });
        return;
      }

      // Extract the page as cover
      const result = await extractPageAsCover(file.path, pageIndex);

      if (!result.success) {
        res.status(400).json({
          error: 'Failed to extract page as cover',
          message: result.error,
        });
        return;
      }

      await db.comicFile.update({
        where: { id: file.id },
        data: {
          coverSource: 'page',
          coverPageIndex: pageIndex,
          coverHash: result.coverHash,
          coverUrl: null,
        },
      });

      res.json({
        success: true,
        coverSource: 'page',
        coverPageIndex: pageIndex,
        coverHash: result.coverHash,
      });
      return;
    }

    if (source === 'custom' && url) {
      // Download from URL
      const result = await downloadApiCover(url);

      if (!result.success) {
        res.status(400).json({
          error: 'Failed to download cover from URL',
          message: result.error,
        });
        return;
      }

      await db.comicFile.update({
        where: { id: file.id },
        data: {
          coverSource: 'custom',
          coverPageIndex: null,
          coverHash: result.coverHash,
          coverUrl: url,
        },
      });

      res.json({
        success: true,
        coverSource: 'custom',
        coverHash: result.coverHash,
        coverUrl: url,
      });
      return;
    }

    res.status(400).json({
      error: 'Invalid request',
      message: 'Provide source with appropriate parameters (pageIndex for page, url for custom)',
    });
  } catch (error) {
    logError('files', error, { action: 'set-cover' });
    res.status(500).json({
      error: 'Failed to set cover',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/files/:id/cover/upload
 * Upload a custom cover image
 */
router.post('/:id/cover/upload', coverUpload.single('cover'), async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const file = await db.comicFile.findUnique({
      where: { id: req.params.id! },
      select: { id: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const uploadedFile = req.file;
    if (!uploadedFile) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Save the uploaded cover
    const result = await saveUploadedCover(uploadedFile.buffer);

    if (!result.success) {
      res.status(400).json({
        error: 'Failed to process uploaded cover',
        message: result.error,
      });
      return;
    }

    // Update file record
    await db.comicFile.update({
      where: { id: file.id },
      data: {
        coverSource: 'custom',
        coverPageIndex: null,
        coverHash: result.coverHash,
        coverUrl: null,
      },
    });

    res.json({
      success: true,
      coverSource: 'custom',
      coverHash: result.coverHash,
    });
  } catch (error) {
    logError('files', error, { action: 'upload-cover' });
    res.status(500).json({
      error: 'Failed to upload cover',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
