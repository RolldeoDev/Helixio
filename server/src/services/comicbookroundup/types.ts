/**
 * ComicBookRoundup Shared Types
 *
 * Core types for the unified CBR scraping module.
 * Used by both rating and review providers.
 */

// =============================================================================
// Rating Types
// =============================================================================

/**
 * Aggregate rating data (critic or community average)
 */
export interface CBRRatingData {
  /** Rating value on 0-10 scale */
  value: number;
  /** Number of reviews contributing to this rating */
  count: number;
}

// =============================================================================
// Review Types
// =============================================================================

/**
 * A single parsed review from CBR
 */
export interface CBRParsedReview {
  /** Reviewer name or publication name */
  author: string;
  /** URL to reviewer's profile (if available) */
  authorUrl?: string;
  /** Rating given in this review (0-10 scale) */
  rating?: number;
  /** Full review text */
  text: string;
  /** Date the review was posted */
  date?: Date;
  /** Number of likes/helpful votes */
  likes?: number;
  /** Whether this is a critic or user review */
  type: 'critic' | 'user';
  /** Publication name for critic reviews (e.g., "IGN", "CBR") */
  publication?: string;
  /** URL to full review on external site (for critic reviews with "Read Full Review" link) */
  reviewUrl?: string;
}

// =============================================================================
// Page Data Types
// =============================================================================

/**
 * Complete data extracted from a CBR page
 * Contains both ratings and reviews from a single scrape
 */
export interface CBRPageData {
  // Aggregate ratings
  /** Average critic rating and count */
  criticRating?: CBRRatingData;
  /** Average community/user rating and count */
  communityRating?: CBRRatingData;

  // Individual reviews
  /** List of critic reviews */
  criticReviews: CBRParsedReview[];
  /** List of user reviews */
  userReviews: CBRParsedReview[];

  // Metadata
  /** Series or issue name from page title */
  pageName?: string;
  /** Issue number if this is an issue page */
  issueNumber?: string;
  /** When this data was fetched */
  fetchedAt: Date;
  /** The URL that was scraped */
  sourceUrl: string;
}

// =============================================================================
// Search/Match Types
// =============================================================================

/**
 * Query parameters for searching CBR
 */
export interface CBRSearchQuery {
  /** Series name to search for */
  seriesName: string;
  /** Publisher name (required for URL construction) */
  publisher?: string;
  /** Publication year (helps disambiguate reboots) */
  year?: number;
  /** Writer name (helps narrow results) */
  writer?: string;
}

/**
 * Match method used to find the series
 */
export type CBRMatchMethod = 'exact' | 'fuzzy' | 'search' | 'imprint' | 'sitemap';

/**
 * Result of a series search/match
 */
export interface CBRSeriesMatch {
  /** The source ID (publisher-slug/series-slug) */
  sourceId: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** How the match was found */
  matchMethod: CBRMatchMethod;
  /** The matched series name from CBR */
  matchedName?: string;
}

// =============================================================================
// Fetch Result Types
// =============================================================================

/**
 * Result of fetching a page
 */
export interface CBRFetchResult {
  /** The HTML content (null if fetch failed) */
  html: string | null;
  /** Whether this came from cache */
  fromCache: boolean;
  /** The cache key used */
  cacheKey: string;
}

// =============================================================================
// Sitemap Index Types
// =============================================================================

/**
 * A series entry extracted from CBR sitemaps
 */
export interface CBRSeriesEntry {
  /** Full source ID (publisher-slug/series-slug) e.g., "dark-horse-comics/helen-of-wyndhorn-(2024)" */
  sourceId: string;
  /** Publisher slug e.g., "dark-horse-comics" */
  publisher: string;
  /** Series slug e.g., "helen-of-wyndhorn-(2024)" */
  seriesSlug: string;
  /** Human-readable series name derived from slug e.g., "Helen of Wyndhorn (2024)" */
  seriesName: string;
}
