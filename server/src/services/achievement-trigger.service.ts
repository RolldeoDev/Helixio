/**
 * Achievement Trigger Service
 *
 * Handles triggering achievement checks after reading events.
 * Gathers user stats and calls the achievement service to check for unlocks.
 */

import { getDatabase } from './database.service.js';
import { checkAndUpdateAchievements, type UserStats, type AchievementWithProgress } from './achievements.service.js';
import { logInfo, logError } from './logger.service.js';
import { sendAchievementUnlock } from './sse.service.js';

/**
 * Gather UserStats for achievement evaluation
 * This aggregates reading statistics needed for achievement checking
 *
 * Note: Some stats are simplified due to schema limitations.
 * The schema doesn't track all reading data per-user, so we use available data.
 */
async function getUserStatsForAchievements(userId: string): Promise<UserStats> {
  const db = getDatabase();

  // Get user-level stats (singleton, not per-user)
  const userStat = await db.userStat.findFirst();

  // Get completed comics count for this user
  const comicsCompleted = await db.userReadingProgress.count({
    where: { userId, completed: true },
  });

  // Get total comics owned (global)
  const comicsTotal = await db.comicFile.count({
    where: { status: 'indexed' },
  });

  // Get reading history stats for this user (via their reading progress)
  // Note: ReadingHistory doesn't have userId, so we aggregate from UserReadingProgress
  const userProgressWithPages = await db.userReadingProgress.aggregate({
    where: { userId },
    _sum: {
      totalPages: true,
    },
    _count: true,
  });

  // Estimate pages read from completed items
  const pagesTotal = userProgressWithPages._sum.totalPages ?? 0;

  // Count comics opened (any reading progress record means user opened/started the comic)
  const comicsOpened = userProgressWithPages._count ?? 0;

  // Get user's read file IDs (for filtering stats to user-read comics only)
  // This is used for entity stats, decades, and hidden gems
  const userReadFiles = await db.userReadingProgress.findMany({
    where: { userId, currentPage: { gt: 0 } },
    select: { fileId: true },
  });
  const userReadFileIds = userReadFiles.map(f => f.fileId);

  // Get unique entity counts from user-read comics (not global stats)
  // FileMetadata stores creators, genres, etc. as comma-separated strings
  let uniqueWriters = 0;
  let uniquePencillers = 0;
  let uniqueInkers = 0;
  let uniqueColorists = 0;
  let uniqueLetterers = 0;
  let uniqueCoverArtists = 0;
  let uniqueGenres = 0;
  let uniqueCharacters = 0;
  let uniquePublishers = 0;
  let uniqueTeams = 0;
  let uniqueLocations = 0;
  let uniqueFormats = 0;

  if (userReadFileIds.length > 0) {
    const readMetadata = await db.fileMetadata.findMany({
      where: { comicId: { in: userReadFileIds } },
      select: {
        writer: true,
        penciller: true,
        inker: true,
        colorist: true,
        letterer: true,
        coverArtist: true,
        genre: true,
        characters: true,
        publisher: true,
        teams: true,
        locations: true,
        format: true,
      },
    });

    // Parse comma-separated fields and count unique values
    const writerSet = new Set<string>();
    const pencillerSet = new Set<string>();
    const inkerSet = new Set<string>();
    const coloristSet = new Set<string>();
    const lettererSet = new Set<string>();
    const coverArtistSet = new Set<string>();
    const genreSet = new Set<string>();
    const characterSet = new Set<string>();
    const publisherSet = new Set<string>();
    const teamSet = new Set<string>();
    const locationSet = new Set<string>();
    const formatSet = new Set<string>();

    for (const meta of readMetadata) {
      if (meta.writer) {
        meta.writer.split(',').map(s => s.trim()).filter(Boolean).forEach(s => writerSet.add(s.toLowerCase()));
      }
      if (meta.penciller) {
        meta.penciller.split(',').map(s => s.trim()).filter(Boolean).forEach(s => pencillerSet.add(s.toLowerCase()));
      }
      if (meta.inker) {
        meta.inker.split(',').map(s => s.trim()).filter(Boolean).forEach(s => inkerSet.add(s.toLowerCase()));
      }
      if (meta.colorist) {
        meta.colorist.split(',').map(s => s.trim()).filter(Boolean).forEach(s => coloristSet.add(s.toLowerCase()));
      }
      if (meta.letterer) {
        meta.letterer.split(',').map(s => s.trim()).filter(Boolean).forEach(s => lettererSet.add(s.toLowerCase()));
      }
      if (meta.coverArtist) {
        meta.coverArtist.split(',').map(s => s.trim()).filter(Boolean).forEach(s => coverArtistSet.add(s.toLowerCase()));
      }
      if (meta.genre) {
        meta.genre.split(',').map(s => s.trim()).filter(Boolean).forEach(s => genreSet.add(s.toLowerCase()));
      }
      if (meta.characters) {
        meta.characters.split(',').map(s => s.trim()).filter(Boolean).forEach(s => characterSet.add(s.toLowerCase()));
      }
      if (meta.publisher) {
        // Publisher is typically a single value, not comma-separated
        publisherSet.add(meta.publisher.trim().toLowerCase());
      }
      if (meta.teams) {
        meta.teams.split(',').map(s => s.trim()).filter(Boolean).forEach(s => teamSet.add(s.toLowerCase()));
      }
      if (meta.locations) {
        meta.locations.split(',').map(s => s.trim()).filter(Boolean).forEach(s => locationSet.add(s.toLowerCase()));
      }
      if (meta.format) {
        // Format is typically a single value (e.g., "Trade Paperback", "Single Issue")
        formatSet.add(meta.format.trim().toLowerCase());
      }
    }

    uniqueWriters = writerSet.size;
    uniquePencillers = pencillerSet.size;
    uniqueInkers = inkerSet.size;
    uniqueColorists = coloristSet.size;
    uniqueLetterers = lettererSet.size;
    uniqueCoverArtists = coverArtistSet.size;
    uniqueGenres = genreSet.size;
    uniqueCharacters = characterSet.size;
    uniquePublishers = publisherSet.size;
    uniqueTeams = teamSet.size;
    uniqueLocations = locationSet.size;
    uniqueFormats = formatSet.size;
  }

  // Get series stats for this user
  const allSeriesProgress = await db.seriesProgress.findMany({
    where: { userId, totalRead: { gt: 0 } },
    select: { totalRead: true, totalOwned: true },
  });

  const seriesCompleted = allSeriesProgress.filter(sp => sp.totalRead >= sp.totalOwned).length;
  const seriesStarted = allSeriesProgress.length;

  // Collection size
  const collectionSize = comicsTotal;

  // Get unique decades from file metadata (only from user-read comics)
  const decadeSet = new Set<number>();
  if (userReadFileIds.length > 0) {
    const uniqueDecades = await db.fileMetadata.findMany({
      where: {
        comicId: { in: userReadFileIds },
        year: { not: null },
      },
      select: { year: true },
    });

    for (const item of uniqueDecades) {
      if (item.year) {
        decadeSet.add(Math.floor(item.year / 10) * 10);
      }
    }
  }

  // Get session count (filter by user's read files since ReadingHistory doesn't have userId)
  let sessionsTotal = 0;
  if (userReadFileIds.length > 0) {
    sessionsTotal = await db.readingHistory.count({
      where: {
        fileId: { in: userReadFileIds },
      },
    });
  }

  // Get hidden gems count: comics user has read with CV votes > 0 and < 1000
  let hiddenGemsFound = 0;
  if (userReadFileIds.length > 0) {
    hiddenGemsFound = await db.externalRating.count({
      where: {
        fileId: { in: userReadFileIds },
        source: 'comicvine',
        voteCount: { gt: 0, lt: 1000 },
      },
    });
  }

  // Get bookmarks count for this user
  // Note: bookmarks is a JSON field, so we filter in application code
  const userProgressWithBookmarks = await db.userReadingProgress.findMany({
    where: { userId },
    select: { bookmarks: true },
  });
  let bookmarksTotal = 0;
  for (const progress of userProgressWithBookmarks) {
    if (progress.bookmarks && typeof progress.bookmarks === 'object') {
      // bookmarks is stored as JSON array
      const bookmarksArray = progress.bookmarks as unknown[];
      bookmarksTotal += Array.isArray(bookmarksArray) ? bookmarksArray.length : 0;
    }
  }

  // Get manga count: comics from series with type 'manga'
  let mangaTotal = 0;
  if (userReadFileIds.length > 0) {
    mangaTotal = await db.comicFile.count({
      where: {
        id: { in: userReadFileIds },
        series: { type: 'manga' },
      },
    });
  }

  // Get max pages/comics in a single day from ReadingStats
  // Note: ReadingStats is global (no userId), so these are library-wide stats
  const maxPagesRecord = await db.readingStats.findFirst({
    orderBy: { pagesRead: 'desc' },
    select: { pagesRead: true },
  });
  const maxPagesDay = maxPagesRecord?.pagesRead ?? 0;

  const maxComicsRecord = await db.readingStats.findFirst({
    orderBy: { comicsCompleted: 'desc' },
    select: { comicsCompleted: true },
  });
  const maxComicsDay = maxComicsRecord?.comicsCompleted ?? 0;

  const maxTimeRecord = await db.readingStats.findFirst({
    orderBy: { totalDuration: 'desc' },
    select: { totalDuration: true },
  });
  const maxTimeDay = maxTimeRecord?.totalDuration ?? 0;

  // Get rating stats for this user
  // Count ratings from BOTH series-level (UserSeriesData) and issue-level (UserReadingProgress)
  const [seriesRatingsCount, issueRatingsCount] = await Promise.all([
    db.userSeriesData.count({
      where: { userId, rating: { not: null } },
    }),
    db.userReadingProgress.count({
      where: { userId, rating: { not: null } },
    }),
  ]);
  const totalRatingsSubmitted = seriesRatingsCount + issueRatingsCount;

  // Same for reviews
  const [seriesReviewsCount, issueReviewsCount] = await Promise.all([
    db.userSeriesData.count({
      where: { userId, publicReview: { not: null } },
    }),
    db.userReadingProgress.count({
      where: { userId, publicReview: { not: null } },
    }),
  ]);
  const totalReviewsWritten = seriesReviewsCount + issueReviewsCount;

  // Get file IDs that the user has rated (for genre/publisher stats)
  const ratedFiles = await db.userReadingProgress.findMany({
    where: { userId, rating: { not: null } },
    select: { fileId: true },
  });
  const ratedFileIds = ratedFiles.map(f => f.fileId);

  // Calculate unique genres and publishers from rated files
  let uniqueGenresRated = 0;
  let uniquePublishersRated = 0;
  if (ratedFileIds.length > 0) {
    const ratedMetadata = await db.fileMetadata.findMany({
      where: { comicId: { in: ratedFileIds } },
      select: { genre: true, publisher: true },
    });

    const genresRatedSet = new Set<string>();
    const publishersRatedSet = new Set<string>();
    for (const meta of ratedMetadata) {
      if (meta.genre) {
        meta.genre.split(',').map(s => s.trim()).filter(Boolean)
          .forEach(g => genresRatedSet.add(g.toLowerCase()));
      }
      if (meta.publisher) {
        publishersRatedSet.add(meta.publisher.trim().toLowerCase());
      }
    }
    uniqueGenresRated = genresRatedSet.size;
    uniquePublishersRated = publishersRatedSet.size;
  }

  // Calculate longest rating streak (consecutive days with ratings)
  const [seriesRatedDates, issueRatedDates] = await Promise.all([
    db.userSeriesData.findMany({
      where: { userId, ratedAt: { not: null } },
      select: { ratedAt: true },
    }),
    db.userReadingProgress.findMany({
      where: { userId, ratedAt: { not: null } },
      select: { ratedAt: true },
    }),
  ]);

  // Deduplicate by date
  const ratedDates = new Set<string>();
  [...seriesRatedDates, ...issueRatedDates].forEach(item => {
    if (item.ratedAt) {
      const dateStr = item.ratedAt.toISOString().split('T')[0]!;
      ratedDates.add(dateStr);
    }
  });

  // Calculate longest streak
  const sortedDates = Array.from(ratedDates).sort();
  let longestRatingStreak = 0;
  let currentRatingStreak = 0;
  let previousDate: Date | null = null;

  for (const dateStr of sortedDates) {
    const currentDate = new Date(dateStr);
    if (previousDate) {
      const diffDays = Math.floor((currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentRatingStreak++;
      } else {
        longestRatingStreak = Math.max(longestRatingStreak, currentRatingStreak);
        currentRatingStreak = 1;
      }
    } else {
      currentRatingStreak = 1;
    }
    previousDate = currentDate;
  }
  longestRatingStreak = Math.max(longestRatingStreak, currentRatingStreak);

  // Calculate longest review length
  const [seriesReviewLengths, issueReviewLengths] = await Promise.all([
    db.userSeriesData.findMany({
      where: { userId, publicReview: { not: null } },
      select: { publicReview: true },
    }),
    db.userReadingProgress.findMany({
      where: { userId, publicReview: { not: null } },
      select: { publicReview: true },
    }),
  ]);

  let longestReviewLength = 0;
  [...seriesReviewLengths, ...issueReviewLengths].forEach(item => {
    if (item.publicReview) {
      longestReviewLength = Math.max(longestReviewLength, item.publicReview.length);
    }
  });

  // Calculate series with complete ratings (all owned issues rated)
  // Use batch queries to avoid N+1 problem
  const userSeriesWithProgress = await db.seriesProgress.findMany({
    where: { userId, totalOwned: { gt: 0 } },
    select: { seriesId: true, totalOwned: true },
  });

  // Get all rated files with their series IDs in one query
  const ratedFilesWithSeries = await db.userReadingProgress.findMany({
    where: { userId, rating: { not: null } },
    select: { file: { select: { seriesId: true } } },
  });

  // Build map of rated counts per series in-memory
  const seriesRatedCounts = new Map<string, number>();
  for (const rf of ratedFilesWithSeries) {
    const seriesId = rf.file?.seriesId;
    if (seriesId) {
      seriesRatedCounts.set(seriesId, (seriesRatedCounts.get(seriesId) ?? 0) + 1);
    }
  }

  // Count series with complete ratings in-memory
  let seriesWithCompleteRatings = 0;
  for (const sp of userSeriesWithProgress) {
    const ratedCount = seriesRatedCounts.get(sp.seriesId) ?? 0;
    if (ratedCount >= sp.totalOwned) {
      seriesWithCompleteRatings++;
    }
  }

  // Calculate max ratings in same day
  const ratingsByDate = new Map<string, number>();
  [...seriesRatedDates, ...issueRatedDates].forEach(item => {
    if (item.ratedAt) {
      const dateStr = item.ratedAt.toISOString().split('T')[0]!;
      ratingsByDate.set(dateStr, (ratingsByDate.get(dateStr) ?? 0) + 1);
    }
  });
  const maxRatingsSameDay = ratingsByDate.size > 0 ? Math.max(...Array.from(ratingsByDate.values())) : 0;

  // Calculate max reviews in same day
  const [seriesReviewDates, issueReviewDates] = await Promise.all([
    db.userSeriesData.findMany({
      where: { userId, reviewedAt: { not: null } },
      select: { reviewedAt: true },
    }),
    db.userReadingProgress.findMany({
      where: { userId, reviewedAt: { not: null } },
      select: { reviewedAt: true },
    }),
  ]);

  const reviewsByDate = new Map<string, number>();
  [...seriesReviewDates, ...issueReviewDates].forEach(item => {
    if (item.reviewedAt) {
      const dateStr = item.reviewedAt.toISOString().split('T')[0]!;
      reviewsByDate.set(dateStr, (reviewsByDate.get(dateStr) ?? 0) + 1);
    }
  });
  const maxReviewsSameDay = reviewsByDate.size > 0 ? Math.max(...Array.from(reviewsByDate.values())) : 0;

  return {
    pagesTotal,
    comicsTotal,
    comicsCompleted,
    comicsOpened,
    currentStreak: userStat?.currentStreak ?? 0,
    longestStreak: userStat?.longestStreak ?? 0,
    totalReadingTime: userStat?.readingTime ?? 0,
    uniqueWriters,
    uniquePencillers,
    uniqueInkers,
    uniqueColorists,
    uniqueLetterers,
    uniqueCoverArtists,
    uniqueGenres,
    uniqueCharacters,
    uniquePublishers,
    seriesCompleted,
    seriesStarted,
    collectionSize,
    uniqueTeams,
    uniqueLocations,
    uniqueFormats,
    uniqueDecades: decadeSet.size,
    sessionsTotal,
    maxPagesDay,
    maxComicsDay,
    maxTimeDay,
    // Rating stats
    totalRatingsSubmitted,
    totalReviewsWritten,
    uniqueGenresRated,
    uniquePublishersRated,
    longestRatingStreak,
    longestReviewLength,
    seriesWithCompleteRatings,
    maxRatingsSameDay,
    maxReviewsSameDay,
    // Hidden gems
    hiddenGemsFound,
    // Bookmarks
    bookmarksTotal,
    // Manga
    mangaTotal,
  };
}

/**
 * Trigger achievement check for a user
 * Called after reading events (completion, session end, etc.)
 * Returns newly unlocked achievements (empty array if none)
 */
export async function triggerAchievementCheck(userId: string): Promise<AchievementWithProgress[]> {
  try {
    // First check if achievements are seeded
    const db = getDatabase();
    const achievementCount = await db.achievement.count();

    if (achievementCount === 0) {
      logInfo('achievements', 'No achievements seeded, skipping check');
      return [];
    }

    // Gather current stats
    const stats = await getUserStatsForAchievements(userId);

    // Check and update achievements
    const newlyUnlocked = await checkAndUpdateAchievements(userId, stats);

    // Log and notify via SSE if any achievements were unlocked
    if (newlyUnlocked.length > 0) {
      logInfo('achievements', `User ${userId} unlocked ${newlyUnlocked.length} achievement(s): ${newlyUnlocked.map(a => a.key).join(', ')}`);

      // Send SSE notification for each unlocked achievement
      for (const achievement of newlyUnlocked) {
        sendAchievementUnlock(userId, {
          id: achievement.id,
          key: achievement.key,
          name: achievement.name,
          description: achievement.description,
          category: achievement.category,
          stars: achievement.stars,
          iconName: achievement.iconName,
          threshold: achievement.threshold,
          minRequired: achievement.minRequired,
          progress: 100, // Always 100 for unlocked achievements
          isUnlocked: true,
          unlockedAt: achievement.unlockedAt?.toISOString() ?? new Date().toISOString(),
        });
      }
    }

    return newlyUnlocked;
  } catch (error) {
    logError('achievements', error, { action: 'trigger-check', userId });
    return [];
  }
}
