/**
 * Scanner Service
 *
 * Recursively scans directories for comic files (CBR/CBZ).
 * Handles file discovery, change detection, and database synchronization.
 */

import { readdir, stat } from 'fs/promises';
import { join, relative, extname, basename, dirname } from 'path';
import { getDatabase } from './database.service.js';
import { generatePartialHash, getFileInfo } from './hash.service.js';
import { triggerCacheGenerationForNewFiles } from './cache-job.service.js';
import { autoLinkFileToSeries } from './series-matcher.service.js';
import { refreshMetadataCache } from './metadata-cache.service.js';
import { markDirtyForFileChange } from './stats-dirty.service.js';
import { refreshTagsFromFile } from './tag-autocomplete.service.js';
import { checkAndSoftDeleteEmptySeries, restoreSeries, syncSeriesFromSeriesJson } from './series/index.js';
import { markFileItemsUnavailable } from './collection/index.js';
import { logError, logInfo, logDebug, logWarn, createServiceLogger } from './logger.service.js';
import { readSeriesJson, getSeriesDefinitions, type SeriesMetadata } from './series-metadata.service.js';
import { mergeSeriesJsonToDb } from './series-json-sync.service.js';
import { FolderSeriesRegistry } from './folder-series-registry.service.js';

const logger = createServiceLogger('scanner');

// Supported comic file extensions
const COMIC_EXTENSIONS = new Set(['.cbz', '.cbr']);

/**
 * Discovered file during scan
 */
export interface DiscoveredFile {
  path: string;
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  modifiedAt: Date;
  hash?: string;
}

/**
 * Scan result with change detection
 */
export interface ScanResult {
  libraryId: string;
  libraryPath: string;
  totalFilesScanned: number;
  newFiles: DiscoveredFile[];
  movedFiles: Array<{ oldPath: string; newPath: string; fileId: string }>;
  orphanedFiles: Array<{ path: string; fileId: string }>;
  existingOrphanedCount: number; // Files already marked as orphaned that will be deleted
  unchangedFiles: number;
  errors: Array<{ path: string; error: string }>;
  scanDuration: number;
  /** Map of folder paths to series.json metadata found during scan */
  seriesJsonMap?: Map<string, SeriesMetadata>;
}

/**
 * Check if a file is a comic file based on extension.
 */
function isComicFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return COMIC_EXTENSIONS.has(ext);
}

/**
 * Options for file discovery during library scans.
 */
export interface DiscoverFilesOptions {
  /** Include file hashes for move detection */
  includeHash?: boolean;
  /** Load series.json files during traversal for efficient scanning */
  loadSeriesJson?: boolean;
}

/**
 * Result of file discovery including optional series.json metadata.
 */
export interface DiscoverFilesResult {
  files: DiscoveredFile[];
  errors: Array<{ path: string; error: string }>;
  /** Map of folder path to series.json metadata (if loadSeriesJson was enabled) */
  seriesJsonMap?: Map<string, SeriesMetadata>;
}

/**
 * Recursively discover all comic files in a directory.
 * Does not compute hashes - that's done during sync.
 *
 * When loadSeriesJson is enabled, also reads series.json files during
 * directory traversal for efficient metadata loading.
 */
export async function discoverFiles(
  rootPath: string,
  options: DiscoverFilesOptions = {}
): Promise<DiscoverFilesResult> {
  const files: DiscoveredFile[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  const seriesJsonMap = options.loadSeriesJson ? new Map<string, SeriesMetadata>() : undefined;

  async function scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      // Check for series.json in current directory if enabled
      if (options.loadSeriesJson && seriesJsonMap) {
        const hasSeriesJson = entries.some((e) => e.name === 'series.json');
        if (hasSeriesJson) {
          try {
            const result = await readSeriesJson(dirPath);
            if (result.success && result.metadata) {
              seriesJsonMap.set(dirPath, result.metadata);
              logDebug('scanner', `Found series.json in ${dirPath}`, { seriesName: result.metadata.seriesName });
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

        // Skip hidden files and directories
        if (entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await scanDirectory(fullPath);
        } else if (entry.isFile() && isComicFile(entry.name)) {
          try {
            const fileInfo = await getFileInfo(fullPath, options.includeHash);
            files.push({
              path: fullPath,
              relativePath: relative(rootPath, fullPath),
              filename: basename(fullPath),
              extension: extname(fullPath).toLowerCase().slice(1), // Remove the dot
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
 * Perform a full library scan with change detection.
 * Compares discovered files against database records.
 */
export async function scanLibrary(libraryId: string): Promise<ScanResult> {
  const startTime = Date.now();
  const db = getDatabase();

  // Get library info
  const library = await db.library.findUnique({
    where: { id: libraryId },
  });

  if (!library) {
    throw new Error(`Library not found: ${libraryId}`);
  }

  // Get existing files from database
  const existingFiles = await db.comicFile.findMany({
    where: { libraryId },
    select: {
      id: true,
      path: true,
      hash: true,
      status: true,
    },
  });

  // Create lookup maps
  const existingByPath = new Map(existingFiles.map((f) => [f.path, f]));
  const existingByHash = new Map<string, typeof existingFiles[0]>();
  for (const file of existingFiles) {
    if (file.hash) {
      existingByHash.set(file.hash, file);
    }
  }

  // Discover files on disk (with series.json loading for efficient metadata handling)
  const { files: discoveredFiles, errors, seriesJsonMap } = await discoverFiles(library.rootPath, {
    loadSeriesJson: true,
  });

  // Track results
  const newFiles: DiscoveredFile[] = [];
  const movedFiles: Array<{ oldPath: string; newPath: string; fileId: string }> = [];
  const foundPaths = new Set<string>();
  let unchangedFiles = 0;

  // Process each discovered file
  for (const file of discoveredFiles) {
    foundPaths.add(file.path);

    const existingByPathMatch = existingByPath.get(file.path);

    if (existingByPathMatch) {
      // File exists at same path
      unchangedFiles++;
    } else {
      // File not found at this path - compute hash for move detection
      const hash = await generatePartialHash(file.path);
      file.hash = hash;

      const existingByHashMatch = existingByHash.get(hash);

      if (existingByHashMatch && !foundPaths.has(existingByHashMatch.path)) {
        // Found by hash - file was moved
        movedFiles.push({
          oldPath: existingByHashMatch.path,
          newPath: file.path,
          fileId: existingByHashMatch.id,
        });
        foundPaths.add(existingByHashMatch.path); // Mark old path as accounted for
      } else {
        // New file
        newFiles.push(file);
      }
    }
  }

  // Find orphaned files (in DB but not on disk)
  const orphanedFiles: Array<{ path: string; fileId: string }> = [];
  for (const existing of existingFiles) {
    if (!foundPaths.has(existing.path) && existing.status !== 'orphaned') {
      // Check if this file was moved (already handled above)
      const wasMoved = movedFiles.some((m) => m.fileId === existing.id);
      if (!wasMoved) {
        orphanedFiles.push({
          path: existing.path,
          fileId: existing.id,
        });
      }
    }
  }

  const scanDuration = Date.now() - startTime;

  // Count files already marked as orphaned from previous scans (will be deleted on apply)
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
    scanDuration,
    seriesJsonMap,
  };
}

/**
 * Apply scan results to the database.
 * This should be called after user confirms the changes.
 */
export async function applyScanResults(scanResult: ScanResult): Promise<{
  added: number;
  moved: number;
  orphaned: number;
}> {
  const db = getDatabase();

  let added = 0;
  let moved = 0;
  let orphaned = 0;
  const newFileIds: string[] = [];

  // Add new files
  for (const file of scanResult.newFiles) {
    // Ensure we have a hash
    const hash = file.hash ?? (await generatePartialHash(file.path));

    const newFile = await db.comicFile.create({
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
    newFileIds.push(newFile.id);
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

  // DELETE orphaned files and track affected series for soft-delete check
  const affectedSeriesIds = new Set<string>();

  for (const orphan of scanResult.orphanedFiles) {
    // Get the file to find its seriesId before deletion
    const file = await db.comicFile.findUnique({
      where: { id: orphan.fileId },
      select: { seriesId: true, id: true },
    });

    if (file?.seriesId) {
      affectedSeriesIds.add(file.seriesId);
    }

    // Mark any collection items referencing this file as unavailable
    await markFileItemsUnavailable(orphan.fileId);

    // DELETE the ComicFile record (cascades to FileMetadata, ReadingProgress, etc.)
    await db.comicFile.delete({
      where: { id: orphan.fileId },
    });

    orphaned++;
  }

  // Check affected series for soft-delete (series with 0 issues)
  // and recalculate covers for series that aren't deleted
  for (const seriesId of affectedSeriesIds) {
    try {
      const wasDeleted = await checkAndSoftDeleteEmptySeries(seriesId);
      if (wasDeleted) {
        logInfo('scanner', `Soft-deleted empty series: ${seriesId}`, { seriesId });
      } else {
        // Series still has issues - recalculate cover (first issue may have changed)
        try {
          const { recalculateSeriesCover } = await import('./cover.service.js');
          await recalculateSeriesCover(seriesId);
        } catch (err) {
          // Non-critical - series cover recalculation can fail without affecting scan
          logWarn('scanner', 'Failed to recalculate series cover (non-critical)', {
            seriesId,
            action: 'recalculate-cover',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      logError('scanner', err, { action: 'soft-delete-check', seriesId });
    }
  }

  // Also clean up any files already marked as 'orphaned' from previous scans
  const existingOrphanedFiles = await db.comicFile.findMany({
    where: { libraryId: scanResult.libraryId, status: 'orphaned' },
    select: { id: true, seriesId: true },
  });

  if (existingOrphanedFiles.length > 0) {
    logInfo('scanner', `Cleaning up ${existingOrphanedFiles.length} previously orphaned files`, { count: existingOrphanedFiles.length });

    for (const file of existingOrphanedFiles) {
      if (file.seriesId) {
        affectedSeriesIds.add(file.seriesId);
      }

      // Mark collection items as unavailable
      await markFileItemsUnavailable(file.id);

      // Delete the file record
      await db.comicFile.delete({
        where: { id: file.id },
      });

      orphaned++;
    }

    // Check newly affected series for soft-delete and recalculate covers
    for (const seriesId of affectedSeriesIds) {
      try {
        const wasDeleted = await checkAndSoftDeleteEmptySeries(seriesId);
        if (!wasDeleted) {
          // Series still has issues - recalculate cover
          try {
            const { recalculateSeriesCover } = await import('./cover.service.js');
            await recalculateSeriesCover(seriesId);
          } catch {
            // Non-critical
          }
        }
      } catch (err) {
        logError('scanner', err, { action: 'soft-delete-check', seriesId });
      }
    }
  }

  // Trigger cache generation for new files (covers and thumbnails)
  if (newFileIds.length > 0) {
    triggerCacheGenerationForNewFiles(newFileIds);

    // Auto-link new files to series (Series-Centric Architecture)
    // This runs in the background and doesn't block the scan completion
    // Pass seriesJsonMap for efficient series.json-based linking
    autoLinkNewFilesToSeries(newFileIds, scanResult.libraryPath, scanResult.seriesJsonMap).catch((err) => {
      logError('scanner', err, { action: 'auto-link-files' });
    });
  }

  // Mark stats as dirty if files were added or orphaned
  if (added > 0) {
    try {
      await markDirtyForFileChange(scanResult.libraryId, 'file_added');
    } catch {
      // Non-critical, continue even if dirty marking fails
    }
  }

  if (orphaned > 0) {
    try {
      await markDirtyForFileChange(scanResult.libraryId, 'file_removed');
    } catch {
      // Non-critical, continue even if dirty marking fails
    }
  }

  return { added, moved, orphaned };
}

/**
 * Auto-link newly scanned files to series.
 * Called after scan results are applied.
 *
 * This function:
 * 1. Builds a folder series registry from series.json files (supports multi-series)
 * 2. Scaffolds all series definitions from series.json files
 * 3. Extracts ComicInfo.xml metadata from each file and caches it
 * 4. Uses folder-scoped matching first, then falls back to database-wide matching
 */
async function autoLinkNewFilesToSeries(
  fileIds: string[],
  libraryPath: string,
  seriesJsonMap?: Map<string, SeriesMetadata>
): Promise<void> {
  let metadataCached = 0;
  let linked = 0;
  let created = 0;
  let failed = 0;
  let seriesScaffolded = 0;
  let folderScopedMatches = 0;
  const db = getDatabase();

  // Build folder series registry from seriesJsonMap (handles multi-series)
  const folderRegistry = seriesJsonMap
    ? FolderSeriesRegistry.buildFromMap(seriesJsonMap)
    : undefined;

  if (folderRegistry) {
    const stats = folderRegistry.getStats();
    if (stats.series > 0) {
      logDebug('scanner', `Built folder series registry`, {
        folders: stats.folders,
        series: stats.series,
        multiSeriesFolders: stats.multiSeriesFolders,
      });
    }
  }

  // Track processed folders to avoid duplicate scaffolding
  const processedFolders = new Set<string>();

  for (const fileId of fileIds) {
    try {
      // Get file info to determine its folder
      const file = await db.comicFile.findUnique({
        where: { id: fileId },
        select: { path: true, seriesId: true },
      });

      if (!file) continue;

      const folderPath = dirname(file.path);

      // Scaffold all series from folder's series.json (if not already processed)
      if (seriesJsonMap && !processedFolders.has(folderPath)) {
        processedFolders.add(folderPath);

        const metadata = seriesJsonMap.get(folderPath);
        if (metadata) {
          // Get all series definitions (handles both v1 and v2 formats)
          const definitions = getSeriesDefinitions(metadata);

          if (definitions.length > 0) {
            try {
              // syncSeriesFromSeriesJson processes ALL definitions in one call
              // and returns the first series for backward compatibility
              const series = await syncSeriesFromSeriesJson(folderPath);
              if (series) {
                await mergeSeriesJsonToDb(series.id, folderPath);
                seriesScaffolded += definitions.length;
                logDebug('scanner', `Scaffolded ${definitions.length} series from series.json`, {
                  seriesId: series.id,
                  seriesNames: definitions.map((d) => d.name),
                  folder: folderPath,
                });
              } else {
                logError('scanner', new Error('syncSeriesFromSeriesJson returned null'), {
                  action: 'scaffold-series',
                  folder: folderPath,
                  definitionCount: definitions.length,
                });
              }
            } catch (err) {
              logError('scanner', err, {
                action: 'scaffold-series',
                folder: folderPath,
                definitionCount: definitions.length,
              });
            }
          }
        }
      }

      // Step 1: Extract and cache metadata from ComicInfo.xml
      const metadataSuccess = await refreshMetadataCache(fileId);
      if (metadataSuccess) {
        metadataCached++;
        // Extract tags for autocomplete after metadata is cached
        await refreshTagsFromFile(fileId);
      }

      // Step 2: Try to link to series using folder registry first, then database-wide
      const result = await autoLinkFileToSeries(fileId, { folderRegistry });
      if (result.success) {
        if (result.matchType === 'created') {
          created++;
        }
        if (result.matchType?.startsWith('folder-')) {
          folderScopedMatches++;
        }
        linked++;

        // Update file status to 'indexed' since we've processed it
        await db.comicFile.update({
          where: { id: fileId },
          data: { status: 'indexed' },
        });
      }
    } catch {
      failed++;
    }
  }

  if (metadataCached > 0 || linked > 0 || created > 0 || seriesScaffolded > 0) {
    logInfo('scanner', `Processed ${fileIds.length} files`, {
      totalFiles: fileIds.length,
      metadataCached,
      linked,
      newSeries: created,
      seriesScaffolded,
      folderScopedMatches,
      failed,
    });
  }
}

/**
 * Process existing files that haven't been linked to series yet.
 * This extracts metadata and creates/links to series for all unprocessed files.
 */
export async function processExistingFiles(libraryId?: string): Promise<{
  processed: number;
  linked: number;
  created: number;
  failed: number;
}> {
  const db = getDatabase();

  // Find files that either:
  // 1. Don't have metadata cached yet, or
  // 2. Don't have a seriesId (not linked to series)
  const whereClause = libraryId
    ? {
        libraryId,
        OR: [
          { metadata: null },
          { seriesId: null },
        ],
      }
    : {
        OR: [
          { metadata: null },
          { seriesId: null },
        ],
      };

  const files = await db.comicFile.findMany({
    where: whereClause,
    select: { id: true },
  });

  if (files.length === 0) {
    return { processed: 0, linked: 0, created: 0, failed: 0 };
  }

  const fileIds = files.map((f) => f.id);
  let metadataCached = 0;
  let linked = 0;
  let created = 0;
  let failed = 0;

  for (const fileId of fileIds) {
    try {
      // Step 1: Extract and cache metadata from ComicInfo.xml
      const metadataSuccess = await refreshMetadataCache(fileId);
      if (metadataSuccess) {
        metadataCached++;
        // Extract tags for autocomplete after metadata is cached
        await refreshTagsFromFile(fileId);
      }

      // Step 2: Try to link to series using the extracted metadata
      const result = await autoLinkFileToSeries(fileId);
      if (result.success) {
        if (result.matchType === 'created') {
          created++;
        }
        linked++;

        // Update file status to 'indexed'
        await db.comicFile.update({
          where: { id: fileId },
          data: { status: 'indexed' },
        });
      }
    } catch {
      failed++;
    }
  }

  logInfo('scanner', `Processed ${fileIds.length} existing files`, {
    totalFiles: fileIds.length,
    metadataCached,
    linked,
    newSeries: created,
    failed,
  });

  return { processed: fileIds.length, linked, created, failed };
}

/**
 * Quick scan to check if library path is accessible.
 */
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

/**
 * Get a summary of library file counts by status.
 */
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

/**
 * Get stats for all libraries in a single query.
 * More efficient than calling getLibraryStats for each library.
 */
export async function getAllLibraryStats(): Promise<
  Map<string, { total: number; pending: number; indexed: number; orphaned: number; quarantined: number }>
> {
  const db = getDatabase();

  // Use groupBy to get counts by library and status in one query
  const statusCounts = await db.comicFile.groupBy({
    by: ['libraryId', 'status'],
    _count: {
      id: true,
    },
  });

  // Also get all library IDs to ensure we have stats for empty libraries
  const allLibraries = await db.library.findMany({
    select: { id: true },
  });

  // Initialize stats for all libraries with zeros
  const statsMap = new Map<
    string,
    { total: number; pending: number; indexed: number; orphaned: number; quarantined: number }
  >();

  for (const library of allLibraries) {
    statsMap.set(library.id, {
      total: 0,
      pending: 0,
      indexed: 0,
      orphaned: 0,
      quarantined: 0,
    });
  }

  // Populate from groupBy results
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

  return statsMap;
}
