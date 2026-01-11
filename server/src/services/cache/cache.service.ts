/**
 * Unified Cache Service
 *
 * Coordinates L1 (memory cache) and L2 (Redis) for transparent
 * multi-layer caching. Implements cache-aside pattern with automatic
 * backfill and graceful degradation.
 *
 * Data flow:
 * - GET: L1 -> L2 -> (caller fetches from DB and populates)
 * - SET: Write to both L1 and L2 (fire-and-forget for L2)
 * - INVALIDATE: Clear from both L1 and L2
 *
 * Key features:
 * - Transparent layer coordination
 * - Automatic L1 backfill on L2 hits
 * - Graceful degradation when L2 unavailable
 * - Statistics aggregation across layers
 * - getOrCompute() helper for common cache-aside pattern
 */

import { memoryCache, CacheKeys as MemoryCacheKeys } from '../memory-cache.service.js';
import { redisAdapter } from './redis-adapter.service.js';
import { createServiceLogger } from '../logger.service.js';
import type {
  CacheLayer,
  CacheLayerStats,
  CacheGetOptions,
  CacheSetOptions,
  AggregatedCacheStats,
  CacheHealth,
  SortedSetMember,
} from './cache.types.js';

const logger = createServiceLogger('cache-service');

// =============================================================================
// Unified Cache Service Class
// =============================================================================

class UnifiedCacheService {
  private l1Cache = memoryCache;
  private l2Cache = redisAdapter;

  // Additional stats for unified operations
  private unifiedStats = {
    l1Hits: 0,
    l2Hits: 0,
    totalMisses: 0,
  };

  // =============================================================================
  // Core Operations
  // =============================================================================

  /**
   * Get a value from the cache layers.
   * Checks L1 first, then L2 (with optional L1 backfill on L2 hit).
   */
  async get<T>(key: string, options: CacheGetOptions = {}): Promise<T | null> {
    const { skipL1 = false, skipL2 = false, backfillL1 = true } = options;

    // Try L1 (memory cache) first - fast path
    if (!skipL1) {
      const l1Result = this.l1Cache.get<T>(key);
      if (l1Result !== null) {
        this.unifiedStats.l1Hits++;
        return l1Result;
      }
    }

    // Try L2 (Redis) if available
    if (!skipL2 && this.l2Cache.isAvailable()) {
      const l2Result = await this.l2Cache.get<T>(key);
      if (l2Result !== null) {
        this.unifiedStats.l2Hits++;

        // Backfill L1 for faster subsequent access
        if (backfillL1 && !skipL1) {
          // Use a default TTL for backfill (5 minutes in ms)
          this.l1Cache.set(key, l2Result, 300_000);
        }

        return l2Result;
      }
    }

    this.unifiedStats.totalMisses++;
    return null;
  }

  /**
   * Set a value in the cache layers.
   * Writes to L1 synchronously and L2 asynchronously (fire-and-forget).
   *
   * @param key Cache key
   * @param value Value to cache
   * @param ttlSeconds TTL in seconds (applies to both layers)
   * @param options Optional layer selection
   */
  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number,
    options: CacheSetOptions = {}
  ): Promise<void> {
    const { l1Only = false, l2Only = false } = options;

    // Write to L1 (synchronous) - convert seconds to milliseconds
    if (!l2Only) {
      this.l1Cache.set(key, value, ttlSeconds * 1000);
    }

    // Write to L2 (async, fire-and-forget)
    if (!l1Only && this.l2Cache.isAvailable()) {
      this.l2Cache.set(key, value, ttlSeconds).catch((err) => {
        logger.debug({ err, key }, 'L2 cache set failed (non-critical)');
      });
    }
  }

  /**
   * Delete a key from all cache layers.
   */
  async delete(key: string): Promise<boolean> {
    const l1Deleted = this.l1Cache.delete(key);
    let l2Deleted = false;

    if (this.l2Cache.isAvailable()) {
      l2Deleted = await this.l2Cache.delete(key);
    }

    return l1Deleted || l2Deleted;
  }

  /**
   * Check if a key exists in any cache layer.
   */
  async exists(key: string): Promise<boolean> {
    // Check L1 first
    if (this.l1Cache.has(key)) {
      return true;
    }

    // Check L2
    if (this.l2Cache.isAvailable()) {
      return await this.l2Cache.exists(key);
    }

    return false;
  }

  /**
   * Invalidate all keys matching a pattern across all layers.
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;

    // Invalidate in L1
    count += this.l1Cache.invalidate(pattern);

    // Invalidate in L2
    if (this.l2Cache.isAvailable()) {
      count += await this.l2Cache.invalidatePattern(pattern);
    }

    if (count > 0) {
      logger.debug({ pattern, count }, 'Cache pattern invalidation complete');
    }

    return count;
  }

  /**
   * Clear all caches.
   */
  async invalidateAll(): Promise<void> {
    this.l1Cache.invalidateAll();

    if (this.l2Cache.isAvailable()) {
      // Use FLUSHDB to clear all keys (only affects current database)
      await this.l2Cache.invalidatePattern('*');
    }

    logger.info('All caches cleared');
  }

  // =============================================================================
  // Compound Operations
  // =============================================================================

  /**
   * Get a value from cache, or compute and cache it if not found.
   * This is the primary pattern for cache-aside with automatic population.
   *
   * @param key Cache key
   * @param compute Function to compute the value if cache miss
   * @param ttlSeconds TTL for cached value
   * @param options Cache get/set options
   */
  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    ttlSeconds: number,
    options: CacheGetOptions = {}
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - compute value
    const computed = await compute();

    // Store in cache (async, don't wait)
    this.set(key, computed, ttlSeconds).catch((err) => {
      logger.debug({ err, key }, 'Failed to cache computed value');
    });

    return computed;
  }

  // =============================================================================
  // Sorted Set Operations (L2 only)
  // =============================================================================

  /**
   * Add members to a sorted set (L2 only).
   * Sorted sets are only stored in Redis, not memory cache.
   */
  async zAdd(key: string, members: SortedSetMember[]): Promise<void> {
    if (!this.l2Cache.isAvailable()) {
      logger.debug({ key }, 'zAdd skipped - L2 cache unavailable');
      return;
    }

    await this.l2Cache.zAdd(key, members);
  }

  /**
   * Get a range of members from a sorted set (L2 only).
   */
  async zRange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.l2Cache.isAvailable()) {
      return [];
    }

    return this.l2Cache.zRange(key, start, stop);
  }

  /**
   * Get a range of members with scores from a sorted set (L2 only).
   */
  async zRangeWithScores(
    key: string,
    start: number,
    stop: number
  ): Promise<SortedSetMember[]> {
    if (!this.l2Cache.isAvailable()) {
      return [];
    }

    return this.l2Cache.zRangeWithScores(key, start, stop);
  }

  /**
   * Get the cardinality (count) of a sorted set (L2 only).
   */
  async zCard(key: string): Promise<number> {
    if (!this.l2Cache.isAvailable()) {
      return 0;
    }

    return this.l2Cache.zCard(key);
  }

  /**
   * Remove members from a sorted set (L2 only).
   */
  async zRemove(key: string, members: string[]): Promise<void> {
    if (!this.l2Cache.isAvailable()) {
      return;
    }

    await this.l2Cache.zRemove(key, members);
  }

  /**
   * Set TTL on a sorted set (L2 only).
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.l2Cache.isAvailable()) {
      return false;
    }

    return this.l2Cache.expire(key, ttlSeconds);
  }

  /**
   * Check if a sorted set exists (L2 only).
   */
  async zExists(key: string): Promise<boolean> {
    if (!this.l2Cache.isAvailable()) {
      return false;
    }

    return this.l2Cache.exists(key);
  }

  // =============================================================================
  // Health and Statistics
  // =============================================================================

  /**
   * Get cache health status.
   */
  getHealth(): CacheHealth {
    const l1Available = true; // Memory cache is always available
    const l2Available = this.l2Cache.isAvailable();

    if (l1Available && l2Available) {
      return {
        status: 'healthy',
        l1Available,
        l2Available,
      };
    }

    if (l1Available && !l2Available) {
      return {
        status: 'degraded',
        l1Available,
        l2Available,
        message: 'Redis unavailable - using memory cache only',
      };
    }

    return {
      status: 'unhealthy',
      l1Available,
      l2Available,
      message: 'Cache system unavailable',
    };
  }

  /**
   * Get aggregated statistics from all cache layers.
   */
  async getStats(): Promise<AggregatedCacheStats> {
    const l1Stats = this.l1Cache.getStats();
    const l2Stats = this.l2Cache.getStats();
    const memoryInfo = await this.l2Cache.getMemoryInfo();

    const totalHits = this.unifiedStats.l1Hits + this.unifiedStats.l2Hits;
    const totalMisses = this.unifiedStats.totalMisses;
    const hitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

    return {
      l1: {
        hits: l1Stats.hits,
        misses: l1Stats.misses,
        sets: 0, // Memory cache doesn't track sets
        deletes: l1Stats.invalidations,
        errors: 0,
        size: l1Stats.size,
        maxSizeBytes: l1Stats.maxSizeBytes,
        utilizationPercent: l1Stats.utilizationPercent,
      },
      l2: {
        hits: l2Stats.hits,
        misses: l2Stats.misses,
        sets: l2Stats.sets,
        deletes: l2Stats.deletes,
        errors: l2Stats.errors,
        connected: this.l2Cache.isAvailable(),
        memoryUsedBytes: memoryInfo?.usedBytes,
        memoryMaxBytes: memoryInfo?.maxBytes,
      },
      combined: {
        hitRate,
        totalHits,
        totalMisses,
      },
    };
  }

  /**
   * Check if L2 (Redis) is available.
   */
  isL2Available(): boolean {
    return this.l2Cache.isAvailable();
  }

  /**
   * Reset unified statistics.
   */
  resetStats(): void {
    this.unifiedStats = {
      l1Hits: 0,
      l2Hits: 0,
      totalMisses: 0,
    };
    this.l1Cache.resetStats();
    this.l2Cache.resetStats();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const cacheService = new UnifiedCacheService();

export default cacheService;
