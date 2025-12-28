/**
 * File Operations Service
 *
 * Handles file operations (move, rename, delete, quarantine) with
 * database synchronization and operation logging for rollback support.
 */

import { rename, unlink, copyFile, mkdir, access, stat } from 'fs/promises';
import { dirname, join, basename, relative } from 'path';
import { getDatabase } from './database.service.js';
import { generatePartialHash } from './hash.service.js';
import { checkAndSoftDeleteEmptySeries } from './series/index.js';
import { markFileItemsUnavailable } from './collection.service.js';
import { logError, logInfo } from './logger.service.js';

// =============================================================================
// Types
// =============================================================================

export interface FileOperationResult {
  success: boolean;
  operation: string;
  source: string;
  destination?: string;
  error?: string;
  logId?: string;
}

export interface MoveOptions {
  /** If true, creates parent directories if they don't exist */
  createDirs?: boolean;
  /** If true, overwrites destination if it exists */
  overwrite?: boolean;
  /** Batch ID if part of a batch operation */
  batchId?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary.
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore EEXIST errors
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Log a file operation to the database.
 */
async function logOperation(params: {
  operation: string;
  source: string;
  destination?: string;
  status: string;
  reversible: boolean;
  metadata?: Record<string, unknown>;
  error?: string;
  batchId?: string;
}): Promise<string> {
  const db = getDatabase();

  const log = await db.operationLog.create({
    data: {
      operation: params.operation,
      source: params.source,
      destination: params.destination,
      status: params.status,
      reversible: params.reversible,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      error: params.error,
      batchId: params.batchId,
    },
  });

  return log.id;
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Move a file and update the database record.
 */
export async function moveFile(
  fileId: string,
  destinationPath: string,
  options: MoveOptions = {}
): Promise<FileOperationResult> {
  const db = getDatabase();

  // Get the file record
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: { library: true },
  });

  if (!file) {
    return {
      success: false,
      operation: 'move',
      source: '',
      error: `File not found: ${fileId}`,
    };
  }

  const sourcePath = file.path;

  try {
    // Check source exists
    if (!(await fileExists(sourcePath))) {
      return {
        success: false,
        operation: 'move',
        source: sourcePath,
        error: 'Source file does not exist',
      };
    }

    // Check destination doesn't exist (unless overwrite)
    if (!options.overwrite && (await fileExists(destinationPath))) {
      return {
        success: false,
        operation: 'move',
        source: sourcePath,
        destination: destinationPath,
        error: 'Destination file already exists',
      };
    }

    // Create destination directory if needed
    if (options.createDirs) {
      await ensureDir(dirname(destinationPath));
    }

    // Perform the move
    await rename(sourcePath, destinationPath);

    // Update database record
    const newRelativePath = relative(file.library.rootPath, destinationPath);
    const newFilename = basename(destinationPath);

    await db.comicFile.update({
      where: { id: fileId },
      data: {
        path: destinationPath,
        relativePath: newRelativePath,
        filename: newFilename,
      },
    });

    // Log the operation
    const logId = await logOperation({
      operation: 'move',
      source: sourcePath,
      destination: destinationPath,
      status: 'success',
      reversible: true,
      metadata: {
        fileId,
        originalFilename: file.filename,
        newFilename,
      },
      batchId: options.batchId,
    });

    return {
      success: true,
      operation: 'move',
      source: sourcePath,
      destination: destinationPath,
      logId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await logOperation({
      operation: 'move',
      source: sourcePath,
      destination: destinationPath,
      status: 'failed',
      reversible: false,
      error: errorMessage,
      batchId: options.batchId,
    });

    return {
      success: false,
      operation: 'move',
      source: sourcePath,
      destination: destinationPath,
      error: errorMessage,
    };
  }
}

/**
 * Rename a file (move within the same directory).
 */
export async function renameFile(
  fileId: string,
  newFilename: string,
  options: { batchId?: string } = {}
): Promise<FileOperationResult> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return {
      success: false,
      operation: 'rename',
      source: '',
      error: `File not found: ${fileId}`,
    };
  }

  const destinationPath = join(dirname(file.path), newFilename);

  return moveFile(fileId, destinationPath, { batchId: options.batchId });
}

/**
 * Delete a file and remove it from the database.
 */
export async function deleteFile(
  fileId: string,
  options: { batchId?: string } = {}
): Promise<FileOperationResult> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return {
      success: false,
      operation: 'delete',
      source: '',
      error: `File not found: ${fileId}`,
    };
  }

  const sourcePath = file.path;

  try {
    // Check file exists
    if (await fileExists(sourcePath)) {
      // Delete the actual file
      await unlink(sourcePath);
    }

    // Remove from database
    await db.comicFile.delete({
      where: { id: fileId },
    });

    // Log the operation (not reversible after deletion)
    const logId = await logOperation({
      operation: 'delete',
      source: sourcePath,
      status: 'success',
      reversible: false,
      metadata: {
        fileId,
        filename: file.filename,
        size: file.size,
        hash: file.hash,
      },
      batchId: options.batchId,
    });

    return {
      success: true,
      operation: 'delete',
      source: sourcePath,
      logId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await logOperation({
      operation: 'delete',
      source: sourcePath,
      status: 'failed',
      reversible: false,
      error: errorMessage,
      batchId: options.batchId,
    });

    return {
      success: false,
      operation: 'delete',
      source: sourcePath,
      error: errorMessage,
    };
  }
}

/**
 * Move a file to the quarantine folder.
 * Quarantine path: {libraryRoot}/CorruptedData/{parentFolder}/{filename}
 */
export async function quarantineFile(
  fileId: string,
  reason: string,
  options: { batchId?: string } = {}
): Promise<FileOperationResult> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: { library: true },
  });

  if (!file) {
    return {
      success: false,
      operation: 'quarantine',
      source: '',
      error: `File not found: ${fileId}`,
    };
  }

  const sourcePath = file.path;

  // Build quarantine path: {libraryRoot}/CorruptedData/{relativeDirPath}/{filename}
  const relativeDir = dirname(file.relativePath);
  const quarantineDir = join(file.library.rootPath, 'CorruptedData', relativeDir);
  const quarantinePath = join(quarantineDir, file.filename);

  try {
    // Check source exists
    if (!(await fileExists(sourcePath))) {
      // Mark as quarantined even if file doesn't exist (already gone)
      await db.comicFile.update({
        where: { id: fileId },
        data: {
          status: 'quarantined',
          path: quarantinePath,
          relativePath: relative(file.library.rootPath, quarantinePath),
        },
      });

      return {
        success: true,
        operation: 'quarantine',
        source: sourcePath,
        destination: quarantinePath,
      };
    }

    // Create quarantine directory
    await ensureDir(quarantineDir);

    // Move to quarantine
    await rename(sourcePath, quarantinePath);

    // Update database
    await db.comicFile.update({
      where: { id: fileId },
      data: {
        status: 'quarantined',
        path: quarantinePath,
        relativePath: relative(file.library.rootPath, quarantinePath),
      },
    });

    // Log the operation
    const logId = await logOperation({
      operation: 'quarantine',
      source: sourcePath,
      destination: quarantinePath,
      status: 'success',
      reversible: true,
      metadata: {
        fileId,
        filename: file.filename,
        reason,
      },
      batchId: options.batchId,
    });

    return {
      success: true,
      operation: 'quarantine',
      source: sourcePath,
      destination: quarantinePath,
      logId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await logOperation({
      operation: 'quarantine',
      source: sourcePath,
      destination: quarantinePath,
      status: 'failed',
      reversible: false,
      error: errorMessage,
      batchId: options.batchId,
    });

    return {
      success: false,
      operation: 'quarantine',
      source: sourcePath,
      destination: quarantinePath,
      error: errorMessage,
    };
  }
}

/**
 * Restore a file from quarantine to its original location.
 */
export async function restoreFromQuarantine(
  fileId: string,
  options: { batchId?: string } = {}
): Promise<FileOperationResult> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: { library: true },
  });

  if (!file) {
    return {
      success: false,
      operation: 'restore',
      source: '',
      error: `File not found: ${fileId}`,
    };
  }

  if (file.status !== 'quarantined') {
    return {
      success: false,
      operation: 'restore',
      source: file.path,
      error: 'File is not quarantined',
    };
  }

  // Find the original path from operation logs
  const logs = await db.operationLog.findMany({
    where: {
      operation: 'quarantine',
      destination: file.path,
      status: 'success',
    },
    orderBy: { timestamp: 'desc' },
    take: 1,
  });

  if (logs.length === 0) {
    return {
      success: false,
      operation: 'restore',
      source: file.path,
      error: 'Could not find original location in operation logs',
    };
  }

  const originalPath = logs[0]!.source;
  const quarantinePath = file.path;

  try {
    // Check quarantined file exists
    if (!(await fileExists(quarantinePath))) {
      return {
        success: false,
        operation: 'restore',
        source: quarantinePath,
        error: 'Quarantined file not found',
      };
    }

    // Ensure original directory exists
    await ensureDir(dirname(originalPath));

    // Move back
    await rename(quarantinePath, originalPath);

    // Update database
    await db.comicFile.update({
      where: { id: fileId },
      data: {
        status: 'pending', // Needs re-indexing
        path: originalPath,
        relativePath: relative(file.library.rootPath, originalPath),
      },
    });

    // Log the operation
    const logId = await logOperation({
      operation: 'restore',
      source: quarantinePath,
      destination: originalPath,
      status: 'success',
      reversible: true,
      metadata: { fileId },
      batchId: options.batchId,
    });

    return {
      success: true,
      operation: 'restore',
      source: quarantinePath,
      destination: originalPath,
      logId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      operation: 'restore',
      source: quarantinePath,
      destination: originalPath,
      error: errorMessage,
    };
  }
}

/**
 * Remove orphaned files from the database (not the filesystem).
 */
export async function removeOrphanedRecords(libraryId: string): Promise<number> {
  const db = getDatabase();

  // Get orphaned files with their seriesIds before deleting
  const orphanedFiles = await db.comicFile.findMany({
    where: { libraryId, status: 'orphaned' },
    select: { id: true, seriesId: true },
  });

  if (orphanedFiles.length === 0) {
    return 0;
  }

  const orphanedFileIds = orphanedFiles.map((f) => f.id);
  const affectedSeriesIds = new Set(
    orphanedFiles.filter((f) => f.seriesId).map((f) => f.seriesId!)
  );

  // Mark collection items referencing these files as unavailable
  for (const fileId of orphanedFileIds) {
    await markFileItemsUnavailable(fileId);
  }

  // Delete orphaned records
  const result = await db.comicFile.deleteMany({
    where: { libraryId, status: 'orphaned' },
  });

  // Check affected series for soft-delete (series with 0 remaining issues)
  for (const seriesId of affectedSeriesIds) {
    try {
      const wasDeleted = await checkAndSoftDeleteEmptySeries(seriesId);
      if (wasDeleted) {
        logInfo('file-operations', `Soft-deleted empty series: ${seriesId}`);
      }
    } catch (err) {
      logError('file-operations', err, { action: 'soft-delete-series-check', seriesId });
    }
  }

  return result.count;
}

// =============================================================================
// Folder Operations
// =============================================================================

export interface FolderRenameResult {
  success: boolean;
  operation: 'folder_rename';
  oldPath: string;
  newPath: string;
  filesUpdated: number;
  error?: string;
  logId?: string;
}

/**
 * Rename a folder within a library.
 *
 * This operation:
 * 1. Renames the folder on the filesystem
 * 2. Updates all file paths in the database that were under that folder
 * 3. Logs the operation for potential rollback
 *
 * @param libraryId - The library containing the folder
 * @param folderPath - The relative path of the folder to rename (e.g., "Marvel/2023")
 * @param newFolderName - The new name for the folder (just the name, not a path)
 */
export async function renameFolder(
  libraryId: string,
  folderPath: string,
  newFolderName: string
): Promise<FolderRenameResult> {
  const db = getDatabase();

  // Get the library
  const library = await db.library.findUnique({
    where: { id: libraryId },
  });

  if (!library) {
    return {
      success: false,
      operation: 'folder_rename',
      oldPath: folderPath,
      newPath: '',
      filesUpdated: 0,
      error: `Library not found: ${libraryId}`,
    };
  }

  // Validate new folder name (no path separators, no invalid chars)
  if (newFolderName.includes('/') || newFolderName.includes('\\')) {
    return {
      success: false,
      operation: 'folder_rename',
      oldPath: folderPath,
      newPath: '',
      filesUpdated: 0,
      error: 'New folder name cannot contain path separators',
    };
  }

  // Build paths
  const oldAbsolutePath = join(library.rootPath, folderPath);
  const parentPath = dirname(folderPath);
  const newRelativePath = parentPath === '.' ? newFolderName : `${parentPath}/${newFolderName}`;
  const newAbsolutePath = join(library.rootPath, newRelativePath);

  // Check source folder exists
  if (!(await fileExists(oldAbsolutePath))) {
    return {
      success: false,
      operation: 'folder_rename',
      oldPath: folderPath,
      newPath: newRelativePath,
      filesUpdated: 0,
      error: 'Source folder does not exist',
    };
  }

  // Check destination doesn't already exist
  if (await fileExists(newAbsolutePath)) {
    return {
      success: false,
      operation: 'folder_rename',
      oldPath: folderPath,
      newPath: newRelativePath,
      filesUpdated: 0,
      error: 'A folder with that name already exists',
    };
  }

  // Find all files that need path updates
  // Use exact folder matching to avoid matching "Marvel Comics" when renaming "Marvel"
  const folderPrefix = folderPath + '/';
  const files = await db.comicFile.findMany({
    where: {
      libraryId,
      OR: [
        { relativePath: { startsWith: folderPrefix } }, // Files in subfolders
        {
          relativePath: {
            startsWith: folderPath,
            // Also match files directly in the folder (relativePath starts with folderPath and has only filename after)
          },
        },
      ],
    },
  });

  // Filter to get only files actually in this folder or subfolders
  // This handles the edge case where "Marvel" shouldn't match "Marvel Comics"
  const filesToUpdate = files.filter((file) => {
    return (
      file.relativePath.startsWith(folderPrefix) || // In subfolder
      file.relativePath === folderPath || // Is the folder itself (shouldn't happen for files)
      dirname(file.relativePath) === folderPath || // Direct child of folder
      file.relativePath.startsWith(folderPrefix) // Nested
    );
  });

  try {
    // Rename the folder on the filesystem
    await rename(oldAbsolutePath, newAbsolutePath);

    // Update all file paths in the database
    const newFolderPrefix = newRelativePath + '/';
    let updatedCount = 0;

    for (const file of filesToUpdate) {
      // Calculate the new relative path
      let newFileRelativePath: string;
      if (file.relativePath.startsWith(folderPrefix)) {
        // File is in a subfolder - replace prefix
        newFileRelativePath = newFolderPrefix + file.relativePath.slice(folderPrefix.length);
      } else if (dirname(file.relativePath) === folderPath) {
        // File is directly in the folder
        newFileRelativePath = newRelativePath + '/' + file.filename;
      } else {
        continue; // Shouldn't happen, but skip if it does
      }

      const newFileAbsolutePath = join(library.rootPath, newFileRelativePath);

      await db.comicFile.update({
        where: { id: file.id },
        data: {
          path: newFileAbsolutePath,
          relativePath: newFileRelativePath,
        },
      });
      updatedCount++;
    }

    // Log the operation
    const logId = await logOperation({
      operation: 'folder_rename',
      source: oldAbsolutePath,
      destination: newAbsolutePath,
      status: 'success',
      reversible: true,
      metadata: {
        libraryId,
        oldRelativePath: folderPath,
        newRelativePath,
        filesUpdated: updatedCount,
      },
    });

    return {
      success: true,
      operation: 'folder_rename',
      oldPath: folderPath,
      newPath: newRelativePath,
      filesUpdated: updatedCount,
      logId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Try to rollback filesystem change if database updates failed
    try {
      if (await fileExists(newAbsolutePath)) {
        await rename(newAbsolutePath, oldAbsolutePath);
      }
    } catch {
      // Rollback failed - log it
      // Note: Rollback failure during error recovery - logged but not thrown
    }

    await logOperation({
      operation: 'folder_rename',
      source: oldAbsolutePath,
      destination: newAbsolutePath,
      status: 'failed',
      reversible: false,
      error: errorMessage,
      metadata: {
        libraryId,
        oldRelativePath: folderPath,
        newRelativePath,
      },
    });

    return {
      success: false,
      operation: 'folder_rename',
      oldPath: folderPath,
      newPath: newRelativePath,
      filesUpdated: 0,
      error: errorMessage,
    };
  }
}

// =============================================================================
// File Verification
// =============================================================================

/**
 * Verify a file exists on disk and matches the database record.
 */
export async function verifyFile(fileId: string): Promise<{
  exists: boolean;
  hashMatch: boolean | null;
  sizeMatch: boolean | null;
}> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return { exists: false, hashMatch: null, sizeMatch: null };
  }

  try {
    const stats = await stat(file.path);
    const exists = true;
    const sizeMatch = stats.size === file.size;

    let hashMatch: boolean | null = null;
    if (file.hash) {
      const currentHash = await generatePartialHash(file.path);
      hashMatch = currentHash === file.hash;
    }

    return { exists, hashMatch, sizeMatch };
  } catch {
    return { exists: false, hashMatch: null, sizeMatch: null };
  }
}

// =============================================================================
// Original Filename Tracking
// =============================================================================

export interface RenameHistoryEntry {
  from: string;
  to: string;
  timestamp: string;
  templateId?: string;
}

/**
 * Track the original filename before a template-based rename.
 * Only creates a record if one doesn't exist (first rename).
 */
export async function trackOriginalFilename(
  fileId: string,
  templateId?: string
): Promise<void> {
  const db = getDatabase();

  // Check if already tracked
  const existing = await db.originalFilename.findUnique({
    where: { fileId },
  });

  if (existing) {
    // Already tracked - don't overwrite
    return;
  }

  // Get current file info
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return;
  }

  // Create tracking record
  await db.originalFilename.create({
    data: {
      fileId,
      originalFilename: file.filename,
      originalPath: file.path,
      renameHistory: JSON.stringify([]),
    },
  });

  logInfo('file-operations', 'Tracked original filename', {
    fileId,
    originalFilename: file.filename,
  });
}

/**
 * Add a rename event to the file's history.
 */
export async function addRenameToHistory(
  fileId: string,
  fromFilename: string,
  toFilename: string,
  templateId?: string
): Promise<void> {
  const db = getDatabase();

  const tracking = await db.originalFilename.findUnique({
    where: { fileId },
  });

  if (!tracking) {
    // No tracking record - create one first
    await trackOriginalFilename(fileId, templateId);
    return addRenameToHistory(fileId, fromFilename, toFilename, templateId);
  }

  // Parse existing history
  let history: RenameHistoryEntry[] = [];
  try {
    history = JSON.parse(tracking.renameHistory);
  } catch {
    history = [];
  }

  // Add new entry
  history.push({
    from: fromFilename,
    to: toFilename,
    timestamp: new Date().toISOString(),
    templateId,
  });

  // Update record
  await db.originalFilename.update({
    where: { fileId },
    data: {
      renameHistory: JSON.stringify(history),
      lastRenamedAt: new Date(),
    },
  });
}

/**
 * Get the original filename for a file.
 */
export async function getOriginalFilename(
  fileId: string
): Promise<{ originalFilename: string; originalPath: string; history: RenameHistoryEntry[] } | null> {
  const db = getDatabase();

  const tracking = await db.originalFilename.findUnique({
    where: { fileId },
  });

  if (!tracking) {
    return null;
  }

  let history: RenameHistoryEntry[] = [];
  try {
    history = JSON.parse(tracking.renameHistory);
  } catch {
    history = [];
  }

  return {
    originalFilename: tracking.originalFilename,
    originalPath: tracking.originalPath,
    history,
  };
}

/**
 * Restore a file to its original filename.
 */
export async function restoreOriginalFilename(
  fileId: string,
  options: { batchId?: string } = {}
): Promise<FileOperationResult> {
  const db = getDatabase();

  // Get original filename tracking
  const tracking = await db.originalFilename.findUnique({
    where: { fileId },
  });

  if (!tracking) {
    return {
      success: false,
      operation: 'restore',
      source: '',
      error: 'No original filename tracked for this file',
    };
  }

  // Get current file
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: { library: true },
  });

  if (!file) {
    return {
      success: false,
      operation: 'restore',
      source: '',
      error: `File not found: ${fileId}`,
    };
  }

  // If already at original filename, nothing to do
  if (file.filename === tracking.originalFilename) {
    return {
      success: true,
      operation: 'restore',
      source: file.path,
      destination: file.path,
    };
  }

  // Restore to original directory if different
  const originalDir = dirname(tracking.originalPath);
  const currentDir = dirname(file.path);

  let destinationPath: string;
  if (originalDir !== currentDir) {
    // Restore to original directory
    destinationPath = join(originalDir, tracking.originalFilename);
  } else {
    // Same directory, just rename
    destinationPath = join(currentDir, tracking.originalFilename);
  }

  // Perform the move
  const result = await moveFile(fileId, destinationPath, {
    createDirs: true,
    batchId: options.batchId,
  });

  if (result.success) {
    // Clear the tracking record since we're back to original
    await db.originalFilename.delete({
      where: { fileId },
    });

    logInfo('file-operations', 'Restored original filename', {
      fileId,
      from: file.filename,
      to: tracking.originalFilename,
    });
  }

  return {
    ...result,
    operation: 'restore',
  };
}

/**
 * Rename a file using template system with original filename tracking.
 */
export async function renameFileWithTracking(
  fileId: string,
  newFilename: string,
  options: {
    batchId?: string;
    templateId?: string;
    trackOriginal?: boolean;
  } = {}
): Promise<FileOperationResult> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return {
      success: false,
      operation: 'rename',
      source: '',
      error: `File not found: ${fileId}`,
    };
  }

  // Track original if requested and not already the same name
  if (options.trackOriginal !== false && file.filename !== newFilename) {
    await trackOriginalFilename(fileId, options.templateId);
  }

  // Perform the rename
  const result = await renameFile(fileId, newFilename, { batchId: options.batchId });

  // Record in history if successful
  if (result.success && file.filename !== newFilename) {
    await addRenameToHistory(fileId, file.filename, newFilename, options.templateId);
  }

  return result;
}

/**
 * Move a file to a new location with original filename tracking.
 */
export async function moveFileWithTracking(
  fileId: string,
  destinationPath: string,
  options: MoveOptions & {
    templateId?: string;
    trackOriginal?: boolean;
  } = {}
): Promise<FileOperationResult> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return {
      success: false,
      operation: 'move',
      source: '',
      error: `File not found: ${fileId}`,
    };
  }

  const newFilename = basename(destinationPath);

  // Track original if requested and file is actually changing
  if (options.trackOriginal !== false && (file.filename !== newFilename || file.path !== destinationPath)) {
    await trackOriginalFilename(fileId, options.templateId);
  }

  // Perform the move
  const result = await moveFile(fileId, destinationPath, options);

  // Record in history if successful
  if (result.success && file.filename !== newFilename) {
    await addRenameToHistory(fileId, file.filename, newFilename, options.templateId);
  }

  return result;
}
