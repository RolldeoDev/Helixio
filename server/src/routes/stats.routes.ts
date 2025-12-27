/**
 * Stats Routes
 *
 * API endpoints for accessing pre-computed stats.
 */

import { Router } from 'express';
import { cachePresets } from '../middleware/cache.middleware.js';
import {
  getAggregatedStats,
  getEntityStats,
  getEntityStat,
  getEntityDetails,
  getTopEntitiesSummary,
} from '../services/stats-query.service.js';
import {
  triggerDirtyStatsProcessing,
  triggerFullRebuild,
  getSchedulerStatus,
} from '../services/stats-scheduler.service.js';
import { getDirtyFlagCount } from '../services/stats-dirty.service.js';
import type { EntityType } from '../services/stats-dirty.service.js';
import { logError, logInfo } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Aggregated Stats
// =============================================================================

/**
 * GET /api/stats
 * Get aggregated stats for user or specific library
 */
router.get('/', cachePresets.shortTerm, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const stats = await getAggregatedStats(libraryId as string | undefined);
    res.json(stats);
  } catch (error) {
    logError('stats', error, { action: 'get-aggregated-stats' });
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * GET /api/stats/summary
 * Get summary with top entities for dashboard
 */
router.get('/summary', cachePresets.shortTerm, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const [stats, topEntities] = await Promise.all([
      getAggregatedStats(libraryId as string | undefined),
      getTopEntitiesSummary(libraryId as string | undefined),
    ]);

    res.json({
      ...stats,
      ...topEntities,
    });
  } catch (error) {
    logError('stats', error, { action: 'get-stats-summary' });
    res.status(500).json({ error: 'Failed to get stats summary' });
  }
});

// =============================================================================
// Entity Stats
// =============================================================================

/**
 * GET /api/stats/entities/:entityType
 * Get stats for a specific entity type (creators, genres, characters, teams, publishers)
 */
router.get('/entities/:entityType', async (req, res) => {
  try {
    const { entityType } = req.params;
    const { libraryId, sortBy, limit, offset } = req.query;

    // Validate entity type
    const validTypes: EntityType[] = ['creator', 'genre', 'character', 'team', 'publisher'];
    if (!validTypes.includes(entityType as EntityType)) {
      res.status(400).json({ error: `Invalid entity type. Must be one of: ${validTypes.join(', ')}` });
      return;
    }

    const result = await getEntityStats({
      entityType: entityType as EntityType,
      libraryId: libraryId as string | undefined,
      sortBy: (sortBy as 'owned' | 'read' | 'time') || 'owned',
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    res.json(result);
  } catch (error) {
    logError('stats', error, { action: 'get-entity-stats' });
    res.status(500).json({ error: 'Failed to get entity stats' });
  }
});

/**
 * GET /api/stats/entities/:entityType/:entityName
 * Get detailed stats for a specific entity
 */
router.get('/entities/:entityType/:entityName', async (req, res) => {
  try {
    const { entityType, entityName } = req.params;
    const { libraryId, entityRole } = req.query;

    // Validate entity type
    const validTypes: EntityType[] = ['creator', 'genre', 'character', 'team', 'publisher'];
    if (!validTypes.includes(entityType as EntityType)) {
      res.status(400).json({ error: `Invalid entity type. Must be one of: ${validTypes.join(', ')}` });
      return;
    }

    // Decode the entity name (it may be URL encoded)
    const decodedName = decodeURIComponent(entityName);

    const details = await getEntityDetails({
      entityType: entityType as EntityType,
      entityName: decodedName,
      entityRole: entityRole as string | undefined,
      libraryId: libraryId as string | undefined,
    });

    if (!details) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    res.json(details);
  } catch (error) {
    logError('stats', error, { action: 'get-entity-details' });
    res.status(500).json({ error: 'Failed to get entity details' });
  }
});

/**
 * GET /api/stats/entities/:entityType/:entityName/stat
 * Get just the stat record for a specific entity (lighter weight than details)
 */
router.get('/entities/:entityType/:entityName/stat', async (req, res) => {
  try {
    const { entityType, entityName } = req.params;
    const { libraryId, entityRole } = req.query;

    // Validate entity type
    const validTypes: EntityType[] = ['creator', 'genre', 'character', 'team', 'publisher'];
    if (!validTypes.includes(entityType as EntityType)) {
      res.status(400).json({ error: `Invalid entity type. Must be one of: ${validTypes.join(', ')}` });
      return;
    }

    const decodedName = decodeURIComponent(entityName);

    const stat = await getEntityStat({
      entityType: entityType as EntityType,
      entityName: decodedName,
      entityRole: entityRole as string | undefined,
      libraryId: libraryId as string | undefined,
    });

    if (!stat) {
      res.status(404).json({ error: 'Entity stat not found' });
      return;
    }

    res.json(stat);
  } catch (error) {
    logError('stats', error, { action: 'get-entity-stat' });
    res.status(500).json({ error: 'Failed to get entity stat' });
  }
});

// =============================================================================
// Admin/Manual Triggers
// =============================================================================

/**
 * POST /api/stats/rebuild
 * Trigger stats rebuild (admin/manual)
 */
router.post('/rebuild', async (req, res) => {
  try {
    const { scope } = req.body as { scope?: 'dirty' | 'full' };

    if (scope === 'full') {
      // Queue full rebuild
      triggerFullRebuild()
        .then(() => logInfo('stats', 'Full rebuild completed'))
        .catch((err) => logError('stats', err, { action: 'full-rebuild' }));

      res.json({
        success: true,
        message: 'Full rebuild started in background',
      });
    } else {
      // Process dirty stats
      const result = await triggerDirtyStatsProcessing();
      res.json({
        success: true,
        message: `Processed ${result.processed} dirty stat scope(s)`,
        processed: result.processed,
      });
    }
  } catch (error) {
    logError('stats', error, { action: 'trigger-rebuild' });
    res.status(500).json({ error: 'Failed to trigger rebuild' });
  }
});

/**
 * GET /api/stats/scheduler
 * Get scheduler status
 */
router.get('/scheduler', async (_req, res) => {
  try {
    const status = getSchedulerStatus();
    const dirtyCount = await getDirtyFlagCount();

    res.json({
      ...status,
      pendingDirtyFlags: dirtyCount,
    });
  } catch (error) {
    logError('stats', error, { action: 'get-scheduler-status' });
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
});

export default router;
