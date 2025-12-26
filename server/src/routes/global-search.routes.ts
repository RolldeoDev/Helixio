/**
 * Global Search Routes
 *
 * API endpoints for the global search bar feature.
 * Provides unified search across series, issues, and creators.
 */

import { Router, Request, Response } from 'express';
import {
  globalSearch,
  clearSearchCache,
  getSearchCacheStats,
} from '../services/global-search.service.js';

const router = Router();

// =============================================================================
// Search Endpoint
// =============================================================================

/**
 * GET /api/search/global
 * Unified search across series, issues, and creators.
 *
 * Query params:
 * - q: search query (required, min 2 chars)
 * - limit: number (default 6, max 20)
 * - types: comma-separated list of types to search (default: series,issue,creator)
 * - libraryId: optional library ID to filter results
 */
router.get('/global', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 6, 20);
    const typesParam = req.query.types as string;
    const libraryId = req.query.libraryId as string | undefined;

    // Validate query
    if (!query || query.trim().length < 2) {
      res.status(400).json({
        error: 'Invalid query',
        message: 'Query parameter "q" is required and must have at least 2 characters',
      });
      return;
    }

    // Parse types
    const validTypes = ['series', 'issue', 'creator'] as const;
    let types: ('series' | 'issue' | 'creator')[] = [...validTypes];

    if (typesParam) {
      const requestedTypes = typesParam.split(',').map((t) => t.trim().toLowerCase());
      types = requestedTypes.filter((t): t is 'series' | 'issue' | 'creator' =>
        validTypes.includes(t as typeof validTypes[number])
      );

      if (types.length === 0) {
        res.status(400).json({
          error: 'Invalid types',
          message: `types must be comma-separated list of: ${validTypes.join(', ')}`,
        });
        return;
      }
    }

    const result = await globalSearch(query, { limit, types, libraryId });

    res.json(result);
  } catch (err) {
    console.error('Error in global search:', err);
    res.status(500).json({
      error: 'Search failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Cache Management (Admin)
// =============================================================================

/**
 * DELETE /api/search/global/cache
 * Clear the global search cache.
 */
router.delete('/global/cache', async (_req: Request, res: Response): Promise<void> => {
  try {
    clearSearchCache();
    res.json({ success: true, message: 'Search cache cleared' });
  } catch (err) {
    console.error('Error clearing search cache:', err);
    res.status(500).json({
      error: 'Failed to clear cache',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/search/global/cache/stats
 * Get search cache statistics.
 */
router.get('/global/cache/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = getSearchCacheStats();
    res.json(stats);
  } catch (err) {
    console.error('Error getting cache stats:', err);
    res.status(500).json({
      error: 'Failed to get cache stats',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
