/**
 * AniList Review Provider
 *
 * Fetches user reviews from AniList for manga series.
 * Uses the public AniList GraphQL API (no authentication required for read-only).
 *
 * API Documentation: https://docs.anilist.co/
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
  getSourceUrl,
} from './types.js';
import { getMetadataSettings } from '../config.service.js';
import { APICache, type CacheOptions } from '../api-cache.service.js';
import { createServiceLogger } from '../logger.service.js';

const logger = createServiceLogger('anilist-review-provider');

// =============================================================================
// Constants
// =============================================================================

const ANILIST_API = 'https://graphql.anilist.co';
const USER_AGENT = 'Helixio/0.1.0 (Comic Book Management Tool)';

// Rate limiting settings based on rateLimitLevel (1-10)
// AniList allows 90 req/min
const getDelayMs = (level: number): number => {
  const minDelay = 150; // 0.15 seconds at level 10
  const maxDelay = 1500; // 1.5 seconds at level 1
  const normalized = Math.max(1, Math.min(10, level));
  return maxDelay - ((normalized - 1) / 9) * (maxDelay - minDelay);
};

// =============================================================================
// Types
// =============================================================================

interface AniListReview {
  id: number;
  userId: number;
  mediaId: number;
  score: number; // 0-100
  summary: string;
  body: string;
  rating: number; // Upvotes
  ratingAmount: number; // Total votes
  createdAt: number; // Unix timestamp
  user: {
    id: number;
    name: string;
    avatar?: {
      large?: string;
      medium?: string;
    };
  };
}

interface AniListReviewsResponse {
  Page: {
    pageInfo: {
      total: number;
      currentPage: number;
      lastPage: number;
      hasNextPage: boolean;
      perPage: number;
    };
    reviews: AniListReview[];
  };
}

interface AniListSearchResponse {
  Page: {
    pageInfo: {
      total: number;
    };
    media: Array<{
      id: number;
      title: {
        romaji: string;
        english: string | null;
        native: string | null;
      };
      startDate?: {
        year: number | null;
      };
    }>;
  };
}

// =============================================================================
// GraphQL Queries
// =============================================================================

const REVIEWS_QUERY = `
query ($mediaId: Int!, $page: Int, $perPage: Int, $sort: [ReviewSort]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
      perPage
    }
    reviews(mediaId: $mediaId, sort: $sort) {
      id
      userId
      mediaId
      score
      summary
      body
      rating
      ratingAmount
      createdAt
      user {
        id
        name
        avatar {
          large
          medium
        }
      }
    }
  }
}
`;

const SEARCH_QUERY = `
query ($search: String!, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
    }
    media(search: $search, type: MANGA, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
      id
      title {
        romaji
        english
        native
      }
      startDate {
        year
      }
    }
  }
}
`;

// =============================================================================
// Rate Limiting
// =============================================================================

let lastRequestTime = 0;
let consecutiveErrors = 0;
const MAX_RETRIES = 3;

async function waitForRateLimit(): Promise<void> {
  const settings = getMetadataSettings();
  const delay = getDelayMs(settings.rateLimitLevel);

  const backoffMultiplier = Math.pow(2, consecutiveErrors);
  const totalDelay = delay * backoffMultiplier;

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

async function makeGraphQLRequest<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForRateLimit();

    try {
      const response = await fetch(ANILIST_API, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      // Handle rate limiting (429)
      if (response.status === 429) {
        updateRateLimitState(false);
        if (attempt < MAX_RETRIES) continue;
        throw new Error('Rate limit exceeded');
      }

      // Handle other HTTP errors
      if (!response.ok) {
        updateRateLimitState(false);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as {
        data?: T;
        errors?: Array<{ message: string }>;
      };

      // Handle GraphQL errors
      if (json.errors && json.errors.length > 0) {
        updateRateLimitState(false);
        throw new Error(json.errors[0]?.message || 'GraphQL error');
      }

      if (!json.data) {
        throw new Error('No data in response');
      }

      updateRateLimitState(true);
      return json.data;
    } catch (err) {
      updateRateLimitState(false);
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

function transformReview(review: AniListReview, mediaId: string): ReviewData {
  // AniList scores are 0-100, normalize to 0-10
  const normalizedRating = review.score
    ? normalizeRating(review.score, 100)
    : undefined;

  return {
    source: 'anilist',
    sourceId: mediaId,
    reviewId: String(review.id),
    sourceUrl: `https://anilist.co/review/${review.id}`,
    author: {
      name: review.user.name,
      id: String(review.user.id),
      avatarUrl: review.user.avatar?.medium || review.user.avatar?.large,
      profileUrl: `https://anilist.co/user/${review.user.id}`,
    },
    text: review.body || review.summary,
    summary: generateSummary(review.body || review.summary, 200),
    rating: normalizedRating,
    originalRating: review.score || undefined,
    ratingScale: review.score ? 100 : undefined,
    hasSpoilers: false, // AniList doesn't expose spoiler status in API
    reviewType: 'user',
    likes: review.rating, // Upvotes
    createdOnSource: review.createdAt
      ? new Date(review.createdAt * 1000)
      : undefined,
  };
}

function getPreferredTitle(media: {
  title: { romaji: string; english: string | null; native: string | null };
}): string {
  return media.title.english || media.title.romaji || media.title.native || '';
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

  // Simple character overlap
  const setA = new Set(normA);
  const setB = new Set(normB);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export const AniListReviewProvider: ReviewProvider = {
  name: 'anilist',
  displayName: 'AniList',
  supportsIssueReviews: false, // AniList doesn't have chapter-level reviews

  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    try {
      // Simple query to check if the API is accessible
      await makeGraphQLRequest<{ Viewer: null }>(
        '{ Viewer { id } }',
        {}
      );
      return { available: true };
    } catch (error) {
      // Even if this query fails (no auth), the API is still available
      // The error would be about authentication, not availability
      return { available: true };
    }
  },

  async searchSeries(
    query: ReviewSearchQuery
  ): Promise<ReviewMatchResult | null> {
    // If we have an existing ID, use it directly
    if (query.existingId) {
      return {
        sourceId: query.existingId,
        confidence: 1.0,
        matchMethod: 'id',
      };
    }

    try {
      const response = await makeGraphQLRequest<AniListSearchResponse>(
        SEARCH_QUERY,
        {
          search: query.seriesName,
          page: 1,
          perPage: 5,
        }
      );

      if (!response.Page.media || response.Page.media.length === 0) {
        logger.debug({ query: query.seriesName }, 'No AniList matches found');
        return null;
      }

      // Find best match
      let bestMatch = response.Page.media[0];
      let bestConfidence = 0;

      for (const media of response.Page.media) {
        const title = getPreferredTitle(media);
        const similarity = calculateTitleSimilarity(query.seriesName, title);

        // Boost confidence for year match
        let confidence = similarity;
        if (query.year && media.startDate?.year === query.year) {
          confidence = Math.min(confidence + 0.1, 1.0);
        }

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = media;
        }
      }

      // Only return if confidence is reasonable and we have a match
      if (bestConfidence < 0.5 || !bestMatch) {
        logger.debug(
          { query: query.seriesName, bestConfidence },
          'No confident AniList match'
        );
        return null;
      }

      return {
        sourceId: String(bestMatch.id),
        confidence: bestConfidence,
        matchMethod: bestConfidence >= 0.9 ? 'name_year' : 'fuzzy',
        matchedName: getPreferredTitle(bestMatch),
        matchedYear: bestMatch.startDate?.year || undefined,
      };
    } catch (error) {
      logger.error({ error, query: query.seriesName }, 'Error searching AniList');
      return null;
    }
  },

  async getSeriesReviews(
    sourceId: string,
    options: ReviewFetchOptions = {}
  ): Promise<ReviewData[]> {
    const limit = Math.min(options.limit || 10, 25); // AniList max 25 per page

    // Map sort option to AniList sort enum
    let sort: string[];
    switch (options.sortBy) {
      case 'date':
        sort = ['CREATED_AT_DESC'];
        break;
      case 'rating':
        sort = ['SCORE_DESC'];
        break;
      case 'helpful':
      default:
        sort = ['RATING_DESC']; // Most upvoted
    }

    try {
      const response = await makeGraphQLRequest<AniListReviewsResponse>(
        REVIEWS_QUERY,
        {
          mediaId: parseInt(sourceId),
          page: 1,
          perPage: limit,
          sort,
        }
      );

      if (!response.Page.reviews || response.Page.reviews.length === 0) {
        logger.debug({ sourceId }, 'No AniList reviews found');
        return [];
      }

      const reviews = response.Page.reviews
        .filter((review) => review.body || review.summary) // Only reviews with content
        .map((review) => transformReview(review, sourceId));

      logger.info(
        { sourceId, reviewCount: reviews.length },
        'Fetched AniList reviews'
      );

      return reviews;
    } catch (error) {
      logger.error({ error, sourceId }, 'Error fetching AniList reviews');
      throw error;
    }
  },
};

// Auto-register provider
ReviewProviderRegistry.register(AniListReviewProvider);

export default AniListReviewProvider;
