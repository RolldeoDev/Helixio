/**
 * Recommendations Routes
 *
 * API endpoints for comic recommendations:
 * - Get personalized recommendations
 * - Get random discovery comics
 */

import { Router, Request, Response } from 'express';
import {
  getRecommendations,
  getDiscoverComics,
} from '../services/recommendations.service.js';
import { logError } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Recommendations
// =============================================================================

/**
 * GET /api/recommendations
 * Get personalized comic recommendations
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

/**
 * GET /api/recommendations/discover
 * Get random unread comics for discovery
 *
 * Query params:
 * - libraryId (optional): Filter by library
 * - limit (optional): Number of comics (default: 12)
 */
router.get('/discover', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 12;
    const libraryId = req.query.libraryId as string | undefined;

    const result = await getDiscoverComics(limit, libraryId);
    res.json(result);
  } catch (error) {
    logError('recommendations', error, { action: 'get-discover-comics' });
    res.status(500).json({
      error: 'Failed to get discover comics',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
