/**
 * Cache Invalidation Service
 *
 * Centralizes cache invalidation logic across all cache types.
 * Provides cascade invalidation for related data and integrates
 * with the existing dirty flag system.
 *
 * Invalidation triggers:
 * - Series CRUD operations
 * - Scanner completion
 * - Series merge operations
 * - Reading progress updates
 * - Metadata changes
 */

import { getDatabase } from '../database.service.js';
import { cacheService } from './cache.service.js';
import {
  invalidateSeriesIndices,
  updateSeriesInIndices,
  removeSeriesFromIndices,
} from './series-index.service.js';
import {
  invalidateContinueReading,
  invalidateContinueReadingForLibrary,
  invalidateContinueReadingForSeries,
} from './continue-reading-cache.service.js';
import { invalidateCover as invalidateCoverFromRedis } from './cover-cache.service.js';
import { invalidateQueryCache, invalidateSeriesMetadata } from './query-result-cache.service.js';
import { invalidateCountCache } from './count-cache.service.js';
import { createServiceLogger } from '../logger.service.js';
import { CACHE_KEY_PREFIX } from './cache.types.js';

const logger = createServiceLogger('cache-invalidation');

// =============================================================================
// Series Invalidation
// =============================================================================

/**
 * Invalidate all caches related to a series.
 * Called on series update, delete, hide, or merge.
 *
 * @param seriesId Series that changed
 */
export async function invalidateSeries(seriesId: string): Promise<void> {
  const db = getDatabase();

  // Get libraries this series belongs to
  const series = await db.series.findUnique({
    where: { id: seriesId },
    include: {
      issues: {
        select: { libraryId: true },
        distinct: ['libraryId'],
      },
    },
  });

  if (!series) {
    // Series was deleted - remove from indices
    // We don't know which libraries it was in, so invalidate all
    await invalidateSeriesIndices();
    await invalidateContinueReadingForSeries(seriesId);
    return;
  }

  const libraryIds = series.issues.map((i) => i.libraryId);

  // Invalidate series cover cache if series has a cover
  const coverInvalidationPromises: Promise<unknown>[] = [];
  if (series.coverHash) {
    coverInvalidationPromises.push(
      invalidateCoverFromRedis('series', series.coverHash).catch((err) => {
        logger.warn({ seriesId, coverHash: series.coverHash, error: err }, 'Failed to invalidate series cover from Redis');
      })
    );
  }
  if (series.resolvedCoverHash) {
    coverInvalidationPromises.push(
      invalidateCoverFromRedis('series', series.resolvedCoverHash).catch((err) => {
        logger.warn({ seriesId, coverHash: series.resolvedCoverHash, error: err }, 'Failed to invalidate resolved series cover from Redis');
      })
    );
  }

  await Promise.allSettled([
    // Update series in all indices (or remove if deleted/hidden)
    updateSeriesInIndices(seriesId, libraryIds),

    // Surgically invalidate continue reading (only affected users)
    invalidateContinueReadingForSeries(seriesId),

    // Clear any cached series data
    cacheService.delete(`${CACHE_KEY_PREFIX.SERIES_DATA}:${seriesId}`),

    // SURGICAL: Don't clear all browse pages for single series update
    // Let the 5-minute TTL naturally expire old data
    // Browse pages will be refreshed on next request
    // cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SERIES_BROWSE}:`), // REMOVED

    // SURGICAL: Don't invalidate all query result caches for single series
    // The 5-minute TTL will handle it, and we don't want to clear unrelated queries
    // invalidateQueryCache('series:'), // REMOVED
    // invalidateQueryCache('files:'), // REMOVED

    // SURGICAL: Don't invalidate count caches for metadata-only changes
    // Count caches only need invalidation when series are added/removed
    // invalidateCountCache('series'), // REMOVED
    // invalidateCountCache('files'), // REMOVED

    // Invalidate series metadata cache
    invalidateSeriesMetadata(seriesId),

    // Invalidate cover caches if covers changed
    ...coverInvalidationPromises,
  ]);

  logger.debug({ seriesId, libraryIds }, 'Series caches invalidated (surgical)');
}

/**
 * Invalidate caches when a series is deleted.
 * More aggressive than update - removes from all indices.
 *
 * @param seriesId Series that was deleted
 * @param libraryIds Libraries the series belonged to
 * @param coverHash Optional cover hash to invalidate (if known before deletion)
 * @param resolvedCoverHash Optional resolved cover hash to invalidate (if known before deletion)
 */
export async function invalidateSeriesDeleted(
  seriesId: string,
  libraryIds: string[],
  coverHash?: string | null,
  resolvedCoverHash?: string | null
): Promise<void> {
  // Invalidate cover caches if hashes were provided
  const coverInvalidationPromises: Promise<unknown>[] = [];
  if (coverHash) {
    coverInvalidationPromises.push(
      invalidateCoverFromRedis('series', coverHash).catch((err) => {
        logger.warn({ seriesId, coverHash, error: err }, 'Failed to invalidate deleted series cover from Redis');
      })
    );
  }
  if (resolvedCoverHash && resolvedCoverHash !== coverHash) {
    coverInvalidationPromises.push(
      invalidateCoverFromRedis('series', resolvedCoverHash).catch((err) => {
        logger.warn({ seriesId, coverHash: resolvedCoverHash, error: err }, 'Failed to invalidate deleted series resolved cover from Redis');
      })
    );
  }

  await Promise.allSettled([
    // Remove from all indices
    removeSeriesFromIndices(seriesId, libraryIds),

    // Invalidate continue reading
    invalidateContinueReadingForSeries(seriesId),

    // Clear cached series data
    cacheService.delete(`${CACHE_KEY_PREFIX.SERIES_DATA}:${seriesId}`),

    // Clear cached browse pages
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SERIES_BROWSE}:`),

    // Clear similar series caches
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SIMILAR_SERIES}:${seriesId}:`),

    // Clear recommendations cache
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.RECOMMENDATIONS}:`),

    // Invalidate cover caches
    ...coverInvalidationPromises,
  ]);

  logger.debug({ seriesId, libraryIds }, 'Deleted series caches invalidated');
}

/**
 * Invalidate caches when series are merged.
 * Both source and target series need invalidation.
 *
 * @param sourceSeriesId Series being merged from (will be deleted)
 * @param targetSeriesId Series being merged into
 * @param libraryIds Libraries affected by the merge
 */
export async function invalidateSeriesMerge(
  sourceSeriesId: string,
  targetSeriesId: string,
  libraryIds: string[]
): Promise<void> {
  const db = getDatabase();

  // Get cover hashes for both series to invalidate their cover caches
  const [sourceSeries, targetSeries] = await Promise.all([
    db.series.findUnique({
      where: { id: sourceSeriesId },
      select: { coverHash: true, resolvedCoverHash: true },
    }),
    db.series.findUnique({
      where: { id: targetSeriesId },
      select: { coverHash: true, resolvedCoverHash: true },
    }),
  ]);

  // Invalidate cover caches for both series
  const coverInvalidationPromises: Promise<unknown>[] = [];

  // Source series covers
  if (sourceSeries?.coverHash) {
    coverInvalidationPromises.push(
      invalidateCoverFromRedis('series', sourceSeries.coverHash).catch((err) => {
        logger.warn({ seriesId: sourceSeriesId, coverHash: sourceSeries.coverHash, error: err }, 'Failed to invalidate source series cover from Redis');
      })
    );
  }
  if (sourceSeries?.resolvedCoverHash) {
    coverInvalidationPromises.push(
      invalidateCoverFromRedis('series', sourceSeries.resolvedCoverHash).catch((err) => {
        logger.warn({ seriesId: sourceSeriesId, coverHash: sourceSeries.resolvedCoverHash, error: err }, 'Failed to invalidate source series resolved cover from Redis');
      })
    );
  }

  // Target series covers
  if (targetSeries?.coverHash) {
    coverInvalidationPromises.push(
      invalidateCoverFromRedis('series', targetSeries.coverHash).catch((err) => {
        logger.warn({ seriesId: targetSeriesId, coverHash: targetSeries.coverHash, error: err }, 'Failed to invalidate target series cover from Redis');
      })
    );
  }
  if (targetSeries?.resolvedCoverHash) {
    coverInvalidationPromises.push(
      invalidateCoverFromRedis('series', targetSeries.resolvedCoverHash).catch((err) => {
        logger.warn({ seriesId: targetSeriesId, coverHash: targetSeries.resolvedCoverHash, error: err }, 'Failed to invalidate target series resolved cover from Redis');
      })
    );
  }

  await Promise.allSettled([
    // Remove source series from indices
    removeSeriesFromIndices(sourceSeriesId, libraryIds),

    // Update target series in indices (issue count changed)
    updateSeriesInIndices(targetSeriesId, libraryIds),

    // Clear continue reading for both
    invalidateContinueReadingForSeries(sourceSeriesId),
    invalidateContinueReadingForSeries(targetSeriesId),

    // Clear cached series data
    cacheService.delete(`${CACHE_KEY_PREFIX.SERIES_DATA}:${sourceSeriesId}`),
    cacheService.delete(`${CACHE_KEY_PREFIX.SERIES_DATA}:${targetSeriesId}`),

    // Clear cached browse pages
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SERIES_BROWSE}:`),

    // Invalidate cover caches
    ...coverInvalidationPromises,
  ]);

  logger.debug({ sourceSeriesId, targetSeriesId, libraryIds }, 'Merged series caches invalidated');
}

// =============================================================================
// Library Invalidation
// =============================================================================

/**
 * Invalidate all caches for a library.
 * Called after scan completion or bulk operations.
 *
 * @param libraryId Library that changed
 */
export async function invalidateLibrary(libraryId: string): Promise<void> {
  await Promise.allSettled([
    // Invalidate series indices for this library
    invalidateSeriesIndices(libraryId),

    // Invalidate continue reading for all users in this library
    invalidateContinueReadingForLibrary(libraryId),

    // Clear cached browse pages for this library
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SERIES_BROWSE}:`),

    // Clear cached stats for this library
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.STATS}:${libraryId}`),
  ]);

  logger.info({ libraryId }, 'Library caches invalidated');
}

/**
 * Invalidate all library caches (global refresh).
 * Called after major operations like schema migrations.
 */
export async function invalidateAllLibraries(): Promise<void> {
  await Promise.allSettled([
    // Invalidate all series indices
    invalidateSeriesIndices(),

    // Clear all browse caches
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SERIES_BROWSE}:`),

    // Clear all stats
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.STATS}:`),
  ]);

  logger.info('All library caches invalidated');
}

// =============================================================================
// User Invalidation
// =============================================================================

/**
 * Invalidate all caches for a user.
 * Called when user data changes significantly.
 *
 * @param userId User whose caches should be invalidated
 */
export async function invalidateUser(userId: string): Promise<void> {
  await Promise.allSettled([
    // Invalidate continue reading
    invalidateContinueReading(userId),

    // Invalidate recommendations
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.RECOMMENDATIONS}:${userId}:`),

    // Invalidate similar series (user-specific)
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SIMILAR_SERIES}:*:${userId}`),

    // Invalidate user collections
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.COLLECTION}:${userId}:`),

    // Invalidate collection mosaics
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.COLLECTION_MOSAIC}:${userId}:`),
  ]);

  logger.debug({ userId }, 'User caches invalidated');
}

// =============================================================================
// Reading Progress Invalidation
// =============================================================================

/**
 * Invalidate caches when reading progress changes.
 * Called by reading-progress.service.ts on progress updates.
 *
 * @param userId User whose progress changed
 * @param fileId File that was read
 * @param libraryId Library containing the file
 */
export async function invalidateReadingProgress(
  userId: string,
  fileId: string,
  libraryId: string
): Promise<void> {
  // Get the file's seriesId to invalidate series metadata cache
  const db = getDatabase();
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    select: { seriesId: true },
  });

  await Promise.allSettled([
    // Invalidate continue reading for this user
    invalidateContinueReading(userId, libraryId),

    // Invalidate recommendations (reading affects recommendations)
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.RECOMMENDATIONS}:${userId}:`),

    // Invalidate series metadata cache (includes user-specific progress data)
    file?.seriesId ? invalidateSeriesMetadata(file.seriesId) : Promise.resolve(),
  ]);

  logger.debug(
    { userId, fileId, libraryId, seriesId: file?.seriesId },
    'Reading progress caches invalidated'
  );
}

/**
 * Invalidate caches when a file is marked complete.
 *
 * @param userId User who completed the file
 * @param fileId File that was completed
 * @param seriesId Series containing the file
 * @param libraryId Library containing the file
 */
export async function invalidateFileCompleted(
  userId: string,
  fileId: string,
  seriesId: string | null,
  libraryId: string
): Promise<void> {
  await Promise.allSettled([
    // Invalidate continue reading
    invalidateContinueReading(userId, libraryId),

    // Invalidate recommendations
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.RECOMMENDATIONS}:${userId}:`),

    // If part of a series, invalidate similar series cache
    seriesId
      ? cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SIMILAR_SERIES}:${seriesId}:`)
      : Promise.resolve(),
  ]);

  logger.debug({ userId, fileId, seriesId, libraryId }, 'File completion caches invalidated');
}

// =============================================================================
// Scan Invalidation
// =============================================================================

/**
 * Invalidate caches after a library scan completes.
 * This is the most aggressive invalidation - clears all related caches.
 *
 * @param libraryId Library that was scanned
 */
export async function invalidateAfterScan(libraryId: string): Promise<void> {
  await Promise.allSettled([
    // Invalidate series indices (files may have been added/removed)
    invalidateSeriesIndices(libraryId),

    // Invalidate all continue reading (new files may be available)
    invalidateContinueReadingForLibrary(libraryId),

    // Clear all browse pages (series list changed)
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SERIES_BROWSE}:`),

    // Clear stats (counts changed)
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.STATS}:${libraryId}`),
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.STATS}:all`),

    // Clear recommendations (new content available)
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.RECOMMENDATIONS}:`),

    // Invalidate all query result caches (series and files lists changed)
    invalidateQueryCache('series:'),
    invalidateQueryCache('files:'),

    // Invalidate all count caches (totals changed after scan)
    invalidateCountCache('series', libraryId),
    invalidateCountCache('files', libraryId),
  ]);

  logger.info({ libraryId }, 'Post-scan caches invalidated');
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Invalidate caches for multiple series at once.
 * More efficient than calling invalidateSeries() in a loop.
 *
 * @param seriesIds Series that changed
 */
export async function invalidateSeriesBulk(seriesIds: string[]): Promise<void> {
  if (seriesIds.length === 0) return;

  // For bulk operations, it's more efficient to just invalidate all indices
  // rather than updating each series individually
  await Promise.allSettled([
    // Invalidate all series indices
    invalidateSeriesIndices(),

    // Clear all browse pages
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.SERIES_BROWSE}:`),

    // Clear all continue reading (may contain affected series)
    cacheService.invalidatePattern(`${CACHE_KEY_PREFIX.CONTINUE_READING}:`),

    // Clear series data for affected series
    ...seriesIds.map((id) =>
      cacheService.delete(`${CACHE_KEY_PREFIX.SERIES_DATA}:${id}`)
    ),
  ]);

  logger.info({ count: seriesIds.length }, 'Bulk series caches invalidated');
}

/**
 * Clear all caches (nuclear option).
 * Use sparingly - for testing or major issues.
 */
export async function invalidateAll(): Promise<void> {
  await cacheService.invalidateAll();
  logger.warn('All caches invalidated');
}

// =============================================================================
// File Operations Invalidation
// =============================================================================

/**
 * Invalidate caches when a file is moved, renamed, or deleted.
 * Called by file-operations.service.ts after file operations complete.
 *
 * @param fileId File that was operated on
 * @param operationType Type of operation performed
 */
export async function invalidateFileOperation(
  fileId: string,
  operationType: 'move' | 'rename' | 'delete'
): Promise<void> {
  const db = getDatabase();

  // Get file details to determine what to invalidate
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      seriesId: true,
      hash: true,
      libraryId: true,
    },
  });

  if (!file) {
    // File already deleted, invalidate conservatively
    logger.debug({ fileId, operationType }, 'File not found, skipping file operation cache invalidation');
    return;
  }

  const coverInvalidationPromises: Promise<unknown>[] = [];

  // Invalidate archive cover cache (file hash changed or file deleted)
  if (file.hash) {
    coverInvalidationPromises.push(
      invalidateCoverFromRedis('archive', file.hash).catch((err) => {
        logger.warn({ fileId, hash: file.hash, error: err }, 'Failed to invalidate archive cover from Redis');
      })
    );
  }

  await Promise.allSettled([
    // Invalidate series if file belongs to one
    file.seriesId ? invalidateSeries(file.seriesId) : Promise.resolve(),

    // Invalidate continue reading (file path/name may have changed)
    file.seriesId
      ? invalidateContinueReadingForSeries(file.seriesId)
      : invalidateContinueReadingForLibrary(file.libraryId),

    // Invalidate archive cover cache
    ...coverInvalidationPromises,
  ]);

  logger.debug({ fileId, seriesId: file.seriesId, operationType }, 'File operation caches invalidated');
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

/**
 * Re-export continue reading invalidation functions for external use.
 * These are imported from continue-reading-cache.service.ts and re-exported
 * here so consumers only need to import from cache-invalidation.service.ts.
 */
export {
  invalidateContinueReading,
  invalidateContinueReadingForLibrary,
  invalidateContinueReadingForSeries,
} from './continue-reading-cache.service.js';
