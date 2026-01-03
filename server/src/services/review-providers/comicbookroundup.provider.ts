/**
 * ComicBookRoundup Review Provider
 *
 * Thin adapter that wraps the unified CBR module to provide the ReviewProvider interface.
 * All scraping logic is delegated to the shared comicbookroundup module.
 */

import * as CBR from '../comicbookroundup/index.js';
import { ReviewProviderRegistry } from './registry.js';
import type {
  ReviewProvider,
  ReviewData,
  ReviewSearchQuery,
  ReviewMatchResult,
  ReviewFetchOptions,
} from './types.js';
import { normalizeRating, generateSummary } from './types.js';

// =============================================================================
// Transform Functions
// =============================================================================

/**
 * Generate a consistent review ID for CBR reviews.
 * Uses author name + first 50 chars of text to create a unique, reproducible ID.
 * This ensures the same review gets the same ID regardless of which sync path stores it.
 */
function generateCbrReviewId(author: string, text: string): string {
  const authorKey = author.replace(/[^a-zA-Z0-9]/g, '');
  const textSnippet = text.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '');
  return `${authorKey}-${textSnippet}`.substring(0, 100);
}

/**
 * Transform a CBR parsed review to ReviewData format.
 */
function transformReview(
  review: CBR.CBRParsedReview,
  sourceId: string
): ReviewData {
  return {
    source: 'comicbookroundup',
    sourceId,
    // Generate a consistent reviewId so rating-sync and review-sync paths
    // create the same ID for the same review (prevents duplicates)
    reviewId: generateCbrReviewId(review.author, review.text),
    author: {
      name: review.author,
      profileUrl: review.authorUrl,
    },
    text: review.text,
    summary: generateSummary(review.text, 200),
    rating: review.rating ? normalizeRating(review.rating, 10) : undefined,
    originalRating: review.rating,
    ratingScale: review.rating ? 10 : undefined,
    hasSpoilers: false,
    reviewType: review.type,
    likes: review.likes,
    createdOnSource: review.date,
    reviewUrl: review.reviewUrl,
  };
}

/**
 * Transform CBR page data to ReviewData array with sorting and limiting.
 */
function transformToReviewData(
  data: CBR.CBRPageData,
  sourceId: string,
  options: ReviewFetchOptions
): ReviewData[] {
  // Combine critic and user reviews
  const allReviews = [
    ...data.criticReviews.map((r) => transformReview(r, sourceId)),
    ...data.userReviews.map((r) => transformReview(r, sourceId)),
  ];

  // Apply sorting
  if (options.sortBy === 'helpful' || !options.sortBy) {
    allReviews.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else if (options.sortBy === 'date') {
    allReviews.sort((a, b) => {
      const dateA = a.createdOnSource?.getTime() || 0;
      const dateB = b.createdOnSource?.getTime() || 0;
      return dateB - dateA;
    });
  } else if (options.sortBy === 'rating') {
    allReviews.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }

  // Apply spoiler filter (CBR doesn't mark spoilers, so nothing to filter)
  // Skip spoilers handling as CBR doesn't provide this info

  // Apply limit
  const limit = options.limit || 15;
  return allReviews.slice(0, limit);
}

/**
 * Map CBR match method to review provider match method.
 */
function mapMatchMethod(
  cbrMethod: CBR.CBRMatchMethod
): 'id' | 'name_year' | 'name_publisher' | 'fuzzy' | 'search' {
  switch (cbrMethod) {
    case 'exact':
      return 'name_year';
    case 'search':
      return 'search';
    case 'fuzzy':
    case 'imprint':
    default:
      return 'fuzzy';
  }
}

// =============================================================================
// Provider Implementation
// =============================================================================

export const ComicBookRoundupReviewProvider: ReviewProvider = {
  name: 'comicbookroundup',
  displayName: 'Comic Book Roundup',
  supportsIssueReviews: true,

  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    return CBR.checkAvailability();
  },

  async searchSeries(query: ReviewSearchQuery): Promise<ReviewMatchResult | null> {
    const match = await CBR.searchSeries({
      seriesName: query.seriesName,
      publisher: query.publisher,
      year: query.year,
      writer: query.writer,
    });

    if (!match) return null;

    return {
      sourceId: match.sourceId,
      confidence: match.confidence,
      matchMethod: mapMatchMethod(match.matchMethod),
      matchedName: match.matchedName,
    };
  },

  async getSeriesReviews(
    sourceId: string,
    options: ReviewFetchOptions = {}
  ): Promise<ReviewData[]> {
    const data = await CBR.fetchSeriesData(sourceId, options.limit || 15);
    return transformToReviewData(data, sourceId, options);
  },

  async getIssueReviews(
    seriesSourceId: string,
    issueNumber: string,
    options: ReviewFetchOptions = {}
  ): Promise<ReviewData[]> {
    const data = await CBR.fetchIssueData(
      seriesSourceId,
      issueNumber,
      options.limit || 15
    );
    return transformToReviewData(
      data,
      `${seriesSourceId}/${issueNumber}`,
      options
    );
  },
};

// Re-export reset function for testing
export const resetRateLimiter = CBR.resetRateLimiter;

// Auto-register provider
ReviewProviderRegistry.register(ComicBookRoundupReviewProvider);

export default ComicBookRoundupReviewProvider;
