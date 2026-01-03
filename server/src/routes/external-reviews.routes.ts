/**
 * External Reviews Routes
 *
 * API endpoints for managing external review aggregation from
 * AniList, MyAnimeList, and Comic Book Roundup.
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  syncSeriesReviews,
  syncIssueReviews,
  getExternalReviews,
  getIssueExternalReviews,
  deleteSeriesReviews,
  deleteIssueReviews,
  getSeriesReviewCount,
  getIssueReviewCount,
  getReviewSourcesStatus,
} from '../services/review-sync.service.js';
import {
  createReviewSyncJob,
  getJobStatus,
  cancelJob,
  getRecentJobs,
} from '../services/review-sync-job.service.js';
import {
  getSeriesPublicReviews,
  getIssuePublicReviews,
  getSeriesPublicReviewCount,
  getIssuePublicReviewCount,
} from '../services/user-data.service.js';
import { initializeSSE } from '../services/sse.service.js';
import type { ReviewSource } from '../services/review-providers/types.js';
import { createServiceLogger } from '../services/logger.service.js';

const logger = createServiceLogger('external-reviews-routes');
const router = Router();

// Most routes require authentication
router.use(requireAuth);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert Date to ISO string or null
 */
function dateToString(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

// =============================================================================
// Series Reviews
// =============================================================================

/**
 * GET /api/external-reviews/series/:seriesId
 * Get all external reviews for a series
 */
router.get('/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params.seriesId;
    if (!seriesId) {
      return res.status(400).json({ error: 'Series ID is required' });
    }

    const {
      source,
      limit,
      skipSpoilers,
      includeUserReviews,
    } = req.query as {
      source?: ReviewSource;
      limit?: string;
      skipSpoilers?: string;
      includeUserReviews?: string;
    };

    // Validate and bound the limit parameter
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit) || 50, 1), 100) : undefined;

    const externalReviews = await getExternalReviews(seriesId, {
      source,
      limit: parsedLimit,
      skipSpoilers: skipSpoilers === 'true',
    });

    // Optionally include Helixio user reviews
    let userReviews: Array<{
      userId: string;
      username: string;
      displayName: string | null;
      rating: number | null;
      publicReview: string | null;
      reviewedAt: string | null;
    }> = [];

    if (includeUserReviews === 'true') {
      const rawReviews = await getSeriesPublicReviews(seriesId);
      userReviews = rawReviews.map((r) => ({
        ...r,
        reviewedAt: dateToString(r.reviewedAt),
      }));
    }

    // Get review counts (always count all reviews, even if not returning them)
    const [externalCounts, helixioCount] = await Promise.all([
      getSeriesReviewCount(seriesId),
      getSeriesPublicReviewCount(seriesId),
    ]);

    return res.json({
      externalReviews,
      userReviews,
      counts: {
        external: externalCounts.total,
        user: helixioCount,
        bySource: externalCounts.bySource,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error getting series reviews');
    return res.status(500).json({ error: 'Failed to get reviews' });
  }
});

/**
 * POST /api/external-reviews/sync/series/:seriesId
 * Manually sync external reviews for a series
 */
router.post('/sync/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params.seriesId;
    if (!seriesId) {
      return res.status(400).json({ error: 'Series ID is required' });
    }

    const {
      sources,
      forceRefresh,
      reviewLimit,
      skipSpoilers,
    } = req.body as {
      sources?: ReviewSource[];
      forceRefresh?: boolean;
      reviewLimit?: number;
      skipSpoilers?: boolean;
    };

    const result = await syncSeriesReviews(seriesId, {
      sources,
      forceRefresh: forceRefresh ?? true,
      reviewLimit: reviewLimit ?? 10,
      skipSpoilers,
    });

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error syncing series reviews');
    return res.status(500).json({ error: 'Failed to sync reviews' });
  }
});

/**
 * DELETE /api/external-reviews/series/:seriesId
 * Delete all external reviews for a series
 */
router.delete('/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params.seriesId;
    if (!seriesId) {
      return res.status(400).json({ error: 'Series ID is required' });
    }

    await deleteSeriesReviews(seriesId);
    return res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error deleting series reviews');
    return res.status(500).json({ error: 'Failed to delete reviews' });
  }
});

// =============================================================================
// Issue Reviews
// =============================================================================

/**
 * GET /api/external-reviews/issues/:fileId
 * Get all external reviews for an issue
 */
router.get('/issues/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.fileId;
    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    const {
      source,
      limit,
      skipSpoilers,
      includeUserReviews,
    } = req.query as {
      source?: ReviewSource;
      limit?: string;
      skipSpoilers?: string;
      includeUserReviews?: string;
    };

    // Validate and bound the limit parameter
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit) || 50, 1), 100) : undefined;

    const externalReviews = await getIssueExternalReviews(fileId, {
      source,
      limit: parsedLimit,
      skipSpoilers: skipSpoilers === 'true',
    });

    // Optionally include Helixio user reviews
    let userReviews: Array<{
      userId: string;
      username: string;
      displayName: string | null;
      rating: number | null;
      publicReview: string | null;
      reviewedAt: string | null;
    }> = [];

    if (includeUserReviews === 'true') {
      const rawReviews = await getIssuePublicReviews(fileId);
      userReviews = rawReviews.map((r) => ({
        ...r,
        reviewedAt: dateToString(r.reviewedAt),
      }));
    }

    // Get review counts (always count all reviews, even if not returning them)
    const [externalCount, helixioCount] = await Promise.all([
      getIssueReviewCount(fileId),
      getIssuePublicReviewCount(fileId),
    ]);

    return res.json({
      externalReviews,
      userReviews,
      counts: {
        external: externalCount,
        user: helixioCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error getting issue reviews');
    return res.status(500).json({ error: 'Failed to get reviews' });
  }
});

/**
 * POST /api/external-reviews/sync/issues/:fileId
 * Manually sync external reviews for an issue
 */
router.post('/sync/issues/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.fileId;
    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    const {
      forceRefresh,
      reviewLimit,
      skipSpoilers,
    } = req.body as {
      forceRefresh?: boolean;
      reviewLimit?: number;
      skipSpoilers?: boolean;
    };

    const result = await syncIssueReviews(fileId, {
      forceRefresh: forceRefresh ?? true,
      reviewLimit: reviewLimit ?? 15,
      skipSpoilers,
    });

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error syncing issue reviews');
    return res.status(500).json({ error: 'Failed to sync reviews' });
  }
});

/**
 * DELETE /api/external-reviews/issues/:fileId
 * Delete all external reviews for an issue
 */
router.delete('/issues/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.fileId;
    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    await deleteIssueReviews(fileId);
    return res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error deleting issue reviews');
    return res.status(500).json({ error: 'Failed to delete reviews' });
  }
});

// =============================================================================
// Library Sync
// =============================================================================

/**
 * POST /api/external-reviews/sync/library/:libraryId
 * Queue a background job to sync reviews for all series in a library
 */
router.post('/sync/library/:libraryId', async (req: Request, res: Response) => {
  try {
    const libraryId = req.params.libraryId;
    if (!libraryId) {
      return res.status(400).json({ error: 'Library ID is required' });
    }

    const { sources, forceRefresh, reviewLimit } = req.body as {
      sources?: ReviewSource[];
      forceRefresh?: boolean;
      reviewLimit?: number;
    };

    const jobId = await createReviewSyncJob({
      type: 'library',
      libraryId,
      sources,
      forceRefresh,
      reviewLimit,
    });

    return res.json({ jobId, message: 'Review sync job queued' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error creating library review sync job');
    return res.status(500).json({ error: 'Failed to queue sync job' });
  }
});

// =============================================================================
// Job Management
// =============================================================================

/**
 * GET /api/external-reviews/jobs
 * Get list of recent review sync jobs
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { status, limit } = req.query as {
      status?: string;
      limit?: string;
    };

    // Validate and bound the limit parameter
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit) || 20, 1), 100) : undefined;

    const jobs = await getRecentJobs({
      status,
      limit: parsedLimit,
    });

    res.json({ jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error getting review sync jobs');
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

/**
 * GET /api/external-reviews/jobs/:jobId
 * Get status of a specific review sync job
 */
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId;
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const status = await getJobStatus(jobId);

    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error getting job status');
    return res.status(500).json({ error: 'Failed to get job status' });
  }
});

/**
 * GET /api/external-reviews/jobs/:jobId/stream
 * SSE stream for job progress updates
 */
router.get('/jobs/:jobId/stream', async (req: Request, res: Response) => {
  const jobId = req.params.jobId;
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID is required' });
  }

  const status = await getJobStatus(jobId);
  if (!status) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Initialize SSE connection - this doesn't return, it maintains the connection
  initializeSSE(res, `review-sync-${jobId}`);
  return;
});

/**
 * POST /api/external-reviews/jobs/:jobId/cancel
 * Cancel a running review sync job
 */
router.post('/jobs/:jobId/cancel', async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId;
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const cancelled = await cancelJob(jobId);

    if (!cancelled) {
      return res.status(400).json({ error: 'Job cannot be cancelled' });
    }

    return res.json({ success: true, message: 'Cancellation requested' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error cancelling job');
    return res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// =============================================================================
// Sources & Settings
// =============================================================================

/**
 * GET /api/external-reviews/sources
 * Get available review sources and their status
 */
router.get('/sources', async (req: Request, res: Response) => {
  try {
    const sources = await getReviewSourcesStatus();
    res.json({ sources });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Error getting review sources');
    res.status(500).json({ error: 'Failed to get sources' });
  }
});

export default router;
