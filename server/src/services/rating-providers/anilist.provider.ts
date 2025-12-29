/**
 * AniList Rating Provider
 *
 * Fetches community ratings from AniList for manga series.
 * Uses the public AniList GraphQL API (no authentication required).
 *
 * AniList provides:
 * - averageScore: Community average rating (0-100 scale)
 * - favourites: Number of users who favorited
 *
 * Note: AniList does not provide:
 * - Critic ratings (only community)
 * - Issue/chapter-level ratings
 */

import {
  type RatingProvider,
  type RatingData,
  type RatingSearchQuery,
  type RatingMatchResult,
  normalizeRating,
} from './types.js';
import { register } from './registry.js';
import {
  searchManga,
  getMangaById,
  checkApiAvailability,
  getPreferredTitle,
  getAllTitles,
  fuzzyDateToYear,
  type AniListManga,
} from '../anilist.service.js';
import { createServiceLogger } from '../logger.service.js';

const logger = createServiceLogger('anilist-rating-provider');

// =============================================================================
// Rating Cache
// =============================================================================

/**
 * Cache rating data from search/match to avoid second API call.
 * When searchSeries() finds a match, it caches the rating data.
 * When getSeriesRatings() is called, it uses the cached data first.
 *
 * Cache entries expire after 5 minutes (they'll be re-fetched during sync).
 */
interface CachedRating {
  averageScore: number | null;
  favourites: number | null;
  cachedAt: number;
}

const ratingCache = new Map<string, CachedRating>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached rating data if available and not expired
 */
function getCachedRating(sourceId: string): CachedRating | null {
  const cached = ratingCache.get(sourceId);
  if (!cached) return null;

  if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
    ratingCache.delete(sourceId);
    return null;
  }

  return cached;
}

/**
 * Cache rating data from a manga result
 */
function cacheRating(manga: AniListManga): void {
  ratingCache.set(String(manga.id), {
    averageScore: manga.averageScore,
    favourites: manga.favourites,
    cachedAt: Date.now(),
  });
}

/**
 * Clear expired entries from cache (for memory management)
 */
export function clearExpiredCache(): void {
  const now = Date.now();
  for (const [key, value] of ratingCache) {
    if (now - value.cachedAt > CACHE_TTL_MS) {
      ratingCache.delete(key);
    }
  }
}

/**
 * Clear all cache entries (for testing)
 */
export function clearCache(): void {
  ratingCache.clear();
}

// =============================================================================
// Title Matching
// =============================================================================

/**
 * Normalize a title for comparison
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '') // Remove non-alphanumeric (Unicode-aware)
    .trim();
}

/**
 * Calculate match confidence between query and manga result
 */
function calculateMatchConfidence(
  query: RatingSearchQuery,
  manga: AniListManga
): { confidence: number; matchMethod: RatingMatchResult['matchMethod'] } {
  const queryNormalized = normalizeTitle(query.seriesName);
  const allTitles = getAllTitles(manga);
  const preferredTitle = getPreferredTitle(manga);
  const mangaYear = fuzzyDateToYear(manga.startDate);

  // Check for exact title match (any variant)
  const hasExactMatch = allTitles.some(
    (t) => normalizeTitle(t) === queryNormalized
  );

  // Check year match
  const yearMatches = query.year && mangaYear && query.year === mangaYear;

  if (hasExactMatch && yearMatches) {
    return { confidence: 0.95, matchMethod: 'name_year' };
  }

  if (hasExactMatch) {
    return { confidence: 0.9, matchMethod: 'name_year' };
  }

  // Check substring match (title contains query or vice versa)
  const hasSubstringMatch = allTitles.some((t) => {
    const normalized = normalizeTitle(t);
    return (
      normalized.includes(queryNormalized) ||
      queryNormalized.includes(normalized)
    );
  });

  if (hasSubstringMatch && yearMatches) {
    return { confidence: 0.85, matchMethod: 'fuzzy' };
  }

  if (hasSubstringMatch) {
    return { confidence: 0.75, matchMethod: 'fuzzy' };
  }

  // Fuzzy match (AniList search relevance)
  // AniList already returns results sorted by search match relevance
  if (yearMatches) {
    return { confidence: 0.7, matchMethod: 'search' };
  }

  return { confidence: 0.6, matchMethod: 'search' };
}

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * AniList Rating Provider
 *
 * Implements the RatingProvider interface to fetch community ratings
 * from the AniList manga database.
 */
export const AniListRatingProvider: RatingProvider = {
  name: 'anilist',
  displayName: 'AniList',
  supportsIssueRatings: false,
  ratingTypes: ['community'],

  /**
   * Check if AniList API is available
   * AniList's public API doesn't require credentials
   */
  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    try {
      const result = await checkApiAvailability();
      return {
        available: result.available,
        error: result.error,
      };
    } catch (err) {
      return {
        available: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },

  /**
   * Search for a manga series on AniList
   *
   * If existingId is provided (from series.anilistId), does a direct lookup.
   * Otherwise, searches by name and finds the best match.
   */
  async searchSeries(
    query: RatingSearchQuery
  ): Promise<RatingMatchResult | null> {
    try {
      // Direct lookup if we have an existing ID
      if (query.existingId) {
        const id = parseInt(query.existingId, 10);
        if (!isNaN(id)) {
          logger.debug({ id }, 'Looking up AniList manga by ID');

          const manga = await getMangaById(id);
          if (manga) {
            // Cache the rating data for later
            cacheRating(manga);

            return {
              sourceId: String(manga.id),
              confidence: 1.0,
              matchMethod: 'id',
              matchedName: getPreferredTitle(manga),
              matchedYear: fuzzyDateToYear(manga.startDate),
            };
          }

          logger.debug({ id }, 'AniList ID not found, falling back to search');
        }
      }

      // Search by name
      logger.debug({ query: query.seriesName }, 'Searching AniList for manga');

      const searchResult = await searchManga(query.seriesName, { limit: 10 });

      if (!searchResult.results.length) {
        logger.debug(
          { query: query.seriesName },
          'No AniList results for query'
        );
        return null;
      }

      // Find best match among results
      let bestMatch: AniListManga | null = null;
      let bestConfidence = 0;
      let bestMatchMethod: RatingMatchResult['matchMethod'] = 'search';

      for (const manga of searchResult.results) {
        const { confidence, matchMethod } = calculateMatchConfidence(
          query,
          manga
        );

        if (confidence > bestConfidence) {
          bestMatch = manga;
          bestConfidence = confidence;
          bestMatchMethod = matchMethod;
        }
      }

      // Require minimum confidence
      const settings = await import('../config.service.js').then((m) =>
        m.getExternalRatingsSettings()
      );
      const minConfidence = settings?.minMatchConfidence ?? 0.6;

      if (!bestMatch || bestConfidence < minConfidence) {
        logger.debug(
          {
            query: query.seriesName,
            bestConfidence,
            minConfidence,
          },
          'No AniList match met minimum confidence'
        );
        return null;
      }

      // Cache the rating data for later
      cacheRating(bestMatch);

      logger.debug(
        {
          query: query.seriesName,
          matchedName: getPreferredTitle(bestMatch),
          confidence: bestConfidence,
        },
        'Found AniList match'
      );

      return {
        sourceId: String(bestMatch.id),
        confidence: bestConfidence,
        matchMethod: bestMatchMethod,
        matchedName: getPreferredTitle(bestMatch),
        matchedYear: fuzzyDateToYear(bestMatch.startDate),
      };
    } catch (err) {
      logger.error(
        { err, query: query.seriesName },
        'Error searching AniList for manga'
      );
      throw err;
    }
  },

  /**
   * Get ratings for a manga by its AniList ID
   *
   * First checks the cache (populated during searchSeries).
   * Falls back to API call if not cached.
   */
  async getSeriesRatings(sourceId: string): Promise<RatingData[]> {
    try {
      // Check cache first (populated during searchSeries)
      let averageScore: number | null = null;
      let favourites: number | null = null;

      const cached = getCachedRating(sourceId);
      if (cached) {
        logger.debug({ sourceId }, 'Using cached AniList rating data');
        averageScore = cached.averageScore;
        favourites = cached.favourites;
      } else {
        // Cache miss - fetch from API
        logger.debug({ sourceId }, 'Fetching AniList rating data from API');

        const id = parseInt(sourceId, 10);
        if (isNaN(id)) {
          logger.warn({ sourceId }, 'Invalid AniList source ID');
          return [];
        }

        const manga = await getMangaById(id);
        if (!manga) {
          logger.debug({ sourceId }, 'AniList manga not found');
          return [];
        }

        averageScore = manga.averageScore;
        favourites = manga.favourites;

        // Cache for future calls
        cacheRating(manga);
      }

      // No rating available
      if (averageScore === null) {
        logger.debug({ sourceId }, 'AniList manga has no average score');
        return [];
      }

      // Build rating data
      // AniList uses 0-100 scale (percentage)
      const ratingData: RatingData = {
        source: 'anilist',
        sourceId,
        ratingType: 'community',
        value: normalizeRating(averageScore, 100), // Normalize to 0-10
        originalValue: averageScore,
        scale: 100,
        voteCount: favourites ?? undefined,
      };

      return [ratingData];
    } catch (err) {
      logger.error({ err, sourceId }, 'Error fetching AniList ratings');
      throw err;
    }
  },
};

// Register the provider
register(AniListRatingProvider);

export default AniListRatingProvider;
