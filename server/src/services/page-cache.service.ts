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

import { rm, writeFile, readFile, readdir, stat, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { getPageCacheDir, getFileCacheDir } from './app-paths.service.js';
import { logDebug, logInfo, logWarn, logError } from './logger.service.js';
import type { ArchiveInfo } from './archive.service.js';
import { getDatabase } from './database.service.js';

// =============================================================================
// Configuration
// =============================================================================

const ACCESS_FILE_NAME = '.access';
const METADATA_FILE_NAME = '.metadata.json';

export const DEFAULT_TTL_MINUTES = 5;
export const MAX_CACHE_SIZE_GB = 2;
export const MAX_CACHE_SIZE = MAX_CACHE_SIZE_GB * 1024 * 1024 * 1024; // 2GB in bytes
export const PROTECTION_ZONE_PAGES = 25; // ±25 pages from reading position (50 pages total)
export const PRELOAD_RADIUS = 10; // Preload within 10 pages

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

export interface PageMetadata {
  pageIndex: number;      // 0-indexed page number
  path: string;           // path in archive
  filename: string;       // actual filename on disk
  sizeBytes: number;      // uncompressed file size
}

export interface PageCacheMetadata {
  fileId: string;
  format: string;         // Archive format (zip, rar, 7z)
  extractedAt: number;    // Timestamp when metadata was created
  lastAccessedAt: number; // Last access timestamp
  totalSizeBytes: number; // Total size if all pages cached
  cachedSizeBytes: number; // Actual cached size (sparse cache)
  pages: PageMetadata[];
}

export interface GlobalCacheState {
  totalSizeBytes: number;
  fileCaches: Map<string, FileCacheEntry>;
  lastCleanupRun: number;
}

export interface FileCacheEntry {
  fileId: string;
  totalSizeBytes: number;      // Potential size if all pages cached
  cachedSizeBytes: number;     // Actual cached size
  lastAccessedAt: number;
  metadata: PageCacheMetadata;
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

// =============================================================================
// Global Cache State
// =============================================================================

let globalCacheState: GlobalCacheState = {
  totalSizeBytes: 0,
  fileCaches: new Map(),
  lastCleanupRun: Date.now(),
};

/**
 * Get the global cache state (total size, file caches).
 */
export function getGlobalCacheState(): GlobalCacheState {
  return globalCacheState;
}

/**
 * Get total cache size across all files.
 */
export function getGlobalCacheSize(): number {
  return globalCacheState.totalSizeBytes;
}

/**
 * Update global cache state for a specific file.
 */
export function updateGlobalCacheState(fileId: string, metadata: PageCacheMetadata): void {
  const existing = globalCacheState.fileCaches.get(fileId);

  if (existing) {
    // Update existing entry
    globalCacheState.totalSizeBytes -= existing.cachedSizeBytes;
    globalCacheState.totalSizeBytes += metadata.cachedSizeBytes;

    existing.cachedSizeBytes = metadata.cachedSizeBytes;
    existing.totalSizeBytes = metadata.totalSizeBytes;
    existing.lastAccessedAt = metadata.lastAccessedAt;
    existing.metadata = metadata;
  } else {
    // Add new entry
    globalCacheState.fileCaches.set(fileId, {
      fileId,
      totalSizeBytes: metadata.totalSizeBytes,
      cachedSizeBytes: metadata.cachedSizeBytes,
      lastAccessedAt: metadata.lastAccessedAt,
      metadata,
    });
    globalCacheState.totalSizeBytes += metadata.cachedSizeBytes;
  }

  logDebug('page-cache', `Updated global cache state: ${fileId}, total: ${(globalCacheState.totalSizeBytes / 1024 / 1024).toFixed(2)}MB`);
}

/**
 * Remove a file from global cache state.
 */
export function removeFromGlobalCacheState(fileId: string): void {
  const existing = globalCacheState.fileCaches.get(fileId);

  if (existing) {
    globalCacheState.totalSizeBytes -= existing.cachedSizeBytes;
    globalCacheState.fileCaches.delete(fileId);
    logDebug('page-cache', `Removed from global cache state: ${fileId}`);
  }
}

// =============================================================================
// Metadata Persistence
// =============================================================================

/**
 * Load metadata from .metadata.json file.
 */
export async function loadMetadata(fileId: string): Promise<PageCacheMetadata | null> {
  try {
    const cacheDir = getFileCacheDir(fileId);
    const metadataPath = join(cacheDir, METADATA_FILE_NAME);

    if (!existsSync(metadataPath)) {
      return null;
    }

    const content = await readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(content) as PageCacheMetadata;

    logDebug('page-cache', `Loaded metadata for ${fileId}`);
    return metadata;
  } catch (error) {
    logWarn('page-cache', `Failed to load metadata for ${fileId}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Write metadata to .metadata.json file.
 */
export async function writeMetadata(fileId: string, metadata: PageCacheMetadata): Promise<void> {
  try {
    const cacheDir = getFileCacheDir(fileId);
    const metadataPath = join(cacheDir, METADATA_FILE_NAME);

    const content = JSON.stringify(metadata, null, 2);
    await writeFile(metadataPath, content, 'utf-8');

    logDebug('page-cache', `Wrote metadata for ${fileId}`);
  } catch (error) {
    logWarn('page-cache', `Failed to write metadata for ${fileId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// =============================================================================
// Metadata Generation
// =============================================================================

/**
 * Check if a file is an image based on extension.
 */
function isImageFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'].includes(ext);
}

/**
 * Natural sort comparator for filenames.
 */
function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Build metadata from archive listing (without extraction).
 * This is fast and provides accurate uncompressed sizes from archive headers.
 */
export function buildMetadataFromListing(fileId: string, archiveInfo: ArchiveInfo): PageCacheMetadata {
  const pages: PageMetadata[] = [];
  let pageIndex = 0;

  // Filter for image files only, sorted naturally
  const imageEntries = archiveInfo.entries
    .filter(e => !e.isDirectory && isImageFile(e.path))
    .sort((a, b) => naturalSort(a.path, b.path));

  for (const entry of imageEntries) {
    pages.push({
      pageIndex: pageIndex++,
      path: entry.path,
      filename: basename(entry.path),
      sizeBytes: entry.size,
    });
  }

  const totalSizeBytes = pages.reduce((sum, p) => sum + p.sizeBytes, 0);

  return {
    fileId,
    format: archiveInfo.format,
    extractedAt: Date.now(),
    lastAccessedAt: Date.now(),
    totalSizeBytes,
    cachedSizeBytes: 0, // No pages cached yet
    pages,
  };
}

/**
 * Build metadata from existing extracted files (for migration/rebuild).
 */
export async function buildMetadataFromExtraction(fileId: string, cacheDir: string): Promise<PageCacheMetadata | null> {
  try {
    const files = await readdir(cacheDir);
    const pages: PageMetadata[] = [];
    let totalSize = 0;

    for (const filename of files) {
      // Skip metadata and access files
      if (filename.startsWith('.')) continue;

      const filepath = join(cacheDir, filename);
      const stats = await stat(filepath);

      // Extract page index from filename (assumes format like "0.jpg", "1.png", etc.)
      const match = filename.match(/^(\d+)\./);
      const pageIndex = match && match[1] ? parseInt(match[1], 10) : pages.length;

      pages.push({
        pageIndex,
        path: filename,
        filename,
        sizeBytes: stats.size,
      });

      totalSize += stats.size;
    }

    // Sort by page index
    pages.sort((a, b) => a.pageIndex - b.pageIndex);

    return {
      fileId,
      format: 'unknown', // Format not known from extracted files
      extractedAt: Date.now(),
      lastAccessedAt: Date.now(),
      totalSizeBytes: totalSize,
      cachedSizeBytes: totalSize, // All pages are cached
      pages,
    };
  } catch (error) {
    logWarn('page-cache', `Failed to build metadata from extraction for ${fileId}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// =============================================================================
// Cache Initialization
// =============================================================================

/**
 * Initialize global cache state on server startup.
 * Scans existing cache directories and loads/rebuilds metadata.
 */
export async function initializeGlobalCacheState(): Promise<void> {
  logInfo('page-cache', 'Initializing global cache state...');

  try {
    const pageCacheDir = getPageCacheDir();

    // Ensure cache directory exists
    if (!existsSync(pageCacheDir)) {
      await mkdir(pageCacheDir, { recursive: true });
      logInfo('page-cache', 'Created page cache directory');
      return;
    }

    const entries = await readdir(pageCacheDir, { withFileTypes: true });
    let totalFiles = 0;
    let totalSize = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const fileId = entry.name;
      const cacheDir = getFileCacheDir(fileId);

      try {
        // Load or rebuild metadata
        let metadata = await loadMetadata(fileId);

        if (!metadata) {
          // Metadata missing, rebuild from extracted files
          logInfo('page-cache', `Rebuilding metadata for ${fileId}`);
          metadata = await buildMetadataFromExtraction(fileId, cacheDir);

          if (metadata) {
            await writeMetadata(fileId, metadata);
          } else {
            logWarn('page-cache', `Failed to rebuild metadata for ${fileId}, skipping`);
            continue;
          }
        }

        // Add to global state
        globalCacheState.fileCaches.set(fileId, {
          fileId,
          totalSizeBytes: metadata.totalSizeBytes,
          cachedSizeBytes: metadata.cachedSizeBytes,
          lastAccessedAt: metadata.lastAccessedAt,
          metadata,
        });

        totalFiles++;
        totalSize += metadata.cachedSizeBytes;
      } catch (error) {
        logWarn('page-cache', `Error processing cache for ${fileId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    globalCacheState.totalSizeBytes = totalSize;

    logInfo('page-cache', `Page cache initialized: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)}GB across ${totalFiles} file(s)`);
  } catch (error) {
    logError('page-cache', error, { action: 'initialize-global-cache-state' });
  }
}

// =============================================================================
// Size-Based Eviction
// =============================================================================

let evictionInProgress = false;

/**
 * Evict pages from a single file based on reading position.
 * Removes pages furthest from the most recent reader's position.
 *
 * @param fileId - File to evict pages from
 * @param targetBytes - Number of bytes to evict
 * @returns Number of bytes evicted and pages removed
 */
export async function evictPagesFromFile(
  fileId: string,
  targetBytes: number
): Promise<{ evictedBytes: number; pagesEvicted: number }> {
  logDebug('page-cache', `Evicting pages from ${fileId}, target: ${(targetBytes / 1024 / 1024).toFixed(2)}MB`);

  try {
    const metadata = await loadMetadata(fileId);
    if (!metadata) {
      logWarn('page-cache', `No metadata found for ${fileId}, cannot evict`);
      return { evictedBytes: 0, pagesEvicted: 0 };
    }

    // Get most recent reader's position
    const db = getDatabase();
    const recentProgress = await db.userReadingProgress.findFirst({
      where: { fileId },
      orderBy: { lastReadAt: 'desc' },
      select: { currentPage: true },
    });

    const currentPage = recentProgress?.currentPage ?? 0;

    // Create protection zone (±25 pages from current position)
    const protectedPages = new Set<number>();
    for (let i = currentPage - PROTECTION_ZONE_PAGES; i <= currentPage + PROTECTION_ZONE_PAGES; i++) {
      if (i >= 0 && i < metadata.pages.length) {
        protectedPages.add(i);
      }
    }

    // Score pages by distance from current position
    const cacheDir = getFileCacheDir(fileId);
    const scoredPages = metadata.pages
      .map(page => {
        // Check if page is actually cached
        const ext = extname(page.filename);
        const cachedPath = join(cacheDir, `${page.pageIndex}${ext}`);
        const isCached = existsSync(cachedPath);

        if (!isCached) {
          return null; // Not cached, skip
        }

        if (protectedPages.has(page.pageIndex)) {
          return { ...page, distance: -1, cachedPath }; // Protected
        }

        const distance = Math.abs(page.pageIndex - currentPage);
        return { ...page, distance, cachedPath };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // Sort by distance (furthest first), evict until target reached
    const evictable = scoredPages
      .filter(p => p.distance >= 0)
      .sort((a, b) => b.distance - a.distance);

    let evictedBytes = 0;
    let pagesEvicted = 0;

    for (const page of evictable) {
      if (evictedBytes >= targetBytes) break;

      try {
        await unlink(page.cachedPath);
        evictedBytes += page.sizeBytes;
        pagesEvicted++;
        logDebug('page-cache', `Evicted page ${page.pageIndex} (${(page.sizeBytes / 1024).toFixed(2)}KB)`);
      } catch (error) {
        logWarn('page-cache', `Failed to evict page ${page.pageIndex}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Update metadata
    metadata.cachedSizeBytes -= evictedBytes;
    await writeMetadata(fileId, metadata);

    // Update global cache state
    updateGlobalCacheState(fileId, metadata);

    logInfo('page-cache', `Evicted ${pagesEvicted} page(s) from ${fileId}, freed ${(evictedBytes / 1024 / 1024).toFixed(2)}MB`);

    return { evictedBytes, pagesEvicted };
  } catch (error) {
    logError('page-cache', error, { action: 'evict-pages-from-file', fileId });
    return { evictedBytes: 0, pagesEvicted: 0 };
  }
}

/**
 * Run size-based eviction to bring cache under the limit.
 * Uses LRU (Least Recently Used) file selection and reading-position-aware page eviction.
 */
export async function runSizeBasedEviction(): Promise<CleanupStats> {
  if (evictionInProgress) {
    logDebug('page-cache', 'Eviction already in progress, skipping');
    return { filesDeleted: 0, errors: 0, bytesFreed: 0 };
  }

  evictionInProgress = true;

  try {
    const currentSize = getGlobalCacheSize();
    const overage = currentSize - MAX_CACHE_SIZE;

    if (overage <= 0) {
      logDebug('page-cache', 'Cache size within limit, no eviction needed');
      return { filesDeleted: 0, errors: 0, bytesFreed: 0 };
    }

    logInfo('page-cache', `Cache over limit by ${(overage / 1024 / 1024).toFixed(2)}MB, starting eviction`);

    const stats: CleanupStats = {
      filesDeleted: 0,
      errors: 0,
      bytesFreed: 0,
    };

    // Get files sorted by LRU (oldest access time first)
    const fileEntries = Array.from(globalCacheState.fileCaches.values())
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    let totalFreed = 0;

    for (const entry of fileEntries) {
      if (totalFreed >= overage) {
        break; // Reached target
      }

      const needed = overage - totalFreed;

      // If file cache is very large (> 2GB), delete entire cache
      if (entry.cachedSizeBytes > MAX_CACHE_SIZE) {
        logWarn('page-cache', `File ${entry.fileId} cache exceeds limit (${(entry.cachedSizeBytes / 1024 / 1024 / 1024).toFixed(2)}GB), deleting entire cache`);

        try {
          const cacheDir = getFileCacheDir(entry.fileId);
          await rm(cacheDir, { recursive: true, force: true });

          totalFreed += entry.cachedSizeBytes;
          stats.filesDeleted++;
          stats.bytesFreed += entry.cachedSizeBytes;

          // Remove from global state
          removeFromGlobalCacheState(entry.fileId);

          logInfo('page-cache', `Deleted entire cache for ${entry.fileId}`);
        } catch (error) {
          stats.errors++;
          logWarn('page-cache', `Failed to delete cache for ${entry.fileId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        // Per-page eviction
        const result = await evictPagesFromFile(entry.fileId, needed);
        totalFreed += result.evictedBytes;
        stats.bytesFreed += result.evictedBytes;

        if (result.pagesEvicted === 0) {
          stats.errors++;
        }
      }
    }

    logInfo('page-cache', `Size-based eviction completed: ${stats.filesDeleted} file(s) deleted, ${(stats.bytesFreed / 1024 / 1024).toFixed(2)}MB freed, ${stats.errors} error(s)`);

    return stats;
  } catch (error) {
    logError('page-cache', error, { action: 'run-size-based-eviction' });
    return { filesDeleted: 0, errors: 1, bytesFreed: 0 };
  } finally {
    evictionInProgress = false;
  }
}
