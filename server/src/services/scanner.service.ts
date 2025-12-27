/**
 * Scanner Service
 *
 * Recursively scans directories for comic files (CBR/CBZ).
 * Handles file discovery, change detection, and database synchronization.
 */

import { readdir, stat } from 'fs/promises';
import { join, relative, extname, basename } from 'path';
import { getDatabase } from './database.service.js';
import { generatePartialHash, getFileInfo } from './hash.service.js';
import { triggerCacheGenerationForNewFiles } from './cache-job.service.js';
import { autoLinkFileToSeries } from './series-matcher.service.js';
import { refreshMetadataCache } from './metadata-cache.service.js';
import { markDirtyForFileChange } from './stats-dirty.service.js';
import { refreshTagsFromFile } from './tag-autocomplete.service.js';
import { checkAndSoftDeleteEmptySeries, restoreSeries } from './series/index.js';
import { markFileItemsUnavailable } from './collection.service.js';
import { logError, logInfo, logDebug, createServiceLogger } from './logger.service.js';

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
}

/**
 * Check if a file is a comic file based on extension.
 */
function isComicFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return COMIC_EXTENSIONS.has(ext);
}

/**
 * Recursively discover all comic files in a directory.
 * Does not compute hashes - that's done during sync.
 */
export async function discoverFiles(
  rootPath: string,
  options: { includeHash?: boolean } = {}
): Promise<{ files: DiscoveredFile[]; errors: Array<{ path: string; error: string }> }> {
  const files: DiscoveredFile[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  async function scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

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
  return { files, errors };
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

  // Discover files on disk
  const { files: discoveredFiles, errors } = await discoverFiles(library.rootPath);

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
  for (const seriesId of affectedSeriesIds) {
    try {
      const wasDeleted = await checkAndSoftDeleteEmptySeries(seriesId);
      if (wasDeleted) {
        logInfo('scanner', `Soft-deleted empty series: ${seriesId}`, { seriesId });
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

    // Check newly affected series for soft-delete
    for (const seriesId of affectedSeriesIds) {
      try {
        await checkAndSoftDeleteEmptySeries(seriesId);
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
    autoLinkNewFilesToSeries(newFileIds).catch((err) => {
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
 * 1. Extracts ComicInfo.xml metadata from each file and caches it
 * 2. Uses the extracted metadata to create/link to series
 */
async function autoLinkNewFilesToSeries(fileIds: string[]): Promise<void> {
  let metadataCached = 0;
  let linked = 0;
  let created = 0;
  let failed = 0;
  const db = getDatabase();

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

  if (metadataCached > 0 || linked > 0 || created > 0) {
    logInfo('scanner', `Processed ${fileIds.length} files`, {
      totalFiles: fileIds.length,
      metadataCached,
      linked,
      newSeries: created,
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
