/**
 * Downloads Routes
 *
 * API endpoints for downloading comic files:
 * - Single file direct download
 * - Series/bulk ZIP creation with background processing
 * - SSE progress updates
 * - Job management (cancel, status)
 */

import { Router, Request, Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import { basename } from 'path';
import { pipeline } from 'stream/promises';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getDatabase } from '../services/database.service.js';
import {
  streamSingleFile,
  estimateDownloadSize,
  estimateSeriesDownloadSize,
  createDownloadJob,
  getDownloadJob,
  cancelDownloadJob,
  getActiveDownloads,
  hasActiveDownload,
} from '../services/download.service.js';
import {
  enqueueDownload,
  subscribeToProgress,
  getCurrentProgress,
  ProgressEvent,
} from '../services/download-queue.service.js';
import { downloadLogger as logger } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Single File Download (Direct streaming)
// =============================================================================

/**
 * GET /api/downloads/file/:fileId
 * Download a single comic file directly.
 */
router.get('/file/:fileId', requireAuth, async (req: Request, res: Response) => {
  try {
    await streamSingleFile(req.params.fileId!, res);
  } catch (error) {
    logger.error(`Error streaming file ${req.params.fileId}: ${error}`);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to download file',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

// =============================================================================
// Size Estimation
// =============================================================================

/**
 * GET /api/downloads/estimate/series/:seriesId
 * Get size estimate for downloading a series.
 */
router.get('/estimate/series/:seriesId', requireAuth, async (req: Request, res: Response) => {
  try {
    const estimate = await estimateSeriesDownloadSize(req.params.seriesId!);
    res.json(estimate);
  } catch (error) {
    logger.error(`Error estimating series download: ${error}`);
    res.status(500).json({
      error: 'Failed to estimate download size',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/downloads/estimate/bulk
 * Get size estimate for downloading selected files.
 */
router.post('/estimate/bulk', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileIds } = req.body as { fileIds: string[] };

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: 'fileIds array is required' });
      return;
    }

    const estimate = await estimateDownloadSize(fileIds);
    res.json(estimate);
  } catch (error) {
    logger.error(`Error estimating bulk download: ${error}`);
    res.status(500).json({
      error: 'Failed to estimate download size',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Download Job Creation
// =============================================================================

/**
 * POST /api/downloads/series/:seriesId
 * Request a series download (creates background job).
 */
router.post('/series/:seriesId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesId } = req.params;
    const { splitEnabled, splitSizeBytes } = req.body as {
      splitEnabled?: boolean;
      splitSizeBytes?: number;
    };

    // Check for existing active download
    if (await hasActiveDownload(userId)) {
      res.status(429).json({
        error: 'Download in progress',
        message: 'You already have a download in progress. Please wait for it to complete.',
      });
      return;
    }

    // Get file IDs for series
    const db = getDatabase();
    const files = await db.comicFile.findMany({
      where: { seriesId },
      select: { id: true },
      orderBy: [{ filename: 'asc' }],
    });

    if (files.length === 0) {
      res.status(404).json({ error: 'No files found for this series' });
      return;
    }

    // Create job
    const result = await createDownloadJob({
      userId,
      type: 'series',
      seriesId,
      fileIds: files.map((f) => f.id),
      splitEnabled,
      splitSizeBytes,
    });

    // Enqueue for processing
    enqueueDownload(userId, result.jobId);

    res.json(result);
  } catch (error) {
    logger.error(`Error creating series download: ${error}`);
    res.status(500).json({
      error: 'Failed to create download',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/downloads/bulk
 * Request a bulk download of selected files.
 */
router.post('/bulk', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { fileIds, splitEnabled, splitSizeBytes } = req.body as {
      fileIds: string[];
      splitEnabled?: boolean;
      splitSizeBytes?: number;
    };

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: 'fileIds array is required' });
      return;
    }

    // Check for existing active download
    if (await hasActiveDownload(userId)) {
      res.status(429).json({
        error: 'Download in progress',
        message: 'You already have a download in progress. Please wait for it to complete.',
      });
      return;
    }

    // Create job
    const result = await createDownloadJob({
      userId,
      type: 'bulk',
      fileIds,
      splitEnabled,
      splitSizeBytes,
    });

    // Enqueue for processing
    enqueueDownload(userId, result.jobId);

    res.json(result);
  } catch (error) {
    logger.error(`Error creating bulk download: ${error}`);
    res.status(500).json({
      error: 'Failed to create download',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Job Status & Management
// =============================================================================

/**
 * GET /api/downloads/active
 * Get user's active download jobs.
 */
router.get('/active', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const jobs = await getActiveDownloads(userId);

    // Convert BigInt to number for JSON serialization
    const serializedJobs = jobs.map((job) => ({
      ...job,
      totalSizeBytes: Number(job.totalSizeBytes),
    }));

    res.json({ jobs: serializedJobs });
  } catch (error) {
    logger.error(`Error getting active downloads: ${error}`);
    res.status(500).json({
      error: 'Failed to get active downloads',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/downloads/job/:jobId
 * Get job status.
 */
router.get('/job/:jobId', requireAuth, async (req: Request, res: Response) => {
  try {
    const job = await getDownloadJob(req.params.jobId!);

    if (!job) {
      res.status(404).json({ error: 'Download job not found' });
      return;
    }

    // Verify ownership
    if (job.userId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Serialize BigInt
    const serializedJob = {
      ...job,
      totalSizeBytes: Number(job.totalSizeBytes),
      outputSizeBytes: job.outputSizeBytes ? Number(job.outputSizeBytes) : null,
      splitSizeBytes: job.splitSizeBytes ? Number(job.splitSizeBytes) : null,
      outputParts: job.outputParts ? JSON.parse(job.outputParts) : null,
      skippedFileIds: job.skippedFileIds ? JSON.parse(job.skippedFileIds) : null,
    };

    res.json(serializedJob);
  } catch (error) {
    logger.error(`Error getting job status: ${error}`);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/downloads/job/:jobId/stream
 * SSE endpoint for job progress updates.
 */
router.get('/job/:jobId/stream', requireAuth, async (req: Request, res: Response) => {
  const jobId = req.params.jobId!;
  const userId = req.user!.id;

  try {
    // Verify job exists and ownership
    const job = await getDownloadJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Download job not found' });
      return;
    }

    if (job.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send current state immediately
    const currentProgress = await getCurrentProgress(jobId);
    if (currentProgress) {
      res.write(`data: ${JSON.stringify(currentProgress)}\n\n`);
    }

    // If job is already complete, close connection
    if (['ready', 'completed', 'failed', 'expired', 'cancelled'].includes(job.status)) {
      res.end();
      return;
    }

    // Subscribe to progress events
    const unsubscribe = subscribeToProgress(jobId, (event: ProgressEvent) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);

        // Close connection when job is complete
        if (event.status === 'ready' || event.status === 'failed') {
          setTimeout(() => {
            res.end();
          }, 100);
        }
      } catch {
        // Client disconnected
        unsubscribe();
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      unsubscribe();
    });

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  } catch (error) {
    logger.error(`Error setting up progress stream: ${error}`);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to set up progress stream',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

/**
 * GET /api/downloads/job/:jobId/download
 * Download the prepared ZIP file.
 * Query params: ?part=0 for split downloads
 */
router.get('/job/:jobId/download', requireAuth, async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId!;
    const partIndex = parseInt(req.query.part as string) || 0;
    const userId = req.user!.id;

    // Get job
    const job = await getDownloadJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Download job not found' });
      return;
    }

    // Verify ownership
    if (job.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Verify job is ready
    if (job.status !== 'ready') {
      res.status(400).json({
        error: 'Download not ready',
        message: `Job status is ${job.status}`,
      });
      return;
    }

    // Get file path
    let filePath: string;
    let fileName: string;

    if (job.outputParts) {
      const parts: string[] = JSON.parse(job.outputParts);
      if (partIndex < 0 || partIndex >= parts.length) {
        res.status(400).json({ error: 'Invalid part index' });
        return;
      }
      filePath = parts[partIndex]!;
      fileName = basename(filePath);
    } else if (job.outputPath) {
      filePath = job.outputPath;
      fileName = job.outputFileName || 'download.zip';
    } else {
      res.status(500).json({ error: 'No output file found' });
      return;
    }

    // Verify file exists
    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'Download file not found. It may have expired.' });
      return;
    }

    // Get file stats
    const fileStats = await stat(filePath);

    // Set headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', fileStats.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`
    );

    // Stream file
    const stream = createReadStream(filePath);
    await pipeline(stream, res);

    logger.info(`Downloaded job ${jobId}${job.outputParts ? ` part ${partIndex}` : ''}`);
  } catch (error) {
    logger.error(`Error downloading job file: ${error}`);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to download file',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

/**
 * DELETE /api/downloads/job/:jobId
 * Cancel a download job and cleanup files.
 */
router.delete('/job/:jobId', requireAuth, async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId!;
    const userId = req.user!.id;

    // Get job
    const job = await getDownloadJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Download job not found' });
      return;
    }

    // Verify ownership
    if (job.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Cancel the job
    await cancelDownloadJob(jobId);

    res.json({ success: true, message: 'Download cancelled' });
  } catch (error) {
    logger.error(`Error cancelling download: ${error}`);
    res.status(500).json({
      error: 'Failed to cancel download',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
