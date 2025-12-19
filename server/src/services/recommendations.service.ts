/**
 * Recommendations Service
 *
 * Provides comic recommendations based on:
 * - Series from reading history (unread issues from series you've read)
 * - Similar content (same publisher/genre as your reading history)
 * - Recently added (newest files in library)
 * - Random discovery (random unread comics)
 */

import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export interface ComicRecommendation {
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  series: string | null;
  number: string | null;
  publisher: string | null;
  genre: string | null;
  reason: 'series_continuation' | 'same_publisher' | 'same_genre' | 'recently_added';
  reasonDetail?: string;
}

export interface DiscoverComic {
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  series: string | null;
  number: string | null;
  publisher: string | null;
}

export interface RecommendationsResult {
  seriesFromHistory: ComicRecommendation[];
  samePublisherGenre: ComicRecommendation[];
  recentlyAdded: ComicRecommendation[];
}

export interface DiscoverResult {
  comics: DiscoverComic[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get all file IDs that have been read (have reading progress)
 */
async function getReadFileIds(libraryId?: string): Promise<Set<string>> {
  const db = getDatabase();

  const progress = await db.readingProgress.findMany({
    where: {
      ...(libraryId && { file: { libraryId } }),
    },
    select: { fileId: true },
  });

  return new Set(progress.map((p) => p.fileId));
}

/**
 * Get completed file IDs
 */
async function getCompletedFileIds(libraryId?: string): Promise<Set<string>> {
  const db = getDatabase();

  const progress = await db.readingProgress.findMany({
    where: {
      completed: true,
      ...(libraryId && { file: { libraryId } }),
    },
    select: { fileId: true },
  });

  return new Set(progress.map((p) => p.fileId));
}

// =============================================================================
// Recommendation Functions
// =============================================================================

/**
 * Get series recommendations - unread issues from series the user has read
 */
export async function getSeriesRecommendations(
  limit = 8,
  libraryId?: string
): Promise<ComicRecommendation[]> {
  const db = getDatabase();

  // Get series names from files the user has read
  const readProgress = await db.readingProgress.findMany({
    where: {
      currentPage: { gt: 0 },
      ...(libraryId && { file: { libraryId } }),
    },
    include: {
      file: {
        include: {
          metadata: {
            select: { series: true },
          },
        },
      },
    },
  });

  // Extract unique series names
  const readSeries = new Set<string>();
  for (const p of readProgress) {
    if (p.file.metadata?.series) {
      readSeries.add(p.file.metadata.series);
    }
  }

  if (readSeries.size === 0) {
    return [];
  }

  // Get read file IDs to exclude
  const readFileIds = await getReadFileIds(libraryId);

  // Find unread files from these series
  const unreadFromSeries = await db.comicFile.findMany({
    where: {
      status: 'indexed',
      ...(libraryId && { libraryId }),
      metadata: {
        series: { in: Array.from(readSeries) },
      },
      id: { notIn: Array.from(readFileIds) },
    },
    include: {
      metadata: {
        select: {
          series: true,
          number: true,
          publisher: true,
          genre: true,
        },
      },
    },
    take: limit * 2, // Get extra to dedupe by series
  });

  // Dedupe to one recommendation per series, prioritize lowest issue number
  const seriesMap = new Map<string, typeof unreadFromSeries[0]>();
  for (const file of unreadFromSeries) {
    const series = file.metadata?.series;
    if (!series) continue;

    const existing = seriesMap.get(series);
    if (!existing) {
      seriesMap.set(series, file);
    } else {
      // Keep the one with lower issue number
      const existingNum = parseFloat(existing.metadata?.number || '999');
      const currentNum = parseFloat(file.metadata?.number || '999');
      if (currentNum < existingNum) {
        seriesMap.set(series, file);
      }
    }
  }

  return Array.from(seriesMap.values())
    .slice(0, limit)
    .map((file) => ({
      fileId: file.id,
      filename: file.filename,
      relativePath: file.relativePath,
      libraryId: file.libraryId,
      series: file.metadata?.series || null,
      number: file.metadata?.number || null,
      publisher: file.metadata?.publisher || null,
      genre: file.metadata?.genre || null,
      reason: 'series_continuation' as const,
      reasonDetail: `Continue ${file.metadata?.series}`,
    }));
}

/**
 * Get similar content - comics from publishers/genres the user has read
 */
export async function getSimilarContent(
  limit = 8,
  libraryId?: string
): Promise<ComicRecommendation[]> {
  const db = getDatabase();

  // Get publishers and genres from completed reads
  const completedProgress = await db.readingProgress.findMany({
    where: {
      completed: true,
      ...(libraryId && { file: { libraryId } }),
    },
    include: {
      file: {
        include: {
          metadata: {
            select: { publisher: true, genre: true, series: true },
          },
        },
      },
    },
  });

  // Count occurrences of publishers and genres
  const publisherCount = new Map<string, number>();
  const genreCount = new Map<string, number>();
  const readSeries = new Set<string>();

  for (const p of completedProgress) {
    const meta = p.file.metadata;
    if (meta?.publisher) {
      publisherCount.set(meta.publisher, (publisherCount.get(meta.publisher) || 0) + 1);
    }
    if (meta?.genre) {
      // Genre might be comma-separated
      const genres = meta.genre.split(',').map((g) => g.trim());
      for (const genre of genres) {
        if (genre) {
          genreCount.set(genre, (genreCount.get(genre) || 0) + 1);
        }
      }
    }
    if (meta?.series) {
      readSeries.add(meta.series);
    }
  }

  // Get top publishers and genres
  const topPublishers = Array.from(publisherCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p]) => p);

  const topGenres = Array.from(genreCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);

  if (topPublishers.length === 0 && topGenres.length === 0) {
    return [];
  }

  // Get unread file IDs
  const readFileIds = await getReadFileIds(libraryId);

  // Build query conditions
  const orConditions: object[] = [];
  if (topPublishers.length > 0) {
    orConditions.push({ publisher: { in: topPublishers } });
  }
  if (topGenres.length > 0) {
    for (const genre of topGenres) {
      orConditions.push({ genre: { contains: genre } });
    }
  }

  // Find unread comics from similar publishers/genres
  const similarComics = await db.comicFile.findMany({
    where: {
      status: 'indexed',
      ...(libraryId && { libraryId }),
      id: { notIn: Array.from(readFileIds) },
      metadata: {
        OR: orConditions,
        // Exclude series already read
        NOT: {
          series: { in: Array.from(readSeries) },
        },
      },
    },
    include: {
      metadata: {
        select: {
          series: true,
          number: true,
          publisher: true,
          genre: true,
        },
      },
    },
    take: limit * 3,
  });

  // Dedupe by series and add reason
  const seriesMap = new Map<string, (typeof similarComics)[0] & { matchReason: string }>();
  for (const file of similarComics) {
    const series = file.metadata?.series || file.filename;
    if (seriesMap.has(series)) continue;

    // Determine why this was recommended
    let matchReason = '';
    if (file.metadata?.publisher && topPublishers.includes(file.metadata.publisher)) {
      matchReason = `From ${file.metadata.publisher}`;
    } else if (file.metadata?.genre) {
      const genres = file.metadata.genre.split(',').map((g) => g.trim());
      const matchedGenre = genres.find((g) => topGenres.includes(g));
      if (matchedGenre) {
        matchReason = `${matchedGenre}`;
      }
    }

    seriesMap.set(series, { ...file, matchReason });
  }

  return Array.from(seriesMap.values())
    .slice(0, limit)
    .map((file) => ({
      fileId: file.id,
      filename: file.filename,
      relativePath: file.relativePath,
      libraryId: file.libraryId,
      series: file.metadata?.series || null,
      number: file.metadata?.number || null,
      publisher: file.metadata?.publisher || null,
      genre: file.metadata?.genre || null,
      reason: file.metadata?.publisher && topPublishers.includes(file.metadata.publisher)
        ? ('same_publisher' as const)
        : ('same_genre' as const),
      reasonDetail: file.matchReason,
    }));
}

/**
 * Get recently added comics
 */
export async function getRecentlyAdded(
  limit = 8,
  libraryId?: string
): Promise<ComicRecommendation[]> {
  const db = getDatabase();

  // Get unread file IDs
  const readFileIds = await getReadFileIds(libraryId);

  // Find recently added unread comics
  const recentComics = await db.comicFile.findMany({
    where: {
      status: 'indexed',
      ...(libraryId && { libraryId }),
      id: { notIn: Array.from(readFileIds) },
    },
    include: {
      metadata: {
        select: {
          series: true,
          number: true,
          publisher: true,
          genre: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 2,
  });

  // Dedupe by series
  const seriesMap = new Map<string, (typeof recentComics)[0]>();
  for (const file of recentComics) {
    const series = file.metadata?.series || file.filename;
    if (!seriesMap.has(series)) {
      seriesMap.set(series, file);
    }
  }

  return Array.from(seriesMap.values())
    .slice(0, limit)
    .map((file) => ({
      fileId: file.id,
      filename: file.filename,
      relativePath: file.relativePath,
      libraryId: file.libraryId,
      series: file.metadata?.series || null,
      number: file.metadata?.number || null,
      publisher: file.metadata?.publisher || null,
      genre: file.metadata?.genre || null,
      reason: 'recently_added' as const,
      reasonDetail: 'New arrival',
    }));
}

/**
 * Get random unread comics for discovery
 */
export async function getRandomUnread(
  limit = 12,
  libraryId?: string
): Promise<DiscoverComic[]> {
  const db = getDatabase();

  // Get all file IDs with any reading progress
  const readFileIds = await getReadFileIds(libraryId);

  // Get total count of unread files
  const totalUnread = await db.comicFile.count({
    where: {
      status: 'indexed',
      ...(libraryId && { libraryId }),
      id: { notIn: Array.from(readFileIds) },
    },
  });

  if (totalUnread === 0) {
    return [];
  }

  // Generate random offsets
  const numToFetch = Math.min(limit, totalUnread);
  const offsets = new Set<number>();
  while (offsets.size < numToFetch) {
    offsets.add(Math.floor(Math.random() * totalUnread));
  }

  // Fetch comics at random offsets
  const comics: DiscoverComic[] = [];
  for (const offset of offsets) {
    const [file] = await db.comicFile.findMany({
      where: {
        status: 'indexed',
        ...(libraryId && { libraryId }),
        id: { notIn: Array.from(readFileIds) },
      },
      include: {
        metadata: {
          select: {
            series: true,
            number: true,
            publisher: true,
          },
        },
      },
      skip: offset,
      take: 1,
    });

    if (file) {
      comics.push({
        fileId: file.id,
        filename: file.filename,
        relativePath: file.relativePath,
        libraryId: file.libraryId,
        series: file.metadata?.series || null,
        number: file.metadata?.number || null,
        publisher: file.metadata?.publisher || null,
      });
    }
  }

  return comics;
}

// =============================================================================
// Main API Functions
// =============================================================================

/**
 * Get all recommendations
 */
export async function getRecommendations(
  limit = 8,
  libraryId?: string
): Promise<RecommendationsResult> {
  const [seriesFromHistory, samePublisherGenre, recentlyAdded] = await Promise.all([
    getSeriesRecommendations(limit, libraryId),
    getSimilarContent(limit, libraryId),
    getRecentlyAdded(limit, libraryId),
  ]);

  return {
    seriesFromHistory,
    samePublisherGenre,
    recentlyAdded,
  };
}

/**
 * Get discover comics (random unread)
 */
export async function getDiscoverComics(
  limit = 12,
  libraryId?: string
): Promise<DiscoverResult> {
  const comics = await getRandomUnread(limit, libraryId);
  return { comics };
}
