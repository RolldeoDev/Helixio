/**
 * MyAnimeList Review Provider
 *
 * Fetches user reviews from MyAnimeList via the Jikan API (unofficial MAL API).
 * Jikan is a REST API that provides access to MAL data without authentication.
 *
 * API Documentation: https://docs.api.jikan.moe/
 *
 * IMPORTANT: Jikan has strict rate limits:
 * - 60 requests per minute
 * - 3 requests per second
 *
 * We use a fixed 500ms delay (2 req/sec) to stay well under limits.
 */

import { ReviewProviderRegistry } from './registry.js';
import type {
  ReviewProvider,
  ReviewData,
  ReviewSearchQuery,
  ReviewMatchResult,
  ReviewFetchOptions,
} from './types.js';
import {
  normalizeRating,
  generateSummary,
} from './types.js';
import { createServiceLogger } from '../logger.service.js';

const logger = createServiceLogger('mal-review-provider');

// =============================================================================
// Constants
// =============================================================================

const JIKAN_API = 'https://api.jikan.moe/v4';
const USER_AGENT = 'Helixio/0.1.0 (Comic Book Management Tool)';

// Fixed conservative rate limit for Jikan (NOT configurable)
// 500ms = 2 requests/second (more conservative than Jikan's 3 req/sec limit)
const JIKAN_MIN_DELAY_MS = 500;

// =============================================================================
// Types
// =============================================================================

interface JikanReview {
  mal_id: number;
  url: string;
  type: string;
  reactions: {
    overall: number;
    nice: number;
    love_it: number;
    funny: number;
    confusing: number;
    informative: number;
    well_written: number;
    creative: number;
  };
  date: string;
  review: string;
  score: number; // 1-10
  tags: string[];
  is_spoiler: boolean;
  is_preliminary: boolean;
  user: {
    username: string;
    url: string;
    images?: {
      jpg?: {
        image_url?: string;
      };
      webp?: {
        image_url?: string;
      };
    };
  };
}

interface JikanReviewsResponse {
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
  };
  data: JikanReview[];
}

interface JikanSearchResult {
  mal_id: number;
  url: string;
  images: {
    jpg: {
      image_url: string;
    };
  };
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  titles: Array<{ type: string; title: string }>;
  type: string;
  chapters: number | null;
  volumes: number | null;
  status: string;
  publishing: boolean;
  published: {
    from: string | null;
    to: string | null;
    prop: {
      from: { year: number | null };
      to: { year: number | null };
    };
  };
  score: number | null;
  scored_by: number | null;
}

interface JikanSearchResponse {
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    items: {
      count: number;
      total: number;
      per_page: number;
    };
  };
  data: JikanSearchResult[];
}

// =============================================================================
// Rate Limiting
// =============================================================================

let lastRequestTime = 0;
let consecutiveErrors = 0;
const MAX_RETRIES = 3;

async function waitForRateLimit(): Promise<void> {
  const backoffMultiplier = Math.pow(2, consecutiveErrors);
  const totalDelay = JIKAN_MIN_DELAY_MS * backoffMultiplier;

  const timeSinceLastRequest = Date.now() - lastRequestTime;
  if (timeSinceLastRequest < totalDelay) {
    await new Promise((resolve) =>
      setTimeout(resolve, totalDelay - timeSinceLastRequest)
    );
  }
}

function updateRateLimitState(success: boolean): void {
  lastRequestTime = Date.now();
  if (success) {
    consecutiveErrors = 0;
  } else {
    consecutiveErrors = Math.min(consecutiveErrors + 1, 5);
  }
}

// =============================================================================
// Core API Functions
// =============================================================================

async function makeJikanRequest<T>(endpoint: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForRateLimit();

    try {
      const url = `${JIKAN_API}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      });

      // Handle rate limiting (429)
      if (response.status === 429) {
        updateRateLimitState(false);
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error('Rate limit exceeded');
      }

      // Handle 404 (no data)
      if (response.status === 404) {
        updateRateLimitState(true);
        throw new Error('NOT_FOUND');
      }

      // Handle other HTTP errors
      if (!response.ok) {
        updateRateLimitState(false);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      updateRateLimitState(true);
      return json as T;
    } catch (err) {
      updateRateLimitState(false);

      if (err instanceof Error && err.message === 'NOT_FOUND') {
        throw err;
      }

      if (attempt >= MAX_RETRIES) {
        throw err;
      }
    }
  }

  throw new Error('Request failed after retries');
}

// =============================================================================
// Helper Functions
// =============================================================================

function transformReview(review: JikanReview, malId: string): ReviewData {
  // MAL scores are 1-10, already normalized scale
  const normalizedRating = review.score
    ? normalizeRating(review.score, 10)
    : undefined;

  // Calculate total "likes" from reactions
  const totalReactions = review.reactions
    ? Object.values(review.reactions).reduce((sum, val) => sum + (val || 0), 0)
    : 0;

  return {
    source: 'myanimelist',
    sourceId: malId,
    reviewId: String(review.mal_id),
    sourceUrl: review.url,
    author: {
      name: review.user.username,
      avatarUrl: review.user.images?.jpg?.image_url || review.user.images?.webp?.image_url,
      profileUrl: review.user.url,
    },
    text: review.review,
    summary: generateSummary(review.review, 200),
    rating: normalizedRating,
    originalRating: review.score || undefined,
    ratingScale: review.score ? 10 : undefined,
    hasSpoilers: review.is_spoiler,
    reviewType: 'user',
    likes: totalReactions,
    createdOnSource: review.date ? new Date(review.date) : undefined,
  };
}

function getPreferredTitle(manga: JikanSearchResult): string {
  return manga.title_english || manga.title || '';
}

function calculateTitleSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  const normA = normalize(a);
  const normB = normalize(b);

  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.85;

  const setA = new Set(normA);
  const setB = new Set(normB);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export const MALReviewProvider: ReviewProvider = {
  name: 'myanimelist',
  displayName: 'MyAnimeList',
  supportsIssueReviews: false,

  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    try {
      // Simple request to check if Jikan API is accessible
      await makeJikanRequest<{ data: unknown }>('/top/manga?limit=1');
      return { available: true };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  async searchSeries(
    query: ReviewSearchQuery
  ): Promise<ReviewMatchResult | null> {
    // If we have an existing MAL ID, use it directly
    if (query.existingId) {
      return {
        sourceId: query.existingId,
        confidence: 1.0,
        matchMethod: 'id',
      };
    }

    try {
      const searchQuery = encodeURIComponent(query.seriesName);
      const response = await makeJikanRequest<JikanSearchResponse>(
        `/manga?q=${searchQuery}&limit=5&type=manga`
      );

      if (!response.data || response.data.length === 0) {
        logger.debug({ query: query.seriesName }, 'No MAL matches found');
        return null;
      }

      // Find best match
      let bestMatch = response.data[0];
      let bestConfidence = 0;

      for (const manga of response.data) {
        const title = getPreferredTitle(manga);
        const similarity = calculateTitleSimilarity(query.seriesName, title);

        // Boost confidence for year match
        let confidence = similarity;
        if (query.year && manga.published?.prop?.from?.year === query.year) {
          confidence = Math.min(confidence + 0.1, 1.0);
        }

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = manga;
        }
      }

      // Only return if confidence is reasonable
      if (bestConfidence < 0.5 || !bestMatch) {
        logger.debug(
          { query: query.seriesName, bestConfidence },
          'No confident MAL match'
        );
        return null;
      }

      return {
        sourceId: String(bestMatch.mal_id),
        confidence: bestConfidence,
        matchMethod: bestConfidence >= 0.9 ? 'name_year' : 'fuzzy',
        matchedName: getPreferredTitle(bestMatch),
        matchedYear: bestMatch.published?.prop?.from?.year || undefined,
      };
    } catch (error) {
      logger.error({ error, query: query.seriesName }, 'Error searching MAL');
      return null;
    }
  },

  async getSeriesReviews(
    sourceId: string,
    options: ReviewFetchOptions = {}
  ): Promise<ReviewData[]> {
    const limit = Math.min(options.limit || 10, 20); // Jikan max is 25 per page

    try {
      // Jikan doesn't have sorting options for reviews, returns by default order (recency)
      const response = await makeJikanRequest<JikanReviewsResponse>(
        `/manga/${sourceId}/reviews`
      );

      if (!response.data || response.data.length === 0) {
        logger.debug({ sourceId }, 'No MAL reviews found');
        return [];
      }

      let reviews = response.data
        .slice(0, limit)
        .filter((review) => review.review && review.review.length > 0)
        .map((review) => transformReview(review, sourceId));

      // Filter spoilers if requested
      if (options.skipSpoilers) {
        reviews = reviews.filter((r) => !r.hasSpoilers);
      }

      // Sort by likes if requested
      if (options.sortBy === 'helpful') {
        reviews.sort((a, b) => (b.likes || 0) - (a.likes || 0));
      } else if (options.sortBy === 'rating') {
        reviews.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      }
      // 'date' is default order from Jikan

      logger.info(
        { sourceId, reviewCount: reviews.length },
        'Fetched MAL reviews'
      );

      return reviews;
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        logger.debug({ sourceId }, 'MAL manga not found');
        return [];
      }
      logger.error({ error, sourceId }, 'Error fetching MAL reviews');
      throw error;
    }
  },
};

// Auto-register provider
ReviewProviderRegistry.register(MALReviewProvider);

export default MALReviewProvider;
