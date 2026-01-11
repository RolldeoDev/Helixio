/**
 * Cache Module
 *
 * Provides a multi-layer caching system with:
 * - L1: In-memory cache (fast, volatile)
 * - L2: Redis cache (persistent, shared)
 *
 * Exports:
 * - cacheService: Unified cache interface (recommended for most use cases)
 * - redisAdapter: Direct Redis access (for advanced operations)
 * - seriesIndex: Series pagination indices
 * - continueReadingCache: Continue reading cache
 * - cacheInvalidation: Centralized invalidation
 */

// =============================================================================
// Core Services
// =============================================================================

export { cacheService, default as cache } from './cache.service.js';
export { redisAdapter, initializeRedis, closeRedis } from './redis-adapter.service.js';

// =============================================================================
// Specialized Cache Services
// =============================================================================

export {
  getSeriesPage,
  buildSeriesIndex,
  isIndexWarmed,
  invalidateSeriesIndices,
  updateSeriesInIndices,
  removeSeriesFromIndices,
  warmSeriesIndices,
  clearAllSeriesIndices,
  type SeriesIndexOptions,
  type SeriesPageOptions,
  type SeriesPageResult,
} from './series-index.service.js';

export {
  getContinueReading,
  setContinueReading,
  invalidateContinueReading,
  invalidateContinueReadingForLibrary,
  invalidateContinueReadingForSeries,
  clearAllContinueReading,
  type ContinueReadingItem,
  type ContinueReadingCacheKey,
} from './continue-reading-cache.service.js';

export {
  getCoverFromCache,
  storeCoverInCache,
  invalidateCover,
  invalidateCoversByType,
  invalidateAllCovers,
  getCoverCacheStats,
  resetCoverCacheStats,
  isCoverCacheAvailable,
} from './cover-cache.service.js';

// =============================================================================
// Invalidation
// =============================================================================

export {
  invalidateSeries,
  invalidateSeriesDeleted,
  invalidateSeriesMerge,
  invalidateLibrary,
  invalidateAllLibraries,
  invalidateUser,
  invalidateReadingProgress,
  invalidateFileCompleted,
  invalidateAfterScan,
  invalidateSeriesBulk,
  invalidateAll,
} from './cache-invalidation.service.js';

// =============================================================================
// Types
// =============================================================================

export type {
  CacheLayer,
  CacheLayerStats,
  AggregatedCacheStats,
  CacheHealth,
  CacheGetOptions,
  CacheSetOptions,
  SortedSetMember,
  RedisConfig,
  CoverType,
  CoverFormat,
  CoverMetadata,
  CachedCoverData,
} from './cache.types.js';

export { CacheKeys, CACHE_TTL, CACHE_KEY_PREFIX, DEFAULT_REDIS_CONFIG } from './cache.types.js';
