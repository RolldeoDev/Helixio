/**
 * Reading History Service
 *
 * Tracks individual reading sessions and aggregates statistics.
 * Records when users start/stop reading, pages read, and duration.
 */

import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export interface ReadingSession {
  id: string;
  fileId: string;
  startedAt: Date;
  endedAt: Date | null;
  startPage: number;
  endPage: number;
  pagesRead: number;
  duration: number;
  completed: boolean;
}

export interface ReadingHistoryItem {
  id: string;
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  startedAt: Date;
  endedAt: Date | null;
  pagesRead: number;
  duration: number;
  completed: boolean;
}

export interface DailyStats {
  date: string;
  comicsStarted: number;
  comicsCompleted: number;
  pagesRead: number;
  totalDuration: number;
  sessionsCount: number;
}

export interface AllTimeStats {
  totalComicsRead: number;
  totalPagesRead: number;
  totalReadingTime: number; // seconds
  averageSessionDuration: number;
  longestSession: number;
  currentStreak: number;
  longestStreak: number;
  // Extended stats for fun facts
  totalActiveDays: number;
  maxPagesDay: number;
  maxComicsDay: number;
  maxTimeDay: number;
  sessionsTotal: number;
  bingeDaysCount: number; // Days with 10+ comics read
  daysSinceLastRead: number;
}

// =============================================================================
// Session Tracking
// =============================================================================

/**
 * Start a new reading session
 */
export async function startSession(
  fileId: string,
  startPage: number = 0
): Promise<string> {
  const db = getDatabase();

  const session = await db.readingHistory.create({
    data: {
      fileId,
      startPage,
      endPage: startPage,
    },
  });

  // Update daily stats
  await incrementDailyStat('sessionsCount', 1);
  await incrementDailyStat('comicsStarted', 1);

  return session.id;
}

/**
 * Update a reading session with current progress
 * @param confirmedPagesRead - Number of pages confirmed as read (viewed for 3+ seconds)
 */
export async function updateSession(
  sessionId: string,
  currentPage: number,
  confirmedPagesRead?: number
): Promise<void> {
  const db = getDatabase();

  const session = await db.readingHistory.findUnique({
    where: { id: sessionId },
  });

  if (!session) return;

  // Use confirmed pages if provided, otherwise fall back to range calculation
  const pagesRead = confirmedPagesRead ?? Math.max(0, currentPage - session.startPage + 1);
  const duration = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);

  await db.readingHistory.update({
    where: { id: sessionId },
    data: {
      endPage: currentPage,
      pagesRead,
      duration,
    },
  });
}

/**
 * End a reading session
 * @param confirmedPagesRead - Number of pages confirmed as read (viewed for 3+ seconds)
 */
export async function endSession(
  sessionId: string,
  endPage: number,
  completed: boolean = false,
  confirmedPagesRead?: number
): Promise<ReadingSession | null> {
  const db = getDatabase();

  const session = await db.readingHistory.findUnique({
    where: { id: sessionId },
  });

  if (!session) return null;

  // Use confirmed pages if provided, otherwise fall back to range calculation
  const pagesRead = confirmedPagesRead ?? Math.max(0, endPage - session.startPage + 1);
  const duration = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);

  const updated = await db.readingHistory.update({
    where: { id: sessionId },
    data: {
      endedAt: new Date(),
      endPage,
      pagesRead,
      duration,
      completed,
    },
  });

  // Update daily stats
  await incrementDailyStat('pagesRead', pagesRead);
  await incrementDailyStat('totalDuration', duration);
  if (completed) {
    await incrementDailyStat('comicsCompleted', 1);
  }

  return {
    id: updated.id,
    fileId: updated.fileId,
    startedAt: updated.startedAt,
    endedAt: updated.endedAt,
    startPage: updated.startPage,
    endPage: updated.endPage,
    pagesRead: updated.pagesRead,
    duration: updated.duration,
    completed: updated.completed,
  };
}

// =============================================================================
// History Queries
// =============================================================================

/**
 * Get recent reading history
 */
export async function getRecentHistory(
  limit: number = 20,
  libraryId?: string
): Promise<ReadingHistoryItem[]> {
  const db = getDatabase();

  const history = await db.readingHistory.findMany({
    where: libraryId
      ? { file: { libraryId } }
      : undefined,
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: {
      file: {
        select: {
          filename: true,
          relativePath: true,
          libraryId: true,
        },
      },
    },
  });

  return history.map((h) => ({
    id: h.id,
    fileId: h.fileId,
    filename: h.file.filename,
    relativePath: h.file.relativePath,
    libraryId: h.file.libraryId,
    startedAt: h.startedAt,
    endedAt: h.endedAt,
    pagesRead: h.pagesRead,
    duration: h.duration,
    completed: h.completed,
  }));
}

/**
 * Get reading history for a specific file
 */
export async function getFileHistory(fileId: string): Promise<ReadingSession[]> {
  const db = getDatabase();

  const history = await db.readingHistory.findMany({
    where: { fileId },
    orderBy: { startedAt: 'desc' },
  });

  return history.map((h) => ({
    id: h.id,
    fileId: h.fileId,
    startedAt: h.startedAt,
    endedAt: h.endedAt,
    startPage: h.startPage,
    endPage: h.endPage,
    pagesRead: h.pagesRead,
    duration: h.duration,
    completed: h.completed,
  }));
}

/**
 * Clear history for a file
 */
export async function clearFileHistory(fileId: string): Promise<void> {
  const db = getDatabase();
  await db.readingHistory.deleteMany({ where: { fileId } });
}

/**
 * Clear all history
 */
export async function clearAllHistory(): Promise<void> {
  const db = getDatabase();
  await db.readingHistory.deleteMany();
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get statistics for a date range
 */
export async function getStats(
  startDate?: Date,
  endDate?: Date
): Promise<DailyStats[]> {
  const db = getDatabase();

  const where: { date?: { gte?: Date; lte?: Date } } = {};
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = startDate;
    if (endDate) where.date.lte = endDate;
  }

  const stats = await db.readingStats.findMany({
    where,
    orderBy: { date: 'desc' },
  });

  return stats.map((s) => ({
    date: s.date.toISOString().split('T')[0]!,
    comicsStarted: s.comicsStarted,
    comicsCompleted: s.comicsCompleted,
    pagesRead: s.pagesRead,
    totalDuration: s.totalDuration,
    sessionsCount: s.sessionsCount,
  }));
}

/**
 * Get all-time statistics
 */
export async function getAllTimeStats(): Promise<AllTimeStats> {
  const db = getDatabase();

  // Aggregate stats
  const aggregated = await db.readingStats.aggregate({
    _sum: {
      comicsCompleted: true,
      pagesRead: true,
      totalDuration: true,
      sessionsCount: true,
    },
  });

  // Get unique comics read
  const uniqueComics = await db.readingHistory.groupBy({
    by: ['fileId'],
  });

  // Get longest session
  const longestSession = await db.readingHistory.findFirst({
    orderBy: { duration: 'desc' },
    select: { duration: true },
  });

  // Get all daily stats for extended calculations
  const allDailyStats = await db.readingStats.findMany({
    orderBy: { date: 'desc' },
  });

  // Calculate streaks and extended stats
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let lastDate: Date | null = null;
  let lastActivityDate: Date | null = null;
  const today = getTodayStart();

  // Extended stats tracking
  let totalActiveDays = 0;
  let maxPagesDay = 0;
  let maxComicsDay = 0;
  let maxTimeDay = 0;
  let bingeDaysCount = 0; // Days with 10+ comics completed

  for (const stat of allDailyStats) {
    if (stat.sessionsCount > 0) {
      // Track active days
      totalActiveDays++;

      // Track max values
      if (stat.pagesRead > maxPagesDay) maxPagesDay = stat.pagesRead;
      if (stat.comicsCompleted > maxComicsDay) maxComicsDay = stat.comicsCompleted;
      if (stat.totalDuration > maxTimeDay) maxTimeDay = stat.totalDuration;

      // Count binge days (10+ comics completed in a day)
      if (stat.comicsCompleted >= 10) bingeDaysCount++;

      // Track last activity date (first in sorted order)
      if (!lastActivityDate) {
        lastActivityDate = stat.date;
      }

      // Streak calculation
      if (lastDate === null) {
        // First day with activity - check if it's today or yesterday
        const daysSinceActivity = Math.floor(
          (today.getTime() - stat.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceActivity <= 1) {
          // Activity today or yesterday - streak is active
          tempStreak = 1;
          currentStreak = 1;
        } else {
          // Last activity was more than 1 day ago - no current streak
          tempStreak = 1;
          currentStreak = 0;
        }
      } else {
        // Check if consecutive day
        const dayDiff = Math.floor(
          (lastDate.getTime() - stat.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (dayDiff === 1) {
          tempStreak++;
          if (currentStreak > 0) currentStreak++;
        } else {
          // Streak broken
          if (tempStreak > longestStreak) longestStreak = tempStreak;
          tempStreak = 1;
          if (currentStreak > 0) currentStreak = 0;
        }
      }
      lastDate = stat.date;
    }
  }

  if (tempStreak > longestStreak) longestStreak = tempStreak;

  // Calculate days since last read
  let daysSinceLastRead = 0;
  if (lastActivityDate) {
    daysSinceLastRead = Math.floor(
      (today.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const totalSessions = aggregated._sum.sessionsCount || 0;
  const totalDuration = aggregated._sum.totalDuration || 0;

  return {
    totalComicsRead: uniqueComics.length,
    totalPagesRead: aggregated._sum.pagesRead || 0,
    totalReadingTime: totalDuration,
    averageSessionDuration: totalSessions > 0 ? Math.floor(totalDuration / totalSessions) : 0,
    longestSession: longestSession?.duration || 0,
    currentStreak,
    longestStreak,
    // Extended stats
    totalActiveDays,
    maxPagesDay,
    maxComicsDay,
    maxTimeDay,
    sessionsTotal: totalSessions,
    bingeDaysCount,
    daysSinceLastRead,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get today's date at midnight UTC
 */
function getTodayStart(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

/**
 * Increment a daily stat field
 */
async function incrementDailyStat(
  field: 'comicsStarted' | 'comicsCompleted' | 'pagesRead' | 'totalDuration' | 'sessionsCount',
  amount: number
): Promise<void> {
  const db = getDatabase();
  const today = getTodayStart();

  await db.readingStats.upsert({
    where: { date: today },
    create: {
      date: today,
      [field]: amount,
    },
    update: {
      [field]: { increment: amount },
    },
  });
}
