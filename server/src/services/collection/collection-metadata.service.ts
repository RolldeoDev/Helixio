/**
 * Collection Metadata Service
 *
 * Handles collection metadata calculation, promoted collections,
 * and the expanded collection detail view.
 */

import { getDatabase } from '../database.service.js';
import { logError, logDebug, createServiceLogger } from '../logger.service.js';
import { scheduleMosaicRegeneration } from './collection-mosaic.service.js';
import { getCollection } from './collection-crud.service.js';
import {
  type Collection,
  type CollectionWithItems,
  type PromotedCollectionWithMeta,
  type PromotedCollectionGridFilters,
  type PromotedCollectionForGrid,
  type ExpandedIssue,
  type CollectionAggregateStats,
  type CollectionNextIssue,
  type CollectionExpandedData,
  type SmartFilter,
  type SortField,
  type SortOrder,
  getMostCommon,
} from './collection.types.js';

const logger = createServiceLogger('collection');

// =============================================================================
// Series Metadata Change Handler
// =============================================================================

/**
 * Recalculate derived metadata for all collections containing a series.
 * Called when a series' metadata (tags, genres, publisher, etc.) changes.
 * This ensures collections that don't have overridden fields get updated values.
 */
export async function onSeriesMetadataChanged(seriesId: string): Promise<void> {
  const db = getDatabase();

  // Find all collections containing this series (via CollectionItem)
  const collectionItems = await db.collectionItem.findMany({
    where: {
      seriesId,
      isAvailable: true,
    },
    select: {
      collectionId: true,
      collection: {
        select: {
          userId: true,
        },
      },
    },
    distinct: ['collectionId'],
  });

  // Recalculate metadata for each affected collection (fire-and-forget)
  for (const item of collectionItems) {
    recalculateCollectionMetadata(item.collectionId, item.collection.userId).catch((err) => {
      logError('collection', err, {
        action: 'recalculate-metadata-on-series-change',
        collectionId: item.collectionId,
        seriesId,
      });
    });
  }

  logDebug('collection', `Triggered metadata recalculation for ${collectionItems.length} collections after series ${seriesId} metadata changed`, {
    seriesId,
    collectionCount: collectionItems.length,
  });
}

// =============================================================================
// Promoted Collections
// =============================================================================

/**
 * Get all promoted collections for a user with aggregated data.
 */
export async function getPromotedCollections(
  userId: string
): Promise<PromotedCollectionWithMeta[]> {
  const db = getDatabase();

  // Get promoted collections with their series items
  const collections = await db.collection.findMany({
    where: {
      userId,
      isPromoted: true,
    },
    orderBy: [{ promotedOrder: 'asc' }, { name: 'asc' }],
    include: {
      items: {
        where: {
          seriesId: { not: null },
          isAvailable: true,
        },
        select: {
          seriesId: true,
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  // Transform to include aggregated data
  return Promise.all(
    collections.map(async (collection) => {
      // Get series IDs from collection items
      const seriesIds = collection.items
        .map((item) => item.seriesId)
        .filter((id): id is string => id !== null);

      // Fetch full series data for these IDs (with first issue for cover fallback)
      const seriesRecords = seriesIds.length > 0
        ? await db.series.findMany({
            where: { id: { in: seriesIds } },
            select: {
              id: true,
              name: true,
              coverHash: true,
              coverUrl: true,
              coverFileId: true,
              publisher: true,
              startYear: true,
              endYear: true,
              genres: true,
              _count: {
                select: { issues: true },
              },
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
          })
        : [];

      // Map for quick lookup while preserving order
      const seriesMap = new Map(seriesRecords.map(s => [s.id, s]));
      const seriesItems = seriesIds
        .map(id => seriesMap.get(id))
        .filter((s): s is typeof seriesRecords[0] => s !== undefined);

      // Calculate aggregate issue count
      const totalIssues = seriesItems.reduce(
        (sum, s) => sum + (s._count?.issues || 0),
        0
      );

      // Calculate read count for this user
      let readIssues = 0;

      if (seriesIds.length > 0) {
        const progressRecords = await db.seriesProgress.findMany({
          where: {
            userId,
            seriesId: { in: seriesIds },
          },
          select: { totalRead: true },
        });
        readIssues = progressRecords.reduce((sum, p) => sum + p.totalRead, 0);
      }

      // Derive metadata from series
      const publishers = seriesItems
        .map((s) => s.publisher)
        .filter((p): p is string => !!p);
      const mostCommonPublisher =
        publishers.length > 0
          ? publishers.sort(
              (a: string, b: string) =>
                publishers.filter((v: string) => v === b).length -
                publishers.filter((v: string) => v === a).length
            )[0]
          : null;

      const years = seriesItems
        .map((s) => s.startYear)
        .filter((y): y is number => y !== null);
      const minYear = years.length > 0 ? Math.min(...years) : null;

      const endYears = seriesItems
        .map((s) => s.endYear)
        .filter((y): y is number => y !== null);
      const maxYear = endYears.length > 0 ? Math.max(...endYears) : null;

      const allGenres = seriesItems
        .flatMap((s) => (s.genres || '').split(',').map((g: string) => g.trim()))
        .filter((g: string) => g.length > 0);
      const uniqueGenres = [...new Set(allGenres)].slice(0, 5).join(', ');

      // Get cover series info for mosaic
      const seriesCovers = seriesItems.slice(0, 6).map((s) => ({
        id: s.id,
        coverHash: s.coverHash,
        coverUrl: s.coverUrl,
        coverFileId: s.coverFileId,
        name: s.name,
        firstIssueId: s.issues[0]?.id ?? null,
        firstIssueCoverHash: s.issues[0]?.coverHash ?? null,
      }));

      return {
        id: collection.id,
        userId: collection.userId,
        name: collection.name,
        description: collection.description,
        isPromoted: collection.isPromoted,
        promotedOrder: collection.promotedOrder,
        coverType: collection.coverType,
        coverSeriesId: collection.coverSeriesId,
        coverFileId: collection.coverFileId,
        coverHash: collection.coverHash,
        // Use override if set, otherwise use derived
        publisher: collection.overridePublisher ?? mostCommonPublisher ?? null,
        startYear: collection.overrideStartYear ?? minYear ?? null,
        endYear: collection.overrideEndYear ?? maxYear ?? null,
        genres: collection.overrideGenres ?? (uniqueGenres || null),
        totalIssues,
        readIssues,
        seriesCovers,
        seriesCount: seriesItems.length,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      };
    })
  );
}

/**
 * Get promoted collections for grid display with filtering support.
 * Filters are applied based on derived/override metadata.
 * Collections are returned with library IDs for library filtering.
 * Uses batch queries for O(1) database calls instead of O(n) per collection.
 */
export async function getPromotedCollectionsForGrid(
  userId: string,
  filters: PromotedCollectionGridFilters = {}
): Promise<PromotedCollectionForGrid[]> {
  const db = getDatabase();

  // Get promoted collections with their items
  const collections = await db.collection.findMany({
    where: {
      userId,
      isPromoted: true,
    },
    orderBy: [{ promotedOrder: 'asc' }, { name: 'asc' }],
    include: {
      items: {
        where: { isAvailable: true },
        orderBy: { position: 'asc' },
      },
    },
  });

  // Early return if no collections
  if (collections.length === 0) {
    return [];
  }

  // 1. Collect ALL series IDs and file IDs across ALL collections
  const allSeriesIds = new Set<string>();
  const allFileIds = new Set<string>();

  for (const collection of collections) {
    for (const item of collection.items) {
      if (item.seriesId) allSeriesIds.add(item.seriesId);
      if (item.fileId) allFileIds.add(item.fileId);
    }
  }

  // 2. Batch fetch ALL data in parallel (4 queries instead of N*4)
  const [allSeries, allFiles, allProgress, allReadFiles] = await Promise.all([
    // Fetch all series
    allSeriesIds.size > 0
      ? db.series.findMany({
          where: { id: { in: Array.from(allSeriesIds) } },
          select: {
            id: true,
            name: true,
            publisher: true,
            startYear: true,
            endYear: true,
            genres: true,
            coverHash: true,
            coverUrl: true,
            coverFileId: true,
            updatedAt: true,
            _count: { select: { issues: true } },
            issues: {
              select: { id: true, libraryId: true, coverHash: true },
              take: 1,
              orderBy: [
                { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
                { filename: 'asc' },
              ],
            },
          },
        })
      : [],

    // Fetch all files
    allFileIds.size > 0
      ? db.comicFile.findMany({
          where: { id: { in: Array.from(allFileIds) } },
          select: {
            id: true,
            libraryId: true,
            updatedAt: true,
            metadata: {
              select: {
                publisher: true,
                year: true,
                genre: true,
              },
            },
          },
        })
      : [],

    // Fetch all series progress for this user
    allSeriesIds.size > 0
      ? db.seriesProgress.findMany({
          where: {
            userId,
            seriesId: { in: Array.from(allSeriesIds) },
          },
          select: { seriesId: true, totalRead: true },
        })
      : [],

    // Fetch all read file IDs for this user
    allFileIds.size > 0
      ? db.userReadingProgress.findMany({
          where: {
            userId,
            fileId: { in: Array.from(allFileIds) },
            completed: true,
          },
          select: { fileId: true },
        })
      : [],
  ]);

  // 3. Build lookup maps for O(1) access
  const seriesMap = new Map(allSeries.map(s => [s.id, s]));
  const fileMap = new Map(allFiles.map(f => [f.id, f]));
  const progressMap = new Map(allProgress.map(p => [p.seriesId, p.totalRead]));
  const readFileSet = new Set(allReadFiles.map(r => r.fileId));

  // Transform and filter collections
  const result: PromotedCollectionForGrid[] = [];

  for (const collection of collections) {
    // Get series and file items for this collection from maps
    const seriesItems = collection.items
      .filter((item) => item.seriesId !== null)
      .map((item) => seriesMap.get(item.seriesId!))
      .filter((s): s is NonNullable<typeof s> => s !== undefined);

    const fileItems = collection.items
      .filter((item) => item.fileId !== null)
      .map((item) => fileMap.get(item.fileId!))
      .filter((f): f is NonNullable<typeof f> => f !== undefined);

    // Calculate derived metadata from series
    const publishers = seriesItems
      .map(s => s.publisher)
      .filter((p): p is string => !!p);
    const mostCommonPublisher = publishers.length > 0
      ? getMostCommon(publishers)
      : null;

    const years = seriesItems
      .map(s => s.startYear)
      .filter((y): y is number => y !== null);
    const minYear = years.length > 0 ? Math.min(...years) : null;

    const endYears = seriesItems
      .map(s => s.endYear)
      .filter((y): y is number => y !== null);
    const maxYear = endYears.length > 0 ? Math.max(...endYears) : null;

    const allGenres = seriesItems
      .flatMap(s => (s.genres || '').split(',').map(g => g.trim()))
      .filter(g => g.length > 0);
    const uniqueGenres = [...new Set(allGenres)].slice(0, 5).join(', ');

    // Effective metadata (override takes precedence)
    const effectivePublisher = collection.overridePublisher ?? mostCommonPublisher ?? 'Collections';
    const effectiveStartYear = collection.overrideStartYear ?? minYear;
    const effectiveEndYear = collection.overrideEndYear ?? maxYear;
    const effectiveGenres = collection.overrideGenres ?? (uniqueGenres || null);

    // Calculate aggregate issue count
    const totalIssues = seriesItems.reduce(
      (sum, s) => sum + (s._count?.issues || 0),
      0
    ) + fileItems.length;

    // Calculate read count from pre-fetched maps (O(1) lookups)
    let readIssues = seriesItems.reduce(
      (sum, s) => sum + (progressMap.get(s.id) ?? 0),
      0
    );
    readIssues += fileItems.filter(f => readFileSet.has(f.id)).length;

    // Collect library IDs from series and files
    const libraryIds = new Set<string>();
    for (const series of seriesItems) {
      if (series.issues?.[0]?.libraryId) {
        libraryIds.add(series.issues[0].libraryId);
      }
    }
    for (const file of fileItems) {
      libraryIds.add(file.libraryId);
    }

    // Find the most recent update time
    let contentUpdatedAt: Date | null = null;
    for (const series of seriesItems) {
      if (!contentUpdatedAt || series.updatedAt > contentUpdatedAt) {
        contentUpdatedAt = series.updatedAt;
      }
    }
    for (const file of fileItems) {
      if (!contentUpdatedAt || file.updatedAt > contentUpdatedAt) {
        contentUpdatedAt = file.updatedAt;
      }
    }

    // Apply filters
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!collection.name.toLowerCase().includes(searchLower)) {
        continue; // Skip this collection
      }
    }

    // Publisher filter
    if (filters.publisher && effectivePublisher !== filters.publisher) {
      continue;
    }

    // Type filter (only applies if collection has series - file-only collections pass)
    // Note: Collections don't have a type field, so we skip this filter
    // or could check if majority of series match the type

    // Genres filter (must match ALL selected genres)
    if (filters.genres && filters.genres.length > 0) {
      const collectionGenres = (effectiveGenres || '')
        .split(',')
        .map(g => g.trim().toLowerCase())
        .filter(g => g.length > 0);

      const hasAllGenres = filters.genres.every(g =>
        collectionGenres.some(cg => cg.includes(g.toLowerCase()))
      );
      if (!hasAllGenres) {
        continue;
      }
    }

    // Has unread filter (any unread content)
    if (filters.hasUnread !== undefined) {
      const hasUnreadContent = readIssues < totalIssues;
      if (filters.hasUnread !== hasUnreadContent) {
        continue;
      }
    }

    // Library filter (any content from selected library)
    if (filters.libraryId && !libraryIds.has(filters.libraryId)) {
      continue;
    }

    // Get cover series info for mosaic
    const seriesCovers = seriesItems.slice(0, 6).map(s => ({
      id: s.id,
      coverHash: s.coverHash,
      coverUrl: s.coverUrl,
      coverFileId: s.coverFileId,
      name: s.name,
      firstIssueId: s.issues[0]?.id ?? null,
      firstIssueCoverHash: s.issues[0]?.coverHash ?? null,
    }));

    result.push({
      id: collection.id,
      userId: collection.userId,
      name: collection.name,
      description: collection.description,
      isPromoted: collection.isPromoted,
      promotedOrder: collection.promotedOrder,
      coverType: collection.coverType,
      coverSeriesId: collection.coverSeriesId,
      coverFileId: collection.coverFileId,
      coverHash: collection.coverHash,
      publisher: effectivePublisher,
      startYear: effectiveStartYear,
      endYear: effectiveEndYear,
      genres: effectiveGenres,
      totalIssues,
      readIssues,
      seriesCount: seriesItems.length,
      seriesCovers,
      libraryIds: Array.from(libraryIds),
      contentUpdatedAt,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    });
  }

  return result;
}

/**
 * Toggle collection promotion status.
 */
export async function toggleCollectionPromotion(
  userId: string,
  collectionId: string
): Promise<Collection> {
  const db = getDatabase();

  // Verify ownership
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  // If promoting, get the next order
  let promotedOrder: number | null = null;
  if (!collection.isPromoted) {
    const maxOrder = await db.collection.findFirst({
      where: { userId, isPromoted: true },
      orderBy: { promotedOrder: 'desc' },
      select: { promotedOrder: true },
    });
    promotedOrder = (maxOrder?.promotedOrder ?? -1) + 1;
  }

  const updated = await db.collection.update({
    where: { id: collectionId },
    data: {
      isPromoted: !collection.isPromoted,
      promotedOrder: !collection.isPromoted ? promotedOrder : null,
    },
  });

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    description: updated.description,
    deck: updated.deck,
    isSystem: updated.isSystem,
    systemKey: updated.systemKey,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    isPromoted: updated.isPromoted,
    promotedOrder: updated.promotedOrder,
    coverType: updated.coverType as 'auto' | 'series' | 'issue' | 'custom' | undefined,
    coverSeriesId: updated.coverSeriesId,
    coverFileId: updated.coverFileId,
    coverHash: updated.coverHash,
    derivedPublisher: updated.derivedPublisher,
    derivedStartYear: updated.derivedStartYear,
    derivedEndYear: updated.derivedEndYear,
    derivedGenres: updated.derivedGenres,
    derivedTags: updated.derivedTags,
    derivedIssueCount: updated.derivedIssueCount,
    derivedReadCount: updated.derivedReadCount,
    overridePublisher: updated.overridePublisher,
    overrideStartYear: updated.overrideStartYear,
    overrideEndYear: updated.overrideEndYear,
    overrideGenres: updated.overrideGenres,
    // Lock flags
    lockName: updated.lockName,
    lockDeck: updated.lockDeck,
    lockDescription: updated.lockDescription,
    lockPublisher: updated.lockPublisher,
    lockStartYear: updated.lockStartYear,
    lockEndYear: updated.lockEndYear,
    lockGenres: updated.lockGenres,
    // New fields
    rating: updated.rating,
    notes: updated.notes,
    visibility: updated.visibility,
    readingMode: updated.readingMode,
    readerPresetId: updated.readerPresetId,
    tags: updated.tags,
  };
}

// =============================================================================
// Metadata Calculation
// =============================================================================

/**
 * Recalculate derived metadata for a collection.
 * Call this when items are added/removed from the collection.
 * Updates: derivedPublisher, derivedStartYear, derivedEndYear, derivedGenres,
 *          derivedIssueCount, derivedReadCount, contentUpdatedAt, metadataUpdatedAt
 */
export async function recalculateCollectionMetadata(
  collectionId: string,
  userId: string
): Promise<void> {
  const db = getDatabase();

  // Get all items in the collection
  const items = await db.collectionItem.findMany({
    where: {
      collectionId,
      isAvailable: true,
    },
  });

  // Get series IDs and file IDs
  const seriesIds = items
    .filter((item) => item.seriesId !== null)
    .map((item) => item.seriesId!);

  const fileIds = items
    .filter((item) => item.fileId !== null)
    .map((item) => item.fileId!);

  // Fetch series data
  const seriesItems = seriesIds.length > 0
    ? await db.series.findMany({
        where: { id: { in: seriesIds } },
        select: {
          id: true,
          publisher: true,
          startYear: true,
          endYear: true,
          genres: true,
          tags: true,
          updatedAt: true,
          _count: { select: { issues: true } },
        },
      })
    : [];

  // Fetch file data
  const fileItems = fileIds.length > 0
    ? await db.comicFile.findMany({
        where: { id: { in: fileIds } },
        select: {
          id: true,
          updatedAt: true,
          metadata: {
            select: {
              publisher: true,
              year: true,
              genre: true,
            },
          },
        },
      })
    : [];

  // Calculate derived publisher
  const publishers = seriesItems
    .map(s => s.publisher)
    .filter((p): p is string => !!p);

  // Also include file publishers
  for (const f of fileItems) {
    if (f.metadata?.publisher) {
      publishers.push(f.metadata.publisher);
    }
  }

  const derivedPublisher = getMostCommon(publishers);

  // Calculate derived years
  const startYears = seriesItems
    .map(s => s.startYear)
    .filter((y): y is number => y !== null);

  // Also include file years
  for (const f of fileItems) {
    if (f.metadata?.year) {
      startYears.push(f.metadata.year);
    }
  }

  const derivedStartYear = startYears.length > 0 ? Math.min(...startYears) : null;

  const endYears = seriesItems
    .map(s => s.endYear)
    .filter((y): y is number => y !== null);
  const derivedEndYear = endYears.length > 0 ? Math.max(...endYears) : null;

  // Calculate derived genres
  const allGenres = seriesItems
    .flatMap(s => (s.genres || '').split(',').map(g => g.trim()))
    .filter(g => g.length > 0);

  // Also include file genres
  for (const f of fileItems) {
    if (f.metadata?.genre) {
      allGenres.push(...f.metadata.genre.split(',').map(g => g.trim()).filter(g => g.length > 0));
    }
  }

  const uniqueGenres = [...new Set(allGenres)];
  const derivedGenres = uniqueGenres.length > 0 ? uniqueGenres.join(', ') : null;

  // Calculate derived tags from child series
  const allTags = seriesItems
    .flatMap(s => (s.tags || '').split(',').map(t => t.trim()))
    .filter(t => t.length > 0);

  const uniqueTags = [...new Set(allTags)];
  const derivedTags = uniqueTags.length > 0 ? uniqueTags.join(', ') : null;

  // Calculate issue counts
  const derivedIssueCount = seriesItems.reduce(
    (sum, s) => sum + (s._count?.issues || 0),
    0
  ) + fileItems.length;

  // Calculate read count
  let derivedReadCount = 0;

  // Use existing seriesIds from earlier query
  if (seriesIds.length > 0) {
    const progressRecords = await db.seriesProgress.findMany({
      where: {
        userId,
        seriesId: { in: seriesIds },
      },
      select: { totalRead: true },
    });
    derivedReadCount = progressRecords.reduce((sum, p) => sum + p.totalRead, 0);
  }

  if (fileIds.length > 0) {
    const readFiles = await db.userReadingProgress.count({
      where: {
        userId,
        fileId: { in: fileIds },
        completed: true,
      },
    });
    derivedReadCount += readFiles;
  }

  // Find most recent content update
  let contentUpdatedAt: Date | null = null;
  for (const s of seriesItems) {
    if (!contentUpdatedAt || s.updatedAt > contentUpdatedAt) {
      contentUpdatedAt = s.updatedAt;
    }
  }
  for (const f of fileItems) {
    if (!contentUpdatedAt || f.updatedAt > contentUpdatedAt) {
      contentUpdatedAt = f.updatedAt;
    }
  }

  // Update the collection
  await db.collection.update({
    where: { id: collectionId },
    data: {
      derivedPublisher,
      derivedStartYear,
      derivedEndYear,
      derivedGenres,
      derivedTags,
      derivedIssueCount,
      derivedReadCount,
      contentUpdatedAt,
      metadataUpdatedAt: new Date(),
    },
  });
}

// =============================================================================
// Cover Management
// =============================================================================

/**
 * Update collection cover source.
 */
export async function updateCollectionCover(
  userId: string,
  collectionId: string,
  coverType: 'auto' | 'series' | 'issue' | 'custom',
  sourceId?: string
): Promise<Collection> {
  const db = getDatabase();

  // Verify ownership
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  const updateData: Record<string, unknown> = {
    coverType,
    coverSeriesId: null,
    coverFileId: null,
    coverHash: null,
  };

  if (coverType === 'series' && sourceId) {
    updateData.coverSeriesId = sourceId;
  } else if (coverType === 'issue' && sourceId) {
    updateData.coverFileId = sourceId;
  }

  const updated = await db.collection.update({
    where: { id: collectionId },
    data: updateData,
  });

  // If switching to 'auto' mode, regenerate the mosaic
  if (coverType === 'auto') {
    scheduleMosaicRegeneration(collectionId);
  }

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    description: updated.description,
    deck: updated.deck,
    isSystem: updated.isSystem,
    systemKey: updated.systemKey,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    // Lock flags
    lockName: updated.lockName,
    lockDeck: updated.lockDeck,
    lockDescription: updated.lockDescription,
    lockPublisher: updated.lockPublisher,
    lockStartYear: updated.lockStartYear,
    lockEndYear: updated.lockEndYear,
    lockGenres: updated.lockGenres,
    // New fields
    rating: updated.rating,
    notes: updated.notes,
    visibility: updated.visibility,
    readingMode: updated.readingMode,
    readerPresetId: updated.readerPresetId,
    tags: updated.tags,
  };
}

/**
 * Set custom cover hash for a collection.
 */
export async function setCollectionCoverHash(
  userId: string,
  collectionId: string,
  coverHash: string
): Promise<Collection> {
  const db = getDatabase();

  // Verify ownership
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  const updated = await db.collection.update({
    where: { id: collectionId },
    data: {
      coverType: 'custom',
      coverHash,
      coverSeriesId: null,
      coverFileId: null,
    },
  });

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    description: updated.description,
    deck: updated.deck,
    isSystem: updated.isSystem,
    systemKey: updated.systemKey,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    // Lock flags
    lockName: updated.lockName,
    lockDeck: updated.lockDeck,
    lockDescription: updated.lockDescription,
    lockPublisher: updated.lockPublisher,
    lockStartYear: updated.lockStartYear,
    lockEndYear: updated.lockEndYear,
    lockGenres: updated.lockGenres,
    // New fields
    rating: updated.rating,
    notes: updated.notes,
    visibility: updated.visibility,
    readingMode: updated.readingMode,
    readerPresetId: updated.readerPresetId,
    tags: updated.tags,
  };
}

/**
 * Update collection metadata overrides.
 */
export async function updateCollectionMetadata(
  userId: string,
  collectionId: string,
  metadata: {
    overridePublisher?: string | null;
    overrideStartYear?: number | null;
    overrideEndYear?: number | null;
    overrideGenres?: string | null;
  }
): Promise<Collection> {
  const db = getDatabase();

  // Verify ownership
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  const updated = await db.collection.update({
    where: { id: collectionId },
    data: {
      overridePublisher: metadata.overridePublisher,
      overrideStartYear: metadata.overrideStartYear,
      overrideEndYear: metadata.overrideEndYear,
      overrideGenres: metadata.overrideGenres,
      metadataUpdatedAt: new Date(),
    },
  });

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    description: updated.description,
    deck: updated.deck,
    isSystem: updated.isSystem,
    systemKey: updated.systemKey,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    // Lock flags
    lockName: updated.lockName,
    lockDeck: updated.lockDeck,
    lockDescription: updated.lockDescription,
    lockPublisher: updated.lockPublisher,
    lockStartYear: updated.lockStartYear,
    lockEndYear: updated.lockEndYear,
    lockGenres: updated.lockGenres,
    // New fields
    rating: updated.rating,
    notes: updated.notes,
    visibility: updated.visibility,
    readingMode: updated.readingMode,
    readerPresetId: updated.readerPresetId,
    tags: updated.tags,
  };
}

// =============================================================================
// Reading Progress
// =============================================================================

/**
 * Get aggregate reading progress for a collection.
 */
export async function getCollectionReadingProgress(
  userId: string,
  collectionId: string
): Promise<{ totalIssues: number; readIssues: number }> {
  const db = getDatabase();

  // Verify ownership and get series items
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
    include: {
      items: {
        where: {
          seriesId: { not: null },
          isAvailable: true,
        },
        select: {
          seriesId: true,
        },
      },
    },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  const seriesIds = collection.items
    .map((item) => item.seriesId)
    .filter((id): id is string => id !== null);

  if (seriesIds.length === 0) {
    return { totalIssues: 0, readIssues: 0 };
  }

  // Get issue counts for all series
  const issueCountResult = await db.comicFile.count({
    where: { seriesId: { in: seriesIds } },
  });

  // Get read counts from series progress
  const progressRecords = await db.seriesProgress.findMany({
    where: {
      userId,
      seriesId: { in: seriesIds },
    },
    select: { totalRead: true },
  });

  const readIssues = progressRecords.reduce((sum, p) => sum + p.totalRead, 0);

  return {
    totalIssues: issueCountResult,
    readIssues,
  };
}

// =============================================================================
// Expanded Collection Data
// =============================================================================

/**
 * Get expanded collection data with all issues, stats, and next issue.
 * This fetches all data in one request for better performance.
 */
export async function getCollectionExpanded(
  userId: string,
  collectionId: string,
  sortOptions?: { sortBy?: SortField; sortOrder?: SortOrder }
): Promise<CollectionExpandedData | null> {
  const db = getDatabase();

  // Get collection with items (need full collection data for smart filter)
  const fullCollection = await db.collection.findFirst({
    where: { id: collectionId, userId },
    include: {
      items: {
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!fullCollection) {
    return null;
  }

  // Get the formatted collection for the response
  const collection = await getCollection(userId, collectionId);
  if (!collection) {
    return null;
  }

  // Determine effective sort options
  let effectiveSortBy = sortOptions?.sortBy;
  let effectiveSortOrder: SortOrder = sortOptions?.sortOrder ?? 'asc';

  // If collection is smart, parse filter definition for sort options
  if (fullCollection.isSmart && fullCollection.filterDefinition && !sortOptions?.sortBy) {
    try {
      const filter = JSON.parse(fullCollection.filterDefinition) as SmartFilter;
      if (filter.sortBy) {
        effectiveSortBy = filter.sortBy;
        effectiveSortOrder = filter.sortOrder ?? 'asc';
      }
    } catch {
      // Ignore parse errors, use default sorting
    }
  }

  // Collect series IDs and individual file IDs
  const seriesIds: string[] = [];
  const fileIds: string[] = [];

  for (const item of collection.items) {
    if (item.seriesId) {
      seriesIds.push(item.seriesId);
    }
    if (item.fileId) {
      fileIds.push(item.fileId);
    }
  }

  // Fetch all issues for all series in one query
  const [allSeriesIssues, individualFiles] = await Promise.all([
    seriesIds.length > 0
      ? db.comicFile.findMany({
          where: { seriesId: { in: seriesIds } },
          include: {
            metadata: {
              select: {
                number: true,
                title: true,
                writer: true,
                year: true,
                publisher: true,
              },
            },
            userReadingProgress: {
              where: { userId },
              select: {
                currentPage: true,
                totalPages: true,
                completed: true,
                lastReadAt: true,
                rating: true,
              },
            },
            series: {
              select: {
                name: true,
              },
            },
            externalRatings: {
              select: {
                ratingValue: true,
              },
              take: 1,
              orderBy: { ratingValue: 'desc' },
            },
          },
          orderBy: [
            { seriesId: 'asc' },
            { filename: 'asc' },
          ],
        })
      : [],
    fileIds.length > 0
      ? db.comicFile.findMany({
          where: { id: { in: fileIds } },
          include: {
            metadata: {
              select: {
                number: true,
                title: true,
                writer: true,
                year: true,
                publisher: true,
              },
            },
            userReadingProgress: {
              where: { userId },
              select: {
                currentPage: true,
                totalPages: true,
                completed: true,
                lastReadAt: true,
                rating: true,
              },
            },
            series: {
              select: {
                name: true,
              },
            },
            externalRatings: {
              select: {
                ratingValue: true,
              },
              take: 1,
              orderBy: { ratingValue: 'desc' },
            },
          },
        })
      : [],
  ]);

  // Create a map of seriesId -> position for sorting
  const seriesPositionMap = new Map<string, number>();
  for (const item of collection.items) {
    if (item.seriesId && !seriesPositionMap.has(item.seriesId)) {
      seriesPositionMap.set(item.seriesId, item.position);
    }
  }

  // Create a map of fileId -> position for individual files
  const filePositionMap = new Map<string, number>();
  for (const item of collection.items) {
    if (item.fileId) {
      filePositionMap.set(item.fileId, item.position);
    }
  }

  // Parse issue number for sorting
  const parseIssueNum = (num: string | null | undefined): number => {
    if (!num) return Infinity;
    const parsed = parseFloat(num);
    return isNaN(parsed) ? Infinity : parsed;
  };

  // Transform and combine issues
  const expandedIssues: ExpandedIssue[] = [];

  // Add series issues
  for (const issue of allSeriesIssues) {
    const progress = issue.userReadingProgress[0] ?? null;
    const topRating = issue.externalRatings?.[0]?.ratingValue ?? null;
    expandedIssues.push({
      id: issue.id,
      filename: issue.filename,
      relativePath: issue.relativePath,
      size: Number(issue.size),
      seriesId: issue.seriesId!,
      seriesName: issue.series?.name ?? 'Unknown Series',
      collectionPosition: seriesPositionMap.get(issue.seriesId!) ?? 999,
      createdAt: issue.createdAt.toISOString(),
      metadata: issue.metadata ? {
        number: issue.metadata.number,
        title: issue.metadata.title,
        writer: issue.metadata.writer,
        year: issue.metadata.year,
        publisher: issue.metadata.publisher,
      } : null,
      readingProgress: progress ? {
        currentPage: progress.currentPage,
        totalPages: progress.totalPages,
        completed: progress.completed,
        lastReadAt: progress.lastReadAt?.toISOString() ?? null,
        rating: progress.rating,
      } : null,
      externalRating: topRating,
    });
  }

  // Add individual files
  for (const file of individualFiles) {
    const progress = file.userReadingProgress[0] ?? null;
    const topRating = file.externalRatings?.[0]?.ratingValue ?? null;
    expandedIssues.push({
      id: file.id,
      filename: file.filename,
      relativePath: file.relativePath,
      size: Number(file.size),
      seriesId: file.seriesId ?? '',
      seriesName: file.series?.name ?? 'Unknown Series',
      collectionPosition: filePositionMap.get(file.id) ?? 999,
      createdAt: file.createdAt.toISOString(),
      metadata: file.metadata ? {
        number: file.metadata.number,
        title: file.metadata.title,
        writer: file.metadata.writer,
        year: file.metadata.year,
        publisher: file.metadata.publisher,
      } : null,
      readingProgress: progress ? {
        currentPage: progress.currentPage,
        totalPages: progress.totalPages,
        completed: progress.completed,
        lastReadAt: progress.lastReadAt?.toISOString() ?? null,
        rating: progress.rating,
      } : null,
      externalRating: topRating,
    });
  }

  // Apply sorting
  if (effectiveSortBy) {
    // Custom sorting based on sortBy field
    expandedIssues.sort((a, b) => {
      let valueA: string | number | null;
      let valueB: string | number | null;

      switch (effectiveSortBy) {
        case 'name':
        case 'title':
          valueA = a.metadata?.title ?? a.filename;
          valueB = b.metadata?.title ?? b.filename;
          break;
        case 'year':
          valueA = a.metadata?.year ?? null;
          valueB = b.metadata?.year ?? null;
          break;
        case 'dateAdded':
          valueA = a.createdAt;
          valueB = b.createdAt;
          break;
        case 'lastReadAt':
          valueA = a.readingProgress?.lastReadAt ?? null;
          valueB = b.readingProgress?.lastReadAt ?? null;
          break;
        case 'number':
          valueA = parseIssueNum(a.metadata?.number);
          valueB = parseIssueNum(b.metadata?.number);
          break;
        case 'publisher':
          valueA = a.metadata?.publisher ?? '';
          valueB = b.metadata?.publisher ?? '';
          break;
        case 'rating':
          valueA = a.readingProgress?.rating ?? null;
          valueB = b.readingProgress?.rating ?? null;
          break;
        case 'externalRating':
          valueA = a.externalRating;
          valueB = b.externalRating;
          break;
        default:
          return 0;
      }

      // Handle null values (push to end)
      if (valueA === null && valueB === null) return 0;
      if (valueA === null) return 1;
      if (valueB === null) return -1;

      // Compare values
      let comparison = 0;
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        comparison = valueA.localeCompare(valueB);
      } else {
        comparison = (valueA as number) - (valueB as number);
      }

      return effectiveSortOrder === 'desc' ? -comparison : comparison;
    });
  } else {
    // Default: Sort by collection position, then by issue number
    expandedIssues.sort((a, b) => {
      if (a.collectionPosition !== b.collectionPosition) {
        return a.collectionPosition - b.collectionPosition;
      }
      // Within same series, sort by issue number
      const numA = parseIssueNum(a.metadata?.number);
      const numB = parseIssueNum(b.metadata?.number);
      if (numA !== numB) {
        return numA - numB;
      }
      // Fallback to filename
      return a.filename.localeCompare(b.filename);
    });
  }

  // Calculate aggregate stats
  let totalPages = 0;
  let pagesRead = 0;
  let readIssues = 0;
  let inProgressIssues = 0;

  for (const issue of expandedIssues) {
    const progress = issue.readingProgress;
    if (progress) {
      totalPages += progress.totalPages;
      if (progress.completed) {
        readIssues++;
        pagesRead += progress.totalPages;
      } else if (progress.currentPage > 0) {
        inProgressIssues++;
        pagesRead += progress.currentPage;
      }
    }
  }

  const aggregateStats: CollectionAggregateStats = {
    totalIssues: expandedIssues.length,
    readIssues,
    inProgressIssues,
    totalPages,
    pagesRead,
    seriesCount: new Set(expandedIssues.map((i) => i.seriesId).filter(Boolean)).size,
  };

  // Find next unread issue (following collection order)
  let nextIssue: CollectionNextIssue | null = null;
  for (const issue of expandedIssues) {
    const progress = issue.readingProgress;
    if (!progress?.completed) {
      nextIssue = {
        fileId: issue.id,
        filename: issue.filename,
        seriesId: issue.seriesId,
        seriesName: issue.seriesName,
      };
      break;
    }
  }

  return {
    collection,
    expandedIssues,
    aggregateStats,
    nextIssue,
  };
}

// =============================================================================
// Filter Preset Linking
// =============================================================================

/**
 * Link a collection to a filter preset
 * The collection will use the preset's filter instead of an embedded filter
 */
export async function linkCollectionToPreset(
  collectionId: string,
  userId: string,
  presetId: string
): Promise<Collection> {
  const db = getDatabase();

  // Verify collection exists and belongs to user
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  // Verify preset exists and is accessible (user's own or global)
  const preset = await db.filterPreset.findFirst({
    where: {
      id: presetId,
      OR: [{ userId }, { isGlobal: true }],
    },
  });

  if (!preset) {
    throw new Error('Preset not found or not accessible');
  }

  // Update collection to use preset
  const updated = await db.collection.update({
    where: { id: collectionId },
    data: {
      filterPresetId: presetId,
      filterDefinition: null, // Clear embedded filter
      isSmart: true,
    },
  });

  logger.info(`Linked collection ${collectionId} to preset ${presetId}`);

  return updated as unknown as Collection;
}

/**
 * Unlink a collection from its filter preset
 * Copies the preset's filter definition to the collection as an embedded filter
 */
export async function unlinkCollectionFromPreset(
  collectionId: string,
  userId: string
): Promise<Collection> {
  const db = getDatabase();

  // Get collection with its preset
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
    include: { filterPreset: true },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  if (!collection.filterPresetId || !collection.filterPreset) {
    throw new Error('Collection is not linked to a preset');
  }

  // Copy preset's filter to embedded filter
  const updated = await db.collection.update({
    where: { id: collectionId },
    data: {
      filterPresetId: null,
      filterDefinition: collection.filterPreset.filterDefinition, // Copy filter
    },
  });

  logger.info(`Unlinked collection ${collectionId} from preset ${collection.filterPresetId}`);

  return updated as unknown as Collection;
}
