/**
 * LRU Cache Service
 *
 * Provides a generic Least Recently Used (LRU) cache with:
 * - Configurable maximum entries
 * - Optional TTL (time-to-live) per entry
 * - Automatic eviction of least recently used entries when capacity is exceeded
 * - Statistics tracking for monitoring cache effectiveness
 */

// =============================================================================
// Types
// =============================================================================

export interface LRUCacheOptions<T = unknown> {
  /** Maximum number of entries (default: 100) */
  maxSize?: number;
  /** Default TTL in milliseconds (optional, no expiry if not set) */
  defaultTTL?: number;
  /** Callback when an entry is evicted */
  onEvict?: (key: string, value: T) => void;
}

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt?: number;
  accessCount: number;
  lastAccessed: number;
}

export interface LRUCacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

// =============================================================================
// LRU Cache Class
// =============================================================================

/**
 * Generic LRU Cache implementation
 * Uses a Map to maintain insertion order for O(1) operations
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private defaultTTL?: number;
  private onEvict?: (key: string, value: T) => void;

  // Statistics
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: LRUCacheOptions<T> = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize ?? 100;
    this.defaultTTL = options.defaultTTL;
    this.onEvict = options.onEvict;
  }

  /**
   * Get a value from the cache
   * Returns undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.cache.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache
   * Optionally override the default TTL for this entry
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Delete existing entry if present (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const now = Date.now();
    const ttl = ttlMs ?? this.defaultTTL;

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: ttl ? now + ttl : undefined,
      accessCount: 0,
      lastAccessed: now,
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete an entry from the cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry && this.onEvict) {
      this.onEvict(key, entry.value);
    }
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    if (this.onEvict) {
      for (const [key, entry] of this.cache) {
        this.onEvict(key, entry.value);
      }
    }
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache (most recent last)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values in the cache (most recent last)
   */
  values(): T[] {
    return Array.from(this.cache.values())
      .filter((entry) => !entry.expiresAt || Date.now() <= entry.expiresAt)
      .map((entry) => entry.value);
  }

  /**
   * Get all entries as [key, value] pairs
   */
  entries(): [string, T][] {
    const result: [string, T][] = [];
    for (const [key, entry] of this.cache) {
      if (!entry.expiresAt || Date.now() <= entry.expiresAt) {
        result.push([key, entry.value]);
      }
    }
    return result;
  }

  /**
   * Iterate over cache entries
   */
  forEach(callback: (value: T, key: string) => void): void {
    for (const [key, entry] of this.cache) {
      if (!entry.expiresAt || Date.now() <= entry.expiresAt) {
        callback(entry.value, key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): LRUCacheStats {
    const totalAccesses = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: totalAccesses > 0 ? this.hits / totalAccesses : 0,
    };
  }

  /**
   * Clean up expired entries without waiting for access
   * Returns number of entries removed
   */
  prune(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Update the maximum size of the cache
   * Evicts oldest entries if new size is smaller
   */
  setMaxSize(newMaxSize: number): void {
    this.maxSize = newMaxSize;
    while (this.cache.size > this.maxSize) {
      this.evictOldest();
    }
  }

  /**
   * Get entry metadata without updating access time
   */
  peek(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      return undefined;
    }

    return entry;
  }

  /**
   * Evict the oldest (least recently used) entry
   */
  private evictOldest(): void {
    // Map maintains insertion order, first key is oldest
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      const entry = this.cache.get(firstKey);
      if (entry && this.onEvict) {
        this.onEvict(firstKey, entry.value);
      }
      this.cache.delete(firstKey);
      this.evictions++;
    }
  }
}

// =============================================================================
// Pre-configured Cache Instances
// =============================================================================

/**
 * Create an LRU cache for approval sessions (24h TTL, max 50 entries)
 */
export function createSessionCache<T>(options?: Partial<LRUCacheOptions<T>>): LRUCache<T> {
  return new LRUCache<T>({
    maxSize: 50,
    defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
    ...options,
  });
}

/**
 * Create an LRU cache for API responses (1h TTL, max 200 entries)
 */
export function createAPIResponseCache<T>(options?: Partial<LRUCacheOptions<T>>): LRUCache<T> {
  return new LRUCache<T>({
    maxSize: 200,
    defaultTTL: 60 * 60 * 1000, // 1 hour
    ...options,
  });
}

/**
 * Create an LRU cache for metadata lookups (30m TTL, max 500 entries)
 */
export function createMetadataCache<T>(options?: Partial<LRUCacheOptions<T>>): LRUCache<T> {
  return new LRUCache<T>({
    maxSize: 500,
    defaultTTL: 30 * 60 * 1000, // 30 minutes
    ...options,
  });
}

// =============================================================================
// Export
// =============================================================================

export default LRUCache;
