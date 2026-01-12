/**
 * Scanner Service - Folder-First Architecture
 *
 * Redesigned scanner using folder-first depth-first pipeline:
 * - Folder = Unit of Work (not individual files)
 * - Immediate visibility after each folder completes
 * - Per-folder transactions with rollback on error
 * - Cover extraction decoupled to separate queue
 * - Resume capability via FolderScanRecord persistence
 *
 * Performance targets:
 * - Time to first file visible: 1-3 min (was 45-60 min)
 * - Folders browsable immediately after processing
 */

import { readdir, stat } from 'fs/promises';
import { join, relative, extname, basename, dirname } from 'path';
import { getDatabase, getWriteDatabase } from './database.service.js';
import { generatePartialHash, getFileInfo } from './hash.service.js';
import { autoLinkFileToSeries } from './series-matcher.service.js';
import { refreshMetadataCache } from './metadata-cache.service.js';
import { markDirtyForFileChange } from './stats-dirty.service.js';
import { invalidateFolderCache } from './cache/folder-cache.service.js';
import { ensureFolderPath, incrementFolderFileCounts, getParentPath } from './folder/index.js';
import { refreshTagsFromFile } from './tag-autocomplete.service.js';
import { checkAndSoftDeleteEmptySeries, syncSeriesFromSeriesJson } from './series/index.js';
import { markFileItemsUnavailable } from './collection/index.js';
import { scannerLogger } from './logger.service.js';
import { readSeriesJson, getSeriesDefinitions, type SeriesMetadata } from './series-metadata.service.js';
import { mergeSeriesJsonToDb } from './series-json-sync.service.js';
import { FolderSeriesRegistry } from './folder-series-registry.service.js';
import { sendScanProgress } from './sse.service.js';
import { createScanLog } from './library-scan-job.service.js';
import {
  getScanSeriesCache,
  resetScanSeriesCache,
} from './scan-series-cache.service.js';
import {
  enqueueCoverJob,
  recoverCoverJobs,
  getCoverQueueStatus,
  cancelLibraryCoverJobs,
} from './cover-job-queue.service.js';
import { memoryCache, CacheKeys } from './memory-cache.service.js';

// =============================================================================
// Constants
// =============================================================================

const COMIC_EXTENSIONS = new Set(['.cbz', '.cbr', '.cb7']);

// =============================================================================
// Types
// =============================================================================

export interface DiscoveredFile {
  path: string;
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  modifiedAt: Date;
  hash?: string;
}

export interface ScanResult {
  libraryId: string;
  libraryPath: string;
  totalFilesScanned: number;
  newFiles: DiscoveredFile[];
  movedFiles: Array<{ oldPath: string; newPath: string; fileId: string }>;
  orphanedFiles: Array<{ path: string; fileId: string }>;
  existingOrphanedCount: number;
  unchangedFiles: number;
  errors: Array<{ path: string; error: string }>;
  scanDuration: number;
  seriesJsonMap?: Map<string, SeriesMetadata>;
}

export interface FolderInfo {
  path: string;
  relativePath: string;
  depth: number;
  mtime: Date;
  hasSeriesJson: boolean;
  seriesJsonMetadata?: SeriesMetadata;
}

export interface FolderScanResult {
  folderPath: string;
  filesCreated: number;
  filesUpdated: number;
  filesOrphaned: number;
  seriesCreated: number;
  seriesMatched: number;
  errors: Array<{ path: string; error: string }>;
  coverJobId?: string;
  /** File paths discovered in this folder (for orphan detection without re-reading) */
  discoveredPaths: string[];
}

export interface ScanProgress {
  phase: 'enumerating' | 'processing' | 'covers' | 'complete' | 'error';
  foldersTotal: number;
  foldersComplete: number;
  foldersSkipped: number;
  foldersErrored: number;
  currentFolder: string | null;
  filesDiscovered: number;
  filesCreated: number;
  filesUpdated: number;
  filesOrphaned: number;
  seriesCreated: number;
  coverJobsCreated: number;
  coverJobsComplete: number;
  elapsedMs: number;
}

export interface ScanOptions {
  forceFullScan?: boolean;
  skipCovers?: boolean;
  onProgress?: (progress: ScanProgress) => void;
  abortSignal?: AbortSignal;
  jobId?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function isComicFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return COMIC_EXTENSIONS.has(ext);
}

function emitScanProgress(libraryId: string, progress: ScanProgress): void {
  sendScanProgress(libraryId, progress);
}

// =============================================================================
// Folder Enumeration (Phase 1)
// =============================================================================

/**
 * Enumerate all folders in the library, depth-first.
 * Returns folders sorted by depth (deepest first) for bottom-up processing.
 */
export async function enumerateFolders(
  libraryPath: string,
  options?: { onFolder?: (folder: FolderInfo) => void }
): Promise<{ folders: FolderInfo[]; errors: Array<{ path: string; error: string }> }> {
  const folders: FolderInfo[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  async function scanDir(dirPath: string, depth: number): Promise<void> {
    try {
      const dirStat = await stat(dirPath);
      const entries = await readdir(dirPath, { withFileTypes: true });

      // Check for series.json
      let hasSeriesJson = false;
      let seriesJsonMetadata: SeriesMetadata | undefined;

      const seriesJsonEntry = entries.find((e) => e.name === 'series.json');
      if (seriesJsonEntry) {
        hasSeriesJson = true;
        try {
          const result = await readSeriesJson(dirPath);
          if (result.success && result.metadata) {
            seriesJsonMetadata = result.metadata;
          }
        } catch (err) {
          errors.push({
            path: join(dirPath, 'series.json'),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Check if folder has comic files
      const hasComicFiles = entries.some(
        (e) => e.isFile() && isComicFile(e.name)
      );

      // Only add folders that have comic files or are parents of comic folders
      if (hasComicFiles) {
        const folderInfo: FolderInfo = {
          path: dirPath,
          relativePath: relative(libraryPath, dirPath) || '.',
          depth,
          mtime: dirStat.mtime,
          hasSeriesJson,
          seriesJsonMetadata,
        };
        folders.push(folderInfo);
        options?.onFolder?.(folderInfo);
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scanDir(join(dirPath, entry.name), depth + 1);
        }
      }
    } catch (err) {
      errors.push({
        path: dirPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await scanDir(libraryPath, 0);

  // Sort by depth descending (deepest first for bottom-up processing)
  folders.sort((a, b) => b.depth - a.depth);

  return { folders, errors };
}

// =============================================================================
// Folder Processing (Phase 2)
// =============================================================================

/**
 * Process a single folder atomically.
 * Creates/updates files, links to series, and queues cover extraction.
 */
export async function processFolderTransaction(
  libraryId: string,
  libraryPath: string,
  folder: FolderInfo,
  options?: {
    existingFilesByPath?: Map<string, { id: string; hash: string | null; status: string }>;
    existingFilesByHash?: Map<string, { id: string; path: string }>;
    folderRegistry?: FolderSeriesRegistry;
  }
): Promise<FolderScanResult> {
  const db = getWriteDatabase();
  const seriesCache = getScanSeriesCache();
  const result: FolderScanResult = {
    folderPath: folder.path,
    filesCreated: 0,
    filesUpdated: 0,
    filesOrphaned: 0,
    seriesCreated: 0,
    seriesMatched: 0,
    errors: [],
    discoveredPaths: [],
  };

  // Timing metrics for performance profiling
  const timings = {
    hashGeneration: 0,
    metadataExtraction: 0,
    seriesLinking: 0,
    dbOperations: 0,
  };

  const newFileIds: string[] = [];

  try {
    // Get files in this folder
    const entries = await readdir(folder.path, { withFileTypes: true });
    const comicFiles = entries.filter((e) => e.isFile() && isComicFile(e.name));

    if (comicFiles.length === 0) {
      return result;
    }

    // Scaffold series from series.json if present
    if (folder.seriesJsonMetadata) {
      const definitions = getSeriesDefinitions(folder.seriesJsonMetadata);
      if (definitions.length > 0) {
        try {
          const series = await syncSeriesFromSeriesJson(folder.path, db);
          if (series) {
            await mergeSeriesJsonToDb(series.id, folder.path);

            // Check if this series was already in the cache (existing vs newly created)
            if (!seriesCache.has(series.id)) {
              result.seriesCreated++;
            }

            // Add to series cache for matching
            seriesCache.addSeries({
              id: series.id,
              name: series.name,
              publisher: series.publisher,
              startYear: series.startYear,
              volume: series.volume,
              aliases: series.aliases,
            });
          }
        } catch (err) {
          result.errors.push({
            path: folder.path,
            error: `Failed to scaffold series: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    }

    // ==========================================================================
    // Phase A: Collect file data and categorize (orphaned restorations, moves, new files)
    // ==========================================================================
    interface NewFileData {
      path: string;
      relativePath: string;
      filename: string;
      extension: string;
      size: number;
      modifiedAt: Date;
      hash: string;
    }

    const newFilesToCreate: NewFileData[] = [];
    const orphanedToRestore: string[] = []; // IDs of orphaned files to restore
    const movedFiles: Array<{ id: string; path: string; relativePath: string; filename: string }> = [];

    for (const entry of comicFiles) {
      const filePath = join(folder.path, entry.name);

      // Track discovered paths for orphan detection (before any continue statements)
      result.discoveredPaths.push(filePath);

      try {
        const fileInfo = await getFileInfo(filePath, false);
        const relativePath = relative(libraryPath, filePath);

        // Check if file already exists in DB
        const existingByPath = options?.existingFilesByPath?.get(filePath);

        if (existingByPath) {
          // File exists - check if it was orphaned and needs restoration
          if (existingByPath.status === 'orphaned') {
            orphanedToRestore.push(existingByPath.id);
            result.filesUpdated++;
          }
          // Unchanged file - skip
          continue;
        }

        // Check if file was moved (by hash)
        const hashStart = performance.now();
        const hash = await generatePartialHash(filePath);
        timings.hashGeneration += performance.now() - hashStart;
        const existingByHash = options?.existingFilesByHash?.get(hash);

        if (existingByHash) {
          // File was moved - collect for batch update
          movedFiles.push({
            id: existingByHash.id,
            path: filePath,
            relativePath,
            filename: entry.name,
          });
          result.filesUpdated++;
          continue;
        }

        // New file - collect data for batch creation
        newFilesToCreate.push({
          path: filePath,
          relativePath,
          filename: entry.name,
          extension: extname(entry.name).toLowerCase().slice(1),
          size: fileInfo.size,
          modifiedAt: fileInfo.modifiedAt,
          hash,
        });
      } catch (err) {
        result.errors.push({
          path: filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ==========================================================================
    // Phase B: Batch database operations for restores and moves
    // ==========================================================================

    // Batch restore orphaned files
    if (orphanedToRestore.length > 0) {
      await db.comicFile.updateMany({
        where: { id: { in: orphanedToRestore } },
        data: { status: 'indexed' },
      });
    }

    // Batch update moved files (unfortunately can't use updateMany for different values per row)
    // But we can run these updates in parallel for better performance
    if (movedFiles.length > 0) {
      await Promise.all(
        movedFiles.map((file) =>
          db.comicFile.update({
            where: { id: file.id },
            data: {
              path: file.path,
              relativePath: file.relativePath,
              filename: file.filename,
            },
          })
        )
      );
    }

    // ==========================================================================
    // Phase C: Batch create new files
    // ==========================================================================

    if (newFilesToCreate.length > 0) {
      const dbStart = performance.now();

      // Ensure folder record exists in materialized hierarchy
      // All files in this folder share the same parent folder path
      let folderId: string | null = null;
      const folderRelativePath = folder.relativePath;
      if (folderRelativePath && folderRelativePath !== '.' && folderRelativePath !== '') {
        try {
          const folderRecord = await ensureFolderPath(libraryId, folderRelativePath, db);
          folderId = folderRecord.id;
        } catch (err) {
          // Non-fatal - file creation can proceed without folder linkage
          scannerLogger.warn(
            { libraryId, folderPath: folderRelativePath, error: err },
            'Failed to create folder record'
          );
        }
      }

      // Use createMany for bulk insertion
      await db.comicFile.createMany({
        data: newFilesToCreate.map((f) => ({
          libraryId,
          path: f.path,
          relativePath: f.relativePath,
          filename: f.filename,
          extension: f.extension,
          size: f.size,
          modifiedAt: f.modifiedAt,
          hash: f.hash,
          status: 'pending',
          folderId, // Link to materialized folder
        })),
        skipDuplicates: true,
      });

      // Fetch created files to get their IDs
      const createdFiles = await db.comicFile.findMany({
        where: { path: { in: newFilesToCreate.map((f) => f.path) } },
        select: { id: true, path: true },
      });

      timings.dbOperations += performance.now() - dbStart;
      result.filesCreated = createdFiles.length;

      // ==========================================================================
      // Phase D: Process each new file individually (metadata + series linking)
      // ==========================================================================

      const successfullyLinkedIds: string[] = [];

      for (const file of createdFiles) {
        try {
          // Extract and cache metadata
          const metadataStart = performance.now();
          const metadataSuccess = await refreshMetadataCache(file.id, db);
          if (metadataSuccess) {
            await refreshTagsFromFile(file.id, db);
          }
          timings.metadataExtraction += performance.now() - metadataStart;

          // Link to series using cache-first matching
          const linkStart = performance.now();
          const linkResult = await autoLinkFileToSeries(file.id, {
            folderRegistry: options?.folderRegistry,
            scanCache: seriesCache,
            db, // Pass write pool for proper connection isolation
          });
          timings.seriesLinking += performance.now() - linkStart;

          if (linkResult.success) {
            successfullyLinkedIds.push(file.id);
            newFileIds.push(file.id);

            if (linkResult.matchType === 'created') {
              result.seriesCreated++;

              // Add newly created series to cache (using data from linkResult, no extra DB lookup)
              if (linkResult.createdSeries) {
                seriesCache.addSeries(linkResult.createdSeries);
              }
            } else {
              result.seriesMatched++;
            }
          } else {
            // Still track file for cover extraction even if linking failed
            newFileIds.push(file.id);
          }
        } catch (err) {
          result.errors.push({
            path: file.path,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Throttle between files to prevent database connection exhaustion
        // This allows API requests to complete during large library scans
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      // ==========================================================================
      // Phase E: Batch status update for successfully linked files
      // ==========================================================================

      if (successfullyLinkedIds.length > 0) {
        await db.comicFile.updateMany({
          where: { id: { in: successfullyLinkedIds } },
          data: { status: 'indexed' },
        });
      }

      // ==========================================================================
      // Phase F: Update folder file counts
      // ==========================================================================

      if (folderId && createdFiles.length > 0) {
        try {
          await incrementFolderFileCounts(folderId, createdFiles.length, db);
        } catch (err) {
          // Non-fatal - counts can be repaired via recalculation
          scannerLogger.warn(
            { folderId, delta: createdFiles.length, error: err },
            'Failed to update folder file counts'
          );
        }
      }
    }

    // Queue cover extraction for new files in this folder
    if (newFileIds.length > 0) {
      try {
        result.coverJobId = await enqueueCoverJob({
          libraryId,
          folderPath: folder.path,
          fileIds: newFileIds,
          priority: 'normal',
        });
      } catch (err) {
        result.errors.push({
          path: folder.path,
          error: `Failed to queue covers: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // Update FolderScanRecord
    await db.folderScanRecord.upsert({
      where: {
        libraryId_folderPath: {
          libraryId,
          folderPath: folder.path,
        },
      },
      create: {
        libraryId,
        folderPath: folder.path,
        depth: folder.depth,
        status: 'complete',
        lastScanned: new Date(),
        lastMtime: folder.mtime,
        fileCount: comicFiles.length,
        filesCreated: result.filesCreated,
        filesUpdated: result.filesUpdated,
        seriesCreated: result.seriesCreated,
        seriesMatched: result.seriesMatched,
      },
      update: {
        status: 'complete',
        lastScanned: new Date(),
        lastMtime: folder.mtime,
        fileCount: comicFiles.length,
        filesCreated: result.filesCreated,
        filesUpdated: result.filesUpdated,
        seriesCreated: result.seriesCreated,
        seriesMatched: result.seriesMatched,
        errorMessage: null,
      },
    });

    // Log timing metrics for performance profiling
    if (result.filesCreated > 0) {
      scannerLogger.debug(
        {
          folder: folder.relativePath,
          filesCreated: result.filesCreated,
          timings: {
            hashGeneration: Math.round(timings.hashGeneration),
            metadataExtraction: Math.round(timings.metadataExtraction),
            seriesLinking: Math.round(timings.seriesLinking),
            dbOperations: Math.round(timings.dbOperations),
            total: Math.round(timings.hashGeneration + timings.metadataExtraction + timings.seriesLinking + timings.dbOperations),
          },
        },
        `Folder timing: ${result.filesCreated} files in ${Math.round(timings.hashGeneration + timings.metadataExtraction + timings.seriesLinking + timings.dbOperations)}ms`
      );
    }

  } catch (err) {
    // Mark folder as errored
    await db.folderScanRecord.upsert({
      where: {
        libraryId_folderPath: {
          libraryId,
          folderPath: folder.path,
        },
      },
      create: {
        libraryId,
        folderPath: folder.path,
        depth: folder.depth,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
      update: {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });

    result.errors.push({
      path: folder.path,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

// =============================================================================
// Orphan Detection (Phase 3)
// =============================================================================

/**
 * Detect and handle orphaned files (files in DB but not on disk).
 */
async function processOrphanedFiles(
  libraryId: string,
  discoveredPaths: Set<string>
): Promise<{ orphaned: number; seriesAffected: Set<string> }> {
  const db = getWriteDatabase();
  const affectedSeriesIds = new Set<string>();

  // Find files in DB that weren't discovered
  const existingFiles = await db.comicFile.findMany({
    where: {
      libraryId,
      status: { not: 'orphaned' },
    },
    select: { id: true, path: true, seriesId: true },
  });

  // Collect orphaned file IDs and affected series
  const orphanedFileIds: string[] = [];
  for (const file of existingFiles) {
    if (!discoveredPaths.has(file.path)) {
      orphanedFileIds.push(file.id);
      if (file.seriesId) {
        affectedSeriesIds.add(file.seriesId);
      }
    }
  }

  // Batch process orphaned files
  if (orphanedFileIds.length > 0) {
    // Mark collection items as unavailable (in parallel for speed)
    await Promise.all(orphanedFileIds.map((id) => markFileItemsUnavailable(id, db)));

    // Batch delete orphaned files
    await db.comicFile.deleteMany({
      where: { id: { in: orphanedFileIds } },
    });
  }

  const orphanedCount = orphanedFileIds.length;

  // Check affected series for soft-delete
  for (const seriesId of affectedSeriesIds) {
    try {
      const wasDeleted = await checkAndSoftDeleteEmptySeries(seriesId, db);
      if (!wasDeleted) {
        // Recalculate cover if series still has issues
        const { recalculateSeriesCover } = await import('./cover.service.js');
        await recalculateSeriesCover(seriesId).catch(() => {});
      }
    } catch {
      // Non-critical
    }
  }

  return { orphaned: orphanedCount, seriesAffected: affectedSeriesIds };
}

// =============================================================================
// Main Scan Orchestrator
// =============================================================================

/**
 * Orchestrate a full library scan using folder-first architecture.
 */
export async function orchestrateScan(
  libraryId: string,
  options: ScanOptions = {}
): Promise<{
  foldersProcessed: number;
  foldersSkipped: number;
  foldersErrored: number;
  filesCreated: number;
  filesUpdated: number;
  filesOrphaned: number;
  seriesCreated: number;
  coverJobsCreated: number;
  elapsedMs: number;
}> {
  const db = getWriteDatabase();
  const startTime = Date.now();

  // Get library info
  const library = await db.library.findUnique({
    where: { id: libraryId },
  });

  if (!library) {
    throw new Error(`Library not found: ${libraryId}`);
  }

  scannerLogger.info(
    { libraryId, libraryPath: library.rootPath, forceFullScan: options.forceFullScan },
    'Starting folder-first library scan'
  );

  // Log scan start
  if (options.jobId) {
    await createScanLog(
      options.jobId,
      libraryId,
      'discovering',
      'Starting library scan',
      `Path: ${library.rootPath}${options.forceFullScan ? ' (full scan)' : ''}`,
      'info'
    );
  }

  // Initialize series cache for this library
  const seriesCache = getScanSeriesCache();
  await seriesCache.initialize(libraryId);

  // Build progress state
  const progress: ScanProgress = {
    phase: 'enumerating',
    foldersTotal: 0,
    foldersComplete: 0,
    foldersSkipped: 0,
    foldersErrored: 0,
    currentFolder: null,
    filesDiscovered: 0,
    filesCreated: 0,
    filesUpdated: 0,
    filesOrphaned: 0,
    seriesCreated: 0,
    coverJobsCreated: 0,
    coverJobsComplete: 0,
    elapsedMs: 0,
  };

  const emitProgress = async (awaitCallback = false) => {
    progress.elapsedMs = Date.now() - startTime;
    // IMPORTANT: Create a snapshot of progress to avoid race conditions.
    // The onProgress callback is async but not always awaited, so multiple
    // callbacks can be in flight simultaneously. Without a snapshot, they
    // would all reference the same progress object which mutates during
    // async operations, causing mismatched stage/message values.
    const snapshot = { ...progress };
    if (awaitCallback && options.onProgress) {
      await options.onProgress(snapshot);
    } else {
      options.onProgress?.(snapshot);
    }
    emitScanProgress(libraryId, snapshot);
  };

  try {
    // Phase 1: Enumerate folders
    emitProgress();

    const { folders, errors: enumErrors } = await enumerateFolders(library.rootPath, {
      onFolder: (folder) => {
        progress.foldersTotal++;
        if (progress.foldersTotal % 10 === 0) {
          emitProgress();
        }
      },
    });

    if (options.abortSignal?.aborted) {
      throw new Error('Scan aborted');
    }

    scannerLogger.info(
      { libraryId, folderCount: folders.length, errors: enumErrors.length },
      `Enumerated ${folders.length} folders`
    );

    // Log enumeration complete
    if (options.jobId) {
      await createScanLog(
        options.jobId,
        libraryId,
        'discovering',
        'Folder enumeration complete',
        `Found ${folders.length} folders with comics${enumErrors.length > 0 ? `, ${enumErrors.length} errors` : ''}`,
        enumErrors.length > 0 ? 'warning' : 'success'
      );
    }

    // Get existing files for change detection
    const existingFiles = await db.comicFile.findMany({
      where: { libraryId },
      select: { id: true, path: true, hash: true, status: true },
    });

    const existingByPath = new Map(existingFiles.map((f) => [f.path, f]));
    const existingByHash = new Map<string, { id: string; path: string }>();
    for (const file of existingFiles) {
      if (file.hash) {
        existingByHash.set(file.hash, { id: file.id, path: file.path });
      }
    }

    // Get folder scan records for skip-unchanged
    const folderRecords = await db.folderScanRecord.findMany({
      where: { libraryId },
    });
    const folderRecordMap = new Map(folderRecords.map((r) => [r.folderPath, r]));

    // Build folder registry from series.json files
    const seriesJsonMap = new Map<string, SeriesMetadata>();
    for (const folder of folders) {
      if (folder.seriesJsonMetadata) {
        seriesJsonMap.set(folder.path, folder.seriesJsonMetadata);
      }
    }
    const folderRegistry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);

    // Track all discovered file paths for orphan detection
    const discoveredPaths = new Set<string>();

    // Phase 2: Process folders
    progress.phase = 'processing';
    emitProgress();

    // Log processing phase start
    if (options.jobId) {
      await createScanLog(
        options.jobId,
        libraryId,
        'indexing',
        'Processing folders',
        `${folders.length} folders to process`,
        'info'
      );
    }

    for (const folder of folders) {
      if (options.abortSignal?.aborted) {
        throw new Error('Scan aborted');
      }

      progress.currentFolder = folder.relativePath;
      emitProgress();

      // Check if folder can be skipped (unchanged since last scan)
      const record = folderRecordMap.get(folder.path);
      if (
        !options.forceFullScan &&
        record?.status === 'complete' &&
        record.lastMtime &&
        folder.mtime.getTime() <= record.lastMtime.getTime()
      ) {
        progress.foldersSkipped++;

        // Still need to track existing files for orphan detection
        const folderFiles = existingFiles.filter((f) => dirname(f.path) === folder.path);
        for (const f of folderFiles) {
          discoveredPaths.add(f.path);
        }

        continue;
      }

      // Process the folder
      try {
        const result = await processFolderTransaction(libraryId, library.rootPath, folder, {
          existingFilesByPath: existingByPath,
          existingFilesByHash: existingByHash,
          folderRegistry,
        });

        progress.filesCreated += result.filesCreated;
        progress.filesUpdated += result.filesUpdated;
        progress.seriesCreated += result.seriesCreated;

        if (result.coverJobId) {
          progress.coverJobsCreated++;
        }

        if (result.errors.length > 0) {
          progress.foldersErrored++;
        } else {
          progress.foldersComplete++;
        }

        // Log folder completion (only if there was activity)
        if (options.jobId && (result.filesCreated > 0 || result.seriesCreated > 0 || result.errors.length > 0)) {
          await createScanLog(
            options.jobId,
            libraryId,
            'indexing',
            `Processed: ${folder.relativePath}`,
            `${result.filesCreated} new files, ${result.seriesCreated} series${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`,
            result.errors.length > 0 ? 'warning' : 'success'
          );
        }

        // Track discovered files (using result from processFolderTransaction, no re-read needed)
        for (const path of result.discoveredPaths) {
          discoveredPaths.add(path);
        }
      } catch (err) {
        progress.foldersErrored++;
        scannerLogger.error(
          { libraryId, folder: folder.path, error: err instanceof Error ? err.message : String(err) },
          'Error processing folder'
        );

        // Log folder error
        if (options.jobId) {
          await createScanLog(
            options.jobId,
            libraryId,
            'indexing',
            `Error in folder: ${folder.relativePath}`,
            err instanceof Error ? err.message : String(err),
            'error'
          );
        }
      }

      emitProgress();

      // Yield to event loop between folders to allow API requests to acquire DB connections.
      // This prevents the scanner from monopolizing all connections and causing API timeouts.
      // 50ms delay is long enough to let pending requests through but short enough to not
      // significantly slow down scans.
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Phase 3: Handle orphaned files
    const { orphaned } = await processOrphanedFiles(libraryId, discoveredPaths);
    progress.filesOrphaned = orphaned;

    // Log orphan detection
    if (options.jobId && orphaned > 0) {
      await createScanLog(
        options.jobId,
        libraryId,
        'indexing',
        'Orphan detection complete',
        `${orphaned} orphaned files removed`,
        'info'
      );
    }

    // Mark stats as dirty and invalidate folder cache
    if (progress.filesCreated > 0 || progress.filesOrphaned > 0) {
      await markDirtyForFileChange(libraryId, progress.filesCreated > 0 ? 'file_added' : 'file_removed')
        .catch(() => {});
      await invalidateFolderCache(libraryId).catch(() => {});
    }

    // Phase 4: Wait for cover jobs (optional)
    if (!options.skipCovers) {
      progress.phase = 'covers';
      emitProgress();

      // Cover jobs run in background - we just report their creation
      const coverStatus = await getCoverQueueStatus();
      progress.coverJobsComplete = coverStatus.complete;
    }

    progress.phase = 'complete';
    progress.elapsedMs = Date.now() - startTime;
    // Await the callback to ensure status is updated before returning
    await emitProgress(true);

    // Log scan complete
    if (options.jobId) {
      await createScanLog(
        options.jobId,
        libraryId,
        'complete',
        'Scan complete',
        `${progress.filesCreated} new files, ${progress.seriesCreated} series, ${progress.filesOrphaned} orphaned`,
        'success'
      );
    }

    scannerLogger.info(
      {
        libraryId,
        foldersProcessed: progress.foldersComplete,
        foldersSkipped: progress.foldersSkipped,
        foldersErrored: progress.foldersErrored,
        filesCreated: progress.filesCreated,
        filesUpdated: progress.filesUpdated,
        filesOrphaned: progress.filesOrphaned,
        seriesCreated: progress.seriesCreated,
        coverJobsCreated: progress.coverJobsCreated,
        elapsedMs: progress.elapsedMs,
      },
      `Scan complete in ${progress.elapsedMs}ms`
    );

    return {
      foldersProcessed: progress.foldersComplete,
      foldersSkipped: progress.foldersSkipped,
      foldersErrored: progress.foldersErrored,
      filesCreated: progress.filesCreated,
      filesUpdated: progress.filesUpdated,
      filesOrphaned: progress.filesOrphaned,
      seriesCreated: progress.seriesCreated,
      coverJobsCreated: progress.coverJobsCreated,
      elapsedMs: progress.elapsedMs,
    };

  } catch (err) {
    progress.phase = 'error';
    progress.elapsedMs = Date.now() - startTime;
    // Await callback to ensure error status is recorded
    await emitProgress(true).catch(() => {});

    // Log scan error
    if (options.jobId) {
      await createScanLog(
        options.jobId,
        libraryId,
        'error',
        'Scan failed',
        err instanceof Error ? err.message : String(err),
        'error'
      ).catch(() => {}); // Don't let logging failure prevent error propagation
    }

    throw err;
  }
}

// =============================================================================
// Legacy API Compatibility
// =============================================================================

/**
 * @deprecated Use orchestrateScan instead
 * Maintained for backward compatibility during transition.
 */
export async function discoverFiles(
  rootPath: string,
  options: { includeHash?: boolean; loadSeriesJson?: boolean } = {}
): Promise<{
  files: DiscoveredFile[];
  errors: Array<{ path: string; error: string }>;
  seriesJsonMap?: Map<string, SeriesMetadata>;
}> {
  const files: DiscoveredFile[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  const seriesJsonMap = options.loadSeriesJson ? new Map<string, SeriesMetadata>() : undefined;

  async function scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      if (options.loadSeriesJson && seriesJsonMap) {
        const hasSeriesJson = entries.some((e) => e.name === 'series.json');
        if (hasSeriesJson) {
          try {
            const result = await readSeriesJson(dirPath);
            if (result.success && result.metadata) {
              seriesJsonMap.set(dirPath, result.metadata);
            }
          } catch (err) {
            errors.push({
              path: join(dirPath, 'series.json'),
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile() && isComicFile(entry.name)) {
          try {
            const fileInfo = await getFileInfo(fullPath, options.includeHash);
            files.push({
              path: fullPath,
              relativePath: relative(rootPath, fullPath),
              filename: basename(fullPath),
              extension: extname(fullPath).toLowerCase().slice(1),
              size: fileInfo.size,
              modifiedAt: fileInfo.modifiedAt,
              hash: fileInfo.hash,
            });
          } catch (error) {
            errors.push({
              path: fullPath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    } catch (error) {
      errors.push({
        path: dirPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await scanDirectory(rootPath);
  return { files, errors, seriesJsonMap };
}

/**
 * @deprecated Use orchestrateScan instead
 */
export async function scanLibrary(libraryId: string): Promise<ScanResult> {
  const startTime = Date.now();
  const db = getWriteDatabase();

  const library = await db.library.findUnique({ where: { id: libraryId } });
  if (!library) {
    throw new Error(`Library not found: ${libraryId}`);
  }

  const existingFiles = await db.comicFile.findMany({
    where: { libraryId },
    select: { id: true, path: true, hash: true, status: true },
  });

  const existingByPath = new Map(existingFiles.map((f) => [f.path, f]));
  const existingByHash = new Map<string, (typeof existingFiles)[0]>();
  for (const file of existingFiles) {
    if (file.hash) {
      existingByHash.set(file.hash, file);
    }
  }

  const { files: discoveredFiles, errors, seriesJsonMap } = await discoverFiles(library.rootPath, {
    loadSeriesJson: true,
  });

  const newFiles: DiscoveredFile[] = [];
  const movedFiles: Array<{ oldPath: string; newPath: string; fileId: string }> = [];
  const foundPaths = new Set<string>();
  let unchangedFiles = 0;

  for (const file of discoveredFiles) {
    foundPaths.add(file.path);

    const existingByPathMatch = existingByPath.get(file.path);

    if (existingByPathMatch) {
      unchangedFiles++;
    } else {
      const hash = await generatePartialHash(file.path);
      file.hash = hash;

      const existingByHashMatch = existingByHash.get(hash);

      if (existingByHashMatch && !foundPaths.has(existingByHashMatch.path)) {
        movedFiles.push({
          oldPath: existingByHashMatch.path,
          newPath: file.path,
          fileId: existingByHashMatch.id,
        });
        foundPaths.add(existingByHashMatch.path);
      } else {
        newFiles.push(file);
      }
    }
  }

  const orphanedFiles: Array<{ path: string; fileId: string }> = [];
  for (const existing of existingFiles) {
    if (!foundPaths.has(existing.path) && existing.status !== 'orphaned') {
      const wasMoved = movedFiles.some((m) => m.fileId === existing.id);
      if (!wasMoved) {
        orphanedFiles.push({ path: existing.path, fileId: existing.id });
      }
    }
  }

  const existingOrphanedCount = await db.comicFile.count({
    where: { libraryId, status: 'orphaned' },
  });

  return {
    libraryId,
    libraryPath: library.rootPath,
    totalFilesScanned: discoveredFiles.length,
    newFiles,
    movedFiles,
    orphanedFiles,
    existingOrphanedCount,
    unchangedFiles,
    errors,
    scanDuration: Date.now() - startTime,
    seriesJsonMap,
  };
}

/**
 * @deprecated Use orchestrateScan instead
 * Maintained for backward compatibility - applies scan results directly to database.
 */
export async function applyScanResults(scanResult: ScanResult): Promise<{
  added: number;
  moved: number;
  orphaned: number;
}> {
  const db = getWriteDatabase();

  let added = 0;
  let moved = 0;
  let orphaned = 0;

  // Add new files
  for (const file of scanResult.newFiles) {
    const hash = file.hash ?? (await generatePartialHash(file.path));

    await db.comicFile.create({
      data: {
        libraryId: scanResult.libraryId,
        path: file.path,
        relativePath: file.relativePath,
        filename: file.filename,
        extension: file.extension,
        size: file.size,
        modifiedAt: file.modifiedAt,
        hash,
        status: 'pending',
      },
    });
    added++;
  }

  // Update moved files
  for (const move of scanResult.movedFiles) {
    const relativePath = relative(scanResult.libraryPath, move.newPath);
    const filename = basename(move.newPath);

    await db.comicFile.update({
      where: { id: move.fileId },
      data: {
        path: move.newPath,
        relativePath,
        filename,
      },
    });
    moved++;
  }

  // Delete orphaned files
  for (const orphan of scanResult.orphanedFiles) {
    const file = await db.comicFile.findUnique({
      where: { id: orphan.fileId },
      select: { seriesId: true },
    });

    await markFileItemsUnavailable(orphan.fileId, db);
    await db.comicFile.delete({ where: { id: orphan.fileId } });
    orphaned++;

    // Check if series is now empty
    if (file?.seriesId) {
      await checkAndSoftDeleteEmptySeries(file.seriesId, db).catch(() => {});
    }
  }

  // Mark stats as dirty and invalidate folder cache
  if (added > 0) {
    await markDirtyForFileChange(scanResult.libraryId, 'file_added').catch(() => {});
  }
  if (orphaned > 0) {
    await markDirtyForFileChange(scanResult.libraryId, 'file_removed').catch(() => {});
  }
  if (added > 0 || orphaned > 0) {
    await invalidateFolderCache(scanResult.libraryId).catch(() => {});
  }

  return { added, moved, orphaned };
}

// =============================================================================
// Utility Functions (Unchanged)
// =============================================================================

export async function verifyLibraryPath(path: string): Promise<{
  valid: boolean;
  error?: string;
  isDirectory?: boolean;
}> {
  try {
    const stats = await stat(path);
    if (!stats.isDirectory()) {
      return { valid: false, error: 'Path is not a directory', isDirectory: false };
    }
    return { valid: true, isDirectory: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Path not accessible',
    };
  }
}

export async function getLibraryStats(libraryId: string): Promise<{
  total: number;
  pending: number;
  indexed: number;
  orphaned: number;
  quarantined: number;
}> {
  const db = getDatabase();

  const [total, pending, indexed, orphaned, quarantined] = await Promise.all([
    db.comicFile.count({ where: { libraryId } }),
    db.comicFile.count({ where: { libraryId, status: 'pending' } }),
    db.comicFile.count({ where: { libraryId, status: 'indexed' } }),
    db.comicFile.count({ where: { libraryId, status: 'orphaned' } }),
    db.comicFile.count({ where: { libraryId, status: 'quarantined' } }),
  ]);

  return { total, pending, indexed, orphaned, quarantined };
}

export type LibraryStatsMap = Map<
  string,
  { total: number; pending: number; indexed: number; orphaned: number; quarantined: number }
>;

/**
 * Get aggregated stats for all libraries.
 *
 * Uses in-memory caching to reduce database load during heavy operations.
 * TTL is shorter during active scans (30s) vs idle (5min).
 */
export async function getAllLibraryStats(): Promise<LibraryStatsMap> {
  // Check memory cache first
  const cached = memoryCache.get<LibraryStatsMap>(CacheKeys.LIBRARY_STATS_ALL);
  if (cached) {
    return cached;
  }

  const db = getDatabase();

  const statusCounts = await db.comicFile.groupBy({
    by: ['libraryId', 'status'],
    _count: { id: true },
  });

  const allLibraries = await db.library.findMany({ select: { id: true } });

  const statsMap: LibraryStatsMap = new Map();

  for (const library of allLibraries) {
    statsMap.set(library.id, { total: 0, pending: 0, indexed: 0, orphaned: 0, quarantined: 0 });
  }

  for (const row of statusCounts) {
    const stats = statsMap.get(row.libraryId);
    if (stats) {
      stats.total += row._count.id;
      const status = row.status as 'pending' | 'indexed' | 'orphaned' | 'quarantined';
      if (status in stats) {
        stats[status] = row._count.id;
      }
    }
  }

  // Cache with appropriate TTL based on scan state
  memoryCache.set(CacheKeys.LIBRARY_STATS_ALL, statsMap, memoryCache.getStatsTTL());

  return statsMap;
}

/**
 * Invalidate the library stats cache.
 * Call this when files are added/removed/updated.
 */
export function invalidateLibraryStatsCache(): void {
  memoryCache.invalidate('library-stats:');
}

/**
 * Cancel an ongoing scan and clean up resources.
 */
export async function cancelLibraryScan(libraryId: string): Promise<void> {
  await cancelLibraryCoverJobs(libraryId);
  resetScanSeriesCache();

  scannerLogger.info({ libraryId }, 'Library scan cancelled');
}

/**
 * Recover from server restart - resume interrupted scans.
 */
export async function recoverScanState(): Promise<void> {
  await recoverCoverJobs();
}

// =============================================================================
// Exports
// =============================================================================

export {
  processExistingFiles,
} from './scanner-legacy.service.js';
