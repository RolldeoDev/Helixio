/**
 * Series Types
 *
 * Shared type definitions for series-related services.
 */

import type { Series, SeriesProgress } from '@prisma/client';

// Re-export merge types for convenience
export type {
  DuplicateConfidence,
  DuplicateReason,
  DuplicateGroup,
  SeriesForMerge,
  MergePreview,
  MergeResult,
} from '../../types/series-merge.types.js';

// =============================================================================
// Core Series Types
// =============================================================================

export interface SeriesWithCounts extends Series {
  _count?: {
    issues: number;
  };
  progress?: SeriesProgress[] | SeriesProgress | null;
  issues?: Array<{ id: string }>; // First issue for cover fallback
}

export interface SeriesListOptions {
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'startYear' | 'updatedAt' | 'createdAt' | 'issueCount';
  sortOrder?: 'asc' | 'desc';
  search?: string;
  publisher?: string;
  type?: 'western' | 'manga';
  genres?: string[];
  hasUnread?: boolean;
  libraryId?: string;
  userId?: string; // Filter progress to this user
  includeHidden?: boolean; // If true, include hidden series (default: false)
}

export interface SeriesListResult {
  series: SeriesWithCounts[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateSeriesInput {
  name: string;
  startYear?: number | null;
  publisher?: string | null;
  summary?: string | null;
  deck?: string | null;
  endYear?: number | null;
  volume?: number | null;
  issueCount?: number | null;
  genres?: string | null;
  tags?: string | null;
  ageRating?: string | null;
  type?: string;
  languageISO?: string | null;
  characters?: string | null;
  teams?: string | null;
  locations?: string | null;
  storyArcs?: string | null;
  coverUrl?: string | null;
  comicVineId?: string | null;
  metronId?: string | null;
  anilistId?: string | null;
  malId?: string | null;
  gcdId?: string | null;
  primaryFolder?: string | null;
}

export interface UpdateSeriesInput extends Partial<CreateSeriesInput> {
  coverSource?: string;
  coverFileId?: string | null;
  userNotes?: string | null;
  aliases?: string | null;
  customReadingOrder?: string | null;
  lockedFields?: string | null;
  fieldSources?: string | null;
  // Creator fields
  writer?: string | null;
  penciller?: string | null;
  inker?: string | null;
  colorist?: string | null;
  letterer?: string | null;
  coverArtist?: string | null;
  editor?: string | null;
  creatorsJson?: string | null;
  creatorSource?: 'api' | 'issues';
}

export interface FieldSource {
  source: 'manual' | 'api' | 'file';
  lockedAt?: string;
}

export type FieldSourceMap = Record<string, FieldSource>;

export interface SeriesCoverResult {
  type: 'api' | 'user' | 'firstIssue' | 'none';
  coverHash?: string;  // Hash for API-downloaded cover (local cache)
  fileId?: string;     // File ID for user-selected or first issue cover
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
    id: string;
    coverHash: string | null;
    coverUrl: string | null;
    coverFileId: string | null;
    name: string;
    firstIssueId?: string | null;
    firstIssueCoverHash?: string | null;
  }>;
  // For library filtering
  libraryIds: string[];
  // For "Recently Updated" sort
  contentUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Discriminated union for grid items.
 * The `itemType` field determines whether this is a series or collection.
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
  updatedAt: Date;
  createdAt: Date;
  series: SeriesWithCounts;
}

export interface CollectionGridItem {
  itemType: 'collection';
  id: string;
  name: string;
  startYear: number | null;
  publisher: string | null;
  genres: string | null;
  issueCount: number;
  readCount: number;
  updatedAt: Date;
  createdAt: Date;
  collection: PromotedCollectionGridItem;
}

export type GridItem = SeriesGridItem | CollectionGridItem;

export interface UnifiedGridOptions extends SeriesListOptions {
  includePromotedCollections?: boolean;
}

export interface UnifiedGridResult {
  items: GridItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// =============================================================================
// Bulk Operations Types
// =============================================================================

export interface BulkSeriesUpdateInput {
  publisher?: string | null;
  type?: 'western' | 'manga';
  genres?: string | null;
  tags?: string | null;
  ageRating?: string | null;
  languageISO?: string | null;
}

export interface BulkOperationResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{ seriesId: string; success: boolean; error?: string }>;
}

// =============================================================================
// Browse Types (Cursor-based Pagination)
// =============================================================================

/**
 * Options for cursor-based series browsing.
 * Optimized for infinite scroll with large datasets (5000+ series).
 */
export interface SeriesBrowseOptions {
  /** Base64-encoded cursor for pagination (format: sortValue|id) */
  cursor?: string;
  /** Number of items per page (default 100, max 200) */
  limit?: number;
  /** Sort field */
  sortBy?: 'name' | 'startYear' | 'updatedAt' | 'issueCount';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Filter to series with issues in this library */
  libraryId?: string;
  /** User ID for reading progress data */
  userId?: string;
  /** Search filter (case-insensitive contains match on name) */
  search?: string;
  /** Filter by publisher */
  publisher?: string;
  /** Filter by series type */
  type?: 'western' | 'manga';
  /** Filter by genres (OR logic - matches if any genre matches) */
  genres?: string[];
  /** Filter by read status (requires userId) */
  readStatus?: 'unread' | 'reading' | 'completed';
}

/**
 * Minimal series data for browse grid.
 * Only includes fields needed for card display.
 */
export interface SeriesBrowseItem {
  id: string;
  name: string;
  startYear: number | null;
  publisher: string | null;
  coverHash: string | null;
  coverSource: string;
  coverFileId: string | null;
  firstIssueId: string | null;
  firstIssueCoverHash: string | null;
  issueCount: number;
  readCount: number;
}

/**
 * Result from cursor-based browse query.
 */
export interface SeriesBrowseResult {
  items: SeriesBrowseItem[];
  /** Cursor for next page, null if no more pages */
  nextCursor: string | null;
  /** Whether there are more items after this page */
  hasMore: boolean;
  /** Total count (only provided on first page, -1 otherwise) */
  totalCount: number;
}
