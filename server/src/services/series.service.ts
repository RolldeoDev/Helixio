/**
 * Series Service
 *
 * Core service for Series entity CRUD operations and management.
 * Part of the Series-Centric Architecture.
 *
 * Design Principles (from SERIES_REWRITE.md):
 * - Series identity: Name + Publisher (unique constraint - year excluded to avoid splitting multi-year runs)
 * - ComicInfo.xml is source of truth for issue-to-series linkage
 * - Full metadata inheritance: Series data flows down to ComicInfo.xml
 * - User edits are sacred (User > API > File priority)
 * - Smart cover fallback: API > User selected > First issue
 */

import { getDatabase } from './database.service.js';
import type { Series, ComicFile, SeriesProgress, Prisma } from '@prisma/client';
import { refreshTagsFromSeries } from './tag-autocomplete.service.js';
import {
  SeriesMetadata,
  readSeriesJson,
  writeSeriesJson,
} from './series-metadata.service.js';
import type {
  DuplicateConfidence,
  DuplicateReason,
  DuplicateGroup,
  SeriesForMerge,
  MergePreview,
  MergeResult,
} from '../types/series-merge.types.js';

// =============================================================================
// Types
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
    seriesId: string;
    coverHash: string | null;
    coverUrl: string | null;
    coverFileId: string | null;
    name: string;
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
// CRUD Operations
// =============================================================================

/**
 * Create a new Series record.
 * Identity is based on name + publisher only (year excluded to avoid splitting multi-year runs).
 * Uses case-insensitive comparison for duplicate detection.
 * If a soft-deleted series with the same identity exists, it will be restored instead of creating a new one.
 */
export async function createSeries(input: CreateSeriesInput): Promise<Series> {
  const db = getDatabase();

  // Check for existing series with same identity (name + publisher, not year)
  // Use case-insensitive comparison
  const normalizedName = input.name.toLowerCase();
  const normalizedPublisher = input.publisher?.toLowerCase() ?? null;

  const allSeries = await db.series.findMany({
    where: {
      // Get both active and soft-deleted series to handle both cases
    },
  });

  const existing = allSeries.find((s) => {
    const nameMatch = s.name.toLowerCase() === normalizedName;
    const publisherMatch = (s.publisher?.toLowerCase() ?? null) === normalizedPublisher;
    return nameMatch && publisherMatch;
  });

  if (existing) {
    // If the existing series is soft-deleted, restore it instead of throwing error
    if (existing.deletedAt) {
      const restored = await db.series.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          // Update with any new data from input
          startYear: input.startYear ?? existing.startYear,
          summary: input.summary ?? existing.summary,
          deck: input.deck ?? existing.deck,
          endYear: input.endYear ?? existing.endYear,
          volume: input.volume ?? existing.volume,
          issueCount: input.issueCount ?? existing.issueCount,
          genres: input.genres ?? existing.genres,
          tags: input.tags ?? existing.tags,
          ageRating: input.ageRating ?? existing.ageRating,
          type: input.type ?? existing.type,
          languageISO: input.languageISO ?? existing.languageISO,
          characters: input.characters ?? existing.characters,
          teams: input.teams ?? existing.teams,
          locations: input.locations ?? existing.locations,
          storyArcs: input.storyArcs ?? existing.storyArcs,
          coverUrl: input.coverUrl ?? existing.coverUrl,
          comicVineId: input.comicVineId ?? existing.comicVineId,
          metronId: input.metronId ?? existing.metronId,
          primaryFolder: input.primaryFolder ?? existing.primaryFolder,
        },
      });

      // Restore collection items referencing this series
      await db.collectionItem.updateMany({
        where: { seriesId: existing.id },
        data: { isAvailable: true },
      });

      return restored;
    }

    throw new Error(
      `Series "${input.name}" (${input.publisher ?? 'unknown publisher'}) already exists`
    );
  }

  return db.series.create({
    data: {
      name: input.name,
      startYear: input.startYear ?? null,
      publisher: input.publisher ?? null,
      summary: input.summary ?? null,
      deck: input.deck ?? null,
      endYear: input.endYear ?? null,
      volume: input.volume ?? null,
      issueCount: input.issueCount ?? null,
      genres: input.genres ?? null,
      tags: input.tags ?? null,
      ageRating: input.ageRating ?? null,
      type: input.type ?? 'western',
      languageISO: input.languageISO ?? null,
      characters: input.characters ?? null,
      teams: input.teams ?? null,
      locations: input.locations ?? null,
      storyArcs: input.storyArcs ?? null,
      coverUrl: input.coverUrl ?? null,
      comicVineId: input.comicVineId ?? null,
      metronId: input.metronId ?? null,
      primaryFolder: input.primaryFolder ?? null,
    },
  });
}

/**
 * Get a Series by ID with issue count and progress.
 * Excludes soft-deleted series by default.
 * If userId is provided, filters progress to only that user's progress.
 */
export async function getSeries(
  seriesId: string,
  options: { includeDeleted?: boolean; userId?: string } = {}
): Promise<SeriesWithCounts | null> {
  const { includeDeleted = false, userId } = options;
  const db = getDatabase();

  // Build progress include - filter by userId if provided
  const progressInclude = userId ? { where: { userId } } : true;

  const series = await db.series.findUnique({
    where: { id: seriesId },
    include: {
      _count: {
        select: { issues: true },
      },
      progress: progressInclude,
    },
  });

  // Filter out soft-deleted unless explicitly requested
  if (series && series.deletedAt && !includeDeleted) {
    return null;
  }

  return series;
}

/**
 * Get a Series by its unique identity (name + publisher only).
 * Year is not part of the identity to avoid splitting multi-year runs.
 * Uses case-insensitive comparison for both name and publisher.
 * Excludes soft-deleted series by default.
 */
export async function getSeriesByIdentity(
  name: string,
  _startYear: number | null | undefined, // Kept for API compatibility, but not used in lookup
  publisher: string | null | undefined,
  includeDeleted = false
): Promise<Series | null> {
  const db = getDatabase();

  // Use case-insensitive search with mode: 'insensitive' for SQLite compatibility
  // For SQLite, we use a raw query approach with LOWER() function
  const results = await db.series.findMany({
    where: {
      deletedAt: includeDeleted ? undefined : null,
    },
  });

  // Filter in JS using case-insensitive comparison
  const normalizedName = name.toLowerCase();
  const normalizedPublisher = publisher?.toLowerCase() ?? null;

  return results.find((s) => {
    const seriesNameMatch = s.name.toLowerCase() === normalizedName;
    const seriesPublisherMatch =
      (s.publisher?.toLowerCase() ?? null) === normalizedPublisher;
    return seriesNameMatch && seriesPublisherMatch;
  }) ?? null;
}

/**
 * Get paginated list of Series with filtering and sorting.
 */
export async function getSeriesList(
  options: SeriesListOptions = {}
): Promise<SeriesListResult> {
  const db = getDatabase();
  const {
    page = 1,
    limit,
    sortBy = 'name',
    sortOrder = 'asc',
    search,
    publisher,
    type,
    genres,
    hasUnread,
    libraryId,
    userId,
    includeHidden = false,
  } = options;

  // Use limit if provided, otherwise default to 50 (unless explicitly undefined for fetch all)
  const effectiveLimit = limit === undefined ? undefined : (limit || 50);
  const fetchAll = effectiveLimit === undefined;

  // Build where clause - exclude soft-deleted and hidden by default
  const where: Prisma.SeriesWhereInput = {
    deletedAt: null,
    ...(includeHidden ? {} : { isHidden: false }),
  };

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { aliases: { contains: search } },
    ];
  }

  if (publisher) {
    where.publisher = publisher;
  }

  if (type) {
    where.type = type;
  }

  if (genres && genres.length > 0) {
    where.AND = genres.map((genre) => ({
      genres: { contains: genre },
    }));
  }

  // Filter by library - only include series that have at least one issue in this library
  if (libraryId) {
    where.issues = {
      some: {
        libraryId,
      },
    };
  }

  // Build orderBy
  const orderBy: Prisma.SeriesOrderByWithRelationInput = {};
  if (sortBy === 'issueCount') {
    orderBy.issues = { _count: sortOrder };
  } else {
    orderBy[sortBy] = sortOrder;
  }

  // Get total count
  const total = await db.series.count({ where });

  // Get series (all or paginated)
  // If userId provided, filter progress to just that user
  const progressWhere = userId ? { userId } : undefined;
  let seriesRecords = await db.series.findMany({
    where,
    orderBy,
    ...(fetchAll ? {} : { skip: (page - 1) * effectiveLimit!, take: effectiveLimit! }),
    include: {
      _count: {
        select: { issues: true },
      },
      progress: progressWhere ? { where: progressWhere } : true,
      // Include candidate issues for cover fallback - we need to sort them properly
      // since Prisma's string ordering doesn't handle numeric sorting correctly
      // (e.g., "10" < "2" in string sort). Fetch 10 candidates and sort in JS.
      issues: {
        take: 10,
        orderBy: [
          { filename: 'asc' },
        ],
        select: { id: true, filename: true, metadata: { select: { number: true } } },
      },
    },
  });

  // Helper to parse issue number for proper numeric sorting (same logic as routes/series.routes.ts)
  const parseIssueNumber = (numberStr: string | null | undefined): { numericValue: number; hasNumber: boolean } => {
    if (!numberStr) return { numericValue: Infinity, hasNumber: false };
    const directParse = parseFloat(numberStr);
    if (!isNaN(directParse)) return { numericValue: directParse, hasNumber: true };
    const match = numberStr.match(/(\d+(?:\.\d+)?)/);
    if (match && match[1]) return { numericValue: parseFloat(match[1]), hasNumber: true };
    return { numericValue: Infinity, hasNumber: false };
  };

  // Post-process to find the true first issue using numeric sorting
  // We use a separate variable to avoid TypeScript issues with the narrowed type
  const processedRecords = seriesRecords.map((series) => {
    if (!series.issues || series.issues.length === 0) return series;

    // Sort issues by numeric issue number, then by filename
    const sortedIssues = [...series.issues].sort((a, b) => {
      const aNum = parseIssueNumber(a.metadata?.number);
      const bNum = parseIssueNumber(b.metadata?.number);

      // Both have numbers - sort numerically
      if (aNum.hasNumber && bNum.hasNumber) {
        return aNum.numericValue - bNum.numericValue;
      }
      // One has number, one doesn't - numbered issues come first
      if (aNum.hasNumber !== bNum.hasNumber) {
        return aNum.hasNumber ? -1 : 1;
      }
      // Neither has number - sort alphabetically by filename
      return a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Keep only the first issue (for cover fallback)
    const firstIssue = sortedIssues[0];
    return {
      ...series,
      issues: firstIssue ? [{ id: firstIssue.id }] : [],
    };
  });

  // Reassign with proper typing - the frontend only needs { id: string }[] for issues
  seriesRecords = processedRecords as typeof seriesRecords;

  // Helper to get progress stats (handles array or single object)
  const getProgressStats = (progress: SeriesProgress[] | SeriesProgress | null | undefined) => {
    if (!progress) return { totalOwned: 0, totalRead: 0 };
    if (Array.isArray(progress)) {
      // Get first (should only be one when filtered by userId)
      const p = progress[0];
      return p ? { totalOwned: p.totalOwned, totalRead: p.totalRead } : { totalOwned: 0, totalRead: 0 };
    }
    return { totalOwned: progress.totalOwned, totalRead: progress.totalRead };
  };

  // Filter by hasUnread if specified
  if (hasUnread !== undefined) {
    seriesRecords = seriesRecords.filter((series) => {
      const stats = getProgressStats(series.progress);
      const owned = stats.totalOwned || series._count?.issues || 0;
      const read = stats.totalRead || 0;
      const hasUnreadIssues = read < owned;
      return hasUnread ? hasUnreadIssues : !hasUnreadIssues;
    });
  }

  const returnLimit = fetchAll ? total : effectiveLimit!;
  return {
    series: seriesRecords,
    total,
    page: fetchAll ? 1 : page,
    limit: returnLimit,
    totalPages: fetchAll ? 1 : Math.ceil(total / effectiveLimit!),
  };
}

/**
 * Update a Series record.
 * Respects locked fields - will not update fields that are locked.
 */
export async function updateSeries(
  seriesId: string,
  input: UpdateSeriesInput,
  respectLocks = true
): Promise<Series> {
  const db = getDatabase();

  // Get current series to check locked fields
  const current = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!current) {
    throw new Error(`Series ${seriesId} not found`);
  }

  // Filter out locked fields if respecting locks
  let dataToUpdate = { ...input };
  if (respectLocks && current.lockedFields) {
    const lockedFields = current.lockedFields.split(',').map((f) => f.trim());
    for (const field of lockedFields) {
      delete dataToUpdate[field as keyof UpdateSeriesInput];
    }
  }

  // Update field sources if this is a manual edit
  if (Object.keys(dataToUpdate).length > 0) {
    const currentSources: FieldSourceMap = current.fieldSources
      ? JSON.parse(current.fieldSources)
      : {};

    for (const field of Object.keys(dataToUpdate)) {
      if (field !== 'fieldSources' && field !== 'lockedFields') {
        currentSources[field] = {
          source: 'manual',
          lockedAt: undefined,
        };
      }
    }

    dataToUpdate.fieldSources = JSON.stringify(currentSources);
  }

  const updated = await db.series.update({
    where: { id: seriesId },
    data: dataToUpdate as Prisma.SeriesUpdateInput,
  });

  // Extract tags for autocomplete after series is updated
  await refreshTagsFromSeries(seriesId);

  return updated;
}

/**
 * Delete a Series record.
 * Issues retain their metadata - seriesId becomes null.
 */
export async function deleteSeries(seriesId: string): Promise<void> {
  const db = getDatabase();

  // Delete series (cascades to SeriesProgress and SeriesReaderSettingsNew)
  // ComicFile.seriesId becomes null due to onDelete: SetNull
  await db.series.delete({
    where: { id: seriesId },
  });
}

/**
 * Search series by name with fuzzy matching.
 * Excludes soft-deleted series by default.
 */
export async function searchSeries(
  query: string,
  limit = 10,
  includeDeleted = false
): Promise<Series[]> {
  const db = getDatabase();

  // Search in name and aliases, exclude soft-deleted by default
  return db.series.findMany({
    where: {
      deletedAt: includeDeleted ? undefined : null,
      OR: [{ name: { contains: query } }, { aliases: { contains: query } }],
    },
    take: limit,
    orderBy: {
      name: 'asc',
    },
  });
}

// =============================================================================
// Cover Management
// =============================================================================

/**
 * Get series cover with smart fallback: API > User > First Issue.
 * For API covers, returns coverHash (local cache reference) instead of URL.
 */
export async function getSeriesCover(
  seriesId: string
): Promise<SeriesCoverResult> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
    include: {
      issues: {
        take: 1,
        orderBy: {
          metadata: {
            number: 'asc',
          },
        },
        include: {
          metadata: true,
        },
      },
    },
  });

  if (!series) {
    return { type: 'none' };
  }

  // Check cover source preference
  if (series.coverSource === 'api' && series.coverHash) {
    return { type: 'api', coverHash: series.coverHash };
  }

  if (series.coverSource === 'user' && series.coverFileId) {
    return { type: 'user', fileId: series.coverFileId };
  }

  // Auto fallback: API (with downloaded cover) > User > First Issue
  if (series.coverHash) {
    return { type: 'api', coverHash: series.coverHash };
  }

  if (series.coverFileId) {
    return { type: 'user', fileId: series.coverFileId };
  }

  // Use first issue as cover
  const firstIssue = series.issues[0];
  if (firstIssue) {
    return { type: 'firstIssue', fileId: firstIssue.id };
  }

  return { type: 'none' };
}

/**
 * Set series cover from an issue.
 */
export async function setSeriesCoverFromIssue(
  seriesId: string,
  fileId: string
): Promise<void> {
  const db = getDatabase();

  await db.series.update({
    where: { id: seriesId },
    data: {
      coverSource: 'user',
      coverFileId: fileId,
    },
  });
}

/**
 * Set series cover from URL.
 * Downloads the cover image and stores it locally, then updates the series with the cover hash.
 */
export async function setSeriesCoverFromUrl(
  seriesId: string,
  url: string
): Promise<{ success: boolean; coverHash?: string; error?: string }> {
  const { downloadApiCover, deleteSeriesCover } = await import('./cover.service.js');
  const db = getDatabase();

  // Get current series to check for existing cover
  const currentSeries = await db.series.findUnique({
    where: { id: seriesId },
    select: { coverHash: true },
  });

  // Delete old cover if exists to prevent stale cache
  if (currentSeries?.coverHash) {
    try {
      await deleteSeriesCover(currentSeries.coverHash);
    } catch {
      // Log but continue - old cover cleanup is not critical
    }
  }

  // Download and cache the cover
  const downloadResult = await downloadApiCover(url);

  if (!downloadResult.success || !downloadResult.coverHash) {
    return {
      success: false,
      error: downloadResult.error || 'Failed to download cover',
    };
  }

  await db.series.update({
    where: { id: seriesId },
    data: {
      coverSource: 'api',
      coverUrl: url,
      coverHash: downloadResult.coverHash,
    },
  });

  return {
    success: true,
    coverHash: downloadResult.coverHash,
  };
}

// =============================================================================
// Field Locking
// =============================================================================

/**
 * Lock a field from auto-updates.
 */
export async function lockField(
  seriesId: string,
  fieldName: string
): Promise<void> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  const lockedFields = series.lockedFields
    ? series.lockedFields.split(',').map((f) => f.trim())
    : [];

  if (!lockedFields.includes(fieldName)) {
    lockedFields.push(fieldName);

    // Update field sources
    const fieldSources: FieldSourceMap = series.fieldSources
      ? JSON.parse(series.fieldSources)
      : {};
    fieldSources[fieldName] = {
      source: fieldSources[fieldName]?.source ?? 'manual',
      lockedAt: new Date().toISOString(),
    };

    await db.series.update({
      where: { id: seriesId },
      data: {
        lockedFields: lockedFields.join(','),
        fieldSources: JSON.stringify(fieldSources),
      },
    });
  }
}

/**
 * Unlock a field for auto-updates.
 */
export async function unlockField(
  seriesId: string,
  fieldName: string
): Promise<void> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  const lockedFields = series.lockedFields
    ? series.lockedFields.split(',').map((f) => f.trim())
    : [];

  const index = lockedFields.indexOf(fieldName);
  if (index !== -1) {
    lockedFields.splice(index, 1);

    // Update field sources
    const fieldSources: FieldSourceMap = series.fieldSources
      ? JSON.parse(series.fieldSources)
      : {};
    if (fieldSources[fieldName]) {
      delete fieldSources[fieldName].lockedAt;
    }

    await db.series.update({
      where: { id: seriesId },
      data: {
        lockedFields: lockedFields.length > 0 ? lockedFields.join(',') : null,
        fieldSources: JSON.stringify(fieldSources),
      },
    });
  }
}

/**
 * Get field sources for a series.
 */
export async function getFieldSources(
  seriesId: string
): Promise<FieldSourceMap> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  return series.fieldSources ? JSON.parse(series.fieldSources) : {};
}

// =============================================================================
// Alias Management
// =============================================================================

/**
 * Add an alias to a series for fuzzy matching.
 */
export async function addAlias(
  seriesId: string,
  alias: string
): Promise<void> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  const aliases = series.aliases
    ? series.aliases.split(',').map((a) => a.trim())
    : [];

  if (!aliases.includes(alias)) {
    aliases.push(alias);

    await db.series.update({
      where: { id: seriesId },
      data: {
        aliases: aliases.join(','),
      },
    });
  }
}

/**
 * Remove an alias from a series.
 */
export async function removeAlias(
  seriesId: string,
  alias: string
): Promise<void> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  const aliases = series.aliases
    ? series.aliases.split(',').map((a) => a.trim())
    : [];

  const index = aliases.indexOf(alias);
  if (index !== -1) {
    aliases.splice(index, 1);

    await db.series.update({
      where: { id: seriesId },
      data: {
        aliases: aliases.length > 0 ? aliases.join(',') : null,
      },
    });
  }
}

/**
 * Find a series by alias.
 * Excludes soft-deleted series by default.
 */
export async function findSeriesByAlias(
  alias: string,
  includeDeleted = false
): Promise<Series | null> {
  const db = getDatabase();

  return db.series.findFirst({
    where: {
      aliases: { contains: alias },
      deletedAt: includeDeleted ? undefined : null,
    },
  });
}

// =============================================================================
// Progress Tracking
// =============================================================================

/**
 * Get or create SeriesProgress for a specific user and series.
 * @param userId - The user ID
 * @param seriesId - The series ID
 */
export async function getSeriesProgress(
  userId: string,
  seriesId: string
): Promise<SeriesProgress | null> {
  const db = getDatabase();

  let progress = await db.seriesProgress.findUnique({
    where: { userId_seriesId: { userId, seriesId } },
  });

  if (!progress) {
    // Get totalOwned count
    const totalOwned = await db.comicFile.count({
      where: { seriesId },
    });

    // Create progress record
    progress = await db.seriesProgress.create({
      data: {
        userId,
        seriesId,
        totalOwned,
        totalRead: 0,
        totalInProgress: 0,
      },
    });
  }

  return progress;
}

/**
 * Update SeriesProgress based on current reading state for a specific user.
 * If userId is provided, updates only that user's progress.
 * If userId is not provided, updates all users who have progress records for this series.
 * @param seriesId - The series ID
 * @param userId - Optional user ID. If not provided, updates all users with progress.
 */
export async function updateSeriesProgress(seriesId: string, userId?: string): Promise<void> {
  const db = getDatabase();

  // Get the total number of issues in this series (same for all users)
  const totalOwned = await db.comicFile.count({
    where: { seriesId },
  });

  // Get all issues for this series with their IDs
  const issues = await db.comicFile.findMany({
    where: { seriesId },
    include: {
      metadata: true,
    },
    orderBy: {
      metadata: {
        number: 'asc',
      },
    },
  });

  // If a specific userId is provided, update just that user
  // Otherwise, update all users who have existing progress for this series
  const userIds: string[] = [];
  if (userId) {
    userIds.push(userId);
  } else {
    // Get all users who have progress records for this series
    const existingProgress = await db.seriesProgress.findMany({
      where: { seriesId },
      select: { userId: true },
    });
    userIds.push(...existingProgress.map(p => p.userId));
  }

  // Update progress for each user
  for (const uid of userIds) {
    // Get this user's reading progress for all issues in this series
    const userProgress = await db.userReadingProgress.findMany({
      where: {
        userId: uid,
        fileId: { in: issues.map(i => i.id) },
      },
    });

    const progressByFileId = new Map(userProgress.map(p => [p.fileId, p]));

    const completedCount = userProgress.filter(p => p.completed).length;
    const inProgressCount = userProgress.filter(
      p => !p.completed && p.currentPage > 0
    ).length;

    // Find last read issue for this user
    const issuesWithProgress = userProgress
      .filter(p => p.lastReadAt)
      .sort((a, b) => {
        const aDate = a.lastReadAt ?? new Date(0);
        const bDate = b.lastReadAt ?? new Date(0);
        return bDate.getTime() - aDate.getTime();
      });

    const lastReadProgress = issuesWithProgress[0];
    const lastReadIssue = lastReadProgress
      ? issues.find(i => i.id === lastReadProgress.fileId)
      : undefined;
    const lastReadIssueNum = lastReadIssue?.metadata?.number
      ? parseFloat(lastReadIssue.metadata.number)
      : null;

    // Find next unread issue for this user (Last Read +1 logic)
    let nextUnreadFileId: string | null = null;
    if (lastReadIssue) {
      // Find the issue after the last read one
      const lastReadIndex = issues.findIndex(i => i.id === lastReadIssue.id);
      for (let i = lastReadIndex + 1; i < issues.length; i++) {
        const issue = issues[i];
        if (issue && !progressByFileId.get(issue.id)?.completed) {
          nextUnreadFileId = issue.id;
          break;
        }
      }
    } else {
      // No reading progress - first unread issue
      const firstUnread = issues.find(i => !progressByFileId.get(i.id)?.completed);
      nextUnreadFileId = firstUnread?.id ?? null;
    }

    // Upsert progress for this user
    await db.seriesProgress.upsert({
      where: { userId_seriesId: { userId: uid, seriesId } },
      create: {
        userId: uid,
        seriesId,
        totalOwned,
        totalRead: completedCount,
        totalInProgress: inProgressCount,
        lastReadFileId: lastReadIssue?.id ?? null,
        lastReadIssueNum: Number.isFinite(lastReadIssueNum)
          ? lastReadIssueNum
          : null,
        lastReadAt: lastReadProgress?.lastReadAt ?? null,
        nextUnreadFileId,
      },
      update: {
        totalOwned,
        totalRead: completedCount,
        totalInProgress: inProgressCount,
        lastReadFileId: lastReadIssue?.id ?? null,
        lastReadIssueNum: Number.isFinite(lastReadIssueNum)
          ? lastReadIssueNum
          : null,
        lastReadAt: lastReadProgress?.lastReadAt ?? null,
        nextUnreadFileId,
      },
    });
  }
}

/**
 * Get next unread issue for a series for a specific user (Continue Series feature).
 * @param userId - The user ID
 * @param seriesId - The series ID
 */
export async function getNextUnreadIssue(
  userId: string,
  seriesId: string
): Promise<ComicFile | null> {
  const db = getDatabase();

  // Update progress first for this user
  await updateSeriesProgress(seriesId, userId);

  const progress = await db.seriesProgress.findUnique({
    where: { userId_seriesId: { userId, seriesId } },
  });

  if (!progress?.nextUnreadFileId) {
    return null;
  }

  return db.comicFile.findUnique({
    where: { id: progress.nextUnreadFileId },
  });
}

// =============================================================================
// Series.json Sync
// =============================================================================

/**
 * Sync a Series record to its series.json file.
 */
export async function syncSeriesToSeriesJson(seriesId: string): Promise<void> {
  const series = await getSeries(seriesId);
  if (!series || !series.primaryFolder) {
    return;
  }

  const metadata: SeriesMetadata = {
    seriesName: series.name,
    startYear: series.startYear ?? undefined,
    endYear: series.endYear ?? undefined,
    publisher: series.publisher ?? undefined,
    comicVineSeriesId: series.comicVineId ?? undefined,
    metronSeriesId: series.metronId ?? undefined,
    issueCount: series.issueCount ?? undefined,
    deck: series.deck ?? undefined,
    summary: series.summary ?? undefined,
    coverUrl: series.coverUrl ?? undefined,
    genres: series.genres?.split(',').map((g) => g.trim()) ?? undefined,
    tags: series.tags?.split(',').map((t) => t.trim()) ?? undefined,
    characters: series.characters?.split(',').map((c) => c.trim()) ?? undefined,
    teams: series.teams?.split(',').map((t) => t.trim()) ?? undefined,
    storyArcs: series.storyArcs?.split(',').map((s) => s.trim()) ?? undefined,
    locations: series.locations?.split(',').map((l) => l.trim()) ?? undefined,
    userNotes: series.userNotes ?? undefined,
    volume: series.volume ?? undefined,
    type: series.type as 'western' | 'manga' | undefined,
    ageRating: series.ageRating ?? undefined,
    languageISO: series.languageISO ?? undefined,
    lastUpdated: new Date().toISOString(),
  };

  await writeSeriesJson(series.primaryFolder, metadata);
}

/**
 * Sync series.json to a Series record.
 * Uses the correct identity lookup (name + publisher only, not startYear).
 */
export async function syncSeriesFromSeriesJson(
  folderPath: string
): Promise<Series | null> {
  const db = getDatabase();
  const result = await readSeriesJson(folderPath);

  if (!result.success || !result.metadata) {
    return null;
  }

  const metadata = result.metadata;

  // Find existing series by identity (name + publisher only - year is NOT part of identity)
  // Use the correct identity lookup function that handles case-insensitivity
  let series = await getSeriesByIdentity(
    metadata.seriesName,
    null, // startYear is not part of identity
    metadata.publisher ?? null,
    true // Include deleted series so we can restore them
  );

  const seriesData = {
    name: metadata.seriesName,
    startYear: metadata.startYear ?? null,
    publisher: metadata.publisher ?? null,
    endYear: metadata.endYear ?? null,
    deck: metadata.deck ?? null,
    summary: metadata.summary ?? null,
    coverUrl: metadata.coverUrl ?? null,
    issueCount: metadata.issueCount ?? null,
    genres: metadata.genres?.join(',') ?? null,
    tags: metadata.tags?.join(',') ?? null,
    characters: metadata.characters?.join(',') ?? null,
    teams: metadata.teams?.join(',') ?? null,
    storyArcs: metadata.storyArcs?.join(',') ?? null,
    locations: metadata.locations?.join(',') ?? null,
    volume: metadata.volume ?? null,
    type: metadata.type ?? 'western',
    ageRating: metadata.ageRating ?? null,
    languageISO: metadata.languageISO ?? null,
    comicVineId: metadata.comicVineSeriesId ?? null,
    metronId: metadata.metronSeriesId ?? null,
    userNotes: metadata.userNotes ?? null,
    primaryFolder: folderPath,
  };

  if (series) {
    // If series was soft-deleted, restore it first
    if (series.deletedAt) {
      await db.series.update({
        where: { id: series.id },
        data: { deletedAt: null },
      });
      // Restore collection items referencing this series
      await db.collectionItem.updateMany({
        where: { seriesId: series.id },
        data: { isAvailable: true },
      });
    }
    // Update existing series, respecting locked fields
    series = await updateSeries(series.id, seriesData, true);
  } else {
    // Create new series
    series = await db.series.create({
      data: seriesData,
    });
  }

  return series;
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Get potential duplicate series for review.
 * Excludes soft-deleted series.
 */
export async function findPotentialDuplicates(): Promise<
  Array<{ series: Series[]; reason: string }>
> {
  const db = getDatabase();

  // Find series with same name (exclude soft-deleted)
  const allSeries = await db.series.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  });

  const duplicateGroups: Array<{ series: Series[]; reason: string }> = [];
  const nameGroups = new Map<string, Series[]>();

  for (const series of allSeries) {
    const normalizedName = series.name.toLowerCase().trim();
    const existing = nameGroups.get(normalizedName);
    if (existing) {
      existing.push(series);
    } else {
      nameGroups.set(normalizedName, [series]);
    }
  }

  for (const [, group] of nameGroups) {
    if (group.length > 1) {
      duplicateGroups.push({
        series: group,
        reason: 'Same name',
      });
    }
  }

  return duplicateGroups;
}

/**
 * Merge multiple series into one.
 * Moves all issues and collection items from source series to target, then deletes sources.
 */
export async function mergeSeries(
  sourceIds: string[],
  targetId: string
): Promise<void> {
  const db = getDatabase();

  // Verify target exists
  const target = await db.series.findUnique({
    where: { id: targetId },
  });

  if (!target) {
    throw new Error(`Target series ${targetId} not found`);
  }

  // Move all issues and collection items from source series to target
  for (const sourceId of sourceIds) {
    if (sourceId === targetId) continue;

    // Move comic files to target series
    await db.comicFile.updateMany({
      where: { seriesId: sourceId },
      data: { seriesId: targetId },
    });

    // Move collection items to target series (prevents orphaned references)
    // First, get existing collection items for target series per collection
    const targetItems = await db.collectionItem.findMany({
      where: { seriesId: targetId },
      select: { collectionId: true },
    });
    const targetCollectionIds = new Set(targetItems.map((i) => i.collectionId));

    // Update collection items from source to target, but only if target doesn't already have that series in the collection
    const sourceItems = await db.collectionItem.findMany({
      where: { seriesId: sourceId },
    });

    for (const item of sourceItems) {
      if (targetCollectionIds.has(item.collectionId)) {
        // Target series already in this collection - delete the duplicate source item
        await db.collectionItem.delete({
          where: { id: item.id },
        });
      } else {
        // Move item to target series
        await db.collectionItem.update({
          where: { id: item.id },
          data: { seriesId: targetId },
        });
        targetCollectionIds.add(item.collectionId);
      }
    }

    // Move reading progress records to target series
    // First, get existing progress for target series per user
    const targetProgress = await db.seriesProgress.findMany({
      where: { seriesId: targetId },
      select: { userId: true },
    });
    const targetUserIds = new Set(targetProgress.map((p) => p.userId));

    // Delete source progress if user already has target progress, otherwise move it
    const sourceProgress = await db.seriesProgress.findMany({
      where: { seriesId: sourceId },
    });

    for (const progress of sourceProgress) {
      if (targetUserIds.has(progress.userId)) {
        // User already has progress for target - delete duplicate
        await db.seriesProgress.delete({
          where: { id: progress.id },
        });
      } else {
        // Move progress to target series
        await db.seriesProgress.update({
          where: { id: progress.id },
          data: { seriesId: targetId },
        });
        targetUserIds.add(progress.userId);
      }
    }

    // Delete source series
    await db.series.delete({
      where: { id: sourceId },
    });
  }

  // Update progress for target series
  await updateSeriesProgress(targetId);
}

/**
 * Bulk relink files to a series.
 */
export async function bulkRelinkFiles(
  fileIds: string[],
  seriesId: string
): Promise<number> {
  const db = getDatabase();

  const result = await db.comicFile.updateMany({
    where: {
      id: { in: fileIds },
    },
    data: { seriesId },
  });

  // Update series progress
  await updateSeriesProgress(seriesId);

  return result.count;
}

/**
 * Get all unique publishers for filtering.
 * Excludes soft-deleted series.
 */
export async function getAllPublishers(): Promise<string[]> {
  const db = getDatabase();

  const series = await db.series.findMany({
    where: {
      publisher: { not: null },
      deletedAt: null,
    },
    select: { publisher: true },
    distinct: ['publisher'],
  });

  return series
    .map((s) => s.publisher)
    .filter((p): p is string => p !== null)
    .sort();
}

/**
 * Get all unique genres for filtering.
 * Excludes soft-deleted series.
 */
export async function getAllGenres(): Promise<string[]> {
  const db = getDatabase();

  const series = await db.series.findMany({
    where: {
      genres: { not: null },
      deletedAt: null,
    },
    select: { genres: true },
  });

  const genreSet = new Set<string>();
  for (const s of series) {
    if (s.genres) {
      for (const genre of s.genres.split(',')) {
        genreSet.add(genre.trim());
      }
    }
  }

  return Array.from(genreSet).sort();
}

// =============================================================================
// Enhanced Duplicate Detection & Merge
// =============================================================================

// Re-export types for convenience
export type {
  DuplicateConfidence,
  DuplicateReason,
  DuplicateGroup,
  SeriesForMerge,
  MergePreview,
  MergeResult,
};

/**
 * Normalize a series name for comparison.
 * Removes case, special characters, parentheticals like (2019), and common prefixes.
 */
export function normalizeSeriesName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^the\s+/i, '') // Remove leading "The"
    .replace(/\s*\d{4}\s*$/g, ''); // Remove trailing year like "2019"
}

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Calculate similarity score between two series names (0 to 1).
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  const norm1 = normalizeSeriesName(name1);
  const norm2 = normalizeSeriesName(name2);

  if (norm1 === norm2) return 1;

  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);

  if (maxLength === 0) return 1;

  return 1 - distance / maxLength;
}

/**
 * Convert a Series to SeriesForMerge format with issue counts.
 */
async function seriesToMergeFormat(series: Series): Promise<SeriesForMerge> {
  const db = getDatabase();

  const issueCount = await db.comicFile.count({
    where: { seriesId: series.id },
  });

  return {
    id: series.id,
    name: series.name,
    publisher: series.publisher,
    startYear: series.startYear,
    endYear: series.endYear,
    issueCount: series.issueCount,
    ownedIssueCount: issueCount,
    comicVineId: series.comicVineId,
    metronId: series.metronId,
    coverUrl: series.coverUrl,
    coverHash: series.coverHash,
    coverFileId: series.coverFileId,
    aliases: series.aliases,
    summary: series.summary,
    type: series.type,
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
  };
}

/**
 * Find potential duplicate series with confidence scoring.
 * Uses multiple detection strategies:
 * - HIGH: Same normalized name, same external IDs
 * - MEDIUM: Fuzzy name match, same publisher + similar name
 * Excludes soft-deleted series.
 */
export async function findPotentialDuplicatesEnhanced(): Promise<
  DuplicateGroup[]
> {
  const db = getDatabase();

  const allSeries = await db.series.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  });

  const duplicateGroups: DuplicateGroup[] = [];
  const processedPairs = new Set<string>();

  // Helper to create a pair key
  const pairKey = (id1: string, id2: string) =>
    [id1, id2].sort().join('|');

  // Helper to find or create a group
  const findOrCreateGroup = (
    seriesIds: string[],
    confidence: DuplicateConfidence,
    reason: DuplicateReason
  ): DuplicateGroup | null => {
    // Check if all pairs have been processed
    const allProcessed = seriesIds.every((id1, i) =>
      seriesIds.slice(i + 1).every((id2) => processedPairs.has(pairKey(id1, id2)))
    );
    if (allProcessed && seriesIds.length === 2) return null;

    // Find existing group that contains any of these series
    const existingGroup = duplicateGroups.find((g) =>
      g.series.some((s) => seriesIds.includes(s.id))
    );

    if (existingGroup) {
      // Add series to existing group
      for (const id of seriesIds) {
        const series = allSeries.find((s) => s.id === id);
        if (series && !existingGroup.series.some((s) => s.id === id)) {
          // We'll populate this later with full data
        }
      }
      if (!existingGroup.reasons.includes(reason)) {
        existingGroup.reasons.push(reason);
      }
      return existingGroup;
    }

    return {
      id: `dup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      series: [], // Will be populated later
      confidence,
      reasons: [reason],
      primaryReason: reason,
    };
  };

  // Build normalized name map
  const nameMap = new Map<string, Series[]>();
  for (const series of allSeries) {
    const normalized = normalizeSeriesName(series.name);
    const existing = nameMap.get(normalized);
    if (existing) {
      existing.push(series);
    } else {
      nameMap.set(normalized, [series]);
    }
  }

  // 1. HIGH: Same normalized name
  for (const [, group] of nameMap) {
    if (group.length > 1) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const s1 = group[i];
          const s2 = group[j];
          if (s1 && s2) {
            const key = pairKey(s1.id, s2.id);
            if (!processedPairs.has(key)) {
              processedPairs.add(key);
            }
          }
        }
      }

      const dupGroup: DuplicateGroup = {
        id: `dup-name-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        series: [], // Will populate below
        confidence: 'high',
        reasons: ['same_name'],
        primaryReason: 'same_name',
      };

      for (const s of group) {
        dupGroup.series.push(await seriesToMergeFormat(s));
      }

      duplicateGroups.push(dupGroup);
    }
  }

  // 2. HIGH: Same ComicVine ID
  const comicVineMap = new Map<string, Series[]>();
  for (const series of allSeries) {
    if (series.comicVineId) {
      const existing = comicVineMap.get(series.comicVineId);
      if (existing) {
        existing.push(series);
      } else {
        comicVineMap.set(series.comicVineId, [series]);
      }
    }
  }

  for (const [, group] of comicVineMap) {
    if (group.length > 1) {
      // Check if already in a group
      const alreadyGrouped = group.every((s) =>
        duplicateGroups.some((dg) => dg.series.some((ds) => ds.id === s.id))
      );

      if (!alreadyGrouped) {
        const dupGroup: DuplicateGroup = {
          id: `dup-cv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          series: [],
          confidence: 'high',
          reasons: ['same_comicvine_id'],
          primaryReason: 'same_comicvine_id',
        };

        for (const s of group) {
          dupGroup.series.push(await seriesToMergeFormat(s));
        }

        duplicateGroups.push(dupGroup);
      } else {
        // Add reason to existing group
        for (const dg of duplicateGroups) {
          if (dg.series.some((ds) => group.some((s) => s.id === ds.id))) {
            if (!dg.reasons.includes('same_comicvine_id')) {
              dg.reasons.push('same_comicvine_id');
            }
          }
        }
      }
    }
  }

  // 3. HIGH: Same Metron ID
  const metronMap = new Map<string, Series[]>();
  for (const series of allSeries) {
    if (series.metronId) {
      const existing = metronMap.get(series.metronId);
      if (existing) {
        existing.push(series);
      } else {
        metronMap.set(series.metronId, [series]);
      }
    }
  }

  for (const [, group] of metronMap) {
    if (group.length > 1) {
      const alreadyGrouped = group.every((s) =>
        duplicateGroups.some((dg) => dg.series.some((ds) => ds.id === s.id))
      );

      if (!alreadyGrouped) {
        const dupGroup: DuplicateGroup = {
          id: `dup-metron-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          series: [],
          confidence: 'high',
          reasons: ['same_metron_id'],
          primaryReason: 'same_metron_id',
        };

        for (const s of group) {
          dupGroup.series.push(await seriesToMergeFormat(s));
        }

        duplicateGroups.push(dupGroup);
      } else {
        for (const dg of duplicateGroups) {
          if (dg.series.some((ds) => group.some((s) => s.id === ds.id))) {
            if (!dg.reasons.includes('same_metron_id')) {
              dg.reasons.push('same_metron_id');
            }
          }
        }
      }
    }
  }

  // 4. MEDIUM: Fuzzy name match (similarity > 0.8 but not exact)
  for (let i = 0; i < allSeries.length; i++) {
    for (let j = i + 1; j < allSeries.length; j++) {
      const s1 = allSeries[i];
      const s2 = allSeries[j];
      if (!s1 || !s2) continue;

      const key = pairKey(s1.id, s2.id);

      if (processedPairs.has(key)) continue;

      const similarity = calculateNameSimilarity(s1.name, s2.name);

      if (similarity >= 0.8 && similarity < 1) {
        processedPairs.add(key);

        // Check if either is already in a group
        const existingGroup = duplicateGroups.find(
          (dg) =>
            dg.series.some((ds) => ds.id === s1.id) ||
            dg.series.some((ds) => ds.id === s2.id)
        );

        if (existingGroup) {
          // Add to existing group
          if (!existingGroup.series.some((ds) => ds.id === s1.id)) {
            existingGroup.series.push(await seriesToMergeFormat(s1));
          }
          if (!existingGroup.series.some((ds) => ds.id === s2.id)) {
            existingGroup.series.push(await seriesToMergeFormat(s2));
          }
          if (!existingGroup.reasons.includes('similar_name')) {
            existingGroup.reasons.push('similar_name');
          }
          // Downgrade confidence if it was high
          if (existingGroup.confidence === 'high') {
            existingGroup.confidence = 'medium';
          }
        } else {
          const dupGroup: DuplicateGroup = {
            id: `dup-fuzzy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            series: [
              await seriesToMergeFormat(s1),
              await seriesToMergeFormat(s2),
            ],
            confidence: 'medium',
            reasons: ['similar_name'],
            primaryReason: 'similar_name',
          };
          duplicateGroups.push(dupGroup);
        }
      }
    }
  }

  // 5. MEDIUM: Same publisher + similar name (similarity > 0.6)
  const publisherMap = new Map<string, Series[]>();
  for (const series of allSeries) {
    if (series.publisher) {
      const existing = publisherMap.get(series.publisher);
      if (existing) {
        existing.push(series);
      } else {
        publisherMap.set(series.publisher, [series]);
      }
    }
  }

  for (const [, group] of publisherMap) {
    if (group.length > 1) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const s1 = group[i];
          const s2 = group[j];
          if (!s1 || !s2) continue;

          const key = pairKey(s1.id, s2.id);

          if (processedPairs.has(key)) continue;

          const similarity = calculateNameSimilarity(s1.name, s2.name);

          if (similarity >= 0.6 && similarity < 0.8) {
            processedPairs.add(key);

            const existingGroup = duplicateGroups.find(
              (dg) =>
                dg.series.some((ds) => ds.id === s1.id) ||
                dg.series.some((ds) => ds.id === s2.id)
            );

            if (existingGroup) {
              if (!existingGroup.series.some((ds) => ds.id === s1.id)) {
                existingGroup.series.push(await seriesToMergeFormat(s1));
              }
              if (!existingGroup.series.some((ds) => ds.id === s2.id)) {
                existingGroup.series.push(await seriesToMergeFormat(s2));
              }
              if (!existingGroup.reasons.includes('same_publisher_similar_name')) {
                existingGroup.reasons.push('same_publisher_similar_name');
              }
            } else {
              const dupGroup: DuplicateGroup = {
                id: `dup-pub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                series: [
                  await seriesToMergeFormat(s1),
                  await seriesToMergeFormat(s2),
                ],
                confidence: 'medium',
                reasons: ['same_publisher_similar_name'],
                primaryReason: 'same_publisher_similar_name',
              };
              duplicateGroups.push(dupGroup);
            }
          }
        }
      }
    }
  }

  // Sort by confidence (high first)
  const confidenceOrder: Record<DuplicateConfidence, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  duplicateGroups.sort(
    (a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
  );

  return duplicateGroups;
}

/**
 * Preview a merge operation without executing it.
 */
export async function previewMerge(
  sourceIds: string[],
  targetId: string
): Promise<MergePreview> {
  const db = getDatabase();

  // Get target series
  const targetSeries = await db.series.findUnique({
    where: { id: targetId },
  });

  if (!targetSeries) {
    throw new Error(`Target series ${targetId} not found`);
  }

  // Get source series
  const sourceSeries: SeriesForMerge[] = [];
  const warnings: string[] = [];
  let totalSourceIssues = 0;

  for (const sourceId of sourceIds) {
    if (sourceId === targetId) continue;

    const series = await db.series.findUnique({
      where: { id: sourceId },
    });

    if (!series) {
      warnings.push(`Source series ${sourceId} not found`);
      continue;
    }

    const mergeFormat = await seriesToMergeFormat(series);
    sourceSeries.push(mergeFormat);
    totalSourceIssues += mergeFormat.ownedIssueCount;

    // Check for potential issues
    if (series.publisher && targetSeries.publisher && series.publisher !== targetSeries.publisher) {
      warnings.push(
        `"${series.name}" has different publisher (${series.publisher}) than target (${targetSeries.publisher})`
      );
    }
  }

  // Calculate resulting aliases
  const existingAliases = targetSeries.aliases
    ? targetSeries.aliases.split(',').map((a) => a.trim())
    : [];

  const newAliases = sourceSeries
    .map((s) => s.name)
    .filter((name) => name !== targetSeries.name && !existingAliases.includes(name));

  const resultingAliases = [...existingAliases, ...newAliases];

  // Get target issue count
  const targetIssueCount = await db.comicFile.count({
    where: { seriesId: targetId },
  });

  return {
    targetSeries: await seriesToMergeFormat(targetSeries),
    sourceSeries,
    resultingAliases,
    totalIssuesAfterMerge: targetIssueCount + totalSourceIssues,
    warnings,
  };
}

/**
 * Merge multiple series into one with enhanced functionality.
 * - Moves all issues from source series to target
 * - Adds source series names as aliases to target
 * - Returns detailed result
 */
export async function mergeSeriesEnhanced(
  sourceIds: string[],
  targetId: string
): Promise<MergeResult> {
  const db = getDatabase();

  // Verify target exists
  const target = await db.series.findUnique({
    where: { id: targetId },
  });

  if (!target) {
    return {
      success: false,
      targetSeriesId: targetId,
      mergedSourceIds: [],
      issuesMoved: 0,
      aliasesAdded: [],
      error: `Target series ${targetId} not found`,
    };
  }

  const mergedSourceIds: string[] = [];
  const aliasesAdded: string[] = [];
  let totalIssuesMoved = 0;

  // Get existing aliases
  const existingAliases = target.aliases
    ? target.aliases.split(',').map((a) => a.trim())
    : [];

  // Process each source series
  for (const sourceId of sourceIds) {
    if (sourceId === targetId) continue;

    const source = await db.series.findUnique({
      where: { id: sourceId },
    });

    if (!source) continue;

    // Count issues being moved
    const issueCount = await db.comicFile.count({
      where: { seriesId: sourceId },
    });

    // Move all issues from source to target
    await db.comicFile.updateMany({
      where: { seriesId: sourceId },
      data: { seriesId: targetId },
    });

    totalIssuesMoved += issueCount;

    // Add source name as alias if not already present
    if (source.name !== target.name && !existingAliases.includes(source.name)) {
      existingAliases.push(source.name);
      aliasesAdded.push(source.name);
    }

    // Also add any aliases from the source
    if (source.aliases) {
      for (const alias of source.aliases.split(',').map((a) => a.trim())) {
        if (!existingAliases.includes(alias)) {
          existingAliases.push(alias);
          aliasesAdded.push(alias);
        }
      }
    }

    // Delete source series
    await db.series.delete({
      where: { id: sourceId },
    });

    mergedSourceIds.push(sourceId);
  }

  // Update target with new aliases
  if (aliasesAdded.length > 0) {
    await db.series.update({
      where: { id: targetId },
      data: {
        aliases: existingAliases.join(','),
      },
    });
  }

  // Update progress for target series
  await updateSeriesProgress(targetId);

  return {
    success: true,
    targetSeriesId: targetId,
    mergedSourceIds,
    issuesMoved: totalIssuesMoved,
    aliasesAdded,
  };
}

// =============================================================================
// Soft Delete Management
// =============================================================================

/**
 * Soft-delete a series (set deletedAt timestamp).
 * The series will be hidden from UI/API but can be restored.
 */
export async function softDeleteSeries(seriesId: string): Promise<Series> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  if (series.deletedAt) {
    return series; // Already soft-deleted
  }

  const updated = await db.series.update({
    where: { id: seriesId },
    data: { deletedAt: new Date() },
  });

  // Mark collection items referencing this series as unavailable
  await db.collectionItem.updateMany({
    where: { seriesId },
    data: { isAvailable: false },
  });

  return updated;
}

/**
 * Restore a soft-deleted series (clear deletedAt timestamp).
 * Also restores collection items referencing this series.
 */
export async function restoreSeries(seriesId: string): Promise<Series> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  if (!series.deletedAt) {
    return series; // Already active
  }

  const updated = await db.series.update({
    where: { id: seriesId },
    data: { deletedAt: null },
  });

  // Restore collection items referencing this series
  await db.collectionItem.updateMany({
    where: { seriesId },
    data: { isAvailable: true },
  });

  return updated;
}

/**
 * Get all soft-deleted series for admin management.
 */
export async function getDeletedSeries(): Promise<Series[]> {
  const db = getDatabase();

  return db.series.findMany({
    where: {
      deletedAt: { not: null },
    },
    orderBy: { deletedAt: 'desc' },
  });
}

/**
 * Check if a series has no remaining issues and soft-delete it if empty.
 * Returns true if the series was soft-deleted.
 */
export async function checkAndSoftDeleteEmptySeries(
  seriesId: string
): Promise<boolean> {
  const db = getDatabase();

  // Count remaining issues
  const issueCount = await db.comicFile.count({
    where: { seriesId },
  });

  if (issueCount === 0) {
    // Soft-delete the series
    await db.series.update({
      where: { id: seriesId },
      data: { deletedAt: new Date() },
    });

    // Mark collection items referencing this series as unavailable
    await db.collectionItem.updateMany({
      where: { seriesId },
      data: { isAvailable: false },
    });

    return true;
  }

  return false;
}

// =============================================================================
// Series Visibility (Hidden Flag)
// =============================================================================

/**
 * Toggle the hidden status of a series.
 * Hidden series are excluded from browse lists but still accessible via search/links.
 */
export async function toggleSeriesHidden(seriesId: string): Promise<Series> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  return db.series.update({
    where: { id: seriesId },
    data: { isHidden: !series.isHidden },
  });
}

/**
 * Explicitly set the hidden status of a series.
 */
export async function setSeriesHidden(
  seriesId: string,
  hidden: boolean
): Promise<Series> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  return db.series.update({
    where: { id: seriesId },
    data: { isHidden: hidden },
  });
}

/**
 * Get all hidden series (for admin/management purposes).
 */
export async function getHiddenSeries(): Promise<SeriesWithCounts[]> {
  const db = getDatabase();

  return db.series.findMany({
    where: {
      isHidden: true,
      deletedAt: null,
    },
    include: {
      _count: {
        select: { issues: true },
      },
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Bulk set hidden status for multiple series.
 */
export async function bulkSetSeriesHidden(
  seriesIds: string[],
  hidden: boolean
): Promise<BulkOperationResult> {
  const db = getDatabase();
  const results: Array<{ seriesId: string; success: boolean; error?: string }> = [];

  for (const seriesId of seriesIds) {
    try {
      await db.series.update({
        where: { id: seriesId },
        data: { isHidden: hidden },
      });
      results.push({ seriesId, success: true });
    } catch (error) {
      results.push({
        seriesId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const successful = results.filter((r) => r.success).length;
  return {
    total: seriesIds.length,
    successful,
    failed: seriesIds.length - successful,
    results,
  };
}

// =============================================================================
// Bulk Operations
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

/**
 * Bulk update metadata fields across multiple series.
 * Only updates fields that are explicitly provided (not undefined).
 */
export async function bulkUpdateSeries(
  seriesIds: string[],
  updates: BulkSeriesUpdateInput
): Promise<BulkOperationResult> {
  const db = getDatabase();
  const results: Array<{ seriesId: string; success: boolean; error?: string }> = [];
  let successful = 0;
  let failed = 0;

  // Build the update data, only including fields that are provided
  const updateData: Prisma.SeriesUpdateInput = {};
  if (updates.publisher !== undefined) updateData.publisher = updates.publisher;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.genres !== undefined) updateData.genres = updates.genres;
  if (updates.tags !== undefined) updateData.tags = updates.tags;
  if (updates.ageRating !== undefined) updateData.ageRating = updates.ageRating;
  if (updates.languageISO !== undefined) updateData.languageISO = updates.languageISO;

  // If no updates provided, return early
  if (Object.keys(updateData).length === 0) {
    return {
      total: seriesIds.length,
      successful: 0,
      failed: 0,
      results: seriesIds.map(seriesId => ({ seriesId, success: true })),
    };
  }

  for (const seriesId of seriesIds) {
    try {
      await db.series.update({
        where: { id: seriesId },
        data: updateData,
      });

      // Refresh tags for autocomplete
      await refreshTagsFromSeries(seriesId);

      results.push({ seriesId, success: true });
      successful++;
    } catch (error) {
      results.push({
        seriesId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      failed++;
    }
  }

  return {
    total: seriesIds.length,
    successful,
    failed,
    results,
  };
}

/**
 * Mark all issues in the specified series as read for a user.
 */
export async function bulkMarkSeriesRead(
  seriesIds: string[],
  userId: string
): Promise<BulkOperationResult> {
  const db = getDatabase();
  const results: Array<{ seriesId: string; success: boolean; error?: string }> = [];
  let successful = 0;
  let failed = 0;

  for (const seriesId of seriesIds) {
    try {
      // Get all files in the series
      const files = await db.comicFile.findMany({
        where: { seriesId },
        select: { id: true },
      });

      // Mark each file as completed
      for (const file of files) {
        await db.userReadingProgress.upsert({
          where: {
            userId_fileId: { userId, fileId: file.id },
          },
          create: {
            userId,
            fileId: file.id,
            currentPage: 0,
            totalPages: 0,
            completed: true,
            bookmarks: '[]',
          },
          update: {
            completed: true,
          },
        });
      }

      // Update series progress
      await updateSeriesProgress(seriesId, userId);

      results.push({ seriesId, success: true });
      successful++;
    } catch (error) {
      results.push({
        seriesId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      failed++;
    }
  }

  return {
    total: seriesIds.length,
    successful,
    failed,
    results,
  };
}

/**
 * Mark all issues in the specified series as unread for a user.
 */
export async function bulkMarkSeriesUnread(
  seriesIds: string[],
  userId: string
): Promise<BulkOperationResult> {
  const db = getDatabase();
  const results: Array<{ seriesId: string; success: boolean; error?: string }> = [];
  let successful = 0;
  let failed = 0;

  for (const seriesId of seriesIds) {
    try {
      // Get all files in the series
      const files = await db.comicFile.findMany({
        where: { seriesId },
        select: { id: true },
      });

      // Delete reading progress for each file (or mark as incomplete)
      for (const file of files) {
        await db.userReadingProgress.deleteMany({
          where: {
            userId,
            fileId: file.id,
          },
        });
      }

      // Update series progress
      await updateSeriesProgress(seriesId, userId);

      results.push({ seriesId, success: true });
      successful++;
    } catch (error) {
      results.push({
        seriesId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      failed++;
    }
  }

  return {
    total: seriesIds.length,
    successful,
    failed,
    results,
  };
}

// =============================================================================
// Unified Grid (Series + Promoted Collections)
// =============================================================================

/**
 * Helper to extract progress stats from progress data.
 * Handles both array and single object forms.
 */
function getProgressStats(progress: SeriesProgress[] | SeriesProgress | null | undefined): {
  totalOwned: number;
  totalRead: number;
} {
  if (!progress) return { totalOwned: 0, totalRead: 0 };
  if (Array.isArray(progress)) {
    const p = progress[0];
    return p ? { totalOwned: p.totalOwned, totalRead: p.totalRead } : { totalOwned: 0, totalRead: 0 };
  }
  return { totalOwned: progress.totalOwned, totalRead: progress.totalRead };
}

/**
 * Sort grid items (series + collections) according to specified criteria.
 * Collections are mixed naturally with series based on the sort field.
 */
function sortGridItems(
  items: GridItem[],
  sortBy: SeriesListOptions['sortBy'] = 'name',
  sortOrder: 'asc' | 'desc' = 'asc'
): GridItem[] {
  const multiplier = sortOrder === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        break;
      case 'startYear':
        // Null years sort to the end
        const yearA = a.startYear ?? (sortOrder === 'asc' ? Infinity : -Infinity);
        const yearB = b.startYear ?? (sortOrder === 'asc' ? Infinity : -Infinity);
        comparison = (yearA as number) - (yearB as number);
        break;
      case 'updatedAt':
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case 'createdAt':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'issueCount':
        comparison = a.issueCount - b.issueCount;
        break;
    }

    // Secondary sort: when primary values are equal and both are collections,
    // use promotedOrder to maintain collection-specific ordering
    if (comparison === 0 && a.itemType === 'collection' && b.itemType === 'collection') {
      const orderA = a.collection.promotedOrder ?? Infinity;
      const orderB = b.collection.promotedOrder ?? Infinity;
      comparison = orderA - orderB;
    }

    // Tertiary sort: by name for stable ordering
    if (comparison === 0) {
      comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }

    return comparison * multiplier;
  });
}

/**
 * Get unified grid items (series + promoted collections) with filtering and sorting.
 * Collections are treated as "virtual series" for filtering purposes.
 *
 * @param options - List options including filters and sort settings
 * @returns Unified list of series and collections, sorted and optionally paginated
 */
export async function getUnifiedGridItems(
  options: UnifiedGridOptions = {}
): Promise<UnifiedGridResult> {
  const { userId, includePromotedCollections = false, ...seriesOptions } = options;

  // 1. Get series using existing logic
  const seriesResult = await getSeriesList({
    ...seriesOptions,
    userId,
    // Fetch all for client-side merging, then we'll paginate the combined result
    limit: undefined,
  });

  // 2. Convert series to GridItem format
  const seriesItems: GridItem[] = seriesResult.series.map((s) => {
    const stats = getProgressStats(s.progress);
    // Transform progress array to single object for frontend compatibility
    const transformedSeries = {
      ...s,
      progress: Array.isArray(s.progress) ? s.progress[0] ?? null : s.progress,
    };
    return {
      itemType: 'series' as const,
      id: s.id,
      name: s.name,
      startYear: s.startYear,
      publisher: s.publisher,
      genres: s.genres,
      issueCount: s._count?.issues || 0,
      readCount: stats.totalRead,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
      series: transformedSeries,
    };
  });

  // 3. If not including collections or no userId, return series only
  if (!includePromotedCollections || !userId) {
    const sortedItems = sortGridItems(seriesItems, seriesOptions.sortBy, seriesOptions.sortOrder);

    // Apply pagination if specified
    const page = seriesOptions.page || 1;
    const limit = seriesOptions.limit;
    const paginatedItems = limit
      ? sortedItems.slice((page - 1) * limit, page * limit)
      : sortedItems;

    return {
      items: paginatedItems,
      total: sortedItems.length,
      page: limit ? page : 1,
      limit: limit || sortedItems.length,
      totalPages: limit ? Math.ceil(sortedItems.length / limit) : 1,
    };
  }

  // 4. Get promoted collections with filtering
  // Import dynamically to avoid circular dependency
  const { getPromotedCollectionsForGrid } = await import('./collection.service.js');

  const promotedCollections = await getPromotedCollectionsForGrid(userId, {
    search: seriesOptions.search,
    publisher: seriesOptions.publisher,
    type: seriesOptions.type,
    genres: seriesOptions.genres,
    hasUnread: seriesOptions.hasUnread,
    libraryId: seriesOptions.libraryId,
  });

  // 5. Convert collections to GridItem format
  const collectionItems: GridItem[] = promotedCollections.map((c) => ({
    itemType: 'collection' as const,
    id: c.id,
    name: c.name,
    startYear: c.startYear,
    publisher: c.publisher,
    genres: c.genres,
    issueCount: c.totalIssues,
    readCount: c.readIssues,
    updatedAt: c.contentUpdatedAt ?? c.updatedAt,
    createdAt: c.createdAt,
    collection: c,
  }));

  // 6. Merge and sort combined list
  const allItems = [...seriesItems, ...collectionItems];
  const sortedItems = sortGridItems(allItems, seriesOptions.sortBy, seriesOptions.sortOrder);

  // 7. Apply pagination if specified
  const page = seriesOptions.page || 1;
  const limit = seriesOptions.limit;
  const paginatedItems = limit
    ? sortedItems.slice((page - 1) * limit, page * limit)
    : sortedItems;

  return {
    items: paginatedItems,
    total: sortedItems.length,
    page: limit ? page : 1,
    limit: limit || sortedItems.length,
    totalPages: limit ? Math.ceil(sortedItems.length / limit) : 1,
  };
}
