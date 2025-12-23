/**
 * Metadata Job Routes
 *
 * API endpoints for persistent metadata approval jobs.
 * Jobs are processed in the background via a job queue - endpoints return immediately.
 */

import { Router, type Request, type Response } from 'express';
import {
  createJob,
  getJob,
  listJobs,
  listAllJobs,
  updateJobOptions,
  jobSearchSeriesCustom,
  jobLoadMoreSeriesResults,
  jobApproveSeries,
  jobSkipSeries,
  jobNavigateToSeriesGroup,
  jobResetSeriesGroup,
  jobGetAvailableIssuesForFile,
  jobUpdateFieldApprovals,
  jobRejectFile,
  jobAcceptAllFiles,
  jobRejectAllFiles,
  cancelJob,
  abandonJob,
  deleteJob,
} from '../services/metadata-job.service.js';
import { type CreateSessionOptions } from '../services/metadata-approval.service.js';
import { enqueueJob, isJobInQueue, removeFromQueue } from '../services/job-queue.service.js';

const router = Router();

// =============================================================================
// Job Listing
// =============================================================================

/**
 * GET /api/metadata-jobs
 * List all active jobs
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const jobs = await listJobs();
    res.json({ jobs });
  } catch (error) {
    console.error('Failed to list jobs:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list jobs',
    });
  }
});

/**
 * GET /api/metadata-jobs/all
 * List all jobs including completed/cancelled
 */
router.get('/all', async (_req: Request, res: Response) => {
  try {
    const jobs = await listAllJobs();
    res.json({ jobs });
  } catch (error) {
    console.error('Failed to list all jobs:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list jobs',
    });
  }
});

// =============================================================================
// Job CRUD
// =============================================================================

/**
 * POST /api/metadata-jobs
 * Create a new job
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { fileIds } = req.body as { fileIds: string[] };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: 'fileIds must be a non-empty array' });
      return;
    }

    const jobId = await createJob(fileIds);
    const job = await getJob(jobId);

    res.status(201).json({ job });
  } catch (error) {
    console.error('Failed to create job:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create job',
    });
  }
});

/**
 * GET /api/metadata-jobs/:id
 * Get job details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const job = await getJob(req.params.id!);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ job });
  } catch (error) {
    console.error('Failed to get job:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get job',
    });
  }
});

/**
 * PATCH /api/metadata-jobs/:id/options
 * Update job options (before starting)
 */
router.patch('/:id/options', async (req: Request, res: Response) => {
  try {
    const { options } = req.body as { options: CreateSessionOptions };
    const id = req.params.id!;

    await updateJobOptions(id, options);
    const job = await getJob(id);

    res.json({ job });
  } catch (error) {
    console.error('Failed to update job options:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update options',
    });
  }
});

/**
 * DELETE /api/metadata-jobs/:id
 * Delete a job
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteJob(req.params.id!);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete job:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete job',
    });
  }
});

// =============================================================================
// Job Actions
// =============================================================================

/**
 * POST /api/metadata-jobs/:id/start
 * Enqueue the job for background processing.
 * Returns immediately - poll GET /:id for status updates.
 */
router.post('/:id/start', async (req: Request, res: Response) => {
  const jobId = req.params.id!;

  try {
    // Check if job exists
    const job = await getJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // Check if already queued or processing
    if (isJobInQueue(jobId)) {
      res.json({
        status: 'already_queued',
        message: 'Job is already queued or processing',
        jobId,
      });
      return;
    }

    // Enqueue for background processing
    enqueueJob(jobId, 'start');

    res.json({
      status: 'queued',
      message: 'Job queued for processing',
      jobId,
    });
  } catch (error) {
    console.error('Failed to start job:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to start job',
    });
  }
});

/**
 * POST /api/metadata-jobs/:id/cancel
 * Cancel a job and remove from queue if queued
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    // Remove from queue if present
    removeFromQueue(req.params.id!);
    await cancelJob(req.params.id!);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to cancel job:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to cancel job',
    });
  }
});

/**
 * POST /api/metadata-jobs/:id/abandon
 * Abandon a job completely - cancel, cleanup all data, and delete
 */
router.post('/:id/abandon', async (req: Request, res: Response) => {
  try {
    // Remove from queue if present
    removeFromQueue(req.params.id!);
    const result = await abandonJob(req.params.id!);
    res.json(result);
  } catch (error) {
    console.error('Failed to abandon job:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to abandon job',
    });
  }
});

// =============================================================================
// Series Approval
// =============================================================================

/**
 * POST /api/metadata-jobs/:id/search
 * Custom search for current series
 * Body: { query: string, source?: MetadataSource }
 */
router.post('/:id/search', async (req: Request, res: Response) => {
  try {
    const { query, source } = req.body as { query: string; source?: string };
    const id = req.params.id!;

    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    // Validate source if provided - include all metadata sources
    const validSources = ['comicvine', 'metron', 'gcd', 'anilist', 'mal'];
    if (source && !validSources.includes(source)) {
      res.status(400).json({ error: `Invalid source. Must be one of: ${validSources.join(', ')}` });
      return;
    }

    const results = await jobSearchSeriesCustom(id, query, source as 'comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal' | undefined);
    const job = await getJob(id);

    res.json({ results, job });
  } catch (error) {
    console.error('Failed to search:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to search',
    });
  }
});

/**
 * POST /api/metadata-jobs/:id/load-more
 * Load more search results for current series
 */
router.post('/:id/load-more', async (req: Request, res: Response) => {
  try {
    const id = req.params.id!;

    const results = await jobLoadMoreSeriesResults(id);
    const job = await getJob(id);

    res.json({ results, job });
  } catch (error) {
    console.error('Failed to load more results:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load more results',
    });
  }
});

/**
 * POST /api/metadata-jobs/:id/approve-series
 * Approve selected series
 * Body: { selectedSeriesId: string, issueMatchingSeriesId?: string, applyToRemaining?: boolean }
 */
router.post('/:id/approve-series', async (req: Request, res: Response) => {
  try {
    const { selectedSeriesId, issueMatchingSeriesId, applyToRemaining } = req.body as {
      selectedSeriesId: string;
      issueMatchingSeriesId?: string;
      applyToRemaining?: boolean;
    };
    const id = req.params.id!;

    if (!selectedSeriesId) {
      res.status(400).json({ error: 'selectedSeriesId is required' });
      return;
    }

    const result = await jobApproveSeries(id, selectedSeriesId, issueMatchingSeriesId, applyToRemaining);
    const job = await getJob(id);

    res.json({ ...result, job });
  } catch (error) {
    console.error('Failed to approve series:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to approve series',
    });
  }
});

/**
 * POST /api/metadata-jobs/:id/skip-series
 * Skip current series
 */
router.post('/:id/skip-series', async (req: Request, res: Response) => {
  try {
    const result = await jobSkipSeries(req.params.id!);
    const job = await getJob(req.params.id!);

    res.json({ ...result, job });
  } catch (error) {
    console.error('Failed to skip series:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to skip series',
    });
  }
});

/**
 * POST /api/metadata-jobs/:id/navigate-series/:index
 * Navigate to a series group for review/change (keeps current selection visible)
 */
router.post('/:id/navigate-series/:index', async (req: Request, res: Response) => {
  try {
    const index = parseInt(req.params.index!, 10);

    if (isNaN(index) || index < 0) {
      res.status(400).json({ error: 'index must be a non-negative integer' });
      return;
    }

    const session = await jobNavigateToSeriesGroup(req.params.id!, index);
    const job = await getJob(req.params.id!);

    res.json({
      success: true,
      status: session.status,
      currentSeriesIndex: session.currentSeriesIndex,
      currentSeriesGroup: session.seriesGroups[session.currentSeriesIndex] || null,
      job,
    });
  } catch (error) {
    console.error('Failed to navigate to series group:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to navigate to series group',
    });
  }
});

/**
 * POST /api/metadata-jobs/:id/reset-series/:index
 * Reset a series group (clears current selection) for full re-search
 */
router.post('/:id/reset-series/:index', async (req: Request, res: Response) => {
  try {
    const index = parseInt(req.params.index!, 10);

    if (isNaN(index) || index < 0) {
      res.status(400).json({ error: 'index must be a non-negative integer' });
      return;
    }

    const session = await jobResetSeriesGroup(req.params.id!, index);
    const job = await getJob(req.params.id!);

    res.json({
      success: true,
      status: session.status,
      currentSeriesIndex: session.currentSeriesIndex,
      currentSeriesGroup: session.seriesGroups[session.currentSeriesIndex] || null,
      job,
    });
  } catch (error) {
    console.error('Failed to reset series group:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to reset series group',
    });
  }
});

// =============================================================================
// File Review
// =============================================================================

/**
 * GET /api/metadata-jobs/:id/files/:fileId/available-issues
 * Get available issues for manual selection
 */
router.get('/:id/files/:fileId/available-issues', async (req: Request, res: Response) => {
  try {
    const result = await jobGetAvailableIssuesForFile(req.params.id!, req.params.fileId!);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Job session not found') {
      res.status(404).json({ error: 'Job session not found' });
      return;
    }
    if (error instanceof Error && error.message === 'File not found in session') {
      res.status(404).json({ error: 'File not found in session' });
      return;
    }
    console.error('Failed to get available issues:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get available issues',
    });
  }
});

/**
 * PATCH /api/metadata-jobs/:id/files/:fileId
 * Update field approvals for a file
 */
router.patch('/:id/files/:fileId', async (req: Request, res: Response) => {
  try {
    const { fieldUpdates } = req.body as {
      fieldUpdates: Record<string, { approved?: boolean; editedValue?: string | number }>;
    };

    const fileChange = await jobUpdateFieldApprovals(req.params.id!, req.params.fileId!, fieldUpdates);
    const job = await getJob(req.params.id!);

    res.json({ fileChange, job });
  } catch (error) {
    console.error('Failed to update field approvals:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update approvals',
    });
  }
});

/**
 * POST /api/metadata-jobs/:id/files/:fileId/reject
 * Reject a file
 */
router.post('/:id/files/:fileId/reject', async (req: Request, res: Response) => {
  try {
    const fileChange = await jobRejectFile(req.params.id!, req.params.fileId!);
    const job = await getJob(req.params.id!);

    res.json({ fileChange, job });
  } catch (error) {
    console.error('Failed to reject file:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to reject file',
    });
  }
});

/**
 * POST /api/metadata-jobs/:id/accept-all
 * Accept all files
 */
router.post('/:id/accept-all', async (req: Request, res: Response) => {
  try {
    await jobAcceptAllFiles(req.params.id!);
    const job = await getJob(req.params.id!);

    res.json({ job });
  } catch (error) {
    console.error('Failed to accept all:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to accept all',
    });
  }
});

/**
 * POST /api/metadata-jobs/:id/reject-all
 * Reject all files
 */
router.post('/:id/reject-all', async (req: Request, res: Response) => {
  try {
    await jobRejectAllFiles(req.params.id!);
    const job = await getJob(req.params.id!);

    res.json({ job });
  } catch (error) {
    console.error('Failed to reject all:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to reject all',
    });
  }
});

// =============================================================================
// Apply Changes
// =============================================================================

/**
 * POST /api/metadata-jobs/:id/apply
 * Enqueue the apply operation for background processing.
 * Returns immediately - poll GET /:id for status updates.
 * Automatically converts CBR files to CBZ before applying metadata.
 */
router.post('/:id/apply', async (req: Request, res: Response) => {
  const jobId = req.params.id!;

  try {
    // Check if job exists
    const job = await getJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // Verify job is in a state where apply makes sense
    if (job.status !== 'file_review') {
      res.status(400).json({
        error: `Cannot apply: job is in '${job.status}' state, expected 'file_review'`,
      });
      return;
    }

    // Check if already queued or processing
    if (isJobInQueue(jobId)) {
      res.json({
        status: 'already_queued',
        message: 'Apply operation is already queued or processing',
        jobId,
      });
      return;
    }

    // Enqueue for background processing
    enqueueJob(jobId, 'apply');

    res.json({
      status: 'queued',
      message: 'Apply operation queued for processing',
      jobId,
    });
  } catch (error) {
    console.error('Failed to apply changes:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to apply changes',
    });
  }
});

export default router;
