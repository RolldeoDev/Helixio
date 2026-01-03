/**
 * Recommendation Cache Service
 *
 * Provides caching for recommendations to improve performance.
 * Uses an in-memory LRU-style cache with TTL-based expiration.
 *
 * Cache invalidation occurs on:
 * - User reads a new comic/series
 * - User submits recommendation feedback
 * - User rates a series
 */

import type { SeriesRecommendation } from './recommendation-engine.service.js';

// =============================================================================
// Types
// =============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface SimilarSeriesEntry {
  series: {
    id: string;
    name: string;
    publisher: string | null;
    startYear: number | null;
    coverHash: string | null;
    coverUrl: string | null;
    genres: string | null;
    issueCount: number;
    firstIssueId: string | null;
    firstIssueCoverHash: string | null;
  };
  similarityScore: number;
  matchReasons: Array<{ type: string; score: number }>;
  matchType: 'similarity' | 'genre_fallback';
}

// =============================================================================
// Configuration
// =============================================================================

/** TTL for personalized recommendations (15 minutes) */
const RECOMMENDATION_TTL_MS = 15 * 60 * 1000;

/** TTL for per-series similar (1 hour - rarely changes) */
const SIMILAR_SERIES_TTL_MS = 60 * 60 * 1000;

/** Maximum entries in recommendation cache */
const RECOMMENDATION_CACHE_MAX_SIZE = 500;

/** Maximum entries in similar series cache */
const SIMILAR_SERIES_CACHE_MAX_SIZE = 1000;

// =============================================================================
// Cache Storage
// =============================================================================

const recommendationCache = new Map<string, CacheEntry<SeriesRecommendation[]>>();
const similarSeriesCache = new Map<string, CacheEntry<SimilarSeriesEntry[]>>();

// =============================================================================
// Cache Keys
// =============================================================================

/**
 * Generate cache key for personalized recommendations.
 */
function getRecommendationKey(userId: string, libraryId?: string): string {
  return `rec:${userId}:${libraryId || 'all'}`;
}

/**
 * Generate cache key for similar series.
 */
function getSimilarSeriesKey(seriesId: string, userId?: string): string {
  return `sim:${seriesId}:${userId || 'anon'}`;
}

// =============================================================================
// Recommendation Cache
// =============================================================================

/**
 * Get cached recommendations for a user.
 *
 * @param userId - The user ID
 * @param libraryId - Optional library filter
 * @returns Cached recommendations or null if not found/expired
 */
export function getCachedRecommendations(
  userId: string,
  libraryId?: string
): SeriesRecommendation[] | null {
  const key = getRecommendationKey(userId, libraryId);
  const entry = recommendationCache.get(key);

  if (!entry) return null;

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    recommendationCache.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Cache recommendations for a user.
 *
 * @param userId - The user ID
 * @param libraryId - Optional library filter
 * @param recommendations - The recommendations to cache
 */
export function setCachedRecommendations(
  userId: string,
  libraryId: string | undefined,
  recommendations: SeriesRecommendation[]
): void {
  const key = getRecommendationKey(userId, libraryId);

  // Enforce max size (simple FIFO eviction)
  if (recommendationCache.size >= RECOMMENDATION_CACHE_MAX_SIZE) {
    const firstKey = recommendationCache.keys().next().value;
    if (firstKey) recommendationCache.delete(firstKey);
  }

  recommendationCache.set(key, {
    value: recommendations,
    expiresAt: Date.now() + RECOMMENDATION_TTL_MS,
  });
}

/**
 * Invalidate cached recommendations for a user.
 * Called when reading progress, ratings, or feedback changes.
 *
 * @param userId - The user ID
 */
export function invalidateUserRecommendations(userId: string): void {
  // Remove all cache entries for this user
  const keysToDelete: string[] = [];

  for (const key of recommendationCache.keys()) {
    if (key.startsWith(`rec:${userId}:`)) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    recommendationCache.delete(key);
  }
}

// =============================================================================
// Similar Series Cache
// =============================================================================

/**
 * Get cached similar series for a series.
 *
 * @param seriesId - The series ID
 * @param userId - Optional user ID for filtering
 * @returns Cached similar series or null if not found/expired
 */
export function getCachedSimilarSeries(
  seriesId: string,
  userId?: string
): SimilarSeriesEntry[] | null {
  const key = getSimilarSeriesKey(seriesId, userId);
  const entry = similarSeriesCache.get(key);

  if (!entry) return null;

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    similarSeriesCache.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Cache similar series for a series.
 *
 * @param seriesId - The series ID
 * @param userId - Optional user ID for filtering
 * @param similar - The similar series to cache
 */
export function setCachedSimilarSeries(
  seriesId: string,
  userId: string | undefined,
  similar: SimilarSeriesEntry[]
): void {
  const key = getSimilarSeriesKey(seriesId, userId);

  // Enforce max size
  if (similarSeriesCache.size >= SIMILAR_SERIES_CACHE_MAX_SIZE) {
    const firstKey = similarSeriesCache.keys().next().value;
    if (firstKey) similarSeriesCache.delete(firstKey);
  }

  similarSeriesCache.set(key, {
    value: similar,
    expiresAt: Date.now() + SIMILAR_SERIES_TTL_MS,
  });
}

/**
 * Invalidate cached similar series for a specific series.
 * Called when similarity scores are recomputed.
 *
 * @param seriesId - The series ID
 */
export function invalidateSimilarSeries(seriesId: string): void {
  const keysToDelete: string[] = [];

  for (const key of similarSeriesCache.keys()) {
    if (key.startsWith(`sim:${seriesId}:`)) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    similarSeriesCache.delete(key);
  }
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Clear all recommendation caches.
 * Called when similarity scores are fully rebuilt.
 */
export function clearAllCaches(): void {
  recommendationCache.clear();
  similarSeriesCache.clear();
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): {
  recommendationCacheSize: number;
  similarSeriesCacheSize: number;
  recommendationCacheMaxSize: number;
  similarSeriesCacheMaxSize: number;
} {
  return {
    recommendationCacheSize: recommendationCache.size,
    similarSeriesCacheSize: similarSeriesCache.size,
    recommendationCacheMaxSize: RECOMMENDATION_CACHE_MAX_SIZE,
    similarSeriesCacheMaxSize: SIMILAR_SERIES_CACHE_MAX_SIZE,
  };
}

/**
 * Clean up expired entries from caches.
 * Can be called periodically to prevent memory bloat.
 */
export function cleanupExpiredEntries(): {
  recommendationsRemoved: number;
  similarSeriesRemoved: number;
} {
  const now = Date.now();
  let recommendationsRemoved = 0;
  let similarSeriesRemoved = 0;

  // Clean recommendation cache
  for (const [key, entry] of recommendationCache.entries()) {
    if (now > entry.expiresAt) {
      recommendationCache.delete(key);
      recommendationsRemoved++;
    }
  }

  // Clean similar series cache
  for (const [key, entry] of similarSeriesCache.entries()) {
    if (now > entry.expiresAt) {
      similarSeriesCache.delete(key);
      similarSeriesRemoved++;
    }
  }

  return { recommendationsRemoved, similarSeriesRemoved };
}
