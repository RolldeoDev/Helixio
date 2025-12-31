/**
 * Rating Providers - Type Definitions
 *
 * Defines the interfaces for external rating providers that fetch
 * community and critic ratings from external sources.
 */

// =============================================================================
// Rating Sources
// =============================================================================

/**
 * Supported external rating sources
 */
export type RatingSource =
  | 'comicbookroundup'
  | 'leagueofcomicgeeks'
  | 'comicvine'
  | 'metron'
  | 'anilist'
  | 'myanimelist';

/**
 * Type of rating (community average vs critic score)
 */
export type RatingType = 'community' | 'critic';

// =============================================================================
// Rating Data
// =============================================================================

/**
 * A single rating from an external source
 */
export interface RatingData {
  /** Source this rating came from */
  source: RatingSource;

  /** External ID for this series/issue on the source (for future syncs) */
  sourceId: string;

  /** Type of rating */
  ratingType: RatingType;

  /** Normalized rating value (0-10 scale) */
  value: number;

  /** Original rating value before normalization */
  originalValue: number;

  /** Original scale the rating was on (e.g., 5, 10, 100) */
  scale: number;

  /** Number of votes/ratings (if available) */
  voteCount?: number;

  /** Number of written reviews (if different from vote count) */
  reviewCount?: number;
}

/**
 * Result of fetching ratings for a series
 */
export interface SeriesRatingResult {
  /** Ratings for the series itself */
  seriesRatings: RatingData[];

  /** Optional issue-level ratings (issueNumber -> ratings) */
  issueRatings?: Map<string, RatingData[]>;
}

// =============================================================================
// Search & Matching
// =============================================================================

/**
 * Query for searching a series on an external source
 */
export interface RatingSearchQuery {
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
export interface RatingMatchResult {
  /** External ID on this source */
  sourceId: string;

  /** Confidence of the match (0-1) */
  confidence: number;

  /** Method used for matching */
  matchMethod: 'id' | 'name_year' | 'name_publisher' | 'fuzzy' | 'manual' | 'search';

  /** Matched series name (for display/debugging) */
  matchedName?: string;

  /** Matched year (for display/debugging) */
  matchedYear?: number;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Interface for rating providers
 *
 * Each provider must implement methods for:
 * - Checking availability (credentials, API status)
 * - Searching for series by name/year
 * - Fetching ratings for a matched series
 * - Optionally fetching issue-level ratings
 */
export interface RatingProvider {
  /** Unique source identifier */
  readonly name: RatingSource;

  /** Human-readable display name */
  readonly displayName: string;

  /** Whether this provider supports issue-level ratings */
  readonly supportsIssueRatings: boolean;

  /** Types of ratings this provider offers */
  readonly ratingTypes: RatingType[];

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
  searchSeries(query: RatingSearchQuery): Promise<RatingMatchResult | null>;

  /**
   * Get ratings for a series by its external source ID
   * @param sourceId External ID on this source
   * @returns Array of ratings (community, critic, etc.)
   */
  getSeriesRatings(sourceId: string): Promise<RatingData[]>;

  /**
   * Get ratings for a specific issue (optional)
   * @param seriesSourceId External series ID on this source
   * @param issueNumber Issue number (string to handle "1.5", "Annual 1", etc.)
   * @returns Array of ratings for this issue
   */
  getIssueRatings?(
    seriesSourceId: string,
    issueNumber: string
  ): Promise<RatingData[]>;
}

// =============================================================================
// Sync Results
// =============================================================================

/**
 * Result of syncing ratings for a single series
 */
export interface SeriesSyncResult {
  seriesId: string;
  seriesName: string;
  success: boolean;

  /** Ratings that were synced */
  ratings: RatingData[];

  /** Sources that were matched */
  matchedSources: RatingSource[];

  /** Sources that couldn't find a match */
  unmatchedSources: RatingSource[];

  /** Any errors that occurred */
  errors?: Array<{
    source: RatingSource;
    error: string;
  }>;
}

/**
 * Result of a rating sync job (library-wide or scheduled)
 */
export interface RatingSyncJobResult {
  jobId: string;
  status: 'completed' | 'failed' | 'partial';

  totalSeries: number;
  successfulSeries: number;
  failedSeries: number;
  unmatchedSeries: number;

  /** Series that couldn't be matched on any source */
  unmatchedSeriesList: Array<{
    seriesId: string;
    seriesName: string;
    attemptedSources: RatingSource[];
  }>;

  /** Errors encountered */
  errors: Array<{
    seriesId: string;
    seriesName: string;
    source: RatingSource;
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
 * External rating formatted for display
 */
export interface ExternalRatingDisplay {
  source: RatingSource;
  sourceDisplayName: string;
  ratingType: RatingType;

  /** Normalized value (0-10) */
  value: number;

  /** Original value for display (e.g., "4.2/5") */
  displayValue: string;

  /** Vote count if available */
  voteCount?: number;

  /** When this rating was last synced */
  lastSyncedAt: Date;

  /** Whether this rating is stale (past TTL) */
  isStale: boolean;

  /** Match confidence (for transparency) */
  confidence: number;

  /** Direct URL to view ratings on the source site */
  sourceUrl?: string | null;
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
 * Get display name for a rating source
 */
export function getSourceDisplayName(source: RatingSource): string {
  const displayNames: Record<RatingSource, string> = {
    comicbookroundup: 'Comic Book Roundup',
    leagueofcomicgeeks: 'League of Comic Geeks',
    comicvine: 'ComicVine',
    metron: 'Metron',
    anilist: 'AniList',
    myanimelist: 'MyAnimeList',
  };
  return displayNames[source] || source;
}

/**
 * Default TTL for rating data (7 days in milliseconds)
 */
export const RATING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Calculate expiration date for a rating
 */
export function calculateExpirationDate(ttlMs: number = RATING_TTL_MS): Date {
  return new Date(Date.now() + ttlMs);
}
