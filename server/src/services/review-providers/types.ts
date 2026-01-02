/**
 * Review Providers - Type Definitions
 *
 * Defines the interfaces for external review providers that fetch
 * user and critic reviews from external sources.
 */

// =============================================================================
// Review Sources
// =============================================================================

/**
 * Supported external review sources
 */
export type ReviewSource = 'anilist' | 'myanimelist' | 'comicbookroundup';

// =============================================================================
// Review Data
// =============================================================================

/**
 * A single review from an external source
 */
export interface ReviewData {
  /** Source this review came from */
  source: ReviewSource;

  /** External series/issue ID on this source */
  sourceId: string;

  /** Unique review ID on the source (if available) */
  reviewId?: string;

  /** Source URL to view the review */
  sourceUrl?: string;

  /** Review author information */
  author: {
    name: string;
    id?: string;
    avatarUrl?: string;
    profileUrl?: string;
  };

  /** Full review text */
  text: string;

  /** Short summary/excerpt (first ~200 chars) */
  summary?: string;

  /** Reviewer's rating (normalized to 0-10) */
  rating?: number;

  /** Original rating value before normalization */
  originalRating?: number;

  /** Original rating scale (e.g., 5, 10, 100) */
  ratingScale?: number;

  /** Whether the review contains spoilers */
  hasSpoilers: boolean;

  /** Type of review */
  reviewType: 'user' | 'critic';

  /** Helpful/upvote count */
  likes?: number;

  /** When the review was posted on the source */
  createdOnSource?: Date;

  /** URL to full review on external site (for CBR critic reviews with "Read Full Review" link) */
  reviewUrl?: string;
}

/**
 * Result of fetching reviews for a series
 */
export interface SeriesReviewResult {
  /** Reviews for the series */
  reviews: ReviewData[];

  /** Total number of reviews available (may be more than fetched) */
  totalCount?: number;

  /** Whether there are more reviews available */
  hasMore?: boolean;
}

// =============================================================================
// Search & Matching
// =============================================================================

/**
 * Query for searching a series on an external source
 */
export interface ReviewSearchQuery {
  /** Series name */
  seriesName: string;

  /** Publisher name (for disambiguation) */
  publisher?: string;

  /** Start year (for disambiguation) */
  year?: number;

  /** Existing external ID if known (for direct lookup) */
  existingId?: string;

  /** Primary writer (for better matching) */
  writer?: string;
}

/**
 * Result of matching a series on an external source
 */
export interface ReviewMatchResult {
  /** External ID on this source */
  sourceId: string;

  /** Confidence of the match (0-1) */
  confidence: number;

  /** Method used for matching */
  matchMethod: 'id' | 'name_year' | 'name_publisher' | 'fuzzy' | 'search';

  /** Matched series name (for display/debugging) */
  matchedName?: string;

  /** Matched year (for display/debugging) */
  matchedYear?: number;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Options for fetching reviews
 */
export interface ReviewFetchOptions {
  /** Maximum number of reviews to fetch (default: 10) */
  limit?: number;

  /** Skip reviews marked as spoilers */
  skipSpoilers?: boolean;

  /** Sort order for reviews */
  sortBy?: 'date' | 'helpful' | 'rating';
}

/**
 * Interface for review providers
 *
 * Each provider must implement methods for:
 * - Checking availability (credentials, API status)
 * - Searching for series by name/year
 * - Fetching reviews for a matched series
 * - Optionally fetching issue-level reviews
 */
export interface ReviewProvider {
  /** Unique source identifier */
  readonly name: ReviewSource;

  /** Human-readable display name */
  readonly displayName: string;

  /** Whether this provider supports issue-level reviews */
  readonly supportsIssueReviews: boolean;

  /**
   * Check if this provider is available (credentials configured, API accessible)
   */
  checkAvailability(): Promise<{
    available: boolean;
    error?: string;
  }>;

  /**
   * Search for a series on this source and return the best match
   * @param query Search parameters
   * @returns Match result with sourceId and confidence, or null if no match
   */
  searchSeries(query: ReviewSearchQuery): Promise<ReviewMatchResult | null>;

  /**
   * Get reviews for a series by its external source ID
   * @param sourceId External ID on this source
   * @param options Fetch options (limit, sorting, etc.)
   * @returns Array of reviews
   */
  getSeriesReviews(
    sourceId: string,
    options?: ReviewFetchOptions
  ): Promise<ReviewData[]>;

  /**
   * Get reviews for a specific issue (optional)
   * @param seriesSourceId External series ID on this source
   * @param issueNumber Issue number (string to handle "1.5", "Annual 1", etc.)
   * @param options Fetch options
   * @returns Array of reviews for this issue
   */
  getIssueReviews?(
    seriesSourceId: string,
    issueNumber: string,
    options?: ReviewFetchOptions
  ): Promise<ReviewData[]>;
}

// =============================================================================
// Sync Results
// =============================================================================

/**
 * Result of syncing reviews for a single series
 */
export interface SeriesReviewSyncResult {
  seriesId: string;
  seriesName: string;
  success: boolean;

  /** Reviews that were synced */
  reviews: ReviewData[];

  /** Number of reviews synced */
  reviewCount: number;

  /** Sources that were matched */
  matchedSources: ReviewSource[];

  /** Sources that couldn't find a match */
  unmatchedSources: ReviewSource[];

  /** Any errors that occurred */
  errors?: Array<{
    source: ReviewSource;
    error: string;
  }>;
}

/**
 * Result of a review sync job (library-wide or scheduled)
 */
export interface ReviewSyncJobResult {
  jobId: string;
  status: 'completed' | 'failed' | 'partial';

  totalSeries: number;
  successfulSeries: number;
  failedSeries: number;
  unmatchedSeries: number;
  totalReviews: number;

  /** Series that couldn't be matched on any source */
  unmatchedSeriesList: Array<{
    seriesId: string;
    seriesName: string;
    attemptedSources: ReviewSource[];
  }>;

  /** Errors encountered */
  errors: Array<{
    seriesId: string;
    seriesName: string;
    source: ReviewSource;
    error: string;
  }>;

  /** Timing */
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

// =============================================================================
// Display Types (for frontend)
// =============================================================================

/**
 * External review formatted for display
 */
export interface ExternalReviewDisplay {
  id: string;
  source: ReviewSource;
  sourceDisplayName: string;
  sourceUrl?: string;

  /** Author information */
  author: {
    name: string;
    avatarUrl?: string;
    profileUrl?: string;
  };

  /** Review content */
  text: string;
  summary?: string;

  /** Rating (normalized 0-10) */
  rating?: number;

  /** Original rating for display (e.g., "4.2/5") */
  displayRating?: string;

  /** Spoiler flag */
  hasSpoilers: boolean;

  /** Review type */
  reviewType: 'user' | 'critic';

  /** Engagement metrics */
  likes?: number;

  /** When the review was posted */
  reviewDate?: Date;

  /** When this review was last synced */
  lastSyncedAt: Date;

  /** Whether this review is stale (past TTL) */
  isStale: boolean;

  /** Match confidence (for transparency) */
  confidence: number;

  /** URL to full review on external site (for CBR critic reviews) */
  reviewUrl?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Normalize a rating to 0-10 scale
 */
export function normalizeRating(value: number, scale: number): number {
  if (scale <= 0) return 0;
  const normalized = (value / scale) * 10;
  return Math.round(normalized * 100) / 100; // Round to 2 decimal places
}

/**
 * Format a rating for display (e.g., "4.2/5", "85%")
 */
export function formatRatingDisplay(
  originalValue: number,
  scale: number
): string {
  if (scale === 100) {
    return `${Math.round(originalValue)}%`;
  }
  return `${originalValue.toFixed(1)}/${scale}`;
}

/**
 * Get display name for a review source
 */
export function getSourceDisplayName(source: ReviewSource): string {
  const displayNames: Record<ReviewSource, string> = {
    anilist: 'AniList',
    myanimelist: 'MyAnimeList',
    comicbookroundup: 'Comic Book Roundup',
  };
  return displayNames[source] || source;
}

/**
 * Get the URL to view a review on its source site
 */
export function getSourceUrl(
  source: ReviewSource,
  sourceId: string,
  reviewId?: string
): string | undefined {
  switch (source) {
    case 'anilist':
      return reviewId
        ? `https://anilist.co/review/${reviewId}`
        : `https://anilist.co/manga/${sourceId}/reviews`;
    case 'myanimelist':
      return `https://myanimelist.net/manga/${sourceId}/reviews`;
    case 'comicbookroundup':
      return `https://comicbookroundup.com/comic-books/reviews/${sourceId}`;
    default:
      return undefined;
  }
}

/**
 * Default TTL for review data (14 days in milliseconds)
 * Reviews change less frequently than ratings
 */
export const REVIEW_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Calculate expiration date for a review
 */
export function calculateExpirationDate(ttlMs: number = REVIEW_TTL_MS): Date {
  return new Date(Date.now() + ttlMs);
}

/**
 * Generate a summary from review text
 */
export function generateSummary(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;

  // Try to break at a sentence boundary
  const truncated = text.slice(0, maxLength);
  const lastSentence = truncated.lastIndexOf('.');
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSentence > maxLength * 0.5) {
    return truncated.slice(0, lastSentence + 1);
  }
  if (lastSpace > maxLength * 0.5) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}
