/**
 * Library Scan Routes
 *
 * API endpoints for full library scan jobs.
 * These jobs run in the background and can be monitored for progress.
 */

import { Router, type Request, type Response } from 'express';
import {
  createScanJob,
  getScanJob,
  getActiveScanJobForLibrary,
  listActiveScanJobs,
  listScanJobsForLibrary,
  cancelScanJob,
  deleteScanJob,
} from '../services/library-scan-job.service.js';
import {
  enqueueScanJob,
  getScanQueueStatus,
  requestCancellation,
  ScanQueueFullError,
} from '../services/library-scan-queue.service.js';
import { getDatabase } from '../services/database.service.js';
import { logError } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Start Full Scan
// =============================================================================

/**
 * POST /api/libraries/:id/scan/full
 * Start a full library scan job.
 * Returns the job ID for progress tracking.
 *
 * Body params:
 * - forceFullScan: boolean (optional) - If true, skip delta detection and reprocess all files
 */
router.post('/:id/scan/full', async (req: Request, res: Response) => {
  try {
    const libraryId = req.params.id!;
    const forceFullScan = req.body.forceFullScan === true;

    // Verify library exists
    const prisma = getDatabase();
    const library = await prisma.library.findUnique({
      where: { id: libraryId },
    });

    if (!library) {
      res.status(404).json({ error: 'Library not found' });
      return;
    }

    // Check if there's already an active scan
    const existingJob = await getActiveScanJobForLibrary(libraryId);
    if (existingJob) {
      res.status(200).json({
        success: true,
        data: {
          job: existingJob,
          message: 'Scan already in progress',
          existing: true,
        },
      });
      return;
    }

    // Create and enqueue the scan job with options
    const jobId = await createScanJob(libraryId, { forceFullScan });
    enqueueScanJob(jobId);

    // Get the job data
    const job = await getScanJob(jobId);

    res.status(201).json({
      success: true,
      data: {
        job,
        message: 'Scan job created and queued',
        existing: false,
      },
    });
  } catch (error) {
    if (error instanceof ScanQueueFullError) {
      res.status(503).json({
        error: 'Scan queue is full. Please try again later.',
      });
      return;
    }

    logError('library-scan', error, { action: 'start-scan' });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to start scan',
    });
  }
});

// =============================================================================
// Get Scan Job Status
// =============================================================================

/**
 * GET /api/libraries/:id/scan/:jobId
 * Get the status of a specific scan job.
 */
router.get('/:id/scan/:jobId', async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId!;

    const job = await getScanJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Scan job not found' });
      return;
    }

    // Verify job belongs to the library
    if (job.libraryId !== req.params.id) {
      res.status(404).json({ error: 'Scan job not found for this library' });
      return;
    }

    // Include queue position if queued
    const queueStatus = getScanQueueStatus(jobId);

    res.json({
      success: true,
      data: {
        job,
        queueStatus: queueStatus
          ? {
              status: queueStatus.status,
              queuedAt: queueStatus.queuedAt,
              startedAt: queueStatus.startedAt,
            }
          : null,
      },
    });
  } catch (error) {
    logError('library-scan', error, { action: 'get-scan-job' });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get scan job',
    });
  }
});

/**
 * GET /api/libraries/:id/scan/active
 * Get the active scan job for a library (if any).
 */
router.get('/:id/scan/active', async (req: Request, res: Response) => {
  try {
    const libraryId = req.params.id!;

    const job = await getActiveScanJobForLibrary(libraryId);

    res.json({
      success: true,
      data: {
        job, // null if no active scan
        hasActiveScan: !!job,
      },
    });
  } catch (error) {
    logError('library-scan', error, { action: 'get-active-scan' });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get active scan',
    });
  }
});

/**
 * GET /api/libraries/:id/scan/history
 * Get recent scan jobs for a library.
 */
router.get('/:id/scan/history', async (req: Request, res: Response) => {
  try {
    const libraryId = req.params.id!;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const jobs = await listScanJobsForLibrary(libraryId, limit);

    res.json({
      success: true,
      data: { jobs },
    });
  } catch (error) {
    logError('library-scan', error, { action: 'get-scan-history' });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get scan history',
    });
  }
});

// =============================================================================
// Cancel Scan Job
// =============================================================================

/**
 * POST /api/libraries/:id/scan/:jobId/cancel
 * Cancel a running or queued scan job.
 */
router.post('/:id/scan/:jobId/cancel', async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId!;

    const job = await getScanJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Scan job not found' });
      return;
    }

    // Verify job belongs to the library
    if (job.libraryId !== req.params.id) {
      res.status(404).json({ error: 'Scan job not found for this library' });
      return;
    }

    // Check if already completed
    if (['complete', 'error', 'cancelled'].includes(job.status)) {
      res.status(400).json({
        error: `Cannot cancel job with status: ${job.status}`,
      });
      return;
    }

    // Request cancellation (will be handled by the queue worker)
    requestCancellation(jobId);
    await cancelScanJob(jobId);

    res.json({
      success: true,
      message: 'Scan job cancelled',
    });
  } catch (error) {
    logError('library-scan', error, { action: 'cancel-scan-job' });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to cancel scan job',
    });
  }
});

// =============================================================================
// Delete Scan Job
// =============================================================================

/**
 * DELETE /api/libraries/:id/scan/:jobId
 * Delete a completed scan job and its logs.
 */
router.delete('/:id/scan/:jobId', async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId!;

    const job = await getScanJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Scan job not found' });
      return;
    }

    // Verify job belongs to the library
    if (job.libraryId !== req.params.id) {
      res.status(404).json({ error: 'Scan job not found for this library' });
      return;
    }

    // Only allow deleting completed/failed/cancelled jobs
    if (!['complete', 'error', 'cancelled'].includes(job.status)) {
      res.status(400).json({
        error: 'Cannot delete active scan job. Cancel it first.',
      });
      return;
    }

    await deleteScanJob(jobId);

    res.json({
      success: true,
      message: 'Scan job deleted',
    });
  } catch (error) {
    logError('library-scan', error, { action: 'delete-scan-job' });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete scan job',
    });
  }
});

// =============================================================================
// Global Scan Endpoints (not library-specific)
// =============================================================================

/**
 * GET /api/scans/active
 * Get all active scan jobs across all libraries.
 */
router.get('/scans/active', async (_req: Request, res: Response) => {
  try {
    const jobs = await listActiveScanJobs();

    res.json({
      success: true,
      data: { jobs },
    });
  } catch (error) {
    logError('library-scan', error, { action: 'list-active-scans' });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list active scans',
    });
  }
});

export default router;
