/**
 * Continue Reading Cache Service
 *
 * Caches "continue reading" query results in Redis for persistence
 * across server restarts and reduced database load.
 *
 * Key features:
 * - Per-user, per-library caching
 * - 2-minute TTL (increased from 10 seconds in memory cache)
 * - Precise invalidation on reading progress changes
 * - Graceful degradation when Redis unavailable
 */

import { cacheService } from './cache.service.js';
import { memoryCache } from '../memory-cache.service.js';
import { createServiceLogger } from '../logger.service.js';
import { CacheKeys, CACHE_TTL, CACHE_KEY_PREFIX } from './cache.types.js';

const logger = createServiceLogger('continue-reading-cache');

// =============================================================================
// Types
// =============================================================================

/**
 * A single item in the continue reading list.
 * This matches the structure from reading-progress.service.ts.
 */
export interface ContinueReadingItem {
  id: string;
  type: 'in-progress' | 'next-up';
  fileId: string;
  filename: string;
  libraryId: string;
  seriesId: string | null;
  seriesName: string | null;
  issueNumber: string | null;
  coverHash: string | null;
  currentPage: number;
  totalPages: number;
  percentComplete: number;
  lastReadAt: Date;
  // For next-up items
  previousIssueNumber?: string | null;
}

export interface ContinueReadingCacheKey {
  userId: string;
  libraryId?: string;
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Get continue reading items from cache.
 *
 * @param key User and optional library identifier
 * @returns Cached items or null if not found/expired
 */
export async function getContinueReading(
  key: ContinueReadingCacheKey
): Promise<ContinueReadingItem[] | null> {
  const cacheKey = CacheKeys.continueReading(key.userId, key.libraryId);

  // Try to get from unified cache (L1 first, then L2)
  const cached = await cacheService.get<ContinueReadingItem[]>(cacheKey);

  if (cached) {
    logger.debug(
      { userId: key.userId, libraryId: key.libraryId },
      'Continue reading cache HIT'
    );
    return cached;
  }

  logger.debug(
    { userId: key.userId, libraryId: key.libraryId },
    'Continue reading cache MISS'
  );
  return null;
}

/**
 * Store continue reading items in cache.
 *
 * @param key User and optional library identifier
 * @param items Continue reading items to cache
 */
export async function setContinueReading(
  key: ContinueReadingCacheKey,
  items: ContinueReadingItem[]
): Promise<void> {
  const cacheKey = CacheKeys.continueReading(key.userId, key.libraryId);

  // Determine TTL based on scan state
  const isScanActive = memoryCache.isScanActive();
  const ttl = isScanActive ? CACHE_TTL.CONTINUE_READING_SCAN : CACHE_TTL.CONTINUE_READING;

  await cacheService.set(cacheKey, items, ttl);

  // Track reverse mapping: series -> users (for surgical invalidation)
  // This allows us to only invalidate users who actually have this series
  const seriesIds = new Set(
    items.map((item) => item.seriesId).filter((id): id is string => id !== null)
  );

  const trackingPromises = Array.from(seriesIds).map(async (seriesId) => {
    const trackingKey = `${CACHE_KEY_PREFIX.CONTINUE_READING}:tracking:series:${seriesId}`;

    // Get existing users for this series
    const existing = await cacheService.get<string[]>(trackingKey);
    const users = new Set(existing || []);
    users.add(key.userId);

    // Store with same TTL as continue reading cache
    await cacheService.set(trackingKey, Array.from(users), ttl);
  });

  await Promise.allSettled(trackingPromises);

  logger.debug(
    { userId: key.userId, libraryId: key.libraryId, count: items.length, ttl, trackedSeries: seriesIds.size },
    'Continue reading cached with reverse tracking'
  );
}

/**
 * Invalidate continue reading cache for a user.
 * Called when reading progress changes.
 *
 * @param userId User whose cache should be invalidated
 * @param libraryId Optional specific library to invalidate (undefined = all)
 */
export async function invalidateContinueReading(
  userId: string,
  libraryId?: string
): Promise<void> {
  if (libraryId) {
    // Invalidate specific library and "all" cache
    const specificKey = CacheKeys.continueReading(userId, libraryId);
    const allKey = CacheKeys.continueReading(userId, undefined);

    await Promise.allSettled([
      cacheService.delete(specificKey),
      cacheService.delete(allKey),
    ]);

    logger.debug({ userId, libraryId }, 'Continue reading invalidated (specific + all)');
  } else {
    // Invalidate all caches for this user (pattern-based)
    const pattern = `${CACHE_KEY_PREFIX.CONTINUE_READING}:${userId}:`;
    await cacheService.invalidatePattern(pattern);

    logger.debug({ userId }, 'Continue reading invalidated (all libraries)');
  }
}

/**
 * Invalidate continue reading cache for all users in a library.
 * Called after scan completion or bulk operations.
 *
 * @param libraryId Library whose caches should be invalidated
 */
export async function invalidateContinueReadingForLibrary(
  libraryId: string
): Promise<void> {
  // Pattern: continue:reading:*:libraryId
  // Since we can't easily do this pattern, we'll invalidate all continue reading caches
  // This is a trade-off for simplicity - rebuild is cheap (2 min TTL anyway)
  const pattern = `${CACHE_KEY_PREFIX.CONTINUE_READING}:`;
  await cacheService.invalidatePattern(pattern);

  logger.debug({ libraryId }, 'Continue reading invalidated for library (all users)');
}

/**
 * Invalidate continue reading for a specific series (SURGICAL).
 * Only invalidates users who actually have this series in their continue reading.
 * Called when series metadata changes that might affect ordering.
 *
 * @param seriesId Series that changed
 */
export async function invalidateContinueReadingForSeries(
  seriesId: string
): Promise<void> {
  const trackingKey = `${CACHE_KEY_PREFIX.CONTINUE_READING}:tracking:series:${seriesId}`;

  // Get list of users who have this series in continue reading
  const affectedUsers = await cacheService.get<string[]>(trackingKey);

  if (affectedUsers && affectedUsers.length > 0) {
    // Surgical invalidation: only clear caches for affected users
    const invalidationPromises = affectedUsers.map((userId) =>
      invalidateContinueReading(userId) // Clears all libraries for this user
    );

    await Promise.allSettled(invalidationPromises);

    logger.debug(
      { seriesId, affectedUsers: affectedUsers.length },
      'Continue reading invalidated surgically (affected users only)'
    );

    // Clean up tracking key
    await cacheService.delete(trackingKey);
  } else {
    // No tracking data found - fall back to broad invalidation
    // This can happen if tracking key expired or was never set
    const pattern = `${CACHE_KEY_PREFIX.CONTINUE_READING}:`;
    await cacheService.invalidatePattern(pattern);

    logger.debug({ seriesId }, 'Continue reading invalidated broadly (no tracking data)');
  }
}

/**
 * Clear all continue reading caches.
 * Used for testing or maintenance.
 */
export async function clearAllContinueReading(): Promise<void> {
  const pattern = `${CACHE_KEY_PREFIX.CONTINUE_READING}:`;
  await cacheService.invalidatePattern(pattern);

  logger.info('All continue reading caches cleared');
}
