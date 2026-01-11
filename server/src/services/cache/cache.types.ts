/**
 * Cache Types
 *
 * Shared interfaces for the multi-layer caching system.
 * Defines contracts for cache adapters, unified cache service,
 * and cache-related configuration.
 */

// =============================================================================
// Core Cache Layer Interface
// =============================================================================

/**
 * Interface that all cache backends must implement.
 * Enables swappable cache implementations (Redis, Memcached, etc.)
 */
export interface CacheLayer {
  /** Unique identifier for this cache layer */
  readonly name: string;

  // Core key-value operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<boolean>;

  // Pattern-based operations
  invalidatePattern(pattern: string): Promise<number>;

  // Sorted set operations (for pagination indices)
  zAdd(key: string, members: SortedSetMember[]): Promise<void>;
  zRange(key: string, start: number, stop: number): Promise<string[]>;
  zRangeWithScores(key: string, start: number, stop: number): Promise<SortedSetMember[]>;
  zCard(key: string): Promise<number>;
  zRemove(key: string, members: string[]): Promise<void>;

  // Health and stats
  isAvailable(): boolean;
  getStats(): CacheLayerStats;
}

// =============================================================================
// Sorted Set Types
// =============================================================================

/**
 * Member of a Redis sorted set with score for ordering.
 */
export interface SortedSetMember {
  value: string;
  score: number;
}

// =============================================================================
// Cache Statistics
// =============================================================================

/**
 * Statistics for a single cache layer.
 */
export interface CacheLayerStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

/**
 * Aggregated statistics across all cache layers.
 */
export interface AggregatedCacheStats {
  l1: CacheLayerStats & {
    size: number;
    maxSizeBytes: number;
    utilizationPercent: number;
  };
  l2: CacheLayerStats & {
    connected: boolean;
    memoryUsedBytes?: number;
    memoryMaxBytes?: number;
  };
  combined: {
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  };
}

// =============================================================================
// Cache Health
// =============================================================================

/**
 * Health status of the caching system.
 */
export interface CacheHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  l1Available: boolean;
  l2Available: boolean;
  message?: string;
}

// =============================================================================
// Cache Options
// =============================================================================

/**
 * Options for cache get operations.
 */
export interface CacheGetOptions {
  /** Skip L1 (memory) cache, go straight to L2 (Redis) */
  skipL1?: boolean;
  /** Skip L2 (Redis) cache, only check L1 (memory) */
  skipL2?: boolean;
  /** When L2 hit, also store in L1 for faster subsequent access (default: true) */
  backfillL1?: boolean;
}

/**
 * Options for cache set operations.
 */
export interface CacheSetOptions {
  /** Only store in L1 (memory cache) */
  l1Only?: boolean;
  /** Only store in L2 (Redis) */
  l2Only?: boolean;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Redis connection configuration.
 */
export interface RedisConfig {
  /** Redis host (default: 127.0.0.1) */
  host: string;
  /** Redis port (default: 6379) */
  port: number;
  /** Redis password (optional) */
  password?: string;
  /** Redis database number (default: 0) */
  db: number;
  /** Maximum reconnection attempts (default: 10) */
  maxRetries: number;
  /** Delay between reconnection attempts in ms (default: 1000) */
  retryDelayMs: number;
  /** Connection timeout in ms (default: 5000) */
  connectTimeoutMs: number;
  /** Command timeout in ms (default: 2000) */
  commandTimeoutMs: number;
}

/**
 * Default Redis configuration.
 */
export const DEFAULT_REDIS_CONFIG: RedisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetries: 10,
  retryDelayMs: 1000,
  connectTimeoutMs: 5000,
  commandTimeoutMs: 2000,
};

// =============================================================================
// Cache TTL Configuration
// =============================================================================

/**
 * TTL values for different cache types (in seconds).
 */
export const CACHE_TTL = {
  /** Series browse index - O(log n) pagination */
  SERIES_INDEX: 600, // 10 minutes

  /** Series browse page results */
  SERIES_BROWSE_PAGE: 300, // 5 minutes

  /** Continue reading data per user */
  CONTINUE_READING: 120, // 2 minutes

  /** Continue reading during scan (shorter for freshness) */
  CONTINUE_READING_SCAN: 30, // 30 seconds

  /** Aggregated library stats */
  STATS_AGGREGATED: 300, // 5 minutes

  /** Stats during scan (data changes rapidly) */
  STATS_SCAN: 30, // 30 seconds

  /** User recommendations */
  RECOMMENDATIONS: 900, // 15 minutes

  /** Similar series */
  SIMILAR_SERIES: 3600, // 1 hour

  /** Cover metadata - paths, existence, blur placeholders */
  COVER_METADATA: 86400, // 24 hours - covers rarely change

  /** Cover binary data - actual image data */
  COVER_BINARY: 86400, // 24 hours - immutable content

  /** Query result cache - series/file list queries */
  QUERY_RESULT: 300, // 5 minutes

  /** Query result cache during scan (shorter for freshness) */
  QUERY_RESULT_SCAN: 30, // 30 seconds

  /** Count cache - pagination total counts */
  COUNT_CACHE: 300, // 5 minutes

  /** Series metadata cache - full series details with includes */
  SERIES_METADATA: 600, // 10 minutes

  /** Issue metadata cache - full issue details */
  ISSUE_METADATA: 600, // 10 minutes
} as const;

// =============================================================================
// Cache Key Patterns
// =============================================================================

/**
 * Cache key prefixes for different data types.
 * Used for pattern-based invalidation.
 */
export const CACHE_KEY_PREFIX = {
  /** Series browse index sorted sets */
  SERIES_INDEX: 'series:index',

  /** Cached series browse results */
  SERIES_BROWSE: 'series:browse',

  /** Series detail data */
  SERIES_DATA: 'series:data',

  /** Continue reading per user */
  CONTINUE_READING: 'continue:reading',

  /** Library stats */
  STATS: 'stats',

  /** User recommendations */
  RECOMMENDATIONS: 'recommendations',

  /** Similar series */
  SIMILAR_SERIES: 'similar',

  /** Cover metadata (paths, blur placeholders) */
  COVER_META: 'cover:meta',

  /** Cover binary data (WebP/JPEG image bytes) */
  COVER_DATA: 'cover:data',

  /** User collections */
  COLLECTION: 'collection',

  /** Collection mosaic covers */
  COLLECTION_MOSAIC: 'collection:mosaic',

  /** Query result cache (series/file lists) */
  QUERY_RESULT: 'query:result',

  /** Count cache (pagination counts) */
  COUNT: 'count',

  /** Series metadata (full details with includes) */
  SERIES_METADATA: 'metadata:series',

  /** Issue/file metadata (full details) */
  ISSUE_METADATA: 'metadata:issue',
} as const;

/**
 * Generate cache keys for various data types.
 */
export const CacheKeys = {
  /**
   * Series index sorted set key.
   * Format: series:index:{libraryId|all}:{sortBy}:{sortOrder}
   */
  seriesIndex: (
    libraryId: string | undefined,
    sortBy: string,
    sortOrder: string
  ): string => {
    const lib = libraryId || 'all';
    return `${CACHE_KEY_PREFIX.SERIES_INDEX}:${lib}:${sortBy}:${sortOrder}`;
  },

  /**
   * Series browse page result key.
   * Format: series:browse:{optionsHash}
   */
  seriesBrowse: (optionsHash: string): string => {
    return `${CACHE_KEY_PREFIX.SERIES_BROWSE}:${optionsHash}`;
  },

  /**
   * Series data key.
   * Format: series:data:{seriesId}
   */
  seriesData: (seriesId: string): string => {
    return `${CACHE_KEY_PREFIX.SERIES_DATA}:${seriesId}`;
  },

  /**
   * Continue reading cache key.
   * Format: continue:reading:{userId}:{libraryId|all}
   */
  continueReading: (userId: string, libraryId?: string): string => {
    const lib = libraryId || 'all';
    return `${CACHE_KEY_PREFIX.CONTINUE_READING}:${userId}:${lib}`;
  },

  /**
   * Library stats cache key.
   * Format: stats:aggregated:{libraryId|all}
   */
  statsAggregated: (libraryId?: string): string => {
    const lib = libraryId || 'all';
    return `${CACHE_KEY_PREFIX.STATS}:aggregated:${lib}`;
  },

  /**
   * Recommendations cache key.
   * Format: recommendations:{userId}:{libraryId|all}
   */
  recommendations: (userId: string, libraryId?: string): string => {
    const lib = libraryId || 'all';
    return `${CACHE_KEY_PREFIX.RECOMMENDATIONS}:${userId}:${lib}`;
  },

  /**
   * Similar series cache key.
   * Format: similar:{seriesId}:{userId|anon}
   */
  similarSeries: (seriesId: string, userId?: string): string => {
    const user = userId || 'anon';
    return `${CACHE_KEY_PREFIX.SIMILAR_SERIES}:${seriesId}:${user}`;
  },

  /**
   * Cover metadata cache key.
   * Format: cover:meta:{type}:{hash}
   * Types: archive, series, collection
   */
  coverMeta: (type: 'archive' | 'series' | 'collection', hash: string): string => {
    return `${CACHE_KEY_PREFIX.COVER_META}:${type}:${hash}`;
  },

  /**
   * Cover binary data cache key.
   * Format: cover:data:{type}:{hash}:{format}
   * Types: archive, series, collection
   * Formats: webp, jpeg
   */
  coverData: (
    type: 'archive' | 'series' | 'collection',
    hash: string,
    format: 'webp' | 'jpeg'
  ): string => {
    return `${CACHE_KEY_PREFIX.COVER_DATA}:${type}:${hash}:${format}`;
  },

  /**
   * Collection detail cache key.
   * Format: collection:{collectionId}
   */
  collection: (collectionId: string): string => {
    return `${CACHE_KEY_PREFIX.COLLECTION}:${collectionId}`;
  },

  /**
   * Collection mosaic cover cache key.
   * Format: collection:mosaic:{collectionId}
   */
  collectionMosaic: (collectionId: string): string => {
    return `${CACHE_KEY_PREFIX.COLLECTION_MOSAIC}:${collectionId}`;
  },
};

// =============================================================================
// Cover Cache Types
// =============================================================================

/**
 * Cover type for cache operations.
 */
export type CoverType = 'archive' | 'series' | 'collection';

/**
 * Cover format for cache operations.
 */
export type CoverFormat = 'webp' | 'jpeg';

/**
 * Metadata stored for a cached cover.
 */
export interface CoverMetadata {
  /** Content type (image/webp or image/jpeg) */
  contentType: string;
  /** Base64 blur placeholder for instant perceived load */
  blurPlaceholder?: string;
  /** Timestamp when cached */
  cachedAt: number;
}

/**
 * Complete cover data including binary.
 */
export interface CachedCoverData {
  /** Binary image data (base64 encoded for Redis storage) */
  data: string;
  /** Content type (image/webp or image/jpeg) */
  contentType: string;
  /** Base64 blur placeholder */
  blurPlaceholder?: string;
}
