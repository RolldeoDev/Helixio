/**
 * Stats Query Service
 *
 * Retrieves pre-computed stats from the database for display.
 * Supports library filtering and entity drill-down.
 *
 * Performance optimizations:
 * - Request coalescing: Multiple concurrent requests for the same stats
 *   share a single database query, preventing redundant queries during
 *   high-concurrency scenarios (e.g., homepage with multiple components)
 * - Memory caching via memoryCache service
 */

import { getDatabase } from './database.service.js';
import { EntityType } from './stats-dirty.service.js';
import { RatingStats, computeRatingStats } from './rating-stats.service.js';
import { memoryCache } from './memory-cache.service.js';

// =============================================================================
// Request Coalescing
// =============================================================================

/**
 * In-flight request tracking for request coalescing.
 * When multiple requests come in for the same stats simultaneously,
 * they all wait on the same promise instead of making separate DB queries.
 */
const inFlightStatsRequests = new Map<string, Promise<AggregatedStats>>();

/**
 * Execute a stats query with request coalescing.
 * If an identical query is already in-flight, return the same promise.
 */
async function coalescedStatsQuery(
  key: string,
  queryFn: () => Promise<AggregatedStats>
): Promise<AggregatedStats> {
  // Check if there's already an in-flight request for this key
  const existingRequest = inFlightStatsRequests.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  // Create the query promise
  const queryPromise = queryFn().finally(() => {
    // Remove from in-flight map when done (success or failure)
    inFlightStatsRequests.delete(key);
  });

  // Store in in-flight map
  inFlightStatsRequests.set(key, queryPromise);

  return queryPromise;
}

// =============================================================================
// Types
// =============================================================================

export interface AggregatedStats {
  // Collection stats
  totalFiles: number;
  totalSeries: number;
  totalPages: number;

  // Reading stats
  filesRead: number;
  filesInProgress: number;
  filesUnread: number;
  pagesRead: number;
  readingTime: number;

  // Streaks (user-level only)
  currentStreak?: number;
  longestStreak?: number;

  // Metadata coverage (library-level only)
  filesWithMetadata?: number;
}

export interface EntityStatResult {
  entityType: string;
  entityName: string;
  entityRole: string | null;
  ownedComics: number;
  ownedSeries: number;
  ownedPages: number;
  readComics: number;
  readPages: number;
  readTime: number;
  readPercentage: number;
}

export interface EntityDetails {
  entityType: string;
  entityName: string;
  entityRole: string | null;

  // Stats
  ownedComics: number;
  ownedSeries: number;
  ownedPages: number;
  readComics: number;
  readPages: number;
  readTime: number;

  // Comics list
  comics: EntityComic[];

  // Related entities
  relatedCreators: RelatedEntity[];
  relatedCharacters: RelatedEntity[];
  relatedSeries: RelatedSeries[];
}

export interface EntityComic {
  fileId: string;
  filename: string;
  seriesName: string | null;
  number: string | null;
  isRead: boolean;
  readingTime: number;
  lastReadAt: Date | null;
}

export interface RelatedEntity {
  entityName: string;
  entityRole: string | null;
  sharedComics: number;
}

export interface RelatedSeries {
  seriesId: string;
  seriesName: string;
  ownedCount: number;
  readCount: number;
}

// =============================================================================
// Aggregated Stats
// =============================================================================

// Cache TTL for stats
const STATS_CACHE_TTL_NORMAL = 300_000; // 5 minutes when idle
const STATS_CACHE_TTL_SCAN = 30_000;    // 30 seconds during scan

/**
 * Get aggregated stats for user or a specific library
 *
 * PERFORMANCE: Uses request coalescing and caching.
 * - Coalescing: Multiple concurrent requests share one DB query
 * - Caching: Results cached with TTL (shorter during scans)
 */
export async function getAggregatedStats(libraryId?: string): Promise<AggregatedStats> {
  const cacheKey = `stats:aggregated:${libraryId || 'all'}`;

  // Check cache first
  const cached = memoryCache.get<AggregatedStats>(cacheKey);
  if (cached) {
    return cached;
  }

  // Use request coalescing for concurrent requests
  return coalescedStatsQuery(cacheKey, async () => {
    const db = getDatabase();
    let result: AggregatedStats;

    if (libraryId) {
      // Get library-specific stats
      const libraryStat = await db.libraryStat.findUnique({
        where: { libraryId },
      });

      if (libraryStat) {
        result = {
          totalFiles: libraryStat.totalFiles,
          totalSeries: libraryStat.totalSeries,
          totalPages: libraryStat.totalPages,
          filesRead: libraryStat.filesRead,
          filesInProgress: libraryStat.filesInProgress,
          filesUnread: libraryStat.filesUnread,
          pagesRead: libraryStat.pagesRead,
          readingTime: libraryStat.readingTime,
          filesWithMetadata: libraryStat.filesWithMetadata,
        };
      } else {
        // Return zeros if no stats yet
        result = {
          totalFiles: 0,
          totalSeries: 0,
          totalPages: 0,
          filesRead: 0,
          filesInProgress: 0,
          filesUnread: 0,
          pagesRead: 0,
          readingTime: 0,
          filesWithMetadata: 0,
        };
      }
    } else {
      // Get user-level stats
      const userStat = await db.userStat.findFirst();

      if (userStat) {
        result = {
          totalFiles: userStat.totalFiles,
          totalSeries: userStat.totalSeries,
          totalPages: userStat.totalPages,
          filesRead: userStat.filesRead,
          filesInProgress: userStat.filesInProgress,
          filesUnread: userStat.totalFiles - userStat.filesRead - userStat.filesInProgress,
          pagesRead: userStat.pagesRead,
          readingTime: userStat.readingTime,
          currentStreak: userStat.currentStreak,
          longestStreak: userStat.longestStreak,
        };
      } else {
        // Return zeros if no stats yet
        result = {
          totalFiles: 0,
          totalSeries: 0,
          totalPages: 0,
          filesRead: 0,
          filesInProgress: 0,
          filesUnread: 0,
          pagesRead: 0,
          readingTime: 0,
          currentStreak: 0,
          longestStreak: 0,
        };
      }
    }

    // Cache the result
    const ttl = memoryCache.isScanActive() ? STATS_CACHE_TTL_SCAN : STATS_CACHE_TTL_NORMAL;
    memoryCache.set(cacheKey, result, ttl);

    return result;
  });
}

// =============================================================================
// Entity Stats Queries
// =============================================================================

/**
 * Get top entities by various metrics
 */
export async function getEntityStats(params: {
  entityType: EntityType;
  libraryId?: string;
  sortBy?: 'owned' | 'read' | 'time' | 'ownedPages' | 'readPages';
  limit?: number;
  offset?: number;
}): Promise<{ items: EntityStatResult[]; total: number }> {
  const db = getDatabase();

  const { entityType, libraryId, sortBy = 'owned', limit = 20, offset = 0 } = params;

  // Build order by clause
  let orderBy: { [key: string]: 'desc' };
  switch (sortBy) {
    case 'read':
      orderBy = { readComics: 'desc' };
      break;
    case 'time':
      orderBy = { readTime: 'desc' };
      break;
    case 'ownedPages':
      orderBy = { ownedPages: 'desc' };
      break;
    case 'readPages':
      orderBy = { readPages: 'desc' };
      break;
    case 'owned':
    default:
      orderBy = { ownedComics: 'desc' };
      break;
  }

  // Get total count
  const total = await db.entityStat.count({
    where: {
      entityType,
      libraryId: libraryId ?? null,
    },
  });

  // Get paginated results
  const results = await db.entityStat.findMany({
    where: {
      entityType,
      libraryId: libraryId ?? null,
    },
    orderBy,
    take: limit,
    skip: offset,
  });

  const items: EntityStatResult[] = results.map((r) => ({
    entityType: r.entityType,
    entityName: r.entityName,
    entityRole: r.entityRole,
    ownedComics: r.ownedComics,
    ownedSeries: r.ownedSeries,
    ownedPages: r.ownedPages,
    readComics: r.readComics,
    readPages: r.readPages,
    readTime: r.readTime,
    readPercentage: r.ownedComics > 0 ? Math.round((r.readComics / r.ownedComics) * 100) : 0,
  }));

  return { items, total };
}

/**
 * Get stats for a specific entity
 */
export async function getEntityStat(params: {
  entityType: EntityType;
  entityName: string;
  entityRole?: string;
  libraryId?: string;
}): Promise<EntityStatResult | null> {
  const db = getDatabase();

  const result = await db.entityStat.findFirst({
    where: {
      entityType: params.entityType,
      entityName: params.entityName,
      entityRole: params.entityRole ?? null,
      libraryId: params.libraryId ?? null,
    },
  });

  if (!result) return null;

  return {
    entityType: result.entityType,
    entityName: result.entityName,
    entityRole: result.entityRole,
    ownedComics: result.ownedComics,
    ownedSeries: result.ownedSeries,
    ownedPages: result.ownedPages,
    readComics: result.readComics,
    readPages: result.readPages,
    readTime: result.readTime,
    readPercentage: result.ownedComics > 0 ? Math.round((result.readComics / result.ownedComics) * 100) : 0,
  };
}

// =============================================================================
// Entity Details (Drill-Down)
// =============================================================================

/**
 * Get detailed information for a specific entity including comics and related entities
 */
export async function getEntityDetails(params: {
  entityType: EntityType;
  entityName: string;
  entityRole?: string;
  libraryId?: string;
}): Promise<EntityDetails | null> {
  const db = getDatabase();

  // Get the entity stat
  const stat = await getEntityStat(params);
  if (!stat) return null;

  // Build the where clause for finding comics with this entity
  const libraryWhere = params.libraryId ? { libraryId: params.libraryId } : {};

  // Get comics that have this entity
  const comics = await getComicsForEntity(params.entityType, params.entityName, params.entityRole, params.libraryId);

  // Get related entities
  const relatedCreators = await getRelatedEntities(
    'creator',
    params.entityType,
    params.entityName,
    params.entityRole,
    params.libraryId
  );

  const relatedCharacters = await getRelatedEntities(
    'character',
    params.entityType,
    params.entityName,
    params.entityRole,
    params.libraryId
  );

  // Get related series
  const relatedSeries = await getRelatedSeries(
    params.entityType,
    params.entityName,
    params.entityRole,
    params.libraryId
  );

  return {
    entityType: stat.entityType,
    entityName: stat.entityName,
    entityRole: stat.entityRole,
    ownedComics: stat.ownedComics,
    ownedSeries: stat.ownedSeries,
    ownedPages: stat.ownedPages,
    readComics: stat.readComics,
    readPages: stat.readPages,
    readTime: stat.readTime,
    comics,
    relatedCreators,
    relatedCharacters,
    relatedSeries,
  };
}

/**
 * Get comics that contain a specific entity
 */
async function getComicsForEntity(
  entityType: EntityType,
  entityName: string,
  entityRole: string | undefined,
  libraryId: string | undefined
): Promise<EntityComic[]> {
  const db = getDatabase();

  // Build where clause based on entity type
  const metadataWhere: Record<string, { contains: string }> = {};

  switch (entityType) {
    case 'publisher':
      metadataWhere.publisher = { contains: entityName };
      break;
    case 'genre':
      metadataWhere.genre = { contains: entityName };
      break;
    case 'character':
      metadataWhere.characters = { contains: entityName };
      break;
    case 'team':
      metadataWhere.teams = { contains: entityName };
      break;
    case 'creator':
      if (entityRole) {
        const roleField = entityRole as keyof typeof metadataWhere;
        metadataWhere[roleField] = { contains: entityName };
      }
      break;
  }

  const files = await db.comicFile.findMany({
    where: {
      status: 'indexed',
      ...(libraryId ? { libraryId } : {}),
      metadata: metadataWhere,
    },
    include: {
      metadata: true,
      readingProgress: true,
      readingHistory: {
        select: { duration: true },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: [
      { metadata: { series: 'asc' } },
      { metadata: { number: 'asc' } },
    ],
    take: 100, // Limit for performance
  });

  return files.map((file) => ({
    fileId: file.id,
    filename: file.filename,
    seriesName: file.metadata?.series ?? null,
    number: file.metadata?.number ?? null,
    isRead: file.readingProgress?.completed ?? false,
    readingTime: file.readingHistory.reduce((sum, h) => sum + h.duration, 0),
    lastReadAt: file.readingProgress?.lastReadAt ?? null,
  }));
}

/**
 * Get related entities (entities that appear in the same comics)
 */
async function getRelatedEntities(
  relatedType: EntityType,
  sourceType: EntityType,
  sourceName: string,
  sourceRole: string | undefined,
  libraryId: string | undefined
): Promise<RelatedEntity[]> {
  const db = getDatabase();

  // Skip if looking for related entities of the same type
  if (relatedType === sourceType) return [];

  // Get all comics with the source entity
  const comics = await getComicsForEntity(sourceType, sourceName, sourceRole, libraryId);
  const fileIds = comics.map((c) => c.fileId);

  if (fileIds.length === 0) return [];

  // Get metadata for these files
  const metadataRecords = await db.fileMetadata.findMany({
    where: {
      comicId: { in: fileIds },
    },
  });

  // Count related entities
  const relatedCounts = new Map<string, { name: string; role: string | null; count: number }>();

  for (const meta of metadataRecords) {
    let values: string[] = [];
    let role: string | null = null;

    switch (relatedType) {
      case 'creator':
        // For creators, we need to check all role fields
        const creatorFields = ['writer', 'penciller', 'inker', 'colorist', 'letterer', 'coverArtist', 'editor'] as const;
        for (const field of creatorFields) {
          const fieldValue = meta[field];
          if (fieldValue) {
            const creators = fieldValue.split(',').map((c) => c.trim()).filter(Boolean);
            for (const creator of creators) {
              const key = `${creator}:${field}`;
              const existing = relatedCounts.get(key);
              if (existing) {
                existing.count++;
              } else {
                relatedCounts.set(key, { name: creator, role: field, count: 1 });
              }
            }
          }
        }
        continue; // Skip the common processing below

      case 'character':
        if (meta.characters) {
          values = meta.characters.split(',').map((c) => c.trim()).filter(Boolean);
        }
        break;

      case 'team':
        if (meta.teams) {
          values = meta.teams.split(',').map((t) => t.trim()).filter(Boolean);
        }
        break;

      case 'genre':
        if (meta.genre) {
          values = meta.genre.split(',').map((g) => g.trim()).filter(Boolean);
        }
        break;

      case 'publisher':
        if (meta.publisher) {
          values = [meta.publisher];
        }
        break;
    }

    for (const value of values) {
      const existing = relatedCounts.get(value);
      if (existing) {
        existing.count++;
      } else {
        relatedCounts.set(value, { name: value, role: null, count: 1 });
      }
    }
  }

  // Convert to array and sort by count
  const results = Array.from(relatedCounts.values())
    .map((r) => ({
      entityName: r.name,
      entityRole: r.role,
      sharedComics: r.count,
    }))
    .sort((a, b) => b.sharedComics - a.sharedComics)
    .slice(0, 10); // Top 10

  return results;
}

/**
 * Get series that contain a specific entity
 */
async function getRelatedSeries(
  entityType: EntityType,
  entityName: string,
  entityRole: string | undefined,
  libraryId: string | undefined
): Promise<RelatedSeries[]> {
  const db = getDatabase();

  // Get comics with this entity
  const comics = await getComicsForEntity(entityType, entityName, entityRole, libraryId);

  // Group by series
  const seriesMap = new Map<string, { name: string; owned: number; read: number }>();

  for (const comic of comics) {
    if (!comic.seriesName) continue;

    const key = comic.seriesName;
    const existing = seriesMap.get(key);

    if (existing) {
      existing.owned++;
      if (comic.isRead) existing.read++;
    } else {
      seriesMap.set(key, {
        name: comic.seriesName,
        owned: 1,
        read: comic.isRead ? 1 : 0,
      });
    }
  }

  // Convert to array and sort by owned count
  return Array.from(seriesMap.entries())
    .map(([seriesName, data]) => ({
      seriesId: seriesName, // Using name as ID for now
      seriesName,
      ownedCount: data.owned,
      readCount: data.read,
    }))
    .sort((a, b) => b.ownedCount - a.ownedCount);
}

// =============================================================================
// Summary Stats for Dashboard
// =============================================================================

/**
 * Get summary of top entities for dashboard display
 */
export async function getTopEntitiesSummary(libraryId?: string): Promise<{
  topCreators: EntityStatResult[];
  topGenres: EntityStatResult[];
  topCharacters: EntityStatResult[];
  topPublishers: EntityStatResult[];
  topTeams: EntityStatResult[];
}> {
  // Sort all entities by 'owned' to match what's displayed in the UI (ownedComics count)
  const [creators, genres, characters, publishers, teams] = await Promise.all([
    getEntityStats({ entityType: 'creator', libraryId, sortBy: 'owned', limit: 5 }),
    getEntityStats({ entityType: 'genre', libraryId, sortBy: 'owned', limit: 5 }),
    getEntityStats({ entityType: 'character', libraryId, sortBy: 'owned', limit: 5 }),
    getEntityStats({ entityType: 'publisher', libraryId, sortBy: 'owned', limit: 5 }),
    getEntityStats({ entityType: 'team', libraryId, sortBy: 'owned', limit: 5 }),
  ]);

  return {
    topCreators: creators.items,
    topGenres: genres.items,
    topCharacters: characters.items,
    topPublishers: publishers.items,
    topTeams: teams.items,
  };
}

// =============================================================================
// Extended Stats for Fun Facts
// =============================================================================

export interface ExtendedStats {
  // Format breakdown
  formatCounts: Record<string, number>;

  // Decade breakdown
  decadeCounts: Record<string, number>;

  // Unique entity counts
  uniqueCreatorCount: number;
  uniqueCharacterCount: number;
  uniqueTeamCount: number;
  uniqueGenreCount: number;
  uniquePublisherCount: number;

  // Series stats
  seriesCompleted: number;
  seriesInProgress: number;
  largestSeriesName: string | null;
  largestSeriesCount: number;

  // Reading queue and bookmarks
  queueCount: number;
  totalBookmarks: number;

  // Temporal stats
  oldestYear: number | null;
  newestYear: number | null;

  // Story arcs
  storyArcCount: number;

  // Rating & Review stats (user-specific, optional)
  ratingStats?: RatingStats;
}

/**
 * Get extended stats for fun facts feature
 * @param libraryId - Optional library to filter stats
 * @param userId - Optional user ID for user-specific stats (rating stats)
 */
export async function getExtendedStats(libraryId?: string, userId?: string): Promise<ExtendedStats> {
  const db = getDatabase();

  const whereClause = libraryId
    ? { libraryId, status: 'indexed' as const }
    : { status: 'indexed' as const };

  // Get format counts
  const formatCounts = await getFormatCounts(libraryId);

  // Get decade counts
  const decadeCounts = await getDecadeCounts(libraryId);

  // Get unique entity counts
  const [
    uniqueCreatorCount,
    uniqueCharacterCount,
    uniqueTeamCount,
    uniqueGenreCount,
    uniquePublisherCount,
  ] = await Promise.all([
    db.entityStat.count({ where: { entityType: 'creator', libraryId: libraryId ?? null } }),
    db.entityStat.count({ where: { entityType: 'character', libraryId: libraryId ?? null } }),
    db.entityStat.count({ where: { entityType: 'team', libraryId: libraryId ?? null } }),
    db.entityStat.count({ where: { entityType: 'genre', libraryId: libraryId ?? null } }),
    db.entityStat.count({ where: { entityType: 'publisher', libraryId: libraryId ?? null } }),
  ]);

  // Get series completion stats
  const seriesStats = await getSeriesCompletionStats(libraryId);

  // Get largest series
  const largestSeries = await getLargestSeries(libraryId);

  // Get queue count
  const queueCount = await db.readingQueue.count();

  // Get total bookmarks
  const bookmarkResult = await db.readingProgress.findMany({
    where: libraryId ? { file: { libraryId } } : {},
    select: { bookmarks: true },
  });
  const totalBookmarks = bookmarkResult.reduce((sum, rp) => {
    // bookmarks is stored as JSON string
    if (!rp.bookmarks) return sum;
    try {
      const parsed = typeof rp.bookmarks === 'string'
        ? JSON.parse(rp.bookmarks) as number[]
        : rp.bookmarks as unknown as number[];
      return sum + (Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      return sum;
    }
  }, 0);

  // Get year range
  const yearRange = await getYearRange(libraryId);

  // Get story arc count
  const storyArcCount = await getStoryArcCount(libraryId);

  // Get rating stats if userId is provided
  const ratingStats = userId ? await computeRatingStats(userId) : undefined;

  return {
    formatCounts,
    decadeCounts,
    uniqueCreatorCount,
    uniqueCharacterCount,
    uniqueTeamCount,
    uniqueGenreCount,
    uniquePublisherCount,
    seriesCompleted: seriesStats.completed,
    seriesInProgress: seriesStats.inProgress,
    largestSeriesName: largestSeries?.name ?? null,
    largestSeriesCount: largestSeries?.count ?? 0,
    queueCount,
    totalBookmarks,
    oldestYear: yearRange.oldest,
    newestYear: yearRange.newest,
    storyArcCount,
    ratingStats,
  };
}

/**
 * Get format breakdown (Issue, TPB, Omnibus, etc.)
 */
async function getFormatCounts(libraryId?: string): Promise<Record<string, number>> {
  const db = getDatabase();

  const whereClause = libraryId
    ? { comic: { libraryId, status: 'indexed' as const } }
    : { comic: { status: 'indexed' as const } };

  const results = await db.fileMetadata.groupBy({
    by: ['format'],
    where: whereClause,
    _count: { format: true },
  });

  const counts: Record<string, number> = {};
  for (const r of results) {
    if (r.format) {
      counts[r.format] = r._count.format;
    }
  }

  return counts;
}

/**
 * Get decade breakdown of collection
 */
async function getDecadeCounts(libraryId?: string): Promise<Record<string, number>> {
  const db = getDatabase();

  const whereClause = libraryId
    ? { comic: { libraryId, status: 'indexed' as const }, year: { not: null } }
    : { comic: { status: 'indexed' as const }, year: { not: null } };

  const results = await db.fileMetadata.findMany({
    where: whereClause,
    select: { year: true },
  });

  const counts: Record<string, number> = {};
  for (const r of results) {
    if (r.year) {
      const decade = `${Math.floor(r.year / 10) * 10}s`;
      counts[decade] = (counts[decade] || 0) + 1;
    }
  }

  return counts;
}

/**
 * Get series completion statistics
 */
async function getSeriesCompletionStats(libraryId?: string): Promise<{ completed: number; inProgress: number }> {
  const db = getDatabase();

  // Get all series with their issues and reading progress
  const series = await db.series.findMany({
    where: libraryId
      ? { issues: { some: { libraryId } } }
      : {},
    include: {
      _count: { select: { issues: true } },
      issues: {
        where: libraryId ? { libraryId } : {},
        include: { readingProgress: true },
      },
    },
  });

  let completed = 0;
  let inProgress = 0;

  for (const s of series) {
    const totalIssues = s.issues.length;
    if (totalIssues === 0) continue;

    const issuesRead = s.issues.filter(f => f.readingProgress?.completed).length;
    const issuesInProgress = s.issues.filter(f =>
      f.readingProgress && !f.readingProgress.completed && f.readingProgress.currentPage > 0
    ).length;

    if (issuesRead === totalIssues) {
      completed++;
    } else if (issuesRead > 0 || issuesInProgress > 0) {
      inProgress++;
    }
  }

  return { completed, inProgress };
}

/**
 * Get the largest series in the collection
 */
async function getLargestSeries(libraryId?: string): Promise<{ name: string; count: number } | null> {
  const db = getDatabase();

  // Count issues per series manually since issueCount may not be accurate
  const series = await db.series.findMany({
    where: libraryId
      ? { issues: { some: { libraryId } } }
      : {},
    select: {
      name: true,
      _count: { select: { issues: true } },
    },
  });

  if (series.length === 0) return null;

  // Find the series with the most issues
  const largest = series.reduce((max, s) =>
    s._count.issues > max._count.issues ? s : max,
    series[0]!
  );

  return { name: largest.name, count: largest._count.issues };
}

/**
 * Get year range of collection
 */
async function getYearRange(libraryId?: string): Promise<{ oldest: number | null; newest: number | null }> {
  const db = getDatabase();

  const whereClause = libraryId
    ? { comic: { libraryId, status: 'indexed' as const }, year: { not: null } }
    : { comic: { status: 'indexed' as const }, year: { not: null } };

  const oldest = await db.fileMetadata.findFirst({
    where: whereClause,
    orderBy: { year: 'asc' },
    select: { year: true },
  });

  const newest = await db.fileMetadata.findFirst({
    where: whereClause,
    orderBy: { year: 'desc' },
    select: { year: true },
  });

  return {
    oldest: oldest?.year ?? null,
    newest: newest?.year ?? null,
  };
}

/**
 * Get count of unique story arcs
 */
async function getStoryArcCount(libraryId?: string): Promise<number> {
  const db = getDatabase();

  const whereClause = libraryId
    ? { comic: { libraryId, status: 'indexed' as const }, storyArc: { not: null } }
    : { comic: { status: 'indexed' as const }, storyArc: { not: null } };

  const results = await db.fileMetadata.findMany({
    where: whereClause,
    select: { storyArc: true },
    distinct: ['storyArc'],
  });

  return results.length;
}

// =============================================================================
// Enhanced Stats Types and Queries
// =============================================================================

export type StatsTimeframe = 'this_week' | 'this_month' | 'this_year' | 'all_time';

export interface EnhancedLibraryOverview {
  totalSeries: number;
  totalVolumes: number;
  totalFiles: number;
  totalSizeBytes: number;
  totalGenres: number;
  totalTags: number;
  totalPeople: number;
  totalReadTime: number;
}

export interface YearlySeriesCount {
  year: number;
  count: number;
}

export interface FileFormatDistribution {
  extension: string;
  count: number;
  percentage: number;
}

export interface PublicationStatusDistribution {
  status: 'ongoing' | 'ended';
  count: number;
  percentage: number;
}

export interface DayOfWeekActivity {
  dayOfWeek: number;
  dayName: string;
  readCount: number;
  pagesRead: number;
  readingTime: number;
}

export interface UserReadingRanking {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  readCount: number;
  readingTime: number;
  lastActiveAt: Date | null;
}

export interface LibraryReadingRanking {
  libraryId: string;
  libraryName: string;
  readCount: number;
  userCount: number;
  totalFiles: number;
}

export interface PopularSeriesItem {
  seriesId: string;
  seriesName: string;
  publisher: string | null;
  coverHash: string | null;
  firstIssueId: string | null;
  firstIssueCoverHash: string | null;
  readCount: number;
  userCount: number;
}

export interface RecentlyReadItem {
  seriesId: string;
  seriesName: string;
  publisher: string | null;
  coverHash: string | null;
  firstIssueId: string | null;
  firstIssueCoverHash: string | null;
  lastReadAt: Date;
  lastReadByUsername: string;
}

export interface MediaTypeBreakdown {
  comicsCount: number;
  mangaCount: number;
  comicsHours: number;
  mangaHours: number;
}

/**
 * Get date range for timeframe
 */
function getTimeframeRange(timeframe: StatsTimeframe): { start: Date | null; end: Date } {
  const now = new Date();
  const end = now;

  switch (timeframe) {
    case 'this_week': {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case 'this_month': {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case 'this_year': {
      const start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case 'all_time':
    default:
      return { start: null, end };
  }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// =============================================================================
// Enhanced Library Overview
// =============================================================================

/**
 * Get enhanced library overview stats
 */
export async function getEnhancedLibraryOverview(libraryId?: string): Promise<EnhancedLibraryOverview> {
  const db = getDatabase();

  const fileWhereClause = libraryId
    ? { libraryId, status: 'indexed' as const }
    : { status: 'indexed' as const };

  const metadataWhereClause = libraryId
    ? { comic: { libraryId, status: 'indexed' as const } }
    : { comic: { status: 'indexed' as const } };

  // Parallel queries for efficiency
  const [
    fileStats,
    seriesCount,
    volumeCount,
    genreData,
    tagData,
    creatorCount,
    readingTimeResult,
  ] = await Promise.all([
    // File stats (count and size)
    db.comicFile.aggregate({
      where: fileWhereClause,
      _count: { id: true },
      _sum: { size: true },
    }),
    // Series count
    db.series.count({
      where: libraryId
        ? { issues: { some: { libraryId } } }
        : {},
    }),
    // Volume count (files with volume-like formats)
    db.fileMetadata.count({
      where: {
        ...metadataWhereClause,
        format: { in: ['Volume', 'TPB', 'Omnibus', 'Hardcover', 'Graphic Novel'] },
      },
    }),
    // Get all unique genres (comma-separated field)
    db.fileMetadata.findMany({
      where: { ...metadataWhereClause, genre: { not: null } },
      select: { genre: true },
      distinct: ['genre'],
    }),
    // Get all unique tags from series
    db.series.findMany({
      where: libraryId
        ? { issues: { some: { libraryId } }, tags: { not: null } }
        : { tags: { not: null } },
      select: { tags: true },
      distinct: ['tags'],
    }),
    // Creator count (unique across all roles)
    db.entityStat.count({
      where: { entityType: 'creator', libraryId: libraryId ?? null },
    }),
    // Total reading time
    libraryId
      ? db.readingHistory.aggregate({
          where: { file: { libraryId } },
          _sum: { duration: true },
        })
      : db.readingHistory.aggregate({
          _sum: { duration: true },
        }),
  ]);

  // Count unique genres (they're comma-separated)
  const uniqueGenres = new Set<string>();
  for (const record of genreData) {
    if (record.genre) {
      record.genre.split(',').forEach(g => {
        const trimmed = g.trim();
        if (trimmed) uniqueGenres.add(trimmed);
      });
    }
  }

  // Count unique tags (they're comma-separated)
  const uniqueTags = new Set<string>();
  for (const record of tagData) {
    if (record.tags) {
      record.tags.split(',').forEach(t => {
        const trimmed = t.trim();
        if (trimmed) uniqueTags.add(trimmed);
      });
    }
  }

  return {
    totalSeries: seriesCount,
    totalVolumes: volumeCount,
    totalFiles: fileStats._count.id,
    totalSizeBytes: Number(fileStats._sum.size ?? 0),
    totalGenres: uniqueGenres.size,
    totalTags: uniqueTags.size,
    totalPeople: creatorCount,
    totalReadTime: readingTimeResult._sum.duration ?? 0,
  };
}

// =============================================================================
// Release Years Aggregation
// =============================================================================

/**
 * Get series count by publication year
 */
export async function getSeriesByYear(libraryId?: string): Promise<YearlySeriesCount[]> {
  const db = getDatabase();

  const whereClause = libraryId
    ? { issues: { some: { libraryId } }, startYear: { not: null } }
    : { startYear: { not: null } };

  const series = await db.series.findMany({
    where: whereClause,
    select: { startYear: true },
  });

  // Count by year
  const yearCounts = new Map<number, number>();
  for (const s of series) {
    if (s.startYear) {
      yearCounts.set(s.startYear, (yearCounts.get(s.startYear) || 0) + 1);
    }
  }

  // Convert to sorted array
  return Array.from(yearCounts.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);
}

// =============================================================================
// File Format Distribution
// =============================================================================

/**
 * Get file format distribution by extension
 */
export async function getFileFormatDistribution(libraryId?: string): Promise<FileFormatDistribution[]> {
  const db = getDatabase();

  const whereClause = libraryId
    ? { libraryId, status: 'indexed' as const }
    : { status: 'indexed' as const };

  const results = await db.comicFile.groupBy({
    by: ['extension'],
    where: whereClause,
    _count: { extension: true },
  });

  const total = results.reduce((sum, r) => sum + r._count.extension, 0);

  return results
    .map(r => ({
      extension: r.extension || 'unknown',
      count: r._count.extension,
      percentage: total > 0 ? Math.round((r._count.extension / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

// =============================================================================
// Publication Status Distribution
// =============================================================================

/**
 * Get publication status distribution (ongoing vs ended)
 */
export async function getPublicationStatusDistribution(libraryId?: string): Promise<PublicationStatusDistribution[]> {
  const db = getDatabase();

  const whereClause = libraryId
    ? { issues: { some: { libraryId } } }
    : {};

  const [ongoingCount, endedCount] = await Promise.all([
    db.series.count({
      where: { ...whereClause, endYear: null },
    }),
    db.series.count({
      where: { ...whereClause, endYear: { not: null } },
    }),
  ]);

  const total = ongoingCount + endedCount;

  return [
    {
      status: 'ongoing',
      count: ongoingCount,
      percentage: total > 0 ? Math.round((ongoingCount / total) * 10000) / 100 : 0,
    },
    {
      status: 'ended',
      count: endedCount,
      percentage: total > 0 ? Math.round((endedCount / total) * 10000) / 100 : 0,
    },
  ];
}

// =============================================================================
// Day of Week Activity
// =============================================================================

/**
 * Get reading activity by day of week
 */
export async function getDayOfWeekActivity(
  userId?: string,
  timeframe: StatsTimeframe = 'this_month'
): Promise<DayOfWeekActivity[]> {
  const db = getDatabase();

  const { start } = getTimeframeRange(timeframe);

  // Build where clause for UserReadingProgress
  const whereClause: {
    lastReadAt?: { gte: Date };
    userId?: string;
  } = {};

  if (start) {
    whereClause.lastReadAt = { gte: start };
  }
  if (userId) {
    whereClause.userId = userId;
  }

  // Get all reading progress records in timeframe
  const records = await db.userReadingProgress.findMany({
    where: whereClause,
    select: {
      lastReadAt: true,
      totalPages: true,
      currentPage: true,
    },
  });

  // Aggregate by day of week
  // Estimate reading time as 2 minutes per page
  const MINUTES_PER_PAGE = 2;
  const dayStats = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    dayName: DAY_NAMES[i]!,
    readCount: 0,
    pagesRead: 0,
    readingTime: 0,
  }));

  for (const record of records) {
    const dayIndex = record.lastReadAt.getDay();
    dayStats[dayIndex]!.readCount++;
    dayStats[dayIndex]!.pagesRead += record.currentPage;
    dayStats[dayIndex]!.readingTime += record.currentPage * MINUTES_PER_PAGE * 60; // seconds
  }

  return dayStats;
}

// =============================================================================
// Admin-Only Stats Functions
// =============================================================================

/**
 * Get most active users (admin-only)
 */
export async function getMostActiveUsers(
  timeframe: StatsTimeframe,
  limit: number = 10
): Promise<UserReadingRanking[]> {
  const db = getDatabase();

  const { start } = getTimeframeRange(timeframe);

  // Build where clause for UserReadingProgress
  const whereClause: { lastReadAt?: { gte: Date } } = {};
  if (start) {
    whereClause.lastReadAt = { gte: start };
  }

  // Get reading stats grouped by user from UserReadingProgress
  const userStats = await db.userReadingProgress.groupBy({
    by: ['userId'],
    where: whereClause,
    _count: { id: true },
    _max: { lastReadAt: true },
  });

  // Sort by read count and take top N
  const sortedStats = userStats
    .sort((a, b) => (b._count?.id ?? 0) - (a._count?.id ?? 0))
    .slice(0, limit);

  // Get user details
  const userIds = sortedStats.map(s => s.userId);
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });

  const userMap = new Map(users.map(u => [u.id, u]));

  return sortedStats.map(s => {
    const user = userMap.get(s.userId);
    return {
      userId: s.userId,
      username: user?.username ?? 'Unknown',
      displayName: user?.displayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      readCount: s._count?.id ?? 0,
      readingTime: 0, // UserReadingProgress doesn't track duration
      lastActiveAt: s._max?.lastReadAt ?? null,
    };
  });
}

/**
 * Get popular libraries by read count (admin-only)
 */
export async function getPopularLibraries(
  timeframe: StatsTimeframe,
  limit: number = 10
): Promise<LibraryReadingRanking[]> {
  const db = getDatabase();

  const { start } = getTimeframeRange(timeframe);

  // Get all libraries with their stats
  const libraries = await db.library.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { files: true } },
    },
  });

  // Get reading stats per library using UserReadingProgress
  const libraryReadCounts = await Promise.all(
    libraries.map(async (lib) => {
      const whereClause: { file: { libraryId: string }; lastReadAt?: { gte: Date } } = {
        file: { libraryId: lib.id },
      };
      if (start) {
        whereClause.lastReadAt = { gte: start };
      }

      const stats = await db.userReadingProgress.aggregate({
        where: whereClause,
        _count: { id: true },
      });

      // Get unique user count
      const uniqueUsers = await db.userReadingProgress.groupBy({
        by: ['userId'],
        where: whereClause,
      });

      return {
        libraryId: lib.id,
        libraryName: lib.name,
        readCount: stats._count?.id ?? 0,
        userCount: uniqueUsers.length,
        totalFiles: lib._count.files,
      };
    })
  );

  return libraryReadCounts
    .sort((a, b) => b.readCount - a.readCount)
    .slice(0, limit);
}

/**
 * Get popular series with cover images (admin-only)
 */
export async function getPopularSeries(
  timeframe: StatsTimeframe,
  limit: number = 10
): Promise<PopularSeriesItem[]> {
  const db = getDatabase();

  const { start } = getTimeframeRange(timeframe);

  // Build where clause for UserReadingProgress
  const whereClause: { lastReadAt?: { gte: Date } } = {};
  if (start) {
    whereClause.lastReadAt = { gte: start };
  }

  // Get reading progress with file and series info
  const readingData = await db.userReadingProgress.findMany({
    where: whereClause,
    select: {
      userId: true,
      file: {
        select: {
          seriesId: true,
          series: {
            select: {
              id: true,
              name: true,
              publisher: true,
              coverHash: true,
            },
          },
        },
      },
    },
  });

  // Aggregate by series
  const seriesStats = new Map<string, {
    series: { id: string; name: string; publisher: string | null; coverHash: string | null };
    readCount: number;
    users: Set<string>;
  }>();

  for (const record of readingData) {
    if (!record.file.series) continue;

    const seriesId = record.file.series.id;
    const existing = seriesStats.get(seriesId);

    if (existing) {
      existing.readCount++;
      existing.users.add(record.userId);
    } else {
      seriesStats.set(seriesId, {
        series: record.file.series,
        readCount: 1,
        users: new Set([record.userId]),
      });
    }
  }

  // Sort and limit
  const sorted = Array.from(seriesStats.values())
    .sort((a, b) => b.readCount - a.readCount)
    .slice(0, limit);

  // Get first issue for each series (for cover fallback)
  const seriesIds = sorted.map(s => s.series.id);
  const firstIssues = await db.comicFile.findMany({
    where: {
      seriesId: { in: seriesIds },
      status: 'indexed',
    },
    select: {
      seriesId: true,
      id: true,
      coverHash: true,
    },
    orderBy: [
      { metadata: { issueNumberSort: 'asc' } },
      { filename: 'asc' },
    ],
    distinct: ['seriesId'],
  });

  const firstIssueMap = new Map(firstIssues.map(f => [f.seriesId, f]));

  return sorted.map(s => {
    const firstIssue = firstIssueMap.get(s.series.id);
    return {
      seriesId: s.series.id,
      seriesName: s.series.name,
      publisher: s.series.publisher,
      coverHash: s.series.coverHash,
      firstIssueId: firstIssue?.id ?? null,
      firstIssueCoverHash: firstIssue?.coverHash ?? null,
      readCount: s.readCount,
      userCount: s.users.size,
    };
  });
}

/**
 * Get recently read series with covers (admin-only)
 */
export async function getRecentlyRead(
  timeframe: StatsTimeframe,
  limit: number = 10
): Promise<RecentlyReadItem[]> {
  const db = getDatabase();

  const { start } = getTimeframeRange(timeframe);

  // Build where clause for UserReadingProgress
  const whereClause: { lastReadAt?: { gte: Date } } = {};
  if (start) {
    whereClause.lastReadAt = { gte: start };
  }

  // Get most recent reading progress per series
  const recentReads = await db.userReadingProgress.findMany({
    where: whereClause,
    select: {
      lastReadAt: true,
      userId: true,
      user: {
        select: { username: true },
      },
      file: {
        select: {
          seriesId: true,
          series: {
            select: {
              id: true,
              name: true,
              publisher: true,
              coverHash: true,
            },
          },
        },
      },
    },
    orderBy: { lastReadAt: 'desc' },
    take: 100, // Get more than limit to dedupe by series
  });

  // Dedupe by series, keeping most recent
  const seriesSeen = new Set<string>();
  const uniqueReads: typeof recentReads = [];

  for (const record of recentReads) {
    if (!record.file.series || seriesSeen.has(record.file.series.id)) continue;
    seriesSeen.add(record.file.series.id);
    uniqueReads.push(record);
    if (uniqueReads.length >= limit) break;
  }

  // Get first issue for each series
  const seriesIds = uniqueReads.map(r => r.file.series!.id);
  const firstIssues = await db.comicFile.findMany({
    where: {
      seriesId: { in: seriesIds },
      status: 'indexed',
    },
    select: {
      seriesId: true,
      id: true,
      coverHash: true,
    },
    orderBy: [
      { metadata: { issueNumberSort: 'asc' } },
      { filename: 'asc' },
    ],
    distinct: ['seriesId'],
  });

  const firstIssueMap = new Map(firstIssues.map(f => [f.seriesId, f]));

  return uniqueReads.map(r => {
    const series = r.file.series!;
    const firstIssue = firstIssueMap.get(series.id);
    return {
      seriesId: series.id,
      seriesName: series.name,
      publisher: series.publisher,
      coverHash: series.coverHash,
      firstIssueId: firstIssue?.id ?? null,
      firstIssueCoverHash: firstIssue?.coverHash ?? null,
      lastReadAt: r.lastReadAt,
      lastReadByUsername: r.user?.username ?? 'Unknown',
    };
  });
}

/**
 * Get top readers with media type breakdown (admin-only)
 */
export async function getTopReadersByMediaType(
  timeframe: StatsTimeframe,
  limit: number = 10
): Promise<Array<UserReadingRanking & MediaTypeBreakdown>> {
  const db = getDatabase();

  const { start } = getTimeframeRange(timeframe);

  // Build where clause for UserReadingProgress
  const whereClause: { lastReadAt?: { gte: Date } } = {};
  if (start) {
    whereClause.lastReadAt = { gte: start };
  }

  // Get reading progress with series type info
  const readingData = await db.userReadingProgress.findMany({
    where: whereClause,
    select: {
      userId: true,
      totalPages: true,
      file: {
        select: {
          series: {
            select: { type: true },
          },
        },
      },
    },
  });

  // Aggregate by user with media type breakdown
  // Since UserReadingProgress doesn't have duration, estimate based on pages (avg 2 min/page)
  const MINUTES_PER_PAGE = 2;
  const userStats = new Map<string, {
    readCount: number;
    readingTime: number;
    comicsCount: number;
    mangaCount: number;
    comicsHours: number;
    mangaHours: number;
  }>();

  for (const record of readingData) {
    const existing = userStats.get(record.userId) || {
      readCount: 0,
      readingTime: 0,
      comicsCount: 0,
      mangaCount: 0,
      comicsHours: 0,
      mangaHours: 0,
    };

    existing.readCount++;
    const estimatedMinutes = record.totalPages * MINUTES_PER_PAGE;
    existing.readingTime += estimatedMinutes * 60; // Convert to seconds

    const isManga = record.file.series?.type === 'manga';
    if (isManga) {
      existing.mangaCount++;
      existing.mangaHours += estimatedMinutes / 60;
    } else {
      existing.comicsCount++;
      existing.comicsHours += estimatedMinutes / 60;
    }

    userStats.set(record.userId, existing);
  }

  // Sort by total read count
  const sortedUserIds = Array.from(userStats.entries())
    .sort((a, b) => b[1].readCount - a[1].readCount)
    .slice(0, limit)
    .map(([userId]) => userId);

  // Get user details
  const users = await db.user.findMany({
    where: { id: { in: sortedUserIds } },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });

  const userMap = new Map(users.map(u => [u.id, u]));

  // Get last active date per user from UserReadingProgress
  const lastActiveDates = await db.userReadingProgress.groupBy({
    by: ['userId'],
    where: { userId: { in: sortedUserIds }, ...whereClause },
    _max: { lastReadAt: true },
  });

  const lastActiveMap = new Map(
    lastActiveDates.map(d => [d.userId, d._max?.lastReadAt ?? null])
  );

  return sortedUserIds.map(userId => {
    const stats = userStats.get(userId)!;
    const user = userMap.get(userId);
    return {
      userId,
      username: user?.username ?? 'Unknown',
      displayName: user?.displayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      readCount: stats.readCount,
      readingTime: stats.readingTime,
      lastActiveAt: lastActiveMap.get(userId) ?? null,
      comicsCount: stats.comicsCount,
      mangaCount: stats.mangaCount,
      comicsHours: Math.round(stats.comicsHours * 10) / 10,
      mangaHours: Math.round(stats.mangaHours * 10) / 10,
    };
  });
}
