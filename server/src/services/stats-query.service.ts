/**
 * Stats Query Service
 *
 * Retrieves pre-computed stats from the database for display.
 * Supports library filtering and entity drill-down.
 */

import { getDatabase } from './database.service.js';
import { EntityType } from './stats-dirty.service.js';

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

/**
 * Get aggregated stats for user or a specific library
 */
export async function getAggregatedStats(libraryId?: string): Promise<AggregatedStats> {
  const db = getDatabase();

  if (libraryId) {
    // Get library-specific stats
    const libraryStat = await db.libraryStat.findUnique({
      where: { libraryId },
    });

    if (libraryStat) {
      return {
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
    }

    // Return zeros if no stats yet
    return {
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
  } else {
    // Get user-level stats
    const userStat = await db.userStat.findFirst();

    if (userStat) {
      return {
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
    }

    // Return zeros if no stats yet
    return {
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

// =============================================================================
// Entity Stats Queries
// =============================================================================

/**
 * Get top entities by various metrics
 */
export async function getEntityStats(params: {
  entityType: EntityType;
  libraryId?: string;
  sortBy?: 'owned' | 'read' | 'time';
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
}> {
  const [creators, genres, characters, publishers] = await Promise.all([
    getEntityStats({ entityType: 'creator', libraryId, sortBy: 'read', limit: 5 }),
    getEntityStats({ entityType: 'genre', libraryId, sortBy: 'owned', limit: 5 }),
    getEntityStats({ entityType: 'character', libraryId, sortBy: 'read', limit: 5 }),
    getEntityStats({ entityType: 'publisher', libraryId, sortBy: 'owned', limit: 5 }),
  ]);

  return {
    topCreators: creators.items,
    topGenres: genres.items,
    topCharacters: characters.items,
    topPublishers: publishers.items,
  };
}
