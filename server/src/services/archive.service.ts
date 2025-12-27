/**
 * Archive Service
 *
 * Handles archive operations using 7zip-bin and node-7z for most formats,
 * and node-unrar-js for RAR/CBR files (since 7za doesn't support RAR):
 * - List archive contents
 * - Extract specific files
 * - Extract full archives
 * - Create CBZ archives
 * - Validate archive integrity
 */

import Seven from 'node-7z';
import sevenBin from '7zip-bin';
import { createExtractorFromFile } from 'node-unrar-js';
import { mkdir, rm, readdir, stat, readFile, writeFile, open, unlink, rename } from 'fs/promises';
import { join, basename, extname, dirname } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { archiveLogger as logger } from './logger.service.js';

// =============================================================================
// Archive Format Detection (Magic Bytes)
// =============================================================================

/**
 * Magic bytes for archive format detection.
 * These are the first few bytes of each archive type.
 */
const ARCHIVE_MAGIC = {
  // ZIP: PK (0x50, 0x4B)
  ZIP: Buffer.from([0x50, 0x4B]),
  // RAR: Rar! (0x52, 0x61, 0x72, 0x21)
  RAR: Buffer.from([0x52, 0x61, 0x72, 0x21]),
  // 7z: 7z (0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C)
  SEVEN_ZIP: Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]),
};

/**
 * Detect actual archive format by reading magic bytes from file header.
 * Returns 'zip', 'rar', '7z', or 'unknown'.
 */
async function detectArchiveFormatByMagic(filePath: string): Promise<string> {
  try {
    const handle = await open(filePath, 'r');
    try {
      // Read first 8 bytes (enough for all our magic signatures)
      const buffer = Buffer.alloc(8);
      await handle.read(buffer, 0, 8, 0);

      // Check for RAR first (most specific)
      if (buffer.subarray(0, 4).equals(ARCHIVE_MAGIC.RAR)) {
        return 'rar';
      }
      // Check for 7z
      if (buffer.subarray(0, 6).equals(ARCHIVE_MAGIC.SEVEN_ZIP)) {
        return '7z';
      }
      // Check for ZIP (PK)
      if (buffer.subarray(0, 2).equals(ARCHIVE_MAGIC.ZIP)) {
        return 'zip';
      }

      return 'unknown';
    } finally {
      await handle.close();
    }
  } catch {
    return 'unknown';
  }
}

// Path to 7zip binary
const pathTo7zip = sevenBin.path7za;

// =============================================================================
// Types
// =============================================================================

export interface ArchiveEntry {
  /** File path within archive */
  path: string;
  /** File size in bytes */
  size: number;
  /** Packed/compressed size */
  packedSize: number;
  /** File attributes */
  attr?: string;
  /** Modification date */
  date?: Date;
  /** Is this entry a directory */
  isDirectory: boolean;
}

export interface ArchiveInfo {
  /** Archive file path */
  archivePath: string;
  /** Archive format (zip, rar, 7z, etc.) */
  format: string;
  /** Total number of files */
  fileCount: number;
  /** Total uncompressed size */
  totalSize: number;
  /** List of files in archive */
  entries: ArchiveEntry[];
  /** Whether archive contains ComicInfo.xml */
  hasComicInfo: boolean;
  /** Cover image path (if detected) */
  coverPath: string | null;
}

export interface ExtractionResult {
  success: boolean;
  extractedPath: string;
  fileCount: number;
  error?: string;
}

export interface ArchiveCreationResult {
  success: boolean;
  archivePath: string;
  fileCount: number;
  size: number;
  error?: string;
}

// =============================================================================
// Archive Listing Cache
// =============================================================================

/**
 * Cache configuration for archive listings.
 * Uses file mtime + size as a quick change detection key.
 */
const ARCHIVE_CACHE_MAX_SIZE = 500;
const ARCHIVE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedArchiveInfo {
  info: ArchiveInfo;
  timestamp: number;
  cacheKey: string; // mtime:size
}

/** In-memory LRU cache for archive listings */
const archiveListingCache = new Map<string, CachedArchiveInfo>();

/**
 * Generate a cache key from file stats.
 * Uses mtime and size for quick change detection without reading file content.
 */
async function generateArchiveCacheKey(archivePath: string): Promise<string | null> {
  try {
    const stats = await stat(archivePath);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return null;
  }
}

/**
 * Evict oldest cache entries when over limit.
 */
function evictOldArchiveCacheEntries(): void {
  if (archiveListingCache.size <= ARCHIVE_CACHE_MAX_SIZE) return;

  // Sort by timestamp (oldest first)
  const entries = Array.from(archiveListingCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp);

  // Remove oldest entries until under limit
  const toRemove = entries.slice(0, entries.length - ARCHIVE_CACHE_MAX_SIZE);
  for (const [key] of toRemove) {
    archiveListingCache.delete(key);
  }
}

/**
 * Get cached archive listing if valid.
 */
async function getCachedArchiveListing(archivePath: string): Promise<ArchiveInfo | null> {
  const cached = archiveListingCache.get(archivePath);
  if (!cached) return null;

  // Check TTL
  if (Date.now() - cached.timestamp > ARCHIVE_CACHE_TTL_MS) {
    archiveListingCache.delete(archivePath);
    return null;
  }

  // Verify cache key matches current file state
  const currentKey = await generateArchiveCacheKey(archivePath);
  if (!currentKey || currentKey !== cached.cacheKey) {
    archiveListingCache.delete(archivePath);
    return null;
  }

  // Update timestamp for LRU behavior
  cached.timestamp = Date.now();
  return cached.info;
}

/**
 * Store archive listing in cache.
 */
async function cacheArchiveListing(archivePath: string, info: ArchiveInfo): Promise<void> {
  const cacheKey = await generateArchiveCacheKey(archivePath);
  if (!cacheKey) return;

  archiveListingCache.set(archivePath, {
    info,
    timestamp: Date.now(),
    cacheKey,
  });

  evictOldArchiveCacheEntries();
}

/**
 * Clear the archive listing cache (for testing or manual cleanup).
 */
export function clearArchiveListingCache(): void {
  archiveListingCache.clear();
  logger.info('Archive listing cache cleared');
}

/**
 * Get archive cache statistics.
 */
export function getArchiveCacheStats(): {
  size: number;
  maxSize: number;
  ttlMs: number;
} {
  return {
    size: archiveListingCache.size,
    maxSize: ARCHIVE_CACHE_MAX_SIZE,
    ttlMs: ARCHIVE_CACHE_TTL_MS,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a temporary directory for archive operations.
 */
export async function createTempDir(prefix = 'helixio-'): Promise<string> {
  const tempPath = join(tmpdir(), `${prefix}${randomUUID()}`);
  await mkdir(tempPath, { recursive: true });
  return tempPath;
}

/**
 * Clean up a temporary directory.
 */
export async function cleanupTempDir(tempPath: string): Promise<void> {
  try {
    await rm(tempPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Determine archive format from file extension.
 */
export function getArchiveFormat(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.cbz':
    case '.zip':
      return 'zip';
    case '.cbr':
    case '.rar':
      return 'rar';
    case '.cb7':
    case '.7z':
      return '7z';
    case '.cbt':
    case '.tar':
      return 'tar';
    default:
      return 'unknown';
  }
}

/**
 * Check if file is a comic archive.
 */
export function isComicArchive(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ['.cbz', '.cbr', '.cb7', '.cbt'].includes(ext);
}

/**
 * Check if file is an image.
 */
function isImageFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
}

/**
 * Check if archive is RAR format (requires node-unrar-js instead of 7zip).
 * Uses magic byte detection to handle misnamed files (e.g., ZIP files with .cbr extension).
 */
async function isRarArchive(filePath: string): Promise<boolean> {
  // First check by magic bytes (most reliable)
  const actualFormat = await detectArchiveFormatByMagic(filePath);
  if (actualFormat !== 'unknown') {
    return actualFormat === 'rar';
  }
  // Fall back to extension-based detection if magic bytes don't match known formats
  const ext = extname(filePath).toLowerCase();
  return ['.cbr', '.rar'].includes(ext);
}

/**
 * Determine cover image from archive entries.
 * Priority: cover.jpg/png > first image alphabetically
 */
function findCoverImage(entries: ArchiveEntry[]): string | null {
  const imageEntries = entries
    .filter((e) => !e.isDirectory && isImageFile(e.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (imageEntries.length === 0) return null;

  // Look for explicit cover file
  const coverFile = imageEntries.find((e) => {
    const name = basename(e.path).toLowerCase();
    return name.startsWith('cover') || name === 'folder.jpg' || name === 'folder.png';
  });

  if (coverFile) return coverFile.path;

  // Return first image (alphabetically)
  return imageEntries[0]?.path ?? null;
}

// =============================================================================
// RAR Archive Operations (using node-unrar-js)
// =============================================================================

/**
 * List contents of a RAR archive using node-unrar-js.
 */
async function listRarContents(archivePath: string): Promise<ArchiveInfo> {
  const extractor = await createExtractorFromFile({ filepath: archivePath });
  const list = extractor.getFileList();

  const entries: ArchiveEntry[] = [];
  let totalSize = 0;

  // Convert generator to array for iteration
  const fileHeaders = [...list.fileHeaders];
  for (const fileHeader of fileHeaders) {
    const isDir = fileHeader.flags.directory;
    const size = fileHeader.unpSize;

    entries.push({
      path: fileHeader.name,
      size,
      packedSize: fileHeader.packSize,
      attr: isDir ? 'D' : undefined,
      date: fileHeader.time ? new Date(fileHeader.time) : undefined,
      isDirectory: isDir,
    });

    if (!isDir) {
      totalSize += size;
    }
  }

  const hasComicInfo = entries.some(
    (e) => basename(e.path).toLowerCase() === 'comicinfo.xml'
  );
  const coverPath = findCoverImage(entries);

  return {
    archivePath,
    format: 'rar',
    fileCount: entries.filter((e) => !e.isDirectory).length,
    totalSize,
    entries,
    hasComicInfo,
    coverPath,
  };
}

/**
 * Extract files from a RAR archive using node-unrar-js.
 */
async function extractRarFiles(
  archivePath: string,
  outputDir: string,
  files: string[]
): Promise<ExtractionResult> {
  await mkdir(outputDir, { recursive: true });

  try {
    const extractor = await createExtractorFromFile({
      filepath: archivePath,
      targetPath: outputDir,
    });

    // If specific files requested, filter them; otherwise extract all
    const extractOptions = files.length > 0
      ? { files: files }
      : {};

    const extracted = extractor.extract(extractOptions);
    let extractedCount = 0;

    // Convert generator to array for iteration
    // Note: For file-based extraction, files are written to disk directly
    // and file.extraction is undefined (only populated for in-memory extraction)
    const extractedFiles = [...extracted.files];
    for (const file of extractedFiles) {
      if (!file.fileHeader.flags.directory) {
        extractedCount++;
      }
    }

    return {
      success: true,
      extractedPath: outputDir,
      fileCount: extractedCount,
    };
  } catch (err) {
    return {
      success: false,
      extractedPath: outputDir,
      fileCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Extract a single file from a RAR archive to memory.
 */
async function extractRarFileToBuffer(
  archivePath: string,
  entryPath: string
): Promise<Buffer | null> {
  logger.debug({ entryPath }, 'Looking for RAR entry');
  try {
    // Read the archive file into memory for data-based extraction
    const archiveData = await readFile(archivePath);
    const { createExtractorFromData } = await import('node-unrar-js');

    const extractor = await createExtractorFromData({
      data: archiveData.buffer as ArrayBuffer,
    });

    // Normalize the entry path for comparison (handle both / and \ separators)
    const normalizedEntryPath = entryPath.replace(/\\/g, '/');
    const entryFilename = basename(entryPath);

    // Extract all files and find the one we want (filter option may not work reliably)
    const extracted = extractor.extract();

    // Convert generator to array for iteration
    const extractedFiles = [...extracted.files];
    logger.debug({ fileCount: extractedFiles.length }, 'Total files in RAR archive');

    for (const file of extractedFiles) {
      const fileName = file.fileHeader.name;
      const normalizedFileName = fileName.replace(/\\/g, '/');

      // Match by exact path (normalized) or by filename if paths don't match
      const isExactMatch = normalizedFileName === normalizedEntryPath;
      const isFilenameMatch = basename(fileName) === entryFilename;

      if ((isExactMatch || isFilenameMatch) && file.extraction) {
        logger.debug({ fileName }, 'Found matching RAR entry');
        return Buffer.from(file.extraction);
      }
    }

    logger.debug({ entryPath }, 'No match found for RAR entry');
    // Log first few file names for debugging
    const fileNames = extractedFiles.slice(0, 5).map(f => f.fileHeader.name);
    logger.debug({ sampleFiles: fileNames }, 'Sample files in RAR archive');

    return null;
  } catch (err) {
    logger.error({ err, entryPath }, 'RAR file extraction error');
    return null;
  }
}

// =============================================================================
// Archive Operations
// =============================================================================

/**
 * List contents of an archive.
 * Results are cached to improve performance during library scans.
 */
export async function listArchiveContents(archivePath: string): Promise<ArchiveInfo> {
  // Check cache first
  const cached = await getCachedArchiveListing(archivePath);
  if (cached) {
    logger.debug({ archivePath }, 'Using cached archive listing');
    return cached;
  }

  // Use node-unrar-js for RAR/CBR files (detect by magic bytes, not just extension)
  const isRar = await isRarArchive(archivePath);
  let result: ArchiveInfo;

  if (isRar) {
    result = await listRarContents(archivePath);
  } else {
    // Use 7-zip for other formats
    result = await listArchiveContentsWithSevenZip(archivePath);
  }

  // Cache the result for future use
  await cacheArchiveListing(archivePath, result);

  return result;
}

/**
 * List archive contents using 7-zip (internal helper).
 */
async function listArchiveContentsWithSevenZip(archivePath: string): Promise<ArchiveInfo> {
  return new Promise((resolve, reject) => {
    const entries: ArchiveEntry[] = [];
    let totalSize = 0;
    let format = getArchiveFormat(archivePath);

    const listStream = Seven.list(archivePath, {
      $bin: pathTo7zip,
      $progress: false,
    });

    listStream.on('data', (data: {
      file?: string;
      size?: number;
      sizeCompressed?: number;
      attr?: string;
      date?: string;
    }) => {
      if (data.file) {
        const isDir = data.attr?.includes('D') ?? false;
        const size = data.size ?? 0;

        entries.push({
          path: data.file,
          size,
          packedSize: data.sizeCompressed ?? 0,
          attr: data.attr,
          date: data.date ? new Date(data.date) : undefined,
          isDirectory: isDir,
        });

        if (!isDir) {
          totalSize += size;
        }
      }
    });

    listStream.on('end', () => {
      const hasComicInfo = entries.some(
        (e) => basename(e.path).toLowerCase() === 'comicinfo.xml'
      );
      const coverPath = findCoverImage(entries);

      resolve({
        archivePath,
        format,
        fileCount: entries.filter((e) => !e.isDirectory).length,
        totalSize,
        entries,
        hasComicInfo,
        coverPath,
      });
    });

    listStream.on('error', (err: Error) => {
      reject(new Error(`Failed to list archive: ${err.message}`));
    });
  });
}

/**
 * Extract specific files from an archive.
 */
export async function extractFiles(
  archivePath: string,
  outputDir: string,
  files: string[]
): Promise<ExtractionResult> {
  logger.debug({ archivePath, outputDir, filesFilter: files.length > 0 ? files : 'all' }, 'Extracting files from archive');

  // Use node-unrar-js for RAR/CBR files (detect by magic bytes, not just extension)
  if (await isRarArchive(archivePath)) {
    logger.debug('Using RAR extractor');
    return extractRarFiles(archivePath, outputDir, files);
  }

  logger.debug({ pathTo7zip }, 'Using 7zip extractor');

  // Use 7-zip for other formats
  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    mkdir(outputDir, { recursive: true })
      .then(() => {
        let extractedCount = 0;

        const extractStream = Seven.extract(archivePath, outputDir, {
          $bin: pathTo7zip,
          $progress: true,
          recursive: true,
          // Include only specified files
          ...(files.length > 0 && { include: files }),
        });

        extractStream.on('data', (data: unknown) => {
          extractedCount++;
          if (extractedCount <= 3) {
            logger.trace({ fileNum: extractedCount, data }, 'Extracted file');
          }
        });

        extractStream.on('end', () => {
          logger.debug({ extractedCount }, 'Extraction complete');
          // If we requested specific files but extracted nothing, treat as failure
          if (files.length > 0 && extractedCount === 0) {
            logger.warn({ requestedCount: files.length, requestedFiles: files }, 'Requested files but extracted none');
            resolve({
              success: false,
              extractedPath: outputDir,
              fileCount: 0,
              error: `No files extracted. Requested: ${files.join(', ')}`,
            });
          } else {
            resolve({
              success: true,
              extractedPath: outputDir,
              fileCount: extractedCount,
            });
          }
        });

        extractStream.on('error', (err: Error) => {
          const errorMessage = err?.message || err?.toString() || 'unknown extraction error';
          logger.error({ err, errorMessage }, '7zip extraction error');
          resolve({
            success: false,
            extractedPath: outputDir,
            fileCount: extractedCount,
            error: errorMessage,
          });
        });

        extractStream.on('info', (info: unknown) => {
          logger.trace({ info }, 'Extraction info');
        });
      })
      .catch((err) => {
        logger.error({ err }, 'Failed to create extraction directory');
        reject(err);
      });
  });
}

/**
 * Extract entire archive to a directory.
 */
export async function extractArchive(
  archivePath: string,
  outputDir: string
): Promise<ExtractionResult> {
  return extractFiles(archivePath, outputDir, []);
}

/**
 * Extract a single file from an archive to a specific path.
 * Includes caching - if the output file already exists, returns immediately.
 */
export async function extractSingleFile(
  archivePath: string,
  entryPath: string,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  // Check cache first - if file already exists, skip extraction
  try {
    await stat(outputPath);
    logger.trace({ outputPath }, 'Cache hit');
    return { success: true };
  } catch {
    // File doesn't exist, proceed with extraction
  }

  logger.debug({ archivePath, entryPath, outputPath }, 'Cache miss, extracting single file');

  // For RAR/CBR files, use direct buffer extraction (more reliable for filtered extraction)
  if (await isRarArchive(archivePath)) {
    logger.debug('Using RAR buffer extraction');
    try {
      const buffer = await extractRarFileToBuffer(archivePath, entryPath);
      if (buffer) {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, buffer);
        logger.debug('Successfully extracted RAR file');
        return { success: true };
      }
      return { success: false, error: `File not found in RAR archive: ${entryPath}` };
    } catch (err) {
      logger.error({ err, entryPath }, 'RAR extraction error');
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // For other formats, use 7zip
  // Note: We extract the entire archive because 7zip's include filter doesn't work
  // reliably with paths containing special characters (parentheses, spaces, etc.)
  const tempDir = await createTempDir('extract-');
  logger.trace({ tempDir }, 'Created temp directory');

  try {
    // Extract entire archive (filter unreliable with special chars in paths)
    const result = await extractFiles(archivePath, tempDir, []);
    logger.debug({ success: result.success, fileCount: result.fileCount, error: result.error }, 'extractFiles result');

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Find the extracted file - scan recursively since path structure may vary
    const targetFilename = basename(entryPath);
    const foundFile = await findExtractedFile(tempDir, entryPath, targetFilename);

    if (!foundFile) {
      // List what was extracted for debugging
      try {
        const files = await readdir(tempDir, { recursive: true });
        logger.debug({ filesInTempDir: files }, 'Files in temp dir');
      } catch {
        // Ignore
      }
      return {
        success: false,
        error: `Extracted file not found. Looking for: ${entryPath}`
      };
    }

    logger.debug({ foundFile }, 'Found extracted file');

    // Ensure output directory exists and move file
    await mkdir(dirname(outputPath), { recursive: true });

    try {
      const { rename, copyFile } = await import('fs/promises');
      try {
        await rename(foundFile, outputPath);
      } catch {
        await copyFile(foundFile, outputPath);
      }
    } catch (err) {
      return { success: false, error: `Failed to move extracted file: ${err}` };
    }

    logger.debug('Successfully moved to output path');
    return { success: true };
  } catch (err) {
    logger.error({ err }, 'Single file extraction exception');
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Find an extracted file in a directory, handling various path structures.
 */
async function findExtractedFile(
  tempDir: string,
  entryPath: string,
  targetFilename: string
): Promise<string | null> {
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
    const files = await readdir(tempDir, { recursive: true });

    // First priority: exact entry path match
    for (const file of files) {
      const filePath = typeof file === 'string' ? file : String(file);
      if (filePath === entryPath || filePath.replace(/\\/g, '/') === entryPath.replace(/\\/g, '/')) {
        return join(tempDir, filePath);
      }
    }

    // Second priority: filename match, but prefer files closer to root
    // (fewer path separators = closer to root)
    const matchingFiles: { path: string; depth: number }[] = [];
    for (const file of files) {
      const filePath = typeof file === 'string' ? file : String(file);
      if (basename(filePath).toLowerCase() === targetFilename.toLowerCase()) {
        const depth = (filePath.match(/[/\\]/g) || []).length;
        matchingFiles.push({ path: filePath, depth });
      }
    }

    if (matchingFiles.length > 0) {
      // Sort by depth (shallowest first)
      matchingFiles.sort((a, b) => a.depth - b.depth);
      const selected = matchingFiles[0]!;
      return join(tempDir, selected.path);
    }
  } catch {
    // Error scanning directory
  }

  return null;
}

/**
 * Create a CBZ (ZIP) archive from a directory.
 * Uses the archiver library for reliable cross-platform ZIP creation.
 */
export async function createCbzArchive(
  sourceDir: string,
  outputPath: string
): Promise<ArchiveCreationResult> {
  // Dynamic import of archiver
  const archiver = (await import('archiver')).default;
  const { createWriteStream } = await import('fs');

  logger.debug({ sourceDir, outputPath }, 'Creating CBZ archive');

  // Verify source directory exists and has files
  let sourceFiles: string[];
  try {
    sourceFiles = await readdir(sourceDir);
    logger.debug({ itemCount: sourceFiles.length, sampleFiles: sourceFiles.slice(0, 5) }, 'Source directory contents');
  } catch (err) {
    logger.error({ err, sourceDir }, 'Failed to read source directory');
    return {
      success: false,
      archivePath: outputPath,
      fileCount: 0,
      size: 0,
      error: `Cannot read source directory: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (sourceFiles.length === 0) {
    return {
      success: false,
      archivePath: outputPath,
      fileCount: 0,
      size: 0,
      error: 'Source directory is empty',
    };
  }

  return new Promise((resolve) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 0 }, // Store without compression (images are already compressed)
    });

    let fileCount = 0;

    output.on('close', async () => {
      logger.debug({ totalBytes: archive.pointer() }, 'Archive finalized');
      try {
        const stats = await stat(outputPath);
        logger.debug({ fileCount, size: stats.size }, 'CBZ archive created successfully');
        resolve({
          success: true,
          archivePath: outputPath,
          fileCount,
          size: stats.size,
        });
      } catch (statErr) {
        resolve({
          success: true,
          archivePath: outputPath,
          fileCount,
          size: archive.pointer(),
        });
      }
    });

    archive.on('entry', (entry) => {
      fileCount++;
      if (fileCount <= 3) {
        logger.trace({ entryNum: fileCount, entryName: entry.name }, 'Added archive entry');
      }
    });

    archive.on('warning', (err) => {
      logger.warn({ err }, 'Archive warning');
    });

    archive.on('error', (err) => {
      logger.error({ err }, 'Archive creation error');
      resolve({
        success: false,
        archivePath: outputPath,
        fileCount,
        size: 0,
        error: err.message || String(err),
      });
    });

    // Pipe archive data to the file
    archive.pipe(output);

    // Add the entire directory contents to the archive
    // Use glob pattern to add all files recursively
    archive.directory(sourceDir, false);

    // Finalize the archive
    archive.finalize();
  });
}

/**
 * Add a file to an existing CBZ archive.
 * Note: 7zip automatically stores files with just their filename (not the full path),
 * so passing the full path works correctly.
 */
export async function addToArchive(
  archivePath: string,
  filePath: string,
  archiveEntryPath?: string
): Promise<{ success: boolean; error?: string }> {
  // Check if this is a RAR archive - RAR format is read-only
  if (await isRarArchive(archivePath)) {
    return {
      success: false,
      error: 'Cannot modify CBR/RAR archives. RAR format is read-only. Convert to CBZ first to enable metadata editing.',
    };
  }

  const fileName = basename(filePath);
  const expectedEntryName = archiveEntryPath || fileName;

  return new Promise((resolve) => {
    let errorMessage: string | null = null;

    const addStream = Seven.add(archivePath, filePath, {
      $bin: pathTo7zip,
      $progress: false,
      archiveType: 'zip',
    });

    addStream.on('error', (err: Error) => {
      // 7zip emits warnings (like "No more files") as errors through node-7z
      // Check if this is a WARNING vs an actual ERROR
      const errStr = err.message || '';
      const isWarning = errStr.includes('WARNING:') ||
                        (err as Error & { level?: string }).level === 'WARNING';

      if (!isWarning) {
        errorMessage = err.message;
      }
    });

    addStream.on('end', async () => {

      // If there was a real error, fail immediately
      if (errorMessage) {
        resolve({ success: false, error: errorMessage });
        return;
      }

      // Force file system cache invalidation after 7zip write
      // macOS aggressively caches file reads, and immediate re-reads after
      // 7zip writes can return stale data. We use multiple strategies:
      // 1. Small delay to let the filesystem settle
      // 2. stat() call to refresh file metadata cache
      // 3. Read a byte from the file to force cache refresh
      try {
        // Small delay to let macOS flush its buffers
        await new Promise(resolve => setTimeout(resolve, 50));

        // Stat the file to refresh metadata cache
        const { stat: statFile, open } = await import('fs/promises');
        await statFile(archivePath, { bigint: true });

        // Open and read one byte to force data cache refresh
        const fd = await open(archivePath, 'r');
        const buffer = Buffer.alloc(1);
        await fd.read(buffer, 0, 1, 0);
        await fd.close();
      } catch {
        // Continue even if cache refresh fails
      }

      // Verify the file was actually added by listing archive contents
      // This is more reliable than tracking 'data' events which can be inconsistent
      try {
        const info = await listArchiveContents(archivePath);
        const fileExists = info.entries.some(
          (e) => basename(e.path).toLowerCase() === expectedEntryName.toLowerCase()
        );

        if (fileExists) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `File '${expectedEntryName}' was not found in archive after add operation` });
        }
      } catch (verifyErr) {
        // If we can't verify, assume success since 7zip didn't report an error
        logger.warn({ error: verifyErr }, 'Could not verify file addition, assuming success');
        resolve({ success: true });
      }
    });
  });
}

/**
 * Update/replace a file in an archive.
 * Note: RAR/CBR archives cannot be modified - convert to CBZ first.
 */
export async function updateFileInArchive(
  archivePath: string,
  entryPath: string,
  newContent: Buffer
): Promise<{ success: boolean; error?: string }> {
  // Early check for RAR archives
  if (await isRarArchive(archivePath)) {
    return {
      success: false,
      error: 'Cannot modify CBR/RAR archives. RAR format is read-only. Convert to CBZ first to enable metadata editing.',
    };
  }

  const tempDir = await createTempDir('update-');

  try {
    // Write content to temp file with same name
    const tempFile = join(tempDir, basename(entryPath));
    const { writeFile } = await import('fs/promises');
    await writeFile(tempFile, newContent);

    // Add to archive (replaces existing)
    const result = await addToArchive(archivePath, tempFile);

    return result;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Validate archive integrity by attempting to list contents.
 */
export async function validateArchive(archivePath: string): Promise<{
  valid: boolean;
  error?: string;
  info?: ArchiveInfo;
}> {
  logger.debug({ archivePath }, 'Validating archive');
  try {
    const info = await listArchiveContents(archivePath);
    logger.debug({ fileCount: info.fileCount, entryCount: info.entries.length }, 'Archive listing complete');

    // Check for minimum requirements
    if (info.fileCount === 0) {
      logger.debug('Validation failed: Archive is empty');
      return { valid: false, error: 'Archive is empty' };
    }

    // Check for at least one image file
    const hasImages = info.entries.some(
      (e) => !e.isDirectory && isImageFile(e.path)
    );

    if (!hasImages) {
      logger.debug('Validation failed: No image files found');
      return { valid: false, error: 'Archive contains no image files' };
    }

    logger.debug('Validation passed');
    return { valid: true, info };
  } catch (err) {
    logger.error({ err, archivePath }, 'Archive validation exception');
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Test archive by attempting to extract first file.
 */
export async function testArchiveExtraction(archivePath: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  logger.debug({ archivePath }, 'Testing archive extraction');
  const tempDir = await createTempDir('test-');

  try {
    // Get archive contents
    logger.debug('Listing archive contents...');
    const info = await listArchiveContents(archivePath);
    logger.debug({ entryCount: info.entries.length }, 'Found entries');

    if (info.entries.length === 0) {
      return { valid: false, error: 'Archive is empty' };
    }

    // Try to extract first non-directory entry
    const firstFile = info.entries.find((e) => !e.isDirectory);
    if (!firstFile) {
      return { valid: false, error: 'No extractable files found' };
    }

    logger.debug({ filePath: firstFile.path }, 'Attempting to extract first file');
    const result = await extractFiles(archivePath, tempDir, [firstFile.path]);
    logger.debug({ result }, 'Extraction result');

    if (!result.success) {
      return { valid: false, error: result.error || 'Extraction failed with no error message' };
    }

    logger.debug('Extraction test passed');
    return { valid: true };
  } catch (err) {
    logger.error({ err, archivePath }, 'Archive extraction test exception');
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Get archive statistics.
 */
export async function getArchiveStats(archivePath: string): Promise<{
  format: string;
  fileCount: number;
  imageCount: number;
  totalSize: number;
  hasComicInfo: boolean;
  coverPath: string | null;
} | null> {
  try {
    const info = await listArchiveContents(archivePath);

    const imageCount = info.entries.filter(
      (e) => !e.isDirectory && isImageFile(e.path)
    ).length;

    return {
      format: info.format,
      fileCount: info.fileCount,
      imageCount,
      totalSize: info.totalSize,
      hasComicInfo: info.hasComicInfo,
      coverPath: info.coverPath,
    };
  } catch {
    return null;
  }
}

/**
 * Delete pages from a CBZ archive.
 * Creates a new archive without the specified pages and replaces the original.
 */
export async function deletePagesFromArchive(
  archivePath: string,
  pagesToDelete: string[]
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  // Check if this is a RAR archive - RAR format is read-only
  if (await isRarArchive(archivePath)) {
    return {
      success: false,
      deletedCount: 0,
      error: 'Cannot modify RAR archives. Convert to CBZ first.',
    };
  }

  const format = getArchiveFormat(archivePath);
  if (format !== 'zip') {
    return {
      success: false,
      deletedCount: 0,
      error: `Cannot modify ${format} archives. Only CBZ (ZIP) archives can be modified.`,
    };
  }

  // Create temp directory for extraction
  const tempDir = await createTempDir('helixio-delete-pages-');

  try {
    logger.debug({ tempDir, pagesToDelete }, 'Deleting pages from archive');

    // Extract the entire archive
    const extractResult = await extractArchive(archivePath, tempDir);
    if (!extractResult.success) {
      return {
        success: false,
        deletedCount: 0,
        error: `Failed to extract archive: ${extractResult.error}`,
      };
    }

    // Delete the specified pages
    let deletedCount = 0;
    for (const pagePath of pagesToDelete) {
      // Try both the full path and just the filename (7zip sometimes flattens)
      const fullPath = join(tempDir, pagePath);
      const filename = pagePath.split('/').pop() || pagePath;
      const flatPath = join(tempDir, filename);

      let deleted = false;
      try {
        await unlink(fullPath);
        deleted = true;
        logger.debug({ fullPath }, 'Deleted page');
      } catch {
        // Try flat path
        try {
          await unlink(flatPath);
          deleted = true;
          logger.debug({ flatPath }, 'Deleted page (flat path)');
        } catch {
          logger.warn({ pagePath }, 'Could not find file to delete');
        }
      }

      if (deleted) {
        deletedCount++;
      }
    }

    if (deletedCount === 0) {
      return {
        success: false,
        deletedCount: 0,
        error: 'No pages were found to delete',
      };
    }

    // Create a backup of the original
    const backupPath = `${archivePath}.bak`;
    await rename(archivePath, backupPath);

    try {
      // Create new archive without the deleted pages
      const createResult = await createCbzArchive(tempDir, archivePath);
      if (!createResult.success) {
        // Restore backup
        await rename(backupPath, archivePath);
        return {
          success: false,
          deletedCount: 0,
          error: `Failed to create new archive: ${createResult.error}`,
        };
      }

      // Remove backup
      await unlink(backupPath);

      logger.info({ deletedCount }, 'Successfully deleted pages from archive');
      return {
        success: true,
        deletedCount,
      };
    } catch (err) {
      // Try to restore backup
      try {
        await rename(backupPath, archivePath);
      } catch {
        // Backup restore failed
      }
      throw err;
    }
  } finally {
    // Clean up temp directory
    await cleanupTempDir(tempDir);
  }
}
