/**
 * External Ratings Routes
 *
 * API endpoints for managing external community/critic ratings.
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import { getDatabase } from '../services/database.service.js';
import {
  syncSeriesRatings,
  syncIssueRatings,
  getExternalRatings,
  getIssueExternalRatings,
  deleteSeriesRatings,
  deleteIssueRatings,
  getRatingSourcesStatus,
  getSeriesAverageExternalRating,
  validateCbrUrl,
  saveManualCbrMatch,
  getCbrMatchStatus,
  resetCbrMatch,
} from '../services/rating-sync.service.js';
import {
  createRatingSyncJob,
  getJobStatus,
  cancelJob,
  getJobs,
} from '../services/rating-sync-job.service.js';
import {
  getExternalRatingsSettings,
  updateExternalRatingsSettings,
} from '../services/config.service.js';
import { initializeSSE } from '../services/sse.service.js';
import {
  getSitemapIndexStatus,
  refreshSitemapIndex,
} from '../services/comicbookroundup/sitemap-index.js';
import type { RatingSource } from '../services/rating-providers/types.js';
import { createServiceLogger } from '../services/logger.service.js';

const logger = createServiceLogger('external-ratings-routes');
const router = Router();

// All external ratings routes require authentication
router.use(requireAuth);

// =============================================================================
// Series Rating Endpoints
// =============================================================================

/**
 * GET /api/external-ratings/series/:seriesId
 * Get external ratings for a series
 */
router.get('/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params.seriesId;
    if (!seriesId) {
      res.status(400).json({ error: 'Series ID is required' });
      return;
    }

    // Fetch ratings and averages in parallel for better performance
    const [ratings, communityAvg, criticAvg] = await Promise.all([
      getExternalRatings(seriesId),
      getSeriesAverageExternalRating(seriesId, 'community'),
      getSeriesAverageExternalRating(seriesId, 'critic'),
    ]);

    res.json({
      ratings,
      averages: {
        community: communityAvg,
        critic: criticAvg,
      },
    });
  } catch (error) {
    logger.error({ error, seriesId: req.params.seriesId }, 'Error getting external ratings');
    res.status(500).json({
      error: 'Failed to get external ratings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/external-ratings/sync/series/:seriesId
 * Manually sync ratings for a series
 * If includeIssues is true, also queues a background job for issue ratings
 */
router.post('/sync/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params.seriesId;
    if (!seriesId) {
      res.status(400).json({ error: 'Series ID is required' });
      return;
    }
    const { sources, forceRefresh, includeIssues } = req.body as {
      sources?: RatingSource[];
      forceRefresh?: boolean;
      includeIssues?: boolean;
    };

    logger.info({ seriesId, forceRefresh, includeIssues }, 'Manual rating sync requested');

    // If no sources specified, auto-detect based on series type and external IDs
    let effectiveSources = sources;
    if (!effectiveSources || effectiveSources.length === 0) {
      const db = getDatabase();
      const series = await db.series.findUnique({
        where: { id: seriesId },
        select: { type: true, anilistId: true, comicVineId: true, metronId: true },
      });

      const isManga = series?.type === 'manga';

      if (isManga) {
        // For manga: prioritize AniList (CBR doesn't have manga)
        if (series?.anilistId) {
          // If we have an AniList ID, only use AniList (most reliable)
          effectiveSources = ['anilist'] as RatingSource[];
        } else {
          // No AniList ID - try AniList search first, CBR as fallback
          effectiveSources = ['anilist', 'comicbookroundup'] as RatingSource[];
        }
      } else {
        // For western comics: prioritize CBR, add AniList if ID exists
        effectiveSources = ['comicbookroundup'] as RatingSource[];
        if (series?.anilistId) {
          effectiveSources.push('anilist');
        }
        // Could add comicvine/metron here when those providers are implemented
      }
    }

    logger.debug({ seriesId, effectiveSources }, 'Using rating sources');

    const result = await syncSeriesRatings(seriesId, {
      sources: effectiveSources,
      forceRefresh: forceRefresh ?? true,
    });

    let issueJobId: string | undefined;

    // If includeIssues is true and series sync was successful, queue issue sync job
    if (includeIssues && result.success) {
      try {
        issueJobId = await createRatingSyncJob({
          type: 'series-issues',
          seriesId,
          forceRefresh,
        });
        logger.info({ seriesId, issueJobId }, 'Queued series issue ratings job');
      } catch (error) {
        logger.error({ error, seriesId }, 'Failed to queue issue ratings job');
        // Don't fail the whole request, just log the error
      }
    }

    res.json({ ...result, issueJobId });
  } catch (error) {
    logger.error({ error, seriesId: req.params.seriesId }, 'Error syncing ratings');
    res.status(500).json({
      error: 'Failed to sync ratings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/external-ratings/series/:seriesId
 * Delete all external ratings for a series
 */
router.delete('/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params.seriesId;
    if (!seriesId) {
      res.status(400).json({ error: 'Series ID is required' });
      return;
    }
    await deleteSeriesRatings(seriesId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, seriesId: req.params.seriesId }, 'Error deleting ratings');
    res.status(500).json({
      error: 'Failed to delete ratings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Manual CBR Match Endpoints
// =============================================================================

/**
 * POST /api/external-ratings/cbr/validate
 * Validate a CBR URL and return preview data (does NOT save)
 */
router.post('/cbr/validate', async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    const result = await validateCbrUrl(url);
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error validating CBR URL');
    res.status(500).json({
      valid: false,
      error: 'Failed to validate URL',
    });
  }
});

/**
 * POST /api/external-ratings/cbr/match/:seriesId
 * Apply manual CBR match: validate, fetch ratings, save
 */
router.post('/cbr/match/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params.seriesId;
    const { url } = req.body as { url?: string };

    if (!seriesId) {
      res.status(400).json({ error: 'Series ID is required' });
      return;
    }

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    logger.info({ seriesId, url }, 'Manual CBR match requested');

    const result = await saveManualCbrMatch(seriesId, url);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (error) {
    logger.error({ error, seriesId: req.params.seriesId }, 'Error applying manual CBR match');
    res.status(500).json({
      success: false,
      error: 'Failed to apply manual match',
    });
  }
});

/**
 * GET /api/external-ratings/cbr/status/:seriesId
 * Get current CBR match status for a series
 */
router.get('/cbr/status/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params.seriesId;
    if (!seriesId) {
      res.status(400).json({ error: 'Series ID is required' });
      return;
    }

    const status = await getCbrMatchStatus(seriesId);
    res.json(status);
  } catch (error) {
    logger.error({ error, seriesId: req.params.seriesId }, 'Error getting CBR match status');
    res.status(500).json({
      error: 'Failed to get match status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/external-ratings/cbr/match/:seriesId
 * Reset CBR match for a series
 * Query param: reSearch=true to re-run automatic search after clearing
 */
router.delete('/cbr/match/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params.seriesId;
    if (!seriesId) {
      res.status(400).json({ error: 'Series ID is required' });
      return;
    }

    const reSearch = req.query.reSearch === 'true';

    logger.info({ seriesId, reSearch }, 'CBR match reset requested');

    const result = await resetCbrMatch(seriesId, reSearch);
    res.json(result);
  } catch (error) {
    logger.error({ error, seriesId: req.params.seriesId }, 'Error resetting CBR match');
    res.status(500).json({
      success: false,
      error: 'Failed to reset match',
    });
  }
});

// =============================================================================
// Issue Rating Endpoints
// =============================================================================

/**
 * GET /api/external-ratings/issues/:fileId
 * Get external ratings for an issue
 */
router.get('/issues/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.fileId;
    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' });
      return;
    }
    const ratings = await getIssueExternalRatings(fileId);
    res.json({ ratings });
  } catch (error) {
    logger.error({ error, fileId: req.params.fileId }, 'Error getting issue ratings');
    res.status(500).json({
      error: 'Failed to get issue ratings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/external-ratings/sync/issues/:fileId
 * Manually sync ratings for a single issue
 */
router.post('/sync/issues/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.fileId;
    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' });
      return;
    }
    const { forceRefresh } = req.body as { forceRefresh?: boolean };

    logger.info({ fileId, forceRefresh }, 'Manual issue rating sync requested');

    const result = await syncIssueRatings(fileId, {
      forceRefresh: forceRefresh ?? true,
    });

    res.json(result);
  } catch (error) {
    logger.error({ error, fileId: req.params.fileId }, 'Error syncing issue ratings');
    res.status(500).json({
      error: 'Failed to sync issue ratings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/external-ratings/sync/series/:seriesId/issues
 * Start a background job to sync ratings for all issues in a series
 */
router.post('/sync/series/:seriesId/issues', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params.seriesId;
    if (!seriesId) {
      res.status(400).json({ error: 'Series ID is required' });
      return;
    }
    const { forceRefresh } = req.body as { forceRefresh?: boolean };

    logger.info({ seriesId, forceRefresh }, 'Series issues rating sync requested');

    const jobId = await createRatingSyncJob({
      type: 'series-issues',
      seriesId,
      forceRefresh,
    });

    res.json({ jobId });
  } catch (error) {
    logger.error({ error, seriesId: req.params.seriesId }, 'Error starting series issues sync');
    res.status(500).json({
      error: 'Failed to start series issues sync',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/external-ratings/issues/:fileId
 * Delete all external ratings for an issue
 */
router.delete('/issues/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.fileId;
    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' });
      return;
    }
    await deleteIssueRatings(fileId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, fileId: req.params.fileId }, 'Error deleting issue ratings');
    res.status(500).json({
      error: 'Failed to delete issue ratings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Source Management Endpoints
// =============================================================================

/**
 * GET /api/external-ratings/sources
 * Get all rating sources and their status
 */
router.get('/sources', async (_req: Request, res: Response) => {
  try {
    const sources = await getRatingSourcesStatus();
    res.json({ sources });
  } catch (error) {
    logger.error({ error }, 'Error getting rating sources');
    res.status(500).json({
      error: 'Failed to get rating sources',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Library Sync Endpoints
// =============================================================================

/**
 * POST /api/external-ratings/sync/library/:libraryId
 * Start a background sync job for all series in a library
 */
router.post('/sync/library/:libraryId', async (req: Request, res: Response) => {
  try {
    const libraryId = req.params.libraryId;
    if (!libraryId) {
      res.status(400).json({ error: 'Library ID is required' });
      return;
    }
    const { sources, forceRefresh } = req.body as {
      sources?: RatingSource[];
      forceRefresh?: boolean;
    };

    logger.info({ libraryId, sources, forceRefresh }, 'Library rating sync requested');

    const jobId = await createRatingSyncJob({
      type: 'library',
      libraryId,
      sources,
      forceRefresh,
    });

    res.json({ jobId });
  } catch (error) {
    logger.error({ error, libraryId: req.params.libraryId }, 'Error starting library sync');
    res.status(500).json({
      error: 'Failed to start library sync',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/external-ratings/sync/scheduled
 * Trigger a scheduled sync job (admin only)
 */
router.post('/sync/scheduled', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { sources, forceRefresh } = req.body as {
      sources?: RatingSource[];
      forceRefresh?: boolean;
    };

    logger.info({ sources, forceRefresh }, 'Scheduled rating sync triggered');

    const jobId = await createRatingSyncJob({
      type: 'scheduled',
      sources,
      forceRefresh,
    });

    res.json({ jobId });
  } catch (error) {
    logger.error({ error }, 'Error starting scheduled sync');
    res.status(500).json({
      error: 'Failed to start scheduled sync',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Job Management Endpoints
// =============================================================================

/**
 * GET /api/external-ratings/jobs
 * Get list of sync jobs
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const parsedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const limit = parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined;

    const jobs = await getJobs({
      status: status as 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | undefined,
      limit,
    });

    res.json({ jobs });
  } catch (error) {
    logger.error({ error }, 'Error getting jobs');
    res.status(500).json({
      error: 'Failed to get jobs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/external-ratings/jobs/:jobId
 * Get status of a specific sync job
 */
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId;
    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required' });
      return;
    }
    const status = await getJobStatus(jobId);

    if (!status) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(status);
  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Error getting job status');
    res.status(500).json({
      error: 'Failed to get job status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/external-ratings/jobs/:jobId/stream
 * SSE stream for job progress updates
 */
router.get('/jobs/:jobId/stream', (req: Request, res: Response) => {
  const jobId = req.params.jobId;
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  // Initialize SSE connection
  initializeSSE(res, jobId);
});

/**
 * POST /api/external-ratings/jobs/:jobId/cancel
 * Cancel a running sync job
 */
router.post('/jobs/:jobId/cancel', async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId;
    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required' });
      return;
    }
    const cancelled = await cancelJob(jobId);

    if (!cancelled) {
      res.status(400).json({ error: 'Job cannot be cancelled (not found or already completed)' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Error cancelling job');
    res.status(500).json({
      error: 'Failed to cancel job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// CBR Sitemap Index Endpoints
// =============================================================================

/**
 * GET /api/external-ratings/cbr-sitemap/status
 * Get the status of the CBR sitemap index cache
 */
router.get('/cbr-sitemap/status', async (_req: Request, res: Response) => {
  try {
    const status = await getSitemapIndexStatus();
    res.json(status);
  } catch (error) {
    logger.error({ error }, 'Error getting sitemap index status');
    res.status(500).json({ error: 'Failed to get sitemap status' });
  }
});

/**
 * POST /api/external-ratings/cbr-sitemap/refresh
 * Force refresh the CBR sitemap index
 */
router.post('/cbr-sitemap/refresh', async (_req: Request, res: Response) => {
  try {
    const result = await refreshSitemapIndex();
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error refreshing sitemap index');
    res.status(500).json({ error: 'Failed to refresh sitemap index' });
  }
});

// =============================================================================
// Settings Endpoints
// =============================================================================

/**
 * GET /api/external-ratings/settings
 * Get external ratings settings (admin only)
 */
router.get('/settings', requireAdmin, (_req: Request, res: Response) => {
  try {
    const settings = getExternalRatingsSettings();
    res.json(settings);
  } catch (error) {
    logger.error({ error }, 'Error getting settings');
    res.status(500).json({
      error: 'Failed to get settings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/external-ratings/settings
 * Update external ratings settings (admin only)
 */
router.put('/settings', requireAdmin, (req: Request, res: Response) => {
  try {
    const updates = req.body;

    // Validate settings
    if (updates.enabledSources && !Array.isArray(updates.enabledSources)) {
      res.status(400).json({ error: 'enabledSources must be an array' });
      return;
    }

    if (
      updates.syncSchedule &&
      !['daily', 'weekly', 'manual'].includes(updates.syncSchedule)
    ) {
      res.status(400).json({
        error: 'syncSchedule must be "daily", "weekly", or "manual"',
      });
      return;
    }

    if (updates.syncHour !== undefined) {
      const hour = parseInt(updates.syncHour);
      if (isNaN(hour) || hour < 0 || hour > 23) {
        res.status(400).json({ error: 'syncHour must be 0-23' });
        return;
      }
    }

    if (updates.ratingTTLDays !== undefined) {
      const days = parseInt(updates.ratingTTLDays);
      if (isNaN(days) || days < 1 || days > 30) {
        res.status(400).json({ error: 'ratingTTLDays must be 1-30' });
        return;
      }
    }

    if (updates.scrapingRateLimit !== undefined) {
      const rate = parseInt(updates.scrapingRateLimit);
      if (isNaN(rate) || rate < 1 || rate > 60) {
        res.status(400).json({ error: 'scrapingRateLimit must be 1-60' });
        return;
      }
    }

    if (updates.minMatchConfidence !== undefined) {
      const conf = parseFloat(updates.minMatchConfidence);
      if (isNaN(conf) || conf < 0 || conf > 1) {
        res.status(400).json({ error: 'minMatchConfidence must be 0-1' });
        return;
      }
    }

    updateExternalRatingsSettings(updates);
    const settings = getExternalRatingsSettings();

    logger.info({ updates }, 'Updated external ratings settings');
    res.json(settings);
  } catch (error) {
    logger.error({ error }, 'Error updating settings');
    res.status(500).json({
      error: 'Failed to update settings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
