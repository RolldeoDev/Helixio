/**
 * Metadata Approval - Apply Changes
 *
 * Handles applying approved changes to files (Phase 3).
 */

import { dirname } from 'path';
import { getDatabase } from '../database.service.js';
import { createServiceLogger } from '../logger.service.js';
import { readComicInfo, mergeComicInfo, type ComicInfo } from '../comicinfo.service.js';
import { convertCbrToCbz } from '../conversion.service.js';
import {
  generateUniqueFilename,
  needsRename,
  generateUniqueFilenameFromTemplate,
} from '../filename-generator.service.js';
import { renameFile, renameFileWithTracking, moveFileWithTracking } from '../file-operations.service.js';
import {
  writeSeriesJson,
  writeMixedSeriesCache,
  type SeriesMetadata,
  type MixedSeriesCache,
  type CachedSeriesMatch,
} from '../series-metadata.service.js';
import { normalizeSeriesName } from './helpers.js';
import { SeriesCache } from '../series-cache.service.js';
import * as comicVine from '../comicvine.service.js';
import { getSeriesMetadata } from '../metadata-search.service.js';
import { applyMetadataToSeries, type SeriesMetadataPayload } from '../series-metadata-fetch.service.js';
import {
  aggregateCreatorRolesFromIssues,
  creatorsToJson,
  creatorsToRoleFields,
  hasAnyCreators,
} from '../creator-aggregation.service.js';
import { getSession, setSession, deleteSessionFromStore } from './session-store.js';
import { invalidateAfterApplyChanges } from '../metadata-invalidation.service.js';
import { markDirtyForMetadataChange } from '../stats-dirty.service.js';
import { syncSeriesRatings, syncSeriesIssueRatings } from '../rating-sync.service.js';
import { syncSeriesReviews } from '../review-sync.service.js';
import {
  NON_COMICINFO_FIELDS,
  type ApprovalSession,
  type ApplyResult,
  type ApplyChangesResult,
  type ProgressCallback,
  type FileChange,
} from './types.js';

const logger = createServiceLogger('metadata-approval-apply');

// =============================================================================
// Publisher Normalization Helper
// =============================================================================

/**
 * Determine the authoritative publisher for a session.
 *
 * Priority:
 * 1. Provider's selected series publisher (authoritative)
 * 2. Most common non-null publisher from file changes
 * 3. null if all sources have no publisher
 *
 * Returns undefined only if there are no file changes with publisher fields.
 */
function determineAuthoritativePublisher(
  session: ApprovalSession
): string | null | undefined {
  // Priority 1: Use provider's selected series publisher if available
  for (const group of session.seriesGroups) {
    if (group.selectedSeries?.publisher) {
      return group.selectedSeries.publisher;
    }
  }

  // Priority 2: Fall back to most common publisher from file changes
  const publisherValues: (string | null)[] = [];

  for (const fc of session.fileChanges) {
    if (fc.status === 'rejected') continue;
    const publisherField = fc.fields.publisher;
    if (publisherField && publisherField.approved) {
      const value = publisherField.edited && publisherField.editedValue !== undefined
        ? publisherField.editedValue
        : publisherField.proposed;
      publisherValues.push(value as string | null);
    }
  }

  if (publisherValues.length === 0) return undefined;

  // Count occurrences of each publisher
  const counts = new Map<string | null, number>();
  for (const p of publisherValues) {
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }

  // Return the most common value (prefer non-null values in case of tie)
  let mostCommon: string | null = null;
  let maxCount = 0;
  for (const [value, count] of counts) {
    if (count > maxCount || (count === maxCount && value !== null && mostCommon === null)) {
      maxCount = count;
      mostCommon = value;
    }
  }

  return mostCommon;
}

// =============================================================================
// Apply Changes
// =============================================================================

/**
 * Apply approved changes to files
 * Automatically converts CBR files to CBZ before applying metadata.
 */
export async function applyChanges(
  sessionId: string,
  onProgress?: ProgressCallback
): Promise<ApplyChangesResult> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  session.status = 'applying';
  session.updatedAt = new Date();
  setSession(session);

  const progress = onProgress || (() => {});
  const results: ApplyResult[] = [];
  const prisma = getDatabase();

  let convertedCount = 0;
  let conversionFailedCount = 0;

  // ==========================================================================
  // Phase 1: Identify and convert CBR files
  // ==========================================================================

  const filesToProcess: Array<{
    fileId: string;
    filename: string;
    path: string;
    needsConversion: boolean;
  }> = [];

  for (const fileChange of session.fileChanges) {
    if (fileChange.status === 'rejected') {
      continue;
    }

    const approvedFields = Object.entries(fileChange.fields).filter(([, fc]) => fc.approved);
    if (approvedFields.length === 0) {
      continue;
    }

    const file = await prisma.comicFile.findUnique({
      where: { id: fileChange.fileId },
      select: { path: true },
    });

    if (file) {
      const isCbr = file.path.toLowerCase().endsWith('.cbr');
      filesToProcess.push({
        fileId: fileChange.fileId,
        filename: fileChange.filename,
        path: file.path,
        needsConversion: isCbr,
      });
    }
  }

  const cbrFiles = filesToProcess.filter((f) => f.needsConversion);

  if (cbrFiles.length > 0) {
    progress('Converting CBR files to CBZ format', `${cbrFiles.length} file(s) to convert`);

    for (let i = 0; i < cbrFiles.length; i++) {
      const file = cbrFiles[i]!;
      progress(`Converting: ${file.filename}`, `${i + 1} of ${cbrFiles.length}`);

      try {
        const conversionResult = await convertCbrToCbz(file.path, {
          deleteOriginal: true,
          onProgress: progress,
        });

        if (conversionResult.success) {
          convertedCount++;
          progress(`Converted: ${file.filename}`, 'Success');
        } else {
          conversionFailedCount++;
          results.push({
            fileId: file.fileId,
            filename: file.filename,
            success: false,
            error: `Conversion failed: ${conversionResult.error || 'Unknown error'}`,
            converted: false,
          });
          progress(`Conversion failed: ${file.filename}`, conversionResult.error);
        }
      } catch (error) {
        conversionFailedCount++;
        results.push({
          fileId: file.fileId,
          filename: file.filename,
          success: false,
          error: `Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          converted: false,
        });
        progress(
          `Conversion failed: ${file.filename}`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    if (convertedCount > 0 || conversionFailedCount > 0) {
      progress('Conversion complete', `${convertedCount} converted, ${conversionFailedCount} failed`);
    }
  }

  // ==========================================================================
  // Phase 2: Apply metadata changes
  // ==========================================================================

  progress('Applying metadata changes', `${session.fileChanges.length} file(s) to process`);

  // Normalize publisher across all files for consistency
  // This prevents series splitting when files have different source publishers
  // Priority: provider's selectedSeries.publisher > most common from files > null
  const authoritativePublisher = determineAuthoritativePublisher(session);
  if (authoritativePublisher !== undefined) {
    logger.info(
      { authoritativePublisher },
      'Normalizing publisher across all files in session'
    );

    for (const fileChange of session.fileChanges) {
      if (fileChange.fields.publisher) {
        // Override the publisher to the authoritative value
        fileChange.fields.publisher.proposed = authoritativePublisher;
        fileChange.fields.publisher.approved = true;
        fileChange.fields.publisher.edited = false;
      } else {
        // Add publisher field if it doesn't exist
        fileChange.fields.publisher = {
          current: null,
          proposed: authoritativePublisher,
          approved: true,
          edited: false,
        };
      }
    }
  }

  let processedCount = 0;
  for (const fileChange of session.fileChanges) {
    const filename = fileChange.filename;

    if (fileChange.status === 'rejected') {
      results.push({ fileId: fileChange.fileId, filename, success: true });
      continue;
    }

    const approvedFields = Object.entries(fileChange.fields).filter(([, fc]) => fc.approved);
    if (approvedFields.length === 0) {
      results.push({ fileId: fileChange.fileId, filename, success: true });
      continue;
    }

    if (results.some((r) => r.fileId === fileChange.fileId && !r.success)) {
      continue;
    }

    processedCount++;
    progress(`Applying: ${filename}`, `${processedCount} of ${filesToProcess.length}`);

    try {
      const file = await prisma.comicFile.findUnique({
        where: { id: fileChange.fileId },
        select: {
          path: true,
          libraryId: true,
          library: {
            select: { rootPath: true },
          },
          series: {
            select: {
              name: true,
              publisher: true,
              startYear: true,
              volume: true,
              issueCount: true,
            },
          },
        },
      });

      if (!file) {
        results.push({
          fileId: fileChange.fileId,
          filename,
          success: false,
          error: 'File not found in database',
        });
        continue;
      }

      const wasConverted = cbrFiles.some((f) => f.fileId === fileChange.fileId);

      const metadataUpdate: Partial<ComicInfo> = {};
      for (const [field, fc] of approvedFields) {
        // Skip non-standard fields that shouldn't be written to ComicInfo.xml
        if (NON_COMICINFO_FIELDS.has(field)) continue;

        const value = fc.edited && fc.editedValue !== undefined ? fc.editedValue : fc.proposed;
        if (value !== null) {
          const comicInfoField = field.charAt(0).toUpperCase() + field.slice(1);
          (metadataUpdate as Record<string, unknown>)[comicInfoField] = value;
        }
      }

      const writeResult = await mergeComicInfo(file.path, metadataUpdate);
      if (!writeResult.success) {
        throw new Error(writeResult.error || 'Failed to write ComicInfo.xml');
      }

      let newFilename = filename;
      let wasRenamed = false;
      let hadCollision = false;

      // Check if user provided a custom rename value
      const renameField = fileChange.fields.rename;
      const userEditedFilename = renameField?.edited && renameField.editedValue !== undefined
        ? String(renameField.editedValue)
        : null;

      const completeMetadataResult = await readComicInfo(file.path);
      if (completeMetadataResult.success && completeMetadataResult.comicInfo) {
        // Use template-based filename generation (or user's custom name)
        const {
          result: generatedResult,
          finalFilename,
          finalPath,
          hadCollision: collision,
          needsFolderCreation,
        } = await generateUniqueFilenameFromTemplate(
          completeMetadataResult.comicInfo,
          file.path,
          file.library.rootPath,
          {
            libraryId: file.libraryId,
            series: file.series ? {
              name: file.series.name,
              publisher: file.series.publisher || undefined,
              startYear: file.series.startYear || undefined,
              volume: file.series.volume || undefined,
              issueCount: file.series.issueCount || undefined,
            } : undefined,
          }
        );

        hadCollision = collision;

        // If user edited the filename, use that instead of the generated one
        // (but only for simple renames, not folder moves)
        const effectiveFilename = userEditedFilename || finalFilename;
        const effectivePath = userEditedFilename
          ? file.path.replace(/[^/\\]+$/, userEditedFilename)
          : finalPath;

        // Check if rename/move is needed
        const needsMove = file.path !== effectivePath && effectivePath !== file.path.replace(/[^/\\]+$/, effectiveFilename);
        const needsRenameOnly = !needsMove && needsRename(filename, effectiveFilename);

        if (needsMove || needsRenameOnly) {
          if (hadCollision && !userEditedFilename) {
            progress(
              `Collision detected: ${generatedResult.filename}`,
              `Using: ${effectiveFilename} - you may want to review for duplicates`
            );
          }

          if (userEditedFilename) {
            progress(`Renaming: ${filename}`, `to ${effectiveFilename} (user specified)`);
          } else if (needsMove) {
            progress(`Moving: ${filename}`, `to ${generatedResult.fullRelativePath}`);
          } else {
            progress(`Renaming: ${filename}`, `to ${effectiveFilename}`);
          }

          // Use move with tracking if folder changes, otherwise just rename
          const operationResult = needsMove
            ? await moveFileWithTracking(fileChange.fileId, effectivePath, {
                createDirs: needsFolderCreation,
                templateId: generatedResult.templateId || undefined,
              })
            : await renameFileWithTracking(fileChange.fileId, effectiveFilename, {
                templateId: generatedResult.templateId || undefined,
              });

          if (operationResult.success) {
            newFilename = effectiveFilename;
            wasRenamed = true;
          } else {
            logger.warn(
              { fileId: fileChange.fileId, filename, error: operationResult.error },
              'Failed to rename/move file'
            );
          }
        }
      }

      await prisma.comicFile.update({
        where: { id: fileChange.fileId },
        data: { status: 'indexed' },
      });

      results.push({
        fileId: fileChange.fileId,
        filename: wasRenamed ? newFilename : filename,
        success: true,
        converted: wasConverted,
        renamed: wasRenamed,
        hadCollision: hadCollision,
        originalFilename: wasRenamed ? filename : undefined,
      });
    } catch (error) {
      results.push({
        fileId: fileChange.fileId,
        filename,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // ==========================================================================
  // Mark stats as dirty for successful metadata changes
  // ==========================================================================

  const successfulFileIds = results.filter((r) => r.success).map((r) => r.fileId);
  if (successfulFileIds.length > 0) {
    progress('Marking stats for recalculation', `${successfulFileIds.length} file(s)`);
    for (const fileId of successfulFileIds) {
      try {
        await markDirtyForMetadataChange(fileId);
      } catch (err) {
        logger.warn({ fileId, error: err }, 'Failed to mark stats dirty for file');
      }
    }
  }

  // ==========================================================================
  // Phase 3: Create series.json files for each folder
  // ==========================================================================

  await createSeriesJsonFiles(session, progress);

  // ==========================================================================
  // Phase 3.5: Update database Series records with API metadata
  // ==========================================================================

  await updateSeriesFromApprovedMetadata(session, progress);

  // ==========================================================================
  // Phase 4: Invalidate caches and refresh metadata
  // ==========================================================================

  progress('Refreshing metadata caches', 'Updating file and series data');

  // Collect affected series IDs from the session
  const affectedSeriesIds = new Set<string>();
  for (const group of session.seriesGroups) {
    if (group.status === 'approved' && group.selectedSeries) {
      // Try to find the series in the database by name
      const series = await prisma.series.findFirst({
        where: {
          name: group.selectedSeries.name,
          publisher: group.selectedSeries.publisher ?? null,
        },
      });
      if (series) {
        affectedSeriesIds.add(series.id);
      }
    }
  }

  // Run invalidation
  const invalidationResult = await invalidateAfterApplyChanges(
    results.map((r) => ({ fileId: r.fileId, success: r.success })),
    affectedSeriesIds
  );

  if (invalidationResult.errors.length > 0) {
    logger.warn(
      { errors: invalidationResult.errors },
      'Some errors occurred during cache invalidation'
    );
  }

  progress(
    'Cache refresh complete',
    `${invalidationResult.filesProcessed} files, ${invalidationResult.seriesProcessed} series updated`
  );

  // ==========================================================================
  // Phase 5: Sync External Ratings (if enabled)
  // ==========================================================================

  if (session.options?.fetchExternalRatings && affectedSeriesIds.size > 0) {
    const seriesIds = Array.from(affectedSeriesIds);
    progress('Syncing external ratings', `${seriesIds.length} series`);

    for (let i = 0; i < seriesIds.length; i++) {
      const seriesId = seriesIds[i]!;
      const series = await prisma.series.findUnique({
        where: { id: seriesId },
        select: { name: true, anilistId: true },
      });

      try {
        // Determine which sources to use based on available external IDs
        const sources: Array<'comicbookroundup' | 'anilist'> = ['comicbookroundup'];
        if (series?.anilistId) {
          sources.push('anilist');
        }

        progress('Fetching series ratings', series?.name || seriesId);
        await syncSeriesRatings(seriesId, {
          sources,
          forceRefresh: true,
        });

        // Only fetch issue ratings if explicitly requested (slow due to CBR rate limiting)
        if (session.options?.fetchIssueRatings) {
          await syncSeriesIssueRatings(seriesId, {
            forceRefresh: true,
            onProgress: (message, detail) => {
              progress(`Fetching issue ratings: ${message}`, detail);
            },
          });

          // Also fetch issue reviews if we're fetching issue ratings
          progress('Fetching issue reviews', `${i + 1} of ${seriesIds.length} series`);
          await syncSeriesReviews(seriesId, { forceRefresh: true });
        }
      } catch (error) {
        // Silent skip - log but don't fail workflow
        logger.warn({ seriesId, error }, 'Failed to sync external ratings/reviews (continuing)');
      }
    }

    progress('External ratings sync complete', `${seriesIds.length} series processed`);
  }

  session.status = 'complete';
  session.updatedAt = new Date();
  setSession(session);

  // Clean up session after a delay
  setTimeout(() => {
    deleteSessionFromStore(sessionId);
  }, 5 * 60 * 1000);

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const renamedCount = results.filter((r) => r.renamed).length;
  const collisionCount = results.filter((r) => r.hadCollision).length;

  const details = [
    `${successful} successful`,
    `${failed} failed`,
    convertedCount > 0 ? `${convertedCount} converted` : '',
    renamedCount > 0 ? `${renamedCount} renamed` : '',
    collisionCount > 0 ? `${collisionCount} collision(s) resolved` : '',
  ]
    .filter(Boolean)
    .join(', ');

  progress('Apply complete', details);

  return {
    total: results.length,
    successful,
    failed,
    converted: convertedCount,
    conversionFailed: conversionFailedCount,
    renamed: renamedCount,
    collisions: collisionCount,
    results,
  };
}

// =============================================================================
// Series.json Creation
// =============================================================================

/**
 * Series data stored per folder per series group
 */
interface FolderSeriesEntry {
  selectedSeries: NonNullable<ApprovalSession['seriesGroups'][0]['selectedSeries']>;
  issueMatchingSeries: ApprovalSession['seriesGroups'][0]['issueMatchingSeries'];
  fileChanges: ApplyResult[];
  normalizedName: string;
}

/**
 * Create series.json files for each folder with approved series.
 * For folders with multiple series, creates a .series-cache.json instead.
 */
async function createSeriesJsonFiles(
  session: ApprovalSession,
  progress: ProgressCallback
): Promise<void> {
  const prisma = getDatabase();

  progress('Creating series metadata files', 'Grouping files by folder and series');

  // Track ALL series per folder (not just the first)
  const folderToSeriesMap = new Map<string, FolderSeriesEntry[]>();

  for (const group of session.seriesGroups) {
    if (group.status !== 'approved' || !group.selectedSeries) {
      continue;
    }

    // Get the normalized series name for this group
    const normalizedName = normalizeSeriesName(group.displayName || group.selectedSeries.name);

    for (const fileId of group.fileIds) {
      const file = await prisma.comicFile.findUnique({
        where: { id: fileId },
        select: { path: true },
      });

      if (file) {
        const folderPath = dirname(file.path);

        // Get or create the series array for this folder
        if (!folderToSeriesMap.has(folderPath)) {
          folderToSeriesMap.set(folderPath, []);
        }

        const folderSeriesList = folderToSeriesMap.get(folderPath)!;

        // Check if we already have this series in the folder
        let existingEntry = folderSeriesList.find(
          (e) => e.selectedSeries.sourceId === group.selectedSeries!.sourceId
        );

        if (!existingEntry) {
          // Add new series entry for this folder
          existingEntry = {
            selectedSeries: group.selectedSeries,
            issueMatchingSeries: group.issueMatchingSeries,
            fileChanges: [],
            normalizedName,
          };
          folderSeriesList.push(existingEntry);
        }

        // Add file changes for this series
        const fileChange = session.fileChanges.find((fc) => fc.fileId === fileId);
        if (fileChange) {
          existingEntry.fileChanges.push({
            fileId: fileChange.fileId,
            filename: fileChange.filename,
            success: true,
          });
        }
      }
    }
  }

  let seriesJsonCreated = 0;
  let mixedCacheCreated = 0;
  let seriesJsonFailed = 0;

  for (const [folderPath, seriesList] of folderToSeriesMap) {
    try {
      if (seriesList.length === 1) {
        // Single series folder - write traditional series.json
        const { selectedSeries, issueMatchingSeries } = seriesList[0]!;
        progress(`Creating series.json`, folderPath);

        const seriesMetadata: SeriesMetadata = {
          seriesName: selectedSeries.name,
          startYear: selectedSeries.startYear,
          endYear: selectedSeries.endYear,
          publisher: selectedSeries.publisher,
          summary: selectedSeries.description,
          coverUrl: selectedSeries.coverUrl,
          siteUrl: selectedSeries.url,
          issueCount: selectedSeries.issueCount,
          lastUpdated: new Date().toISOString(),
        };

        // Save issue matching series info if different from selected series
        if (issueMatchingSeries && issueMatchingSeries.sourceId !== selectedSeries.sourceId) {
          seriesMetadata.issueMatchingSeriesName = issueMatchingSeries.name;
          seriesMetadata.issueMatchingStartYear = issueMatchingSeries.startYear;
          seriesMetadata.issueMatchingPublisher = issueMatchingSeries.publisher;
          seriesMetadata.issueMatchingIssueCount = issueMatchingSeries.issueCount;

          if (issueMatchingSeries.source === 'comicvine') {
            seriesMetadata.issueMatchingComicVineId = issueMatchingSeries.sourceId;
          } else if (issueMatchingSeries.source === 'metron') {
            seriesMetadata.issueMatchingMetronId = issueMatchingSeries.sourceId;
          }
        }

        if (selectedSeries.source === 'comicvine') {
          seriesMetadata.comicVineSeriesId = selectedSeries.sourceId;

          try {
            const volumeId = parseInt(selectedSeries.sourceId, 10);
            const fullVolume = await comicVine.getVolume(volumeId);
            if (fullVolume) {
              seriesMetadata.deck = fullVolume.deck;
              if (fullVolume.description && !seriesMetadata.summary) {
                seriesMetadata.summary = fullVolume.description.replace(/<[^>]*>/g, '').trim();
              }
              if (fullVolume.publisher?.id) {
                seriesMetadata.publisherId = fullVolume.publisher.id;
              }
              if (fullVolume.image?.medium_url) {
                seriesMetadata.coverUrl = fullVolume.image.medium_url;
              }
              if (fullVolume.site_detail_url) {
                seriesMetadata.siteUrl = fullVolume.site_detail_url;
              }
            }
          } catch (err) {
            logger.warn({ error: err }, 'Failed to fetch full volume data');
          }
        } else if (selectedSeries.source === 'metron') {
          seriesMetadata.metronSeriesId = selectedSeries.sourceId;
        }

        const writeResult = await writeSeriesJson(folderPath, seriesMetadata);
        if (writeResult.success) {
          seriesJsonCreated++;
        } else {
          seriesJsonFailed++;
          logger.warn({ folderPath, error: writeResult.error }, 'Failed to create series.json');
        }
      } else {
        // Multiple series folder - write mixed series cache
        progress(
          `Creating mixed series cache`,
          `${folderPath} (${seriesList.length} series)`
        );

        const mixedCache: MixedSeriesCache = {
          seriesMappings: {},
          lastUpdated: new Date().toISOString(),
        };

        for (const entry of seriesList) {
          const { selectedSeries, normalizedName } = entry;

          const cachedMatch: CachedSeriesMatch = {
            source: selectedSeries.source,
            sourceId: selectedSeries.sourceId,
            name: selectedSeries.name,
            startYear: selectedSeries.startYear,
            endYear: selectedSeries.endYear,
            publisher: selectedSeries.publisher,
            issueCount: selectedSeries.issueCount,
            description: selectedSeries.description,
            coverUrl: selectedSeries.coverUrl,
            url: selectedSeries.url,
          };

          mixedCache.seriesMappings[normalizedName] = cachedMatch;
        }

        const writeResult = await writeMixedSeriesCache(folderPath, mixedCache);
        if (writeResult.success) {
          mixedCacheCreated++;
        } else {
          seriesJsonFailed++;
          logger.warn({ folderPath, error: writeResult.error }, 'Failed to create mixed series cache');
        }
      }
    } catch (error) {
      seriesJsonFailed++;
      logger.error({ folderPath, error }, 'Error creating series metadata files');
    }
  }

  if (seriesJsonCreated > 0 || mixedCacheCreated > 0 || seriesJsonFailed > 0) {
    const parts = [];
    if (seriesJsonCreated > 0) parts.push(`${seriesJsonCreated} series.json`);
    if (mixedCacheCreated > 0) parts.push(`${mixedCacheCreated} mixed cache`);
    if (seriesJsonFailed > 0) parts.push(`${seriesJsonFailed} failed`);
    progress('Series metadata creation complete', parts.join(', '));
  }
}

// =============================================================================
// Update Database Series Records
// =============================================================================

/**
 * Update database Series records with metadata from approved external series.
 * Uses the shared applyMetadataToSeries function for consistency with Edit Series Modal.
 */
async function updateSeriesFromApprovedMetadata(
  session: ApprovalSession,
  progress: ProgressCallback
): Promise<void> {
  const prisma = getDatabase();

  progress('Updating series metadata', 'Syncing database records with API data');

  let updated = 0;
  let failed = 0;

  for (const group of session.seriesGroups) {
    if (group.status !== 'approved' || !group.selectedSeries) {
      continue;
    }

    const selectedSeries = group.selectedSeries;

    try {
      // Find the database Series record from the files in this group
      // This is more reliable than searching by name/publisher since the API result's
      // name may differ from the database series name (which was parsed from filenames)
      const fileWithSeries = await prisma.comicFile.findFirst({
        where: { id: { in: group.fileIds } },
        select: { seriesId: true },
      });

      if (!fileWithSeries?.seriesId) {
        logger.debug(
          { seriesName: selectedSeries.name, fileIds: group.fileIds.slice(0, 3) },
          'No files in group have a series assigned'
        );
        continue;
      }

      const dbSeries = await prisma.series.findUnique({
        where: { id: fileWithSeries.seriesId },
      });

      if (!dbSeries) {
        logger.debug(
          { seriesId: fileWithSeries.seriesId, seriesName: selectedSeries.name },
          'Database series not found for files in group'
        );
        continue;
      }

      // Check if series already has an external ID that differs
      const existingExternalId = selectedSeries.source === 'comicvine'
        ? dbSeries.comicVineId
        : dbSeries.metronId;

      if (existingExternalId && existingExternalId !== selectedSeries.sourceId) {
        logger.info(
          { seriesId: dbSeries.id, existingId: existingExternalId, newId: selectedSeries.sourceId },
          'Series already has different external ID, skipping update'
        );
        continue;
      }

      // Fetch full metadata from the API
      const rawMetadata = await getSeriesMetadata(selectedSeries.source, selectedSeries.sourceId);
      if (!rawMetadata) {
        logger.warn(
          { source: selectedSeries.source, sourceId: selectedSeries.sourceId },
          'Failed to fetch full metadata for approved series'
        );
        continue;
      }

      // Convert to SeriesMetadataPayload
      const metadata: SeriesMetadataPayload = {
        seriesName: rawMetadata.seriesName as string | undefined,
        publisher: rawMetadata.publisher as string | undefined,
        startYear: rawMetadata.startYear as number | undefined,
        endYear: rawMetadata.endYear as number | undefined,
        issueCount: rawMetadata.issueCount as number | undefined,
        description: rawMetadata.description as string | undefined,
        deck: rawMetadata.deck as string | undefined,
        coverUrl: rawMetadata.coverUrl as string | undefined,
      };

      // Add external ID based on source
      if (selectedSeries.source === 'comicvine') {
        metadata.comicVineSeriesId = selectedSeries.sourceId;
      } else if (selectedSeries.source === 'metron') {
        metadata.metronSeriesId = selectedSeries.sourceId;
      } else if (selectedSeries.source === 'anilist') {
        metadata.anilistId = selectedSeries.sourceId;
        // Warn if assigning AniList ID to non-manga series
        if (dbSeries.type !== 'manga') {
          logger.warn(
            {
              seriesId: dbSeries.id,
              seriesName: dbSeries.name,
              seriesType: dbSeries.type,
              anilistId: selectedSeries.sourceId,
            },
            'Assigning AniList ID to non-manga series. This ID will not be used for ratings/reviews sync.'
          );
        }
      } else if (selectedSeries.source === 'mal') {
        metadata.malId = selectedSeries.sourceId;
        // Warn if assigning MAL ID to non-manga series
        if (dbSeries.type !== 'manga') {
          logger.warn(
            {
              seriesId: dbSeries.id,
              seriesName: dbSeries.name,
              seriesType: dbSeries.type,
              malId: selectedSeries.sourceId,
            },
            'Assigning MyAnimeList ID to non-manga series. This ID will not be used for ratings/reviews sync.'
          );
        }
      }

      // Extract array fields if present
      if (Array.isArray(rawMetadata.characters)) {
        metadata.characters = (rawMetadata.characters as Array<{name: string} | string>).map((c) =>
          typeof c === 'object' && c !== null && 'name' in c ? c.name : String(c)
        );
      }
      if (Array.isArray(rawMetadata.locations)) {
        metadata.locations = (rawMetadata.locations as Array<{name: string} | string>).map((l) =>
          typeof l === 'object' && l !== null && 'name' in l ? l.name : String(l)
        );
      }
      if (Array.isArray(rawMetadata.creators)) {
        metadata.creators = (rawMetadata.creators as Array<{name: string} | string>).map((c) =>
          typeof c === 'object' && c !== null && 'name' in c ? c.name : String(c)
        );
      }
      if (Array.isArray(rawMetadata.aliases)) {
        metadata.aliases = (rawMetadata.aliases as string[]).map((a) => String(a));
      }

      // Get all unlocked fields to apply
      const lockedFields = dbSeries.lockedFields
        ? dbSeries.lockedFields.split(',').map((f) => f.trim())
        : [];

      // Define fields to update (all standard fields that aren't locked)
      // NOTE: 'name' is intentionally excluded to prevent mismatch between
      // database series name and file metadata series name. The series name
      // is determined by local files/parsing, not overwritten by API metadata.
      // This prevents the invalidation logic from creating duplicate series
      // when file.metadata.series != file.series.name after API update.
      const allFields = [
        'publisher', 'startYear', 'endYear', 'issueCount',
        'summary', 'deck', 'coverUrl', 'comicVineId', 'metronId',
        'anilistId', 'malId', 'characters', 'locations', 'creators', 'genres', 'aliases'
      ];
      const fieldsToApply = allFields.filter((f) => !lockedFields.includes(f));

      // Apply metadata using shared function
      const result = await applyMetadataToSeries(
        dbSeries.id,
        metadata,
        selectedSeries.source,
        selectedSeries.sourceId,
        fieldsToApply
      );

      if (result.success) {
        updated++;
        logger.info(
          { seriesId: dbSeries.id, fieldsUpdated: result.fieldsUpdated },
          'Updated series with API metadata'
        );

        // =======================================================================
        // Aggregate creator roles from issues (ComicVine only)
        // =======================================================================
        if (selectedSeries.source === 'comicvine') {
          try {
            const volumeId = parseInt(selectedSeries.sourceId, 10);
            progress(`Aggregating creator roles`, `${selectedSeries.name}`);

            const creatorsWithRoles = await aggregateCreatorRolesFromIssues(volumeId, {
              sessionId: session.id,
            });

            if (hasAnyCreators(creatorsWithRoles)) {
              // Update series with aggregated creator data
              const roleFields = creatorsToRoleFields(creatorsWithRoles);
              await prisma.series.update({
                where: { id: dbSeries.id },
                data: {
                  creatorsJson: creatorsToJson(creatorsWithRoles),
                  // Also sync individual role fields for backward compatibility
                  ...(roleFields.writer && { writer: roleFields.writer }),
                  ...(roleFields.penciller && { penciller: roleFields.penciller }),
                  ...(roleFields.inker && { inker: roleFields.inker }),
                  ...(roleFields.colorist && { colorist: roleFields.colorist }),
                  ...(roleFields.letterer && { letterer: roleFields.letterer }),
                  ...(roleFields.coverArtist && { coverArtist: roleFields.coverArtist }),
                  ...(roleFields.editor && { editor: roleFields.editor }),
                },
              });

              logger.info(
                {
                  seriesId: dbSeries.id,
                  writers: creatorsWithRoles.writer.length,
                  pencillers: creatorsWithRoles.penciller.length,
                },
                'Aggregated creator roles from issues'
              );
            }
          } catch (aggregateError) {
            // Don't fail the whole operation if aggregation fails
            logger.warn(
              { seriesId: dbSeries.id, error: aggregateError },
              'Failed to aggregate creator roles (non-fatal)'
            );
          }
        }
      } else {
        failed++;
        logger.warn(
          { seriesId: dbSeries.id, error: result.error },
          'Failed to update series with API metadata'
        );
      }
    } catch (error) {
      failed++;
      logger.error(
        { seriesName: selectedSeries.name, error },
        'Error updating series from approved metadata'
      );
    }
  }

  if (updated > 0 || failed > 0) {
    progress('Series metadata update complete', `${updated} updated, ${failed} failed`);
  }
}
