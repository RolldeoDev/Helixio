/**
 * Recommendations Routes
 *
 * API endpoints for comic recommendations:
 * - Get personalized recommendations (legacy)
 * - Get intelligent discover recommendations (new)
 * - Submit recommendation feedback
 * - Get recommendation stats
 */

import { Router, Request, Response } from 'express';
import {
  getRecommendations,
  getDiscoverComics,
} from '../services/recommendations.service.js';
import {
  getPersonalizedRecommendations,
  submitRecommendationFeedback,
  removeRecommendationFeedback,
  getUserFeedback,
  getRecommendationStats,
} from '../services/recommendation-engine.service.js';
import {
  getCachedRecommendations,
  setCachedRecommendations,
  invalidateUserRecommendations,
} from '../services/recommendation-cache.service.js';
import {
  getSimilarityStats,
  triggerFullRebuildJob,
  triggerIncrementalUpdate,
  getSimilaritySchedulerStatus,
} from '../services/similarity/index.js';
import { logError, logInfo } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Legacy Recommendations (keep for backwards compatibility)
// =============================================================================

/**
 * GET /api/recommendations
 * Get personalized comic recommendations (legacy file-based)
 *
 * Query params:
 * - libraryId (optional): Filter by library
 * - limit (optional): Max items per category (default: 8)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 8;
    const libraryId = req.query.libraryId as string | undefined;

    const recommendations = await getRecommendations(limit, libraryId);
    res.json(recommendations);
  } catch (error) {
    logError('recommendations', error, { action: 'get-recommendations' });
    res.status(500).json({
      error: 'Failed to get recommendations',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// New Intelligent Discover (Series-Based)
// =============================================================================

/**
 * GET /api/recommendations/discover
 * Get intelligent series recommendations for discovery
 *
 * Query params:
 * - libraryId (optional): Filter by library
 * - limit (optional): Number of series (default: 20)
 * - userId (required): User ID for personalization
 * - noCache (optional): Skip cache if 'true'
 */
router.get('/discover', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const libraryId = req.query.libraryId as string | undefined;
    const userId = req.query.userId as string;
    const noCache = req.query.noCache === 'true';

    if (!userId) {
      res.status(400).json({
        error: 'Missing userId parameter',
        message: 'userId is required for personalized recommendations',
      });
      return;
    }

    // Check cache first (unless noCache is specified)
    if (!noCache) {
      const cached = getCachedRecommendations(userId, libraryId);
      if (cached) {
        res.json({
          recommendations: cached,
          cached: true,
        });
        return;
      }
    }

    // Get personalized recommendations
    const recommendations = await getPersonalizedRecommendations(
      userId,
      limit,
      libraryId
    );

    // Cache the results
    setCachedRecommendations(userId, libraryId, recommendations);

    res.json({
      recommendations,
      cached: false,
    });
  } catch (error) {
    logError('recommendations', error, { action: 'get-discover' });
    res.status(500).json({
      error: 'Failed to get discover recommendations',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/recommendations/discover/legacy
 * Get random unread comics for discovery (legacy endpoint)
 *
 * Query params:
 * - libraryId (optional): Filter by library
 * - limit (optional): Number of comics (default: 12)
 */
router.get('/discover/legacy', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 12;
    const libraryId = req.query.libraryId as string | undefined;

    const result = await getDiscoverComics(limit, libraryId);
    res.json(result);
  } catch (error) {
    logError('recommendations', error, { action: 'get-discover-legacy' });
    res.status(500).json({
      error: 'Failed to get discover comics',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Recommendation Feedback
// =============================================================================

/**
 * POST /api/recommendations/feedback
 * Submit feedback on a recommendation
 *
 * Body:
 * - userId: string (required)
 * - recommendedSeriesId: string (required)
 * - feedbackType: 'like' | 'dislike' | 'not_interested' (required)
 * - sourceSeriesId: string (optional)
 */
router.post('/feedback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, recommendedSeriesId, feedbackType, sourceSeriesId } = req.body;

    if (!userId || !recommendedSeriesId || !feedbackType) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'userId, recommendedSeriesId, and feedbackType are required',
      });
      return;
    }

    if (!['like', 'dislike', 'not_interested'].includes(feedbackType)) {
      res.status(400).json({
        error: 'Invalid feedbackType',
        message: 'feedbackType must be one of: like, dislike, not_interested',
      });
      return;
    }

    await submitRecommendationFeedback(
      userId,
      recommendedSeriesId,
      feedbackType,
      sourceSeriesId
    );

    // Invalidate cached recommendations for this user
    invalidateUserRecommendations(userId);

    res.json({ success: true });
  } catch (error) {
    logError('recommendations', error, { action: 'submit-feedback' });
    res.status(500).json({
      error: 'Failed to submit feedback',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/recommendations/feedback
 * Remove feedback for a recommendation
 *
 * Body:
 * - userId: string (required)
 * - recommendedSeriesId: string (required)
 */
router.delete('/feedback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, recommendedSeriesId } = req.body;

    if (!userId || !recommendedSeriesId) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'userId and recommendedSeriesId are required',
      });
      return;
    }

    await removeRecommendationFeedback(userId, recommendedSeriesId);

    // Invalidate cached recommendations
    invalidateUserRecommendations(userId);

    res.json({ success: true });
  } catch (error) {
    logError('recommendations', error, { action: 'remove-feedback' });
    res.status(500).json({
      error: 'Failed to remove feedback',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/recommendations/feedback
 * Get user's recommendation feedback history
 *
 * Query params:
 * - userId (required): User ID
 */
router.get('/feedback', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({
        error: 'Missing userId parameter',
      });
      return;
    }

    const feedback = await getUserFeedback(userId);
    res.json({ feedback });
  } catch (error) {
    logError('recommendations', error, { action: 'get-feedback' });
    res.status(500).json({
      error: 'Failed to get feedback',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Stats and Admin
// =============================================================================

/**
 * GET /api/recommendations/stats
 * Get recommendation statistics for a user
 *
 * Query params:
 * - userId (required): User ID
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({
        error: 'Missing userId parameter',
      });
      return;
    }

    const stats = await getRecommendationStats(userId);
    res.json(stats);
  } catch (error) {
    logError('recommendations', error, { action: 'get-stats' });
    res.status(500).json({
      error: 'Failed to get stats',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/recommendations/similarity-stats
 * Get similarity computation statistics
 */
router.get('/similarity-stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getSimilarityStats();
    const schedulerStatus = getSimilaritySchedulerStatus();

    res.json({
      ...stats,
      scheduler: schedulerStatus,
    });
  } catch (error) {
    logError('recommendations', error, { action: 'get-similarity-stats' });
    res.status(500).json({
      error: 'Failed to get similarity stats',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/recommendations/similarity/rebuild
 * Trigger a full similarity rebuild (admin only)
 */
router.post('/similarity/rebuild', async (_req: Request, res: Response) => {
  try {
    logInfo('recommendations', 'Starting full similarity rebuild via API');

    // Start rebuild in background (don't wait for completion)
    triggerFullRebuildJob().catch((err) => {
      logError('recommendations', err, { action: 'similarity-rebuild' });
    });

    res.json({
      success: true,
      message: 'Full similarity rebuild started',
    });
  } catch (error) {
    logError('recommendations', error, { action: 'trigger-rebuild' });
    res.status(500).json({
      error: 'Failed to start rebuild',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/recommendations/similarity/update
 * Trigger an incremental similarity update (admin only)
 */
router.post('/similarity/update', async (_req: Request, res: Response) => {
  try {
    logInfo('recommendations', 'Starting incremental similarity update via API');

    // Start update in background
    triggerIncrementalUpdate().catch((err) => {
      logError('recommendations', err, { action: 'similarity-update' });
    });

    res.json({
      success: true,
      message: 'Incremental similarity update started',
    });
  } catch (error) {
    logError('recommendations', error, { action: 'trigger-update' });
    res.status(500).json({
      error: 'Failed to start update',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
