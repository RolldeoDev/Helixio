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

    // Step 3: Notify clients via SSE
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

  logger.info(
    {
      filesProcessed: result.filesProcessed,
      seriesProcessed: result.seriesProcessed,
      errorCount: result.errors.length,
    },
    'Post-apply invalidation complete'
  );

  // Step 3: Notify clients via SSE
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
// Exports
// =============================================================================

export default {
  invalidateFileMetadata,
  batchInvalidateFileMetadata,
  invalidateSeriesData,
  invalidateAfterApplyChanges,
};
