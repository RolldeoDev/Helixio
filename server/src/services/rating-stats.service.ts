/**
 * Rating Stats Service
 *
 * Computes statistics about user ratings and reviews for display on the Stats page.
 * Used for "fun facts" and achievement progress tracking.
 */

import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export interface RatingStats {
  // Core counts
  totalSeriesRated: number;
  totalIssuesRated: number;
  totalReviewsWritten: number; // Has publicReview OR privateNotes

  // Distribution (for chart)
  ratingDistribution: { rating: number; count: number }[];

  // Averages
  averageRatingGiven: number | null; // null if no ratings

  // Extremes
  highestRatedSeries: { id: string; name: string; rating: number } | null;
  lowestRatedSeries: { id: string; name: string; rating: number } | null;

  // Most-rated entities
  mostRatedGenre: { name: string; count: number } | null;
  mostRatedPublisher: { name: string; count: number } | null;

  // Diversity (for achievements)
  uniqueGenresRated: number;
  uniquePublishersRated: number;

  // Streak stats
  currentRatingStreak: number;
  longestRatingStreak: number;

  // Review stats
  longestReviewLength: number;
  seriesWithCompleteRatings: number; // Series where ALL issues are rated

  // Same-day stats (for achievements)
  maxRatingsSameDay: number;
  maxReviewsSameDay: number;
}

// =============================================================================
// Main Computation
// =============================================================================

/**
 * Compute comprehensive rating statistics for a user
 */
export async function computeRatingStats(userId: string): Promise<RatingStats> {
  const db = getDatabase();

  // Run queries in parallel for efficiency
  const [
    seriesRatings,
    issueRatings,
    seriesReviews,
    issueReviews,
    issueRatingsWithMetadata,
    ratingDates,
    reviewDates,
  ] = await Promise.all([
    // Series ratings
    db.userSeriesData.findMany({
      where: { userId, rating: { not: null } },
      select: {
        rating: true,
        seriesId: true,
        series: {
          select: { id: true, name: true },
        },
      },
    }),

    // Issue ratings
    db.userReadingProgress.findMany({
      where: { userId, rating: { not: null } },
      select: {
        rating: true,
        fileId: true,
        file: {
          select: { seriesId: true },
        },
      },
    }),

    // Series reviews (publicReview or privateNotes)
    db.userSeriesData.findMany({
      where: {
        userId,
        OR: [
          { publicReview: { not: null } },
          { privateNotes: { not: null } },
        ],
      },
      select: {
        publicReview: true,
        privateNotes: true,
      },
    }),

    // Issue reviews
    db.userReadingProgress.findMany({
      where: {
        userId,
        OR: [
          { publicReview: { not: null } },
          { privateNotes: { not: null } },
        ],
      },
      select: {
        publicReview: true,
        privateNotes: true,
      },
    }),

    // Issue ratings with metadata for genre/publisher analysis
    db.userReadingProgress.findMany({
      where: { userId, rating: { not: null } },
      select: {
        rating: true,
        file: {
          select: {
            metadata: {
              select: {
                genre: true,
                publisher: true,
              },
            },
          },
        },
      },
    }),

    // Rating dates for streak calculation
    db.userSeriesData.findMany({
      where: { userId, ratedAt: { not: null } },
      select: { ratedAt: true },
    }),

    // Review dates for same-day stats
    db.userReadingProgress.findMany({
      where: { userId, ratedAt: { not: null } },
      select: { ratedAt: true },
    }),
  ]);

  // Combine all ratings for distribution
  const allRatings: number[] = [
    ...seriesRatings.map((r) => r.rating as number),
    ...issueRatings.map((r) => r.rating as number),
  ];

  // Calculate rating distribution
  const ratingDistribution = calculateDistribution(allRatings);

  // Calculate average
  const averageRatingGiven =
    allRatings.length > 0
      ? Math.round((allRatings.reduce((a, b) => a + b, 0) / allRatings.length) * 10) / 10
      : null;

  // Find highest/lowest rated series
  const { highestRatedSeries, lowestRatedSeries } = findExtremes(seriesRatings);

  // Calculate genre/publisher stats from rated issues
  const { mostRatedGenre, mostRatedPublisher, uniqueGenresRated, uniquePublishersRated } =
    calculateEntityStats(issueRatingsWithMetadata);

  // Calculate streaks
  const allRatingDates: Date[] = [
    ...ratingDates.filter((r) => r.ratedAt !== null).map((r) => r.ratedAt as Date),
    ...reviewDates.filter((r) => r.ratedAt !== null).map((r) => r.ratedAt as Date),
  ];
  const { currentRatingStreak, longestRatingStreak } = calculateStreaks(allRatingDates);

  // Find longest review
  const allReviews = [...seriesReviews, ...issueReviews];
  const longestReviewLength = findLongestReview(allReviews);

  // Count series with complete ratings
  const seriesWithCompleteRatings = await countSeriesWithCompleteRatings(userId, db);

  // Calculate same-day max stats
  const { maxRatingsSameDay, maxReviewsSameDay } = calculateSameDayStats(allRatingDates);

  return {
    totalSeriesRated: seriesRatings.length,
    totalIssuesRated: issueRatings.length,
    totalReviewsWritten: allReviews.length,
    ratingDistribution,
    averageRatingGiven,
    highestRatedSeries,
    lowestRatedSeries,
    mostRatedGenre,
    mostRatedPublisher,
    uniqueGenresRated,
    uniquePublishersRated,
    currentRatingStreak,
    longestRatingStreak,
    longestReviewLength,
    seriesWithCompleteRatings,
    maxRatingsSameDay,
    maxReviewsSameDay,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function calculateDistribution(ratings: number[]): { rating: number; count: number }[] {
  // Support 0.5-5.0 in 0.5 increments (10 buckets)
  const buckets = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
  const counts: Record<number, number> = {};
  buckets.forEach((b) => (counts[b] = 0));

  for (const rating of ratings) {
    // Round to nearest 0.5 to handle any floating point issues
    const bucket = Math.round(rating * 2) / 2;
    if (bucket >= 0.5 && bucket <= 5) {
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
  }
  return buckets.map((rating) => ({ rating, count: counts[rating] ?? 0 }));
}

function findExtremes(
  seriesRatings: Array<{
    rating: number | null;
    seriesId: string;
    series: { id: string; name: string };
  }>
): {
  highestRatedSeries: { id: string; name: string; rating: number } | null;
  lowestRatedSeries: { id: string; name: string; rating: number } | null;
} {
  if (seriesRatings.length === 0) {
    return { highestRatedSeries: null, lowestRatedSeries: null };
  }

  let highest = seriesRatings[0];
  let lowest = seriesRatings[0];

  for (const r of seriesRatings) {
    if (highest && r.rating !== null && highest.rating !== null && r.rating > highest.rating) {
      highest = r;
    }
    if (lowest && r.rating !== null && lowest.rating !== null && r.rating < lowest.rating) {
      lowest = r;
    }
  }

  if (!highest || !lowest || highest.rating === null || lowest.rating === null) {
    return { highestRatedSeries: null, lowestRatedSeries: null };
  }

  return {
    highestRatedSeries: {
      id: highest.series.id,
      name: highest.series.name,
      rating: highest.rating,
    },
    lowestRatedSeries: {
      id: lowest.series.id,
      name: lowest.series.name,
      rating: lowest.rating,
    },
  };
}

function calculateEntityStats(
  issueRatings: Array<{
    rating: number | null;
    file: {
      metadata: { genre: string | null; publisher: string | null } | null;
    };
  }>
): {
  mostRatedGenre: { name: string; count: number } | null;
  mostRatedPublisher: { name: string; count: number } | null;
  uniqueGenresRated: number;
  uniquePublishersRated: number;
} {
  const genreCounts = new Map<string, number>();
  const publisherCounts = new Map<string, number>();

  for (const r of issueRatings) {
    const meta = r.file?.metadata;
    if (!meta) continue;

    // Count genres (comma-separated)
    if (meta.genre) {
      const genres = meta.genre.split(',').map((g) => g.trim()).filter(Boolean);
      for (const genre of genres) {
        genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
      }
    }

    // Count publishers
    if (meta.publisher) {
      publisherCounts.set(meta.publisher, (publisherCounts.get(meta.publisher) ?? 0) + 1);
    }
  }

  // Find most-rated
  let mostRatedGenre: { name: string; count: number } | null = null;
  let maxGenreCount = 0;
  for (const [name, count] of genreCounts) {
    if (count > maxGenreCount) {
      maxGenreCount = count;
      mostRatedGenre = { name, count };
    }
  }

  let mostRatedPublisher: { name: string; count: number } | null = null;
  let maxPublisherCount = 0;
  for (const [name, count] of publisherCounts) {
    if (count > maxPublisherCount) {
      maxPublisherCount = count;
      mostRatedPublisher = { name, count };
    }
  }

  return {
    mostRatedGenre,
    mostRatedPublisher,
    uniqueGenresRated: genreCounts.size,
    uniquePublishersRated: publisherCounts.size,
  };
}

function calculateStreaks(dates: Date[]): {
  currentRatingStreak: number;
  longestRatingStreak: number;
} {
  if (dates.length === 0) {
    return { currentRatingStreak: 0, longestRatingStreak: 0 };
  }

  // Get unique days (YYYY-MM-DD format)
  const uniqueDays = new Set<string>();
  for (const date of dates) {
    const dayStr = date.toISOString().split('T')[0];
    if (dayStr) uniqueDays.add(dayStr);
  }

  // Sort days descending
  const sortedDays = Array.from(uniqueDays).sort().reverse();

  if (sortedDays.length === 0) {
    return { currentRatingStreak: 0, longestRatingStreak: 0 };
  }

  // Calculate current streak (from today or yesterday backwards)
  const today = new Date().toISOString().split('T')[0] ?? '';
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0] ?? '';

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDay: string | null = null;

  for (const day of sortedDays) {
    if (prevDay === null) {
      // First day - check if it's recent enough to count toward current streak
      if (day === today || day === yesterday) {
        currentStreak = 1;
      }
      tempStreak = 1;
    } else {
      // Check if consecutive
      const prevDate = new Date(prevDay);
      const currDate = new Date(day);
      const diffDays = Math.round(
        (prevDate.getTime() - currDate.getTime()) / 86400000
      );

      if (diffDays === 1) {
        tempStreak++;
        if (currentStreak > 0 && currentStreak === tempStreak - 1) {
          currentStreak = tempStreak;
        }
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    prevDay = day;
  }

  longestStreak = Math.max(longestStreak, tempStreak);

  return { currentRatingStreak: currentStreak, longestRatingStreak: longestStreak };
}

function findLongestReview(
  reviews: Array<{ publicReview: string | null; privateNotes: string | null }>
): number {
  let longest = 0;
  for (const r of reviews) {
    if (r.publicReview) {
      longest = Math.max(longest, r.publicReview.length);
    }
    if (r.privateNotes) {
      longest = Math.max(longest, r.privateNotes.length);
    }
  }
  return longest;
}

async function countSeriesWithCompleteRatings(
  userId: string,
  db: ReturnType<typeof getDatabase>
): Promise<number> {
  // Get all series with their issue counts
  const seriesWithCounts = await db.series.findMany({
    select: {
      id: true,
      _count: {
        select: { issues: true },
      },
    },
  });

  // For efficiency, only check series that have at least 1 issue
  const seriesWithFiles = seriesWithCounts.filter((s) => s._count.issues > 0);

  if (seriesWithFiles.length === 0) {
    return 0;
  }

  // Get all rated files for this user grouped by series
  const ratedFiles = await db.userReadingProgress.findMany({
    where: {
      userId,
      rating: { not: null },
    },
    select: {
      file: {
        select: { seriesId: true },
      },
    },
  });

  // Build a map of seriesId -> rated count
  const seriesRatedCounts = new Map<string, number>();
  for (const rf of ratedFiles) {
    const seriesId = rf.file?.seriesId;
    if (seriesId) {
      seriesRatedCounts.set(seriesId, (seriesRatedCounts.get(seriesId) ?? 0) + 1);
    }
  }

  // Count series where all issues are rated
  let count = 0;
  for (const series of seriesWithFiles) {
    const ratedCount = seriesRatedCounts.get(series.id) ?? 0;
    if (ratedCount >= series._count.issues) {
      count++;
    }
  }

  return count;
}

function calculateSameDayStats(dates: Date[]): {
  maxRatingsSameDay: number;
  maxReviewsSameDay: number;
} {
  if (dates.length === 0) {
    return { maxRatingsSameDay: 0, maxReviewsSameDay: 0 };
  }

  // Count ratings per day
  const dayCounts = new Map<string, number>();
  for (const date of dates) {
    const day = date.toISOString().split('T')[0];
    if (day) {
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }
  }

  let maxRatingsSameDay = 0;
  for (const count of dayCounts.values()) {
    maxRatingsSameDay = Math.max(maxRatingsSameDay, count);
  }

  // For reviews, we'd need separate tracking - for now use same as ratings
  // This is a simplification; reviews could be tracked separately if needed
  return { maxRatingsSameDay, maxReviewsSameDay: maxRatingsSameDay };
}
