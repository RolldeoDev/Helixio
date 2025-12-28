/**
 * Cover Routes
 *
 * API endpoints for cover image extraction and cache management.
 */

import { Router, Request, Response } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { extname } from 'path';
import { logError, logInfo } from '../services/logger.service.js';
import {
  getCoverForFile,
  getCoverInfo,
  getCoverData,
  deleteCachedCover,
  deleteLibraryCovers,
  getCacheSummary,
  cleanupOrphanedCovers,
  enforceCacheSizeLimit,
  batchExtractCovers,
  rebuildAllCovers,
  countCoversNeedingOptimization,
  getMemoryCacheStats,
  clearMemoryCache,
  getSeriesCoverData,
  seriesCoverExists,
  getCollectionCoverData,
  collectionCoverExists,
} from '../services/cover.service.js';
import { getDatabase } from '../services/database.service.js';
import { loadConfig } from '../services/config.service.js';

const router = Router();

// =============================================================================
// Series Cover Retrieval (API-Downloaded Covers)
// =============================================================================

/**
 * GET /api/covers/series/:coverHash
 * Get optimized cover image for a series (downloaded from external API).
 * Returns WebP by default (if supported), falls back to JPEG.
 * Includes blur placeholder in X-Blur-Placeholder header.
 */
router.get('/series/:coverHash', async (req: Request, res: Response): Promise<void> => {
  try {
    const { coverHash } = req.params;

    if (!coverHash) {
      res.status(400).json({ error: 'Cover hash is required' });
      return;
    }

    // Check Accept header for WebP support
    const acceptHeader = req.get('Accept') || '';
    const acceptWebP = acceptHeader.includes('image/webp');

    // Try to get cover data (from memory cache or disk)
    const coverData = await getSeriesCoverData(coverHash, acceptWebP);

    if (!coverData) {
      res.status(404).json({
        error: 'Cover not found',
        message: 'Series cover not found in cache. It may need to be re-downloaded.',
      });
      return;
    }

    // Set response headers
    // Series covers use hash in URL, so immutable is appropriate
    res.set({
      'Content-Type': coverData.contentType,
      'Content-Length': coverData.data.length.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${coverHash}"`,
      'Vary': 'Accept',
    });

    // Include blur placeholder for instant perceived load
    if (coverData.blurPlaceholder) {
      res.set('X-Blur-Placeholder', coverData.blurPlaceholder);
    }

    res.send(coverData.data);
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'serve-series-cover' });
    res.status(500).json({
      error: 'Failed to serve series cover',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Collection Mosaic Covers
// =============================================================================

/**
 * GET /api/covers/collection/:coverHash
 * Get collection mosaic cover image.
 * Returns WebP by default (if supported), falls back to JPEG.
 * Includes blur placeholder in X-Blur-Placeholder header.
 */
router.get('/collection/:coverHash', async (req: Request, res: Response): Promise<void> => {
  try {
    const { coverHash } = req.params;

    if (!coverHash) {
      res.status(400).json({ error: 'Cover hash is required' });
      return;
    }

    // Check Accept header for WebP support
    const acceptHeader = req.get('Accept') || '';
    const acceptWebP = acceptHeader.includes('image/webp');

    // Try to get cover data (from memory cache or disk)
    const coverData = await getCollectionCoverData(coverHash, acceptWebP);

    if (!coverData) {
      res.status(404).json({
        error: 'Cover not found',
        message: 'Collection cover not found in cache. It may need to be regenerated.',
      });
      return;
    }

    // Set response headers
    // Collection covers use hash in URL, so immutable is appropriate
    res.set({
      'Content-Type': coverData.contentType,
      'Content-Length': coverData.data.length.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${coverHash}"`,
      'Vary': 'Accept',
    });

    // Include blur placeholder for instant perceived load
    if (coverData.blurPlaceholder) {
      res.set('X-Blur-Placeholder', coverData.blurPlaceholder);
    }

    res.send(coverData.data);
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'serve-collection-cover' });
    res.status(500).json({
      error: 'Failed to serve collection cover',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Cover Retrieval
// =============================================================================

/**
 * GET /api/covers/:fileId
 * Get optimized cover image for a comic file.
 * Returns WebP by default (if supported), falls back to JPEG.
 * Includes blur placeholder in X-Blur-Placeholder header.
 */
router.get('/:fileId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const prisma = getDatabase();

    // Get file info including cover settings
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        hash: true,
        libraryId: true,
        path: true,
        coverSource: true,
        coverHash: true,
      },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Check Accept header for WebP support
    const acceptHeader = req.get('Accept') || '';
    const acceptWebP = acceptHeader.includes('image/webp');

    let coverData;

    // If a custom cover (page or custom URL) is set, use coverHash from series covers cache
    if ((file.coverSource === 'page' || file.coverSource === 'custom') && file.coverHash) {
      // Custom covers are stored in series covers directory using coverHash
      coverData = await getSeriesCoverData(file.coverHash, acceptWebP);
    }

    // Compute fileHash for fallback and ETag
    const fileHash = file.hash || file.id;

    // If no custom cover or custom cover not found, fall back to default file cover
    if (!coverData) {
      coverData = await getCoverData(file.libraryId, fileHash, acceptWebP);

      // If not cached, extract and optimize
      if (!coverData) {
        const result = await getCoverForFile(fileId!);

        if (!result.success) {
          res.status(404).json({
            error: 'Cover not found',
            message: result.error || 'Failed to extract cover',
          });
          return;
        }

        // Get the newly extracted cover
        coverData = await getCoverData(file.libraryId, fileHash, acceptWebP);

        if (!coverData) {
          res.status(500).json({ error: 'Failed to load extracted cover' });
          return;
        }
      }
    }

    // Use coverHash for ETag when custom cover exists, otherwise use fileHash
    const etagBase = file.coverHash || fileHash;
    const etag = `"${etagBase}-${acceptWebP ? 'webp' : 'jpeg'}"`;

    // Check If-None-Match for conditional requests
    const ifNoneMatch = req.get('If-None-Match');
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    // Set response headers
    // Use must-revalidate since the same URL can serve different covers
    res.set({
      'Content-Type': coverData.contentType,
      'Content-Length': coverData.data.length.toString(),
      'Cache-Control': 'public, max-age=86400, must-revalidate',
      'ETag': etag,
      'Vary': 'Accept',
    });

    // Include blur placeholder for instant perceived load
    if (coverData.blurPlaceholder) {
      res.set('X-Blur-Placeholder', coverData.blurPlaceholder);
    }

    res.send(coverData.data);
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'serve-cover' });
    res.status(500).json({
      error: 'Failed to serve cover',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/covers/:fileId/info
 * Get cover info without retrieving the image.
 */
router.get('/:fileId/info', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const prisma = getDatabase();

    // Get file info from database
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        hash: true,
        libraryId: true,
      },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!file.hash) {
      res.json({
        exists: false,
        message: 'File hash not available',
      });
      return;
    }

    const info = await getCoverInfo(file.libraryId, file.hash);

    res.json({
      fileId,
      libraryId: file.libraryId,
      hash: file.hash,
      ...info,
    });
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'get-cover-info' });
    res.status(500).json({
      error: 'Failed to get cover info',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * DELETE /api/covers/:fileId
 * Delete a cached cover.
 */
router.delete('/:fileId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const prisma = getDatabase();

    // Get file info from database
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: {
        hash: true,
        libraryId: true,
      },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!file.hash) {
      res.json({ deleted: false, message: 'File hash not available' });
      return;
    }

    const deleted = await deleteCachedCover(file.libraryId, file.hash);

    res.json({ deleted });
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'delete-cover' });
    res.status(500).json({
      error: 'Failed to delete cover',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * POST /api/covers/batch/extract
 * Extract covers for multiple files.
 * Body: { fileIds: string[] }
 */
router.post('/batch/extract', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'fileIds must be a non-empty array',
      });
      return;
    }

    // Limit batch size
    if (fileIds.length > 100) {
      res.status(400).json({
        error: 'Batch too large',
        message: 'Maximum 100 files per batch',
      });
      return;
    }

    const result = await batchExtractCovers(fileIds);

    res.json({
      total: fileIds.length,
      ...result,
    });
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'batch-extract' });
    res.status(500).json({
      error: 'Batch extraction failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Cache Management
// =============================================================================

/**
 * GET /api/covers/cache/summary
 * Get cover cache summary.
 */
router.get('/cache/summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const summary = await getCacheSummary();

    res.json({
      ...summary,
      totalSizeMB: Math.round(summary.totalSize / 1024 / 1024 * 100) / 100,
    });
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'get-cache-summary' });
    res.status(500).json({
      error: 'Failed to get cache summary',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * DELETE /api/covers/cache/library/:libraryId
 * Delete all cached covers for a library.
 */
router.delete('/cache/library/:libraryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { libraryId } = req.params;

    const result = await deleteLibraryCovers(libraryId!);

    res.json(result);
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'delete-library-covers' });
    res.status(500).json({
      error: 'Failed to delete library covers',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/covers/cache/cleanup
 * Clean up orphaned covers (covers for files no longer in database).
 */
router.post('/cache/cleanup', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await cleanupOrphanedCovers();

    res.json(result);
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'cleanup-covers' });
    res.status(500).json({
      error: 'Cleanup failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/covers/cache/enforce-limit
 * Enforce cache size limit by deleting oldest covers.
 * Body: { maxSizeMB?: number } - uses config default if not specified
 */
router.post('/cache/enforce-limit', async (req: Request, res: Response): Promise<void> => {
  try {
    let { maxSizeMB } = req.body;

    if (maxSizeMB === undefined) {
      const config = loadConfig();
      maxSizeMB = config.cache.coverCacheSizeMb;
    }

    if (typeof maxSizeMB !== 'number' || maxSizeMB <= 0) {
      res.status(400).json({
        error: 'Invalid maxSizeMB',
        message: 'maxSizeMB must be a positive number',
      });
      return;
    }

    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const result = await enforceCacheSizeLimit(maxSizeBytes);

    res.json({
      ...result,
      freedMB: Math.round(result.freedBytes / 1024 / 1024 * 100) / 100,
    });
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'enforce-cache-limit' });
    res.status(500).json({
      error: 'Failed to enforce cache limit',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Cover Optimization & Rebuild
// =============================================================================

/**
 * GET /api/covers/optimization/status
 * Check how many covers need optimization.
 * Query: { libraryId?: string }
 */
router.get('/optimization/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { libraryId } = req.query;

    const result = await countCoversNeedingOptimization(
      typeof libraryId === 'string' ? libraryId : undefined
    );

    res.json({
      ...result,
      percentOptimized: result.total > 0
        ? Math.round((result.alreadyOptimized / result.total) * 100)
        : 100,
    });
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'check-optimization-status' });
    res.status(500).json({
      error: 'Failed to check optimization status',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/covers/optimization/rebuild
 * Rebuild all covers with optimization (WebP + blur placeholders).
 * Body: { libraryId?: string }
 * This is a synchronous operation that may take a while for large libraries.
 */
router.post('/optimization/rebuild', async (req: Request, res: Response): Promise<void> => {
  try {
    const { libraryId } = req.body;

    logInfo('covers', 'Starting cover rebuild...', { action: 'optimization-rebuild' });

    const result = await rebuildAllCovers(
      typeof libraryId === 'string' ? libraryId : undefined,
      (current, total, filename) => {
        if (current % 10 === 0 || current === total) {
          logInfo('covers', `Progress: ${current}/${total} - ${filename}`, { action: 'optimization-rebuild', current, total, filename });
        }
      }
    );

    logInfo('covers', `Complete: ${result.success} success, ${result.failed} failed`, { action: 'optimization-rebuild', success: result.success, failed: result.failed });

    res.json({
      ...result,
      message: `Rebuilt ${result.success} covers with optimization`,
    });
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'optimization-rebuild' });
    res.status(500).json({
      error: 'Failed to rebuild covers',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Memory Cache Management
// =============================================================================

/**
 * GET /api/covers/memory-cache/stats
 * Get memory cache statistics.
 */
router.get('/memory-cache/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = getMemoryCacheStats();

    res.json({
      ...stats,
      bytesMB: Math.round(stats.bytes / 1024 / 1024 * 100) / 100,
      maxBytesMB: Math.round(stats.maxBytes / 1024 / 1024 * 100) / 100,
      usagePercent: Math.round((stats.bytes / stats.maxBytes) * 100),
    });
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'get-memory-cache-stats' });
    res.status(500).json({
      error: 'Failed to get memory cache stats',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/covers/memory-cache/clear
 * Clear the memory cache.
 */
router.post('/memory-cache/clear', async (_req: Request, res: Response): Promise<void> => {
  try {
    clearMemoryCache();
    res.json({ success: true, message: 'Memory cache cleared' });
  } catch (err) {
    logError('covers', err instanceof Error ? err : new Error(String(err)), { action: 'clear-memory-cache' });
    res.status(500).json({
      error: 'Failed to clear memory cache',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
