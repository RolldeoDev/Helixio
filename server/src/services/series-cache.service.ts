/**
 * Series Cache Service
 *
 * Hybrid caching system for series and issue data:
 * - JSON files store the actual data (can be large, especially issue lists)
 * - Prisma database tracks cache entries for queryability and management
 *
 * This avoids redundant API calls when processing multiple files from the same series.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { getDatabase } from './database.service.js';
import { getCacheSettings } from './config.service.js';
import {
  getSeriesCacheDir,
  getSourceSeriesCacheDir,
  getSeriesFilePath,
  getSeriesIssuesFilePath,
  ensureAppDirectories,
} from './app-paths.service.js';
import {
  getVolume,
  getVolumeIssues,
  type ComicVineVolume,
  type ComicVineIssue,
} from './comicvine.service.js';
import {
  getSeries as getMetronSeries,
  getSeriesIssues as getMetronSeriesIssues,
  getSeriesName as getMetronSeriesName,
  type MetronSeries,
  type MetronIssue,
} from './metron.service.js';
import { logError } from './logger.service.js';

// =============================================================================
// Types
// =============================================================================

export type CacheSource = 'comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal';

export interface SeriesCacheOptions {
  /** Override default TTL (in days) */
  ttlDays?: number;
  /** Force refresh from API (skip cache read) */
  forceRefresh?: boolean;
  /** Session ID for logging */
  sessionId?: string;
}

export interface CachedSeriesData {
  source: CacheSource;
  sourceId: string;
  name: string;
  publisher?: string;
  startYear?: number;
  issueCount?: number;
  // Full series metadata from API (type depends on source)
  data: ComicVineVolume | MetronSeries;
  cachedAt: string;
  expiresAt: string;
}

export interface CachedIssuesData {
  source: CacheSource;
  seriesId: string;
  seriesName: string;
  // Issues from API (type depends on source)
  issues: (ComicVineIssue | MetronIssue)[];
  totalCount: number;
  cachedAt: string;
  expiresAt: string;
}

export interface SeriesCacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  entriesWithIssues: number;
  oldestEntry?: Date;
  newestEntry?: Date;
  bySource: {
    comicvine: number;
    metron: number;
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate expiration date based on TTL
 */
function calculateExpiration(ttlDays: number): Date {
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + ttlDays);
  return expiration;
}

/**
 * Check if a date has passed
 */
function isExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * Safely delete a file if it exists
 */
function safeDeleteFile(filePath: string): boolean {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
  } catch (error) {
    logError('series-cache', error, { action: 'delete-file', filePath });
  }
  return false;
}

/**
 * Get file size in bytes, returns 0 if file doesn't exist
 */
function getFileSize(filePath: string): number {
  try {
    if (existsSync(filePath)) {
      return statSync(filePath).size;
    }
  } catch {
    // Ignore errors
  }
  return 0;
}

// =============================================================================
// Core Cache Functions
// =============================================================================

/**
 * Get cached series data or fetch from API
 */
export async function getOrFetchSeries(
  source: CacheSource,
  sourceId: string,
  options: SeriesCacheOptions = {}
): Promise<CachedSeriesData | null> {
  const prisma = getDatabase();
  const cacheSettings = getCacheSettings();
  const ttlDays = options.ttlDays ?? cacheSettings.seriesTTLDays;

  // Check database for existing cache entry
  if (!options.forceRefresh) {
    const cached = await prisma.seriesCache.findUnique({
      where: {
        source_sourceId: { source, sourceId },
      },
    });

    if (cached && !isExpired(cached.expiresAt)) {
      // Valid cache entry exists, read from file
      try {
        const filePath = join(getSeriesCacheDir(), cached.seriesFilePath);
        if (existsSync(filePath)) {
          const data = JSON.parse(readFileSync(filePath, 'utf-8')) as CachedSeriesData;

          // Update access stats
          await prisma.seriesCache.update({
            where: { id: cached.id },
            data: {
              lastAccessed: new Date(),
              accessCount: { increment: 1 },
            },
          });

          return data;
        }
      } catch (error) {
        logError('series-cache', error, { action: 'read-cached-series', source, sourceId });
        // Fall through to fetch from API
      }
    }
  }

  // Fetch from API based on source
  let seriesData: ComicVineVolume | MetronSeries | null = null;
  let name = '';
  let publisher: string | undefined;
  let startYear: number | undefined;
  let issueCount: number | undefined;

  if (source === 'comicvine') {
    const volume = await getVolume(parseInt(sourceId, 10), options.sessionId);
    if (!volume) {
      return null;
    }
    seriesData = volume;
    name = volume.name;
    publisher = volume.publisher?.name;
    startYear = volume.start_year ? parseInt(volume.start_year, 10) : undefined;
    issueCount = volume.count_of_issues;
  } else if (source === 'metron') {
    const series = await getMetronSeries(parseInt(sourceId, 10), options.sessionId);
    if (!series) {
      return null;
    }
    seriesData = series;
    name = getMetronSeriesName(series);
    publisher = series.publisher?.name;
    startYear = series.year_began;
    issueCount = series.issue_count;
  }

  if (!seriesData) {
    return null;
  }

  // Prepare cache data
  const expiresAt = calculateExpiration(ttlDays);
  const cachedData: CachedSeriesData = {
    source,
    sourceId,
    name,
    publisher,
    startYear,
    issueCount,
    data: seriesData,
    cachedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Write to file
  ensureAppDirectories();
  const relativeFilePath = `${source}/${sourceId}.json`;
  const filePath = join(getSeriesCacheDir(), relativeFilePath);
  writeFileSync(filePath, JSON.stringify(cachedData, null, 2), 'utf-8');
  const fileSize = getFileSize(filePath);

  // Update database
  await prisma.seriesCache.upsert({
    where: {
      source_sourceId: { source, sourceId },
    },
    create: {
      source,
      sourceId,
      name,
      publisher,
      startYear,
      issueCount,
      seriesFilePath: relativeFilePath,
      expiresAt,
      fileSize,
    },
    update: {
      name,
      publisher,
      startYear,
      issueCount,
      seriesFilePath: relativeFilePath,
      expiresAt,
      lastAccessed: new Date(),
      accessCount: 0,
      fileSize,
    },
  });

  return cachedData;
}

/**
 * Get cached issues for a series or fetch from API
 */
export async function getOrFetchIssues(
  source: CacheSource,
  seriesId: string,
  options: SeriesCacheOptions = {}
): Promise<CachedIssuesData | null> {
  const prisma = getDatabase();
  const cacheSettings = getCacheSettings();
  const ttlDays = options.ttlDays ?? cacheSettings.issuesTTLDays;

  // Check database for existing cache entry with issues
  if (!options.forceRefresh) {
    const cached = await prisma.seriesCache.findUnique({
      where: {
        source_sourceId: { source, sourceId: seriesId },
      },
    });

    if (cached && cached.hasIssues && cached.issuesFilePath && !isExpired(cached.expiresAt)) {
      // Valid cache entry with issues exists, read from file
      try {
        const filePath = join(getSeriesCacheDir(), cached.issuesFilePath);
        if (existsSync(filePath)) {
          const data = JSON.parse(readFileSync(filePath, 'utf-8')) as CachedIssuesData;

          // Update access stats
          await prisma.seriesCache.update({
            where: { id: cached.id },
            data: {
              lastAccessed: new Date(),
              accessCount: { increment: 1 },
            },
          });

          return data;
        }
      } catch (error) {
        logError('series-cache', error, { action: 'read-cached-issues', source, seriesId });
        // Fall through to fetch from API
      }
    }
  }

  // Fetch all issues from API (paginated)
  const allIssues: (ComicVineIssue | MetronIssue)[] = [];
  let total = 0;

  if (source === 'comicvine') {
    const volumeId = parseInt(seriesId, 10);
    let offset = 0;
    const limit = 100;

    // Fetch all pages
    do {
      const result = await getVolumeIssues(volumeId, { limit, offset, sessionId: options.sessionId });
      allIssues.push(...result.results);
      total = result.total;
      offset += limit;
    } while (allIssues.length < total);
  } else if (source === 'metron') {
    const metronSeriesId = parseInt(seriesId, 10);
    let page = 1;
    let hasMore = true;

    // Fetch all pages (Metron uses page-based pagination)
    while (hasMore) {
      const result = await getMetronSeriesIssues(metronSeriesId, { page, sessionId: options.sessionId });
      allIssues.push(...result.results);
      total = result.total;
      hasMore = result.hasMore;
      page++;
    }
  }

  if (allIssues.length === 0 && total === 0) {
    return null;
  }

  // Get series name from existing cache or fetch
  let seriesName = 'Unknown Series';
  const existingCache = await prisma.seriesCache.findUnique({
    where: { source_sourceId: { source, sourceId: seriesId } },
  });
  if (existingCache) {
    seriesName = existingCache.name;
  }

  // Prepare cache data
  const expiresAt = calculateExpiration(ttlDays);
  const cachedData: CachedIssuesData = {
    source,
    seriesId,
    seriesName,
    issues: allIssues,
    totalCount: total,
    cachedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Write to file
  ensureAppDirectories();
  const relativeFilePath = `${source}/${seriesId}_issues.json`;
  const filePath = join(getSeriesCacheDir(), relativeFilePath);
  writeFileSync(filePath, JSON.stringify(cachedData, null, 2), 'utf-8');
  const issuesFileSize = getFileSize(filePath);

  // Get existing series file size
  const existingSeriesFileSize = existingCache
    ? getFileSize(join(getSeriesCacheDir(), existingCache.seriesFilePath))
    : 0;

  // Update database
  await prisma.seriesCache.upsert({
    where: {
      source_sourceId: { source, sourceId: seriesId },
    },
    create: {
      source,
      sourceId: seriesId,
      name: seriesName,
      issueCount: total,
      seriesFilePath: `${source}/${seriesId}.json`,
      issuesFilePath: relativeFilePath,
      hasIssues: true,
      expiresAt,
      fileSize: existingSeriesFileSize + issuesFileSize,
    },
    update: {
      issuesFilePath: relativeFilePath,
      hasIssues: true,
      issueCount: total,
      expiresAt,
      lastAccessed: new Date(),
      accessCount: 0,
      fileSize: existingSeriesFileSize + issuesFileSize,
    },
  });

  return cachedData;
}

/**
 * Search cached series by name (avoids API call if we have local data)
 */
export async function findCachedSeries(
  source: CacheSource,
  query: string
): Promise<Array<{
  sourceId: string;
  name: string;
  publisher?: string;
  startYear?: number;
  issueCount?: number;
}>> {
  const prisma = getDatabase();

  const results = await prisma.seriesCache.findMany({
    where: {
      source,
      name: {
        contains: query,
      },
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      sourceId: true,
      name: true,
      publisher: true,
      startYear: true,
      issueCount: true,
    },
    orderBy: {
      accessCount: 'desc',
    },
    take: 20,
  });

  return results.map((r) => ({
    sourceId: r.sourceId,
    name: r.name,
    publisher: r.publisher ?? undefined,
    startYear: r.startYear ?? undefined,
    issueCount: r.issueCount ?? undefined,
  }));
}

/**
 * Pre-warm cache for a series (fetch series + issues)
 */
export async function warmCache(
  source: CacheSource,
  sourceId: string,
  options: SeriesCacheOptions = {}
): Promise<{ series: boolean; issues: boolean }> {
  const series = await getOrFetchSeries(source, sourceId, options);
  const issues = await getOrFetchIssues(source, sourceId, options);

  return {
    series: series !== null,
    issues: issues !== null,
  };
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<SeriesCacheStats> {
  const prisma = getDatabase();

  const [total, withIssues, comicvine, metron, oldest, newest, totalSize] = await Promise.all([
    prisma.seriesCache.count(),
    prisma.seriesCache.count({ where: { hasIssues: true } }),
    prisma.seriesCache.count({ where: { source: 'comicvine' } }),
    prisma.seriesCache.count({ where: { source: 'metron' } }),
    prisma.seriesCache.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.seriesCache.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.seriesCache.aggregate({ _sum: { fileSize: true } }),
  ]);

  return {
    totalEntries: total,
    totalSizeBytes: totalSize._sum.fileSize ?? 0,
    entriesWithIssues: withIssues,
    oldestEntry: oldest?.createdAt,
    newestEntry: newest?.createdAt,
    bySource: {
      comicvine,
      metron,
    },
  };
}

/**
 * Clean up expired cache entries
 */
export async function cleanExpired(): Promise<{ deleted: number; freedBytes: number }> {
  const prisma = getDatabase();

  // Find expired entries
  const expired = await prisma.seriesCache.findMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  let freedBytes = 0;

  // Delete files and database entries
  for (const entry of expired) {
    // Delete series file
    const seriesFilePath = join(getSeriesCacheDir(), entry.seriesFilePath);
    safeDeleteFile(seriesFilePath);

    // Delete issues file if exists
    if (entry.issuesFilePath) {
      const issuesFilePath = join(getSeriesCacheDir(), entry.issuesFilePath);
      safeDeleteFile(issuesFilePath);
    }

    freedBytes += entry.fileSize;
  }

  // Delete from database
  await prisma.seriesCache.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  return { deleted: expired.length, freedBytes };
}

/**
 * Clean orphaned files (files on disk not tracked in database)
 */
export async function cleanOrphanedFiles(): Promise<{ deleted: number; freedBytes: number }> {
  const prisma = getDatabase();

  // Get all tracked file paths
  const tracked = await prisma.seriesCache.findMany({
    select: {
      seriesFilePath: true,
      issuesFilePath: true,
    },
  });

  const trackedPaths = new Set<string>();
  for (const entry of tracked) {
    trackedPaths.add(entry.seriesFilePath);
    if (entry.issuesFilePath) {
      trackedPaths.add(entry.issuesFilePath);
    }
  }

  let deleted = 0;
  let freedBytes = 0;

  // Check all source directories
  for (const source of ['comicvine', 'metron', 'gcd', 'anilist', 'mal'] as const) {
    const sourceDir = getSourceSeriesCacheDir(source);
    if (!existsSync(sourceDir)) continue;

    const files = readdirSync(sourceDir);
    for (const file of files) {
      const relativePath = `${source}/${file}`;
      if (!trackedPaths.has(relativePath)) {
        const fullPath = join(sourceDir, file);
        freedBytes += getFileSize(fullPath);
        if (safeDeleteFile(fullPath)) {
          deleted++;
        }
      }
    }
  }

  return { deleted, freedBytes };
}

/**
 * Enforce cache size limits
 */
export async function enforceQuotas(): Promise<{ deleted: number; freedBytes: number }> {
  const prisma = getDatabase();
  const cacheSettings = getCacheSettings();

  let totalDeleted = 0;
  let totalFreed = 0;

  // First, clean expired entries
  const expired = await cleanExpired();
  totalDeleted += expired.deleted;
  totalFreed += expired.freedBytes;

  // Check entry count limit
  const entryCount = await prisma.seriesCache.count();
  if (entryCount > cacheSettings.maxSeriesCacheEntries) {
    // Delete oldest accessed entries to get under limit
    const toDelete = entryCount - cacheSettings.maxSeriesCacheEntries;
    const oldest = await prisma.seriesCache.findMany({
      orderBy: { lastAccessed: 'asc' },
      take: toDelete,
    });

    for (const entry of oldest) {
      const seriesFilePath = join(getSeriesCacheDir(), entry.seriesFilePath);
      safeDeleteFile(seriesFilePath);
      if (entry.issuesFilePath) {
        safeDeleteFile(join(getSeriesCacheDir(), entry.issuesFilePath));
      }
      totalFreed += entry.fileSize;
      totalDeleted++;
    }

    await prisma.seriesCache.deleteMany({
      where: {
        id: { in: oldest.map((e) => e.id) },
      },
    });
  }

  // Check size limit
  const stats = await getCacheStats();
  const maxSizeBytes = cacheSettings.maxSeriesCacheSizeMb * 1024 * 1024;

  if (stats.totalSizeBytes > maxSizeBytes) {
    // Delete oldest accessed entries until under limit
    const toFree = stats.totalSizeBytes - maxSizeBytes;
    let freed = 0;

    const entries = await prisma.seriesCache.findMany({
      orderBy: { lastAccessed: 'asc' },
    });

    for (const entry of entries) {
      if (freed >= toFree) break;

      const seriesFilePath = join(getSeriesCacheDir(), entry.seriesFilePath);
      safeDeleteFile(seriesFilePath);
      if (entry.issuesFilePath) {
        safeDeleteFile(join(getSeriesCacheDir(), entry.issuesFilePath));
      }

      freed += entry.fileSize;
      totalFreed += entry.fileSize;
      totalDeleted++;

      await prisma.seriesCache.delete({ where: { id: entry.id } });
    }
  }

  return { deleted: totalDeleted, freedBytes: totalFreed };
}

/**
 * Clear entire cache
 */
export async function clearAll(): Promise<{ deleted: number; freedBytes: number }> {
  const prisma = getDatabase();

  const stats = await getCacheStats();

  // Delete all files
  for (const source of ['comicvine', 'metron', 'gcd', 'anilist', 'mal'] as const) {
    const sourceDir = getSourceSeriesCacheDir(source);
    if (!existsSync(sourceDir)) continue;

    const files = readdirSync(sourceDir);
    for (const file of files) {
      safeDeleteFile(join(sourceDir, file));
    }
  }

  // Clear database
  await prisma.seriesCache.deleteMany({});

  return { deleted: stats.totalEntries, freedBytes: stats.totalSizeBytes };
}

/**
 * Invalidate cache for a specific series
 */
export async function invalidateSeries(source: CacheSource, sourceId: string): Promise<boolean> {
  const prisma = getDatabase();

  const entry = await prisma.seriesCache.findUnique({
    where: { source_sourceId: { source, sourceId } },
  });

  if (!entry) return false;

  // Delete files
  safeDeleteFile(join(getSeriesCacheDir(), entry.seriesFilePath));
  if (entry.issuesFilePath) {
    safeDeleteFile(join(getSeriesCacheDir(), entry.issuesFilePath));
  }

  // Delete database entry
  await prisma.seriesCache.delete({ where: { id: entry.id } });

  return true;
}

// =============================================================================
// Export
// =============================================================================

export const SeriesCache = {
  getOrFetchSeries,
  getOrFetchIssues,
  findCachedSeries,
  warmCache,
  getCacheStats,
  cleanExpired,
  cleanOrphanedFiles,
  enforceQuotas,
  clearAll,
  invalidateSeries,
};

export default SeriesCache;
