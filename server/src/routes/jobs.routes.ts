/**
 * Unified Jobs Routes
 *
 * API endpoints for the unified jobs panel.
 */

import { Router, type Request, type Response } from 'express';
import { getAggregatedJobs, getActiveJobCount, getJobDetails } from '../services/job-aggregator.service.js';
import type { UnifiedJobType } from '../services/job-aggregator.types.js';
import { logError } from '../services/logger.service.js';

// Import cancel functions from individual services
import { cancelJob as cancelMetadataJob } from '../services/metadata-job.service.js';
import { cancelScanJob } from '../services/library-scan-job.service.js';
import { requestCancellation as requestScanCancellation } from '../services/library-scan-queue.service.js';
import { cancelJob as cancelRatingSyncJob } from '../services/rating-sync-job.service.js';

const router = Router();

// =============================================================================
// List Jobs
// =============================================================================

/**
 * GET /api/jobs
 * Get aggregated jobs from all sources
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as 'active' | 'completed' | 'all' | undefined;
    const typesParam = req.query.types as string | undefined;
    const types = typesParam?.split(',') as UnifiedJobType[] | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const result = await getAggregatedJobs({ status, types, limit });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logError('jobs', error, { action: 'list-jobs' });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list jobs',
    });
  }
});

/**
 * GET /api/jobs/count
 * Get count of active jobs (for sidebar badge)
 */
router.get('/count', async (_req: Request, res: Response) => {
  try {
    const count = await getActiveJobCount();
    res.json({ success: true, count });
  } catch (error) {
    logError('jobs', error, { action: 'get-job-count' });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get job count',
    });
  }
});

// =============================================================================
// Get Job Details
// =============================================================================

/**
 * GET /api/jobs/:type/:id
 * Get detailed job information including logs
 */
router.get('/:type/:id', async (req: Request, res: Response) => {
  const { type, id } = req.params;

  try {
    const validTypes = ['metadata', 'library-scan', 'rating-sync', 'review-sync', 'similarity', 'download', 'batch'];
    if (!validTypes.includes(type!)) {
      res.status(400).json({
        success: false,
        error: `Invalid job type: ${type}`,
      });
      return;
    }

    const details = await getJobDetails(type as UnifiedJobType, id!);

    if (!details) {
      res.status(404).json({
        success: false,
        error: 'Job not found',
      });
      return;
    }

    res.json({
      success: true,
      data: details,
    });
  } catch (error) {
    logError('jobs', error, { action: 'get-job-details', type, id });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get job details',
    });
  }
});

// =============================================================================
// Cancel Job
// =============================================================================

/**
 * POST /api/jobs/:type/:id/cancel
 * Cancel a job by type and ID
 */
router.post('/:type/:id/cancel', async (req: Request, res: Response) => {
  const { type, id } = req.params;

  try {
    let success = false;

    switch (type) {
      case 'metadata':
        await cancelMetadataJob(id!);
        success = true;
        break;

      case 'library-scan':
        requestScanCancellation(id!);
        await cancelScanJob(id!);
        success = true;
        break;

      case 'rating-sync':
        success = await cancelRatingSyncJob(id!);
        break;

      default:
        res.status(400).json({
          success: false,
          error: `Cannot cancel jobs of type: ${type}`,
        });
        return;
    }

    res.json({
      success,
      message: success ? 'Job cancelled' : 'Failed to cancel job',
    });
  } catch (error) {
    logError('jobs', error, { action: 'cancel-job', type, id });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel job',
    });
  }
});

// =============================================================================
// Batch-specific actions
// =============================================================================

router.post('/batch/:id/resume', async (req, res) => {
  try {
    const { executeBatch } = await import('../services/batch.service.js');
    // Resume by re-executing the paused batch
    const result = await executeBatch(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resume batch',
    });
  }
});

router.post('/batch/:id/abandon', async (req, res) => {
  try {
    const { abandonBatch } = await import('../services/batch.service.js');
    await abandonBatch(req.params.id);
    res.json({ success: true, message: 'Batch abandoned' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to abandon batch',
    });
  }
});

router.post('/batch/:id/retry', async (req, res) => {
  try {
    const { retryFailedItems } = await import('../services/batch.service.js');
    const result = await retryFailedItems(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retry batch',
    });
  }
});

router.delete('/batch/:id', async (req, res) => {
  try {
    const { getDatabase } = await import('../services/database.service.js');
    const db = getDatabase();
    await db.batchOperation.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Batch deleted' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete batch',
    });
  }
});

export default router;
