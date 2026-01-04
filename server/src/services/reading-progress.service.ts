/**
 * Reading Progress Service
 *
 * Manages reading progress tracking for comic files:
 * - Current page tracking
 * - Completion status
 * - Bookmarks
 * - Continue reading functionality
 *
 * All reading progress is now user-scoped using UserReadingProgress.
 */

import { rm } from 'fs/promises';
import { getDatabase } from './database.service.js';
import { markDirtyForReadingProgress } from './stats-dirty.service.js';
import { markSmartCollectionsDirty } from './smart-collection-dirty.service.js';
import { triggerAchievementCheck } from './achievement-trigger.service.js';

// =============================================================================
// Types
// =============================================================================

export interface ReadingProgress {
  id: string;
  userId: string;
  fileId: string;
  currentPage: number;
  totalPages: number;
  completed: boolean;
  lastReadAt: Date;
  bookmarks: number[];
  createdAt: Date;
}

export interface UpdateProgressInput {
  currentPage: number;
  totalPages?: number;
  completed?: boolean;
}

export interface ContinueReadingItem {
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  coverHash: string | null;
  currentPage: number;
  totalPages: number;
  progress: number; // 0-100 percentage
  lastReadAt: Date;
  itemType: 'in_progress' | 'next_up'; // Type of continue reading item
  // Metadata fields
  series: string | null;
  number: string | null;
  title: string | null;
  issueCount: number | null; // Total issues in series (for "Issue X of Y")
}

export interface AdjacentFile {
  fileId: string;
  filename: string;
  number?: string;
}

export interface AdjacentFiles {
  previous: AdjacentFile | null;
  next: AdjacentFile | null;
  currentIndex: number;
  totalInSeries: number;
  seriesName: string | null;
  seriesId: string | null;
}

// =============================================================================
// Progress CRUD
// =============================================================================

/**
 * Get reading progress for a file for a specific user
 */
export async function getProgress(userId: string, fileId: string): Promise<ReadingProgress | null> {
  const db = getDatabase();

  const progress = await db.userReadingProgress.findUnique({
    where: {
      userId_fileId: { userId, fileId },
    },
  });

  if (!progress) return null;

  return {
    ...progress,
    bookmarks: JSON.parse(progress.bookmarks) as number[],
  };
}

/**
 * Update reading progress for a file for a specific user
 */
export async function updateProgress(
  userId: string,
  fileId: string,
  input: UpdateProgressInput
): Promise<ReadingProgress> {
  const db = getDatabase();

  // Verify file exists
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  // Check if this is a new progress record (first time opening this comic)
  const existingProgress = await db.userReadingProgress.findUnique({
    where: { userId_fileId: { userId, fileId } },
  });
  const isFirstOpen = !existingProgress;

  // Calculate completed status if not explicitly set
  const isCompleted =
    input.completed !== undefined
      ? input.completed
      : input.totalPages
        ? input.currentPage >= input.totalPages - 1
        : false;

  const progress = await db.userReadingProgress.upsert({
    where: {
      userId_fileId: { userId, fileId },
    },
    create: {
      userId,
      fileId,
      currentPage: input.currentPage,
      totalPages: input.totalPages || 0,
      completed: isCompleted,
      bookmarks: '[]',
    },
    update: {
      currentPage: input.currentPage,
      ...(input.totalPages !== undefined && { totalPages: input.totalPages }),
      completed: isCompleted,
    },
  });

  // Sync series progress if file is linked to a series
  await syncSeriesProgressInternal(db, userId, fileId);

  // Mark stats as dirty for recalculation
  try {
    await markDirtyForReadingProgress(fileId);
  } catch {
    // Non-critical, continue even if dirty marking fails
  }

  // Mark smart collections dirty for read status filter re-evaluation
  // This is user-specific since reading progress is per-user
  if (file.seriesId) {
    markSmartCollectionsDirty({
      userId,
      seriesIds: [file.seriesId],
      fileIds: [fileId],
      reason: 'reading_progress',
    }).catch(() => {
      // Non-critical, errors logged inside
    });
  }

  // Trigger achievement check when opening a comic for the first time
  // This enables "First Discovery" type achievements
  if (isFirstOpen) {
    triggerAchievementCheck(userId).catch(() => {
      // Non-critical, errors logged inside the function
    });
  }

  return {
    ...progress,
    bookmarks: JSON.parse(progress.bookmarks) as number[],
  };
}

/**
 * Mark a file as completed for a specific user
 */
export async function markCompleted(userId: string, fileId: string): Promise<ReadingProgress> {
  const db = getDatabase();

  const existing = await db.userReadingProgress.findUnique({
    where: {
      userId_fileId: { userId, fileId },
    },
  });

  if (!existing) {
    // Create a new progress entry and mark as completed
    const file = await db.comicFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    const progress = await db.userReadingProgress.create({
      data: {
        userId,
        fileId,
        currentPage: 0,
        totalPages: 0,
        completed: true,
        bookmarks: '[]',
      },
    });

    // Sync series progress
    await syncSeriesProgressInternal(db, userId, fileId);

    // Mark stats as dirty
    try {
      await markDirtyForReadingProgress(fileId);
    } catch {
      // Non-critical
    }

    // Mark smart collections dirty for read status filter re-evaluation
    if (file.seriesId) {
      markSmartCollectionsDirty({
        userId,
        seriesIds: [file.seriesId],
        fileIds: [fileId],
        reason: 'reading_progress',
      }).catch(() => {
        // Non-critical, errors logged inside
      });
    }

    // Trigger achievement check after comic completion
    triggerAchievementCheck(userId).catch(() => {
      // Non-critical, errors logged inside the function
    });

    return {
      ...progress,
      bookmarks: [],
    };
  }

  // Fetch file to get seriesId for smart collection updates
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    select: { seriesId: true },
  });

  const progress = await db.userReadingProgress.update({
    where: {
      userId_fileId: { userId, fileId },
    },
    data: { completed: true },
  });

  // Sync series progress if file is linked to a series
  await syncSeriesProgressInternal(db, userId, fileId);

  // Mark stats as dirty for recalculation
  try {
    await markDirtyForReadingProgress(fileId);
  } catch {
    // Non-critical, continue even if dirty marking fails
  }

  // Mark smart collections dirty for read status filter re-evaluation
  if (file?.seriesId) {
    markSmartCollectionsDirty({
      userId,
      seriesIds: [file.seriesId],
      fileIds: [fileId],
      reason: 'reading_progress',
    }).catch(() => {
      // Non-critical, errors logged inside
    });
  }

  // Trigger achievement check after comic completion
  triggerAchievementCheck(userId).catch(() => {
    // Non-critical, errors logged inside the function
  });

  return {
    ...progress,
    bookmarks: JSON.parse(progress.bookmarks) as number[],
  };
}

/**
 * Mark a file as not completed (reset completion and progress) for a specific user
 * This fully resets reading progress as if the file was never read.
 * Also clears the page extraction cache for this file.
 */
export async function markIncomplete(userId: string, fileId: string): Promise<ReadingProgress> {
  const db = getDatabase();

  const existing = await db.userReadingProgress.findUnique({
    where: {
      userId_fileId: { userId, fileId },
    },
  });

  if (!existing) {
    throw new Error(`No reading progress found for file: ${fileId}`);
  }

  // Fetch file to get seriesId for smart collection updates
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    select: { seriesId: true },
  });

  const progress = await db.userReadingProgress.update({
    where: {
      userId_fileId: { userId, fileId },
    },
    data: {
      completed: false,
      currentPage: 0,
    },
  });

  // Sync series progress if file is linked to a series
  await syncSeriesProgressInternal(db, userId, fileId);

  // Mark stats as dirty for recalculation
  try {
    await markDirtyForReadingProgress(fileId);
  } catch {
    // Non-critical, continue even if dirty marking fails
  }

  // Mark smart collections dirty for read status filter re-evaluation
  if (file?.seriesId) {
    markSmartCollectionsDirty({
      userId,
      seriesIds: [file.seriesId],
      fileIds: [fileId],
      reason: 'reading_progress',
    }).catch(() => {
      // Non-critical, errors logged inside
    });
  }

  // Clear the page extraction cache for this file
  const cacheDir = `/tmp/helixio-archive-cache-${fileId}`;
  try {
    await rm(cacheDir, { recursive: true, force: true });
  } catch {
    // Cache dir might not exist, ignore
  }

  return {
    ...progress,
    bookmarks: JSON.parse(progress.bookmarks) as number[],
  };
}

/**
 * Delete reading progress for a file for a specific user
 */
export async function deleteProgress(userId: string, fileId: string): Promise<void> {
  const db = getDatabase();

  await db.userReadingProgress.delete({
    where: {
      userId_fileId: { userId, fileId },
    },
  }).catch(() => {
    // Ignore if not found
  });
}

// =============================================================================
// Bookmarks
// =============================================================================

/**
 * Add a bookmark to a file for a specific user
 */
export async function addBookmark(
  userId: string,
  fileId: string,
  pageIndex: number
): Promise<ReadingProgress> {
  const db = getDatabase();

  const existing = await db.userReadingProgress.findUnique({
    where: {
      userId_fileId: { userId, fileId },
    },
  });

  if (!existing) {
    // Create new progress entry with bookmark
    const progress = await db.userReadingProgress.create({
      data: {
        userId,
        fileId,
        currentPage: 0,
        totalPages: 0,
        bookmarks: JSON.stringify([pageIndex]),
      },
    });
    return {
      ...progress,
      bookmarks: [pageIndex],
    };
  }

  const bookmarks = JSON.parse(existing.bookmarks) as number[];
  if (!bookmarks.includes(pageIndex)) {
    bookmarks.push(pageIndex);
    bookmarks.sort((a, b) => a - b);
  }

  const progress = await db.userReadingProgress.update({
    where: {
      userId_fileId: { userId, fileId },
    },
    data: { bookmarks: JSON.stringify(bookmarks) },
  });

  return {
    ...progress,
    bookmarks,
  };
}

/**
 * Remove a bookmark from a file for a specific user
 */
export async function removeBookmark(
  userId: string,
  fileId: string,
  pageIndex: number
): Promise<ReadingProgress> {
  const db = getDatabase();

  const existing = await db.userReadingProgress.findUnique({
    where: {
      userId_fileId: { userId, fileId },
    },
  });

  if (!existing) {
    throw new Error(`No reading progress found for file: ${fileId}`);
  }

  const bookmarks = (JSON.parse(existing.bookmarks) as number[]).filter(
    (b) => b !== pageIndex
  );

  const progress = await db.userReadingProgress.update({
    where: {
      userId_fileId: { userId, fileId },
    },
    data: { bookmarks: JSON.stringify(bookmarks) },
  });

  return {
    ...progress,
    bookmarks,
  };
}

/**
 * Get all bookmarks for a file for a specific user
 */
export async function getBookmarks(userId: string, fileId: string): Promise<number[]> {
  const db = getDatabase();

  const progress = await db.userReadingProgress.findUnique({
    where: {
      userId_fileId: { userId, fileId },
    },
  });

  if (!progress) return [];

  return JSON.parse(progress.bookmarks) as number[];
}

// =============================================================================
// Continue Reading
// =============================================================================

/**
 * Get recently read files that are in progress (not completed) for a specific user,
 * plus "next up" issues from series that have reading history but no in-progress issues.
 *
 * Returns in-progress items first, then next-up items, both sorted by lastReadAt DESC.
 */
export async function getContinueReading(
  userId: string,
  limit = 20,
  libraryId?: string
): Promise<ContinueReadingItem[]> {
  const db = getDatabase();

  // QUERY 1: Get in-progress issues (existing logic)
  const inProgress = await db.userReadingProgress.findMany({
    where: {
      userId,
      completed: false,
      currentPage: { gt: 0 },
      ...(libraryId && {
        file: { libraryId },
      }),
    },
    orderBy: { lastReadAt: 'desc' },
    take: limit,
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          relativePath: true,
          libraryId: true,
          coverHash: true,
          seriesId: true,
          metadata: {
            select: {
              series: true,
              number: true,
              title: true,
            },
          },
          series: {
            select: {
              issueCount: true,
            },
          },
        },
      },
    },
  });

  // Format in-progress items
  const inProgressFormatted: ContinueReadingItem[] = inProgress.map((p) => ({
    fileId: p.file.id,
    filename: p.file.filename,
    relativePath: p.file.relativePath,
    libraryId: p.file.libraryId,
    coverHash: p.file.coverHash ?? null,
    currentPage: p.currentPage,
    totalPages: p.totalPages,
    progress: p.totalPages > 0 ? Math.round(((p.currentPage + 1) / p.totalPages) * 100) : 0,
    lastReadAt: p.lastReadAt,
    itemType: 'in_progress' as const,
    series: p.file.metadata?.series ?? null,
    number: p.file.metadata?.number ?? null,
    title: p.file.metadata?.title ?? null,
    issueCount: p.file.series?.issueCount ?? null,
  }));

  const remainingSlots = limit - inProgressFormatted.length;

  // If we've filled the limit with in-progress items, return early
  if (remainingSlots <= 0) {
    return inProgressFormatted;
  }

  // Get series IDs that already have in-progress issues (to exclude from next-up)
  const inProgressSeriesIds = new Set(
    inProgress
      .filter((p) => p.file.seriesId)
      .map((p) => p.file.seriesId as string)
  );

  // QUERY 2: Get series with next-up issues
  // Criteria: has reading history (totalRead > 0), no in-progress issues (totalInProgress == 0),
  // not completed (totalRead < totalOwned), has a next unread file
  const seriesWithNextUp = await db.seriesProgress.findMany({
    where: {
      userId,
      nextUnreadFileId: { not: null },
      totalInProgress: 0,
      totalRead: { gt: 0 },
      // Filter by library if specified
      ...(libraryId && {
        series: {
          issues: { some: { libraryId } },
        },
      }),
    },
    orderBy: { lastReadAt: 'desc' },
    take: remainingSlots * 2, // Fetch extras for in-memory filtering
  });

  // Filter out completed series and series that already have in-progress issues
  const eligible = seriesWithNextUp
    .filter(
      (sp) =>
        sp.totalRead < sp.totalOwned && !inProgressSeriesIds.has(sp.seriesId)
    )
    .slice(0, remainingSlots);

  // If no eligible series, return just in-progress items
  if (eligible.length === 0) {
    return inProgressFormatted;
  }

  // QUERY 3: Fetch file details for next-up issues
  const nextUpFileIds = eligible
    .map((sp) => sp.nextUnreadFileId)
    .filter(Boolean) as string[];

  const nextUpFiles = await db.comicFile.findMany({
    where: { id: { in: nextUpFileIds } },
    include: {
      metadata: {
        select: {
          series: true,
          number: true,
          title: true,
        },
      },
      series: {
        select: {
          issueCount: true,
        },
      },
    },
  });

  // Create a map for quick file lookup
  const fileMap = new Map(nextUpFiles.map((f) => [f.id, f]));

  // Format next-up items, maintaining the series lastReadAt order
  const nextUpFormatted: ContinueReadingItem[] = eligible
    .map((sp) => {
      const file = fileMap.get(sp.nextUnreadFileId!);
      if (!file) return null;
      return {
        fileId: file.id,
        filename: file.filename,
        relativePath: file.relativePath,
        libraryId: file.libraryId,
        coverHash: file.coverHash ?? null,
        currentPage: 0,
        totalPages: 0,
        progress: 0,
        lastReadAt: sp.lastReadAt ?? new Date(),
        itemType: 'next_up' as const,
        series: file.metadata?.series ?? null,
        number: file.metadata?.number ?? null,
        title: file.metadata?.title ?? null,
        issueCount: file.series?.issueCount ?? null,
      };
    })
    .filter(Boolean) as ContinueReadingItem[];

  return [...inProgressFormatted, ...nextUpFormatted];
}

/**
 * Get all reading progress for a library for a specific user
 */
export async function getLibraryProgress(
  userId: string,
  libraryId: string
): Promise<Map<string, { currentPage: number; totalPages: number; completed: boolean }>> {
  const db = getDatabase();

  const progress = await db.userReadingProgress.findMany({
    where: {
      userId,
      file: { libraryId },
    },
    select: {
      fileId: true,
      currentPage: true,
      totalPages: true,
      completed: true,
    },
  });

  const map = new Map<string, { currentPage: number; totalPages: number; completed: boolean }>();
  for (const p of progress) {
    map.set(p.fileId, {
      currentPage: p.currentPage,
      totalPages: p.totalPages,
      completed: p.completed,
    });
  }

  return map;
}

/**
 * Get reading statistics for a library for a specific user
 */
export async function getLibraryReadingStats(userId: string, libraryId: string): Promise<{
  totalFiles: number;
  inProgress: number;
  completed: number;
  unread: number;
}> {
  const db = getDatabase();

  const totalFiles = await db.comicFile.count({
    where: { libraryId, status: 'indexed' },
  });

  const inProgress = await db.userReadingProgress.count({
    where: {
      userId,
      file: { libraryId },
      completed: false,
      currentPage: { gt: 0 },
    },
  });

  const completed = await db.userReadingProgress.count({
    where: {
      userId,
      file: { libraryId },
      completed: true,
    },
  });

  return {
    totalFiles,
    inProgress,
    completed,
    unread: totalFiles - inProgress - completed,
  };
}

// =============================================================================
// Chapter Navigation
// =============================================================================

/**
 * Get adjacent files (prev/next) in the same series
 * Uses the Series entity if available, falls back to metadata.series, then folder
 */
export async function getAdjacentFiles(fileId: string): Promise<AdjacentFiles> {
  const db = getDatabase();

  // Get current file with series and metadata
  const currentFile = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      series: {
        select: {
          id: true,
          name: true,
        },
      },
      metadata: {
        select: {
          series: true,
          number: true,
        },
      },
    },
  });

  if (!currentFile) {
    return {
      previous: null,
      next: null,
      currentIndex: 0,
      totalInSeries: 1,
      seriesName: null,
      seriesId: null,
    };
  }

  // Priority 1: Use Series entity if file is linked to one
  if (currentFile.seriesId && currentFile.series) {
    const seriesFiles = await db.comicFile.findMany({
      where: {
        seriesId: currentFile.seriesId,
      },
      include: {
        metadata: {
          select: {
            number: true,
          },
        },
      },
      orderBy: [
        { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
        { filename: 'asc' },
      ],
    });

    const currentIndex = seriesFiles.findIndex((f) => f.id === fileId);

    return {
      previous: currentIndex > 0
        ? {
            fileId: seriesFiles[currentIndex - 1]!.id,
            filename: seriesFiles[currentIndex - 1]!.filename,
            number: seriesFiles[currentIndex - 1]!.metadata?.number ?? undefined,
          }
        : null,
      next: currentIndex < seriesFiles.length - 1
        ? {
            fileId: seriesFiles[currentIndex + 1]!.id,
            filename: seriesFiles[currentIndex + 1]!.filename,
            number: seriesFiles[currentIndex + 1]!.metadata?.number ?? undefined,
          }
        : null,
      currentIndex,
      totalInSeries: seriesFiles.length,
      seriesName: currentFile.series.name,
      seriesId: currentFile.seriesId,
    };
  }

  // Priority 2: Fall back to metadata.series field
  const seriesName = currentFile.metadata?.series;
  if (seriesName) {
    const seriesFiles = await db.comicFile.findMany({
      where: {
        libraryId: currentFile.libraryId,
        metadata: {
          series: seriesName,
        },
      },
      include: {
        metadata: {
          select: {
            series: true,
            number: true,
          },
        },
      },
      orderBy: [
        { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
        { filename: 'asc' },
      ],
    });

    const currentIndex = seriesFiles.findIndex((f) => f.id === fileId);

    return {
      previous: currentIndex > 0
        ? {
            fileId: seriesFiles[currentIndex - 1]!.id,
            filename: seriesFiles[currentIndex - 1]!.filename,
            number: seriesFiles[currentIndex - 1]!.metadata?.number ?? undefined,
          }
        : null,
      next: currentIndex < seriesFiles.length - 1
        ? {
            fileId: seriesFiles[currentIndex + 1]!.id,
            filename: seriesFiles[currentIndex + 1]!.filename,
            number: seriesFiles[currentIndex + 1]!.metadata?.number ?? undefined,
          }
        : null,
      currentIndex,
      totalInSeries: seriesFiles.length,
      seriesName,
      seriesId: null,
    };
  }

  // Priority 3: Fall back to same folder/directory
  // Extract directory from relativePath
  const pathParts = currentFile.relativePath.split('/');
  pathParts.pop(); // Remove filename
  const directory = pathParts.join('/');

  // Find all files in the same directory
  const folderFiles = await db.comicFile.findMany({
    where: {
      libraryId: currentFile.libraryId,
      relativePath: {
        startsWith: directory ? `${directory}/` : '',
      },
    },
    select: {
      id: true,
      filename: true,
      relativePath: true,
    },
    orderBy: {
      filename: 'asc',
    },
  });

  // Filter to only direct children (same directory level)
  const sameLevel = folderFiles.filter((f) => {
    const fParts = f.relativePath.split('/');
    fParts.pop();
    return fParts.join('/') === directory;
  });

  // Sort naturally by filename
  sameLevel.sort((a, b) =>
    a.filename.localeCompare(b.filename, undefined, { numeric: true })
  );

  const currentIndex = sameLevel.findIndex((f) => f.id === fileId);

  return {
    previous: currentIndex > 0
      ? {
          fileId: sameLevel[currentIndex - 1]!.id,
          filename: sameLevel[currentIndex - 1]!.filename,
        }
      : null,
    next: currentIndex < sameLevel.length - 1
      ? {
          fileId: sameLevel[currentIndex + 1]!.id,
          filename: sameLevel[currentIndex + 1]!.filename,
        }
      : null,
    currentIndex,
    totalInSeries: sameLevel.length,
    seriesName: null,
    seriesId: null,
  };
}

// =============================================================================
// Series Progress Sync
// =============================================================================

/**
 * Internal helper to sync series progress for a user (takes db connection)
 */
async function syncSeriesProgressInternal(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  fileId: string
): Promise<void> {
  // Get the file and check if it's linked to a series
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    select: {
      seriesId: true,
    },
  });

  if (!file?.seriesId) {
    return; // File not linked to a series
  }

  // Count completed issues in this series for this user
  const completedCount = await db.userReadingProgress.count({
    where: {
      userId,
      file: {
        seriesId: file.seriesId,
      },
      completed: true,
    },
  });

  // Count total issues in this series
  const totalCount = await db.comicFile.count({
    where: {
      seriesId: file.seriesId,
    },
  });

  // Update or create SeriesProgress for this user
  await db.seriesProgress.upsert({
    where: {
      userId_seriesId: { userId, seriesId: file.seriesId },
    },
    create: {
      userId,
      seriesId: file.seriesId,
      totalOwned: totalCount,
      totalRead: completedCount,
      lastReadAt: new Date(),
    },
    update: {
      totalOwned: totalCount,
      totalRead: completedCount,
      lastReadAt: new Date(),
    },
  });
}

/**
 * Update SeriesProgress when an issue's reading status changes for a user
 * This recalculates totalRead and updates lastReadAt
 */
export async function syncSeriesProgress(userId: string, fileId: string): Promise<void> {
  const db = getDatabase();
  await syncSeriesProgressInternal(db, userId, fileId);
}
