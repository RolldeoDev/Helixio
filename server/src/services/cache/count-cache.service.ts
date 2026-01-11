/**
 * Count Cache Service
 *
 * Caches expensive COUNT(*) queries for pagination metadata.
 * Eliminates redundant count queries when total counts don't change.
 *
 * Features:
 * - Deterministic cache keys from filter criteria (SHA-256 hashing)
 * - 5-minute TTL (matches query result cache)
 * - Automatic L1+L2 caching via unified cache service
 * - Invalidation on series/file create/delete operations
 *
 * Cache key format: count:{type}:{hash}
 * Where:
 *   type = 'series' | 'files'
 *   hash = SHA-256(sorted JSON filters).substring(0, 16)
 */

import crypto from 'crypto';
import { cacheService } from './cache.service.js';
import { CACHE_TTL } from './cache.types.js';
import { createServiceLogger } from '../logger.service.js';

const logger = createServiceLogger('count-cache');

// =============================================================================
// Cache Key Generation
// =============================================================================

/**
 * Build a stable, deterministic cache key for count queries.
 * Sorts object keys before hashing to ensure identical filters
 * produce identical keys regardless of property order.
 *
 * @param type Count type ('series' or 'files')
 * @param filters Filter criteria object
 * @returns Cache key string
 */
export function buildCountCacheKey(
  type: 'series' | 'files',
  filters: Record<string, any>
): string {
  // Sort keys for deterministic hashing
  const sortedFilters = Object.keys(filters)
    .sort()
    .reduce((acc, key) => {
      // Skip undefined values (they don't affect query)
      if (filters[key] !== undefined) {
        acc[key] = filters[key];
      }
      return acc;
    }, {} as Record<string, any>);

  // Hash filters for compact key
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(sortedFilters))
    .digest('hex')
    .substring(0, 16); // Use first 16 chars for compact keys

  return `count:${type}:${hash}`;
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Get a cached count result.
 *
 * @param type Count type ('series' or 'files')
 * @param filters Filter criteria that was used in the COUNT query
 * @returns Cached count or null if not found
 */
export async function getCachedCount(
  type: 'series' | 'files',
  filters: Record<string, any>
): Promise<number | null> {
  const key = buildCountCacheKey(type, filters);
  return await cacheService.get<number>(key);
}

/**
 * Set a count result in cache.
 * Uses 5-minute TTL to match query result cache.
 *
 * @param type Count type ('series' or 'files')
 * @param filters Filter criteria that was used in the COUNT query
 * @param count Count result to cache
 */
export async function setCachedCount(
  type: 'series' | 'files',
  filters: Record<string, any>,
  count: number
): Promise<void> {
  const key = buildCountCacheKey(type, filters);
  const ttl = CACHE_TTL.COUNT_CACHE; // 300s (5 minutes)

  await cacheService.set(key, count, ttl);

  logger.debug(
    { type, count, key },
    'Count cached'
  );
}

/**
 * Invalidate all count caches for a specific type.
 * Use when counts may have changed (series/files added/removed).
 *
 * @param type Count type ('series' or 'files')
 * @param libraryId Optional library ID for more targeted invalidation
 */
export async function invalidateCountCache(
  type: 'series' | 'files',
  libraryId?: string
): Promise<number> {
  // Clear all count caches for this type
  // Note: We can't be more granular because we don't know which
  // filter combinations exist in the cache
  const pattern = `count:${type}:`;
  const count = await cacheService.invalidatePattern(pattern);

  if (count > 0) {
    logger.debug(
      { type, libraryId, count },
      'Count caches invalidated'
    );
  }

  return count;
}

// =============================================================================
// Convenience Wrapper
// =============================================================================

/**
 * Get count from cache, or execute count query and cache result.
 * This is the primary pattern for count caching:
 * 1. Try cache (L1 then L2)
 * 2. If miss, execute COUNT query
 * 3. Cache result
 * 4. Return count
 *
 * @param type Count type ('series' or 'files')
 * @param filters Filter criteria for the COUNT query
 * @param countFn Function to execute the COUNT query if cache miss
 * @returns Count (cached or fresh)
 */
export async function getCachedOrCount(
  type: 'series' | 'files',
  filters: Record<string, any>,
  countFn: () => Promise<number>
): Promise<number> {
  // Try cache first
  const cached = await getCachedCount(type, filters);
  if (cached !== null) {
    logger.debug({ type, count: cached }, 'Count cache HIT');
    return cached;
  }

  logger.debug({ type }, 'Count cache MISS');

  // Cache miss - execute COUNT query
  const count = await countFn();

  // Cache result (fire-and-forget)
  setCachedCount(type, filters, count).catch((err) => {
    logger.debug({ err, type }, 'Failed to cache count result');
  });

  return count;
}
