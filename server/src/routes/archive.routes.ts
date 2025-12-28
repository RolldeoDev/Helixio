/**
 * Archive Routes
 *
 * API endpoints for archive operations:
 * - List archive contents
 * - Extract files from archives
 * - CBR to CBZ conversion
 * - ComicInfo.xml reading/writing
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../services/database.service.js';
import {
  listArchiveContents,
  validateArchive,
  getArchiveStats,
  extractSingleFile,
  extractArchive,
  getArchiveFormat,
  deletePagesFromArchive,
} from '../services/archive.service.js';
import {
  readComicInfo,
  writeComicInfo,
  mergeComicInfo,
  ComicInfo,
} from '../services/comicinfo.service.js';
import {
  convertCbrToCbz,
  batchConvertCbrToCbz,
  canConvert,
  getConversionPreview,
  findConvertibleFiles,
} from '../services/conversion.service.js';
import {
  deleteCachedCover,
  extractCover,
} from '../services/cover.service.js';
import { invalidateFileMetadata } from '../services/metadata-invalidation.service.js';
import { mkdir, stat, access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { archiveLogger, logError, logWarn } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Archive Extraction Lock
// =============================================================================

/**
 * In-memory lock to prevent concurrent archive extractions.
 * Maps fileId to a Promise that resolves when extraction is complete.
 * This prevents race conditions when multiple page requests arrive simultaneously.
 */
const extractionLocks = new Map<string, Promise<{ success: boolean; error?: string }>>();

/**
 * Extract archive with locking to prevent concurrent extractions.
 * If an extraction is already in progress, waits for it to complete.
 */
async function extractArchiveWithLock(
  fileId: string,
  archivePath: string,
  cacheDir: string
): Promise<{ success: boolean; error?: string }> {
  // Check if extraction is already in progress
  const existingLock = extractionLocks.get(fileId);
  if (existingLock) {
    archiveLogger.debug({ fileId }, 'Waiting for existing extraction');
    return existingLock;
  }

  // Create a new extraction promise
  const extractionPromise = (async () => {
    try {
      archiveLogger.debug({ fileId, cacheDir }, 'Starting extraction');
      await mkdir(cacheDir, { recursive: true });
      const result = await extractArchive(archivePath, cacheDir);
      if (result.success) {
        archiveLogger.debug({ fileCount: result.fileCount }, 'Extracted files to cache');
        return { success: true };
      } else {
        archiveLogger.error({ error: result.error }, 'Extraction failed');
        return { success: false, error: result.error };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      archiveLogger.error({ error: errorMsg }, 'Extraction error');
      return { success: false, error: errorMsg };
    } finally {
      // Remove lock after extraction completes
      extractionLocks.delete(fileId);
    }
  })();

  // Store the lock
  extractionLocks.set(fileId, extractionPromise);

  return extractionPromise;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a file exists on disk and auto-fix stale CBR->CBZ paths.
 * Returns the corrected path or throws with an appropriate error.
 */
async function verifyAndFixFilePath(
  file: { id: string; path: string; filename: string; relativePath: string },
  db: ReturnType<typeof getDatabase>
): Promise<string> {
  try {
    await access(file.path, fsConstants.R_OK);
    return file.path;
  } catch {
    // File doesn't exist - check if there's a CBZ version (in case CBR was converted)
    if (file.path.toLowerCase().endsWith('.cbr')) {
      const cbzPath = file.path.replace(/\.cbr$/i, '.cbz');
      try {
        await access(cbzPath, fsConstants.R_OK);
        // CBZ exists! Update the database to fix the stale path
        archiveLogger.info({ oldPath: file.path, newPath: cbzPath }, 'Auto-fixing stale CBR path to CBZ');
        await db.comicFile.update({
          where: { id: file.id },
          data: {
            path: cbzPath,
            filename: file.filename.replace(/\.cbr$/i, '.cbz'),
            relativePath: file.relativePath.replace(/\.cbr$/i, '.cbz'),
          },
        });
        return cbzPath;
      } catch {
        // CBZ also doesn't exist
      }
    }
    throw new Error(`File not found on disk: ${file.path}`);
  }
}

// =============================================================================
// Archive Information
// =============================================================================

/**
 * GET /api/archives/:fileId/info
 * Get information about an archive
 */
router.get('/:fileId/info', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Verify file exists and fix stale paths
    let filePath: string;
    try {
      filePath = await verifyAndFixFilePath(file, db);
    } catch (err) {
      res.status(404).json({
        error: 'Archive file not found on disk',
        message: err instanceof Error ? err.message : String(err),
        path: file.path,
      });
      return;
    }

    const info = await listArchiveContents(filePath);

    res.json({
      fileId: file.id,
      filename: file.filename,
      path: file.path,
      archive: {
        format: info.format,
        fileCount: info.fileCount,
        totalSize: info.totalSize,
        hasComicInfo: info.hasComicInfo,
        coverPath: info.coverPath,
      },
    });
  } catch (error) {
    logError('archive', error, { action: 'get-info' });
    res.status(500).json({
      error: 'Failed to get archive info',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/archives/:fileId/contents
 * List all files in an archive
 */
router.get('/:fileId/contents', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Verify file exists and fix stale paths
    let filePath: string;
    try {
      filePath = await verifyAndFixFilePath(file, db);
    } catch (err) {
      res.status(404).json({
        error: 'Archive file not found on disk',
        message: err instanceof Error ? err.message : String(err),
        path: file.path,
      });
      return;
    }

    const info = await listArchiveContents(filePath);

    res.json({
      fileId: file.id,
      filename: file.filename,
      format: info.format,
      entries: info.entries.map((e) => ({
        path: e.path,
        size: e.size,
        isDirectory: e.isDirectory,
        date: e.date,
      })),
    });
  } catch (error) {
    logError('archive', error, { action: 'list-contents' });
    res.status(500).json({
      error: 'Failed to list archive contents',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/archives/:fileId/validate
 * Validate archive integrity
 */
router.get('/:fileId/validate', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const validation = await validateArchive(file.path);

    res.json({
      fileId: file.id,
      filename: file.filename,
      valid: validation.valid,
      error: validation.error,
      info: validation.info ? {
        format: validation.info.format,
        fileCount: validation.info.fileCount,
        hasComicInfo: validation.info.hasComicInfo,
      } : undefined,
    });
  } catch (error) {
    logError('archive', error, { action: 'validate' });
    res.status(500).json({
      error: 'Failed to validate archive',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// ComicInfo.xml Operations
// =============================================================================

/**
 * GET /api/archives/:fileId/comicinfo
 * Read ComicInfo.xml from an archive
 */
router.get('/:fileId/comicinfo', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    // Include series to get locked fields
    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
      include: { series: { select: { lockedFields: true } } },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found in database' });
      return;
    }

    // Verify file exists and fix stale paths
    let filePath: string;
    try {
      filePath = await verifyAndFixFilePath(file, db);
    } catch (err) {
      res.status(404).json({
        error: 'Archive file not found on disk',
        message: err instanceof Error ? err.message : String(err),
        path: file.path,
      });
      return;
    }

    const result = await readComicInfo(filePath);

    if (!result.success) {
      // Distinguish between "no ComicInfo.xml" and "couldn't read archive"
      const errorLower = (result.error || '').toLowerCase();
      if (errorLower.includes('does not contain comicinfo')) {
        res.status(404).json({
          error: 'ComicInfo.xml not found',
          message: 'This archive does not contain a ComicInfo.xml file',
        });
      } else {
        res.status(500).json({
          error: 'Failed to read archive',
          message: result.error,
        });
      }
      return;
    }

    // Parse locked fields from series (comma-separated string to array)
    const lockedFields = file.series?.lockedFields
      ? file.series.lockedFields.split(',').map((f: string) => f.trim()).filter(Boolean)
      : [];

    res.json({
      fileId: file.id,
      filename: file.filename,
      comicInfo: result.comicInfo,
      lockedFields,
    });
  } catch (error) {
    logError('archive', error, { action: 'read-comicinfo' });
    res.status(500).json({
      error: 'Failed to read ComicInfo.xml',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/archives/:fileId/comicinfo
 * Write/replace ComicInfo.xml in an archive
 */
router.put('/:fileId/comicinfo', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found in database' });
      return;
    }

    // Verify file exists and fix stale paths
    let filePath: string;
    try {
      filePath = await verifyAndFixFilePath(file, db);
    } catch (err) {
      res.status(404).json({
        error: 'Archive file not found on disk',
        message: err instanceof Error ? err.message : String(err),
        path: file.path,
      });
      return;
    }

    // Validate archive is a CBZ (can't modify RAR files)
    const format = getArchiveFormat(filePath);
    if (format !== 'zip') {
      res.status(400).json({
        error: 'Cannot modify non-CBZ archives',
        message: 'Convert to CBZ first before editing metadata',
      });
      return;
    }

    const comicInfo = req.body as ComicInfo;

    const result = await writeComicInfo(filePath, comicInfo);

    if (!result.success) {
      res.status(500).json({
        error: 'Failed to write ComicInfo.xml',
        message: result.error,
      });
      return;
    }

    // Invalidate and refresh all related data (cache, series linkage, etc.)
    // This handles moving the file to a new series if the metadata series changed
    const invalidationResult = await invalidateFileMetadata(file.id, {
      refreshFromArchive: true,
      updateSeriesLinkage: true,
    });

    res.json({
      success: true,
      fileId: file.id,
      message: 'ComicInfo.xml updated',
      seriesUpdated: invalidationResult.seriesUpdated,
      warnings: invalidationResult.warnings?.length ? invalidationResult.warnings : undefined,
    });
  } catch (error) {
    logError('archive', error, { action: 'write-comicinfo' });
    res.status(500).json({
      error: 'Failed to write ComicInfo.xml',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PATCH /api/archives/:fileId/comicinfo
 * Merge/update specific fields in ComicInfo.xml
 */
router.patch('/:fileId/comicinfo', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    // Include series to get locked fields for validation
    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
      include: { series: { select: { lockedFields: true } } },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found in database' });
      return;
    }

    // Verify file exists and fix stale paths
    let filePath: string;
    try {
      filePath = await verifyAndFixFilePath(file, db);
    } catch (err) {
      res.status(404).json({
        error: 'Archive file not found on disk',
        message: err instanceof Error ? err.message : String(err),
        path: file.path,
      });
      return;
    }

    // Validate archive is a CBZ
    const format = getArchiveFormat(filePath);
    if (format !== 'zip') {
      res.status(400).json({
        error: 'Cannot modify non-CBZ archives',
        message: 'Convert to CBZ first before editing metadata',
      });
      return;
    }

    const rawUpdates = req.body as Record<string, unknown>;

    // Check for locked fields before processing
    const lockedFields = file.series?.lockedFields
      ? file.series.lockedFields.split(',').map((f: string) => f.trim()).filter(Boolean)
      : [];

    const attemptedLockedFields = Object.keys(rawUpdates).filter(
      (key) => lockedFields.includes(key)
    );

    if (attemptedLockedFields.length > 0) {
      res.status(400).json({
        error: 'Cannot modify locked fields',
        lockedFields: attemptedLockedFields,
        message: `The following fields are locked by series settings: ${attemptedLockedFields.join(', ')}`,
      });
      return;
    }

    // Sentinel value indicating a field should be removed from ComicInfo.xml
    const REMOVE_FIELD = '__REMOVE_FIELD__';

    // Separate field updates from field removals
    const updates: Partial<ComicInfo> = {};
    const removals: string[] = [];

    for (const [key, value] of Object.entries(rawUpdates)) {
      if (value === REMOVE_FIELD) {
        // This field should be removed from the archive
        removals.push(key);
      } else if (value !== undefined) {
        // Normal update
        (updates as Record<string, unknown>)[key] = value;
      }
    }

    const result = await mergeComicInfo(filePath, updates, removals);

    if (!result.success) {
      res.status(500).json({
        error: 'Failed to update ComicInfo.xml',
        message: result.error,
      });
      return;
    }

    // Invalidate and refresh all related data (cache, series linkage, etc.)
    // This handles moving the file to a new series if the metadata series changed
    // Pass the merged comicInfo directly to avoid re-reading from archive
    // (macOS file system caching can cause stale reads immediately after writes)
    const invalidationResult = await invalidateFileMetadata(file.id, {
      comicInfo: result.comicInfo,
      updateSeriesLinkage: true,
    });

    res.json({
      success: true,
      fileId: file.id,
      message: 'ComicInfo.xml fields updated',
      seriesUpdated: invalidationResult.seriesUpdated,
      warnings: invalidationResult.warnings?.length ? invalidationResult.warnings : undefined,
    });
  } catch (error) {
    logError('archive', error, { action: 'update-comicinfo' });
    res.status(500).json({
      error: 'Failed to update ComicInfo.xml',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Cover Extraction
// =============================================================================

/**
 * GET /api/archives/:fileId/cover
 * Extract and return optimized cover image.
 * Supports WebP (default) with JPEG fallback based on Accept header.
 * Returns X-Blur-Placeholder header with base64 blur placeholder for instant load.
 */
router.get('/:fileId/cover', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { getCoverData, extractCover, getSeriesCoverData } = await import('../services/cover.service.js');

    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
      include: { library: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const fileHash = file.hash || file.id;

    // Check Accept header for WebP support
    const acceptHeader = req.get('Accept') || '';
    const acceptWebP = acceptHeader.includes('image/webp');

    let coverData;

    // If a custom cover (page or custom URL) is set, use coverHash from series covers cache
    if ((file.coverSource === 'page' || file.coverSource === 'custom') && file.coverHash) {
      coverData = await getSeriesCoverData(file.coverHash, acceptWebP);
    }

    // If no custom cover or not found, try default file cover
    if (!coverData) {
      coverData = await getCoverData(file.libraryId, fileHash, acceptWebP);

      // If not cached, extract and optimize
      if (!coverData) {
        const extractResult = await extractCover(file.path, file.libraryId, fileHash);

        if (!extractResult.success) {
          res.status(500).json({
            error: 'Failed to extract cover',
            message: extractResult.error,
          });
          return;
        }

        // Get the newly extracted cover
        coverData = await getCoverData(file.libraryId, fileHash, acceptWebP);

        if (!coverData) {
          res.status(500).json({ error: 'Failed to load extracted cover' });
          return;
        }
      }
    }

    // Use coverHash for ETag when custom cover exists, otherwise use fileHash
    // This ensures browsers revalidate when covers change
    const etagBase = file.coverHash || fileHash;
    const etag = `"${etagBase}-${acceptWebP ? 'webp' : 'jpeg'}"`;

    // Check If-None-Match for conditional requests
    const ifNoneMatch = req.get('If-None-Match');
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    // Set response headers
    // Use must-revalidate since the same URL can serve different covers
    // when coverHash changes. The ?v=timestamp query param from client
    // will also help bypass cached versions.
    res.set({
      'Content-Type': coverData.contentType,
      'Content-Length': coverData.data.length.toString(),
      'Cache-Control': 'public, max-age=86400, must-revalidate',
      'ETag': etag,
      'Vary': 'Accept', // Important: response varies by Accept header
    });

    // Include blur placeholder in header for instant perceived load
    if (coverData.blurPlaceholder) {
      res.set('X-Blur-Placeholder', coverData.blurPlaceholder);
    }

    // Send the cover data
    res.send(coverData.data);
  } catch (error) {
    logError('archive', error, { action: 'extract-cover' });
    res.status(500).json({
      error: 'Failed to extract cover',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Page Extraction (for Page Editor)
// =============================================================================

/**
 * GET /api/archives/:fileId/page/:pagePath
 * Extract and return a specific page image from an archive
 */
router.get('/:fileId/page/:pagePath(*)', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const pagePath = req.params.pagePath;

    if (!pagePath) {
      res.status(400).json({ error: 'Page path is required' });
      return;
    }

    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Verify file exists and fix stale paths
    let filePath: string;
    try {
      filePath = await verifyAndFixFilePath(file, db);
    } catch (err) {
      res.status(404).json({
        error: 'Archive file not found on disk',
        message: err instanceof Error ? err.message : String(err),
        path: file.path,
      });
      return;
    }

    // Use a persistent extraction cache per archive
    const cacheDir = `/tmp/helixio-archive-cache-${file.id}`;
    const decodedPagePath = decodeURIComponent(pagePath);

    // Check if the file is already in the cache
    const cachedFilePath = `${cacheDir}/${decodedPagePath}`;
    let fileExists = false;
    try {
      await stat(cachedFilePath);
      fileExists = true;
    } catch {
      // File not in cache
    }

    if (!fileExists) {
      // Check if archive is already extracted to cache
      let cachePopulated = false;
      try {
        const cacheStats = await stat(cacheDir);
        // If cache dir exists and has files, assume it's populated
        if (cacheStats.isDirectory()) {
          const { readdir } = await import('fs/promises');
          const files = await readdir(cacheDir);
          cachePopulated = files.length > 0;
        }
      } catch {
        // Cache dir doesn't exist
      }

      if (!cachePopulated) {
        // Extract with locking to prevent concurrent extractions
        const extractResult = await extractArchiveWithLock(file.id, filePath, cacheDir);
        if (!extractResult.success) {
          res.status(500).json({
            error: 'Failed to extract archive',
            message: extractResult.error,
          });
          return;
        }
      }
    }

    // Find the requested file - try full path first, then just filename
    // (7zip sometimes flattens directory structure during extraction)
    let actualFilePath = cachedFilePath;
    try {
      await stat(cachedFilePath);
    } catch {
      // Full path not found, try just the filename
      const filename = decodedPagePath.split('/').pop() || decodedPagePath;
      const flatPath = `${cacheDir}/${filename}`;
      try {
        await stat(flatPath);
        actualFilePath = flatPath;
      } catch {
        res.status(404).json({
          error: 'Page not found in archive',
          path: decodedPagePath,
        });
        return;
      }
    }

    // Determine content type based on file extension
    const ext = decodedPagePath.toLowerCase().split('.').pop();
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
    };

    const contentType = contentTypes[ext || ''] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour

    // Send the cached file
    res.sendFile(actualFilePath);
  } catch (error) {
    logError('archive', error, { action: 'extract-page' });
    res.status(500).json({
      error: 'Failed to extract page',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/archives/:fileId/pages/delete
 * Delete pages from an archive
 */
router.post('/:fileId/pages/delete', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { pages } = req.body as { pages: string[] };

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      res.status(400).json({ error: 'No pages specified for deletion' });
      return;
    }

    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Verify file exists and fix stale paths
    let filePath: string;
    try {
      filePath = await verifyAndFixFilePath(file, db);
    } catch (err) {
      res.status(404).json({
        error: 'Archive file not found on disk',
        message: err instanceof Error ? err.message : String(err),
        path: file.path,
      });
      return;
    }

    // Delete pages from archive
    const result = await deletePagesFromArchive(filePath, pages);

    if (!result.success) {
      res.status(400).json({
        error: 'Failed to delete pages',
        message: result.error,
      });
      return;
    }

    // Clear the page extraction cache for this file
    const cacheDir = `/tmp/helixio-archive-cache-${file.id}`;
    try {
      const { rm } = await import('fs/promises');
      await rm(cacheDir, { recursive: true, force: true });
      archiveLogger.debug({ cacheDir }, 'Cleared page cache');
    } catch {
      // Cache dir might not exist, ignore
    }

    // Invalidate and rebuild cover cache since the first page may have changed
    const fileHash = file.hash || file.id;
    try {
      // Delete existing cover from both disk and memory cache
      await deleteCachedCover(file.libraryId, fileHash);
      archiveLogger.debug({ fileHash }, 'Cleared cover cache');

      // Re-extract cover with the new first page
      const coverResult = await extractCover(filePath, file.libraryId, fileHash);
      if (coverResult.success) {
        archiveLogger.debug('Re-extracted cover from new first page');
      } else {
        archiveLogger.warn({ error: coverResult.error }, 'Failed to re-extract cover');
      }
    } catch (coverErr) {
      logWarn('archive', 'Error updating cover cache', { err: coverErr });
      // Don't fail the whole operation if cover update fails
    }

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Successfully deleted ${result.deletedCount} page(s)`,
    });
  } catch (error) {
    logError('archive', error, { action: 'delete-pages' });
    res.status(500).json({
      error: 'Failed to delete pages',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Conversion Operations
// =============================================================================

/**
 * GET /api/archives/:fileId/convert/preview
 * Preview conversion for a file
 */
router.get('/:fileId/convert/preview', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const preview = await getConversionPreview(file.path);

    res.json({
      fileId: file.id,
      ...preview,
    });
  } catch (error) {
    logError('archive', error, { action: 'conversion-preview' });
    res.status(500).json({
      error: 'Failed to get conversion preview',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/archives/:fileId/convert
 * Convert a CBR file to CBZ
 */
router.post('/:fileId/convert', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const file = await db.comicFile.findUnique({
      where: { id: req.params.fileId! },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const { deleteOriginal = true, overwrite = false } = req.body as {
      deleteOriginal?: boolean;
      overwrite?: boolean;
    };

    // Check if can convert
    const canConvertResult = await canConvert(file.path);
    if (!canConvertResult.canConvert) {
      res.status(400).json({
        error: 'Cannot convert file',
        reason: canConvertResult.reason,
      });
      return;
    }

    const result = await convertCbrToCbz(file.path, {
      deleteOriginal,
      overwrite,
    });

    if (result.success) {
      res.json({
        success: true,
        fileId: file.id,
        source: result.source,
        destination: result.destination,
        originalSize: result.originalSize,
        newSize: result.newSize,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        quarantined: result.quarantined,
      });
    }
  } catch (error) {
    logError('archive', error, { action: 'convert-file' });
    res.status(500).json({
      error: 'Failed to convert file',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/archives/library/:libraryId/convertible
 * Find all CBR files in a library that can be converted
 */
router.get('/library/:libraryId/convertible', async (req: Request, res: Response) => {
  try {
    const result = await findConvertibleFiles(req.params.libraryId!);

    res.json(result);
  } catch (error) {
    logError('archive', error, { action: 'find-convertible' });
    res.status(500).json({
      error: 'Failed to find convertible files',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/archives/library/:libraryId/convert/batch
 * Convert all CBR files in a library to CBZ
 */
router.post('/library/:libraryId/convert/batch', async (req: Request, res: Response) => {
  try {
    const { deleteOriginal = true, fileIds } = req.body as {
      deleteOriginal?: boolean;
      fileIds?: string[];
    };

    const db = getDatabase();

    // Get files to convert
    let files;
    if (fileIds && fileIds.length > 0) {
      // Convert specific files
      files = await db.comicFile.findMany({
        where: {
          id: { in: fileIds },
          libraryId: req.params.libraryId!,
        },
        select: { path: true },
      });
    } else {
      // Convert all CBR files in library
      const convertible = await findConvertibleFiles(req.params.libraryId!);
      files = convertible.files.map((f) => ({ path: f.path }));
    }

    if (files.length === 0) {
      res.json({
        total: 0,
        successful: 0,
        failed: 0,
        results: [],
        message: 'No files to convert',
      });
      return;
    }

    const result = await batchConvertCbrToCbz(
      files.map((f) => f.path),
      { deleteOriginal }
    );

    res.json({
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      results: result.results.map((r) => ({
        source: r.source,
        destination: r.destination,
        success: r.success,
        error: r.error,
        originalSize: r.originalSize,
        newSize: r.newSize,
      })),
    });
  } catch (error) {
    logError('archive', error, { action: 'batch-convert' });
    res.status(500).json({
      error: 'Failed to batch convert files',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
