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
  progress?: SeriesProgress | null;
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
// CRUD Operations
// =============================================================================

/**
 * Create a new Series record.
 * Identity is based on name + publisher only (year excluded to avoid splitting multi-year runs).
 */
export async function createSeries(input: CreateSeriesInput): Promise<Series> {
  const db = getDatabase();

  // Check for existing series with same identity (name + publisher, not year)
  const existing = await db.series.findFirst({
    where: {
      name: input.name,
      publisher: input.publisher ?? null,
    },
  });

  if (existing) {
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
 */
export async function getSeries(
  seriesId: string
): Promise<SeriesWithCounts | null> {
  const db = getDatabase();

  return db.series.findUnique({
    where: { id: seriesId },
    include: {
      _count: {
        select: { issues: true },
      },
      progress: true,
    },
  });
}

/**
 * Get a Series by its unique identity (name + publisher only).
 * Year is not part of the identity to avoid splitting multi-year runs.
 */
export async function getSeriesByIdentity(
  name: string,
  _startYear: number | null | undefined, // Kept for API compatibility, but not used in lookup
  publisher: string | null | undefined
): Promise<Series | null> {
  const db = getDatabase();

  return db.series.findFirst({
    where: {
      name,
      publisher: publisher ?? null,
    },
  });
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
    limit = 50,
    sortBy = 'name',
    sortOrder = 'asc',
    search,
    publisher,
    type,
    genres,
    hasUnread,
  } = options;

  // Build where clause
  const where: Prisma.SeriesWhereInput = {};

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

  // Build orderBy
  const orderBy: Prisma.SeriesOrderByWithRelationInput = {};
  if (sortBy === 'issueCount') {
    orderBy.issues = { _count: sortOrder };
  } else {
    orderBy[sortBy] = sortOrder;
  }

  // Get total count
  const total = await db.series.count({ where });

  // Get paginated series
  let seriesRecords = await db.series.findMany({
    where,
    orderBy,
    skip: (page - 1) * limit,
    take: limit,
    include: {
      _count: {
        select: { issues: true },
      },
      progress: true,
      // Include first issue for cover fallback
      issues: {
        take: 1,
        orderBy: [
          { metadata: { number: 'asc' } },
          { filename: 'asc' },
        ],
        select: { id: true },
      },
    },
  });

  // Filter by hasUnread if specified
  if (hasUnread !== undefined) {
    seriesRecords = seriesRecords.filter((series) => {
      const owned = series.progress?.totalOwned ?? series._count?.issues ?? 0;
      const read = series.progress?.totalRead ?? 0;
      const hasUnreadIssues = read < owned;
      return hasUnread ? hasUnreadIssues : !hasUnreadIssues;
    });
  }

  return {
    series: seriesRecords,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
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

  return db.series.update({
    where: { id: seriesId },
    data: dataToUpdate as Prisma.SeriesUpdateInput,
  });
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
 */
export async function searchSeries(
  query: string,
  limit = 10
): Promise<Series[]> {
  const db = getDatabase();

  // Search in name and aliases
  return db.series.findMany({
    where: {
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
  const { downloadApiCover } = await import('./cover.service.js');
  const db = getDatabase();

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
 */
export async function findSeriesByAlias(alias: string): Promise<Series | null> {
  const db = getDatabase();

  return db.series.findFirst({
    where: {
      aliases: { contains: alias },
    },
  });
}

// =============================================================================
// Progress Tracking
// =============================================================================

/**
 * Get or create SeriesProgress for a series.
 */
export async function getSeriesProgress(
  seriesId: string
): Promise<SeriesProgress | null> {
  const db = getDatabase();

  let progress = await db.seriesProgress.findUnique({
    where: { seriesId },
  });

  if (!progress) {
    // Create progress record
    progress = await db.seriesProgress.create({
      data: {
        seriesId,
        totalOwned: 0,
        totalRead: 0,
        totalInProgress: 0,
      },
    });
  }

  return progress;
}

/**
 * Update SeriesProgress based on current reading state.
 */
export async function updateSeriesProgress(seriesId: string): Promise<void> {
  const db = getDatabase();

  // Get all issues for this series
  const issues = await db.comicFile.findMany({
    where: { seriesId },
    include: {
      readingProgress: true,
      metadata: true,
    },
    orderBy: {
      metadata: {
        number: 'asc',
      },
    },
  });

  const totalOwned = issues.length;
  const completedIssues = issues.filter((i) => i.readingProgress?.completed);
  const totalRead = completedIssues.length;
  const totalInProgress = issues.filter(
    (i) =>
      i.readingProgress &&
      !i.readingProgress.completed &&
      i.readingProgress.currentPage > 0
  ).length;

  // Find last read issue
  const issuesWithProgress = issues.filter((i) => i.readingProgress?.lastReadAt);
  issuesWithProgress.sort((a, b) => {
    const aDate = a.readingProgress?.lastReadAt ?? new Date(0);
    const bDate = b.readingProgress?.lastReadAt ?? new Date(0);
    return bDate.getTime() - aDate.getTime();
  });

  const lastReadIssue = issuesWithProgress[0];
  const lastReadIssueNum = lastReadIssue?.metadata?.number
    ? parseFloat(lastReadIssue.metadata.number)
    : null;

  // Find next unread issue (Last Read +1 logic)
  let nextUnreadFileId: string | null = null;
  if (lastReadIssue) {
    // Find the issue after the last read one
    const lastReadIndex = issues.findIndex((i) => i.id === lastReadIssue.id);
    for (let i = lastReadIndex + 1; i < issues.length; i++) {
      const issue = issues[i];
      if (issue && !issue.readingProgress?.completed) {
        nextUnreadFileId = issue.id;
        break;
      }
    }
  } else {
    // No reading progress - first unread issue
    const firstUnread = issues.find((i) => !i.readingProgress?.completed);
    nextUnreadFileId = firstUnread?.id ?? null;
  }

  // Upsert progress
  await db.seriesProgress.upsert({
    where: { seriesId },
    create: {
      seriesId,
      totalOwned,
      totalRead,
      totalInProgress,
      lastReadFileId: lastReadIssue?.id ?? null,
      lastReadIssueNum: Number.isFinite(lastReadIssueNum)
        ? lastReadIssueNum
        : null,
      lastReadAt: lastReadIssue?.readingProgress?.lastReadAt ?? null,
      nextUnreadFileId,
    },
    update: {
      totalOwned,
      totalRead,
      totalInProgress,
      lastReadFileId: lastReadIssue?.id ?? null,
      lastReadIssueNum: Number.isFinite(lastReadIssueNum)
        ? lastReadIssueNum
        : null,
      lastReadAt: lastReadIssue?.readingProgress?.lastReadAt ?? null,
      nextUnreadFileId,
    },
  });
}

/**
 * Get next unread issue for a series (Continue Series feature).
 */
export async function getNextUnreadIssue(
  seriesId: string
): Promise<ComicFile | null> {
  const db = getDatabase();

  // Update progress first
  await updateSeriesProgress(seriesId);

  const progress = await db.seriesProgress.findUnique({
    where: { seriesId },
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

  // Find or create series
  let series = await db.series.findFirst({
    where: {
      name: metadata.seriesName,
      startYear: metadata.startYear ?? null,
      publisher: metadata.publisher ?? null,
    },
  });

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
 */
export async function findPotentialDuplicates(): Promise<
  Array<{ series: Series[]; reason: string }>
> {
  const db = getDatabase();

  // Find series with same name
  const allSeries = await db.series.findMany({
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

  // Move all issues from source series to target
  for (const sourceId of sourceIds) {
    if (sourceId === targetId) continue;

    await db.comicFile.updateMany({
      where: { seriesId: sourceId },
      data: { seriesId: targetId },
    });

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
 */
export async function getAllPublishers(): Promise<string[]> {
  const db = getDatabase();

  const series = await db.series.findMany({
    where: {
      publisher: { not: null },
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
 */
export async function getAllGenres(): Promise<string[]> {
  const db = getDatabase();

  const series = await db.series.findMany({
    where: {
      genres: { not: null },
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
 */
export async function findPotentialDuplicatesEnhanced(): Promise<
  DuplicateGroup[]
> {
  const db = getDatabase();

  const allSeries = await db.series.findMany({
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
