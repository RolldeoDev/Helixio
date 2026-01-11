/**
 * Metadata Cache Service
 *
 * Handles caching ComicInfo.xml data to the database FileMetadata table.
 * This provides fast search and filtering without reading archives each time.
 */

import { getDatabase } from './database.service.js';
import type { PrismaClient } from '@prisma/client';
import { ComicInfo, readComicInfo } from './comicinfo.service.js';
import { listArchiveContents } from './archive.service.js';
import {
  classifyComicFormat,
  getFormatLabel,
  type ComicFormat,
} from './comic-classification.service.js';
import { computeIssueNumberSort } from './issue-number-utils.js';

// =============================================================================
// Types
// =============================================================================

export interface MetadataCacheResult {
  success: boolean;
  cached: boolean;
  error?: string;
}

export interface BatchCacheResult {
  total: number;
  cached: number;
  skipped: number;
  failed: number;
  errors: Array<{ fileId: string; error: string }>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get page count from archive by counting image files.
 */
async function getPageCountFromArchive(archivePath: string): Promise<number> {
  try {
    const archiveInfo = await listArchiveContents(archivePath);
    const imageExtensions = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i;

    return archiveInfo.entries.filter(
      (e) => !e.isDirectory && imageExtensions.test(e.path)
    ).length;
  } catch {
    return 0;
  }
}

/**
 * Classify format and get the label for ComicInfo.xml Format field.
 * Only classifies if format is not already set and page count is available.
 */
function classifyAndGetFormatLabel(
  filename: string,
  pageCount: number | null,
  existingFormat: string | null | undefined
): string | null {
  // Don't override existing format
  if (existingFormat) {
    return existingFormat;
  }

  // Need page count to classify
  if (!pageCount || pageCount <= 0) {
    return null;
  }

  // Classify based on filename and page count
  const result = classifyComicFormat(filename, pageCount);
  return result.formatLabel;
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Cache ComicInfo metadata for a file to the database.
 * Optionally applies format classification based on page count.
 *
 * @param fileId - The file ID to cache metadata for
 * @param comicInfo - The ComicInfo data to cache
 * @param options - Optional filename and archivePath for format classification
 * @param database - Optional database client (defaults to read pool for backward compatibility)
 */
export async function cacheFileMetadata(
  fileId: string,
  comicInfo: ComicInfo,
  options?: { filename?: string; archivePath?: string },
  database?: PrismaClient
): Promise<MetadataCacheResult> {
  try {
    const prisma = database ?? getDatabase();

    // Check if file exists
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return {
        success: false,
        cached: false,
        error: 'File not found',
      };
    }

    // Determine page count - use ComicInfo if available, otherwise get from archive
    let pageCount = comicInfo.PageCount || null;
    if (!pageCount && options?.archivePath) {
      pageCount = await getPageCountFromArchive(options.archivePath);
    }

    // Determine format - use ComicInfo if set, otherwise classify based on page count
    const filename = options?.filename || file.filename;
    const format = classifyAndGetFormatLabel(filename, pageCount, comicInfo.Format);

    // Prepare metadata record
    const issueNumber = comicInfo.Number || null;
    const metadataData = {
      series: comicInfo.Series || null,
      number: issueNumber,
      issueNumberSort: computeIssueNumberSort(issueNumber),
      title: comicInfo.Title || null,
      volume: comicInfo.Volume || null,
      publisher: comicInfo.Publisher || null,
      imprint: comicInfo.Imprint || null,
      year: comicInfo.Year || null,
      month: comicInfo.Month || null,
      day: comicInfo.Day || null,
      writer: comicInfo.Writer || null,
      penciller: comicInfo.Penciller || null,
      inker: comicInfo.Inker || null,
      colorist: comicInfo.Colorist || null,
      letterer: comicInfo.Letterer || null,
      coverArtist: comicInfo.CoverArtist || null,
      editor: comicInfo.Editor || null,
      summary: comicInfo.Summary || null,
      genre: comicInfo.Genre || null,
      tags: comicInfo.Tags || null,
      characters: comicInfo.Characters || null,
      teams: comicInfo.Teams || null,
      locations: comicInfo.Locations || null,
      count: comicInfo.Count || null,
      storyArc: comicInfo.StoryArc || null,
      seriesGroup: comicInfo.SeriesGroup || null,
      pageCount: pageCount,
      languageISO: comicInfo.LanguageISO || null,
      format: format,
      ageRating: comicInfo.AgeRating || null,
      lastScanned: new Date(),
    };

    // Upsert metadata record
    await prisma.fileMetadata.upsert({
      where: { comicId: fileId },
      update: metadataData,
      create: {
        comicId: fileId,
        ...metadataData,
      },
    });

    return {
      success: true,
      cached: true,
    };
  } catch (err) {
    return {
      success: false,
      cached: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get cached metadata for a file.
 */
export async function getCachedMetadata(fileId: string) {
  const prisma = getDatabase();
  return prisma.fileMetadata.findUnique({
    where: { comicId: fileId },
  });
}

/**
 * Refresh metadata cache from archive for a file.
 * Also applies format classification based on page count.
 *
 * @param fileId - The file ID to refresh metadata for
 * @param database - Optional database client (defaults to read pool for backward compatibility)
 */
export async function refreshMetadataCache(
  fileId: string,
  database?: PrismaClient
): Promise<boolean> {
  try {
    const prisma = database ?? getDatabase();

    // Get file path and filename
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: { path: true, filename: true },
    });

    if (!file) {
      return false;
    }

    // Read ComicInfo from archive
    const result = await readComicInfo(file.path);

    if (!result.success || !result.comicInfo) {
      // No ComicInfo.xml in archive - still try to create basic metadata with format
      // Get page count from archive
      const pageCount = await getPageCountFromArchive(file.path);
      if (pageCount > 0) {
        // Create minimal metadata with format classification
        const format = classifyAndGetFormatLabel(file.filename, pageCount, null);
        await prisma.fileMetadata.upsert({
          where: { comicId: fileId },
          update: { pageCount, format, lastScanned: new Date() },
          create: {
            comicId: fileId,
            pageCount,
            format,
            lastScanned: new Date(),
          },
        });
      } else {
        // No metadata and no page count - delete cached metadata if exists
        await prisma.fileMetadata.deleteMany({
          where: { comicId: fileId },
        });
      }
      return true; // Successfully refreshed
    }

    // Cache the metadata with format classification
    const cacheResult = await cacheFileMetadata(fileId, result.comicInfo, {
      filename: file.filename,
      archivePath: file.path,
    }, database);
    return cacheResult.success;
  } catch {
    return false;
  }
}

/**
 * Batch upsert metadata for multiple files in a single transaction.
 * More efficient than individual upserts during library scans.
 *
 * Performance optimization: Reuses cached page counts from previous scans
 * to avoid expensive archive extraction when page count hasn't changed.
 *
 * @param items Array of files with their extracted metadata
 * @returns Result with success status and count of processed items
 */
export async function batchUpsertFileMetadata(
  items: Array<{
    fileId: string;
    comicInfo: ComicInfo;
    filename: string;
    archivePath: string;
  }>
): Promise<{ success: boolean; count: number; error?: string }> {
  if (items.length === 0) {
    return { success: true, count: 0 };
  }

  try {
    const prisma = getDatabase();

    // Fetch existing metadata to reuse cached page counts (avoids archive extraction)
    const fileIds = items.map((item) => item.fileId);
    const existingMetadata = await prisma.fileMetadata.findMany({
      where: { comicId: { in: fileIds } },
      select: { comicId: true, pageCount: true },
    });
    const cachedPageCounts = new Map(
      existingMetadata.map((m) => [m.comicId, m.pageCount])
    );

    // First, prepare all metadata (this may involve async page count extraction)
    const preparedItems = await Promise.all(
      items.map(async ({ fileId, comicInfo, filename, archivePath }) => {
        // Determine page count - check ComicInfo, then cached DB value, then extract from archive
        let pageCount = comicInfo.PageCount || null;
        if (!pageCount) {
          // Check if we have a cached page count from previous scan
          const cached = cachedPageCounts.get(fileId);
          if (cached != null) {
            pageCount = cached;
          } else {
            // No cached value - extract from archive
            pageCount = await getPageCountFromArchive(archivePath);
          }
        }

        // Determine format
        const format = classifyAndGetFormatLabel(filename, pageCount, comicInfo.Format);

        // Prepare metadata data
        const issueNumber = comicInfo.Number || null;
        const metadataData = {
          series: comicInfo.Series || null,
          number: issueNumber,
          issueNumberSort: computeIssueNumberSort(issueNumber),
          title: comicInfo.Title || null,
          volume: comicInfo.Volume || null,
          publisher: comicInfo.Publisher || null,
          imprint: comicInfo.Imprint || null,
          year: comicInfo.Year || null,
          month: comicInfo.Month || null,
          day: comicInfo.Day || null,
          writer: comicInfo.Writer || null,
          penciller: comicInfo.Penciller || null,
          inker: comicInfo.Inker || null,
          colorist: comicInfo.Colorist || null,
          letterer: comicInfo.Letterer || null,
          coverArtist: comicInfo.CoverArtist || null,
          editor: comicInfo.Editor || null,
          summary: comicInfo.Summary || null,
          genre: comicInfo.Genre || null,
          tags: comicInfo.Tags || null,
          characters: comicInfo.Characters || null,
          teams: comicInfo.Teams || null,
          locations: comicInfo.Locations || null,
          count: comicInfo.Count || null,
          storyArc: comicInfo.StoryArc || null,
          seriesGroup: comicInfo.SeriesGroup || null,
          pageCount: pageCount,
          languageISO: comicInfo.LanguageISO || null,
          format: format,
          ageRating: comicInfo.AgeRating || null,
          lastScanned: new Date(),
        };

        return { fileId, metadataData };
      })
    );

    // Execute all upserts in a single transaction
    await prisma.$transaction(
      preparedItems.map(({ fileId, metadataData }) =>
        prisma.fileMetadata.upsert({
          where: { comicId: fileId },
          update: metadataData,
          create: {
            comicId: fileId,
            ...metadataData,
          },
        })
      )
    );

    return {
      success: true,
      count: items.length,
    };
  } catch (err) {
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Delete cached metadata for a file.
 */
export async function deleteCachedMetadata(fileId: string): Promise<boolean> {
  try {
    const prisma = getDatabase();
    await prisma.fileMetadata.deleteMany({
      where: { comicId: fileId },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Batch cache metadata for multiple files.
 * Also applies format classification based on page count.
 */
export async function batchCacheMetadata(
  fileIds: string[],
  onProgress?: (current: number, total: number, fileId: string) => void
): Promise<BatchCacheResult> {
  let cached = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ fileId: string; error: string }> = [];
  const prisma = getDatabase();

  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i]!;
    onProgress?.(i + 1, fileIds.length, fileId);

    try {
      // Get file path and filename
      const file = await prisma.comicFile.findUnique({
        where: { id: fileId },
        select: { path: true, filename: true },
      });

      if (!file) {
        failed++;
        errors.push({ fileId, error: 'File not found' });
        continue;
      }

      // Read ComicInfo from archive
      const result = await readComicInfo(file.path);

      if (!result.success || !result.comicInfo) {
        // Still try to cache basic metadata with format classification
        const pageCount = await getPageCountFromArchive(file.path);
        if (pageCount > 0) {
          const format = classifyAndGetFormatLabel(file.filename, pageCount, null);
          await prisma.fileMetadata.upsert({
            where: { comicId: fileId },
            update: { pageCount, format, lastScanned: new Date() },
            create: { comicId: fileId, pageCount, format, lastScanned: new Date() },
          });
          cached++;
        } else {
          skipped++; // No metadata and no page count
        }
        continue;
      }

      // Cache the metadata with format classification
      const cacheResult = await cacheFileMetadata(fileId, result.comicInfo, {
        filename: file.filename,
        archivePath: file.path,
      });

      if (cacheResult.success) {
        cached++;
      } else {
        failed++;
        errors.push({ fileId, error: cacheResult.error || 'Cache failed' });
      }
    } catch (err) {
      failed++;
      errors.push({
        fileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    total: fileIds.length,
    cached,
    skipped,
    failed,
    errors,
  };
}

/**
 * Cache metadata for all files in a library.
 */
export async function cacheLibraryMetadata(
  libraryId: string,
  onProgress?: (current: number, total: number, fileId: string) => void
): Promise<BatchCacheResult> {
  const prisma = getDatabase();

  // Get all files in library
  const files = await prisma.comicFile.findMany({
    where: { libraryId },
    select: { id: true },
  });

  const fileIds = files.map((f: { id: string }) => f.id);
  return batchCacheMetadata(fileIds, onProgress);
}

/**
 * Get metadata cache statistics for a library.
 */
export async function getLibraryCacheStats(libraryId: string): Promise<{
  totalFiles: number;
  cachedFiles: number;
  uncachedFiles: number;
  lastScan?: Date;
}> {
  const prisma = getDatabase();

  const [totalFiles, cachedCount, lastScan] = await Promise.all([
    prisma.comicFile.count({ where: { libraryId } }),
    prisma.fileMetadata.count({
      where: {
        comic: { libraryId },
      },
    }),
    prisma.fileMetadata.findFirst({
      where: {
        comic: { libraryId },
      },
      orderBy: { lastScanned: 'desc' },
      select: { lastScanned: true },
    }),
  ]);

  return {
    totalFiles,
    cachedFiles: cachedCount,
    uncachedFiles: totalFiles - cachedCount,
    lastScan: lastScan?.lastScanned,
  };
}

/**
 * Find files with uncached metadata.
 */
export async function findUncachedFiles(
  libraryId: string,
  limit = 100
): Promise<Array<{ id: string; path: string }>> {
  const prisma = getDatabase();

  // Find files that don't have metadata records
  const files = await prisma.comicFile.findMany({
    where: {
      libraryId,
      metadata: null,
    },
    select: {
      id: true,
      path: true,
    },
    take: limit,
  });

  return files;
}

/**
 * Find files with stale metadata (older than specified days).
 */
export async function findStaleMetadata(
  libraryId: string,
  daysOld: number,
  limit = 100
): Promise<Array<{ id: string; path: string; lastScanned: Date }>> {
  const prisma = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const stale = await prisma.fileMetadata.findMany({
    where: {
      comic: { libraryId },
      lastScanned: { lt: cutoffDate },
    },
    include: {
      comic: {
        select: { id: true, path: true },
      },
    },
    take: limit,
  });

  return stale.map((m: { comic: { id: string; path: string }; lastScanned: Date }) => ({
    id: m.comic.id,
    path: m.comic.path,
    lastScanned: m.lastScanned,
  }));
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert database metadata record to ComicInfo format.
 */
export function metadataToComicInfo(
  metadata: Awaited<ReturnType<typeof getCachedMetadata>>
): ComicInfo | null {
  if (!metadata) return null;

  const comicInfo: ComicInfo = {};

  if (metadata.series) comicInfo.Series = metadata.series;
  if (metadata.number) comicInfo.Number = metadata.number;
  if (metadata.title) comicInfo.Title = metadata.title;
  if (metadata.volume) comicInfo.Volume = metadata.volume;
  if (metadata.publisher) comicInfo.Publisher = metadata.publisher;
  if (metadata.imprint) comicInfo.Imprint = metadata.imprint;
  if (metadata.year) comicInfo.Year = metadata.year;
  if (metadata.month) comicInfo.Month = metadata.month;
  if (metadata.day) comicInfo.Day = metadata.day;
  if (metadata.writer) comicInfo.Writer = metadata.writer;
  if (metadata.penciller) comicInfo.Penciller = metadata.penciller;
  if (metadata.inker) comicInfo.Inker = metadata.inker;
  if (metadata.colorist) comicInfo.Colorist = metadata.colorist;
  if (metadata.letterer) comicInfo.Letterer = metadata.letterer;
  if (metadata.coverArtist) comicInfo.CoverArtist = metadata.coverArtist;
  if (metadata.editor) comicInfo.Editor = metadata.editor;
  if (metadata.summary) comicInfo.Summary = metadata.summary;
  if (metadata.genre) comicInfo.Genre = metadata.genre;
  if (metadata.tags) comicInfo.Tags = metadata.tags;
  if (metadata.characters) comicInfo.Characters = metadata.characters;
  if (metadata.teams) comicInfo.Teams = metadata.teams;
  if (metadata.locations) comicInfo.Locations = metadata.locations;
  if (metadata.count) comicInfo.Count = metadata.count;
  if (metadata.storyArc) comicInfo.StoryArc = metadata.storyArc;
  if (metadata.seriesGroup) comicInfo.SeriesGroup = metadata.seriesGroup;
  if (metadata.pageCount) comicInfo.PageCount = metadata.pageCount;
  if (metadata.languageISO) comicInfo.LanguageISO = metadata.languageISO;
  if (metadata.format) comicInfo.Format = metadata.format;
  if (metadata.ageRating) comicInfo.AgeRating = metadata.ageRating;

  return comicInfo;
}
