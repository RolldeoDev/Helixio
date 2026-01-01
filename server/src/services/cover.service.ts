/**
 * Cover Extraction Service
 *
 * Handles cover image extraction and caching for comic archives.
 * Covers are optimized and stored in ~/.helixio/cache/covers/{libraryId}/{fileHash}.webp
 *
 * Optimization features:
 * - Resizes covers to 320px width (2x display size for retina)
 * - Generates WebP format for modern browsers with JPEG fallback
 * - Creates tiny blur placeholders for instant perceived load
 * - Memory cache for hot covers
 */

import { existsSync, readFileSync } from 'fs';
import { mkdir, readdir, rm, stat, copyFile, rename, unlink, readFile, writeFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import sharp from 'sharp';
import { getCoverPath, getLibraryCoverDir, getCoversDir, getSeriesCoversDir, getSeriesCoverPath, getCollectionCoversDir } from './app-paths.service.js';
import { createHash } from 'crypto';
import {
  listArchiveContents,
  extractSingleFile,
  createTempDir,
  cleanupTempDir,
} from './archive.service.js';
import { getDatabase } from './database.service.js';
import { parallelMap, getOptimalConcurrency } from './parallel.service.js';
import { logDebug, logWarn } from './logger.service.js';

// =============================================================================
// Cover Optimization Config
// =============================================================================

const COVER_WIDTH = 320; // 2x display size for retina (grid items are ~160px)
const COVER_QUALITY_WEBP = 80;
const COVER_QUALITY_JPEG = 85;
const BLUR_PLACEHOLDER_WIDTH = 20; // Tiny placeholder for blur-up effect
const BLUR_PLACEHOLDER_QUALITY = 30;

// Memory cache for recently served covers (LRU-style)
const MEMORY_CACHE_MAX_SIZE = 100; // Max number of covers to cache in memory
const MEMORY_CACHE_MAX_BYTES = 50 * 1024 * 1024; // 50MB max memory usage
const coverMemoryCache = new Map<string, { data: Buffer; contentType: string; timestamp: number }>();
let memoryCacheBytes = 0;

// =============================================================================
// Types
// =============================================================================

export interface CoverExtractionResult {
  success: boolean;
  coverPath?: string;
  webpPath?: string;
  jpegPath?: string;
  blurPlaceholder?: string; // Base64 data URL for blur-up effect
  fromCache: boolean;
  error?: string;
}

export interface CoverInfo {
  exists: boolean;
  path?: string;
  webpPath?: string;
  jpegPath?: string;
  blurPlaceholder?: string;
  size?: number;
  extractedAt?: Date;
}

export interface CoverData {
  data: Buffer;
  contentType: string;
  blurPlaceholder?: string;
}

export interface CacheSummary {
  totalFiles: number;
  totalSize: number;
  libraries: Array<{
    libraryId: string;
    fileCount: number;
    size: number;
  }>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a file is an image by extension.
 */
function isImageFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
}

/**
 * Find the cover image path within archive entries.
 * Priority: cover.jpg/png > folder.jpg/png > first image alphabetically
 */
function findCoverInArchive(entries: Array<{ path: string; isDirectory: boolean }>): string | null {
  const imageEntries = entries
    .filter((e) => !e.isDirectory && isImageFile(e.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (imageEntries.length === 0) return null;

  // Look for explicit cover file (case-insensitive)
  const coverFile = imageEntries.find((e) => {
    const name = e.path.toLowerCase().split('/').pop() || '';
    return (
      name.startsWith('cover') ||
      name === 'folder.jpg' ||
      name === 'folder.png' ||
      name === 'folder.jpeg'
    );
  });

  if (coverFile) return coverFile.path;

  // Return first image (alphabetically) - this is index 0
  return imageEntries[0]?.path ?? null;
}

/**
 * Ensure the library cover directory exists.
 */
async function ensureLibraryCoverDir(libraryId: string): Promise<string> {
  const dir = getLibraryCoverDir(libraryId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get cover paths for both WebP and JPEG formats.
 */
function getCoverPaths(libraryId: string, fileHash: string): {
  webp: string;
  jpeg: string;
  blur: string;
} {
  const basePath = getCoverPath(libraryId, fileHash);
  const baseDir = dirname(basePath);
  return {
    webp: join(baseDir, `${fileHash}.webp`),
    jpeg: join(baseDir, `${fileHash}.jpg`),
    blur: join(baseDir, `${fileHash}.blur`), // Tiny file storing base64 blur placeholder
  };
}

// =============================================================================
// Memory Cache
// =============================================================================

/**
 * Evict oldest entries from memory cache until under limits.
 */
function evictMemoryCacheIfNeeded(): void {
  // Check if we need to evict
  if (coverMemoryCache.size <= MEMORY_CACHE_MAX_SIZE && memoryCacheBytes <= MEMORY_CACHE_MAX_BYTES) {
    return;
  }

  // Sort by timestamp (oldest first)
  const entries = Array.from(coverMemoryCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp);

  // Remove oldest until under limits
  while (
    (coverMemoryCache.size > MEMORY_CACHE_MAX_SIZE || memoryCacheBytes > MEMORY_CACHE_MAX_BYTES) &&
    entries.length > 0
  ) {
    const [key, entry] = entries.shift()!;
    memoryCacheBytes -= entry.data.length;
    coverMemoryCache.delete(key);
  }
}

/**
 * Add a cover to the memory cache.
 */
function addToMemoryCache(key: string, data: Buffer, contentType: string): void {
  // Remove existing entry if present
  const existing = coverMemoryCache.get(key);
  if (existing) {
    memoryCacheBytes -= existing.data.length;
  }

  // Add new entry
  coverMemoryCache.set(key, { data, contentType, timestamp: Date.now() });
  memoryCacheBytes += data.length;

  // Evict if needed
  evictMemoryCacheIfNeeded();
}

/**
 * Get a cover from the memory cache.
 */
function getFromMemoryCache(key: string): { data: Buffer; contentType: string } | null {
  const entry = coverMemoryCache.get(key);
  if (entry) {
    // Update timestamp for LRU behavior
    entry.timestamp = Date.now();
    return { data: entry.data, contentType: entry.contentType };
  }
  return null;
}

/**
 * Clear the memory cache.
 */
export function clearMemoryCache(): void {
  coverMemoryCache.clear();
  memoryCacheBytes = 0;
}

/**
 * Get memory cache statistics.
 */
export function getMemoryCacheStats(): { size: number; bytes: number; maxSize: number; maxBytes: number } {
  return {
    size: coverMemoryCache.size,
    bytes: memoryCacheBytes,
    maxSize: MEMORY_CACHE_MAX_SIZE,
    maxBytes: MEMORY_CACHE_MAX_BYTES,
  };
}

// =============================================================================
// Cover Extraction
// =============================================================================

/**
 * Extract, optimize, and cache a cover image from a comic archive.
 * Generates both WebP (primary) and JPEG (fallback) formats.
 * Also creates a tiny blur placeholder for instant perceived load.
 * Returns cached version if available.
 */
export async function extractCover(
  archivePath: string,
  libraryId: string,
  fileHash: string
): Promise<CoverExtractionResult> {
  const paths = getCoverPaths(libraryId, fileHash);

  // Check if already cached (WebP is primary format)
  if (existsSync(paths.webp)) {
    // Load blur placeholder if exists
    let blurPlaceholder: string | undefined;
    if (existsSync(paths.blur)) {
      try {
        blurPlaceholder = await readFile(paths.blur, 'utf-8');
      } catch {
        // Ignore blur read errors
      }
    }

    return {
      success: true,
      coverPath: paths.webp,
      webpPath: paths.webp,
      jpegPath: existsSync(paths.jpeg) ? paths.jpeg : undefined,
      blurPlaceholder,
      fromCache: true,
    };
  }

  try {
    // Get archive contents
    const archiveInfo = await listArchiveContents(archivePath);
    const coverEntryPath = findCoverInArchive(archiveInfo.entries);

    if (!coverEntryPath) {
      return {
        success: false,
        fromCache: false,
        error: 'No cover image found in archive',
      };
    }

    // Ensure cover directory exists
    await ensureLibraryCoverDir(libraryId);

    // Extract to temp location first
    const tempDir = await createTempDir('cover-');
    const tempFile = join(tempDir, 'cover' + extname(coverEntryPath));

    try {
      const result = await extractSingleFile(archivePath, coverEntryPath, tempFile);

      if (!result.success) {
        return {
          success: false,
          fromCache: false,
          error: result.error || 'Failed to extract cover',
        };
      }

      // Ensure output directory exists
      await mkdir(dirname(paths.webp), { recursive: true });

      // Load the extracted image with Sharp
      const image = sharp(tempFile);
      const metadata = await image.metadata();

      // Only resize if image is larger than target width
      const needsResize = metadata.width && metadata.width > COVER_WIDTH;
      const resizedImage = needsResize
        ? image.resize(COVER_WIDTH, null, { withoutEnlargement: true })
        : image;

      // Generate WebP (primary format - smaller, modern)
      await resizedImage
        .clone()
        .webp({ quality: COVER_QUALITY_WEBP })
        .toFile(paths.webp);

      // Generate JPEG fallback
      await resizedImage
        .clone()
        .jpeg({ quality: COVER_QUALITY_JPEG })
        .toFile(paths.jpeg);

      // Generate tiny blur placeholder (base64 data URL)
      const blurBuffer = await sharp(tempFile)
        .resize(BLUR_PLACEHOLDER_WIDTH, null, { withoutEnlargement: true })
        .blur(2)
        .jpeg({ quality: BLUR_PLACEHOLDER_QUALITY })
        .toBuffer();

      const blurPlaceholder = `data:image/jpeg;base64,${blurBuffer.toString('base64')}`;

      // Save blur placeholder to disk
      await writeFile(paths.blur, blurPlaceholder, 'utf-8');

      return {
        success: true,
        coverPath: paths.webp,
        webpPath: paths.webp,
        jpegPath: paths.jpeg,
        blurPlaceholder,
        fromCache: false,
      };
    } finally {
      await cleanupTempDir(tempDir);
    }
  } catch (err) {
    return {
      success: false,
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get cover for a comic file by its database ID.
 * Extracts on-demand if not cached.
 */
export async function getCoverForFile(fileId: string): Promise<CoverExtractionResult> {
  // Get file info from database
  const prisma = getDatabase();
  const file = await prisma.comicFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      path: true,
      hash: true,
      libraryId: true,
    },
  });

  if (!file) {
    return {
      success: false,
      fromCache: false,
      error: 'File not found',
    };
  }

  if (!file.hash) {
    return {
      success: false,
      fromCache: false,
      error: 'File hash not available',
    };
  }

  return extractCover(file.path, file.libraryId, file.hash);
}

/**
 * Check if a cover exists in cache.
 */
export async function getCoverInfo(
  libraryId: string,
  fileHash: string
): Promise<CoverInfo> {
  const paths = getCoverPaths(libraryId, fileHash);

  // Check for WebP (primary format)
  if (!existsSync(paths.webp)) {
    // Check for legacy JPEG-only cover
    const legacyCoverPath = getCoverPath(libraryId, fileHash);
    if (existsSync(legacyCoverPath)) {
      try {
        const stats = await stat(legacyCoverPath);
        return {
          exists: true,
          path: legacyCoverPath,
          size: stats.size,
          extractedAt: stats.mtime,
        };
      } catch {
        return { exists: false };
      }
    }
    return { exists: false };
  }

  try {
    const stats = await stat(paths.webp);

    // Load blur placeholder if exists
    let blurPlaceholder: string | undefined;
    if (existsSync(paths.blur)) {
      try {
        blurPlaceholder = await readFile(paths.blur, 'utf-8');
      } catch {
        // Ignore blur read errors
      }
    }

    return {
      exists: true,
      path: paths.webp,
      webpPath: paths.webp,
      jpegPath: existsSync(paths.jpeg) ? paths.jpeg : undefined,
      blurPlaceholder,
      size: stats.size,
      extractedAt: stats.mtime,
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Get cover data for serving, with format negotiation and memory caching.
 * Prefers WebP if the client supports it, falls back to JPEG.
 */
export async function getCoverData(
  libraryId: string,
  fileHash: string,
  acceptWebP: boolean = true
): Promise<CoverData | null> {
  const paths = getCoverPaths(libraryId, fileHash);
  const cacheKey = `${libraryId}/${fileHash}/${acceptWebP ? 'webp' : 'jpeg'}`;

  // Check memory cache first
  const cached = getFromMemoryCache(cacheKey);
  if (cached) {
    // Get blur placeholder
    let blurPlaceholder: string | undefined;
    if (existsSync(paths.blur)) {
      try {
        blurPlaceholder = await readFile(paths.blur, 'utf-8');
      } catch {
        // Ignore
      }
    }
    return { ...cached, blurPlaceholder };
  }

  // Determine which format to serve
  let coverPath: string;
  let contentType: string;

  if (acceptWebP && existsSync(paths.webp)) {
    coverPath = paths.webp;
    contentType = 'image/webp';
  } else if (existsSync(paths.jpeg)) {
    coverPath = paths.jpeg;
    contentType = 'image/jpeg';
  } else {
    // Check for legacy cover (old .jpg format before optimization)
    const legacyPath = getCoverPath(libraryId, fileHash);
    if (existsSync(legacyPath)) {
      coverPath = legacyPath;
      contentType = 'image/jpeg';
    } else {
      logDebug('covers', 'No cover found in cache', { libraryId, fileHash });
      return null;
    }
  }

  try {
    const data = await readFile(coverPath);

    // Add to memory cache
    addToMemoryCache(cacheKey, data, contentType);

    // Get blur placeholder
    let blurPlaceholder: string | undefined;
    if (existsSync(paths.blur)) {
      try {
        blurPlaceholder = await readFile(paths.blur, 'utf-8');
      } catch {
        // Ignore
      }
    }

    return { data, contentType, blurPlaceholder };
  } catch (err) {
    logWarn('covers', 'Failed to read cover file', {
      coverPath,
      libraryId,
      fileHash,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Delete a cached cover (all formats).
 */
export async function deleteCachedCover(
  libraryId: string,
  fileHash: string
): Promise<boolean> {
  const paths = getCoverPaths(libraryId, fileHash);
  const legacyPath = getCoverPath(libraryId, fileHash);
  const cacheKeyWebP = `${libraryId}/${fileHash}/webp`;
  const cacheKeyJpeg = `${libraryId}/${fileHash}/jpeg`;

  // Remove from memory cache
  coverMemoryCache.delete(cacheKeyWebP);
  coverMemoryCache.delete(cacheKeyJpeg);

  let success = true;

  // Delete all cover files
  for (const path of [paths.webp, paths.jpeg, paths.blur, legacyPath]) {
    if (existsSync(path)) {
      try {
        await unlink(path);
      } catch {
        success = false;
      }
    }
  }

  return success;
}

/**
 * Delete all cached covers for a library.
 */
export async function deleteLibraryCovers(libraryId: string): Promise<{
  deleted: number;
  errors: number;
}> {
  const dir = getLibraryCoverDir(libraryId);

  if (!existsSync(dir)) {
    return { deleted: 0, errors: 0 };
  }

  let deleted = 0;
  let errors = 0;

  try {
    const files = await readdir(dir);

    for (const file of files) {
      try {
        await unlink(join(dir, file));
        deleted++;
      } catch {
        errors++;
      }
    }

    // Remove the directory itself
    await rm(dir, { recursive: true, force: true });
  } catch {
    errors++;
  }

  return { deleted, errors };
}

/**
 * Get cache summary for all libraries.
 */
export async function getCacheSummary(): Promise<CacheSummary> {
  const coversDir = getCoversDir();
  const libraries: CacheSummary['libraries'] = [];
  let totalFiles = 0;
  let totalSize = 0;

  if (!existsSync(coversDir)) {
    return { totalFiles: 0, totalSize: 0, libraries: [] };
  }

  try {
    const libraryDirs = await readdir(coversDir);

    for (const libraryId of libraryDirs) {
      const libraryDir = join(coversDir, libraryId);
      const libraryStat = await stat(libraryDir);

      if (!libraryStat.isDirectory()) continue;

      let fileCount = 0;
      let size = 0;

      try {
        const files = await readdir(libraryDir);

        for (const file of files) {
          try {
            const fileStat = await stat(join(libraryDir, file));
            if (fileStat.isFile()) {
              fileCount++;
              size += fileStat.size;
            }
          } catch {
            // Skip files we can't stat
          }
        }

        libraries.push({ libraryId, fileCount, size });
        totalFiles += fileCount;
        totalSize += size;
      } catch {
        // Skip directories we can't read
      }
    }
  } catch {
    // Return empty summary on error
  }

  return { totalFiles, totalSize, libraries };
}

/**
 * Clean up orphaned covers (covers for files no longer in database).
 */
export async function cleanupOrphanedCovers(): Promise<{
  checked: number;
  deleted: number;
  errors: number;
}> {
  let checked = 0;
  let deleted = 0;
  let errors = 0;

  const coversDir = getCoversDir();

  if (!existsSync(coversDir)) {
    return { checked: 0, deleted: 0, errors: 0 };
  }

  try {
    const libraryDirs = await readdir(coversDir);

    for (const libraryId of libraryDirs) {
      const libraryDir = join(coversDir, libraryId);
      const libraryStat = await stat(libraryDir);

      if (!libraryStat.isDirectory()) continue;

      // Check if library exists
      const prisma = getDatabase();
      const library = await prisma.library.findUnique({
        where: { id: libraryId },
      });

      if (!library) {
        // Delete entire library's covers
        const result = await deleteLibraryCovers(libraryId);
        deleted += result.deleted;
        errors += result.errors;
        continue;
      }

      // Check individual covers
      const files = await readdir(libraryDir);

      for (const file of files) {
        checked++;
        const hash = file.replace(/\.[^.]+$/, ''); // Remove extension

        // Check if any file with this hash exists
        const existingFile = await getDatabase().comicFile.findFirst({
          where: {
            libraryId,
            hash,
          },
        });

        if (!existingFile) {
          try {
            await unlink(join(libraryDir, file));
            deleted++;
          } catch {
            errors++;
          }
        }
      }
    }
  } catch {
    errors++;
  }

  return { checked, deleted, errors };
}

/**
 * Get total cache size in bytes.
 */
export async function getCacheSize(): Promise<number> {
  const summary = await getCacheSummary();
  return summary.totalSize;
}

/**
 * Enforce cache size limit by deleting oldest covers.
 */
export async function enforceCacheSizeLimit(maxSizeBytes: number): Promise<{
  deleted: number;
  freedBytes: number;
}> {
  const currentSize = await getCacheSize();

  if (currentSize <= maxSizeBytes) {
    return { deleted: 0, freedBytes: 0 };
  }

  // Get all cached covers with their stats
  const coversDir = getCoversDir();
  const allCovers: Array<{ path: string; size: number; mtime: Date }> = [];

  if (!existsSync(coversDir)) {
    return { deleted: 0, freedBytes: 0 };
  }

  try {
    const libraryDirs = await readdir(coversDir);

    for (const libraryId of libraryDirs) {
      const libraryDir = join(coversDir, libraryId);
      const libraryStat = await stat(libraryDir);

      if (!libraryStat.isDirectory()) continue;

      const files = await readdir(libraryDir);

      for (const file of files) {
        const filePath = join(libraryDir, file);
        try {
          const fileStat = await stat(filePath);
          if (fileStat.isFile()) {
            allCovers.push({
              path: filePath,
              size: fileStat.size,
              mtime: fileStat.mtime,
            });
          }
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    return { deleted: 0, freedBytes: 0 };
  }

  // Sort by modification time (oldest first)
  allCovers.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

  // Delete oldest until we're under the limit
  let deleted = 0;
  let freedBytes = 0;
  let targetToFree = currentSize - maxSizeBytes;

  for (const cover of allCovers) {
    if (freedBytes >= targetToFree) break;

    try {
      await unlink(cover.path);
      deleted++;
      freedBytes += cover.size;
    } catch {
      // Continue with next file
    }
  }

  return { deleted, freedBytes };
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Pre-extract covers for multiple files.
 * Uses parallel processing for improved performance on multi-core systems.
 */
export async function batchExtractCovers(
  fileIds: string[],
  onProgress?: (current: number, total: number, fileId: string) => void
): Promise<{
  success: number;
  failed: number;
  cached: number;
  errors: Array<{ fileId: string; error: string }>;
  duration: number;
}> {
  if (fileIds.length === 0) {
    return { success: 0, failed: 0, cached: 0, errors: [], duration: 0 };
  }

  // Use CPU-based concurrency since cover extraction involves Sharp processing
  const concurrency = getOptimalConcurrency('cpu');

  const startTime = Date.now();
  let processedCount = 0;

  const result = await parallelMap(
    fileIds,
    async (fileId) => {
      const extractionResult = await getCoverForFile(fileId);
      return { fileId, ...extractionResult };
    },
    {
      concurrency,
      onProgress: (completed, total, itemResult) => {
        processedCount = completed;
        if (onProgress && itemResult.success) {
          const fileId = fileIds[itemResult.index];
          if (fileId) {
            onProgress(completed, total, fileId);
          }
        }
      },
    }
  );

  // Aggregate results
  let success = 0;
  let failed = 0;
  let cached = 0;
  const errors: Array<{ fileId: string; error: string }> = [];

  for (const item of result.results) {
    if (item.success && item.result) {
      if (item.result.success) {
        if (item.result.fromCache) {
          cached++;
        } else {
          success++;
        }
      } else {
        failed++;
        errors.push({
          fileId: item.result.fileId,
          error: item.result.error || 'Unknown error',
        });
      }
    } else {
      // parallelMap itself failed for this item
      failed++;
      const fileId = fileIds[item.index];
      errors.push({
        fileId: fileId || `index-${item.index}`,
        error: item.error || 'Parallel processing error',
      });
    }
  }

  return {
    success,
    failed,
    cached,
    errors,
    duration: Date.now() - startTime,
  };
}

/**
 * Rebuild all covers for a library with new optimization.
 * Deletes existing covers and re-extracts with Sharp optimization.
 * Uses parallel processing for improved performance.
 */
export async function rebuildAllCovers(
  libraryId?: string,
  onProgress?: (current: number, total: number, filename: string) => void
): Promise<{
  total: number;
  success: number;
  failed: number;
  errors: Array<{ fileId: string; filename: string; error: string }>;
  duration: number;
}> {
  const prisma = getDatabase();

  // Get all files to rebuild
  const files = await prisma.comicFile.findMany({
    where: libraryId ? { libraryId, status: { not: 'quarantined' } } : { status: { not: 'quarantined' } },
    select: { id: true, path: true, hash: true, libraryId: true, filename: true },
  });

  if (files.length === 0) {
    return { total: 0, success: 0, failed: 0, errors: [], duration: 0 };
  }

  // Use CPU-based concurrency since cover extraction involves Sharp processing
  const concurrency = getOptimalConcurrency('cpu');
  const startTime = Date.now();

  const result = await parallelMap(
    files,
    async (file) => {
      if (!file.hash) {
        return {
          fileId: file.id,
          filename: file.filename,
          success: false,
          error: 'File hash not available',
        };
      }

      // Delete existing cover (all formats)
      await deleteCachedCover(file.libraryId, file.hash);

      // Re-extract with optimization
      const extractResult = await extractCover(file.path, file.libraryId, file.hash);

      return {
        fileId: file.id,
        filename: file.filename,
        success: extractResult.success,
        error: extractResult.error,
      };
    },
    {
      concurrency,
      onProgress: (completed, total, itemResult) => {
        if (onProgress && itemResult.success && itemResult.result) {
          const res = itemResult.result as { filename: string };
          onProgress(completed, total, res.filename);
        }
      },
    }
  );

  // Aggregate results
  let success = 0;
  let failed = 0;
  const errors: Array<{ fileId: string; filename: string; error: string }> = [];

  for (const item of result.results) {
    if (item.success && item.result) {
      if (item.result.success) {
        success++;
      } else {
        failed++;
        errors.push({
          fileId: item.result.fileId,
          filename: item.result.filename,
          error: item.result.error || 'Unknown error',
        });
      }
    } else {
      failed++;
      const file = files[item.index];
      errors.push({
        fileId: file?.id || `index-${item.index}`,
        filename: file?.filename || 'unknown',
        error: item.error || 'Parallel processing error',
      });
    }
  }

  return {
    total: files.length,
    success,
    failed,
    errors,
    duration: Date.now() - startTime,
  };
}

/**
 * Check if a cover needs optimization (is it using the old format?).
 */
export async function coverNeedsOptimization(libraryId: string, fileHash: string): Promise<boolean> {
  const paths = getCoverPaths(libraryId, fileHash);

  // If WebP exists, it's already optimized
  if (existsSync(paths.webp)) {
    return false;
  }

  // If only legacy JPEG exists, needs optimization
  const legacyPath = getCoverPath(libraryId, fileHash);
  return existsSync(legacyPath);
}

/**
 * Count how many covers need optimization.
 */
export async function countCoversNeedingOptimization(libraryId?: string): Promise<{
  total: number;
  needsOptimization: number;
  alreadyOptimized: number;
}> {
  const prisma = getDatabase();

  const files = await prisma.comicFile.findMany({
    where: libraryId ? { libraryId, status: { not: 'quarantined' } } : { status: { not: 'quarantined' } },
    select: { hash: true, libraryId: true },
  });

  let needsOptimization = 0;
  let alreadyOptimized = 0;

  for (const file of files) {
    if (!file.hash) continue;

    const paths = getCoverPaths(file.libraryId, file.hash);
    if (existsSync(paths.webp)) {
      alreadyOptimized++;
    } else {
      const legacyPath = getCoverPath(file.libraryId, file.hash);
      if (existsSync(legacyPath)) {
        needsOptimization++;
      }
    }
  }

  return {
    total: files.length,
    needsOptimization,
    alreadyOptimized,
  };
}

// =============================================================================
// Series Covers (Downloaded from API)
// =============================================================================

/**
 * Result from downloading an API cover
 */
export interface DownloadCoverResult {
  success: boolean;
  coverHash?: string;
  webpPath?: string;
  jpegPath?: string;
  blurPlaceholder?: string;
  error?: string;
}

/**
 * Generate a hash from a URL for use as a filename
 */
export function generateCoverHash(url: string): string {
  return createHash('md5').update(url).digest('hex');
}

/**
 * Get paths for a series cover (downloaded from API)
 */
function getSeriesCoverPaths(coverHash: string): {
  webp: string;
  jpeg: string;
  blur: string;
} {
  const baseDir = getSeriesCoversDir();
  return {
    webp: join(baseDir, `${coverHash}.webp`),
    jpeg: join(baseDir, `${coverHash}.jpg`),
    blur: join(baseDir, `${coverHash}.blur`),
  };
}

/**
 * Download a cover image from a URL and cache it locally.
 * Optimizes the image using the same Sharp pipeline as archive covers.
 * Returns a hash that can be stored in the database.
 */
export async function downloadApiCover(url: string): Promise<DownloadCoverResult> {
  // Validate URL format
  if (!url || typeof url !== 'string') {
    return {
      success: false,
      error: 'URL is required',
    };
  }

  // Trim whitespace
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return {
      success: false,
      error: 'URL cannot be empty',
    };
  }

  // Validate URL structure
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return {
      success: false,
      error: 'Invalid URL format. Please provide a valid HTTP or HTTPS URL.',
    };
  }

  // Only allow HTTP/HTTPS
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      success: false,
      error: 'Only HTTP and HTTPS URLs are supported',
    };
  }

  // SECURITY: Block internal/private IP addresses to prevent SSRF attacks
  const hostname = parsedUrl.hostname.toLowerCase();
  const blockedHostnames = ['localhost', '127.0.0.1', '::1', '0.0.0.0', 'metadata.google.internal', 'metadata'];
  if (blockedHostnames.includes(hostname)) {
    return {
      success: false,
      error: 'URLs pointing to internal/private addresses are not allowed',
    };
  }

  // Block private IP ranges
  const privateIPv4Patterns = [
    /^10\./,                       // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
    /^192\.168\./,                 // 192.168.0.0/16
    /^127\./,                      // 127.0.0.0/8 (loopback)
    /^169\.254\./,                 // 169.254.0.0/16 (link-local, AWS metadata)
    /^0\./,                        // 0.0.0.0/8
  ];
  for (const pattern of privateIPv4Patterns) {
    if (pattern.test(hostname)) {
      return {
        success: false,
        error: 'URLs pointing to internal/private addresses are not allowed',
      };
    }
  }

  // Block IPv6 private addresses
  if (hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
    return {
      success: false,
      error: 'URLs pointing to internal/private addresses are not allowed',
    };
  }

  // Generate hash from URL
  const coverHash = generateCoverHash(trimmedUrl);
  const paths = getSeriesCoverPaths(coverHash);

  // Check if already cached
  if (existsSync(paths.webp)) {
    let blurPlaceholder: string | undefined;
    if (existsSync(paths.blur)) {
      try {
        blurPlaceholder = await readFile(paths.blur, 'utf-8');
      } catch {
        // Ignore blur read errors
      }
    }

    return {
      success: true,
      coverHash,
      webpPath: paths.webp,
      jpegPath: existsSync(paths.jpeg) ? paths.jpeg : undefined,
      blurPlaceholder,
    };
  }

  try {
    // Ensure directory exists
    await mkdir(getSeriesCoversDir(), { recursive: true });

    // Download the image with proper headers
    // Many servers block requests without User-Agent or with suspicious patterns
    // Include Referer header to bypass hotlink protection
    const response = await fetch(trimmedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': parsedUrl.origin + '/',
      },
      redirect: 'follow',
    });
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to download image: Server returned ${response.status} ${response.statusText}`,
      };
    }

    // Verify content type is an image
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return {
        success: false,
        error: `URL does not point to an image (received ${contentType || 'unknown content type'})`,
      };
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // Process with Sharp
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    // Only resize if image is larger than target width
    const needsResize = metadata.width && metadata.width > COVER_WIDTH;
    const resizedImage = needsResize
      ? image.resize(COVER_WIDTH, null, { withoutEnlargement: true })
      : image;

    // Generate WebP (primary format - smaller, modern)
    await resizedImage
      .clone()
      .webp({ quality: COVER_QUALITY_WEBP })
      .toFile(paths.webp);

    // Generate JPEG fallback
    await resizedImage
      .clone()
      .jpeg({ quality: COVER_QUALITY_JPEG })
      .toFile(paths.jpeg);

    // Generate tiny blur placeholder (base64 data URL)
    const blurBuffer = await sharp(imageBuffer)
      .resize(BLUR_PLACEHOLDER_WIDTH, null, { withoutEnlargement: true })
      .blur(2)
      .jpeg({ quality: BLUR_PLACEHOLDER_QUALITY })
      .toBuffer();

    const blurPlaceholder = `data:image/jpeg;base64,${blurBuffer.toString('base64')}`;

    // Save blur placeholder to disk
    await writeFile(paths.blur, blurPlaceholder, 'utf-8');

    return {
      success: true,
      coverHash,
      webpPath: paths.webp,
      jpegPath: paths.jpeg,
      blurPlaceholder,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get series cover data for serving, with format negotiation and memory caching.
 */
export async function getSeriesCoverData(
  coverHash: string,
  acceptWebP: boolean = true
): Promise<CoverData | null> {
  const paths = getSeriesCoverPaths(coverHash);
  const cacheKey = `series/${coverHash}/${acceptWebP ? 'webp' : 'jpeg'}`;

  // Check memory cache first
  const cached = getFromMemoryCache(cacheKey);
  if (cached) {
    let blurPlaceholder: string | undefined;
    if (existsSync(paths.blur)) {
      try {
        blurPlaceholder = await readFile(paths.blur, 'utf-8');
      } catch {
        // Ignore
      }
    }
    return { ...cached, blurPlaceholder };
  }

  // Determine which format to serve
  let coverPath: string;
  let contentType: string;

  if (acceptWebP && existsSync(paths.webp)) {
    coverPath = paths.webp;
    contentType = 'image/webp';
  } else if (existsSync(paths.jpeg)) {
    coverPath = paths.jpeg;
    contentType = 'image/jpeg';
  } else {
    return null;
  }

  try {
    const data = await readFile(coverPath);

    // Add to memory cache
    addToMemoryCache(cacheKey, data, contentType);

    // Get blur placeholder
    let blurPlaceholder: string | undefined;
    if (existsSync(paths.blur)) {
      try {
        blurPlaceholder = await readFile(paths.blur, 'utf-8');
      } catch {
        // Ignore
      }
    }

    return { data, contentType, blurPlaceholder };
  } catch {
    return null;
  }
}

/**
 * Check if a series cover exists in cache
 */
export function seriesCoverExists(coverHash: string): boolean {
  const paths = getSeriesCoverPaths(coverHash);
  return existsSync(paths.webp) || existsSync(paths.jpeg);
}

/**
 * Delete a cached series cover
 */
export async function deleteSeriesCover(coverHash: string): Promise<boolean> {
  const paths = getSeriesCoverPaths(coverHash);
  const cacheKeyWebP = `series/${coverHash}/webp`;
  const cacheKeyJpeg = `series/${coverHash}/jpeg`;

  // Remove from memory cache
  coverMemoryCache.delete(cacheKeyWebP);
  coverMemoryCache.delete(cacheKeyJpeg);

  let success = true;

  // Delete all cover files
  for (const path of [paths.webp, paths.jpeg, paths.blur]) {
    if (existsSync(path)) {
      try {
        await unlink(path);
      } catch {
        success = false;
      }
    }
  }

  return success;
}

/**
 * Save an uploaded cover image from a buffer.
 * Generates a unique hash based on the image content.
 * Optimizes the image using the same Sharp pipeline as other covers.
 */
export async function saveUploadedCover(imageBuffer: Buffer): Promise<DownloadCoverResult> {
  // Generate hash from image content for uniqueness
  const coverHash = createHash('md5').update(imageBuffer).digest('hex');
  const paths = getSeriesCoverPaths(coverHash);

  // Check if already cached (same image uploaded before)
  if (existsSync(paths.webp)) {
    let blurPlaceholder: string | undefined;
    if (existsSync(paths.blur)) {
      try {
        blurPlaceholder = await readFile(paths.blur, 'utf-8');
      } catch {
        // Ignore blur read errors
      }
    }

    return {
      success: true,
      coverHash,
      webpPath: paths.webp,
      jpegPath: existsSync(paths.jpeg) ? paths.jpeg : undefined,
      blurPlaceholder,
    };
  }

  try {
    // Ensure directory exists
    await mkdir(getSeriesCoversDir(), { recursive: true });

    // Process with Sharp
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    // Only resize if image is larger than target width
    const needsResize = metadata.width && metadata.width > COVER_WIDTH;
    const resizedImage = needsResize
      ? image.resize(COVER_WIDTH, null, { withoutEnlargement: true })
      : image;

    // Generate WebP (primary format - smaller, modern)
    await resizedImage
      .clone()
      .webp({ quality: COVER_QUALITY_WEBP })
      .toFile(paths.webp);

    // Generate JPEG fallback
    await resizedImage
      .clone()
      .jpeg({ quality: COVER_QUALITY_JPEG })
      .toFile(paths.jpeg);

    // Generate tiny blur placeholder (base64 data URL)
    const blurBuffer = await sharp(imageBuffer)
      .resize(BLUR_PLACEHOLDER_WIDTH, null, { withoutEnlargement: true })
      .blur(2)
      .jpeg({ quality: BLUR_PLACEHOLDER_QUALITY })
      .toBuffer();

    const blurPlaceholder = `data:image/jpeg;base64,${blurBuffer.toString('base64')}`;

    // Save blur placeholder to disk
    await writeFile(paths.blur, blurPlaceholder, 'utf-8');

    return {
      success: true,
      coverHash,
      webpPath: paths.webp,
      jpegPath: paths.jpeg,
      blurPlaceholder,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// =============================================================================
// Issue Cover Functions
// =============================================================================

/**
 * Get pages list from an archive for cover selection.
 * Returns array of page paths sorted alphabetically.
 */
export async function getArchivePages(archivePath: string): Promise<{ success: boolean; pages?: string[]; error?: string }> {
  try {
    const archiveInfo = await listArchiveContents(archivePath);

    // Filter to only image files and sort alphabetically
    const pages = archiveInfo.entries
      .filter(entry => !entry.isDirectory && isImageFile(entry.path))
      .map(entry => entry.path)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return { success: true, pages };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Extract a specific page from an archive and save it as a custom cover.
 * Returns a cover hash that can be used to retrieve the cover.
 */
export async function extractPageAsCover(
  archivePath: string,
  pageIndex: number
): Promise<DownloadCoverResult> {
  try {
    // Get archive pages
    const pagesResult = await getArchivePages(archivePath);
    if (!pagesResult.success || !pagesResult.pages) {
      return { success: false, error: pagesResult.error || 'Failed to list archive pages' };
    }

    if (pageIndex < 0 || pageIndex >= pagesResult.pages.length) {
      return { success: false, error: `Invalid page index: ${pageIndex}. Archive has ${pagesResult.pages.length} pages.` };
    }

    const pagePath = pagesResult.pages[pageIndex];
    if (!pagePath) {
      return { success: false, error: 'Page path not found' };
    }

    // Extract to temp location
    const tempDir = await createTempDir('page-cover-');
    const tempFile = join(tempDir, 'page' + extname(pagePath));

    try {
      const result = await extractSingleFile(archivePath, pagePath, tempFile);
      if (!result.success) {
        return { success: false, error: result.error || 'Failed to extract page' };
      }

      // Read the extracted image
      const imageBuffer = await readFile(tempFile);

      // Use the same saveUploadedCover function to process and store
      return await saveUploadedCover(imageBuffer);
    } finally {
      await cleanupTempDir(tempDir);
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get the cover for a comic file, respecting its coverSource setting.
 * - 'auto': Default behavior (first image or cover.jpg)
 * - 'page': Use specific page index (extracts on-demand)
 * - 'custom': Use custom cover hash (URL/upload stored in series covers)
 */
export async function getFileCover(fileId: string): Promise<CoverExtractionResult> {
  const prisma = getDatabase();
  const file = await prisma.comicFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      path: true,
      hash: true,
      libraryId: true,
      coverSource: true,
      coverPageIndex: true,
      coverHash: true,
    },
  });

  if (!file) {
    return { success: false, fromCache: false, error: 'File not found' };
  }

  // Handle custom cover (uploaded or URL-based)
  if (file.coverSource === 'custom' && file.coverHash) {
    const paths = getSeriesCoverPaths(file.coverHash);
    if (existsSync(paths.webp)) {
      let blurPlaceholder: string | undefined;
      if (existsSync(paths.blur)) {
        try {
          blurPlaceholder = await readFile(paths.blur, 'utf-8');
        } catch {
          // Ignore blur read errors
        }
      }
      return {
        success: true,
        coverPath: paths.webp,
        webpPath: paths.webp,
        jpegPath: existsSync(paths.jpeg) ? paths.jpeg : undefined,
        blurPlaceholder,
        fromCache: true,
      };
    }
    // Fall through to default if custom cover not found
  }

  // Handle page-based cover
  if (file.coverSource === 'page' && file.coverPageIndex !== null) {
    // Check if we have a cached version with this page
    const pageHash = `${file.hash}-page${file.coverPageIndex}`;
    const paths = getSeriesCoverPaths(pageHash);

    if (existsSync(paths.webp)) {
      let blurPlaceholder: string | undefined;
      if (existsSync(paths.blur)) {
        try {
          blurPlaceholder = await readFile(paths.blur, 'utf-8');
        } catch {
          // Ignore blur read errors
        }
      }
      return {
        success: true,
        coverPath: paths.webp,
        webpPath: paths.webp,
        jpegPath: existsSync(paths.jpeg) ? paths.jpeg : undefined,
        blurPlaceholder,
        fromCache: true,
      };
    }

    // Extract the specific page as cover
    const result = await extractPageAsCover(file.path, file.coverPageIndex);
    if (result.success && result.coverHash) {
      // Update the file's coverHash to the extracted page hash for future lookups
      await prisma.comicFile.update({
        where: { id: fileId },
        data: { coverHash: result.coverHash },
      });

      const newPaths = getSeriesCoverPaths(result.coverHash);
      return {
        success: true,
        coverPath: newPaths.webp,
        webpPath: newPaths.webp,
        jpegPath: result.jpegPath,
        blurPlaceholder: result.blurPlaceholder,
        fromCache: false,
      };
    }
    // Fall through to default if page extraction failed
  }

  // Default: use normal cover extraction
  if (!file.hash) {
    return { success: false, fromCache: false, error: 'File hash not available' };
  }

  return extractCover(file.path, file.libraryId, file.hash);
}

// =============================================================================
// Collection Mosaic Covers
// =============================================================================

/**
 * Mosaic configuration matching client-side MosaicCover component
 */
const MOSAIC_WIDTH = 320;
const MOSAIC_HEIGHT = 480; // 2:3 aspect ratio
const MOSAIC_GAP = 2;
const MOSAIC_BORDER_RADIUS = 8;
const MOSAIC_BACKGROUND = { r: 26, g: 26, b: 46, alpha: 1 }; // #1a1a2e from CSS

/**
 * Series cover data needed for mosaic generation
 */
export interface SeriesCoverForMosaic {
  id: string;
  coverHash?: string | null;
  coverFileId?: string | null;
  firstIssueId?: string | null;
}

/**
 * Get paths for a collection mosaic cover
 */
function getCollectionCoverPaths(coverHash: string): {
  webp: string;
  jpeg: string;
  blur: string;
} {
  const baseDir = getCollectionCoversDir();
  return {
    webp: join(baseDir, `${coverHash}.webp`),
    jpeg: join(baseDir, `${coverHash}.jpg`),
    blur: join(baseDir, `${coverHash}.blur`),
  };
}

/**
 * Load a series cover image buffer for compositing
 */
async function loadSeriesCoverBuffer(
  series: SeriesCoverForMosaic,
  width: number,
  height: number
): Promise<Buffer | null> {
  try {
    // Priority: coverHash (API cover) > coverFileId > firstIssueId
    let coverData: CoverData | null = null;

    if (series.coverHash) {
      coverData = await getSeriesCoverData(series.coverHash, true);
    }

    if (!coverData && series.coverFileId) {
      // Get the file's library and hash to load the cover
      const prisma = getDatabase();
      const file = await prisma.comicFile.findUnique({
        where: { id: series.coverFileId },
        select: { libraryId: true, hash: true },
      });
      if (file?.hash) {
        coverData = await getCoverData(file.libraryId, file.hash, true);
      }
    }

    if (!coverData && series.firstIssueId) {
      // Get the first issue's library and hash
      const prisma = getDatabase();
      const file = await prisma.comicFile.findUnique({
        where: { id: series.firstIssueId },
        select: { libraryId: true, hash: true },
      });
      if (file?.hash) {
        coverData = await getCoverData(file.libraryId, file.hash, true);
      }
    }

    if (!coverData) {
      return null;
    }

    // Resize to target dimensions with cover fit
    const resizedBuffer = await sharp(coverData.data)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .toBuffer();

    return resizedBuffer;
  } catch {
    return null;
  }
}

/**
 * Generate an SVG rounded rectangle mask for the mosaic
 */
function generateRoundedRectMask(width: number, height: number, radius: number): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`
  );
}

/**
 * Generate a placeholder tile for missing covers
 */
async function generatePlaceholderTile(width: number, height: number): Promise<Buffer> {
  // Create a darker background tile with a simple icon placeholder
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#2a2a4a"/>
      <g transform="translate(${width / 2 - 16}, ${height / 2 - 16})">
        <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z" fill="#555"/>
      </g>
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .resize(width, height)
    .png()
    .toBuffer();
}

/**
 * Generate a mosaic cover image from series covers
 * Returns null for empty collections (0 series)
 */
export async function generateCollectionMosaicCover(
  seriesCovers: SeriesCoverForMosaic[]
): Promise<{ coverHash: string; buffer: Buffer } | null> {
  const count = seriesCovers.length;

  // Empty collection - no mosaic
  if (count === 0) {
    return null;
  }

  // Create base canvas with background color
  let canvas = sharp({
    create: {
      width: MOSAIC_WIDTH,
      height: MOSAIC_HEIGHT,
      channels: 4,
      background: MOSAIC_BACKGROUND,
    },
  });

  const composites: sharp.OverlayOptions[] = [];

  if (count === 1) {
    // Single cover - full frame
    const coverBuffer = await loadSeriesCoverBuffer(seriesCovers[0]!, MOSAIC_WIDTH, MOSAIC_HEIGHT);
    if (coverBuffer) {
      composites.push({ input: coverBuffer, top: 0, left: 0 });
    } else {
      const placeholder = await generatePlaceholderTile(MOSAIC_WIDTH, MOSAIC_HEIGHT);
      composites.push({ input: placeholder, top: 0, left: 0 });
    }
  } else if (count <= 3) {
    // 2x1 side-by-side layout
    const tileWidth = Math.floor((MOSAIC_WIDTH - MOSAIC_GAP) / 2);
    const tileHeight = MOSAIC_HEIGHT;

    for (let i = 0; i < Math.min(2, count); i++) {
      const coverBuffer = await loadSeriesCoverBuffer(seriesCovers[i]!, tileWidth, tileHeight);
      const left = i === 0 ? 0 : tileWidth + MOSAIC_GAP;

      if (coverBuffer) {
        composites.push({ input: coverBuffer, top: 0, left });
      } else {
        const placeholder = await generatePlaceholderTile(tileWidth, tileHeight);
        composites.push({ input: placeholder, top: 0, left });
      }
    }
  } else {
    // 2x2 grid layout (4+ series, use first 4)
    const tileWidth = Math.floor((MOSAIC_WIDTH - MOSAIC_GAP) / 2);
    const tileHeight = Math.floor((MOSAIC_HEIGHT - MOSAIC_GAP) / 2);

    const positions = [
      { top: 0, left: 0 },
      { top: 0, left: tileWidth + MOSAIC_GAP },
      { top: tileHeight + MOSAIC_GAP, left: 0 },
      { top: tileHeight + MOSAIC_GAP, left: tileWidth + MOSAIC_GAP },
    ];

    for (let i = 0; i < 4; i++) {
      const coverBuffer = await loadSeriesCoverBuffer(seriesCovers[i]!, tileWidth, tileHeight);
      const pos = positions[i]!;

      if (coverBuffer) {
        composites.push({ input: coverBuffer, ...pos });
      } else {
        const placeholder = await generatePlaceholderTile(tileWidth, tileHeight);
        composites.push({ input: placeholder, ...pos });
      }
    }
  }

  // Composite all tiles onto canvas
  const composited = await canvas.composite(composites).png().toBuffer();

  // Apply rounded corners using SVG mask
  const roundedResult = await sharp(composited)
    .composite([
      {
        input: generateRoundedRectMask(MOSAIC_WIDTH, MOSAIC_HEIGHT, MOSAIC_BORDER_RADIUS),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  // Generate hash from content for deduplication
  const coverHash = createHash('md5').update(roundedResult).digest('hex');

  return { coverHash, buffer: roundedResult };
}

/**
 * Save a generated mosaic cover to disk
 */
export async function saveCollectionMosaicCover(
  buffer: Buffer,
  coverHash: string
): Promise<DownloadCoverResult> {
  const paths = getCollectionCoverPaths(coverHash);

  try {
    // Ensure directory exists
    await mkdir(getCollectionCoversDir(), { recursive: true });

    // Generate WebP (primary format)
    await sharp(buffer)
      .webp({ quality: COVER_QUALITY_WEBP })
      .toFile(paths.webp);

    // Generate JPEG fallback
    await sharp(buffer)
      .jpeg({ quality: COVER_QUALITY_JPEG })
      .toFile(paths.jpeg);

    // Generate tiny blur placeholder
    const blurBuffer = await sharp(buffer)
      .resize(BLUR_PLACEHOLDER_WIDTH, null, { withoutEnlargement: true })
      .blur(2)
      .jpeg({ quality: BLUR_PLACEHOLDER_QUALITY })
      .toBuffer();

    const blurPlaceholder = `data:image/jpeg;base64,${blurBuffer.toString('base64')}`;
    await writeFile(paths.blur, blurPlaceholder, 'utf-8');

    return {
      success: true,
      coverHash,
      webpPath: paths.webp,
      jpegPath: paths.jpeg,
      blurPlaceholder,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get collection cover data for serving, with format negotiation
 */
export async function getCollectionCoverData(
  coverHash: string,
  acceptWebP: boolean = true
): Promise<CoverData | null> {
  const paths = getCollectionCoverPaths(coverHash);
  const cacheKey = `collection/${coverHash}/${acceptWebP ? 'webp' : 'jpeg'}`;

  // Check memory cache first
  const cached = getFromMemoryCache(cacheKey);
  if (cached) {
    let blurPlaceholder: string | undefined;
    if (existsSync(paths.blur)) {
      try {
        blurPlaceholder = await readFile(paths.blur, 'utf-8');
      } catch {
        // Ignore
      }
    }
    return { ...cached, blurPlaceholder };
  }

  // Determine which format to serve
  let coverPath: string;
  let contentType: string;

  if (acceptWebP && existsSync(paths.webp)) {
    coverPath = paths.webp;
    contentType = 'image/webp';
  } else if (existsSync(paths.jpeg)) {
    coverPath = paths.jpeg;
    contentType = 'image/jpeg';
  } else {
    return null;
  }

  try {
    const data = await readFile(coverPath);

    // Add to memory cache
    addToMemoryCache(cacheKey, data, contentType);

    // Get blur placeholder
    let blurPlaceholder: string | undefined;
    if (existsSync(paths.blur)) {
      try {
        blurPlaceholder = await readFile(paths.blur, 'utf-8');
      } catch {
        // Ignore
      }
    }

    return { data, contentType, blurPlaceholder };
  } catch {
    return null;
  }
}

/**
 * Check if a collection cover exists in cache
 */
export function collectionCoverExists(coverHash: string): boolean {
  const paths = getCollectionCoverPaths(coverHash);
  return existsSync(paths.webp) || existsSync(paths.jpeg);
}

/**
 * Delete a cached collection cover
 */
export async function deleteCollectionCover(coverHash: string): Promise<boolean> {
  const paths = getCollectionCoverPaths(coverHash);
  const cacheKeyWebP = `collection/${coverHash}/webp`;
  const cacheKeyJpeg = `collection/${coverHash}/jpeg`;

  // Remove from memory cache
  coverMemoryCache.delete(cacheKeyWebP);
  coverMemoryCache.delete(cacheKeyJpeg);

  let success = true;

  // Delete all cover files
  for (const path of [paths.webp, paths.jpeg, paths.blur]) {
    if (existsSync(path)) {
      try {
        await unlink(path);
      } catch {
        success = false;
      }
    }
  }

  return success;
}

/**
 * Generate a mosaic preview without saving to disk
 * Used for settings drawer preview
 */
export async function generateMosaicPreview(
  seriesCovers: SeriesCoverForMosaic[]
): Promise<Buffer | null> {
  const result = await generateCollectionMosaicCover(seriesCovers);
  if (!result) {
    return null;
  }

  // Convert to WebP for serving
  return sharp(result.buffer)
    .webp({ quality: COVER_QUALITY_WEBP })
    .toBuffer();
}

// =============================================================================
// Series Cover Resolution (Pre-computed)
// =============================================================================

/**
 * Get the effective cover hash for a file.
 * Handles custom covers (stored in series-covers cache) and auto covers (stored in covers cache).
 */
export async function getFileCoverHash(fileId: string): Promise<string | null> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    select: {
      coverSource: true,
      coverHash: true,
      coverPageIndex: true,
      hash: true,
    },
  });

  if (!file) {
    return null;
  }

  // Custom cover uses coverHash from series-covers cache
  if (file.coverSource === 'custom' && file.coverHash) {
    return file.coverHash;
  }

  // Auto or page cover uses hash (stored in covers/{libraryId} cache)
  return file.hash;
}

/**
 * Recalculate and store the resolved cover for a series.
 * Called when any cover-related data changes.
 * Applies the resolution priority: API > User > First Issue > None
 */
export async function recalculateSeriesCover(seriesId: string): Promise<void> {
  const db = getDatabase();

  // Get series cover settings
  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      coverSource: true,
      coverHash: true,
      coverFileId: true,
    },
  });

  if (!series) {
    return;
  }

  // Get first issue for fallback (separate query to avoid include/select conflict)
  const firstIssue = await db.comicFile.findFirst({
    where: { seriesId },
    orderBy: [
      { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
      { filename: 'asc' },
    ],
    select: { id: true, coverHash: true, hash: true, libraryId: true },
  });

  let resolvedSource: 'api' | 'user' | 'firstIssue' | 'none' = 'none';
  let resolvedHash: string | null = null;
  let resolvedFileId: string | null = null;

  // Treat NULL/undefined coverSource as 'auto' (defensive - schema has default but old data may have NULL)
  const effectiveCoverSource = series.coverSource || 'auto';

  // Apply resolution priority based on coverSource preference
  if (effectiveCoverSource === 'api') {
    if (series.coverHash) {
      resolvedSource = 'api';
      resolvedHash = series.coverHash;
    } else if (firstIssue) {
      // Fallback to first issue when API cover not yet downloaded
      resolvedSource = 'firstIssue';
      resolvedFileId = firstIssue.id;
      resolvedHash = firstIssue.coverHash || firstIssue.hash;
    }
  } else if (effectiveCoverSource === 'user') {
    if (series.coverFileId) {
      // Verify the file still exists before using it
      const fileExists = await db.comicFile.findUnique({
        where: { id: series.coverFileId },
        select: { id: true },
      });
      if (fileExists) {
        resolvedSource = 'user';
        resolvedFileId = series.coverFileId;
        resolvedHash = await getFileCoverHash(series.coverFileId);
      }
    }
    // Fallback to first issue if file deleted or not set
    if (resolvedSource === 'none' && firstIssue) {
      resolvedSource = 'firstIssue';
      resolvedFileId = firstIssue.id;
      resolvedHash = firstIssue.coverHash || firstIssue.hash;
    }
  } else {
    // 'auto' or any unexpected value - use fallback chain
    // Auto fallback chain: API > User > First Issue
    if (series.coverHash) {
      resolvedSource = 'api';
      resolvedHash = series.coverHash;
    } else if (series.coverFileId) {
      // Verify the file still exists before using it
      const fileExists = await db.comicFile.findUnique({
        where: { id: series.coverFileId },
        select: { id: true },
      });
      if (fileExists) {
        resolvedSource = 'user';
        resolvedFileId = series.coverFileId;
        resolvedHash = await getFileCoverHash(series.coverFileId);
      }
    }
    // Fall through to first issue if no valid user cover
    if (resolvedSource === 'none' && firstIssue) {
      resolvedSource = 'firstIssue';
      resolvedFileId = firstIssue.id;
      // For first issue, use coverHash if it has a custom cover, otherwise hash
      resolvedHash = firstIssue.coverHash || firstIssue.hash;
    }
  }

  await db.series.update({
    where: { id: seriesId },
    data: {
      resolvedCoverHash: resolvedHash,
      resolvedCoverSource: resolvedSource,
      resolvedCoverFileId: resolvedFileId,
      resolvedCoverUpdatedAt: new Date(),
    },
  });
}

/**
 * Trigger cover recalculation when source data changes.
 * Call this after modifying cover-related fields on series or files.
 */
export async function onCoverSourceChanged(
  entityType: 'series' | 'file',
  entityId: string
): Promise<void> {
  const db = getDatabase();

  if (entityType === 'series') {
    await recalculateSeriesCover(entityId);
  } else if (entityType === 'file') {
    // Find series that use this file as cover or have it as first issue
    const affectedSeries = await db.series.findMany({
      where: {
        OR: [
          { coverFileId: entityId },
          { resolvedCoverFileId: entityId },
        ],
      },
      select: { id: true },
    });

    for (const series of affectedSeries) {
      await recalculateSeriesCover(series.id);
    }
  }
}

/**
 * Recalculate resolved covers for all series.
 * Used for initial backfill or after schema changes.
 */
export async function recalculateAllSeriesCovers(): Promise<{ processed: number; errors: number }> {
  const db = getDatabase();

  const allSeries = await db.series.findMany({
    select: { id: true },
  });

  let processed = 0;
  let errors = 0;

  for (const series of allSeries) {
    try {
      await recalculateSeriesCover(series.id);
      processed++;
    } catch (error) {
      console.error(`Failed to recalculate cover for series ${series.id}:`, error);
      errors++;
    }
  }

  return { processed, errors };
}
