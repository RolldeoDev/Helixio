/**
 * Folder Migration Service
 *
 * Handles startup backfill of folder data for existing libraries.
 * This is a one-time migration that runs synchronously at server startup.
 */

import { getDatabase, getWriteDatabase } from '../database.service.js';
import { createServiceLogger } from '../logger.service.js';
import {
  ensureFolderPath,
  recalculateLibraryCounts,
  getAllAncestorPaths,
} from './folder-crud.service.js';
import { dirname } from 'path';

const logger = createServiceLogger('folder-migration');

/**
 * Check if folder backfill is needed and run it.
 * Called once during server startup (blocking).
 *
 * Only runs for libraries that have files but no folders.
 */
export async function ensureFoldersBackfilled(): Promise<void> {
  const db = getDatabase();

  // Check if any library has files but no folders
  const libraries = await db.library.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          files: true,
          folders: true,
        },
      },
    },
  });

  const librariesNeedingMigration = libraries.filter(
    (lib) => lib._count.files > 0 && lib._count.folders === 0
  );

  if (librariesNeedingMigration.length === 0) {
    logger.debug('All libraries have folder data, no backfill needed');
    return;
  }

  logger.info(
    { count: librariesNeedingMigration.length },
    'Starting folder backfill for libraries without folder data'
  );

  for (const library of librariesNeedingMigration) {
    const startTime = Date.now();
    logger.info({ libraryId: library.id, name: library.name }, 'Backfilling folders');

    await backfillLibraryFolders(library.id);

    const duration = Date.now() - startTime;
    logger.info(
      { libraryId: library.id, name: library.name, durationMs: duration },
      'Completed folder backfill'
    );
  }
}

/**
 * Backfill folders for a single library from existing file paths.
 * Creates folder records and links files to them.
 */
export async function backfillLibraryFolders(libraryId: string): Promise<void> {
  const db = getWriteDatabase();

  // Get all files with their relative paths
  const files = await db.comicFile.findMany({
    where: { libraryId },
    select: { id: true, relativePath: true },
  });

  if (files.length === 0) {
    logger.debug({ libraryId }, 'No files to process for folder backfill');
    return;
  }

  // Extract unique folder paths (including all ancestors)
  const folderPathsSet = new Set<string>();
  for (const file of files) {
    const folderPath = dirname(file.relativePath);

    // Skip root-level files (dirname returns '.' for no directory)
    if (!folderPath || folderPath === '.') {
      continue;
    }

    // Add all ancestor paths
    const ancestorPaths = getAllAncestorPaths(folderPath);
    for (const ancestorPath of ancestorPaths) {
      folderPathsSet.add(ancestorPath);
    }

    // Add the immediate parent folder
    folderPathsSet.add(folderPath);
  }

  // Sort by depth (parents first)
  const sortedPaths = Array.from(folderPathsSet).sort(
    (a, b) => a.split('/').length - b.split('/').length
  );

  logger.debug(
    { libraryId, folderCount: sortedPaths.length },
    'Creating folder records'
  );

  // Create folders in order (parents first)
  // This uses ensureFolderPath which handles parent chain creation
  for (const path of sortedPaths) {
    await ensureFolderPath(libraryId, path, db);
  }

  // Link files to their folders
  logger.debug({ libraryId, fileCount: files.length }, 'Linking files to folders');

  // Build a map of folder paths to IDs for efficient lookup
  const folders = await db.folder.findMany({
    where: { libraryId },
    select: { id: true, path: true },
  });
  const folderIdMap = new Map(folders.map((f) => [f.path, f.id]));

  // Update files in batches
  const batchSize = 500;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    const updates = batch
      .map((file) => {
        const folderPath = dirname(file.relativePath);
        if (!folderPath || folderPath === '.') {
          return null; // Root-level file, no folder
        }

        const folderId = folderIdMap.get(folderPath);
        if (!folderId) {
          logger.warn(
            { fileId: file.id, folderPath },
            'No folder found for file during backfill'
          );
          return null;
        }

        return { id: file.id, folderId };
      })
      .filter((u): u is { id: string; folderId: string } => u !== null);

    // Update files in parallel (within batch)
    await Promise.all(
      updates.map((update) =>
        db.comicFile.update({
          where: { id: update.id },
          data: { folderId: update.folderId },
        })
      )
    );

    logger.debug(
      { libraryId, processed: i + batch.length, total: files.length },
      'Linking files progress'
    );
  }

  // Recalculate all folder counts
  logger.debug({ libraryId }, 'Recalculating folder counts');
  await recalculateLibraryCounts(libraryId, {
    database: db,
    progressCallback: (current, total) => {
      if (current % 100 === 0 || current === total) {
        logger.debug(
          { libraryId, current, total },
          'Folder count recalculation progress'
        );
      }
    },
  });

  logger.info(
    { libraryId, folderCount: sortedPaths.length, fileCount: files.length },
    'Folder backfill complete'
  );
}
