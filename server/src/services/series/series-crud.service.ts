/**
 * Series CRUD Service
 *
 * Core CRUD operations and related management for Series.
 * Part of the Series-Centric Architecture.
 *
 * Design Principles (from SERIES_REWRITE.md):
 * - Series identity: Name + Publisher (unique constraint - year excluded to avoid splitting multi-year runs)
 * - ComicInfo.xml is source of truth for issue-to-series linkage
 * - Full metadata inheritance: Series data flows down to ComicInfo.xml
 * - User edits are sacred (User > API > File priority)
 * - Smart cover fallback: API > User selected > First issue
 */

import { getDatabase } from '../database.service.js';
import type { Series, SeriesProgress, Prisma } from '@prisma/client';
import { refreshTagsFromSeries } from '../tag-autocomplete.service.js';
import {
  SeriesMetadata,
  readSeriesJson,
  writeSeriesJson,
} from '../series-metadata.service.js';
import type {
  SeriesWithCounts,
  SeriesListOptions,
  SeriesListResult,
  CreateSeriesInput,
  UpdateSeriesInput,
  FieldSourceMap,
  SeriesCoverResult,
  BulkSeriesUpdateInput,
  BulkOperationResult,
} from './series.types.js';
import { getSeriesByIdentity } from './series-lookup.service.js';
import { onSeriesMetadataChanged } from '../collection.service.js';
import { markSmartCollectionsDirty } from '../smart-collection-dirty.service.js';

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
      // Include first issue for cover fallback (with coverHash for cache-busting)
      issues: {
        take: 1,
        orderBy: [
          { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
          { filename: 'asc' },
        ],
        select: { id: true, coverHash: true },
      },
    },
  });

  // Filter out soft-deleted unless explicitly requested
  if (series && series.deletedAt && !includeDeleted) {
    return null;
  }

  return series;
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
      // Include first issue for cover fallback using numeric sort (with coverHash for cache-busting)
      issues: {
        take: 1,
        orderBy: [
          { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
          { filename: 'asc' },
        ],
        select: { id: true, coverHash: true },
      },
    },
  });

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

  // Trigger collection recalculation for collections containing this series
  // Fire-and-forget to avoid blocking the update response
  onSeriesMetadataChanged(seriesId).catch(() => {
    // Errors are logged inside onSeriesMetadataChanged
  });

  // Mark smart collections dirty so they can re-evaluate this series
  // This handles the case where metadata changes make the series match/unmatch filters
  markSmartCollectionsDirty({
    seriesIds: [seriesId],
    reason: 'series_metadata',
  }).catch(() => {
    // Errors are logged inside markSmartCollectionsDirty
  });

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
        orderBy: [
          { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
          { filename: 'asc' },
        ],
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
  const { downloadApiCover, deleteSeriesCover } = await import('../cover.service.js');
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

  // Mark smart collections dirty to remove this series from any matching collections
  markSmartCollectionsDirty({
    seriesIds: [seriesId],
    reason: 'item_deleted',
  }).catch(() => {
    // Errors are logged inside markSmartCollectionsDirty
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

      // Trigger collection recalculation (fire-and-forget)
      onSeriesMetadataChanged(seriesId).catch(() => {
        // Errors are logged inside onSeriesMetadataChanged
      });

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

  // Mark smart collections dirty for all successfully updated series
  // Batched to trigger a single debounced evaluation
  const successfulSeriesIds = results.filter((r) => r.success).map((r) => r.seriesId);
  if (successfulSeriesIds.length > 0) {
    markSmartCollectionsDirty({
      seriesIds: successfulSeriesIds,
      reason: 'series_metadata',
    }).catch(() => {
      // Errors are logged inside markSmartCollectionsDirty
    });
  }

  return {
    total: seriesIds.length,
    successful,
    failed,
    results,
  };
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
