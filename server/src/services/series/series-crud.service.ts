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
  SeriesDefinition,
  readSeriesJson,
  writeSeriesJson,
  getSeriesDefinitions,
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
  SeriesBrowseOptions,
  SeriesBrowseItem,
  SeriesBrowseResult,
} from './series.types.js';
import { getSeriesByIdentity } from './series-lookup.service.js';
import { onSeriesMetadataChanged } from '../collection/index.js';
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
 * Get cursor-based paginated list of Series for browse page.
 * Optimized for infinite scroll with large datasets (5000+ series).
 *
 * Uses keyset pagination for stable results across pages.
 * Returns minimal data per series to reduce payload size.
 */
export async function getSeriesBrowseList(
  options: SeriesBrowseOptions = {}
): Promise<SeriesBrowseResult> {
  const db = getDatabase();
  const {
    cursor,
    limit = 100,
    sortBy = 'name',
    sortOrder = 'asc',
    libraryId,
    userId,
    search,
    publisher,
    type,
    genres,
    readStatus,
  } = options;

  // Cap limit at 200 for performance
  const effectiveLimit = Math.min(limit, 200);

  // Decode cursor if provided (format: "sortValue|id")
  let cursorData: { sortValue: string; id: string } | null = null;
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const separatorIndex = decoded.lastIndexOf('|');
      if (separatorIndex > -1) {
        cursorData = {
          sortValue: decoded.substring(0, separatorIndex),
          id: decoded.substring(separatorIndex + 1),
        };
      }
    } catch {
      // Invalid cursor, ignore and start from beginning
    }
  }

  // Build base where clause
  const baseWhere: Prisma.SeriesWhereInput = {
    deletedAt: null,
    isHidden: false,
  };

  // Filter by library if provided
  if (libraryId) {
    baseWhere.issues = {
      some: { libraryId },
    };
  }

  // Search filter (contains on name - SQLite LIKE is case-insensitive by default)
  if (search && search.trim()) {
    baseWhere.name = {
      contains: search.trim(),
    };
  }

  // Publisher filter
  if (publisher) {
    baseWhere.publisher = publisher;
  }

  // Type filter
  if (type) {
    baseWhere.type = type;
  }

  // Genre filter (OR logic - match if any genre in the list)
  // SQLite LIKE is case-insensitive by default
  if (genres && genres.length > 0) {
    baseWhere.OR = genres.map(genre => ({
      genres: {
        contains: genre,
      },
    }));
  }

  // Read status filter (requires userId)
  // Note: SeriesProgress tracks totalRead (issues read) and totalOwned (total issues)
  // unread: no progress record OR totalRead = 0
  // reading: 0 < totalRead < totalOwned
  // completed: totalRead >= totalOwned AND totalOwned > 0
  if (readStatus && userId) {
    const existingAnd = Array.isArray(baseWhere.AND) ? baseWhere.AND : [];

    if (readStatus === 'unread') {
      // Series with no progress for this user, or totalRead = 0
      baseWhere.AND = [
        ...existingAnd,
        {
          OR: [
            { progress: { none: { userId } } },
            { progress: { some: { userId, totalRead: 0 } } },
          ],
        },
      ];
    } else if (readStatus === 'reading') {
      // Series where user has started but not finished
      // A series is "reading" if:
      // - User has read at least one issue (totalRead > 0)
      // - There are still unread issues (nextUnreadFileId is not null)
      baseWhere.AND = [
        ...existingAnd,
        {
          progress: {
            some: {
              userId,
              totalRead: { gt: 0 },
              nextUnreadFileId: { not: null },
            },
          },
        },
      ];
    } else if (readStatus === 'completed') {
      // Series where user has read all owned issues
      // A series is "completed" if:
      // - User owns at least one issue (totalOwned > 0)
      // - No next unread file (all issues read)
      // - No issues currently in progress
      baseWhere.AND = [
        ...existingAnd,
        {
          progress: {
            some: {
              userId,
              totalOwned: { gt: 0 },
              nextUnreadFileId: null,
              totalInProgress: 0,
            },
          },
        },
      ];
    }
  }

  // Build cursor condition for keyset pagination
  // (sortValue > cursor) OR (sortValue = cursor AND id > cursorId)
  // Note: issueCount sorting uses _count which doesn't support direct cursor comparison
  let cursorCondition: Prisma.SeriesWhereInput | undefined;
  if (cursorData && sortBy !== 'issueCount') {
    const sortValue = sortBy === 'name'
      ? cursorData.sortValue
      : sortBy === 'startYear'
        ? (cursorData.sortValue === 'null' ? null : parseInt(cursorData.sortValue, 10))
        : new Date(cursorData.sortValue);

    if (sortOrder === 'asc') {
      cursorCondition = {
        OR: [
          { [sortBy]: { gt: sortValue } },
          {
            AND: [
              { [sortBy]: sortValue },
              { id: { gt: cursorData.id } },
            ],
          },
        ],
      };
    } else {
      cursorCondition = {
        OR: [
          { [sortBy]: { lt: sortValue } },
          {
            AND: [
              { [sortBy]: sortValue },
              { id: { lt: cursorData.id } },
            ],
          },
        ],
      };
    }
  }

  // For issueCount sorting, we use skip-based pagination with the cursor as offset
  // The cursor format for issueCount is "offset|id" where offset is the number to skip
  let skipCount = 0;
  if (cursorData && sortBy === 'issueCount') {
    skipCount = parseInt(cursorData.sortValue, 10) || 0;
  }

  // Combine where conditions
  const where: Prisma.SeriesWhereInput = cursorCondition
    ? { AND: [baseWhere, cursorCondition] }
    : baseWhere;

  // Build orderBy with tie-breaker
  // For issueCount, use relation count ordering
  const orderBy: Prisma.SeriesOrderByWithRelationInput[] = sortBy === 'issueCount'
    ? [
        { issues: { _count: sortOrder } },
        { id: sortOrder }, // Tie-breaker
      ]
    : [
        { [sortBy]: sortOrder },
        { id: sortOrder }, // Tie-breaker for stable pagination
      ];

  // Fetch one extra to determine hasMore
  const fetchLimit = effectiveLimit + 1;

  // Query with minimal includes for performance
  const series = await db.series.findMany({
    where,
    orderBy,
    take: fetchLimit,
    ...(skipCount > 0 && { skip: skipCount }),
    select: {
      id: true,
      name: true,
      startYear: true,
      publisher: true,
      coverHash: true,
      coverSource: true,
      coverFileId: true,
      _count: { select: { issues: true } },
      issues: {
        take: 1,
        orderBy: [
          { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
          { filename: 'asc' },
        ],
        select: { id: true, coverHash: true },
      },
      ...(userId && {
        progress: {
          where: { userId },
          select: { totalRead: true },
        },
      }),
    },
  });

  // Determine if there are more results
  const hasMore = series.length > effectiveLimit;
  const items = series.slice(0, effectiveLimit);

  // Build next cursor from last item
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    // Defensive check - shouldn't happen if items.length > 0, but avoids non-null assertion
    if (lastItem) {
      let sortValue: string;

      if (sortBy === 'issueCount') {
        // For issueCount, cursor contains the offset for next page
        sortValue = String(skipCount + effectiveLimit);
      } else if (sortBy === 'name') {
        sortValue = lastItem.name;
      } else if (sortBy === 'startYear') {
        sortValue = lastItem.startYear?.toString() ?? 'null';
      } else {
        sortValue = (lastItem as { updatedAt?: Date }).updatedAt?.toISOString() ?? '';
      }

      nextCursor = Buffer.from(`${sortValue}|${lastItem.id}`).toString('base64');
    }
  }

  // Transform to SeriesBrowseItem format
  const browseItems: SeriesBrowseItem[] = items.map((s) => {
    // Handle progress which may be array or undefined
    const progressArray = (s as { progress?: Array<{ totalRead: number }> }).progress;
    const readCount = progressArray?.[0]?.totalRead ?? 0;

    return {
      id: s.id,
      name: s.name,
      startYear: s.startYear,
      publisher: s.publisher,
      coverHash: s.coverHash,
      coverSource: s.coverSource,
      coverFileId: s.coverFileId,
      firstIssueId: s.issues[0]?.id ?? null,
      firstIssueCoverHash: s.issues[0]?.coverHash ?? null,
      issueCount: s._count.issues,
      readCount,
    };
  });

  // Get total count only on first page (no cursor) for display purposes
  let totalCount = -1;
  if (!cursor) {
    totalCount = await db.series.count({ where: baseWhere });
  }

  return {
    items: browseItems,
    nextCursor,
    hasMore,
    totalCount,
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

  // Helper to validate coverFileId exists
  const validateCoverFile = async (fileId: string): Promise<boolean> => {
    const file = await db.comicFile.findUnique({
      where: { id: fileId },
      select: { id: true },
    });
    if (!file) {
      // File was deleted - clear invalid reference
      await db.series.update({
        where: { id: seriesId },
        data: { coverFileId: null },
      });
      // Trigger recalculation for next request (non-blocking)
      import('../cover.service.js')
        .then(({ recalculateSeriesCover }) => recalculateSeriesCover(seriesId))
        .catch(() => { /* Non-critical */ });
      return false;
    }
    return true;
  };

  // Check cover source preference
  if (series.coverSource === 'api' && series.coverHash) {
    return { type: 'api', coverHash: series.coverHash };
  }

  if (series.coverSource === 'user' && series.coverFileId) {
    if (await validateCoverFile(series.coverFileId)) {
      return { type: 'user', fileId: series.coverFileId };
    }
    // File was deleted, fall through to first issue
  }

  // Auto fallback: API (with downloaded cover) > User > First Issue
  if (series.coverHash) {
    return { type: 'api', coverHash: series.coverHash };
  }

  if (series.coverFileId) {
    if (await validateCoverFile(series.coverFileId)) {
      return { type: 'user', fileId: series.coverFileId };
    }
    // File was deleted, fall through to first issue
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

  // Validate file exists and belongs to this series
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    select: { id: true, seriesId: true, filename: true },
  });

  if (!file) {
    throw new Error(`File ${fileId} not found`);
  }

  if (file.seriesId !== seriesId) {
    throw new Error(
      `File "${file.filename}" does not belong to this series`
    );
  }

  await db.series.update({
    where: { id: seriesId },
    data: {
      coverSource: 'user',
      coverFileId: fileId,
    },
  });

  // Recalculate resolved cover
  const { onCoverSourceChanged } = await import('../cover.service.js');
  await onCoverSourceChanged('series', seriesId);
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

  // Recalculate resolved cover
  const { onCoverSourceChanged } = await import('../cover.service.js');
  await onCoverSourceChanged('series', seriesId);

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

/**
 * Find all series with no issues (empty series).
 * These are series that exist in the database but have no ComicFiles linked to them.
 * Only returns active (non-deleted) series.
 */
export async function findEmptySeries(): Promise<
  Array<{
    id: string;
    name: string;
    publisher: string | null;
    startYear: number | null;
    createdAt: Date;
  }>
> {
  const db = getDatabase();

  return db.series.findMany({
    where: {
      deletedAt: null,
      issues: {
        none: {},
      },
    },
    select: {
      id: true,
      name: true,
      publisher: true,
      startYear: true,
      createdAt: true,
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Clean up (soft-delete) all series that have no issues.
 * Returns the count of series that were soft-deleted.
 */
export async function cleanupEmptySeries(): Promise<{
  deletedCount: number;
  seriesNames: string[];
}> {
  const db = getDatabase();

  // Find all empty series
  const emptySeries = await findEmptySeries();

  if (emptySeries.length === 0) {
    return { deletedCount: 0, seriesNames: [] };
  }

  const seriesIds = emptySeries.map((s) => s.id);
  const seriesNames = emptySeries.map((s) => s.name);

  // Soft-delete all empty series
  await db.series.updateMany({
    where: { id: { in: seriesIds } },
    data: { deletedAt: new Date() },
  });

  // Mark collection items referencing these series as unavailable
  await db.collectionItem.updateMany({
    where: { seriesId: { in: seriesIds } },
    data: { isAvailable: false },
  });

  // Mark smart collections dirty
  markSmartCollectionsDirty({
    seriesIds,
    reason: 'item_deleted',
  }).catch(() => {
    // Errors are logged inside markSmartCollectionsDirty
  });

  return {
    deletedCount: emptySeries.length,
    seriesNames,
  };
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
 * Options for bulk series updates.
 */
export interface BulkUpdateSeriesOptions {
  /** If false, skip syncing to series.json files (default: true) */
  syncToSeriesJson?: boolean;
}

/**
 * Bulk update metadata fields across multiple series.
 * Only updates fields that are explicitly provided (not undefined).
 * By default, syncs changes to series.json files (opt-out via options).
 */
export async function bulkUpdateSeries(
  seriesIds: string[],
  updates: BulkSeriesUpdateInput,
  options: BulkUpdateSeriesOptions = {}
): Promise<BulkOperationResult> {
  const { syncToSeriesJson: shouldSync = true } = options;
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

    // Sync to series.json files if enabled (default: true, opt-out)
    if (shouldSync) {
      // Fire-and-forget bulk sync to avoid blocking response
      import('../series-json-sync.service.js').then(({ bulkSyncToSeriesJson }) => {
        bulkSyncToSeriesJson(successfulSeriesIds).catch(() => {
          // Errors are logged inside bulkSyncToSeriesJson
        });
      }).catch(() => {
        // Import error - non-critical
      });
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
// Series.json Sync
// =============================================================================

/**
 * Sync a Series record to its series.json file.
 *
 * This is a wrapper around the unified sync service for backward compatibility.
 * @see syncSeriesToSeriesJson in series-json-sync.service.ts
 */
export async function syncSeriesToSeriesJson(seriesId: string): Promise<void> {
  const { syncSeriesToSeriesJson: unifiedSync } = await import('../series-json-sync.service.js');
  await unifiedSync(seriesId);
}

/**
 * Sync series.json to Series record(s).
 * Handles both v1 (single-series) and v2 (multi-series) formats.
 * Uses the correct identity lookup (name + publisher only, not startYear).
 *
 * For multi-series format, creates/updates all series and returns the first one.
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
  const definitions = getSeriesDefinitions(metadata);

  if (definitions.length === 0) {
    return null;
  }

  const createdSeries: Series[] = [];

  // Process each series definition
  for (const definition of definitions) {
    const series = await syncSeriesDefinitionToDb(definition, folderPath, db);
    if (series) {
      createdSeries.push(series);
    }
  }

  // Return first series (backward compatibility for single-series callers)
  return createdSeries[0] ?? null;
}

/**
 * Sync a single SeriesDefinition to the database.
 * Internal helper for syncSeriesFromSeriesJson.
 */
async function syncSeriesDefinitionToDb(
  definition: SeriesDefinition,
  folderPath: string,
  db: ReturnType<typeof getDatabase>
): Promise<Series | null> {
  // Find existing series by identity (name + publisher only)
  let series = await getSeriesByIdentity(
    definition.name,
    null, // startYear is not part of identity
    definition.publisher ?? null,
    true // Include deleted series so we can restore them
  );

  const seriesData = {
    name: definition.name,
    startYear: definition.startYear ?? null,
    publisher: definition.publisher ?? null,
    endYear: definition.endYear ?? null,
    deck: definition.deck ?? null,
    summary: definition.summary ?? null,
    coverUrl: definition.coverUrl ?? null,
    issueCount: definition.issueCount ?? null,
    genres: definition.genres?.join(',') ?? null,
    tags: definition.tags?.join(',') ?? null,
    characters: definition.characters?.join(',') ?? null,
    teams: definition.teams?.join(',') ?? null,
    storyArcs: definition.storyArcs?.join(',') ?? null,
    locations: definition.locations?.join(',') ?? null,
    volume: definition.volume ?? null,
    type: definition.type ?? 'western',
    ageRating: definition.ageRating ?? null,
    languageISO: definition.languageISO ?? null,
    comicVineId: definition.comicVineSeriesId ?? null,
    metronId: definition.metronSeriesId ?? null,
    anilistId: definition.anilistId ?? null,
    malId: definition.malId ?? null,
    userNotes: definition.userNotes ?? null,
    aliases: definition.aliases?.join(',') ?? null,
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
