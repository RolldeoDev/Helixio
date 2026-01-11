/**
 * Library Cleanup Service
 *
 * Handles comprehensive cleanup when a library is deleted.
 * Performs cleanup in the following order:
 *
 * 1. File System Cleanup (outside transaction)
 *    - Cover cache: ~/.helixio/cache/covers/{libraryId}/
 *    - Thumbnail cache: ~/.helixio/cache/thumbnails/{libraryId}/
 *
 * 2. Pre-Delete Database Cleanup (within transaction)
 *    - Batch operations referencing library
 *    - User library access records
 *    - API key library scopes (JSON array filtering)
 *    - Smart collection dirty flags for files in library
 *    - Collection items referencing files in library
 *
 * 3. Library Deletion (cascades via Prisma)
 *    - Library record
 *    - ComicFile records (cascade)
 *    - FileMetadata, ReadingProgress, etc. (cascade)
 *    - LibraryScanJob, LibraryReaderSettings, etc. (cascade)
 *
 * 4. Post-Delete Cleanup (within same transaction)
 *    - Orphaned series (soft delete - set deletedAt)
 *    - Collection items for orphaned series (mark unavailable)
 *    - Series similarity records for orphaned series
 *
 * Error Handling:
 * - Uses best-effort within Prisma transaction
 * - Continues on individual step failures
 * - Collects errors for reporting
 * - Returns detailed statistics per step
 */

import type { PrismaClient } from '@prisma/client';
import { getDatabase } from '../database.service.js';
import { deleteLibraryCovers } from '../cover.service.js';
import { deleteLibraryThumbnails } from '../thumbnail.service.js';
import { logInfo, logError, logWarn } from '../logger.service.js';
import { invalidateAfterScan } from '../cache/cache-invalidation.service.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a single cleanup step with statistics.
 */
export interface CleanupStepResult {
  stepName: string;
  success: boolean;
  itemsProcessed: number;
  errors: string[];
  durationMs: number;
  orphanedIds?: string[]; // For orphaned series step - IDs that were soft-deleted
}

/**
 * Complete library deletion result with all cleanup statistics.
 */
export interface LibraryDeletionResult {
  success: boolean;
  libraryId: string;
  libraryName: string;
  totalDurationMs: number;
  steps: CleanupStepResult[];
  summary: {
    totalItemsProcessed: number;
    totalErrors: number;
    failedSteps: string[];
  };
}

/**
 * Options for library deletion.
 */
export interface LibraryDeletionOptions {
  libraryId: string;
  skipFileSystemCleanup?: boolean; // For testing or selective cleanup
}

// Type for Prisma transaction client
type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

// =============================================================================
// Main Cleanup Function
// =============================================================================

/**
 * Delete a library and perform comprehensive cleanup.
 *
 * @param options - Deletion options including libraryId
 * @returns Detailed result with statistics per cleanup step
 * @throws Error if library does not exist
 */
export async function deleteLibraryWithCleanup(
  options: LibraryDeletionOptions
): Promise<LibraryDeletionResult> {
  const { libraryId, skipFileSystemCleanup = false } = options;
  const startTime = Date.now();
  const db = getDatabase();
  const steps: CleanupStepResult[] = [];

  // Validate library exists
  const library = await db.library.findUnique({
    where: { id: libraryId },
    select: { id: true, name: true },
  });

  if (!library) {
    throw new Error(`Library not found: ${libraryId}`);
  }

  logInfo('library-cleanup', `Starting cleanup for library: ${library.name}`, {
    libraryId,
  });

  // Track orphaned series IDs for similarity cleanup
  let orphanedSeriesIds: string[] = [];

  // Track whether transaction succeeded (for cache invalidation)
  let transactionSucceeded = false;

  // Steps 1-7: Database cleanup within transaction
  // NOTE: Filesystem cleanup happens AFTER transaction to prevent inconsistent state
  // if the transaction fails.
  try {
    await db.$transaction(async (tx) => {
      // Collect file IDs before deletion (needed for cleanup)
      const fileIds = await tx.comicFile
        .findMany({
          where: { libraryId },
          select: { id: true },
        })
        .then((files) => files.map((f) => f.id));

      // Collect series IDs that may become orphaned
      const potentialOrphanSeriesIds = await tx.series
        .findMany({
          where: {
            deletedAt: null,
            issues: {
              some: { libraryId },
            },
          },
          select: { id: true },
        })
        .then((series) => series.map((s) => s.id));

      // Step 1: Clean batch operations
      const batchStep = await cleanupBatchOperations(libraryId, tx);
      steps.push(batchStep);

      // Step 2: Clean user library access
      const accessStep = await cleanupUserLibraryAccess(libraryId, tx);
      steps.push(accessStep);

      // Step 3: Clean API key scopes
      const apiKeyStep = await cleanupApiKeyScopes(libraryId, tx);
      steps.push(apiKeyStep);

      // Step 4: Clean smart collection dirty flags
      const dirtyFlagStep = await cleanupSmartCollectionFlags(fileIds, tx);
      steps.push(dirtyFlagStep);

      // Step 5: Clean collection items for files
      const collectionStep = await cleanupCollectionItems(fileIds, tx);
      steps.push(collectionStep);

      // Step 6: Delete library (cascades to ComicFile and related records)
      await tx.library.delete({
        where: { id: libraryId },
      });
      logInfo('library-cleanup', 'Library deleted (Prisma cascade applied)', {
        libraryId,
        filesDeleted: fileIds.length,
      });

      // Step 7: Soft delete orphaned series (series with no remaining files)
      const orphanedStep = await cleanupOrphanedSeries(potentialOrphanSeriesIds, tx);
      steps.push(orphanedStep);
      orphanedSeriesIds = orphanedStep.orphanedIds || [];

      // Step 8: Clean series similarity for orphaned series only
      const similarityStep = await cleanupSeriesSimilarity(orphanedSeriesIds, tx);
      steps.push(similarityStep);
    });

    // Mark transaction as successful
    transactionSucceeded = true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logError('library-cleanup', error, { libraryId, phase: 'transaction' });

    // Add transaction failure to steps
    steps.push({
      stepName: 'Database Transaction',
      success: false,
      itemsProcessed: 0,
      errors: [`Transaction failed: ${errorMsg}`],
      durationMs: 0,
    });
  }

  // Step 9: Delete file system caches (AFTER transaction success)
  // This ensures we don't delete caches if the database transaction failed,
  // which would leave an inconsistent state.
  if (!skipFileSystemCleanup) {
    const cacheStep = await cleanupFileSystemCaches(libraryId);
    steps.push(cacheStep);
  }

  // Invalidate all library caches after BOTH database and filesystem cleanup
  // Fire-and-forget: cache failures won't block deletion result
  // invalidateAfterScan is used (instead of invalidateLibrary) because library deletion
  // is an "inverse scan" - removing all content requires aggressive cache clearing
  // This runs after filesystem cleanup to prevent users from seeing cached references
  // to cover files that are mid-deletion
  if (transactionSucceeded) {
    invalidateAfterScan(libraryId).catch(() => {
      // Errors are logged inside invalidateAfterScan
    });
  }

  // Calculate summary
  const totalDurationMs = Date.now() - startTime;
  const summary = {
    totalItemsProcessed: steps.reduce((sum, s) => sum + s.itemsProcessed, 0),
    totalErrors: steps.reduce((sum, s) => sum + s.errors.length, 0),
    failedSteps: steps.filter((s) => !s.success).map((s) => s.stepName),
  };

  const result: LibraryDeletionResult = {
    success: summary.failedSteps.length === 0,
    libraryId,
    libraryName: library.name,
    totalDurationMs,
    steps,
    summary,
  };

  logInfo('library-cleanup', 'Cleanup completed', {
    libraryId,
    libraryName: library.name,
    durationMs: totalDurationMs,
    success: result.success,
    totalItemsProcessed: summary.totalItemsProcessed,
    totalErrors: summary.totalErrors,
  });

  return result;
}

// =============================================================================
// Cleanup Step Functions
// =============================================================================

/**
 * Delete file system caches (covers and thumbnails).
 */
async function cleanupFileSystemCaches(libraryId: string): Promise<CleanupStepResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let itemsProcessed = 0;

  try {
    // Delete covers
    const coverResult = await deleteLibraryCovers(libraryId);
    itemsProcessed += coverResult.deleted;
    if (coverResult.errors > 0) {
      errors.push(`Cover deletion: ${coverResult.errors} errors`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Cover cleanup failed: ${msg}`);
    logError('library-cleanup', error, { step: 'covers', libraryId });
  }

  try {
    // Delete thumbnails
    const thumbResult = await deleteLibraryThumbnails(libraryId);
    itemsProcessed += thumbResult.deleted;
    if (thumbResult.errors > 0) {
      errors.push(`Thumbnail deletion: ${thumbResult.errors} errors`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Thumbnail cleanup failed: ${msg}`);
    logError('library-cleanup', error, { step: 'thumbnails', libraryId });
  }

  return {
    stepName: 'File System Caches',
    success: errors.length === 0,
    itemsProcessed,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Delete batch operations referencing this library.
 */
async function cleanupBatchOperations(
  libraryId: string,
  tx: TransactionClient
): Promise<CleanupStepResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let itemsProcessed = 0;

  try {
    const result = await tx.batchOperation.deleteMany({
      where: { libraryId },
    });
    itemsProcessed = result.count;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Batch operations cleanup failed: ${msg}`);
    logError('library-cleanup', error, { step: 'batchOperations', libraryId });
  }

  return {
    stepName: 'Batch Operations',
    success: errors.length === 0,
    itemsProcessed,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Delete user library access records.
 */
async function cleanupUserLibraryAccess(
  libraryId: string,
  tx: TransactionClient
): Promise<CleanupStepResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let itemsProcessed = 0;

  try {
    const result = await tx.userLibraryAccess.deleteMany({
      where: { libraryId },
    });
    itemsProcessed = result.count;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`User library access cleanup failed: ${msg}`);
    logError('library-cleanup', error, { step: 'userLibraryAccess', libraryId });
  }

  return {
    stepName: 'User Library Access',
    success: errors.length === 0,
    itemsProcessed,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Clean up API key scopes by removing the deleted libraryId from libraryIds arrays.
 */
async function cleanupApiKeyScopes(
  libraryId: string,
  tx: TransactionClient
): Promise<CleanupStepResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let itemsProcessed = 0;

  try {
    // Find API keys with library restrictions
    const apiKeys = await tx.apiKey.findMany({
      where: {
        libraryIds: { not: null },
      },
      select: { id: true, libraryIds: true },
    });

    for (const key of apiKeys) {
      try {
        if (!key.libraryIds) continue;

        const parsed = JSON.parse(key.libraryIds);

        // Validate it's actually an array of strings
        if (!Array.isArray(parsed)) {
          errors.push(`API key ${key.id}: libraryIds is not an array`);
          continue;
        }

        const libraryIds = parsed as string[];
        const filtered = libraryIds.filter((id) => id !== libraryId);

        // Only update if we removed something
        if (filtered.length !== libraryIds.length) {
          await tx.apiKey.update({
            where: { id: key.id },
            data: {
              libraryIds: filtered.length > 0 ? JSON.stringify(filtered) : null,
            },
          });
          itemsProcessed++;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`API key ${key.id}: ${msg}`);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`API key scope cleanup failed: ${msg}`);
    logError('library-cleanup', error, { step: 'apiKeyScopes', libraryId });
  }

  return {
    stepName: 'API Key Scopes',
    success: errors.length === 0,
    itemsProcessed,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Delete smart collection dirty flags for files in the library.
 */
async function cleanupSmartCollectionFlags(
  fileIds: string[],
  tx: TransactionClient
): Promise<CleanupStepResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let itemsProcessed = 0;

  if (fileIds.length === 0) {
    return {
      stepName: 'Smart Collection Flags',
      success: true,
      itemsProcessed: 0,
      errors: [],
      durationMs: Date.now() - startTime,
    };
  }

  try {
    const result = await tx.smartCollectionDirtyFlag.deleteMany({
      where: {
        fileId: { in: fileIds },
      },
    });
    itemsProcessed = result.count;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Smart collection flags cleanup failed: ${msg}`);
    logError('library-cleanup', error, { step: 'smartCollectionFlags' });
  }

  return {
    stepName: 'Smart Collection Flags',
    success: errors.length === 0,
    itemsProcessed,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Delete collection items referencing files from the library.
 */
async function cleanupCollectionItems(
  fileIds: string[],
  tx: TransactionClient
): Promise<CleanupStepResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let itemsProcessed = 0;

  if (fileIds.length === 0) {
    return {
      stepName: 'Collection Items (Files)',
      success: true,
      itemsProcessed: 0,
      errors: [],
      durationMs: Date.now() - startTime,
    };
  }

  try {
    const result = await tx.collectionItem.deleteMany({
      where: {
        fileId: { in: fileIds },
      },
    });
    itemsProcessed = result.count;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Collection items cleanup failed: ${msg}`);
    logError('library-cleanup', error, { step: 'collectionItems' });
  }

  return {
    stepName: 'Collection Items (Files)',
    success: errors.length === 0,
    itemsProcessed,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Soft delete orphaned series (series with no remaining files).
 * Also marks collection items for these series as unavailable.
 * Returns the IDs of successfully orphaned series for similarity cleanup.
 */
async function cleanupOrphanedSeries(
  potentialOrphanSeriesIds: string[],
  tx: TransactionClient
): Promise<CleanupStepResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let itemsProcessed = 0;
  const orphanedIds: string[] = [];

  if (potentialOrphanSeriesIds.length === 0) {
    return {
      stepName: 'Orphaned Series',
      success: true,
      itemsProcessed: 0,
      errors: [],
      durationMs: Date.now() - startTime,
      orphanedIds: [],
    };
  }

  try {
    // Find series that now have no files
    const orphanedSeries = await tx.series.findMany({
      where: {
        id: { in: potentialOrphanSeriesIds },
        deletedAt: null,
        issues: {
          none: {},
        },
      },
      select: { id: true, name: true },
    });

    for (const series of orphanedSeries) {
      try {
        // Soft delete the series
        await tx.series.update({
          where: { id: series.id },
          data: { deletedAt: new Date() },
        });

        // Mark collection items as unavailable
        await tx.collectionItem.updateMany({
          where: { seriesId: series.id },
          data: { isAvailable: false },
        });

        itemsProcessed++;
        orphanedIds.push(series.id);
        logInfo('library-cleanup', `Soft deleted orphaned series: ${series.name}`, {
          seriesId: series.id,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Series ${series.name}: ${msg}`);
        logWarn('library-cleanup', `Failed to soft delete series: ${series.name}`, {
          seriesId: series.id,
          error: msg,
        });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Orphaned series cleanup failed: ${msg}`);
    logError('library-cleanup', error, { step: 'orphanedSeries' });
  }

  return {
    stepName: 'Orphaned Series',
    success: errors.length === 0,
    itemsProcessed,
    errors,
    durationMs: Date.now() - startTime,
    orphanedIds,
  };
}

/**
 * Delete series similarity records for orphaned series.
 * Only cleans up similarity for the specific series that were just orphaned,
 * not all soft-deleted series in the database.
 */
async function cleanupSeriesSimilarity(
  orphanedSeriesIds: string[],
  tx: TransactionClient
): Promise<CleanupStepResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let itemsProcessed = 0;

  if (orphanedSeriesIds.length === 0) {
    return {
      stepName: 'Series Similarity',
      success: true,
      itemsProcessed: 0,
      errors: [],
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Delete similarity records involving the orphaned series
    const result = await tx.seriesSimilarity.deleteMany({
      where: {
        OR: [
          { sourceSeriesId: { in: orphanedSeriesIds } },
          { targetSeriesId: { in: orphanedSeriesIds } },
        ],
      },
    });
    itemsProcessed = result.count;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Series similarity cleanup failed: ${msg}`);
    logError('library-cleanup', error, { step: 'seriesSimilarity' });
  }

  return {
    stepName: 'Series Similarity',
    success: errors.length === 0,
    itemsProcessed,
    errors,
    durationMs: Date.now() - startTime,
  };
}
