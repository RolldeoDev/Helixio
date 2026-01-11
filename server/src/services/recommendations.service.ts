/**
 * Recommendations Service
 *
 * Provides comic recommendations based on:
 * - Series from reading history (unread issues from series you've read)
 * - Similar content (same publisher/genre as your reading history)
 * - Recently added (newest files in library)
 * - Random discovery (random unread comics)
 *
 * Performance optimizations:
 * - Cached read file IDs shared across recommendation functions
 * - Single-query random selection instead of N+1 pattern
 * - Memory caching for recommendation results
 */

import { getDatabase } from './database.service.js';
import { memoryCache, CacheKeys } from './memory-cache.service.js';

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
 *
 * PERFORMANCE: Accepts optional readFileIds to avoid redundant queries
 * when called from getRecommendations().
 */
export async function getSeriesRecommendations(
  limit = 8,
  libraryId?: string,
  readFileIds?: Set<string>
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

  // Use provided readFileIds or fetch them
  const fileIdsToExclude = readFileIds ?? await getReadFileIds(libraryId);

  // Find unread files from these series
  const unreadFromSeries = await db.comicFile.findMany({
    where: {
      status: 'indexed',
      ...(libraryId && { libraryId }),
      metadata: {
        series: { in: Array.from(readSeries) },
      },
      id: { notIn: Array.from(fileIdsToExclude) },
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
 *
 * PERFORMANCE: Accepts optional readFileIds to avoid redundant queries
 * when called from getRecommendations().
 */
export async function getSimilarContent(
  limit = 8,
  libraryId?: string,
  readFileIds?: Set<string>
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

  // Use provided readFileIds or fetch them
  const fileIdsToExclude = readFileIds ?? await getReadFileIds(libraryId);

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
      id: { notIn: Array.from(fileIdsToExclude) },
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
 *
 * PERFORMANCE: Accepts optional readFileIds to avoid redundant queries
 * when called from getRecommendations().
 */
export async function getRecentlyAdded(
  limit = 8,
  libraryId?: string,
  readFileIds?: Set<string>
): Promise<ComicRecommendation[]> {
  const db = getDatabase();

  // Use provided readFileIds or fetch them
  const fileIdsToExclude = readFileIds ?? await getReadFileIds(libraryId);

  // Find recently added unread comics
  const recentComics = await db.comicFile.findMany({
    where: {
      status: 'indexed',
      ...(libraryId && { libraryId }),
      id: { notIn: Array.from(fileIdsToExclude) },
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
 *
 * PERFORMANCE: Uses a single query with in-memory random sampling
 * instead of N separate queries with skip/take (N+1 pattern).
 * This reduces database round-trips from ~13 to 2.
 */
export async function getRandomUnread(
  limit = 12,
  libraryId?: string,
  readFileIds?: Set<string>
): Promise<DiscoverComic[]> {
  const db = getDatabase();

  // Use provided readFileIds or fetch them
  const fileIdsToExclude = readFileIds ?? await getReadFileIds(libraryId);

  // Fetch a larger batch and sample in-memory (much faster than N queries)
  // We fetch 3x the limit to have good random selection variety
  const batchSize = Math.min(limit * 3, 100);

  const unreadComics = await db.comicFile.findMany({
    where: {
      status: 'indexed',
      ...(libraryId && { libraryId }),
      id: { notIn: Array.from(fileIdsToExclude) },
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
    take: batchSize,
    // Use a somewhat random ordering by mixing in createdAt
    // This provides variety without the expense of ORDER BY RANDOM()
    orderBy: [
      { createdAt: 'desc' },
    ],
  });

  if (unreadComics.length === 0) {
    return [];
  }

  // Shuffle in-memory and take the requested limit
  const shuffled = unreadComics
    .map((file) => ({ file, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, limit)
    .map(({ file }) => file);

  return shuffled.map((file) => ({
    fileId: file.id,
    filename: file.filename,
    relativePath: file.relativePath,
    libraryId: file.libraryId,
    series: file.metadata?.series || null,
    number: file.metadata?.number || null,
    publisher: file.metadata?.publisher || null,
  }));
}

// =============================================================================
// Cache Keys
// =============================================================================

const RECOMMENDATIONS_CACHE_TTL = 60_000; // 60 seconds
const DISCOVER_CACHE_TTL = 30_000; // 30 seconds (shorter since it's random)

/**
 * Generate cache key for recommendations
 */
function getRecommendationsCacheKey(libraryId?: string): string {
  return `recommendations:${libraryId || 'all'}`;
}

/**
 * Generate cache key for discover comics
 */
function getDiscoverCacheKey(libraryId?: string): string {
  return `discover:${libraryId || 'all'}`;
}

// =============================================================================
// Main API Functions
// =============================================================================

/**
 * Get all recommendations
 *
 * PERFORMANCE OPTIMIZATIONS:
 * 1. Fetches readFileIds once and passes to all sub-functions
 *    (reduces redundant queries from 4 to 1)
 * 2. Caches results for 60 seconds
 *    (reduces load during rapid page refreshes)
 */
export async function getRecommendations(
  limit = 8,
  libraryId?: string
): Promise<RecommendationsResult> {
  // Check cache first
  const cacheKey = getRecommendationsCacheKey(libraryId);
  const cached = memoryCache.get<RecommendationsResult>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch readFileIds once and share across all recommendation queries
  // This eliminates 3 redundant database queries
  const readFileIds = await getReadFileIds(libraryId);

  const [seriesFromHistory, samePublisherGenre, recentlyAdded] = await Promise.all([
    getSeriesRecommendations(limit, libraryId, readFileIds),
    getSimilarContent(limit, libraryId, readFileIds),
    getRecentlyAdded(limit, libraryId, readFileIds),
  ]);

  const result = {
    seriesFromHistory,
    samePublisherGenre,
    recentlyAdded,
  };

  // Cache with appropriate TTL (longer during scans to reduce load)
  const ttl = memoryCache.isScanActive() ? RECOMMENDATIONS_CACHE_TTL * 5 : RECOMMENDATIONS_CACHE_TTL;
  memoryCache.set(cacheKey, result, ttl);

  return result;
}

/**
 * Get discover comics (random unread)
 *
 * PERFORMANCE: Caches results for 30 seconds to reduce load during rapid navigation.
 * Uses shorter TTL than recommendations since randomness is part of the feature.
 */
export async function getDiscoverComics(
  limit = 12,
  libraryId?: string
): Promise<DiscoverResult> {
  // Check cache first
  const cacheKey = getDiscoverCacheKey(libraryId);
  const cached = memoryCache.get<DiscoverResult>(cacheKey);
  if (cached) {
    return cached;
  }

  const comics = await getRandomUnread(limit, libraryId);
  const result = { comics };

  // Cache with shorter TTL for discover (randomness is valuable)
  const ttl = memoryCache.isScanActive() ? DISCOVER_CACHE_TTL * 3 : DISCOVER_CACHE_TTL;
  memoryCache.set(cacheKey, result, ttl);

  return result;
}

/**
 * Invalidate recommendations cache.
 * Call when reading progress changes.
 */
export function invalidateRecommendationsCache(): void {
  memoryCache.invalidate('recommendations:');
  memoryCache.invalidate('discover:');
}
