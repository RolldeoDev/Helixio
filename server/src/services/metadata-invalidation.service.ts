/**
 * Metadata Invalidation Service
 *
 * Centralized service to handle cache invalidation and data synchronization
 * when metadata changes occur. This ensures all related data stays in sync
 * after metadata updates from any source (manual edits, metadata retriever, etc.).
 *
 * Entry points that trigger invalidation:
 * - Manual file metadata edits (PATCH /api/metadata/file/:fileId)
 * - Metadata approval workflow (applyChanges)
 * - Series updates (PATCH /api/series/:id)
 * - series.json updates (PUT/PATCH /api/metadata/series-json)
 */

import { getDatabase } from './database.service.js';
import { createServiceLogger } from './logger.service.js';
import { refreshMetadataCache, cacheFileMetadata } from './metadata-cache.service.js';
import { readComicInfo, ComicInfo } from './comicinfo.service.js';
import { syncSeriesToSeriesJson, updateSeriesProgress } from './series.service.js';
import { sendMetadataChange, sendSeriesRefresh, sendFileRefresh } from './sse.service.js';
import { autoLinkFileToSeries } from './series-matcher.service.js';
import { markDirtyForMetadataChange } from './stats-dirty.service.js';
import { triggerDirtyStatsProcessing } from './stats-scheduler.service.js';

const logger = createServiceLogger('metadata-invalidation');

// =============================================================================
// Types
// =============================================================================

export interface InvalidationResult {
  success: boolean;
  fileMetadataRefreshed?: boolean;
  seriesUpdated?: boolean;
  seriesJsonSynced?: boolean;
  relatedFilesUpdated?: number;
  errors?: string[];
}

export interface FileMetadataChangeEvent {
  fileId: string;
  previousSeriesName?: string | null;
  previousPublisher?: string | null;
  newComicInfo?: ComicInfo;
}

export interface SeriesChangeEvent {
  seriesId: string;
  changedFields: string[];
  syncToFiles?: boolean;
  syncToSeriesJson?: boolean;
}

// =============================================================================
// File Metadata Invalidation
// =============================================================================

/**
 * Invalidate and refresh all related data after a file's metadata changes.
 * Call this after writing ComicInfo.xml to an archive.
 */
export async function invalidateFileMetadata(
  fileId: string,
  options: {
    refreshFromArchive?: boolean;
    comicInfo?: ComicInfo;
    updateSeriesLinkage?: boolean;
  } = {}
): Promise<InvalidationResult> {
  const result: InvalidationResult = { success: true, errors: [] };
  const prisma = getDatabase();

  try {
    logger.debug({ fileId }, 'Invalidating file metadata');

    // Step 1: Refresh the FileMetadata cache
    if (options.refreshFromArchive !== false) {
      if (options.comicInfo) {
        // Use provided ComicInfo directly (more efficient)
        const cacheResult = await cacheFileMetadata(fileId, options.comicInfo);
        result.fileMetadataRefreshed = cacheResult.success;
        if (!cacheResult.success) {
          result.errors!.push(`Failed to cache metadata: ${cacheResult.error}`);
        }
      } else {
        // Read from archive and cache
        result.fileMetadataRefreshed = await refreshMetadataCache(fileId);
        if (!result.fileMetadataRefreshed) {
          result.errors!.push('Failed to refresh metadata cache from archive');
        }
      }
    }

    // Step 2: Update series linkage if needed
    if (options.updateSeriesLinkage !== false) {
      await updateFileSeriesLinkage(fileId, result);
    }

    result.success = result.errors!.length === 0;

    // Step 3: Mark stats as dirty for recalculation
    if (result.fileMetadataRefreshed) {
      await markDirtyForMetadataChange(fileId);
    }

    // Step 4: Notify clients via SSE
    if (result.success) {
      sendFileRefresh([fileId]);
      sendMetadataChange('file', {
        fileIds: [fileId],
        action: 'updated',
      });
    }
  } catch (error) {
    result.success = false;
    result.errors!.push(error instanceof Error ? error.message : String(error));
    logger.error({ fileId, error }, 'Failed to invalidate file metadata');
  }

  return result;
}

/**
 * Update the series linkage for a file based on its current metadata.
 * This function:
 * 1. Unlinks from current series if metadata no longer matches
 * 2. Updates the old series progress counts
 * 3. Links to existing matching series OR creates a new one
 * 4. Updates the new series progress counts
 */
async function updateFileSeriesLinkage(
  fileId: string,
  result: InvalidationResult
): Promise<void> {
  const prisma = getDatabase();

  // Get the file with its current metadata
  const file = await prisma.comicFile.findUnique({
    where: { id: fileId },
    include: { metadata: true, series: true },
  });

  if (!file || !file.metadata) {
    return;
  }

  const metadataSeriesName = file.metadata.series;
  const metadataPublisher = file.metadata.publisher;
  const oldSeriesId = file.seriesId;

  // If file has a series assigned, check if it still matches
  if (file.seriesId && file.series) {
    const seriesMatches =
      file.series.name === metadataSeriesName &&
      (file.series.publisher === metadataPublisher ||
        (!file.series.publisher && !metadataPublisher));

    if (!seriesMatches) {
      logger.info(
        {
          fileId,
          oldSeries: file.series.name,
          oldPublisher: file.series.publisher,
          newSeries: metadataSeriesName,
          newPublisher: metadataPublisher,
        },
        'File metadata series changed, unlinking from current series'
      );

      // Unlink from current series
      await prisma.comicFile.update({
        where: { id: fileId },
        data: { seriesId: null },
      });

      result.seriesUpdated = true;
    }
  }

  // Check if file needs to be linked to a series
  const currentFile = await prisma.comicFile.findUnique({
    where: { id: fileId },
    select: { seriesId: true },
  });

  // If file is now unlinked and has series metadata, find or create a series
  if (!currentFile?.seriesId && metadataSeriesName) {
    // Use autoLinkFileToSeries which handles:
    // - Finding existing matching series
    // - Creating new series if no match found
    const linkResult = await autoLinkFileToSeries(fileId);

    if (linkResult.success && linkResult.seriesId) {
      logger.info(
        {
          fileId,
          seriesId: linkResult.seriesId,
          matchType: linkResult.matchType,
        },
        linkResult.matchType === 'created'
          ? 'Created new series and linked file'
          : 'Linked file to existing series'
      );
      result.seriesUpdated = true;
    } else if (linkResult.needsConfirmation) {
      logger.info(
        { fileId, suggestions: linkResult.suggestions?.length },
        'File needs manual series confirmation'
      );
    } else {
      logger.warn(
        { fileId, error: linkResult.error },
        'Failed to auto-link file to series'
      );
    }
  }

  // Update progress for the old series if it changed
  if (oldSeriesId && result.seriesUpdated) {
    const newFile = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: { seriesId: true },
    });

    // If file moved to a different series, update the old series progress
    if (newFile?.seriesId !== oldSeriesId) {
      await updateSeriesProgress(oldSeriesId);
      logger.debug({ seriesId: oldSeriesId }, 'Updated old series progress');

      // Also notify clients about the old series being updated
      sendSeriesRefresh([oldSeriesId]);
    }
  }
}

/**
 * Batch invalidate metadata for multiple files.
 * More efficient than calling invalidateFileMetadata for each file.
 */
export async function batchInvalidateFileMetadata(
  fileIds: string[],
  options: {
    refreshFromArchive?: boolean;
    updateSeriesLinkage?: boolean;
  } = {}
): Promise<{
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ fileId: string; error: string }>;
}> {
  const results = {
    total: fileIds.length,
    successful: 0,
    failed: 0,
    errors: [] as Array<{ fileId: string; error: string }>,
  };

  for (const fileId of fileIds) {
    try {
      const result = await invalidateFileMetadata(fileId, options);
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push({
          fileId,
          error: result.errors?.join(', ') || 'Unknown error',
        });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        fileId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info(
    { total: results.total, successful: results.successful, failed: results.failed },
    'Batch metadata invalidation complete'
  );

  // Notify clients about the batch update
  if (results.successful > 0) {
    const successfulIds = fileIds.filter(
      (id) => !results.errors.some((e) => e.fileId === id)
    );
    sendFileRefresh(successfulIds);
    sendMetadataChange('batch', {
      fileIds: successfulIds,
      action: 'updated',
    });
  }

  return results;
}

// =============================================================================
// Series Invalidation
// =============================================================================

/**
 * Invalidate and sync related data after a series is updated.
 */
export async function invalidateSeriesData(
  seriesId: string,
  options: {
    syncToSeriesJson?: boolean;
    syncToIssueFiles?: boolean;
    inheritableFields?: string[];
  } = {}
): Promise<InvalidationResult> {
  const result: InvalidationResult = { success: true, errors: [] };
  const prisma = getDatabase();

  try {
    logger.debug({ seriesId }, 'Invalidating series data');

    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        issues: {
          select: { id: true, path: true },
        },
      },
    });

    if (!series) {
      result.success = false;
      result.errors!.push('Series not found');
      return result;
    }

    // Step 1: Sync to series.json if the series has a primary folder
    if (options.syncToSeriesJson !== false && series.primaryFolder) {
      try {
        await syncSeriesToSeriesJson(seriesId);
        result.seriesJsonSynced = true;
        logger.debug({ seriesId, folder: series.primaryFolder }, 'Synced series to series.json');
      } catch (error) {
        result.errors!.push(
          `Failed to sync series.json: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Step 2: Update inheritable fields in issue FileMetadata if requested
    if (options.syncToIssueFiles && options.inheritableFields?.length && series.issues.length > 0) {
      let updatedCount = 0;

      // Build the update data for FileMetadata based on inheritable fields
      const updateData: Record<string, unknown> = {};

      for (const field of options.inheritableFields) {
        switch (field) {
          case 'publisher':
            updateData.publisher = series.publisher;
            break;
          case 'genres':
            updateData.genre = series.genres;
            break;
          case 'ageRating':
            updateData.ageRating = series.ageRating;
            break;
          case 'languageISO':
            updateData.languageISO = series.languageISO;
            break;
          // Add more inheritable fields as needed
        }
      }

      if (Object.keys(updateData).length > 0) {
        const fileIds = series.issues.map((i) => i.id);

        const updateResult = await prisma.fileMetadata.updateMany({
          where: { comicId: { in: fileIds } },
          data: {
            ...updateData,
            seriesInherited: true,
            lastScanned: new Date(),
          },
        });

        updatedCount = updateResult.count;
        result.relatedFilesUpdated = updatedCount;

        logger.info(
          { seriesId, updatedCount, fields: options.inheritableFields },
          'Updated issue metadata from series'
        );

        // Mark stats as dirty for all updated files
        for (const fileId of fileIds) {
          await markDirtyForMetadataChange(fileId);
        }

        // Trigger immediate stats recalculation
        triggerDirtyStatsProcessing().catch((err) => {
          logger.error({ err }, 'Failed to trigger stats processing after series inheritance');
        });
      }
    }

    result.success = result.errors!.length === 0;

    // Step 3: Notify clients via SSE
    if (result.success) {
      sendSeriesRefresh([seriesId]);
      sendMetadataChange('series', {
        seriesIds: [seriesId],
        action: 'updated',
      });
    }
  } catch (error) {
    result.success = false;
    result.errors!.push(error instanceof Error ? error.message : String(error));
    logger.error({ seriesId, error }, 'Failed to invalidate series data');
  }

  return result;
}

// =============================================================================
// Combined Invalidation After Apply Changes
// =============================================================================

/**
 * Comprehensive invalidation after applying metadata changes from the approval workflow.
 * This should be called after applyChanges completes.
 */
export async function invalidateAfterApplyChanges(
  processedFiles: Array<{ fileId: string; success: boolean }>,
  affectedSeriesIds: Set<string>
): Promise<{
  filesProcessed: number;
  seriesProcessed: number;
  errors: string[];
}> {
  const result = {
    filesProcessed: 0,
    seriesProcessed: 0,
    errors: [] as string[],
  };

  const prisma = getDatabase();

  // Step 1: Refresh metadata cache for all successfully processed files
  const successfulFileIds = processedFiles
    .filter((f) => f.success)
    .map((f) => f.fileId);

  if (successfulFileIds.length > 0) {
    logger.info({ count: successfulFileIds.length }, 'Refreshing metadata cache for processed files');

    for (const fileId of successfulFileIds) {
      try {
        const refreshed = await refreshMetadataCache(fileId);
        if (refreshed) {
          result.filesProcessed++;
        } else {
          result.errors.push(`Failed to refresh cache for file ${fileId}`);
        }
      } catch (error) {
        result.errors.push(
          `Error refreshing file ${fileId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  // Step 1.5: Update series linkage for files whose series name may have changed
  // This handles creating new series when metadata changes the series name
  if (successfulFileIds.length > 0) {
    logger.info({ count: successfulFileIds.length }, 'Updating series linkage for processed files');

    const newlyAffectedSeriesIds = new Set<string>();

    for (const fileId of successfulFileIds) {
      try {
        // Get the file's current series ID before updating linkage
        // so we can track both old and new series for progress updates
        const fileBefore = await prisma.comicFile.findUnique({
          where: { id: fileId },
          select: { seriesId: true },
        });
        const oldSeriesId = fileBefore?.seriesId;

        // Create a temporary result object for updateFileSeriesLinkage
        const linkageResult: InvalidationResult = { success: true, errors: [] };
        await updateFileSeriesLinkage(fileId, linkageResult);

        if (linkageResult.seriesUpdated) {
          // Track the old series for progress updates
          if (oldSeriesId) {
            newlyAffectedSeriesIds.add(oldSeriesId);
          }

          // Get the file's new series ID to add to affected series
          const fileAfter = await prisma.comicFile.findUnique({
            where: { id: fileId },
            select: { seriesId: true },
          });
          if (fileAfter?.seriesId) {
            newlyAffectedSeriesIds.add(fileAfter.seriesId);
          }
        }

        if (linkageResult.errors && linkageResult.errors.length > 0) {
          result.errors.push(...linkageResult.errors);
        }
      } catch (error) {
        result.errors.push(
          `Error updating series linkage for file ${fileId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Add newly affected series to the set
    for (const seriesId of newlyAffectedSeriesIds) {
      affectedSeriesIds.add(seriesId);
    }
  }

  // Step 2: Update series progress for affected series
  for (const seriesId of affectedSeriesIds) {
    try {
      // Update series progress counts
      const { updateSeriesProgress } = await import('./series.service.js');
      await updateSeriesProgress(seriesId);
      result.seriesProcessed++;
    } catch (error) {
      result.errors.push(
        `Error updating series ${seriesId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Step 3: Mark stats as dirty and trigger recalculation
  if (successfulFileIds.length > 0) {
    for (const fileId of successfulFileIds) {
      await markDirtyForMetadataChange(fileId);
    }

    // Trigger immediate stats recalculation
    triggerDirtyStatsProcessing().catch((err) => {
      logger.error({ err }, 'Failed to trigger stats processing after apply changes');
    });
  }

  logger.info(
    {
      filesProcessed: result.filesProcessed,
      seriesProcessed: result.seriesProcessed,
      errorCount: result.errors.length,
    },
    'Post-apply invalidation complete'
  );

  // Step 4: Notify clients via SSE
  if (successfulFileIds.length > 0) {
    sendFileRefresh(successfulFileIds);
    sendMetadataChange('batch', {
      fileIds: successfulFileIds,
      action: 'updated',
    });
  }

  if (affectedSeriesIds.size > 0) {
    const seriesIdsArray = Array.from(affectedSeriesIds);
    sendSeriesRefresh(seriesIdsArray);
    sendMetadataChange('series', {
      seriesIds: seriesIdsArray,
      action: 'updated',
    });
  }

  return result;
}

// =============================================================================
// Series Linkage Repair
// =============================================================================

export interface RepairResult {
  totalMismatched: number;
  repaired: number;
  newSeriesCreated: number;
  errors: string[];
  details: Array<{
    fileId: string;
    fileName: string;
    oldSeriesName: string | null;
    newSeriesName: string | null;
    action: 'relinked' | 'created' | 'error';
    error?: string;
  }>;
}

/**
 * Find files where the FileMetadata.series doesn't match the linked Series.name.
 * These are candidates for repair.
 */
export async function findMismatchedSeriesFiles(): Promise<Array<{
  fileId: string;
  fileName: string;
  metadataSeries: string | null;
  linkedSeriesName: string | null;
  linkedSeriesId: string | null;
}>> {
  const prisma = getDatabase();

  // Get all files with their metadata and linked series
  const files = await prisma.comicFile.findMany({
    where: {
      metadata: {
        isNot: null,
      },
    },
    include: {
      metadata: {
        select: {
          series: true,
        },
      },
      series: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const mismatched: Array<{
    fileId: string;
    fileName: string;
    metadataSeries: string | null;
    linkedSeriesName: string | null;
    linkedSeriesId: string | null;
  }> = [];

  for (const file of files) {
    const metadataSeries = file.metadata?.series || null;
    const linkedSeriesName = file.series?.name || null;

    // Check for mismatch:
    // 1. File has metadata series but no linked series
    // 2. File has metadata series that differs from linked series name
    if (metadataSeries) {
      if (!file.seriesId) {
        // Has metadata series but not linked to any series
        mismatched.push({
          fileId: file.id,
          fileName: file.filename,
          metadataSeries,
          linkedSeriesName: null,
          linkedSeriesId: null,
        });
      } else if (linkedSeriesName && linkedSeriesName !== metadataSeries) {
        // Linked to wrong series
        mismatched.push({
          fileId: file.id,
          fileName: file.filename,
          metadataSeries,
          linkedSeriesName,
          linkedSeriesId: file.seriesId,
        });
      }
    }
  }

  return mismatched;
}

/**
 * Repair mismatched series linkages.
 * This re-links files to the correct series based on their FileMetadata.series,
 * creating new series if needed.
 */
export async function repairSeriesLinkages(
  onProgress?: (current: number, total: number, message: string) => void
): Promise<RepairResult> {
  const prisma = getDatabase();
  const result: RepairResult = {
    totalMismatched: 0,
    repaired: 0,
    newSeriesCreated: 0,
    errors: [],
    details: [],
  };

  // Find all mismatched files
  const mismatched = await findMismatchedSeriesFiles();
  result.totalMismatched = mismatched.length;

  if (mismatched.length === 0) {
    logger.info('No mismatched series linkages found');
    return result;
  }

  logger.info({ count: mismatched.length }, 'Found mismatched series linkages to repair');

  // Track affected series for progress updates
  const affectedSeriesIds = new Set<string>();

  for (let i = 0; i < mismatched.length; i++) {
    const file = mismatched[i]!;

    if (onProgress) {
      onProgress(i + 1, mismatched.length, `Repairing: ${file.fileName}`);
    }

    try {
      // Track old series for progress update
      if (file.linkedSeriesId) {
        affectedSeriesIds.add(file.linkedSeriesId);
      }

      // Use autoLinkFileToSeries which handles finding or creating the series
      const linkResult = await autoLinkFileToSeries(file.fileId);

      if (linkResult.success && linkResult.seriesId) {
        affectedSeriesIds.add(linkResult.seriesId);

        const isNewSeries = linkResult.matchType === 'created';
        if (isNewSeries) {
          result.newSeriesCreated++;
        }

        // Get the new series name for logging
        const newSeries = await prisma.series.findUnique({
          where: { id: linkResult.seriesId },
          select: { name: true },
        });

        result.repaired++;
        result.details.push({
          fileId: file.fileId,
          fileName: file.fileName,
          oldSeriesName: file.linkedSeriesName,
          newSeriesName: newSeries?.name || null,
          action: isNewSeries ? 'created' : 'relinked',
        });

        logger.info(
          {
            fileId: file.fileId,
            fileName: file.fileName,
            oldSeries: file.linkedSeriesName,
            newSeries: newSeries?.name,
            action: isNewSeries ? 'created' : 'relinked',
          },
          'Repaired series linkage'
        );
      } else {
        const errorMsg = linkResult.error || 'Unknown error';
        result.errors.push(`${file.fileName}: ${errorMsg}`);
        result.details.push({
          fileId: file.fileId,
          fileName: file.fileName,
          oldSeriesName: file.linkedSeriesName,
          newSeriesName: null,
          action: 'error',
          error: errorMsg,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`${file.fileName}: ${errorMsg}`);
      result.details.push({
        fileId: file.fileId,
        fileName: file.fileName,
        oldSeriesName: file.linkedSeriesName,
        newSeriesName: null,
        action: 'error',
        error: errorMsg,
      });
      logger.error({ fileId: file.fileId, error }, 'Error repairing series linkage');
    }
  }

  // Update progress for all affected series
  for (const seriesId of affectedSeriesIds) {
    try {
      await updateSeriesProgress(seriesId);
    } catch (error) {
      logger.warn({ seriesId, error }, 'Failed to update series progress after repair');
    }
  }

  // Send SSE notifications
  if (affectedSeriesIds.size > 0) {
    const seriesIdsArray = Array.from(affectedSeriesIds);
    sendSeriesRefresh(seriesIdsArray);
    sendMetadataChange('series', {
      seriesIds: seriesIdsArray,
      action: 'updated',
    });
  }

  logger.info(
    {
      totalMismatched: result.totalMismatched,
      repaired: result.repaired,
      newSeriesCreated: result.newSeriesCreated,
      errors: result.errors.length,
    },
    'Series linkage repair complete'
  );

  return result;
}

/**
 * Update a file's metadata to match its currently linked series.
 * Use this when the file is in the correct series but the metadata is wrong.
 */
export async function syncFileMetadataToSeries(fileId: string): Promise<{
  success: boolean;
  oldSeriesName: string | null;
  newSeriesName: string | null;
  error?: string;
}> {
  const prisma = getDatabase();

  try {
    // Get file with its linked series
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      include: {
        series: true,
        metadata: true,
      },
    });

    if (!file) {
      return { success: false, oldSeriesName: null, newSeriesName: null, error: 'File not found' };
    }

    if (!file.series) {
      return { success: false, oldSeriesName: null, newSeriesName: null, error: 'File is not linked to a series' };
    }

    const oldSeriesName = file.metadata?.series || null;
    const newSeriesName = file.series.name;

    // Update the FileMetadata.series to match the linked series
    await prisma.fileMetadata.update({
      where: { comicId: fileId },
      data: {
        series: newSeriesName,
        lastScanned: new Date(),
      },
    });

    // Also update the ComicInfo.xml in the archive
    const { mergeComicInfo } = await import('./comicinfo.service.js');
    await mergeComicInfo(file.path, { Series: newSeriesName });

    logger.info(
      { fileId, oldSeriesName, newSeriesName },
      'Synced file metadata to match linked series'
    );

    // Notify clients
    sendFileRefresh([fileId]);

    return { success: true, oldSeriesName, newSeriesName };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ fileId, error }, 'Failed to sync file metadata to series');
    return { success: false, oldSeriesName: null, newSeriesName: null, error: errorMsg };
  }
}

/**
 * Batch sync file metadata to match their linked series.
 */
export async function batchSyncFileMetadataToSeries(fileIds: string[]): Promise<{
  total: number;
  synced: number;
  errors: string[];
  details: Array<{
    fileId: string;
    oldSeriesName: string | null;
    newSeriesName: string | null;
    success: boolean;
    error?: string;
  }>;
}> {
  const result = {
    total: fileIds.length,
    synced: 0,
    errors: [] as string[],
    details: [] as Array<{
      fileId: string;
      oldSeriesName: string | null;
      newSeriesName: string | null;
      success: boolean;
      error?: string;
    }>,
  };

  for (const fileId of fileIds) {
    const syncResult = await syncFileMetadataToSeries(fileId);
    result.details.push({
      fileId,
      ...syncResult,
    });

    if (syncResult.success) {
      result.synced++;
    } else {
      result.errors.push(`${fileId}: ${syncResult.error}`);
    }
  }

  logger.info(
    { total: result.total, synced: result.synced, errors: result.errors.length },
    'Batch sync file metadata to series complete'
  );

  return result;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  invalidateFileMetadata,
  batchInvalidateFileMetadata,
  invalidateSeriesData,
  invalidateAfterApplyChanges,
  findMismatchedSeriesFiles,
  repairSeriesLinkages,
  syncFileMetadataToSeries,
  batchSyncFileMetadataToSeries,
};
