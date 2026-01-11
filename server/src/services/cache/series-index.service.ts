/**
 * Series Index Service
 *
 * Manages Redis sorted sets for O(log n) series pagination.
 * Provides efficient browse list retrieval for large libraries (50,000+ series).
 *
 * Key features:
 * - Per-library sorted set indices
 * - Multiple sort field support (name, startYear, issueCount)
 * - Lazy index building on first request
 * - Granular invalidation on series changes
 * - Graceful fallback to database when Redis unavailable
 *
 * Index key format: series:index:{libraryId|all}:{sortBy}:{sortOrder}
 */

import { getDatabase } from '../database.service.js';
import { cacheService } from './cache.service.js';
import { redisAdapter } from './redis-adapter.service.js';
import { createServiceLogger } from '../logger.service.js';
import { CacheKeys, CACHE_TTL, CACHE_KEY_PREFIX } from './cache.types.js';
import type { SortedSetMember } from './cache.types.js';
import type { Prisma } from '@prisma/client';

const logger = createServiceLogger('series-index');

// =============================================================================
// Types
// =============================================================================

export interface SeriesIndexOptions {
  libraryId?: string;
  sortBy: 'name' | 'startYear' | 'issueCount' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
}

export interface SeriesPageOptions extends SeriesIndexOptions {
  offset: number;
  limit: number;
}

export interface SeriesPageResult {
  seriesIds: string[];
  totalCount: number;
  fromCache: boolean;
}

// =============================================================================
// Score Calculation
// =============================================================================

/**
 * Convert a string to a numeric score for Redis sorted set ordering.
 * Uses first 8 characters converted to a base-256 number.
 *
 * @param str Input string
 * @returns Numeric score for sorting
 */
function stringToScore(str: string): number {
  if (!str) return 0;

  // Normalize: lowercase, take first 8 chars
  const normalized = str.toLowerCase().substring(0, 8);

  // Convert to base-256 number
  // Example: "batman" -> b(98) * 256^7 + a(97) * 256^6 + ...
  let score = 0;
  for (let i = 0; i < normalized.length; i++) {
    score += normalized.charCodeAt(i) * Math.pow(256, 7 - i);
  }

  return score;
}

/**
 * Calculate sort score for a series based on the sort field.
 */
function calculateScore(
  series: {
    id: string;
    name: string;
    startYear: number | null;
    updatedAt: Date;
    _count?: { issues: number };
  },
  sortBy: string,
  sortOrder: 'asc' | 'desc'
): number {
  let score: number;

  switch (sortBy) {
    case 'name':
      score = stringToScore(series.name);
      break;

    case 'startYear':
      // Use 0 for null years (sorts first in asc, last in desc)
      score = series.startYear ?? 0;
      break;

    case 'updatedAt':
      score = series.updatedAt.getTime();
      break;

    case 'issueCount':
      score = series._count?.issues ?? 0;
      break;

    default:
      score = 0;
  }

  // For descending order, negate the score
  // Redis ZRANGE returns lowest first, so negating gives us highest first
  if (sortOrder === 'desc') {
    score = -score;
  }

  return score;
}

// =============================================================================
// Index Management
// =============================================================================

/**
 * Get the Redis key for a series index.
 */
function getIndexKey(options: SeriesIndexOptions): string {
  return CacheKeys.seriesIndex(options.libraryId, options.sortBy, options.sortOrder);
}

/**
 * Check if an index exists and is warm (not marked dirty).
 */
export async function isIndexWarmed(options: SeriesIndexOptions): Promise<boolean> {
  if (!redisAdapter.isAvailable()) {
    return false;
  }

  const indexKey = getIndexKey(options);
  const dirtyKey = `${indexKey}:dirty`;

  // Check if dirty flag exists
  const isDirty = await cacheService.exists(dirtyKey);
  if (isDirty) {
    return false;
  }

  // Check if index exists and has members
  const count = await cacheService.zCard(indexKey);
  return count > 0;
}

/**
 * Build a series index from the database.
 * This fetches all series IDs matching the criteria and stores them
 * in a Redis sorted set with appropriate scores.
 */
export async function buildSeriesIndex(options: SeriesIndexOptions): Promise<void> {
  const { libraryId, sortBy, sortOrder } = options;
  const indexKey = getIndexKey(options);

  logger.info({ indexKey, libraryId, sortBy, sortOrder }, 'Building series index');

  const db = getDatabase();

  // Build WHERE clause
  const where: Prisma.SeriesWhereInput = {
    deletedAt: null,
    isHidden: false,
  };

  // Filter by library if specified
  if (libraryId) {
    where.issues = {
      some: { libraryId },
    };
  }

  // Fetch series with required fields for scoring
  const series = await db.series.findMany({
    where,
    select: {
      id: true,
      name: true,
      startYear: true,
      updatedAt: true,
      _count: { select: { issues: true } },
    },
  });

  if (series.length === 0) {
    logger.debug({ indexKey }, 'No series found for index');
    return;
  }

  // Build sorted set members with scores
  const members: SortedSetMember[] = series.map((s) => ({
    value: s.id,
    score: calculateScore(s, sortBy, sortOrder),
  }));

  // Store in Redis sorted set
  await cacheService.zAdd(indexKey, members);

  // Set TTL on the index
  await cacheService.expire(indexKey, CACHE_TTL.SERIES_INDEX);

  // Clear dirty flag if it exists
  const dirtyKey = `${indexKey}:dirty`;
  await cacheService.delete(dirtyKey);

  logger.info({ indexKey, count: members.length }, 'Series index built successfully');
}

/**
 * Get a page of series IDs from the index.
 * If the index doesn't exist, builds it first (lazy loading).
 *
 * @returns Series IDs in sorted order, total count, and cache status
 */
export async function getSeriesPage(options: SeriesPageOptions): Promise<SeriesPageResult> {
  const { offset, limit, ...indexOptions } = options;
  const indexKey = getIndexKey(indexOptions);

  // Check if Redis is available
  if (!redisAdapter.isAvailable()) {
    logger.debug({ indexKey }, 'Redis unavailable, returning empty result');
    return { seriesIds: [], totalCount: 0, fromCache: false };
  }

  // Check if index needs rebuilding
  const isWarmed = await isIndexWarmed(indexOptions);

  if (!isWarmed) {
    // Build index on first request (lazy loading)
    await buildSeriesIndex(indexOptions);
  }

  // Get page from sorted set
  const seriesIds = await cacheService.zRange(indexKey, offset, offset + limit - 1);
  const totalCount = await cacheService.zCard(indexKey);

  return {
    seriesIds,
    totalCount,
    fromCache: true,
  };
}

// =============================================================================
// Invalidation
// =============================================================================

/**
 * Mark an index as dirty (needs rebuilding).
 * The index will be rebuilt on next access.
 */
async function markIndexDirty(options: SeriesIndexOptions): Promise<void> {
  const indexKey = getIndexKey(options);
  const dirtyKey = `${indexKey}:dirty`;

  // Set dirty flag with 1-hour TTL (index will be rebuilt on next access)
  await cacheService.set(dirtyKey, true, 3600);

  logger.debug({ indexKey }, 'Series index marked dirty');
}

/**
 * Invalidate all series indices for a library.
 * Called after scan completion or bulk metadata changes.
 *
 * @param libraryId Library ID to invalidate (undefined = all libraries)
 */
export async function invalidateSeriesIndices(libraryId?: string): Promise<void> {
  if (!redisAdapter.isAvailable()) {
    return;
  }

  const sortFields: Array<'name' | 'startYear' | 'issueCount' | 'updatedAt'> = [
    'name',
    'startYear',
    'issueCount',
    'updatedAt',
  ];
  const sortOrders: Array<'asc' | 'desc'> = ['asc', 'desc'];

  // Mark all indices for this library as dirty
  const tasks: Promise<void>[] = [];

  for (const sortBy of sortFields) {
    for (const sortOrder of sortOrders) {
      tasks.push(
        markIndexDirty({
          libraryId,
          sortBy,
          sortOrder,
        })
      );
    }
  }

  // Also invalidate the "all libraries" indices
  if (libraryId) {
    for (const sortBy of sortFields) {
      for (const sortOrder of sortOrders) {
        tasks.push(
          markIndexDirty({
            libraryId: undefined,
            sortBy,
            sortOrder,
          })
        );
      }
    }
  }

  await Promise.allSettled(tasks);

  logger.info({ libraryId: libraryId || 'all' }, 'Series indices invalidated');
}

/**
 * Update a single series in all relevant indices.
 * More efficient than rebuilding entire indices.
 *
 * @param seriesId Series ID to update
 * @param libraryIds Libraries this series belongs to
 */
export async function updateSeriesInIndices(
  seriesId: string,
  libraryIds: string[]
): Promise<void> {
  if (!redisAdapter.isAvailable()) {
    return;
  }

  const db = getDatabase();

  // Fetch series for score calculation
  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      name: true,
      startYear: true,
      updatedAt: true,
      deletedAt: true,
      isHidden: true,
      _count: { select: { issues: true } },
    },
  });

  // If series is deleted or hidden, remove from indices
  if (!series || series.deletedAt || series.isHidden) {
    await removeSeriesFromIndices(seriesId, libraryIds);
    return;
  }

  const sortFields: Array<'name' | 'startYear' | 'issueCount' | 'updatedAt'> = [
    'name',
    'startYear',
    'issueCount',
    'updatedAt',
  ];
  const sortOrders: Array<'asc' | 'desc'> = ['asc', 'desc'];

  const tasks: Promise<void>[] = [];

  // Update in all library-specific indices
  for (const libraryId of libraryIds) {
    for (const sortBy of sortFields) {
      for (const sortOrder of sortOrders) {
        const indexKey = CacheKeys.seriesIndex(libraryId, sortBy, sortOrder);
        const score = calculateScore(series, sortBy, sortOrder);

        tasks.push(
          cacheService.zAdd(indexKey, [{ value: seriesId, score }])
        );
      }
    }
  }

  // Update in "all libraries" indices
  for (const sortBy of sortFields) {
    for (const sortOrder of sortOrders) {
      const indexKey = CacheKeys.seriesIndex(undefined, sortBy, sortOrder);
      const score = calculateScore(series, sortBy, sortOrder);

      tasks.push(
        cacheService.zAdd(indexKey, [{ value: seriesId, score }])
      );
    }
  }

  await Promise.allSettled(tasks);

  logger.debug({ seriesId }, 'Series updated in indices');
}

/**
 * Remove a series from all relevant indices.
 * Called when a series is deleted or hidden.
 *
 * @param seriesId Series ID to remove
 * @param libraryIds Libraries this series belonged to
 */
export async function removeSeriesFromIndices(
  seriesId: string,
  libraryIds: string[]
): Promise<void> {
  if (!redisAdapter.isAvailable()) {
    return;
  }

  const sortFields: Array<'name' | 'startYear' | 'issueCount' | 'updatedAt'> = [
    'name',
    'startYear',
    'issueCount',
    'updatedAt',
  ];
  const sortOrders: Array<'asc' | 'desc'> = ['asc', 'desc'];

  const tasks: Promise<void>[] = [];

  // Remove from all library-specific indices
  for (const libraryId of libraryIds) {
    for (const sortBy of sortFields) {
      for (const sortOrder of sortOrders) {
        const indexKey = CacheKeys.seriesIndex(libraryId, sortBy, sortOrder);
        tasks.push(cacheService.zRemove(indexKey, [seriesId]));
      }
    }
  }

  // Remove from "all libraries" indices
  for (const sortBy of sortFields) {
    for (const sortOrder of sortOrders) {
      const indexKey = CacheKeys.seriesIndex(undefined, sortBy, sortOrder);
      tasks.push(cacheService.zRemove(indexKey, [seriesId]));
    }
  }

  await Promise.allSettled(tasks);

  logger.debug({ seriesId }, 'Series removed from indices');
}

/**
 * Warm all series indices for a library.
 * Called during startup to pre-populate caches.
 *
 * @param libraryId Library ID (undefined = all libraries)
 */
export async function warmSeriesIndices(libraryId?: string): Promise<void> {
  if (!redisAdapter.isAvailable()) {
    logger.debug('Redis unavailable, skipping index warming');
    return;
  }

  const sortFields: Array<'name' | 'startYear' | 'issueCount' | 'updatedAt'> = [
    'name',
    'startYear',
    'issueCount',
    'updatedAt',
  ];
  const sortOrders: Array<'asc' | 'desc'> = ['asc', 'desc'];

  logger.info({ libraryId: libraryId || 'all' }, 'Warming series indices');

  // Build all indices for this library
  for (const sortBy of sortFields) {
    for (const sortOrder of sortOrders) {
      try {
        await buildSeriesIndex({ libraryId, sortBy, sortOrder });
      } catch (error) {
        logger.warn({ error, libraryId, sortBy, sortOrder }, 'Failed to build index');
      }
    }
  }

  logger.info({ libraryId: libraryId || 'all' }, 'Series indices warmed');
}

/**
 * Clear all series indices (for testing or full rebuild).
 */
export async function clearAllSeriesIndices(): Promise<void> {
  if (!redisAdapter.isAvailable()) {
    return;
  }

  await cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SERIES_INDEX}:`);

  logger.info('All series indices cleared');
}
