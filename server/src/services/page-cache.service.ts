/**
 * Page Cache Service
 *
 * Manages persistent page extraction cache at ~/.helixio/cache/pages/
 * Provides TTL-based cleanup for extracted comic pages.
 *
 * Features:
 * - Filesystem-based access time tracking via .access files
 * - TTL-based cleanup to balance quick re-opens vs disk usage
 * - Background cleanup via scheduler
 * - Cache statistics and monitoring
 */

import { rm, writeFile, readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getPageCacheDir, getFileCacheDir } from './app-paths.service.js';
import { logDebug, logInfo, logWarn, logError } from './logger.service.js';

// =============================================================================
// Configuration
// =============================================================================

const ACCESS_FILE_NAME = '.access';
export const DEFAULT_TTL_MINUTES = 5;

// =============================================================================
// Types
// =============================================================================

export interface CleanupStats {
  filesDeleted: number;
  errors: number;
  bytesFreed: number;
}

export interface PageCacheStats {
  totalCaches: number;
  totalSizeBytes: number;
  totalPages: number;
  oldestCacheAge: number | null;
  newestCacheAge: number | null;
}

export interface FileCacheInfo {
  fileId: string;
  path: string;
  sizeBytes: number;
  lastAccessedAt: Date;
}

// =============================================================================
// Access Time Tracking
// =============================================================================

/**
 * Touch the access time for a file's cache directory.
 * Creates or updates a .access file with the current timestamp.
 */
export async function touchCacheAccessTime(fileId: string): Promise<void> {
  try {
    const cacheDir = getFileCacheDir(fileId);

    if (!existsSync(cacheDir)) {
      return; // Cache doesn't exist yet
    }

    const accessFilePath = join(cacheDir, ACCESS_FILE_NAME);
    const timestamp = Date.now().toString();

    await writeFile(accessFilePath, timestamp, 'utf-8');
    logDebug('page-cache', `Updated access time for file ${fileId}`);
  } catch (error) {
    logWarn('page-cache', `Failed to update access time for ${fileId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get the last access time for a file's cache directory.
 * Returns the timestamp from .access file, or directory mtime as fallback.
 */
async function getCacheAccessTime(cacheDir: string): Promise<number> {
  try {
    const accessFilePath = join(cacheDir, ACCESS_FILE_NAME);

    if (existsSync(accessFilePath)) {
      const content = await readFile(accessFilePath, 'utf-8');
      return parseInt(content.trim(), 10);
    }

    // Fallback to directory mtime
    const stats = await stat(cacheDir);
    return stats.mtimeMs;
  } catch (error) {
    // If all else fails, use current time (won't be cleaned up yet)
    logWarn('page-cache', `Failed to get access time for ${cacheDir}: ${error instanceof Error ? error.message : String(error)}`);
    return Date.now();
  }
}

// =============================================================================
// Cleanup Operations
// =============================================================================

/**
 * Process cache directories with a custom deletion predicate.
 * Common logic for cleanup operations.
 */
async function processCacheDirectories(
  shouldDelete: (cacheDir: string, lastAccess: number) => Promise<boolean>,
  operationName: string
): Promise<CleanupStats> {
  const stats: CleanupStats = {
    filesDeleted: 0,
    errors: 0,
    bytesFreed: 0,
  };

  try {
    const pageCacheDir = getPageCacheDir();

    if (!existsSync(pageCacheDir)) {
      logDebug('page-cache', `Page cache directory does not exist for ${operationName}`);
      return stats;
    }

    const entries = await readdir(pageCacheDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue; // Skip non-directory entries
      }

      const cacheDir = join(pageCacheDir, entry.name);

      try {
        const lastAccess = await getCacheAccessTime(cacheDir);

        if (await shouldDelete(cacheDir, lastAccess)) {
          // Calculate size before deletion
          const size = await getDirectorySize(cacheDir);

          // Delete the cache directory
          await rm(cacheDir, { recursive: true, force: true });

          stats.filesDeleted++;
          stats.bytesFreed += size;

          logDebug('page-cache', `${operationName}: Deleted cache for ${entry.name} (size: ${Math.round(size / 1024)}KB)`);
        }
      } catch (error) {
        stats.errors++;
        logWarn('page-cache', `${operationName}: Failed to process ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (stats.filesDeleted > 0) {
      logInfo('page-cache', `${operationName} completed: ${stats.filesDeleted} cache(s) deleted, ${Math.round(stats.bytesFreed / 1024 / 1024)}MB freed, ${stats.errors} error(s)`);
    }
  } catch (error) {
    logError('page-cache', error, { action: operationName });
  }

  return stats;
}

/**
 * Cleanup the page cache for a specific file.
 * Removes the entire cache directory for the file.
 */
export async function cleanupFileCache(fileId: string): Promise<boolean> {
  try {
    const cacheDir = getFileCacheDir(fileId);

    if (!existsSync(cacheDir)) {
      logDebug('page-cache', `Cache for file ${fileId} already cleaned or doesn't exist`);
      return true;
    }

    await rm(cacheDir, { recursive: true, force: true });
    logInfo('page-cache', `Cleaned page cache for file ${fileId}`);
    return true;
  } catch (error) {
    logWarn('page-cache', `Failed to cleanup cache for file ${fileId}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Cleanup expired page caches based on TTL.
 * Removes cache directories that haven't been accessed within the TTL period.
 *
 * @param ttlMinutes - Time-to-live in minutes (default: 5)
 * @returns Cleanup statistics
 */
export async function cleanupExpiredCaches(ttlMinutes: number = DEFAULT_TTL_MINUTES): Promise<CleanupStats> {
  const ttlMs = ttlMinutes * 60 * 1000;
  const now = Date.now();

  return processCacheDirectories(
    async (_cacheDir, lastAccess) => {
      const age = now - lastAccess;
      return age > ttlMs;
    },
    'cleanup-expired-caches'
  );
}

/**
 * Clear all page caches for all files.
 * Removes entire cache directory contents and returns cleanup stats.
 */
export async function clearAllPageCaches(): Promise<CleanupStats> {
  return processCacheDirectories(
    async () => true, // Delete all caches
    'clear-all-caches'
  );
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get cache statistics for monitoring.
 */
export async function getCacheStats(): Promise<PageCacheStats> {
  const stats: PageCacheStats = {
    totalCaches: 0,
    totalSizeBytes: 0,
    totalPages: 0,
    oldestCacheAge: null,
    newestCacheAge: null,
  };

  try {
    const pageCacheDir = getPageCacheDir();

    if (!existsSync(pageCacheDir)) {
      return stats;
    }

    const entries = await readdir(pageCacheDir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const cacheDir = join(pageCacheDir, entry.name);

      try {
        const size = await getDirectorySize(cacheDir);
        const lastAccess = await getCacheAccessTime(cacheDir);
        const age = now - lastAccess;

        // Count pages (all files except .access file)
        const files = await readdir(cacheDir);
        const pageCount = files.filter(f => f !== ACCESS_FILE_NAME).length;
        stats.totalPages += pageCount;

        stats.totalCaches++;
        stats.totalSizeBytes += size;

        if (stats.oldestCacheAge === null || age > stats.oldestCacheAge) {
          stats.oldestCacheAge = age;
        }

        if (stats.newestCacheAge === null || age < stats.newestCacheAge) {
          stats.newestCacheAge = age;
        }
      } catch (error) {
        logWarn('page-cache', `Failed to get stats for ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    logWarn('page-cache', `Failed to get cache stats: ${error instanceof Error ? error.message : String(error)}`);
  }

  return stats;
}

/**
 * Get information about a specific file's cache.
 */
export async function getFileCacheInfo(fileId: string): Promise<FileCacheInfo | null> {
  try {
    const cacheDir = getFileCacheDir(fileId);

    if (!existsSync(cacheDir)) {
      return null;
    }

    const size = await getDirectorySize(cacheDir);
    const lastAccess = await getCacheAccessTime(cacheDir);

    return {
      fileId,
      path: cacheDir,
      sizeBytes: size,
      lastAccessedAt: new Date(lastAccess),
    };
  } catch (error) {
    logWarn('page-cache', `Failed to get cache info for ${fileId}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Calculate the total size of a directory recursively.
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(fullPath);
      } else {
        try {
          const stats = await stat(fullPath);
          totalSize += stats.size;
        } catch (statError) {
          // Ignore ENOENT (file deleted during iteration)
          // Log other errors (permissions, I/O errors)
          if (statError && typeof statError === 'object' && 'code' in statError && statError.code !== 'ENOENT') {
            logWarn(`page-cache`, `Failed to stat file ${fullPath}: ${statError instanceof Error ? statError.message : String(statError)}`);
          }
        }
      }
    }
  } catch (error) {
    // Ignore ENOENT (directory deleted during iteration)
    // Log other errors (permissions, I/O errors)
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
      logWarn(`page-cache`, `Failed to read directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return totalSize;
}
