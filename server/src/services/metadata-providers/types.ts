/**
 * Metadata Provider Types
 *
 * Abstract interface for metadata providers, enabling easy addition of new sources.
 * Providers implement this interface to integrate with the Full Data mode.
 */

// =============================================================================
// Core Types
// =============================================================================

export type MetadataSource = 'comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal';

export interface AvailabilityResult {
  available: boolean;
  configured: boolean;
  error?: string;
}

export interface SearchQuery {
  /** Series/volume name */
  series?: string;
  /** Issue number */
  issueNumber?: string;
  /** Publisher name */
  publisher?: string;
  /** Year of publication */
  year?: number;
  /** Writer name */
  writer?: string;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  sessionId?: string;
}

export interface PaginationOptions {
  limit?: number;
  page?: number;
  sessionId?: string;
}

// =============================================================================
// Credit Types
// =============================================================================

export interface Credit {
  id: number;
  name: string;
  count?: number;
  // Extended fields (currently populated by AniList)
  alternativeNames?: string[];  // Pen names, aliases
  nativeName?: string;          // Name in native language (e.g., Japanese)
  profileUrl?: string;          // Link to source profile page
  imageUrl?: string;            // Portrait/avatar image
}

// =============================================================================
// Series Metadata
// =============================================================================

export interface SeriesMetadata {
  source: MetadataSource;
  sourceId: string;
  name: string;
  publisher?: string;
  startYear?: number;
  endYear?: number;
  issueCount?: number;
  description?: string;
  shortDescription?: string;
  coverUrl?: string;
  url?: string;
  aliases?: string[];
  seriesType?: string;
  volume?: number;

  // Rich data (availability varies by source)
  characters?: Credit[];
  creators?: Credit[];
  locations?: Credit[];
  objects?: Credit[];

  // Image variants
  imageUrls?: {
    thumb?: string;
    small?: string;
    medium?: string;
  };

  // Issue range
  firstIssueNumber?: string;
  lastIssueNumber?: string;
}

export interface SeriesSearchResult {
  results: SeriesMetadata[];
  total: number;
  hasMore: boolean;
}

// =============================================================================
// Issue Metadata
// =============================================================================

export interface IssueMetadata {
  source: MetadataSource;
  sourceId: string;
  seriesId: string;
  seriesName: string;
  number: string;
  title?: string;
  coverDate?: string;
  storeDate?: string;
  description?: string;
  coverUrl?: string;
  url?: string;
  publisher?: string;

  // Credits
  writer?: string;
  penciller?: string;
  inker?: string;
  colorist?: string;
  letterer?: string;
  coverArtist?: string;
  editor?: string;

  // Content
  characters?: string[];
  teams?: string[];
  locations?: string[];
  storyArc?: string;
}

export interface IssueListResult {
  results: IssueMetadata[];
  total: number;
  hasMore: boolean;
}

// =============================================================================
// Merged Metadata (with provenance tracking)
// =============================================================================

export interface MergedSeriesMetadata extends SeriesMetadata {
  /** Which source provided each field */
  fieldSources: Record<string, MetadataSource>;
  /** All sources that contributed data */
  contributingSources: MetadataSource[];
}

export interface MergedIssueMetadata extends IssueMetadata {
  /** Which source provided each field */
  fieldSources: Record<string, MetadataSource>;
  /** All sources that contributed data */
  contributingSources: MetadataSource[];
}

// =============================================================================
// All-Values Merged Metadata (for per-field source selection UI)
// =============================================================================

/**
 * Extended merged series metadata that tracks ALL values from ALL sources
 * for each field, enabling per-field source selection in the UI.
 */
export interface AllValuesSeriesMetadata extends MergedSeriesMetadata {
  /** All values from all sources for each field */
  allFieldValues: Record<string, Record<MetadataSource, unknown>>;
  /** User-selected source overrides per field (optional) */
  fieldSourceOverrides?: Record<string, MetadataSource>;
}

/**
 * Extended merged issue metadata that tracks ALL values from ALL sources.
 */
export interface AllValuesIssueMetadata extends MergedIssueMetadata {
  /** All values from all sources for each field */
  allFieldValues: Record<string, Record<MetadataSource, unknown>>;
  /** User-selected source overrides per field (optional) */
  fieldSourceOverrides?: Record<string, MetadataSource>;
}

// =============================================================================
// Cross-Source Matching Types
// =============================================================================

/**
 * Match factors used to calculate confidence score.
 */
export interface CrossMatchFactors {
  /** Title similarity score (0-1) */
  titleSimilarity: number;
  /** Whether publishers match (normalized comparison) */
  publisherMatch: boolean;
  /** Year match status */
  yearMatch: 'exact' | 'close' | 'none';
  /** Whether issue counts are within tolerance */
  issueCountMatch: boolean;
  /** List of creators that overlap between sources */
  creatorOverlap: string[];
  /** Whether any aliases matched */
  aliasMatch: boolean;
}

/**
 * A match from a secondary source for a primary series.
 */
export interface CrossSourceMatch {
  /** The secondary source */
  source: MetadataSource;
  /** The source ID in the secondary source */
  sourceId: string;
  /** Full series metadata from the secondary source */
  seriesData: SeriesMetadata;
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Breakdown of match factors */
  matchFactors: CrossMatchFactors;
  /** Whether this match exceeds the auto-match threshold */
  isAutoMatchCandidate: boolean;
}

/**
 * Result of cross-source matching for a series.
 */
export interface CrossSourceResult {
  /** The primary source that was searched */
  primarySource: MetadataSource;
  /** The primary source ID */
  primarySourceId: string;
  /** Matches from all secondary sources */
  matches: CrossSourceMatch[];
  /** Status of each source's matching attempt */
  status: Record<MetadataSource, 'matched' | 'no_match' | 'searching' | 'error' | 'skipped'>;
}

/**
 * Options for cross-source matching.
 */
export interface CrossMatchOptions {
  /** Confidence threshold for auto-matching (default: 0.95) */
  autoMatchThreshold?: number;
  /** Sources to search (default: all enabled except primary) */
  targetSources?: MetadataSource[];
  /** Session ID for tracking */
  sessionId?: string;
}

/**
 * Issue-level cross-source match.
 */
export interface IssueMatchFactors {
  /** Issue number match (normalized) */
  numberMatch: boolean;
  /** Cover date similarity */
  coverDateMatch: 'exact' | 'close' | 'none';
  /** Title similarity (for titled issues) */
  titleSimilarity: number;
  /** Page count within tolerance */
  pageCountMatch: boolean;
}

export interface IssueCrossMatch {
  /** The secondary source */
  source: MetadataSource;
  /** The issue in the secondary source */
  issue: IssueMetadata;
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Match factors */
  matchFactors: IssueMatchFactors;
  /** Whether this is a variant cover */
  isVariant?: boolean;
  /** Variant type if applicable */
  variantType?: 'cover' | 'edition' | 'printing';
}

// =============================================================================
// Provider Interface
// =============================================================================

export interface MetadataProvider {
  /** Unique identifier for this source */
  readonly name: MetadataSource;

  /** Human-readable display name */
  readonly displayName: string;

  /**
   * Check if this provider is available and configured
   */
  checkAvailability(): Promise<AvailabilityResult>;

  /**
   * Search for series matching the query
   */
  searchSeries(query: SearchQuery, options?: SearchOptions): Promise<SeriesSearchResult>;

  /**
   * Get full series metadata by source ID
   */
  getSeriesById(sourceId: string, sessionId?: string): Promise<SeriesMetadata | null>;

  /**
   * Get all issues for a series
   */
  getSeriesIssues(sourceId: string, options?: PaginationOptions): Promise<IssueListResult>;

  /**
   * Get full issue metadata by source ID
   */
  getIssueById(sourceId: string, sessionId?: string): Promise<IssueMetadata | null>;
}

// =============================================================================
// Full Data Search Types
// =============================================================================

export interface FullDataSearchOptions {
  query: SearchQuery;
  sources?: MetadataSource[];
  sessionId?: string;
  limit?: number;
}

export interface MultiSourceSearchResult {
  /** Results from each source */
  sourceResults: Map<MetadataSource, SeriesMetadata[]>;
  /** Best match merged across all sources (if any matches found) */
  merged: MergedSeriesMetadata | null;
  /** Search metadata */
  sources: {
    [key in MetadataSource]?: {
      searched: boolean;
      available: boolean;
      resultCount: number;
      error?: string;
    };
  };
}

export interface ExpandResultOptions {
  sourceId: string;
  currentSource: MetadataSource;
  additionalSources: MetadataSource[];
  sessionId?: string;
}
