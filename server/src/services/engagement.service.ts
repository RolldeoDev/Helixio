/**
 * Engagement Service
 *
 * Computes user engagement scores for series based on:
 * - Recency: How recently the series was read (decays over 30 days)
 * - Time spent: Total reading time (logarithmic scaling)
 * - Completion: Number of completed issues (logarithmic scaling)
 *
 * Used by the recommendation engine to weight recommendations
 * based on what series the user is most engaged with.
 */

import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export interface EngagementScoreInput {
  lastReadAt: Date | null;
  totalReadingTime: number; // seconds
  completedIssues: number;
}

export interface EngagedSeries {
  seriesId: string;
  seriesName: string;
  engagementScore: number;
  // Component scores for debugging/display
  recencyScore: number;
  timeScore: number;
  completionScore: number;
  // Raw values
  lastReadAt: Date | null;
  totalReadingTime: number;
  completedIssues: number;
}

export interface SeriesMetadata {
  id: string;
  name: string;
  genres: string | null;
  tags: string | null;
  characters: string | null;
  teams: string | null;
  creators: string | null;
  writer: string | null;
  penciller: string | null;
  publisher: string | null;
  summary: string | null;
}

// =============================================================================
// Configuration
// =============================================================================

/** Number of days for recency decay (score goes from 1.0 to 0.0 over this period) */
const RECENCY_WINDOW_DAYS = 30;

/** Weight for recency in the overall engagement score */
const RECENCY_WEIGHT = 0.4;

/** Weight for time spent in the overall engagement score */
const TIME_WEIGHT = 0.3;

/** Weight for completion count in the overall engagement score */
const COMPLETION_WEIGHT = 0.3;

// =============================================================================
// Score Computation
// =============================================================================

/**
 * Compute engagement score from input values.
 *
 * Formula:
 * - recencyScore = max(0, 1 - daysSinceRead / 30)
 * - timeScore = min(1, log10(hours + 1) / 2)  // caps at ~100 hours
 * - completionScore = min(1, log10(completed + 1) / 2)  // caps at ~100 issues
 *
 * @param input - The engagement input values
 * @returns Engagement score between 0.0 and 1.0
 */
export function computeEngagementScore(input: EngagementScoreInput): {
  engagementScore: number;
  recencyScore: number;
  timeScore: number;
  completionScore: number;
} {
  // Recency score: 1.0 for today, decaying to 0 over RECENCY_WINDOW_DAYS
  let recencyScore = 0;
  if (input.lastReadAt) {
    const daysSinceRead =
      (Date.now() - input.lastReadAt.getTime()) / (1000 * 60 * 60 * 24);
    recencyScore = Math.max(0, 1 - daysSinceRead / RECENCY_WINDOW_DAYS);
  }

  // Time score: logarithmic scaling (diminishing returns)
  // 1 hour = 0.5, 10 hours = 0.8, 100 hours = 1.0
  const hours = input.totalReadingTime / 3600;
  const timeScore = Math.min(1, Math.log10(hours + 1) / 2);

  // Completion score: logarithmic scaling
  // 1 issue = 0.3, 10 issues = 0.6, 100 issues = 1.0
  const completionScore = Math.min(
    1,
    Math.log10(input.completedIssues + 1) / 2
  );

  // Weighted sum
  const engagementScore =
    recencyScore * RECENCY_WEIGHT +
    timeScore * TIME_WEIGHT +
    completionScore * COMPLETION_WEIGHT;

  return {
    engagementScore,
    recencyScore,
    timeScore,
    completionScore,
  };
}

// =============================================================================
// Database Queries
// =============================================================================

/**
 * Get the user's most engaged series with full metadata.
 *
 * @param userId - The user ID
 * @param limit - Maximum number of series to return (default: 10)
 * @returns Array of engaged series sorted by engagement score
 */
export async function getUserEngagedSeries(
  userId: string,
  limit = 10
): Promise<Array<EngagedSeries & { series: SeriesMetadata }>> {
  const db = getDatabase();

  // Get series progress with series metadata
  const progressRecords = await db.seriesProgress.findMany({
    where: {
      userId,
      totalRead: { gt: 0 }, // Only include series with at least one read
    },
    include: {
      series: {
        select: {
          id: true,
          name: true,
          genres: true,
          tags: true,
          characters: true,
          teams: true,
          creators: true,
          writer: true,
          penciller: true,
          publisher: true,
          summary: true,
          deletedAt: true,
        },
      },
    },
  });

  // Filter out deleted series
  const activeProgress = progressRecords.filter(
    (p) => p.series && !p.series.deletedAt
  );

  if (activeProgress.length === 0) {
    return [];
  }

  // Get reading time per series from ReadingHistory
  // First, get all files for the relevant series
  const seriesIds = activeProgress.map((p) => p.seriesId);

  const files = await db.comicFile.findMany({
    where: {
      seriesId: { in: seriesIds },
    },
    select: {
      id: true,
      seriesId: true,
    },
  });

  // Create a map of fileId to seriesId for quick lookup
  const fileToSeries = new Map<string, string>();
  for (const file of files) {
    if (file.seriesId) {
      fileToSeries.set(file.id, file.seriesId);
    }
  }

  // Get reading time aggregated by file
  const readingTimeByFile = await db.readingHistory.groupBy({
    by: ['fileId'],
    _sum: { duration: true },
    where: {
      fileId: { in: Array.from(fileToSeries.keys()) },
    },
  });

  // Aggregate reading time by series
  const seriesReadingTime = new Map<string, number>();
  for (const { fileId, _sum } of readingTimeByFile) {
    const seriesId = fileToSeries.get(fileId);
    if (seriesId) {
      seriesReadingTime.set(
        seriesId,
        (seriesReadingTime.get(seriesId) || 0) + (_sum.duration || 0)
      );
    }
  }

  // Compute engagement scores for each series
  const engagedSeries: Array<EngagedSeries & { series: SeriesMetadata }> = [];

  for (const progress of activeProgress) {
    if (!progress.series) continue;

    const totalReadingTime = seriesReadingTime.get(progress.seriesId) || 0;

    const scores = computeEngagementScore({
      lastReadAt: progress.lastReadAt,
      totalReadingTime,
      completedIssues: progress.totalRead,
    });

    engagedSeries.push({
      seriesId: progress.seriesId,
      seriesName: progress.series.name,
      engagementScore: scores.engagementScore,
      recencyScore: scores.recencyScore,
      timeScore: scores.timeScore,
      completionScore: scores.completionScore,
      lastReadAt: progress.lastReadAt,
      totalReadingTime,
      completedIssues: progress.totalRead,
      series: {
        id: progress.series.id,
        name: progress.series.name,
        genres: progress.series.genres,
        tags: progress.series.tags,
        characters: progress.series.characters,
        teams: progress.series.teams,
        creators: progress.series.creators,
        writer: progress.series.writer,
        penciller: progress.series.penciller,
        publisher: progress.series.publisher,
        summary: progress.series.summary,
      },
    });
  }

  // Sort by engagement score and return top N
  return engagedSeries
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, limit);
}

/**
 * Get the series IDs that a user has read (for exclusion in recommendations).
 *
 * @param userId - The user ID
 * @returns Set of series IDs the user has read
 */
export async function getUserReadSeriesIds(userId: string): Promise<Set<string>> {
  const db = getDatabase();

  const progress = await db.seriesProgress.findMany({
    where: {
      userId,
      OR: [{ totalRead: { gt: 0 } }, { totalInProgress: { gt: 0 } }],
    },
    select: {
      seriesId: true,
    },
  });

  return new Set(progress.map((p) => p.seriesId));
}

/**
 * Check if a user has sufficient reading history for personalized recommendations.
 * Returns true if the user has read at least 3 series.
 *
 * @param userId - The user ID
 * @returns True if the user has enough history
 */
export async function hasEnoughReadingHistory(userId: string): Promise<boolean> {
  const db = getDatabase();

  const count = await db.seriesProgress.count({
    where: {
      userId,
      totalRead: { gt: 0 },
    },
  });

  return count >= 3;
}

/**
 * Get basic engagement stats for a user.
 *
 * @param userId - The user ID
 * @returns Basic engagement statistics
 */
export async function getUserEngagementStats(userId: string): Promise<{
  seriesRead: number;
  totalIssuesRead: number;
  totalReadingTime: number;
  avgIssuesPerSeries: number;
}> {
  const db = getDatabase();

  const progress = await db.seriesProgress.findMany({
    where: {
      userId,
      totalRead: { gt: 0 },
    },
    select: {
      totalRead: true,
    },
  });

  const seriesRead = progress.length;
  const totalIssuesRead = progress.reduce((sum, p) => sum + p.totalRead, 0);

  // Get total reading time from history
  const timeResult = await db.readingHistory.aggregate({
    _sum: { duration: true },
  });

  return {
    seriesRead,
    totalIssuesRead,
    totalReadingTime: timeResult._sum.duration || 0,
    avgIssuesPerSeries: seriesRead > 0 ? totalIssuesRead / seriesRead : 0,
  };
}
