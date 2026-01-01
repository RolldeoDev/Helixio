/**
 * ComicBookRoundup Rating Provider
 *
 * Thin adapter that wraps the unified CBR module to provide the RatingProvider interface.
 * All scraping logic is delegated to the shared comicbookroundup module.
 */

import * as CBR from '../comicbookroundup/index.js';
import type {
  RatingProvider,
  RatingData,
  RatingSearchQuery,
  RatingMatchResult,
} from './types.js';
import { normalizeRating } from './types.js';
import { register } from './registry.js';

// =============================================================================
// Transform Functions
// =============================================================================

/**
 * Transform CBR page data to RatingData array.
 */
function transformToRatingData(
  data: CBR.CBRPageData,
  sourceId: string
): RatingData[] {
  const ratings: RatingData[] = [];

  if (data.criticRating && data.criticRating.value > 0) {
    ratings.push({
      source: 'comicbookroundup',
      sourceId,
      ratingType: 'critic',
      value: normalizeRating(data.criticRating.value, 10),
      originalValue: data.criticRating.value,
      scale: 10,
      voteCount: data.criticRating.count,
    });
  }

  if (data.communityRating && data.communityRating.value > 0) {
    ratings.push({
      source: 'comicbookroundup',
      sourceId,
      ratingType: 'community',
      value: normalizeRating(data.communityRating.value, 10),
      originalValue: data.communityRating.value,
      scale: 10,
      voteCount: data.communityRating.count,
    });
  }

  return ratings;
}

/**
 * Map CBR match method to rating provider match method.
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

export const ComicBookRoundupProvider: RatingProvider = {
  name: 'comicbookroundup',
  displayName: 'Comic Book Roundup',
  supportsIssueRatings: true,
  ratingTypes: ['community', 'critic'],

  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    return CBR.checkAvailability();
  },

  async searchSeries(query: RatingSearchQuery): Promise<RatingMatchResult | null> {
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

  async getSeriesRatings(sourceId: string): Promise<RatingData[]> {
    const data = await CBR.fetchSeriesData(sourceId);
    return transformToRatingData(data, sourceId);
  },

  async getIssueRatings(
    seriesSourceId: string,
    issueNumber: string
  ): Promise<RatingData[]> {
    const data = await CBR.fetchIssueData(seriesSourceId, issueNumber);
    return transformToRatingData(data, `${seriesSourceId}/${issueNumber}`);
  },
};

// Re-export reset function for testing
export const resetRateLimiter = CBR.resetRateLimiter;

// Register the provider
register(ComicBookRoundupProvider);

export default ComicBookRoundupProvider;
