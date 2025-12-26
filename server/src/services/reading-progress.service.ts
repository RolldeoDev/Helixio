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
  currentPage: number;
  totalPages: number;
  progress: number; // 0-100 percentage
  lastReadAt: Date;
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

    return {
      ...progress,
      bookmarks: [],
    };
  }

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
 * Get recently read files that are in progress (not completed) for a specific user
 */
export async function getContinueReading(
  userId: string,
  limit = 3,
  libraryId?: string
): Promise<ContinueReadingItem[]> {
  const db = getDatabase();

  const progress = await db.userReadingProgress.findMany({
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

  return progress.map((p) => ({
    fileId: p.file.id,
    filename: p.file.filename,
    relativePath: p.file.relativePath,
    libraryId: p.file.libraryId,
    currentPage: p.currentPage,
    totalPages: p.totalPages,
    progress: p.totalPages > 0 ? Math.round((p.currentPage / p.totalPages) * 100) : 0,
    lastReadAt: p.lastReadAt,
    series: p.file.metadata?.series ?? null,
    number: p.file.metadata?.number ?? null,
    title: p.file.metadata?.title ?? null,
    issueCount: p.file.series?.issueCount ?? null,
  }));
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
 * Parse issue number from string for sorting
 * Handles formats like "1", "1.5", "Annual 1", "100", etc.
 */
function parseIssueNumber(number: string | null): number {
  if (!number) return Infinity;

  // Extract numeric portion
  const match = number.match(/[\d.]+/);
  if (match) {
    return parseFloat(match[0]);
  }

  return Infinity;
}

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
      orderBy: {
        filename: 'asc',
      },
    });

    // Sort by issue number (parsed numerically)
    seriesFiles.sort((a, b) => {
      const numA = parseIssueNumber(a.metadata?.number ?? null);
      const numB = parseIssueNumber(b.metadata?.number ?? null);
      if (numA !== numB) return numA - numB;
      // Fall back to filename for same issue numbers
      return a.filename.localeCompare(b.filename, undefined, { numeric: true });
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
      orderBy: {
        filename: 'asc',
      },
    });

    // Sort by issue number (parsed numerically)
    seriesFiles.sort((a, b) => {
      const numA = parseIssueNumber(a.metadata?.number ?? null);
      const numB = parseIssueNumber(b.metadata?.number ?? null);
      if (numA !== numB) return numA - numB;
      // Fall back to filename for same issue numbers
      return a.filename.localeCompare(b.filename, undefined, { numeric: true });
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
