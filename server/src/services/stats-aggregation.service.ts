/**
 * Stats Aggregation Service
 *
 * Computes and caches aggregated stats for libraries, users, and metadata entities.
 * Supports both full rebuilds and incremental updates.
 */

import { getDatabase } from './database.service.js';
import {
  getUniqueDirtyScopes,
  clearAllDirtyFlags,
  EntityType,
} from './stats-dirty.service.js';
import { logError, logInfo, logDebug, createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('stats-aggregation');

// =============================================================================
// Types
// =============================================================================

const ENTITY_TYPES: EntityType[] = ['creator', 'genre', 'character', 'team', 'publisher'];

interface CreatorRole {
  field: 'writer' | 'penciller' | 'inker' | 'colorist' | 'letterer' | 'coverArtist' | 'editor';
  role: string;
}

const CREATOR_ROLES: CreatorRole[] = [
  { field: 'writer', role: 'writer' },
  { field: 'penciller', role: 'penciller' },
  { field: 'inker', role: 'inker' },
  { field: 'colorist', role: 'colorist' },
  { field: 'letterer', role: 'letterer' },
  { field: 'coverArtist', role: 'coverArtist' },
  { field: 'editor', role: 'editor' },
];

// =============================================================================
// Library Stats Computation
// =============================================================================

/**
 * Compute and cache stats for a specific library
 */
export async function computeLibraryStats(libraryId: string): Promise<void> {
  const db = getDatabase();

  // Get all indexed files in the library with their metadata and reading progress
  const files = await db.comicFile.findMany({
    where: {
      libraryId,
      status: 'indexed',
    },
    include: {
      metadata: true,
      readingProgress: true,
    },
  });

  // Count series
  const seriesCount = await db.comicFile.groupBy({
    by: ['seriesId'],
    where: {
      libraryId,
      status: 'indexed',
      seriesId: { not: null },
    },
  });

  // Calculate stats
  let totalFiles = 0;
  let totalPages = 0;
  let filesRead = 0;
  let filesInProgress = 0;
  let pagesRead = 0;
  let readingTime = 0;
  let filesWithMetadata = 0;

  for (const file of files) {
    totalFiles++;

    if (file.metadata) {
      filesWithMetadata++;
      if (file.metadata.pageCount) {
        totalPages += file.metadata.pageCount;
      }
    }

    if (file.readingProgress) {
      if (file.readingProgress.completed) {
        filesRead++;
        pagesRead += file.readingProgress.totalPages;
      } else if (file.readingProgress.currentPage > 0) {
        filesInProgress++;
        pagesRead += file.readingProgress.currentPage;
      }
    }
  }

  // Get reading time from history for this library
  const readingHistory = await db.readingHistory.aggregate({
    where: {
      file: { libraryId },
    },
    _sum: {
      duration: true,
    },
  });

  readingTime = readingHistory._sum.duration || 0;

  const filesUnread = totalFiles - filesRead - filesInProgress;

  // Upsert library stats
  await db.libraryStat.upsert({
    where: { libraryId },
    create: {
      libraryId,
      totalFiles,
      totalSeries: seriesCount.length,
      totalPages,
      filesRead,
      filesInProgress,
      filesUnread,
      pagesRead,
      readingTime,
      filesWithMetadata,
    },
    update: {
      totalFiles,
      totalSeries: seriesCount.length,
      totalPages,
      filesRead,
      filesInProgress,
      filesUnread,
      pagesRead,
      readingTime,
      filesWithMetadata,
    },
  });
}

// =============================================================================
// User Stats Computation
// =============================================================================

/**
 * Compute and cache user-level stats (aggregate of all libraries)
 */
export async function computeUserStats(): Promise<void> {
  const db = getDatabase();

  // Aggregate from library stats
  const libraryStats = await db.libraryStat.aggregate({
    _sum: {
      totalFiles: true,
      totalSeries: true,
      totalPages: true,
      filesRead: true,
      filesInProgress: true,
      pagesRead: true,
      readingTime: true,
    },
  });

  // Calculate streaks from ReadingStats
  const { currentStreak, longestStreak } = await calculateStreaks();

  // Upsert user stats (single record)
  const existing = await db.userStat.findFirst();

  if (existing) {
    await db.userStat.update({
      where: { id: existing.id },
      data: {
        totalFiles: libraryStats._sum.totalFiles || 0,
        totalSeries: libraryStats._sum.totalSeries || 0,
        totalPages: libraryStats._sum.totalPages || 0,
        filesRead: libraryStats._sum.filesRead || 0,
        filesInProgress: libraryStats._sum.filesInProgress || 0,
        pagesRead: libraryStats._sum.pagesRead || 0,
        readingTime: libraryStats._sum.readingTime || 0,
        currentStreak,
        longestStreak,
      },
    });
  } else {
    await db.userStat.create({
      data: {
        totalFiles: libraryStats._sum.totalFiles || 0,
        totalSeries: libraryStats._sum.totalSeries || 0,
        totalPages: libraryStats._sum.totalPages || 0,
        filesRead: libraryStats._sum.filesRead || 0,
        filesInProgress: libraryStats._sum.filesInProgress || 0,
        pagesRead: libraryStats._sum.pagesRead || 0,
        readingTime: libraryStats._sum.readingTime || 0,
        currentStreak,
        longestStreak,
      },
    });
  }
}

/**
 * Calculate reading streaks from ReadingStats
 */
async function calculateStreaks(): Promise<{ currentStreak: number; longestStreak: number }> {
  const db = getDatabase();

  const stats = await db.readingStats.findMany({
    orderBy: { date: 'desc' },
    select: { date: true, sessionsCount: true },
  });

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let lastDate: Date | null = null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const stat of stats) {
    if (stat.sessionsCount > 0) {
      if (lastDate === null) {
        const daysSinceActivity = Math.floor(
          (today.getTime() - stat.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceActivity <= 1) {
          tempStreak = 1;
          currentStreak = 1;
        } else {
          tempStreak = 1;
          currentStreak = 0;
        }
      } else {
        const dayDiff = Math.floor(
          (lastDate.getTime() - stat.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (dayDiff === 1) {
          tempStreak++;
          if (currentStreak > 0) currentStreak++;
        } else {
          if (tempStreak > longestStreak) longestStreak = tempStreak;
          tempStreak = 1;
          if (currentStreak > 0) currentStreak = 0;
        }
      }
      lastDate = stat.date;
    }
  }

  if (tempStreak > longestStreak) longestStreak = tempStreak;

  return { currentStreak, longestStreak };
}

// =============================================================================
// Entity Stats Computation
// =============================================================================

/**
 * Compute stats for a specific entity type in a library (or user-level if libraryId is null)
 */
export async function computeEntityStats(
  entityType: EntityType,
  libraryId?: string
): Promise<void> {
  const db = getDatabase();

  // Build where clause for files
  const whereClause: {
    status: string;
    libraryId?: string;
  } = {
    status: 'indexed',
  };

  if (libraryId) {
    whereClause.libraryId = libraryId;
  }

  // Get all files with metadata and reading progress
  const files = await db.comicFile.findMany({
    where: whereClause,
    include: {
      metadata: true,
      readingProgress: true,
      readingHistory: {
        select: { duration: true },
      },
    },
  });

  // Aggregate stats by entity
  const entityStats = new Map<string, {
    entityName: string;
    entityRole: string | null;
    ownedComics: number;
    ownedSeries: Set<string>;
    ownedPages: number;
    readComics: number;
    readPages: number;
    readTime: number;
  }>();

  for (const file of files) {
    if (!file.metadata) continue;

    const meta = file.metadata;
    const isRead = file.readingProgress?.completed ?? false;
    const pagesInFile = meta.pageCount || 0;
    const readingTimeForFile = file.readingHistory.reduce((sum, h) => sum + h.duration, 0);
    const seriesId = file.seriesId || 'unknown';

    // Helper to add entity stats
    const addEntityStat = (name: string, role: string | null = null) => {
      const key = role ? `${name}:${role}` : name;
      const existing = entityStats.get(key);

      if (existing) {
        existing.ownedComics++;
        existing.ownedSeries.add(seriesId);
        existing.ownedPages += pagesInFile;
        if (isRead) {
          existing.readComics++;
          existing.readPages += pagesInFile;
          existing.readTime += readingTimeForFile;
        }
      } else {
        const seriesSet = new Set<string>();
        seriesSet.add(seriesId);
        entityStats.set(key, {
          entityName: name,
          entityRole: role,
          ownedComics: 1,
          ownedSeries: seriesSet,
          ownedPages: pagesInFile,
          readComics: isRead ? 1 : 0,
          readPages: isRead ? pagesInFile : 0,
          readTime: isRead ? readingTimeForFile : 0,
        });
      }
    };

    // Extract entities based on type
    switch (entityType) {
      case 'publisher':
        if (meta.publisher) {
          addEntityStat(meta.publisher);
        }
        break;

      case 'genre':
        if (meta.genre) {
          const genres = meta.genre.split(',').map((g) => g.trim()).filter(Boolean);
          for (const genre of genres) {
            addEntityStat(genre);
          }
        }
        break;

      case 'character':
        if (meta.characters) {
          const characters = meta.characters.split(',').map((c) => c.trim()).filter(Boolean);
          for (const character of characters) {
            addEntityStat(character);
          }
        }
        break;

      case 'team':
        if (meta.teams) {
          const teams = meta.teams.split(',').map((t) => t.trim()).filter(Boolean);
          for (const team of teams) {
            addEntityStat(team);
          }
        }
        break;

      case 'creator':
        for (const { field, role } of CREATOR_ROLES) {
          const value = meta[field];
          if (value) {
            const creators = value.split(',').map((c) => c.trim()).filter(Boolean);
            for (const creator of creators) {
              addEntityStat(creator, role);
            }
          }
        }
        break;
    }
  }

  // Delete existing stats for this entity type and library
  await db.entityStat.deleteMany({
    where: {
      entityType,
      libraryId: libraryId ?? null,
    },
  });

  // Insert new stats
  const statsToCreate = Array.from(entityStats.values()).map((stat) => ({
    entityType,
    entityName: stat.entityName,
    entityRole: stat.entityRole,
    libraryId: libraryId ?? null,
    ownedComics: stat.ownedComics,
    ownedSeries: stat.ownedSeries.size,
    ownedPages: stat.ownedPages,
    readComics: stat.readComics,
    readPages: stat.readPages,
    readTime: stat.readTime,
  }));

  if (statsToCreate.length > 0) {
    await db.entityStat.createMany({
      data: statsToCreate,
    });
  }
}

// =============================================================================
// Full Rebuild
// =============================================================================

/**
 * Perform a full rebuild of all stats
 */
export async function fullRebuild(): Promise<void> {
  const db = getDatabase();

  logInfo('stats-aggregation', 'Starting full rebuild...');

  // Clear all existing stats
  await db.entityStat.deleteMany();
  await db.libraryStat.deleteMany();
  await clearAllDirtyFlags();

  // Get all libraries
  const libraries = await db.library.findMany();

  // Rebuild library stats
  for (const library of libraries) {
    logDebug('stats-aggregation', `Computing stats for library: ${library.name}`, { libraryId: library.id, libraryName: library.name });
    await computeLibraryStats(library.id);

    // Compute entity stats for each type
    for (const entityType of ENTITY_TYPES) {
      await computeEntityStats(entityType, library.id);
    }
  }

  // Compute user-level stats
  logDebug('stats-aggregation', 'Computing user-level stats...');
  await computeUserStats();

  // Compute user-level entity stats
  for (const entityType of ENTITY_TYPES) {
    await computeEntityStats(entityType); // null libraryId = user-level
  }

  logInfo('stats-aggregation', 'Full rebuild complete');
}

// =============================================================================
// Incremental Update
// =============================================================================

/**
 * Process dirty stats incrementally
 */
export async function processDirtyStats(): Promise<{ processed: number }> {
  const db = getDatabase();

  const { libraries, entities, userDirty } = await getUniqueDirtyScopes();

  let processed = 0;

  // Process library-level dirty flags
  for (const libraryId of libraries) {
    logDebug('stats-aggregation', `Recomputing stats for library: ${libraryId}`, { libraryId });
    await computeLibraryStats(libraryId);

    // Also recompute entity stats for this library
    for (const entityType of ENTITY_TYPES) {
      await computeEntityStats(entityType, libraryId);
    }

    processed++;
  }

  // Process entity-level dirty flags (for specific entities)
  // Note: For simplicity, we recompute all entities of a type when any is dirty
  // A more granular approach would track specific entities
  const dirtyEntityTypes = new Set(entities.map((e) => e.entityType));
  for (const entityType of dirtyEntityTypes) {
    // Recompute user-level entity stats for this type
    await computeEntityStats(entityType as EntityType);
    processed++;
  }

  // Process user-level dirty flag
  if (userDirty || libraries.length > 0) {
    logDebug('stats-aggregation', 'Recomputing user-level stats');
    await computeUserStats();
    processed++;
  }

  // Clear all processed flags
  await clearAllDirtyFlags();

  return { processed };
}

// =============================================================================
// Exports
// =============================================================================

export { ENTITY_TYPES };
