/**
 * Cover Cache Service
 *
 * Provides Redis L2 caching for cover images to achieve lightning-fast
 * cover serving. Caches both metadata and binary image data.
 *
 * Key features:
 * - All cover types: archive, series, collection
 * - Binary data caching (base64 encoded for Redis)
 * - Graceful degradation when Redis unavailable
 * - Automatic backfill to memory cache on Redis hit
 *
 * Cache key patterns:
 * - Metadata: cover:meta:{type}:{hash}
 * - Binary:   cover:data:{type}:{hash}:{format}
 */

import { redisAdapter } from './redis-adapter.service.js';
import { createServiceLogger } from '../logger.service.js';
import {
  CacheKeys,
  CACHE_TTL,
  CACHE_KEY_PREFIX,
  type CoverType,
  type CoverFormat,
  type CoverMetadata,
  type CachedCoverData,
} from './cache.types.js';

const logger = createServiceLogger('cover-cache');

// =============================================================================
// Statistics Tracking
// =============================================================================

interface CoverCacheStats {
  hits: number;
  misses: number;
  sets: number;
  errors: number;
}

const stats: CoverCacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  errors: 0,
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Get cover data from Redis cache.
 *
 * @param type Cover type (archive, series, collection)
 * @param hash Cover hash/identifier
 * @param format Preferred format (webp or jpeg)
 * @returns Cover data with Buffer, content type, and blur placeholder, or null if not cached
 */
export async function getCoverFromCache(
  type: CoverType,
  hash: string,
  format: CoverFormat
): Promise<{ data: Buffer; contentType: string; blurPlaceholder?: string } | null> {
  if (!redisAdapter.isAvailable()) {
    return null;
  }

  const dataKey = CacheKeys.coverData(type, hash, format);

  try {
    const cached = await redisAdapter.get<CachedCoverData>(dataKey);

    if (!cached) {
      stats.misses++;
      logger.debug({ type, hash, format }, 'Cover cache MISS');
      return null;
    }

    stats.hits++;
    logger.debug({ type, hash, format }, 'Cover cache HIT');

    // Decode base64 data back to Buffer
    const data = Buffer.from(cached.data, 'base64');

    return {
      data,
      contentType: cached.contentType,
      blurPlaceholder: cached.blurPlaceholder,
    };
  } catch (error) {
    stats.errors++;
    logger.debug({ error, type, hash, format }, 'Cover cache get error');
    return null;
  }
}

/**
 * Store cover data in Redis cache.
 * Uses base64 encoding for binary data to work with Redis JSON storage.
 *
 * @param type Cover type (archive, series, collection)
 * @param hash Cover hash/identifier
 * @param data Binary image data
 * @param contentType MIME type (image/webp or image/jpeg)
 * @param blurPlaceholder Optional base64 blur placeholder
 */
export async function storeCoverInCache(
  type: CoverType,
  hash: string,
  data: Buffer,
  contentType: string,
  blurPlaceholder?: string
): Promise<void> {
  if (!redisAdapter.isAvailable()) {
    return;
  }

  const format: CoverFormat = contentType === 'image/webp' ? 'webp' : 'jpeg';
  const dataKey = CacheKeys.coverData(type, hash, format);

  // Encode binary data as base64 for JSON storage
  const cachedData: CachedCoverData = {
    data: data.toString('base64'),
    contentType,
    blurPlaceholder,
  };

  // Fire-and-forget write to Redis with proper stats tracking
  redisAdapter
    .set(dataKey, cachedData, CACHE_TTL.COVER_BINARY)
    .then(() => {
      stats.sets++;
      logger.debug({ type, hash, format, size: data.length }, 'Cover cached');
    })
    .catch((error) => {
      stats.errors++;
      logger.debug({ error, type, hash, format }, 'Cover cache set error');
    });
}

/**
 * Invalidate a specific cover from cache.
 * Removes both WebP and JPEG formats.
 *
 * @param type Cover type (archive, series, collection)
 * @param hash Cover hash/identifier
 */
export async function invalidateCover(
  type: CoverType,
  hash: string
): Promise<void> {
  if (!redisAdapter.isAvailable()) {
    return;
  }

  const webpKey = CacheKeys.coverData(type, hash, 'webp');
  const jpegKey = CacheKeys.coverData(type, hash, 'jpeg');
  const metaKey = CacheKeys.coverMeta(type, hash);

  try {
    await Promise.allSettled([
      redisAdapter.delete(webpKey),
      redisAdapter.delete(jpegKey),
      redisAdapter.delete(metaKey),
    ]);

    logger.debug({ type, hash }, 'Cover invalidated');
  } catch (error) {
    logger.debug({ error, type, hash }, 'Cover invalidation error');
  }
}

/**
 * Invalidate all covers of a specific type.
 * Used for bulk operations like library cleanup.
 *
 * @param type Cover type to invalidate (archive, series, collection)
 * @returns Number of keys deleted
 */
export async function invalidateCoversByType(type: CoverType): Promise<number> {
  if (!redisAdapter.isAvailable()) {
    return 0;
  }

  try {
    const dataPattern = `${CACHE_KEY_PREFIX.COVER_DATA}:${type}:`;
    const metaPattern = `${CACHE_KEY_PREFIX.COVER_META}:${type}:`;

    const [dataCount, metaCount] = await Promise.all([
      redisAdapter.invalidatePattern(dataPattern),
      redisAdapter.invalidatePattern(metaPattern),
    ]);

    const total = dataCount + metaCount;
    logger.info({ type, count: total }, 'Covers invalidated by type');
    return total;
  } catch (error) {
    logger.debug({ error, type }, 'Cover bulk invalidation error');
    return 0;
  }
}

/**
 * Invalidate all covers (all types).
 * Used for cache reset or maintenance.
 *
 * @returns Number of keys deleted
 */
export async function invalidateAllCovers(): Promise<number> {
  if (!redisAdapter.isAvailable()) {
    return 0;
  }

  try {
    const [dataCount, metaCount] = await Promise.all([
      redisAdapter.invalidatePattern(`${CACHE_KEY_PREFIX.COVER_DATA}:`),
      redisAdapter.invalidatePattern(`${CACHE_KEY_PREFIX.COVER_META}:`),
    ]);

    const total = dataCount + metaCount;
    logger.info({ count: total }, 'All covers invalidated');
    return total;
  } catch (error) {
    logger.debug({ error }, 'Cover full invalidation error');
    return 0;
  }
}

/**
 * Get cover cache statistics.
 */
export function getCoverCacheStats(): CoverCacheStats & { hitRate: number } {
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? (stats.hits / total) * 100 : 0;

  return {
    ...stats,
    hitRate: Math.round(hitRate * 100) / 100,
  };
}

/**
 * Reset cover cache statistics.
 * Used for monitoring windows.
 */
export function resetCoverCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.sets = 0;
  stats.errors = 0;
}

/**
 * Check if cover cache is available (Redis connected).
 */
export function isCoverCacheAvailable(): boolean {
  return redisAdapter.isAvailable();
}
