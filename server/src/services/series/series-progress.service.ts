/**
 * Series Progress Service
 *
 * Reading progress tracking and unified grid operations for Series.
 */

import { getDatabase } from '../database.service.js';
import type { ComicFile, SeriesProgress } from '@prisma/client';
import type {
  SeriesListOptions,
  SeriesWithCounts,
  GridItem,
  SeriesGridItem,
  CollectionGridItem,
  UnifiedGridOptions,
  UnifiedGridResult,
  BulkOperationResult,
} from './series.types.js';

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
    orderBy: [
      { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
      { filename: 'asc' },
    ],
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

    // Find next file to continue reading for this user
    // Priority: 1) In-progress issues (highest issue number), 2) Next unread after last read
    let nextUnreadFileId: string | null = null;

    // Priority 1: Find in-progress issues (not completed, currentPage > 0)
    const inProgressIssues = issues.filter(issue => {
      const progress = progressByFileId.get(issue.id);
      return progress && !progress.completed && progress.currentPage > 0;
    });

    if (inProgressIssues.length > 0) {
      // Issues are already sorted ASC by issueNumberSort then filename
      // Take the last one (highest issue number) to continue from furthest point in series
      nextUnreadFileId = inProgressIssues[inProgressIssues.length - 1]!.id;
    } else if (lastReadIssue) {
      // Priority 2: Next unread after last read (existing "Last Read +1" logic)
      const lastReadIndex = issues.findIndex(i => i.id === lastReadIssue.id);
      for (let i = lastReadIndex + 1; i < issues.length; i++) {
        const issue = issues[i];
        if (issue && !progressByFileId.get(issue.id)?.completed) {
          nextUnreadFileId = issue.id;
          break;
        }
      }
    } else {
      // Priority 3: First unread issue (no reading progress yet)
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
// Bulk Read/Unread Operations
// =============================================================================

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
export function getProgressStats(progress: SeriesProgress[] | SeriesProgress | null | undefined): {
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

  // Import getSeriesList dynamically to avoid circular dependency
  const { getSeriesList } = await import('./series-crud.service.js');

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
    const transformedSeries: SeriesWithCounts = {
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
    } satisfies SeriesGridItem;
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
  const { getPromotedCollectionsForGrid } = await import('../collection.service.js');

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
  } satisfies CollectionGridItem));

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
