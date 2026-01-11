/**
 * Memory Cache Service
 *
 * Provides a fast in-memory cache layer for frequently accessed data.
 * Used to reduce database load during heavy operations like library scans.
 *
 * Key features:
 * - TTL-based expiration
 * - Pattern-based invalidation
 * - Statistics tracking
 * - Scan-aware TTL adjustment
 * - LRU (Least Recently Used) eviction with configurable size limit
 */

import { scannerLogger as logger } from './logger.service.js';

// =============================================================================
// Types
// =============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
  sizeBytes: number; // Approximate size of this entry
  lastAccessedAt: number; // For LRU tracking
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  invalidations: number;
  totalBytes: number;
  evictions: number;
}

// =============================================================================
// Memory Cache Class
// =============================================================================

class MemoryCacheService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    invalidations: 0,
    totalBytes: 0,
    evictions: 0,
  };

  /**
   * Maximum cache size in bytes (75MB - following Kavita's memory cache limits)
   */
  private readonly maxSizeBytes = 75 * 1024 * 1024;

  /**
   * Track whether a scan is currently active (affects TTL decisions)
   */
  private scanActive = false;

  /**
   * Default TTL values (in milliseconds)
   */
  static readonly TTL = {
    /** Stats during scan: short TTL since data changes rapidly */
    STATS_DURING_SCAN: 30_000, // 30 seconds
    /** Stats when idle: longer TTL */
    STATS_IDLE: 300_000, // 5 minutes
    /** Continue reading data: short TTL for freshness */
    CONTINUE_READING: 10_000, // 10 seconds
    /** Homepage data: moderate TTL */
    HOMEPAGE: 30_000, // 30 seconds
    /** Library list: moderate TTL */
    LIBRARY_LIST: 60_000, // 1 minute
  };

  /**
   * Estimate size of a value in bytes (rough approximation)
   */
  private estimateSize(data: unknown): number {
    if (data === null || data === undefined) return 0;
    if (typeof data === 'string') return data.length * 2;
    if (typeof data === 'number') return 8;
    if (typeof data === 'boolean') return 4;
    if (Buffer.isBuffer(data)) return data.length;
    if (Array.isArray(data)) {
      return data.reduce((sum, item) => sum + this.estimateSize(item), 0);
    }
    if (typeof data === 'object') {
      return JSON.stringify(data).length * 2;
    }
    return 100; // Default estimate
  }

  /**
   * Evict least recently used entries until size is under limit
   */
  private evictIfNeeded(newEntrySize: number): void {
    while (this.stats.totalBytes + newEntrySize > this.maxSizeBytes && this.cache.size > 0) {
      // Find LRU entry (oldest lastAccessedAt)
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const entry = this.cache.get(oldestKey);
        if (entry) {
          this.stats.totalBytes -= entry.sizeBytes;
          this.stats.evictions++;
        }
        this.cache.delete(oldestKey);
        logger.debug({ key: oldestKey }, 'Memory cache LRU eviction');
      } else {
        break;
      }
    }
    this.stats.size = this.cache.size;
  }

  /**
   * Get a value from the cache
   * Returns null if not found or expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.stats.totalBytes -= entry.sizeBytes;
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      this.stats.misses++;
      return null;
    }

    // Update LRU timestamp on access
    entry.lastAccessedAt = Date.now();
    this.stats.hits++;
    return entry.data as T;
  }

  /**
   * Set a value in the cache with TTL
   * Implements LRU eviction when size limit is exceeded
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    const now = Date.now();
    const sizeBytes = this.estimateSize(data);

    // If key exists, remove old size
    const existing = this.cache.get(key);
    if (existing) {
      this.stats.totalBytes -= existing.sizeBytes;
    }

    // Evict LRU entries if needed
    this.evictIfNeeded(sizeBytes);

    this.cache.set(key, {
      data,
      expiresAt: now + ttlMs,
      createdAt: now,
      sizeBytes,
      lastAccessedAt: now,
    });
    this.stats.totalBytes += sizeBytes;
    this.stats.size = this.cache.size;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.stats.totalBytes -= entry.sizeBytes;
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      return false;
    }
    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    const deleted = this.cache.delete(key);
    if (deleted && entry) {
      this.stats.totalBytes -= entry.sizeBytes;
      this.stats.size = this.cache.size;
      this.stats.invalidations++;
    }
    return deleted;
  }

  /**
   * Invalidate all keys matching a pattern (prefix match)
   */
  invalidate(pattern: string): number {
    let count = 0;
    let freedBytes = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(pattern)) {
        freedBytes += entry.sizeBytes;
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      this.stats.totalBytes -= freedBytes;
      this.stats.size = this.cache.size;
      this.stats.invalidations += count;
      logger.debug({ pattern, count, freedBytes }, 'Memory cache invalidated keys');
    }
    return count;
  }

  /**
   * Clear all cached data
   */
  invalidateAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.size = 0;
    this.stats.totalBytes = 0;
    this.stats.invalidations += size;
    logger.debug({ size }, 'Memory cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: number; maxSizeBytes: number; utilizationPercent: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      maxSizeBytes: this.maxSizeBytes,
      utilizationPercent: Math.round((this.stats.totalBytes / this.maxSizeBytes) * 100),
    };
  }

  /**
   * Reset statistics (useful for monitoring intervals)
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.invalidations = 0;
    this.stats.evictions = 0;
    // Keep size and totalBytes as-is
  }

  /**
   * Clean up expired entries (call periodically)
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    let freedBytes = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        freedBytes += entry.sizeBytes;
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.totalBytes -= freedBytes;
      this.stats.size = this.cache.size;
      logger.debug({ cleaned, freedBytes }, 'Memory cache cleanup');
    }

    return cleaned;
  }

  /**
   * Set scan active state (affects TTL decisions)
   */
  setScanActive(active: boolean): void {
    if (this.scanActive !== active) {
      this.scanActive = active;
      logger.debug({ active }, 'Memory cache scan state changed');

      // Invalidate stats caches when scan state changes
      // so they get refreshed with appropriate TTL
      this.invalidate('library-stats:');
    }
  }

  /**
   * Check if scan is currently active
   */
  isScanActive(): boolean {
    return this.scanActive;
  }

  /**
   * Get appropriate TTL for stats based on scan state
   */
  getStatsTTL(): number {
    return this.scanActive
      ? MemoryCacheService.TTL.STATS_DURING_SCAN
      : MemoryCacheService.TTL.STATS_IDLE;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const memoryCache = new MemoryCacheService();

// Interval ID for cleanup - needed for graceful shutdown
let cleanupIntervalId: NodeJS.Timeout | null = null;

// Start periodic cleanup (every 5 minutes)
cleanupIntervalId = setInterval(() => {
  memoryCache.cleanup();
}, 300_000);

/**
 * Stop the memory cache cleanup interval.
 * Should be called during graceful shutdown to prevent process hanging.
 */
export function stopMemoryCacheCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

// =============================================================================
// Cache Key Helpers
// =============================================================================

export const CacheKeys = {
  /** All library stats aggregated */
  LIBRARY_STATS_ALL: 'library-stats:all',

  /** Per-library stats */
  libraryStats: (libraryId: string) => `library-stats:${libraryId}`,

  /** Continue reading data (per-user) */
  continueReading: (userId: string) => `continue-reading:${userId}`,

  /** Library reading stats (per-user, per-library) */
  libraryReadingStats: (userId: string, libraryId: string) =>
    `library-reading-stats:${userId}:${libraryId}`,

  /** All libraries list */
  LIBRARIES_LIST: 'libraries:list',
};

export default memoryCache;
