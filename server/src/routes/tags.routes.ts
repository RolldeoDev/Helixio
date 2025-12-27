/**
 * Tags Routes
 *
 * API endpoints for tag autocomplete functionality.
 */

import { Router, Request, Response } from 'express';
import {
  searchTagValues,
  rebuildAllTags,
  getTagStats,
  isValidTagFieldType,
  TAG_FIELD_TYPES,
  type TagFieldType,
} from '../services/tag-autocomplete.service.js';
import { logError } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Autocomplete Endpoints
// =============================================================================

/**
 * GET /api/tags/autocomplete
 * Search for tag values with prefix matching.
 *
 * Query params:
 * - field: TagFieldType (required) - One of: characters, teams, locations, genres, tags, storyArcs, publishers, writers, pencillers, inkers, colorists, letterers, coverArtists, editors
 * - q: search query (required, min 1 char)
 * - limit: number (default 10, max 50)
 * - offset: number (default 0)
 */
router.get('/autocomplete', async (req: Request, res: Response): Promise<void> => {
  try {
    const field = req.query.field as string;
    const query = req.query.q as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    // Validate field type
    if (!field || !isValidTagFieldType(field)) {
      res.status(400).json({
        error: 'Invalid field type',
        message: `field must be one of: ${TAG_FIELD_TYPES.join(', ')}`,
      });
      return;
    }

    // Validate query
    if (!query || query.length < 1) {
      res.status(400).json({
        error: 'Invalid query',
        message: 'Query parameter "q" is required and must have at least 1 character',
      });
      return;
    }

    const result = await searchTagValues(field as TagFieldType, query, limit, offset);

    res.json({
      values: result.values,
      hasMore: result.hasMore,
      field,
      query,
      limit,
      offset,
    });
  } catch (err) {
    logError('tags', err, { action: 'tag-autocomplete' });
    res.status(500).json({
      error: 'Autocomplete failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Admin Endpoints
// =============================================================================

/**
 * POST /api/tags/rebuild
 * Rebuild all tags from source data (Series and FileMetadata).
 * This is an admin operation that clears and repopulates the TagValue table.
 */
router.post('/rebuild', async (_req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const result = await rebuildAllTags();
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      totalValues: result.totalValues,
      byFieldType: result.byFieldType,
      durationMs: duration,
    });
  } catch (err) {
    logError('tags', err, { action: 'rebuild-tags' });
    res.status(500).json({
      error: 'Rebuild failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/tags/stats
 * Get statistics about the tag value table.
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getTagStats();

    res.json(stats);
  } catch (err) {
    logError('tags', err, { action: 'get-tag-stats' });
    res.status(500).json({
      error: 'Failed to get stats',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/tags/fields
 * Get list of supported field types.
 */
router.get('/fields', async (_req: Request, res: Response): Promise<void> => {
  res.json({
    fields: TAG_FIELD_TYPES,
  });
});

export default router;
