/**
 * Folder Cache Service
 *
 * Provides Redis-backed caching for library folder structures.
 * Uses getOrCompute pattern for automatic cache-aside with fallback.
 */

import { cacheService } from './cache.service.js';
import { getDatabase } from '../database.service.js';
import { createServiceLogger } from '../logger.service.js';

const logger = createServiceLogger('folder-cache');

const FOLDER_CACHE_PREFIX = 'folders:';
const FOLDER_CACHE_TTL = 3600; // 1 hour

interface LibraryFolderData {
  id: string;
  name: string;
  type: string;
  folders: string[];
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get folders for a specific library, using cache when available.
 * Uses getOrCompute for automatic cache-aside pattern.
 */
export async function getLibraryFoldersWithCache(libraryId: string): Promise<string[]> {
  return cacheService.getOrCompute(
    `${FOLDER_CACHE_PREFIX}library:${libraryId}`,
    async () => {
      logger.debug({ libraryId }, 'Computing folders for library (cache miss)');
      return computeLibraryFolders(libraryId);
    },
    FOLDER_CACHE_TTL
  );
}

/**
 * Get folders for all libraries, using cache when available.
 */
export async function getAllLibraryFoldersWithCache(): Promise<LibraryFolderData[]> {
  return cacheService.getOrCompute(
    `${FOLDER_CACHE_PREFIX}all`,
    async () => {
      logger.debug('Computing folders for all libraries (cache miss)');
      return computeAllLibraryFolders();
    },
    FOLDER_CACHE_TTL
  );
}

/**
 * Invalidate folder cache after library changes.
 * Call this after library scans, file moves, or deletions.
 */
export async function invalidateFolderCache(libraryId?: string): Promise<void> {
  // Always invalidate the "all libraries" cache
  await cacheService.delete(`${FOLDER_CACHE_PREFIX}all`);

  // If specific library, invalidate that too
  if (libraryId) {
    await cacheService.delete(`${FOLDER_CACHE_PREFIX}library:${libraryId}`);
    logger.debug({ libraryId }, 'Invalidated folder cache for library');
  } else {
    // Invalidate all library-specific caches
    await cacheService.invalidatePattern(`${FOLDER_CACHE_PREFIX}library:*`);
    logger.debug('Invalidated all folder caches');
  }
}

// =============================================================================
// Internal Computation Functions
// =============================================================================

/**
 * Compute folder list for a single library from database.
 */
async function computeLibraryFolders(libraryId: string): Promise<string[]> {
  const db = getDatabase();
  const files = await db.comicFile.findMany({
    where: { libraryId },
    select: { relativePath: true },
  });

  const folders = new Set<string>();
  for (const file of files) {
    const parts = file.relativePath.split('/');
    let folderPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      folderPath = folderPath ? `${folderPath}/${part}` : part;
      folders.add(folderPath);
    }
  }

  return Array.from(folders).sort();
}

/**
 * Compute folder list for all libraries from database.
 */
async function computeAllLibraryFolders(): Promise<LibraryFolderData[]> {
  const db = getDatabase();

  const [libraries, allFiles] = await Promise.all([
    db.library.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true },
    }),
    db.comicFile.findMany({
      select: { libraryId: true, relativePath: true },
    }),
  ]);

  // Group files by libraryId and extract folders in-memory
  const foldersByLibrary = new Map<string, Set<string>>();

  for (const file of allFiles) {
    if (!foldersByLibrary.has(file.libraryId)) {
      foldersByLibrary.set(file.libraryId, new Set<string>());
    }
    const folders = foldersByLibrary.get(file.libraryId)!;

    // Extract folder paths from relativePath
    const parts = file.relativePath.split('/');
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join('/'));
    }
  }

  // Build response with folders for each library
  return libraries.map((library) => ({
    id: library.id,
    name: library.name,
    type: library.type,
    folders: Array.from(foldersByLibrary.get(library.id) ?? []).sort(),
  }));
}
