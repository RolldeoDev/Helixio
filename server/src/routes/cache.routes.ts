/**
 * Cache Routes
 *
 * API endpoints for cache management and thumbnail retrieval:
 * - Serve cached thumbnails
 * - Trigger cache rebuild for files/folders
 * - Monitor cache job progress
 */

import { Router, Request, Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import {
  getThumbnailPath,
  getThumbnailCount,
  getThumbnailCacheSummary,
  generateThumbnailsForFile,
} from '../services/thumbnail.service.js';
import {
  enqueueCacheJob,
  getCacheJob,
  getActiveJobs,
  cancelCacheJob,
  rebuildCacheForFiles,
  rebuildCacheForFolder,
  getQueuedFileCount,
  CacheJobType,
} from '../services/cache-job.service.js';
import { getCacheSummary as getCoverCacheSummary } from '../services/cover.service.js';
import { getDatabase } from '../services/database.service.js';
import { logError } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Thumbnail Retrieval
// =============================================================================

/**
 * GET /api/cache/thumbnails/:fileId/:pageNumber
 * Get a cached thumbnail for a specific page
 */
router.get('/thumbnails/:fileId/:pageNumber', async (req: Request, res: Response) => {
  try {
    const { fileId, pageNumber } = req.params;
    const pageNum = parseInt(pageNumber!, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      res.status(400).json({ error: 'Invalid page number' });
      return;
    }

    const prisma = getDatabase();
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: { libraryId: true, hash: true },
    });

    if (!file || !file.hash) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const thumbPath = getThumbnailPath(file.libraryId, file.hash, pageNum);

    if (!existsSync(thumbPath)) {
      res.status(404).json({ error: 'Thumbnail not cached' });
      return;
    }

    const stats = await stat(thumbPath);
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': stats.size.toString(),
      'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
    });

    createReadStream(thumbPath).pipe(res);
  } catch (err) {
    logError('cache', err, { action: 'serve-thumbnail' });
    res.status(500).json({
      error: 'Failed to serve thumbnail',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/cache/thumbnails/:fileId/count
 * Get the number of cached thumbnails for a file
 */
router.get('/thumbnails/:fileId/count', async (req: Request, res: Response) => {
  try {
    const prisma = getDatabase();
    const file = await prisma.comicFile.findUnique({
      where: { id: req.params.fileId },
      select: { libraryId: true, hash: true },
    });

    if (!file || !file.hash) {
      res.json({ count: 0 });
      return;
    }

    const count = await getThumbnailCount(file.libraryId, file.hash);
    res.json({ count });
  } catch (err) {
    logError('cache', err, { action: 'get-thumbnail-count' });
    res.status(500).json({ error: 'Failed to get thumbnail count' });
  }
});

/**
 * POST /api/cache/thumbnails/:fileId/generate
 * Generate thumbnails for a file on-demand (synchronous)
 * Used when opening the reader to ensure thumbnails are available
 */
router.post('/thumbnails/:fileId/generate', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    const result = await generateThumbnailsForFile(fileId!);

    if (!result.success && result.generatedCount === 0 && result.fromCache === 0) {
      res.status(400).json({
        error: 'Failed to generate thumbnails',
        details: result.errors,
      });
      return;
    }

    res.json({
      success: result.success,
      pageCount: result.pageCount,
      generatedCount: result.generatedCount,
      fromCache: result.fromCache,
      errors: result.errors,
    });
  } catch (err) {
    logError('cache', err, { action: 'generate-thumbnails' });
    res.status(500).json({
      error: 'Failed to generate thumbnails',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Cache Rebuild
// =============================================================================

/**
 * POST /api/cache/rebuild
 * Rebuild cache for specific files or folders
 */
router.post('/rebuild', async (req: Request, res: Response) => {
  try {
    const { fileIds, folderPath, libraryId, type = 'full' } = req.body as {
      fileIds?: string[];
      folderPath?: string;
      libraryId?: string;
      type?: CacheJobType;
    };

    let job;

    if (fileIds && fileIds.length > 0) {
      // Rebuild for specific files
      job = await rebuildCacheForFiles(fileIds, type);
    } else if (folderPath && libraryId) {
      // Rebuild for all files in folder
      job = await rebuildCacheForFolder(libraryId, folderPath, type);
    } else {
      res.status(400).json({
        error: 'Either fileIds or (folderPath + libraryId) required',
      });
      return;
    }

    res.json({
      jobId: job.id,
      fileCount: job.totalFiles,
      type,
      message: 'Cache rebuild job queued',
    });
  } catch (err) {
    logError('cache', err, { action: 'queue-rebuild' });
    res.status(500).json({
      error: 'Failed to queue cache rebuild',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Job Management
// =============================================================================

/**
 * GET /api/cache/jobs
 * Get all active cache jobs
 */
router.get('/jobs', async (_req: Request, res: Response) => {
  try {
    const jobs = getActiveJobs();
    const queuedFiles = getQueuedFileCount();
    res.json({ jobs, queuedFiles });
  } catch (err) {
    logError('cache', err, { action: 'get-jobs' });
    res.status(500).json({ error: 'Failed to get cache jobs' });
  }
});

/**
 * GET /api/cache/jobs/:jobId
 * Get a specific cache job
 */
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const job = getCacheJob(req.params.jobId!);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ job });
  } catch (err) {
    logError('cache', err, { action: 'get-job' });
    res.status(500).json({ error: 'Failed to get cache job' });
  }
});

/**
 * DELETE /api/cache/jobs/:jobId
 * Cancel a cache job
 */
router.delete('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const cancelled = cancelCacheJob(req.params.jobId!);
    res.json({ cancelled });
  } catch (err) {
    logError('cache', err, { action: 'cancel-job' });
    res.status(500).json({ error: 'Failed to cancel cache job' });
  }
});

// =============================================================================
// Cache Statistics
// =============================================================================

/**
 * GET /api/cache/summary
 * Get cache summary statistics
 */
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const [coverSummary, thumbnailSummary] = await Promise.all([
      getCoverCacheSummary(),
      getThumbnailCacheSummary(),
    ]);

    res.json({
      covers: coverSummary,
      thumbnails: thumbnailSummary,
      total: {
        size: coverSummary.totalSize + thumbnailSummary.totalSize,
      },
    });
  } catch (err) {
    logError('cache', err, { action: 'get-summary' });
    res.status(500).json({ error: 'Failed to get cache summary' });
  }
});

export default router;
