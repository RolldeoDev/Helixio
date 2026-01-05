/**
 * Stats Routes
 *
 * API endpoints for accessing pre-computed stats.
 */

import { Router } from 'express';
import { cachePresets } from '../middleware/cache.middleware.js';
import { optionalAuth, requireAdmin } from '../middleware/auth.middleware.js';
import {
  getAggregatedStats,
  getEntityStats,
  getEntityStat,
  getEntityDetails,
  getTopEntitiesSummary,
  getExtendedStats,
  getEnhancedLibraryOverview,
  getSeriesByYear,
  getFileFormatDistribution,
  getPublicationStatusDistribution,
  getDayOfWeekActivity,
  getMostActiveUsers,
  getPopularLibraries,
  getPopularSeries,
  getRecentlyRead,
  getTopReadersByMediaType,
  type StatsTimeframe,
} from '../services/stats-query.service.js';
import {
  triggerDirtyStatsProcessing,
  triggerFullRebuild,
  getSchedulerStatus,
} from '../services/stats-scheduler.service.js';
import { getDirtyFlagCount } from '../services/stats-dirty.service.js';
import type { EntityType } from '../services/stats-dirty.service.js';
import { logError, logInfo } from '../services/logger.service.js';
import { LRUCache } from '../services/lru-cache.service.js';

// LRU cache for expensive stats aggregations (15 minute TTL)
const statsCache = new LRUCache<unknown>({
  maxSize: 100,
  defaultTTL: 15 * 60 * 1000, // 15 minutes
});

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
router.get('/summary', cachePresets.shortTerm, async (req, res): Promise<void> => {
  try {
    const { libraryId } = req.query;
    const userId = req.user?.id;

    // Check LRU cache first (keyed by library and user for personalization)
    const cacheKey = `stats-summary:${libraryId || 'all'}:${userId || 'anon'}`;
    const cached = statsCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const [
      stats,
      topEntities,
      extendedStats,
      libraryOverview,
      fileFormats,
      publicationStatus,
      dayOfWeekActivity,
    ] = await Promise.all([
      getAggregatedStats(libraryId as string | undefined),
      getTopEntitiesSummary(libraryId as string | undefined),
      getExtendedStats(libraryId as string | undefined, userId),
      getEnhancedLibraryOverview(libraryId as string | undefined),
      getFileFormatDistribution(libraryId as string | undefined),
      getPublicationStatusDistribution(libraryId as string | undefined),
      getDayOfWeekActivity(userId, 'all_time'),
    ]);

    const result = {
      ...stats,
      ...topEntities,
      ...extendedStats,
      libraryOverview,
      fileFormats,
      publicationStatus,
      dayOfWeekActivity,
    };

    // Cache the result
    statsCache.set(cacheKey, result);

    res.json(result);
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
      sortBy: (sortBy as 'owned' | 'read' | 'time' | 'ownedPages' | 'readPages') || 'owned',
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

// =============================================================================
// Enhanced Stats (Public)
// =============================================================================

/**
 * GET /api/stats/library-overview
 * Get enhanced library overview stats
 */
router.get('/library-overview', cachePresets.shortTerm, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const overview = await getEnhancedLibraryOverview(libraryId as string | undefined);
    res.json(overview);
  } catch (error) {
    logError('stats', error, { action: 'get-library-overview' });
    res.status(500).json({ error: 'Failed to get library overview' });
  }
});

/**
 * GET /api/stats/release-years
 * Get series count by publication year
 */
router.get('/release-years', cachePresets.shortTerm, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const yearData = await getSeriesByYear(libraryId as string | undefined);
    res.json(yearData);
  } catch (error) {
    logError('stats', error, { action: 'get-release-years' });
    res.status(500).json({ error: 'Failed to get release years' });
  }
});

/**
 * GET /api/stats/file-formats
 * Get file format distribution by extension
 */
router.get('/file-formats', cachePresets.shortTerm, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const formatData = await getFileFormatDistribution(libraryId as string | undefined);
    res.json(formatData);
  } catch (error) {
    logError('stats', error, { action: 'get-file-formats' });
    res.status(500).json({ error: 'Failed to get file formats' });
  }
});

/**
 * GET /api/stats/publication-status
 * Get publication status distribution (ongoing vs ended)
 */
router.get('/publication-status', cachePresets.shortTerm, async (req, res) => {
  try {
    const { libraryId } = req.query;
    const statusData = await getPublicationStatusDistribution(libraryId as string | undefined);
    res.json(statusData);
  } catch (error) {
    logError('stats', error, { action: 'get-publication-status' });
    res.status(500).json({ error: 'Failed to get publication status' });
  }
});

/**
 * GET /api/stats/day-of-week
 * Get reading activity by day of week
 */
router.get('/day-of-week', optionalAuth, cachePresets.shortTerm, async (req, res) => {
  try {
    const { userId, timeframe } = req.query;

    // Non-admin users can only view their own stats
    const requestingUserId = req.user?.id;
    const targetUserId = userId as string | undefined;

    if (targetUserId && targetUserId !== requestingUserId && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Cannot view other users\' stats' });
      return;
    }

    const effectiveUserId = targetUserId || requestingUserId;
    const validTimeframes: StatsTimeframe[] = ['this_week', 'this_month', 'this_year', 'all_time'];
    const effectiveTimeframe = validTimeframes.includes(timeframe as StatsTimeframe)
      ? (timeframe as StatsTimeframe)
      : 'this_month';

    const activityData = await getDayOfWeekActivity(effectiveUserId, effectiveTimeframe);
    res.json(activityData);
  } catch (error) {
    logError('stats', error, { action: 'get-day-of-week-activity' });
    res.status(500).json({ error: 'Failed to get day of week activity' });
  }
});

// =============================================================================
// Admin-Only Stats
// =============================================================================

/**
 * Helper to parse and validate timeframe parameter
 */
function parseTimeframe(timeframe: unknown): StatsTimeframe {
  const validTimeframes: StatsTimeframe[] = ['this_week', 'this_month', 'this_year', 'all_time'];
  return validTimeframes.includes(timeframe as StatsTimeframe)
    ? (timeframe as StatsTimeframe)
    : 'this_month';
}

/**
 * GET /api/stats/admin/active-users
 * Get most active users (admin-only)
 */
router.get('/admin/active-users', requireAdmin, cachePresets.shortTerm, async (req, res) => {
  try {
    const { timeframe, limit } = req.query;
    const effectiveTimeframe = parseTimeframe(timeframe);
    const effectiveLimit = limit ? Math.min(parseInt(limit as string, 10), 50) : 10;

    const users = await getMostActiveUsers(effectiveTimeframe, effectiveLimit);
    res.json(users);
  } catch (error) {
    logError('stats', error, { action: 'get-active-users' });
    res.status(500).json({ error: 'Failed to get active users' });
  }
});

/**
 * GET /api/stats/admin/popular-libraries
 * Get popular libraries by read count (admin-only)
 */
router.get('/admin/popular-libraries', requireAdmin, cachePresets.shortTerm, async (req, res) => {
  try {
    const { timeframe, limit } = req.query;
    const effectiveTimeframe = parseTimeframe(timeframe);
    const effectiveLimit = limit ? Math.min(parseInt(limit as string, 10), 50) : 10;

    const libraries = await getPopularLibraries(effectiveTimeframe, effectiveLimit);
    res.json(libraries);
  } catch (error) {
    logError('stats', error, { action: 'get-popular-libraries' });
    res.status(500).json({ error: 'Failed to get popular libraries' });
  }
});

/**
 * GET /api/stats/admin/popular-series
 * Get popular series with cover images (admin-only)
 */
router.get('/admin/popular-series', requireAdmin, cachePresets.shortTerm, async (req, res) => {
  try {
    const { timeframe, limit } = req.query;
    const effectiveTimeframe = parseTimeframe(timeframe);
    const effectiveLimit = limit ? Math.min(parseInt(limit as string, 10), 50) : 10;

    const series = await getPopularSeries(effectiveTimeframe, effectiveLimit);
    res.json(series);
  } catch (error) {
    logError('stats', error, { action: 'get-popular-series' });
    res.status(500).json({ error: 'Failed to get popular series' });
  }
});

/**
 * GET /api/stats/admin/recently-read
 * Get recently read series with covers (admin-only)
 */
router.get('/admin/recently-read', requireAdmin, cachePresets.shortTerm, async (req, res) => {
  try {
    const { timeframe, limit } = req.query;
    const effectiveTimeframe = parseTimeframe(timeframe);
    const effectiveLimit = limit ? Math.min(parseInt(limit as string, 10), 50) : 10;

    const recentlyRead = await getRecentlyRead(effectiveTimeframe, effectiveLimit);
    res.json(recentlyRead);
  } catch (error) {
    logError('stats', error, { action: 'get-recently-read' });
    res.status(500).json({ error: 'Failed to get recently read' });
  }
});

/**
 * GET /api/stats/admin/media-type-readers
 * Get top readers with media type breakdown (admin-only)
 */
router.get('/admin/media-type-readers', requireAdmin, cachePresets.shortTerm, async (req, res) => {
  try {
    const { timeframe, limit } = req.query;
    const effectiveTimeframe = parseTimeframe(timeframe);
    const effectiveLimit = limit ? Math.min(parseInt(limit as string, 10), 50) : 10;

    const readers = await getTopReadersByMediaType(effectiveTimeframe, effectiveLimit);
    res.json(readers);
  } catch (error) {
    logError('stats', error, { action: 'get-media-type-readers' });
    res.status(500).json({ error: 'Failed to get media type readers' });
  }
});

export default router;
