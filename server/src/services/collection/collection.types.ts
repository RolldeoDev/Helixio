/**
 * Collection Types
 *
 * Shared type definitions for the collection service modules.
 */

// Re-export types from smart-collection.service for convenience
export type { SmartFilter, SortField, SortOrder } from '../smart-collection.service.js';

// =============================================================================
// Core Types
// =============================================================================

/**
 * Cover type for collection covers
 */
export type CoverType = 'auto' | 'series' | 'issue' | 'custom';

/**
 * Helper to cast cover type from database string
 */
export function castCoverType(coverType: string | null): CoverType | undefined {
  if (!coverType) return undefined;
  if (['auto', 'series', 'issue', 'custom'].includes(coverType)) {
    return coverType as CoverType;
  }
  return undefined;
}

/**
 * System collection definitions
 */
export const SYSTEM_COLLECTIONS = [
  {
    systemKey: 'favorites',
    name: 'Favorites',
    sortOrder: 0,
  },
  {
    systemKey: 'want-to-read',
    name: 'Want to Read',
    sortOrder: 1,
  },
] as const;

// =============================================================================
// Collection Interfaces
// =============================================================================

export interface Collection {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  deck: string | null;
  isSystem: boolean;
  systemKey: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  itemCount?: number;
  // Lock flags
  lockName: boolean;
  lockDeck: boolean;
  lockDescription: boolean;
  lockPublisher: boolean;
  lockStartYear: boolean;
  lockEndYear: boolean;
  lockGenres: boolean;
  // User metadata
  rating: number | null;
  notes: string | null;
  visibility: string;
  readingMode: string | null; // DEPRECATED: Use readerPresetId
  readerPresetId: string | null; // Link to reader preset
  tags: string | null;
  // Promotion fields
  isPromoted?: boolean;
  promotedOrder?: number | null;
  // Cover customization
  coverType?: CoverType;
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
  // Smart collection fields
  isSmart?: boolean;
  smartScope?: string | null;
  filterDefinition?: string | null;
  lastEvaluatedAt?: Date | null;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  seriesId: string | null;
  fileId: string | null;
  position: number;
  addedAt: Date;
  notes: string | null;
  isAvailable: boolean; // False if referenced file/series has been deleted
  // Populated fields when fetching with relations
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
// Input Types
// =============================================================================

export interface CreateCollectionInput {
  name: string;
  description?: string;
  deck?: string;
  rating?: number;
  notes?: string;
  visibility?: string;
  readingMode?: string;
  tags?: string;
}

export interface UpdateCollectionInput {
  name?: string;
  description?: string;
  deck?: string;
  sortOrder?: number;
  // Override metadata
  overridePublisher?: string | null;
  overrideStartYear?: number | null;
  overrideEndYear?: number | null;
  overrideGenres?: string | null;
  // Lock toggles
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
  visibility?: string;
  readingMode?: string | null; // DEPRECATED: Use readerPresetId
  readerPresetId?: string | null; // Link to reader preset
  tags?: string | null;
}

export interface AddItemInput {
  seriesId?: string;
  fileId?: string;
  notes?: string;
}

export interface RemoveItemInput {
  seriesId?: string;
  fileId?: string;
}

// =============================================================================
// Promoted Collection Types
// =============================================================================

export interface PromotedCollectionWithMeta {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isPromoted: boolean;
  promotedOrder: number | null;
  // Cover info
  coverType: string;
  coverSeriesId: string | null;
  coverFileId: string | null;
  coverHash: string | null;
  // Derived/override metadata
  publisher: string | null;
  startYear: number | null;
  endYear: number | null;
  genres: string | null;
  // Aggregate reading progress
  totalIssues: number;
  readIssues: number;
  // Series info for mosaic cover
  seriesCovers: Array<{
    id: string;
    coverHash: string | null;
    coverUrl: string | null;
    coverFileId: string | null;
    name: string;
    firstIssueId: string | null;
    firstIssueCoverHash: string | null;
  }>;
  seriesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Filter options for promoted collections in grid view.
 */
export interface PromotedCollectionGridFilters {
  search?: string;
  publisher?: string;
  type?: 'western' | 'manga';
  genres?: string[];
  hasUnread?: boolean;
  libraryId?: string;
}

/**
 * Collection data for grid display.
 * Extended version with library info and content timestamps.
 */
export interface PromotedCollectionForGrid {
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
    firstIssueId: string | null;
    firstIssueCoverHash: string | null;
  }>;
  // For library filtering
  libraryIds: string[];
  // For "Recently Updated" sort
  contentUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Expanded Collection Types (Detail Page)
// =============================================================================

/**
 * Issue data for collection detail page
 */
export interface ExpandedIssue {
  id: string;
  filename: string;
  relativePath: string;
  size: number;
  seriesId: string;
  seriesName: string;
  collectionPosition: number;
  createdAt: string;
  metadata: {
    number: string | null;
    title: string | null;
    writer: string | null;
    year: number | null;
    publisher: string | null;
  } | null;
  readingProgress: {
    currentPage: number;
    totalPages: number;
    completed: boolean;
    lastReadAt: string | null;
    rating: number | null;
  } | null;
  externalRating: number | null;
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
  expandedIssues: ExpandedIssue[];
  aggregateStats: CollectionAggregateStats;
  nextIssue: CollectionNextIssue | null;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Helper to get the most common value in an array.
 */
export function getMostCommon<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;

  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  let maxCount = 0;
  let mostCommon: T | null = null;
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = item;
    }
  }

  return mostCommon;
}
