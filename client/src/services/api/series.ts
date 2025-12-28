/**
 * API Series Module
 *
 * Series management, collections, stats, achievements, and related operations.
 */

import { API_BASE, get, post, patch, del, put, handleResponse } from './shared';
import type { ComicFile } from './shared';
import type { MetadataSource, SeriesMatch } from './metadata';

// Re-export for convenience
export type { MetadataSource } from './metadata';

// =============================================================================
// Series Types
// =============================================================================

export interface Series {
  id: string;
  name: string;
  startYear: number | null;
  publisher: string | null;
  summary: string | null;
  deck: string | null;
  endYear: number | null;
  volume: number | null;
  issueCount: number | null;
  genres: string | null;
  tags: string | null;
  ageRating: string | null;
  type: 'western' | 'manga';
  languageISO: string | null;
  characters: string | null;
  teams: string | null;
  locations: string | null;
  storyArcs: string | null;
  creators: string | null;
  // Role-specific creators
  writer: string | null;
  penciller: string | null;
  inker: string | null;
  colorist: string | null;
  letterer: string | null;
  coverArtist: string | null;
  editor: string | null;
  // Structured creator data (JSON: { writer: ["Name"], penciller: ["Name"], ... })
  creatorsJson: string | null;
  // Creator display source preference: "api" = API data, "issues" = local issue metadata
  creatorSource: 'api' | 'issues';
  coverSource: 'api' | 'user' | 'auto';
  coverUrl: string | null;
  coverHash: string | null;
  coverFileId: string | null;
  primaryFolder: string | null;
  userNotes: string | null;
  aliases: string | null;
  customReadingOrder: string | null;
  lockedFields: string | null;
  comicVineId: string | null;
  metronId: string | null;
  anilistId: string | null;
  malId: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  isHidden: boolean;
  _count?: { issues: number };
  progress?: SeriesProgress | null;
  // First issue for cover fallback (User > API > First Issue)
  // Includes coverHash for cache-busting when issue cover changes
  issues?: Array<{ id: string; coverHash: string | null }>;
}

export interface SeriesProgress {
  id: string;
  seriesId: string;
  totalOwned: number;
  totalRead: number;
  totalInProgress: number;
  lastReadFileId: string | null;
  lastReadIssueNum: number | null;
  lastReadAt: string | null;
  nextUnreadFileId: string | null;
}

export interface SeriesListOptions {
  page?: number;
  limit?: number;
  all?: boolean; // When true, fetch all items without pagination
  sortBy?: 'name' | 'startYear' | 'updatedAt' | 'createdAt' | 'issueCount';
  sortOrder?: 'asc' | 'desc';
  search?: string;
  publisher?: string;
  type?: 'western' | 'manga';
  genres?: string[];
  hasUnread?: boolean;
  libraryId?: string;
  includeHidden?: boolean; // When true, include hidden series in results
}

export interface SeriesListResult {
  series: Series[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface SeriesCover {
  type: 'api' | 'user' | 'firstIssue' | 'none';
  coverHash?: string; // Hash for API-downloaded cover (local cache)
  fileId?: string; // File ID for user-selected or first issue cover
}

export interface SeriesIssue extends ComicFile {
  readingProgress?: {
    currentPage: number;
    totalPages: number;
    completed: boolean;
    lastReadAt: string | null;
  };
}

// =============================================================================
// Unified Grid Types (Series + Promoted Collections)
// =============================================================================

/**
 * Collection data for grid display.
 * Includes derived/override metadata and aggregated reading progress.
 */
export interface PromotedCollectionGridItem {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isPromoted: boolean;
  promotedOrder: number | null;
  coverType: string;
  coverSeriesId: string | null;
  coverFileId: string | null;
  coverHash: string | null;
  // Effective metadata (override ?? derived ?? default)
  publisher: string | null;
  startYear: number | null;
  endYear: number | null;
  genres: string | null;
  // Aggregated counts
  totalIssues: number;
  readIssues: number;
  seriesCount: number;
  // For mosaic cover
  seriesCovers: Array<{
    seriesId: string;
    coverHash: string | null;
    coverUrl: string | null;
    coverFileId: string | null;
    name: string;
  }>;
  // For library filtering
  libraryIds: string[];
  // For "Recently Updated" sort
  contentUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Series item in the unified grid.
 */
export interface SeriesGridItem {
  itemType: 'series';
  id: string;
  name: string;
  startYear: number | null;
  publisher: string | null;
  genres: string | null;
  issueCount: number;
  readCount: number;
  updatedAt: string;
  createdAt: string;
  series: Series;
}

/**
 * Collection item in the unified grid.
 */
export interface CollectionGridItem {
  itemType: 'collection';
  id: string;
  name: string;
  startYear: number | null;
  publisher: string | null;
  genres: string | null;
  issueCount: number;
  readCount: number;
  updatedAt: string;
  createdAt: string;
  collection: PromotedCollectionGridItem;
}

/**
 * Discriminated union for grid items.
 * The `itemType` field determines whether this is a series or collection.
 */
export type GridItem = SeriesGridItem | CollectionGridItem;

/**
 * Options for fetching unified grid items.
 */
export interface UnifiedGridOptions extends SeriesListOptions {
  includePromotedCollections?: boolean;
}

/**
 * Result of the unified grid query.
 */
export interface UnifiedGridResult {
  items: GridItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// =============================================================================
// Global Search Types
// =============================================================================

/**
 * Global search result item
 */
export interface GlobalSearchResult {
  id: string;
  type: 'series' | 'issue' | 'creator' | 'collection';
  title: string;
  subtitle: string;
  thumbnailId: string | null;
  thumbnailType: 'file' | 'series' | 'custom' | 'collection' | 'none';
  navigationPath: string;
  relevanceScore: number;
  metadata: {
    publisher?: string | null;
    year?: number | null;
    issueNumber?: string | null;
    role?: string | null;
    seriesCount?: number;
    totalIssues?: number;
    readIssues?: number;
  };
}

/**
 * Global search response
 */
export interface GlobalSearchResponse {
  results: GlobalSearchResult[];
  query: string;
  timing: number;
}

// =============================================================================
// Series Field Locking
// =============================================================================

export interface FieldSource {
  source: 'manual' | 'api' | 'file';
  lockedAt?: string;
}

/** Response from aggregateSeriesCreators */
export interface AggregateCreatorsResponse {
  message: string;
  creatorsWithRoles: {
    writer: string[];
    penciller: string[];
    inker: string[];
    colorist: string[];
    letterer: string[];
    coverArtist: string[];
    editor: string[];
  };
}

/**
 * Response type for creators aggregated from local issue metadata
 */
export interface CreatorsFromIssuesResult {
  creatorsWithRoles: {
    writer: string[];
    penciller: string[];
    inker: string[];
    colorist: string[];
    letterer: string[];
    coverArtist: string[];
    editor: string[];
  };
  coverage: {
    issuesWithCreators: number;
    totalIssues: number;
  };
  source: 'issues';
}

// =============================================================================
// Series External Metadata Types
// =============================================================================

/**
 * Metadata payload from external APIs
 */
export interface SeriesMetadataPayload {
  seriesName?: string;
  publisher?: string;
  startYear?: number;
  endYear?: number;
  issueCount?: number;
  description?: string;
  deck?: string;
  coverUrl?: string;
  seriesType?: string;
  comicVineSeriesId?: string;
  metronSeriesId?: string;
  characters?: string[];
  locations?: string[];
  storyArcs?: string[];
  creators?: string[];
  aliases?: string[];
  genres?: string[];
}

/**
 * Preview field for metadata comparison
 */
export interface MetadataPreviewField {
  field: string;
  label: string;
  currentValue: string | null;
  apiValue: string | null;
  isLocked: boolean;
  diff: 'same' | 'diff' | 'new' | 'removed';
}

/**
 * Preview result for metadata changes
 */
export interface MetadataPreviewResult {
  source: MetadataSource;
  externalId: string;
  fields: MetadataPreviewField[];
  lockedFields: string[];
}

/** Pagination metadata for series search results */
export interface SearchPagination {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// =============================================================================
// Series Merge & Duplicate Detection Types
// =============================================================================

export type DuplicateConfidence = 'high' | 'medium' | 'low';

export type DuplicateReason =
  | 'same_name'
  | 'similar_name'
  | 'same_comicvine_id'
  | 'same_metron_id'
  | 'same_publisher_similar_name';

/**
 * Series data optimized for merge operations
 */
export interface SeriesForMerge {
  id: string;
  name: string;
  publisher: string | null;
  startYear: number | null;
  endYear: number | null;
  issueCount: number | null;
  ownedIssueCount: number;
  comicVineId: string | null;
  metronId: string | null;
  coverUrl: string | null;
  coverHash: string | null;
  coverFileId: string | null;
  aliases: string | null;
  summary: string | null;
  type: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Duplicate group with confidence scoring
 */
export interface DuplicateGroup {
  id: string;
  series: SeriesForMerge[];
  confidence: DuplicateConfidence;
  reasons: DuplicateReason[];
  primaryReason: DuplicateReason;
}

/**
 * Merge preview response
 */
export interface MergePreview {
  targetSeries: SeriesForMerge;
  sourceSeries: SeriesForMerge[];
  resultingAliases: string[];
  totalIssuesAfterMerge: number;
  warnings: string[];
}

/**
 * Merge result
 */
export interface MergeResult {
  success: boolean;
  targetSeriesId: string;
  mergedSourceIds: string[];
  issuesMoved: number;
  aliasesAdded: string[];
  error?: string;
}

/**
 * Get potential duplicates response
 */
export interface DuplicatesResponse {
  duplicateGroups: DuplicateGroup[];
  totalGroups: number;
  byConfidence: {
    high: number;
    medium: number;
    low: number;
  };
}

// =============================================================================
// Full Data Mode (Multi-Source Search) Types
// =============================================================================

// Note: SearchMode is exported from metadata.ts

/**
 * Merged series metadata with provenance tracking
 */
export interface MergedSeriesMetadata extends SeriesMatch {
  /** Which source provided each field */
  fieldSources: Record<string, MetadataSource>;
  /** All sources that contributed data */
  contributingSources: MetadataSource[];
}

/**
 * Extended merged series metadata with all values from all sources.
 * Used for per-field source selection in the UI.
 */
export interface AllValuesSeriesMetadata extends MergedSeriesMetadata {
  /** All values from all sources for each field */
  allFieldValues: Record<string, Record<MetadataSource, unknown>>;
  /** User-selected source overrides per field */
  fieldSourceOverrides?: Record<string, MetadataSource>;
}

// =============================================================================
// Cross-Source Matching Types
// =============================================================================

/**
 * Match factors used to calculate confidence score.
 */
export interface CrossMatchFactors {
  titleSimilarity: number;
  publisherMatch: boolean;
  yearMatch: 'exact' | 'close' | 'none';
  issueCountMatch: boolean;
  creatorOverlap: string[];
  aliasMatch: boolean;
}

/**
 * A match from a secondary source for a primary series.
 */
export interface CrossSourceMatch {
  source: MetadataSource;
  sourceId: string;
  seriesData: SeriesMatch;
  confidence: number;
  matchFactors: CrossMatchFactors;
  isAutoMatchCandidate: boolean;
}

/**
 * Result of cross-source matching for a series.
 */
export interface CrossSourceResult {
  primarySource: MetadataSource;
  primarySourceId: string;
  matches: CrossSourceMatch[];
  status: Record<
    MetadataSource,
    'matched' | 'no_match' | 'searching' | 'error' | 'skipped'
  >;
}

/**
 * Result of a full data multi-source search
 */
export interface MultiSourceSearchResult {
  /** Results from each source */
  sourceResults: Record<MetadataSource, SeriesMatch[]>;
  /** Best match merged across all sources */
  merged: MergedSeriesMetadata | null;
  /** Search metadata per source */
  sources: {
    [key in MetadataSource]?: {
      searched: boolean;
      available: boolean;
      resultCount: number;
      error?: string;
    };
  };
}

export interface SearchQuery {
  series?: string;
  issueNumber?: string;
  publisher?: string;
  year?: number;
  writer?: string;
}

/**
 * Cached cross-source mapping from database
 */
export interface CrossSourceMapping {
  id: string;
  primarySource: string;
  primarySourceId: string;
  matchedSource: string;
  matchedSourceId: string;
  confidence: number;
  matchMethod: 'auto' | 'user' | 'api_link';
  verified: boolean;
  matchFactors?: CrossMatchFactors;
  createdAt: string;
  updatedAt: string;
}

/** Result from expanding a series with all sources */
export interface ExpandedSeriesResultWithSources {
  merged: MergedSeriesMetadata;
  sourceResults: Record<MetadataSource, SeriesMatch | null>;
}

// =============================================================================
// Stats Types
// =============================================================================

export type EntityType =
  | 'creator'
  | 'genre'
  | 'character'
  | 'team'
  | 'publisher';

export interface AggregatedStats {
  totalFiles: number;
  totalSeries: number;
  totalPages: number;
  filesRead: number;
  filesInProgress: number;
  filesUnread: number;
  pagesRead: number;
  readingTime: number;
  currentStreak?: number;
  longestStreak?: number;
  filesWithMetadata?: number;
}

export interface EntityStatResult {
  entityType: string;
  entityName: string;
  entityRole: string | null;
  ownedComics: number;
  ownedSeries: number;
  ownedPages: number;
  readComics: number;
  readPages: number;
  readTime: number;
  readPercentage: number;
}

export interface EntityComic {
  fileId: string;
  filename: string;
  seriesName: string | null;
  number: string | null;
  isRead: boolean;
  readingTime: number;
  lastReadAt: string | null;
}

export interface RelatedEntity {
  entityName: string;
  entityRole: string | null;
  sharedComics: number;
}

export interface RelatedSeries {
  seriesId: string;
  seriesName: string;
  ownedCount: number;
  readCount: number;
}

export interface EntityDetails {
  entityType: string;
  entityName: string;
  entityRole: string | null;
  ownedComics: number;
  ownedSeries: number;
  ownedPages: number;
  readComics: number;
  readPages: number;
  readTime: number;
  comics: EntityComic[];
  relatedCreators: RelatedEntity[];
  relatedCharacters: RelatedEntity[];
  relatedSeries: RelatedSeries[];
}

export interface StatsSummary extends AggregatedStats {
  topCreators: EntityStatResult[];
  topGenres: EntityStatResult[];
  topCharacters: EntityStatResult[];
  topPublishers: EntityStatResult[];
}

export interface SchedulerStatus {
  isRunning: boolean;
  isProcessing: boolean;
  lastHourlyRun: string | null;
  lastWeeklyRun: string | null;
  pendingDirtyFlags: number;
}

// =============================================================================
// Achievements Types
// =============================================================================

export interface AchievementWithProgress {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  stars: number;
  iconName: string;
  threshold: number | null;
  minRequired: number | null;
  progress: number;
  unlockedAt: string | null;
  isUnlocked: boolean;
}

export interface AchievementSummary {
  totalAchievements: number;
  unlockedCount: number;
  totalStars: number;
  earnedStars: number;
  categoryCounts: Record<string, { total: number; unlocked: number }>;
  recentUnlocks: AchievementWithProgress[];
}

export interface AchievementCategory {
  key: string;
  name: string;
  icon: string;
  description: string;
  total: number;
  unlocked: number;
}

// =============================================================================
// LLM Description Generation Types
// =============================================================================

/**
 * LLM description generation status
 */
export interface DescriptionGenerationStatus {
  available: boolean;
  model: string | null;
}

/**
 * Generated description result for series
 */
export interface GeneratedSeriesDescription {
  description: string;
  deck?: string;
  tokensUsed?: number;
}

/**
 * Generated summary result for issues
 */
export interface GeneratedIssueSummary {
  summary: string;
  tokensUsed?: number;
}

/**
 * Collection description generation status
 */
export interface CollectionDescriptionGenerationStatus {
  available: boolean;
  model: string | null;
}

/**
 * Generated collection description result
 */
export interface GeneratedCollectionDescription {
  description: string;
  deck: string;
  tokensUsed?: number;
}

/**
 * Generated metadata field with confidence score
 */
export interface GeneratedMetadataField {
  value: string | number | null;
  confidence: number;
}

/**
 * Full generated metadata for a series
 */
export interface GeneratedSeriesMetadata {
  summary: GeneratedMetadataField;
  deck: GeneratedMetadataField;
  ageRating: GeneratedMetadataField;
  genres: GeneratedMetadataField;
  tags: GeneratedMetadataField;
  startYear: GeneratedMetadataField;
  endYear: GeneratedMetadataField;
}

/**
 * Result from metadata generation
 */
export interface GenerateMetadataResult {
  metadata: GeneratedSeriesMetadata;
  webSearchUsed: boolean;
  tokensUsed?: number;
}

// =============================================================================
// Tag Autocomplete Types
// =============================================================================

/**
 * Tag field types for autocomplete
 */
export type TagFieldType =
  | 'characters'
  | 'teams'
  | 'locations'
  | 'genres'
  | 'tags'
  | 'storyArcs'
  | 'creators'
  | 'publishers'
  | 'writers'
  | 'pencillers'
  | 'inkers'
  | 'colorists'
  | 'letterers'
  | 'coverArtists'
  | 'editors';

/**
 * Result from tag autocomplete search
 */
export interface TagAutocompleteResult {
  values: string[];
  hasMore: boolean;
  field: TagFieldType;
  query: string;
  limit: number;
  offset: number;
}

// =============================================================================
// Collections Types
// =============================================================================

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  deck: string | null;
  isSystem: boolean;
  systemKey: 'favorites' | 'want-to-read' | null;
  sortOrder: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  // Promotion fields
  isPromoted?: boolean;
  promotedOrder?: number | null;
  // Cover customization
  coverType?: 'auto' | 'series' | 'issue' | 'custom';
  coverSeriesId?: string | null;
  coverFileId?: string | null;
  coverHash?: string | null;
  // Derived metadata
  derivedPublisher?: string | null;
  derivedStartYear?: number | null;
  derivedEndYear?: number | null;
  derivedGenres?: string | null;
  derivedTags?: string | null;
  derivedIssueCount?: number | null;
  derivedReadCount?: number | null;
  // Override metadata
  overridePublisher?: string | null;
  overrideStartYear?: number | null;
  overrideEndYear?: number | null;
  overrideGenres?: string | null;
  // Lock flags
  lockName?: boolean;
  lockDeck?: boolean;
  lockDescription?: boolean;
  lockPublisher?: boolean;
  lockStartYear?: boolean;
  lockEndYear?: boolean;
  lockGenres?: boolean;
  // New fields
  rating?: number | null;
  notes?: string | null;
  visibility?: 'public' | 'private' | 'unlisted';
  readingMode?: 'single' | 'double' | 'webtoon' | null;
  tags?: string | null;
  // Smart collection fields
  isSmart?: boolean;
  smartScope?: 'series' | 'files' | null;
  filterDefinition?: string | null; // JSON string of SmartFilter
  lastEvaluatedAt?: string | null;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  seriesId: string | null;
  fileId: string | null;
  position: number;
  addedAt: string;
  notes: string | null;
  // Smart collection flags
  isWhitelisted?: boolean;
  isBlacklisted?: boolean;
  series?: {
    id: string;
    name: string;
    coverHash: string | null;
    coverFileId: string | null;
    firstIssueId: string | null;
    /** First issue's coverHash for cache-busting when issue cover changes */
    firstIssueCoverHash?: string | null;
    startYear: number | null;
    publisher: string | null;
  };
  file?: {
    id: string;
    filename: string;
    relativePath: string;
    coverHash: string | null;
    seriesId: string | null;
  };
}

export interface CollectionWithItems extends Collection {
  items: CollectionItem[];
}

// =============================================================================
// Bulk Operations Types
// =============================================================================

export interface BulkOperationResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{ seriesId: string; success: boolean; error?: string }>;
}

export interface BulkSeriesUpdateInput {
  publisher?: string | null;
  type?: 'western' | 'manga';
  genres?: string | null;
  tags?: string | null;
  ageRating?: string | null;
  languageISO?: string | null;
}

// =============================================================================
// Library Scan Jobs Types
// =============================================================================

export type ScanJobStatus =
  | 'queued'
  | 'discovering'
  | 'cleaning'
  | 'indexing'
  | 'linking'
  | 'covers'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface ScanJobLogEntry {
  id: string;
  stage: string;
  message: string;
  detail?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
}

export interface LibraryScanJob {
  id: string;
  libraryId: string;
  status: ScanJobStatus;
  currentStage: string;
  currentMessage: string | null;
  currentDetail: string | null;

  // Progress counters
  discoveredFiles: number;
  orphanedFiles: number;
  indexedFiles: number;
  linkedFiles: number;
  seriesCreated: number;
  coversExtracted: number;
  totalFiles: number;

  // Error tracking
  error: string | null;
  errorCount: number;

  // Timing
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Logs organized by stage
  logs: Record<string, ScanJobLogEntry[]>;
}

export interface ScanQueueStatus {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  queuedAt: string;
  startedAt?: string;
}

// =============================================================================
// Issue Metadata Grabber Types
// =============================================================================

export interface IssueMatch {
  id: string;
  source: MetadataSource;
  issueNumber: string;
  title?: string;
  coverDate?: string;
  coverUrl?: string;
  volumeName?: string;
  volumeId?: string;
  confidence: number;
}

export interface IssueMetadata {
  series?: string;
  number?: string;
  title?: string;
  volume?: number;
  alternateSeries?: string;
  alternateNumber?: string;
  alternateCount?: number;
  summary?: string;
  year?: number;
  month?: number;
  day?: number;
  writer?: string;
  penciller?: string;
  inker?: string;
  colorist?: string;
  letterer?: string;
  coverArtist?: string;
  editor?: string;
  characters?: string;
  teams?: string;
  locations?: string;
  storyArc?: string;
  publisher?: string;
  count?: number;
  pageCount?: number;
  format?: string;
  languageISO?: string;
  ageRating?: string;
  coverUrl?: string;
  sourceId?: string;
  source?: MetadataSource;
}

export interface PreviewField {
  name: string;
  label: string;
  current: string | null;
  proposed: string | null;
  selected: boolean;
  isLocked: boolean;
  hasChanged: boolean;
}

export interface IssueSearchResult {
  results: IssueMatch[];
  usedCache: boolean;
  source: MetadataSource;
}

export interface IssueApplyResult {
  success: boolean;
  converted?: boolean;
  newPath?: string;
  operationId?: string;
  error?: string;
}

// =============================================================================
// Series Relationships Types
// =============================================================================

export type RelationshipType =
  | 'related'
  | 'spinoff'
  | 'prequel'
  | 'sequel'
  | 'bonus';

export interface SeriesRelationship {
  id: string;
  parentSeriesId: string;
  childSeriesId: string;
  relationshipType: RelationshipType;
  sortOrder: number;
  createdAt: string;
}

export interface RelatedSeriesInfo {
  id: string;
  name: string;
  publisher: string | null;
  startYear: number | null;
  coverHash: string | null;
  coverUrl: string | null;
  coverFileId: string | null;
  coverSource: string;
  /** First issue ID for cover fallback */
  firstIssueId?: string | null;
  /** First issue coverHash for cache-busting when issue cover changes */
  firstIssueCoverHash?: string | null;
  relationshipType: RelationshipType;
  sortOrder: number;
  _count?: { issues: number };
}

export interface SeriesRelationshipsResult {
  parents: RelatedSeriesInfo[];
  children: RelatedSeriesInfo[];
}

// =============================================================================
// Promoted Collections Types
// =============================================================================

export interface SeriesCoverForMosaic {
  id: string;
  name: string;
  coverHash: string | null;
  coverFileId: string | null;
  firstIssueId: string | null;
  coverSource: 'api' | 'user' | 'auto';
}

export interface PromotedCollection {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isPromoted: boolean;
  coverType: 'auto' | 'series' | 'issue' | 'custom';
  coverSeriesId: string | null;
  coverFileId: string | null;
  coverHash: string | null;
  derivedPublisher: string | null;
  derivedStartYear: number | null;
  derivedEndYear: number | null;
  derivedGenres: string | null;
  derivedIssueCount: number | null;
  derivedReadCount: number | null;
  overridePublisher: string | null;
  overrideStartYear: number | null;
  overrideEndYear: number | null;
  overrideGenres: string | null;
  totalIssues: number;
  readIssues: number;
  seriesCovers: SeriesCoverForMosaic[];
}

/**
 * Expanded issue data for collection detail page
 */
export interface CollectionExpandedIssue {
  id: string;
  filename: string;
  relativePath: string;
  size: number;
  seriesId: string;
  seriesName: string;
  collectionPosition: number;
  metadata: {
    number: string | null;
    title: string | null;
    writer: string | null;
  } | null;
  readingProgress: {
    currentPage: number;
    totalPages: number;
    completed: boolean;
    lastReadAt: string | null;
  } | null;
}

/**
 * Aggregate stats for collection
 */
export interface CollectionAggregateStats {
  totalIssues: number;
  readIssues: number;
  inProgressIssues: number;
  totalPages: number;
  pagesRead: number;
  seriesCount: number;
}

/**
 * Next issue info for continue reading
 */
export interface CollectionNextIssue {
  fileId: string;
  filename: string;
  seriesId: string;
  seriesName: string;
}

/**
 * Full expanded collection response
 */
export interface CollectionExpandedData {
  collection: CollectionWithItems;
  expandedIssues: CollectionExpandedIssue[];
  aggregateStats: CollectionAggregateStats;
  nextIssue: CollectionNextIssue | null;
}

// =============================================================================
// Series Operations
// =============================================================================

/**
 * Get paginated list of series
 */
export async function getSeriesList(
  options: SeriesListOptions = {}
): Promise<SeriesListResult> {
  const params = new URLSearchParams();
  if (options.all) params.set('all', 'true');
  if (options.page) params.set('page', options.page.toString());
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);
  if (options.search) params.set('search', options.search);
  if (options.publisher) params.set('publisher', options.publisher);
  if (options.type) params.set('type', options.type);
  if (options.genres) params.set('genres', options.genres.join(','));
  if (options.hasUnread !== undefined)
    params.set('hasUnread', options.hasUnread.toString());
  if (options.libraryId) params.set('libraryId', options.libraryId);
  if (options.includeHidden) params.set('includeHidden', 'true');
  return get<SeriesListResult>(`/series?${params}`);
}

/**
 * Get unified grid items (series + promoted collections).
 * Requires authentication. Collections are mixed with series based on sort criteria.
 */
export async function getUnifiedGridItems(
  options: UnifiedGridOptions = {}
): Promise<UnifiedGridResult> {
  const params = new URLSearchParams();
  if (options.all) params.set('all', 'true');
  if (options.page) params.set('page', options.page.toString());
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);
  if (options.search) params.set('search', options.search);
  if (options.publisher) params.set('publisher', options.publisher);
  if (options.type) params.set('type', options.type);
  if (options.genres) params.set('genres', options.genres.join(','));
  if (options.hasUnread !== undefined)
    params.set('hasUnread', options.hasUnread.toString());
  if (options.libraryId) params.set('libraryId', options.libraryId);
  if (options.includePromotedCollections !== undefined) {
    params.set(
      'includePromotedCollections',
      options.includePromotedCollections.toString()
    );
  }
  if (options.includeHidden) params.set('includeHidden', 'true');
  return get<UnifiedGridResult>(`/series/grid?${params}`);
}

/**
 * Search series (for autocomplete)
 */
export async function searchSeries(
  query: string,
  limit = 10
): Promise<{ series: Series[] }> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', limit.toString());
  return get<{ series: Series[] }>(`/series/search?${params}`);
}

/**
 * Unified global search across series, issues, and creators
 */
export async function globalSearch(
  query: string,
  limit = 6
): Promise<GlobalSearchResponse> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', limit.toString());
  return get<GlobalSearchResponse>(`/search/global?${params}`);
}

/**
 * Get a single series by ID
 */
export async function getSeries(seriesId: string): Promise<{ series: Series }> {
  return get<{ series: Series }>(`/series/${seriesId}`);
}

/**
 * Get issues in a series
 */
export async function getSeriesIssues(
  seriesId: string,
  options: {
    page?: number;
    limit?: number;
    all?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{
  issues: SeriesIssue[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> {
  const params = new URLSearchParams();
  if (options.all) params.set('all', 'true');
  if (options.page) params.set('page', options.page.toString());
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);
  return get<{
    issues: SeriesIssue[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(`/series/${seriesId}/issues?${params}`);
}

/**
 * Get series cover
 */
export async function getSeriesCover(
  seriesId: string
): Promise<{ cover: SeriesCover }> {
  return get<{ cover: SeriesCover }>(`/series/${seriesId}/cover`);
}

/**
 * Get next unread issue (Continue Series)
 */
export async function getNextSeriesIssue(
  seriesId: string
): Promise<{ nextIssue: ComicFile | null; message?: string }> {
  return get<{ nextIssue: ComicFile | null; message?: string }>(
    `/series/${seriesId}/next-issue`
  );
}

/**
 * Get creators aggregated from local issue metadata
 * This fetches creator data from FileMetadata (ComicInfo.xml) rather than external APIs
 */
export async function getSeriesCreatorsFromIssues(
  seriesId: string
): Promise<CreatorsFromIssuesResult> {
  return get<CreatorsFromIssuesResult>(
    `/series/${seriesId}/creators-from-issues`
  );
}

/**
 * Update a series
 */
export async function updateSeries(
  seriesId: string,
  data: Partial<Series>
): Promise<{ series: Series }> {
  return patch<{ series: Series }>(`/series/${seriesId}`, data);
}

/**
 * Get all publishers for filtering
 */
export async function getSeriesPublishers(): Promise<{ publishers: string[] }> {
  return get<{ publishers: string[] }>('/series/publishers');
}

/**
 * Get all genres for filtering
 */
export async function getSeriesGenres(): Promise<{ genres: string[] }> {
  return get<{ genres: string[] }>('/series/genres');
}

/**
 * Get series cover URL for display
 * Returns the URL to fetch the cover image
 */
export function getSeriesCoverUrl(seriesId: string): string {
  return `${API_BASE}/series/${seriesId}/cover-image`;
}

// =============================================================================
// Series Field Locking
// =============================================================================

/**
 * Get field sources for a series
 */
export async function getFieldSources(
  seriesId: string
): Promise<{ fieldSources: Record<string, FieldSource> }> {
  return get<{ fieldSources: Record<string, FieldSource> }>(
    `/series/${seriesId}/field-sources`
  );
}

/**
 * Lock a field to prevent auto-updates
 */
export async function lockField(
  seriesId: string,
  fieldName: string
): Promise<void> {
  await post(`/series/${seriesId}/lock-field`, { fieldName });
}

/**
 * Unlock a field to allow auto-updates
 */
export async function unlockField(
  seriesId: string,
  fieldName: string
): Promise<void> {
  await del(
    `/series/${seriesId}/lock-field?fieldName=${encodeURIComponent(fieldName)}`
  );
}

/**
 * Aggregate creator roles from issue-level ComicVine data
 * Requires the series to be linked to ComicVine
 */
export async function aggregateSeriesCreators(
  seriesId: string
): Promise<AggregateCreatorsResponse> {
  return post<AggregateCreatorsResponse>(
    `/series/${seriesId}/aggregate-creators`,
    {}
  );
}

/**
 * Set series cover
 */
export async function setSeriesCover(
  seriesId: string,
  options: { source?: 'api' | 'user' | 'auto'; fileId?: string; url?: string }
): Promise<{ cover: SeriesCover }> {
  return post<{ cover: SeriesCover }>(`/series/${seriesId}/cover`, options);
}

/**
 * Upload a custom cover image for a series
 */
export async function uploadSeriesCover(
  seriesId: string,
  file: File
): Promise<{ cover: SeriesCover; coverHash: string }> {
  const formData = new FormData();
  formData.append('cover', file);

  const response = await fetch(`${API_BASE}/series/${seriesId}/cover/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || error.message || 'Failed to upload cover');
  }

  const data = await response.json();
  return data.data;
}

// =============================================================================
// Series External Metadata Fetch
// =============================================================================

/**
 * Fetch metadata for a series using stored external ID
 * If no external ID exists, returns needsSearch: true
 */
export async function fetchSeriesMetadata(seriesId: string): Promise<{
  metadata?: SeriesMetadataPayload;
  source?: MetadataSource;
  externalId?: string;
  needsSearch?: boolean;
  message?: string;
}> {
  return post(`/series/${seriesId}/fetch-metadata`);
}

/**
 * Fetch metadata for a specific external ID
 * Used after user selects a series from search results
 */
export async function fetchSeriesMetadataByExternalId(
  seriesId: string,
  source: MetadataSource,
  externalId: string
): Promise<{
  metadata?: SeriesMetadataPayload;
  source?: MetadataSource;
  externalId?: string;
}> {
  return post(`/series/${seriesId}/fetch-metadata-by-id`, { source, externalId });
}

/**
 * Preview metadata changes before applying
 * Returns field-by-field comparison with diff indicators
 */
export async function previewSeriesMetadata(
  seriesId: string,
  metadata: SeriesMetadataPayload,
  source: MetadataSource,
  externalId: string
): Promise<{ preview: MetadataPreviewResult }> {
  return post(`/series/${seriesId}/preview-metadata`, {
    metadata,
    source,
    externalId,
  });
}

/**
 * Apply selected metadata fields to a series
 */
export async function applySeriesMetadata(
  seriesId: string,
  options: {
    metadata: SeriesMetadataPayload;
    source: MetadataSource;
    externalId: string | null;
    fields: string[];
  }
): Promise<{
  series: Series;
  fieldsUpdated: string[];
}> {
  return post(`/series/${seriesId}/apply-metadata`, options);
}

/**
 * Unlink a series from an external metadata source
 */
export async function unlinkSeriesExternalId(
  seriesId: string,
  source: MetadataSource
): Promise<{ message: string }> {
  return del(`/series/${seriesId}/external-link?source=${source}`);
}

/**
 * Search external APIs for series
 * @param query - Search query string
 * @param limit - Maximum number of results
 * @param source - Optional source to limit search to a specific provider
 * @param offset - Offset for pagination (default: 0)
 * @param libraryType - Optional library type to prioritize sources (manga prioritizes AniList/MAL)
 */
export async function searchExternalSeries(
  query: string,
  limit = 10,
  source?: MetadataSource,
  offset = 0,
  libraryType?: 'western' | 'manga'
): Promise<{
  series: SeriesMatch[];
  sources: MetadataSource[];
  pagination?: SearchPagination;
}> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());
  if (source) {
    params.set('source', source);
  }
  if (libraryType) {
    params.set('libraryType', libraryType);
  }
  return get(`/series/search-external?${params}`);
}

// =============================================================================
// ComicVine Theme Scraping
// =============================================================================

/**
 * Scrape themes from a ComicVine volume page
 *
 * Since ComicVine's API doesn't expose themes, we use a backend proxy
 * to fetch the HTML page and parse it (avoids CORS issues).
 *
 * @param siteDetailUrl - Full URL to ComicVine volume page (e.g., https://comicvine.gamespot.com/american-vampire/4050-32051/)
 * @returns Array of theme names, or empty array if scraping fails
 */
export async function scrapeComicVineThemes(
  siteDetailUrl: string
): Promise<string[]> {
  if (!siteDetailUrl || !siteDetailUrl.includes('comicvine.gamespot.com')) {
    return [];
  }

  try {
    // Use backend proxy to avoid CORS and Cloudflare issues
    const params = new URLSearchParams();
    params.set('url', siteDetailUrl);

    const response = await get<{
      success: boolean;
      themes: string[];
      count?: number;
      message?: string;
      error?: string;
    }>(`/metadata/scrape-themes?${params}`);

    if (response.success && response.themes) {
      return response.themes;
    }

    if (response.message) {
      console.warn('Theme scraping issue:', response.message);
    }

    return [];
  } catch (err) {
    console.warn('Failed to scrape ComicVine themes:', err);
    return [];
  }
}

// =============================================================================
// Series Merge & Duplicate Detection
// =============================================================================

/**
 * Get potential duplicate series with confidence scoring
 */
export async function getPotentialDuplicates(
  minConfidence?: DuplicateConfidence
): Promise<DuplicatesResponse> {
  const params = new URLSearchParams();
  if (minConfidence) params.set('minConfidence', minConfidence);
  return get<DuplicatesResponse>(
    `/series/duplicates/enhanced${params.toString() ? `?${params}` : ''}`
  );
}

/**
 * Preview a merge operation
 */
export async function previewMergeSeries(
  sourceIds: string[],
  targetId: string
): Promise<{ preview: MergePreview }> {
  return post<{ preview: MergePreview }>('/series/merge/preview', {
    sourceIds,
    targetId,
  });
}

/**
 * Merge series - moves all issues from source series to target
 * and adds source series names as aliases to target
 */
export async function mergeSeries(
  sourceIds: string[],
  targetId: string
): Promise<{ result: MergeResult }> {
  return post<{ result: MergeResult }>('/series/admin/merge', {
    sourceIds,
    targetId,
  });
}

// =============================================================================
// Full Data Mode (Multi-Source Search)
// =============================================================================

/**
 * Search for series across all enabled metadata sources (Full Data mode)
 */
export async function searchSeriesFullData(
  query: SearchQuery,
  options: { sources?: MetadataSource[]; limit?: number } = {}
): Promise<MultiSourceSearchResult> {
  return post<MultiSourceSearchResult>('/metadata/search-full', {
    query,
    sources: options.sources,
    limit: options.limit || 10,
  });
}

/**
 * Expand a single series result by fetching from additional sources.
 * Returns both the merged result and per-source SeriesMatch objects.
 */
export async function expandSeriesResult(
  match: SeriesMatch,
  additionalSources?: MetadataSource[]
): Promise<ExpandedSeriesResultWithSources> {
  return post<ExpandedSeriesResultWithSources>('/metadata/expand-result', {
    match,
    additionalSources,
  });
}

/**
 * Get full series metadata merged from all sources
 */
export async function getSeriesMetadataFullData(
  source: MetadataSource,
  sourceId: string
): Promise<MergedSeriesMetadata> {
  return get<MergedSeriesMetadata>(
    `/metadata/series-full/${source}/${sourceId}`
  );
}

// =============================================================================
// Cross-Source Matching
// =============================================================================

/**
 * Find cross-source matches for a series.
 * Searches secondary sources and calculates confidence scores.
 */
export async function findCrossSourceMatches(
  source: MetadataSource,
  sourceId: string,
  options: {
    targetSources?: MetadataSource[];
    sessionId?: string;
    threshold?: number;
  } = {}
): Promise<CrossSourceResult> {
  return post<CrossSourceResult>('/metadata/cross-match', {
    source,
    sourceId,
    ...options,
  });
}

/**
 * Get cached cross-source mappings for a series.
 */
export async function getCrossSourceMappings(
  source: MetadataSource,
  sourceId: string
): Promise<{ mappings: CrossSourceMapping[] }> {
  return get<{ mappings: CrossSourceMapping[] }>(
    `/metadata/cross-matches/${source}/${sourceId}`
  );
}

/**
 * Save a user-confirmed cross-source match.
 */
export async function saveCrossSourceMapping(
  source: MetadataSource,
  sourceId: string,
  match: {
    matchedSource: MetadataSource;
    matchedSourceId: string;
    confidence: number;
    matchFactors?: CrossMatchFactors;
  }
): Promise<{ mapping: CrossSourceMapping }> {
  return put<{ mapping: CrossSourceMapping }>(
    `/metadata/cross-matches/${source}/${sourceId}`,
    match
  );
}

/**
 * Invalidate cached cross-source mappings for a series.
 */
export async function invalidateCrossSourceMappings(
  source: MetadataSource,
  sourceId: string
): Promise<{ deleted: number }> {
  return del<{ deleted: number }>(
    `/metadata/cross-matches/${source}/${sourceId}`
  );
}

/**
 * Get series metadata with all values from all sources for per-field selection.
 */
export async function getSeriesWithAllValues(
  source: MetadataSource,
  sourceId: string,
  options: {
    crossMatchSources?: MetadataSource[];
    sessionId?: string;
  } = {}
): Promise<AllValuesSeriesMetadata> {
  const params = new URLSearchParams();
  if (options.crossMatchSources) {
    params.set('sources', options.crossMatchSources.join(','));
  }
  if (options.sessionId) {
    params.set('sessionId', options.sessionId);
  }
  const query = params.toString();
  return get<AllValuesSeriesMetadata>(
    `/metadata/series-all-values/${source}/${sourceId}${query ? `?${query}` : ''}`
  );
}

// =============================================================================
// Stats API
// =============================================================================

/**
 * Get aggregated stats for user or specific library
 */
export async function getAggregatedStats(
  libraryId?: string
): Promise<AggregatedStats> {
  const params = libraryId ? `?libraryId=${libraryId}` : '';
  return get<AggregatedStats>(`/stats${params}`);
}

/**
 * Get stats summary with top entities for dashboard
 */
export async function getStatsSummary(
  libraryId?: string
): Promise<StatsSummary> {
  const params = libraryId ? `?libraryId=${libraryId}` : '';
  return get<StatsSummary>(`/stats/summary${params}`);
}

/**
 * Get entity stats list with pagination
 */
export async function getEntityStats(params: {
  entityType: EntityType;
  libraryId?: string;
  sortBy?: 'owned' | 'read' | 'time';
  limit?: number;
  offset?: number;
}): Promise<{ items: EntityStatResult[]; total: number }> {
  const queryParams = new URLSearchParams();
  if (params.libraryId) queryParams.set('libraryId', params.libraryId);
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.offset) queryParams.set('offset', params.offset.toString());

  const query = queryParams.toString();
  return get<{ items: EntityStatResult[]; total: number }>(
    `/stats/entities/${params.entityType}${query ? `?${query}` : ''}`
  );
}

/**
 * Get detailed stats for a specific entity
 */
export async function getEntityDetails(params: {
  entityType: EntityType;
  entityName: string;
  entityRole?: string;
  libraryId?: string;
}): Promise<EntityDetails> {
  const queryParams = new URLSearchParams();
  if (params.entityRole) queryParams.set('entityRole', params.entityRole);
  if (params.libraryId) queryParams.set('libraryId', params.libraryId);

  const query = queryParams.toString();
  const encodedName = encodeURIComponent(params.entityName);
  return get<EntityDetails>(
    `/stats/entities/${params.entityType}/${encodedName}${query ? `?${query}` : ''}`
  );
}

/**
 * Get just the stat record for a specific entity
 */
export async function getEntityStat(params: {
  entityType: EntityType;
  entityName: string;
  entityRole?: string;
  libraryId?: string;
}): Promise<EntityStatResult> {
  const queryParams = new URLSearchParams();
  if (params.entityRole) queryParams.set('entityRole', params.entityRole);
  if (params.libraryId) queryParams.set('libraryId', params.libraryId);

  const query = queryParams.toString();
  const encodedName = encodeURIComponent(params.entityName);
  return get<EntityStatResult>(
    `/stats/entities/${params.entityType}/${encodedName}/stat${query ? `?${query}` : ''}`
  );
}

/**
 * Trigger stats rebuild
 */
export async function triggerStatsRebuild(
  scope: 'dirty' | 'full' = 'dirty'
): Promise<{
  success: boolean;
  message: string;
  processed?: number;
}> {
  return post<{ success: boolean; message: string; processed?: number }>(
    '/stats/rebuild',
    { scope }
  );
}

/**
 * Get stats scheduler status
 */
export async function getSchedulerStatus(): Promise<SchedulerStatus> {
  return get<SchedulerStatus>('/stats/scheduler');
}

// =============================================================================
// Achievements API
// =============================================================================

/**
 * Get all achievements with user progress
 */
export async function getAchievements(): Promise<AchievementWithProgress[]> {
  return get<AchievementWithProgress[]>('/achievements');
}

/**
 * Get achievement summary statistics
 */
export async function getAchievementSummary(): Promise<AchievementSummary> {
  return get<AchievementSummary>('/achievements/summary');
}

/**
 * Get all achievement categories with counts
 */
export async function getAchievementCategories(): Promise<
  AchievementCategory[]
> {
  return get<AchievementCategory[]>('/achievements/categories');
}

/**
 * Get achievements by category
 */
export async function getAchievementsByCategory(
  category: string
): Promise<AchievementWithProgress[]> {
  return get<AchievementWithProgress[]>(`/achievements/category/${category}`);
}

/**
 * Get unlocked achievements
 */
export async function getUnlockedAchievements(): Promise<
  AchievementWithProgress[]
> {
  return get<AchievementWithProgress[]>('/achievements/unlocked');
}

/**
 * Get recently unlocked achievements (for notifications)
 */
export async function getRecentAchievements(
  limit = 5
): Promise<AchievementWithProgress[]> {
  return get<AchievementWithProgress[]>(`/achievements/recent?limit=${limit}`);
}

/**
 * Mark achievements as notified
 */
export async function markAchievementsNotified(
  achievementIds: string[]
): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('/achievements/mark-notified', {
    achievementIds,
  });
}

/**
 * Seed achievements database with config data
 */
export async function seedAchievements(
  achievements: Array<{
    key: string;
    name: string;
    description: string;
    category: string;
    stars: number;
    icon: string;
    threshold: number;
    minRequired?: number;
  }>
): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>('/achievements/seed', {
    achievements,
  });
}

// =============================================================================
// LLM Description Generation
// =============================================================================

/**
 * Check if LLM description generation is available
 */
export async function getDescriptionGenerationStatus(): Promise<DescriptionGenerationStatus> {
  return get<DescriptionGenerationStatus>('/description/status');
}

/**
 * Generate a description for a series using LLM
 */
export async function generateSeriesDescription(
  seriesId: string,
  options?: { useWebSearch?: boolean }
): Promise<GeneratedSeriesDescription> {
  return post<GeneratedSeriesDescription>(
    `/description/series/${seriesId}/generate-description`,
    options || {}
  );
}

/**
 * Generate a summary for an issue using LLM
 */
export async function generateIssueSummary(
  fileId: string,
  options?: { useWebSearch?: boolean }
): Promise<GeneratedIssueSummary> {
  return post<GeneratedIssueSummary>(
    `/description/files/${fileId}/generate-summary`,
    options || {}
  );
}

/**
 * Check if collection description generation is available
 */
export async function getCollectionDescriptionGenerationStatus(): Promise<CollectionDescriptionGenerationStatus> {
  return get<CollectionDescriptionGenerationStatus>(
    '/description/collection/status'
  );
}

/**
 * Generate description for a collection using LLM
 */
export async function generateCollectionDescription(
  collectionId: string
): Promise<GeneratedCollectionDescription> {
  return post<GeneratedCollectionDescription>(
    `/description/collection/${collectionId}/generate`,
    {}
  );
}

/**
 * Generate comprehensive metadata for a series using LLM
 */
export async function generateSeriesMetadata(
  seriesId: string,
  options?: { useWebSearch?: boolean }
): Promise<GenerateMetadataResult> {
  return post<GenerateMetadataResult>(
    `/description/series/${seriesId}/generate-metadata`,
    options || {}
  );
}

// =============================================================================
// Tag Autocomplete
// =============================================================================

/**
 * Search for tag autocomplete suggestions
 */
export async function getTagAutocomplete(
  field: TagFieldType,
  query: string,
  limit: number = 10,
  offset: number = 0
): Promise<TagAutocompleteResult> {
  const params = new URLSearchParams({
    field,
    q: query,
    limit: limit.toString(),
    offset: offset.toString(),
  });
  return get<TagAutocompleteResult>(`/tags/autocomplete?${params}`);
}

/**
 * Rebuild all tags from source data (admin operation)
 */
export async function rebuildTags(): Promise<{
  success: boolean;
  totalValues: number;
  byFieldType: Partial<Record<TagFieldType, number>>;
  durationMs: number;
}> {
  return post<{
    success: boolean;
    totalValues: number;
    byFieldType: Partial<Record<TagFieldType, number>>;
    durationMs: number;
  }>('/tags/rebuild', {});
}

/**
 * Get tag statistics
 */
export async function getTagStats(): Promise<{
  totalValues: number;
  byFieldType: Record<string, number>;
}> {
  return get<{
    totalValues: number;
    byFieldType: Record<string, number>;
  }>('/tags/stats');
}

// =============================================================================
// Collections
// =============================================================================

/**
 * Get all collections
 */
export async function getCollections(): Promise<{ collections: Collection[] }> {
  return get<{ collections: Collection[] }>('/collections');
}

/**
 * Get a single collection with items
 */
export async function getCollection(id: string): Promise<CollectionWithItems> {
  return get<CollectionWithItems>(`/collections/${id}`);
}

/**
 * Get a system collection by key
 */
export async function getSystemCollection(
  systemKey: 'favorites' | 'want-to-read'
): Promise<Collection> {
  return get<Collection>(`/collections/system/${systemKey}`);
}

/**
 * Create a new collection
 */
export async function createCollection(
  name: string,
  description?: string,
  deck?: string,
  options?: {
    rating?: number;
    notes?: string;
    visibility?: 'public' | 'private' | 'unlisted';
    readingMode?: 'single' | 'double' | 'webtoon';
    tags?: string;
  }
): Promise<Collection> {
  return post<Collection>('/collections', {
    name,
    description,
    deck,
    ...options,
  });
}

/**
 * Update a collection
 */
export async function updateCollection(
  id: string,
  data: {
    name?: string;
    description?: string;
    deck?: string;
    sortOrder?: number;
    // Lock flags
    lockName?: boolean;
    lockDeck?: boolean;
    lockDescription?: boolean;
    lockPublisher?: boolean;
    lockStartYear?: boolean;
    lockEndYear?: boolean;
    lockGenres?: boolean;
    // Override metadata
    overridePublisher?: string | null;
    overrideStartYear?: number | null;
    overrideEndYear?: number | null;
    overrideGenres?: string | null;
    // New fields
    rating?: number | null;
    notes?: string | null;
    visibility?: 'public' | 'private' | 'unlisted';
    readingMode?: 'single' | 'double' | 'webtoon' | null;
    tags?: string | null;
  }
): Promise<Collection> {
  return put<Collection>(`/collections/${id}`, data);
}

/**
 * Delete a collection
 */
export async function deleteCollection(
  id: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/collections/${id}`);
}

/**
 * Add items to a collection
 */
export async function addToCollection(
  collectionId: string,
  items: Array<{ seriesId?: string; fileId?: string; notes?: string }>
): Promise<{ added: number; items: CollectionItem[] }> {
  return post<{ added: number; items: CollectionItem[] }>(
    `/collections/${collectionId}/items`,
    { items }
  );
}

/**
 * Remove items from a collection
 */
export async function removeFromCollection(
  collectionId: string,
  items: Array<{ seriesId?: string; fileId?: string }>
): Promise<{ removed: number }> {
  const response = await fetch(
    `${API_BASE}/collections/${collectionId}/items`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }
  );
  return handleResponse<{ removed: number }>(response);
}

/**
 * Reorder items within a collection
 */
export async function reorderCollectionItems(
  collectionId: string,
  itemIds: string[]
): Promise<{ success: boolean }> {
  return put<{ success: boolean }>(
    `/collections/${collectionId}/items/reorder`,
    { itemIds }
  );
}

/**
 * Get all collections containing a specific series or file
 *
 * @param options.includeSeriesFiles - When true and seriesId is provided, also finds
 *   collections containing individual files from that series
 */
export async function getCollectionsForItem(
  seriesId?: string,
  fileId?: string,
  options?: { includeSeriesFiles?: boolean }
): Promise<{ collections: Collection[] }> {
  const params = new URLSearchParams();
  if (seriesId) params.set('seriesId', seriesId);
  if (fileId) params.set('fileId', fileId);
  if (options?.includeSeriesFiles) params.set('includeSeriesFiles', 'true');
  return get<{ collections: Collection[] }>(`/collections/for-item?${params}`);
}

/**
 * Check if an item is in a collection
 */
export async function isInCollection(
  collectionId: string,
  seriesId?: string,
  fileId?: string
): Promise<{ inCollection: boolean }> {
  const params = new URLSearchParams();
  if (seriesId) params.set('seriesId', seriesId);
  if (fileId) params.set('fileId', fileId);
  return get<{ inCollection: boolean }>(
    `/collections/${collectionId}/check?${params}`
  );
}

/**
 * Toggle an item in the Favorites collection
 */
export async function toggleFavorite(
  seriesId?: string,
  fileId?: string
): Promise<{ added: boolean }> {
  return post<{ added: boolean }>('/collections/toggle-favorite', {
    seriesId,
    fileId,
  });
}

/**
 * Toggle an item in the Want to Read collection
 */
export async function toggleWantToRead(
  seriesId?: string,
  fileId?: string
): Promise<{ added: boolean }> {
  return post<{ added: boolean }>('/collections/toggle-want-to-read', {
    seriesId,
    fileId,
  });
}

// =============================================================================
// Bulk Series Operations
// =============================================================================

/**
 * Bulk add or remove series from Favorites
 */
export async function bulkToggleFavorite(
  seriesIds: string[],
  action: 'add' | 'remove'
): Promise<{
  updated: number;
  results: Array<{ seriesId: string; success: boolean; error?: string }>;
}> {
  return post<{
    updated: number;
    results: Array<{ seriesId: string; success: boolean; error?: string }>;
  }>('/collections/bulk-toggle-favorite', { seriesIds, action });
}

/**
 * Bulk add or remove series from Want to Read
 */
export async function bulkToggleWantToRead(
  seriesIds: string[],
  action: 'add' | 'remove'
): Promise<{
  updated: number;
  results: Array<{ seriesId: string; success: boolean; error?: string }>;
}> {
  return post<{
    updated: number;
    results: Array<{ seriesId: string; success: boolean; error?: string }>;
  }>('/collections/bulk-toggle-want-to-read', { seriesIds, action });
}

// =============================================================================
// Smart Collections
// =============================================================================

export interface SmartFilter {
  id: string;
  name?: string;
  rootOperator: 'AND' | 'OR';
  groups: SmartFilterGroup[];
}

export interface SmartFilterGroup {
  id: string;
  operator: 'AND' | 'OR';
  conditions: SmartFilterCondition[];
}

export interface SmartFilterCondition {
  id: string;
  field: string;
  comparison: string;
  value: string;
  value2?: string;
}

export type SmartScope = 'series' | 'files';

/**
 * Refresh a smart collection (full re-evaluation)
 */
export async function refreshSmartCollection(
  collectionId: string
): Promise<{ success: boolean; added: number; removed: number }> {
  return post<{ success: boolean; added: number; removed: number }>(
    `/collections/${collectionId}/smart/refresh`,
    {}
  );
}

/**
 * Update the smart filter for a collection
 */
export async function updateSmartFilter(
  collectionId: string,
  filter: SmartFilter,
  scope: SmartScope
): Promise<{ success: boolean }> {
  return put<{ success: boolean }>(
    `/collections/${collectionId}/smart/filter`,
    { filter, scope }
  );
}

/**
 * Convert a regular collection to a smart collection
 */
export async function convertToSmartCollection(
  collectionId: string,
  filter: SmartFilter,
  scope: SmartScope
): Promise<{ success: boolean; added: number; removed: number }> {
  return post<{ success: boolean; added: number; removed: number }>(
    `/collections/${collectionId}/smart/convert`,
    { filter, scope }
  );
}

/**
 * Convert a smart collection back to a regular collection
 */
export async function convertToRegularCollection(
  collectionId: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/collections/${collectionId}/smart`);
}

/**
 * Toggle whitelist status for an item in a smart collection
 */
export async function toggleSmartWhitelist(
  collectionId: string,
  seriesId?: string,
  fileId?: string
): Promise<{ success: boolean; isWhitelisted: boolean }> {
  return post<{ success: boolean; isWhitelisted: boolean }>(
    `/collections/${collectionId}/smart/whitelist`,
    { seriesId, fileId }
  );
}

/**
 * Toggle blacklist status for an item in a smart collection
 */
export async function toggleSmartBlacklist(
  collectionId: string,
  seriesId?: string,
  fileId?: string
): Promise<{ success: boolean; isBlacklisted: boolean }> {
  return post<{ success: boolean; isBlacklisted: boolean }>(
    `/collections/${collectionId}/smart/blacklist`,
    { seriesId, fileId }
  );
}

/**
 * Get whitelist and blacklist overrides for a smart collection
 */
export async function getSmartCollectionOverrides(
  collectionId: string
): Promise<{
  whitelist: Array<{ seriesId?: string; fileId?: string }>;
  blacklist: Array<{ seriesId?: string; fileId?: string }>;
}> {
  return get<{
    whitelist: Array<{ seriesId?: string; fileId?: string }>;
    blacklist: Array<{ seriesId?: string; fileId?: string }>;
  }>(`/collections/${collectionId}/smart/overrides`);
}

/**
 * Bulk update metadata across multiple series
 */
export async function bulkUpdateSeries(
  seriesIds: string[],
  updates: BulkSeriesUpdateInput
): Promise<BulkOperationResult> {
  return patch<BulkOperationResult>('/series/bulk', { seriesIds, updates });
}

/**
 * Mark all issues in the specified series as read
 */
export async function bulkMarkSeriesRead(
  seriesIds: string[]
): Promise<BulkOperationResult> {
  return post<BulkOperationResult>('/series/bulk-mark-read', { seriesIds });
}

/**
 * Mark all issues in the specified series as unread
 */
export async function bulkMarkSeriesUnread(
  seriesIds: string[]
): Promise<BulkOperationResult> {
  return post<BulkOperationResult>('/series/bulk-mark-unread', { seriesIds });
}

// =============================================================================
// Library Scan Jobs
// =============================================================================

/**
 * Start a full library scan
 */
export async function startLibraryScan(
  libraryId: string
): Promise<{ job: LibraryScanJob; message: string; existing: boolean }> {
  return post<{ job: LibraryScanJob; message: string; existing: boolean }>(
    `/libraries/${libraryId}/scan/full`,
    {}
  );
}

/**
 * Get scan job status
 */
export async function getScanJobStatus(
  libraryId: string,
  jobId: string
): Promise<{ job: LibraryScanJob; queueStatus: ScanQueueStatus | null }> {
  return get<{ job: LibraryScanJob; queueStatus: ScanQueueStatus | null }>(
    `/libraries/${libraryId}/scan/${jobId}`
  );
}

/**
 * Get active scan for a library
 */
export async function getActiveScanForLibrary(
  libraryId: string
): Promise<{ job: LibraryScanJob | null; hasActiveScan: boolean }> {
  return get<{ job: LibraryScanJob | null; hasActiveScan: boolean }>(
    `/libraries/${libraryId}/scan/active`
  );
}

/**
 * Get scan history for a library
 */
export async function getScanHistory(
  libraryId: string,
  limit?: number
): Promise<{ jobs: LibraryScanJob[] }> {
  const params = limit ? `?limit=${limit}` : '';
  return get<{ jobs: LibraryScanJob[] }>(
    `/libraries/${libraryId}/scan/history${params}`
  );
}

/**
 * Cancel a scan job
 */
export async function cancelScanJob(
  libraryId: string,
  jobId: string
): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>(
    `/libraries/${libraryId}/scan/${jobId}/cancel`,
    {}
  );
}

/**
 * Delete a scan job
 */
export async function deleteScanJob(
  libraryId: string,
  jobId: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE}/libraries/${libraryId}/scan/${jobId}`,
    {
      method: 'DELETE',
    }
  );
  return handleResponse<{ success: boolean; message: string }>(response);
}

/**
 * Get all active scans across all libraries
 */
export async function getAllActiveScans(): Promise<{ jobs: LibraryScanJob[] }> {
  return get<{ jobs: LibraryScanJob[] }>('/libraries/scans/active');
}

// =============================================================================
// Issue Metadata Grabber
// =============================================================================

/**
 * Search for issue metadata using existing file data and series context
 */
export async function searchIssueMetadata(
  fileId: string,
  options?: { query?: string; source?: MetadataSource }
): Promise<IssueSearchResult> {
  return post<IssueSearchResult>(
    `/files/${fileId}/issue-metadata/search`,
    options || {}
  );
}

/**
 * Fetch full metadata for a specific issue by source and ID
 */
export async function fetchIssueMetadataById(
  fileId: string,
  source: MetadataSource,
  issueId: string
): Promise<{ metadata: IssueMetadata }> {
  return post<{ metadata: IssueMetadata }>(
    `/files/${fileId}/issue-metadata/fetch`,
    {
      source,
      issueId,
    }
  );
}

/**
 * Generate a preview of metadata changes for an issue
 */
export async function previewIssueMetadata(
  fileId: string,
  metadata: IssueMetadata,
  source: MetadataSource,
  issueId: string
): Promise<{ fields: PreviewField[]; lockedFields: string[] }> {
  return post<{ fields: PreviewField[]; lockedFields: string[] }>(
    `/files/${fileId}/issue-metadata/preview`,
    { metadata, source, issueId }
  );
}

/**
 * Apply selected metadata changes to a file
 */
export async function applyIssueMetadata(
  fileId: string,
  metadata: IssueMetadata,
  source: MetadataSource,
  issueId: string,
  selectedFields: string[],
  coverAction?: 'keep' | 'download' | 'replace'
): Promise<IssueApplyResult> {
  return post<IssueApplyResult>(`/files/${fileId}/issue-metadata/apply`, {
    metadata,
    source,
    issueId,
    selectedFields,
    coverAction,
  });
}

// =============================================================================
// Series Relationships
// =============================================================================

/**
 * Get all parent/child relationships for a series
 */
export async function getSeriesRelationships(
  seriesId: string
): Promise<SeriesRelationshipsResult> {
  return get<SeriesRelationshipsResult>(`/series/${seriesId}/relationships`);
}

/**
 * Add a child series to a parent series
 */
export async function addChildSeries(
  parentSeriesId: string,
  childSeriesId: string,
  relationshipType: RelationshipType = 'related'
): Promise<SeriesRelationship> {
  return post<SeriesRelationship>(`/series/${parentSeriesId}/children`, {
    childSeriesId,
    relationshipType,
  });
}

/**
 * Bulk link multiple series as children to a single parent series
 */
export interface BulkLinkChild {
  seriesId: string;
  relationshipType: RelationshipType;
}

export async function bulkLinkSeries(
  targetSeriesId: string,
  children: BulkLinkChild[]
): Promise<BulkOperationResult> {
  return post<BulkOperationResult>('/series/bulk-link', {
    targetSeriesId,
    children,
  });
}

/**
 * Remove a child series from a parent series
 */
export async function removeChildSeries(
  parentSeriesId: string,
  childSeriesId: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(
    `/series/${parentSeriesId}/children/${childSeriesId}`
  );
}

/**
 * Reorder child series
 */
export async function reorderChildSeries(
  parentSeriesId: string,
  orderedChildIds: string[]
): Promise<{ success: boolean }> {
  return put<{ success: boolean }>(
    `/series/${parentSeriesId}/children/reorder`,
    {
      orderedChildIds,
    }
  );
}

/**
 * Update the relationship type between parent and child series
 */
export async function updateRelationshipType(
  parentSeriesId: string,
  childSeriesId: string,
  relationshipType: RelationshipType
): Promise<SeriesRelationship> {
  return patch<SeriesRelationship>(
    `/series/${parentSeriesId}/children/${childSeriesId}`,
    {
      relationshipType,
    }
  );
}

// =============================================================================
// Series Visibility (Hidden Flag)
// =============================================================================

/**
 * Set the hidden status of a series
 */
export async function setSeriesHidden(
  seriesId: string,
  hidden: boolean
): Promise<Series> {
  return patch<Series>(`/series/${seriesId}/hidden`, { hidden });
}

/**
 * Toggle the hidden status of a series
 */
export async function toggleSeriesHidden(seriesId: string): Promise<Series> {
  return patch<Series>(`/series/${seriesId}/hidden`, {});
}

/**
 * Get all hidden series
 */
export async function getHiddenSeries(): Promise<{
  series: RelatedSeriesInfo[];
}> {
  return get<{ series: RelatedSeriesInfo[] }>('/series/admin/hidden');
}

/**
 * Bulk set hidden status for multiple series
 */
export async function bulkSetSeriesHidden(
  seriesIds: string[],
  hidden: boolean
): Promise<BulkOperationResult> {
  return post<BulkOperationResult>('/series/bulk-set-hidden', {
    seriesIds,
    hidden,
  });
}

// =============================================================================
// Promoted Collections
// =============================================================================

/**
 * Get all promoted collections for the current user
 */
export async function getPromotedCollections(): Promise<{
  collections: PromotedCollection[];
}> {
  return get<{ collections: PromotedCollection[] }>('/collections/promoted');
}

/**
 * Toggle the promotion status of a collection
 */
export async function toggleCollectionPromotion(
  collectionId: string
): Promise<Collection> {
  return post<Collection>(`/collections/${collectionId}/promote`);
}

/**
 * Update the cover source for a collection
 */
export async function updateCollectionCover(
  collectionId: string,
  coverType: 'auto' | 'series' | 'issue' | 'custom',
  sourceId?: string
): Promise<Collection> {
  return put<Collection>(`/collections/${collectionId}/cover`, {
    coverType,
    sourceId,
  });
}

/**
 * Upload a custom cover image for a collection
 */
export async function uploadCollectionCover(
  collectionId: string,
  file: File
): Promise<{ collection: Collection; coverHash: string }> {
  const formData = new FormData();
  formData.append('cover', file);

  const response = await fetch(
    `${API_BASE}/collections/${collectionId}/cover/upload`,
    {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || error.message || 'Failed to upload cover');
  }

  const data = await response.json();
  return data;
}

/**
 * Set collection cover from a URL
 */
export async function setCollectionCoverFromUrl(
  collectionId: string,
  url: string
): Promise<{ collection: Collection; coverHash: string }> {
  const response = await fetch(
    `${API_BASE}/collections/${collectionId}/cover/url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
      credentials: 'include',
    }
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Failed to set cover from URL' }));
    throw new Error(
      error.error || error.message || 'Failed to set cover from URL'
    );
  }

  const data = await response.json();
  return data;
}

/**
 * Get aggregate reading progress for a collection
 */
export async function getCollectionProgress(
  collectionId: string
): Promise<{ totalIssues: number; readIssues: number }> {
  return get<{ totalIssues: number; readIssues: number }>(
    `/collections/${collectionId}/progress`
  );
}

/**
 * Get expanded collection data with all issues, stats, and next issue.
 * This is optimized for the collection detail page - fetches everything in one request.
 */
export async function getCollectionExpanded(
  collectionId: string
): Promise<CollectionExpandedData> {
  return get<CollectionExpandedData>(`/collections/${collectionId}/expanded`);
}

/**
 * Update collection metadata overrides
 */
export async function updateCollectionMetadata(
  collectionId: string,
  metadata: {
    overridePublisher?: string | null;
    overrideStartYear?: number | null;
    overrideEndYear?: number | null;
    overrideGenres?: string | null;
  }
): Promise<Collection> {
  return put<Collection>(`/collections/${collectionId}/metadata`, metadata);
}
