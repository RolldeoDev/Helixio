/**
 * Thumbnail Service
 *
 * Handles page thumbnail generation and caching for comic archives.
 * Thumbnails are stored at ~/.helixio/cache/thumbnails/{libraryId}/{fileHash}/{pageNumber}.jpg
 */

import { existsSync } from 'fs';
import { mkdir, readdir, rm, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import sharp from 'sharp';
import { getCacheDir } from './app-paths.service.js';
import {
  listArchiveContents,
  extractArchive,
  createTempDir,
  cleanupTempDir,
} from './archive.service.js';
import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export interface ThumbnailGenerationResult {
  success: boolean;
  pageCount: number;
  generatedCount: number;
  fromCache: number;
  errors: Array<{ page: number; error: string }>;
}

export interface ThumbnailProgress {
  fileId: string;
  filename: string;
  currentPage: number;
  totalPages: number;
  status: 'extracting' | 'generating' | 'complete' | 'error';
  error?: string;
}

export interface ThumbnailCacheSummary {
  totalFiles: number;
  totalThumbnails: number;
  totalSize: number;
  libraries: Array<{
    libraryId: string;
    fileCount: number;
    thumbnailCount: number;
    size: number;
  }>;
}

// =============================================================================
// Path Helpers
// =============================================================================

/**
 * Get the root thumbnails cache directory.
 */
export function getThumbnailsDir(): string {
  return join(getCacheDir(), 'thumbnails');
}

/**
 * Get a library's thumbnail cache directory.
 */
export function getLibraryThumbnailDir(libraryId: string): string {
  return join(getThumbnailsDir(), libraryId);
}

/**
 * Get a file's thumbnail cache directory.
 */
export function getFileThumbnailDir(libraryId: string, fileHash: string): string {
  return join(getLibraryThumbnailDir(libraryId), fileHash);
}

/**
 * Get the path to a specific page thumbnail.
 */
export function getThumbnailPath(libraryId: string, fileHash: string, pageNumber: number): string {
  const paddedPage = pageNumber.toString().padStart(4, '0');
  return join(getFileThumbnailDir(libraryId, fileHash), `${paddedPage}.jpg`);
}

// =============================================================================
// Image Helpers
// =============================================================================

/**
 * Check if a file is an image by extension.
 */
function isImageFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
}

/**
 * Ensure the file thumbnail directory exists.
 */
async function ensureFileThumbnailDir(libraryId: string, fileHash: string): Promise<string> {
  const dir = getFileThumbnailDir(libraryId, fileHash);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

/**
 * Find an extracted file in a directory, handling various path structures.
 */
async function findExtractedFile(tempDir: string, entryPath: string): Promise<string | null> {
  // First, try the exact path
  const exactPath = join(tempDir, entryPath);
  try {
    await stat(exactPath);
    return exactPath;
  } catch {
    // Not at exact path
  }

  // Scan recursively for the file
  try {
    const targetFilename = basename(entryPath);
    const files = await readdir(tempDir, { recursive: true });

    // First priority: exact entry path match (normalized)
    for (const file of files) {
      const filePath = typeof file === 'string' ? file : String(file);
      if (filePath === entryPath || filePath.replace(/\\/g, '/') === entryPath.replace(/\\/g, '/')) {
        return join(tempDir, filePath);
      }
    }

    // Second priority: filename match
    for (const file of files) {
      const filePath = typeof file === 'string' ? file : String(file);
      if (basename(filePath) === targetFilename) {
        return join(tempDir, filePath);
      }
    }
  } catch {
    // Scan failed
  }

  return null;
}

// =============================================================================
// Thumbnail Generation
// =============================================================================

/**
 * Generate thumbnails for all pages in a comic archive.
 * Returns cached versions if available.
 */
export async function generateThumbnails(
  archivePath: string,
  libraryId: string,
  fileHash: string,
  options: {
    width?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ThumbnailGenerationResult> {
  const width = options.width || 80;

  // Get archive contents to identify pages
  let archiveInfo;
  try {
    archiveInfo = await listArchiveContents(archivePath);
  } catch (err) {
    return {
      success: false,
      pageCount: 0,
      generatedCount: 0,
      fromCache: 0,
      errors: [{ page: 0, error: `Failed to read archive: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }

  const imageEntries = archiveInfo.entries
    .filter((e) => !e.isDirectory && isImageFile(e.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (imageEntries.length === 0) {
    return {
      success: false,
      pageCount: 0,
      generatedCount: 0,
      fromCache: 0,
      errors: [{ page: 0, error: 'No image files found in archive' }],
    };
  }

  // Ensure thumbnail directory exists
  await ensureFileThumbnailDir(libraryId, fileHash);

  let generatedCount = 0;
  let fromCache = 0;
  const errors: Array<{ page: number; error: string }> = [];

  // Check how many thumbnails already exist
  const missingPages: number[] = [];
  for (let i = 0; i < imageEntries.length; i++) {
    const thumbPath = getThumbnailPath(libraryId, fileHash, i + 1);
    if (existsSync(thumbPath)) {
      fromCache++;
    } else {
      missingPages.push(i);
    }
  }

  // If all thumbnails exist, return early
  if (missingPages.length === 0) {
    return {
      success: true,
      pageCount: imageEntries.length,
      generatedCount: 0,
      fromCache,
      errors: [],
    };
  }

  // Extract archive to temp directory
  const tempDir = await createTempDir('thumbnails-');

  try {
    const extractResult = await extractArchive(archivePath, tempDir);
    if (!extractResult.success) {
      return {
        success: false,
        pageCount: imageEntries.length,
        generatedCount: 0,
        fromCache,
        errors: [{ page: 0, error: extractResult.error || 'Failed to extract archive' }],
      };
    }

    // Generate thumbnails for missing pages
    for (const pageIndex of missingPages) {
      const entry = imageEntries[pageIndex];
      if (!entry) continue;

      const pageNumber = pageIndex + 1;
      const thumbPath = getThumbnailPath(libraryId, fileHash, pageNumber);

      options.onProgress?.(pageNumber, imageEntries.length);

      try {
        // Find the extracted file
        const extractedPath = await findExtractedFile(tempDir, entry.path);
        if (!extractedPath) {
          errors.push({ page: pageNumber, error: `File not found: ${entry.path}` });
          continue;
        }

        // Generate thumbnail using sharp
        await sharp(extractedPath)
          .resize(width, null, { withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(thumbPath);

        generatedCount++;
      } catch (err) {
        errors.push({
          page: pageNumber,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      success: errors.length === 0 || generatedCount > 0,
      pageCount: imageEntries.length,
      generatedCount,
      fromCache,
      errors,
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Generate thumbnails for a comic file by its database ID.
 */
export async function generateThumbnailsForFile(
  fileId: string,
  options: {
    width?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ThumbnailGenerationResult> {
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
      pageCount: 0,
      generatedCount: 0,
      fromCache: 0,
      errors: [{ page: 0, error: 'File not found' }],
    };
  }

  if (!file.hash) {
    return {
      success: false,
      pageCount: 0,
      generatedCount: 0,
      fromCache: 0,
      errors: [{ page: 0, error: 'File hash not available' }],
    };
  }

  return generateThumbnails(file.path, file.libraryId, file.hash, options);
}

/**
 * Generate a single thumbnail on-demand if it doesn't exist in cache.
 * Returns the path to the thumbnail (either existing or newly generated).
 */
export async function ensureThumbnailExists(
  archivePath: string,
  libraryId: string,
  fileHash: string,
  pageNumber: number,
  width: number = 80
): Promise<{ success: boolean; thumbnailPath?: string; error?: string }> {
  // Check if thumbnail already exists
  const thumbPath = getThumbnailPath(libraryId, fileHash, pageNumber);
  if (existsSync(thumbPath)) {
    return { success: true, thumbnailPath: thumbPath };
  }

  // Get archive contents to find the specific page
  let archiveInfo;
  try {
    archiveInfo = await listArchiveContents(archivePath);
  } catch (err) {
    return {
      success: false,
      error: `Failed to read archive: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const imageEntries = archiveInfo.entries
    .filter((e) => !e.isDirectory && isImageFile(e.path))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  const pageIndex = pageNumber - 1; // Convert 1-based to 0-based
  if (pageIndex < 0 || pageIndex >= imageEntries.length) {
    return { success: false, error: `Page ${pageNumber} not found (valid range: 1-${imageEntries.length})` };
  }

  const entry = imageEntries[pageIndex];
  if (!entry) {
    return { success: false, error: `Page ${pageNumber} not found` };
  }

  // Ensure thumbnail directory exists
  await ensureFileThumbnailDir(libraryId, fileHash);

  // Extract archive to temp directory
  const tempDir = await createTempDir('thumbnail-single-');

  try {
    const extractResult = await extractArchive(archivePath, tempDir);
    if (!extractResult.success) {
      return { success: false, error: extractResult.error || 'Failed to extract archive' };
    }

    // Find the extracted file
    const extractedPath = await findExtractedFile(tempDir, entry.path);
    if (!extractedPath) {
      return { success: false, error: `File not found in archive: ${entry.path}` };
    }

    // Generate thumbnail using sharp
    await sharp(extractedPath)
      .resize(width, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);

    return { success: true, thumbnailPath: thumbPath };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Get the number of cached thumbnails for a file.
 */
export async function getThumbnailCount(libraryId: string, fileHash: string): Promise<number> {
  const dir = getFileThumbnailDir(libraryId, fileHash);
  if (!existsSync(dir)) return 0;

  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith('.jpg')).length;
  } catch {
    return 0;
  }
}

/**
 * Check if thumbnails are cached for a file.
 */
export async function hasThumbnails(libraryId: string, fileHash: string): Promise<boolean> {
  const count = await getThumbnailCount(libraryId, fileHash);
  return count > 0;
}

/**
 * Delete all cached thumbnails for a file.
 */
export async function deleteThumbnails(
  libraryId: string,
  fileHash: string
): Promise<boolean> {
  const dir = getFileThumbnailDir(libraryId, fileHash);

  if (!existsSync(dir)) {
    return true; // Already doesn't exist
  }

  try {
    await rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete all cached thumbnails for a library.
 */
export async function deleteLibraryThumbnails(libraryId: string): Promise<{
  deleted: number;
  errors: number;
}> {
  const dir = getLibraryThumbnailDir(libraryId);

  if (!existsSync(dir)) {
    return { deleted: 0, errors: 0 };
  }

  try {
    const files = await readdir(dir);
    await rm(dir, { recursive: true, force: true });
    return { deleted: files.length, errors: 0 };
  } catch {
    return { deleted: 0, errors: 1 };
  }
}

/**
 * Get thumbnail cache summary for all libraries.
 */
export async function getThumbnailCacheSummary(): Promise<ThumbnailCacheSummary> {
  const thumbnailsDir = getThumbnailsDir();
  const libraries: ThumbnailCacheSummary['libraries'] = [];
  let totalFiles = 0;
  let totalThumbnails = 0;
  let totalSize = 0;

  if (!existsSync(thumbnailsDir)) {
    return { totalFiles: 0, totalThumbnails: 0, totalSize: 0, libraries: [] };
  }

  try {
    const libraryDirs = await readdir(thumbnailsDir);

    for (const libraryId of libraryDirs) {
      const libraryDir = join(thumbnailsDir, libraryId);
      const libraryStat = await stat(libraryDir);

      if (!libraryStat.isDirectory()) continue;

      let fileCount = 0;
      let thumbnailCount = 0;
      let size = 0;

      try {
        const fileDirs = await readdir(libraryDir);
        fileCount = fileDirs.length;

        for (const fileHash of fileDirs) {
          const fileDir = join(libraryDir, fileHash);
          try {
            const fileDirStat = await stat(fileDir);
            if (!fileDirStat.isDirectory()) continue;

            const thumbFiles = await readdir(fileDir);
            for (const thumbFile of thumbFiles) {
              if (thumbFile.endsWith('.jpg')) {
                thumbnailCount++;
                try {
                  const thumbStat = await stat(join(fileDir, thumbFile));
                  size += thumbStat.size;
                } catch {
                  // Skip files we can't stat
                }
              }
            }
          } catch {
            // Skip dirs we can't read
          }
        }

        libraries.push({ libraryId, fileCount, thumbnailCount, size });
        totalFiles += fileCount;
        totalThumbnails += thumbnailCount;
        totalSize += size;
      } catch {
        // Skip libraries we can't read
      }
    }
  } catch {
    // Return empty summary on error
  }

  return { totalFiles, totalThumbnails, totalSize, libraries };
}

/**
 * Clean up orphaned thumbnails (for files no longer in database).
 */
export async function cleanupOrphanedThumbnails(): Promise<{
  checked: number;
  deleted: number;
  errors: number;
}> {
  let checked = 0;
  let deleted = 0;
  let errors = 0;

  const thumbnailsDir = getThumbnailsDir();

  if (!existsSync(thumbnailsDir)) {
    return { checked: 0, deleted: 0, errors: 0 };
  }

  try {
    const libraryDirs = await readdir(thumbnailsDir);

    for (const libraryId of libraryDirs) {
      const libraryDir = join(thumbnailsDir, libraryId);
      const libraryStat = await stat(libraryDir);

      if (!libraryStat.isDirectory()) continue;

      // Check if library exists
      const prisma = getDatabase();
      const library = await prisma.library.findUnique({
        where: { id: libraryId },
      });

      if (!library) {
        // Delete entire library's thumbnails
        const result = await deleteLibraryThumbnails(libraryId);
        deleted += result.deleted;
        errors += result.errors;
        continue;
      }

      // Check individual file thumbnail directories
      const fileDirs = await readdir(libraryDir);

      for (const fileHash of fileDirs) {
        checked++;

        // Check if any file with this hash exists
        const existingFile = await prisma.comicFile.findFirst({
          where: {
            libraryId,
            hash: fileHash,
          },
        });

        if (!existingFile) {
          const deleteResult = await deleteThumbnails(libraryId, fileHash);
          if (deleteResult) {
            deleted++;
          } else {
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

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Generate thumbnails for multiple files.
 */
export async function batchGenerateThumbnails(
  fileIds: string[],
  options: {
    width?: number;
    onProgress?: (fileIndex: number, total: number, pageProgress?: ThumbnailProgress) => void;
  } = {}
): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: Array<{ fileId: string; result: ThumbnailGenerationResult }>;
}> {
  const results: Array<{ fileId: string; result: ThumbnailGenerationResult }> = [];
  let successful = 0;
  let failed = 0;

  const prisma = getDatabase();

  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i]!;

    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: { id: true, path: true, filename: true, hash: true, libraryId: true },
    });

    if (!file || !file.hash) {
      failed++;
      results.push({
        fileId,
        result: {
          success: false,
          pageCount: 0,
          generatedCount: 0,
          fromCache: 0,
          errors: [{ page: 0, error: file ? 'File hash not available' : 'File not found' }],
        },
      });
      continue;
    }

    options.onProgress?.(i + 1, fileIds.length, {
      fileId: file.id,
      filename: file.filename,
      currentPage: 0,
      totalPages: 0,
      status: 'extracting',
    });

    const result = await generateThumbnails(file.path, file.libraryId, file.hash, {
      width: options.width,
      onProgress: (current, total) => {
        options.onProgress?.(i + 1, fileIds.length, {
          fileId: file.id,
          filename: file.filename,
          currentPage: current,
          totalPages: total,
          status: 'generating',
        });
      },
    });

    if (result.success) {
      successful++;
    } else {
      failed++;
    }

    results.push({ fileId, result });
  }

  return { total: fileIds.length, successful, failed, results };
}
