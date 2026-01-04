/**
 * Download Service
 *
 * Handles file downloads for single issues and series/bulk ZIP creation.
 * Optimized for large files (10-15 GB) with streaming ZIP creation,
 * automatic splitting, and progress tracking.
 */

import { createWriteStream, createReadStream, existsSync } from 'fs';
import { mkdir, rm, stat, readdir, unlink } from 'fs/promises';
import { join, basename, dirname, extname } from 'path';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import { Response } from 'express';
import { getDatabase } from './database.service.js';
import { downloadLogger as logger } from './logger.service.js';
import { getCacheDir } from './app-paths.service.js';

// =============================================================================
// Types
// =============================================================================

export type DownloadJobStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type DownloadJobType = 'single' | 'series' | 'bulk';

export interface DownloadEstimate {
  totalSizeBytes: number;
  fileCount: number;
  suggestSplit: boolean;
  estimatedParts: number;
  files: Array<{
    id: string;
    filename: string;
    size: number;
    exists: boolean;
  }>;
}

export interface CreateDownloadJobOptions {
  userId: string;
  type: DownloadJobType;
  seriesId?: string;
  fileIds: string[];
  splitEnabled?: boolean;
  splitSizeBytes?: number;
}

export interface DownloadJobResult {
  jobId: string;
  estimatedSize: number;
  fileCount: number;
  needsConfirmation: boolean;
  cached?: boolean; // True if reusing an existing cached download
}

export interface ZipCreationResult {
  success: boolean;
  paths: string[];
  totalSize: number;
  filesAdded: number;
  filesSkipped: number;
  skippedFiles?: SkippedFile[];
  error?: string;
}

export interface ProgressCallback {
  (current: number, total: number, message: string): void;
}

export interface SkippedFile {
  id: string;
  filename: string;
  reason: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Default split size: 2GB */
const DEFAULT_SPLIT_SIZE = 2 * 1024 * 1024 * 1024;

/** Size threshold for suggesting split (1GB) */
const SPLIT_SUGGESTION_THRESHOLD = 1 * 1024 * 1024 * 1024;

/** Issue count threshold for confirmation */
const CONFIRMATION_ISSUE_THRESHOLD = 50;

/** Size threshold for confirmation (1GB) */
const CONFIRMATION_SIZE_THRESHOLD = 1 * 1024 * 1024 * 1024;

/** Job expiration time (24 hours) */
const JOB_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/** Stale job threshold (1 hour) */
const STALE_JOB_THRESHOLD_MS = 60 * 60 * 1000;

// =============================================================================
// Download Directory Management
// =============================================================================

/**
 * Get the downloads cache directory.
 */
export async function getDownloadsCacheDir(): Promise<string> {
  const cacheDir = getCacheDir();
  const downloadsDir = join(cacheDir, 'downloads');
  await mkdir(downloadsDir, { recursive: true });
  return downloadsDir;
}

/**
 * Get the job-specific output directory.
 */
export async function getJobOutputDir(jobId: string): Promise<string> {
  const downloadsDir = await getDownloadsCacheDir();
  const jobDir = join(downloadsDir, jobId);
  await mkdir(jobDir, { recursive: true });
  return jobDir;
}

// =============================================================================
// Estimation Functions
// =============================================================================

/**
 * Estimate download size for a list of file IDs.
 */
export async function estimateDownloadSize(fileIds: string[]): Promise<DownloadEstimate> {
  const db = getDatabase();

  const files = await db.comicFile.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, filename: true, size: true, path: true },
  });

  const filesWithStatus = await Promise.all(
    files.map(async (file) => {
      let exists = false;
      try {
        await stat(file.path);
        exists = true;
      } catch {
        exists = false;
      }
      return {
        id: file.id,
        filename: file.filename,
        size: Number(file.size),
        exists,
      };
    })
  );

  const availableFiles = filesWithStatus.filter((f) => f.exists);
  const totalSizeBytes = availableFiles.reduce((sum, f) => sum + f.size, 0);
  const fileCount = availableFiles.length;

  const suggestSplit = totalSizeBytes > SPLIT_SUGGESTION_THRESHOLD;
  const estimatedParts = suggestSplit
    ? Math.ceil(totalSizeBytes / DEFAULT_SPLIT_SIZE)
    : 1;

  return {
    totalSizeBytes,
    fileCount,
    suggestSplit,
    estimatedParts,
    files: filesWithStatus,
  };
}

/**
 * Estimate download size for a series.
 */
export async function estimateSeriesDownloadSize(seriesId: string): Promise<DownloadEstimate> {
  const db = getDatabase();

  const files = await db.comicFile.findMany({
    where: { seriesId },
    select: { id: true },
  });

  return estimateDownloadSize(files.map((f) => f.id));
}

// =============================================================================
// Job Management
// =============================================================================

/**
 * Check if user has an active download job.
 */
export async function hasActiveDownload(userId: string): Promise<boolean> {
  const db = getDatabase();

  const activeJob = await db.downloadJob.findFirst({
    where: {
      userId,
      status: { in: ['pending', 'preparing'] },
    },
  });

  return activeJob !== null;
}

/**
 * Get user's active download jobs.
 */
export async function getActiveDownloads(userId: string): Promise<Array<{
  id: string;
  type: string;
  status: string;
  totalFiles: number;
  processedFiles: number;
  totalSizeBytes: bigint;
  outputFileName: string | null;
  createdAt: Date;
}>> {
  const db = getDatabase();

  return db.downloadJob.findMany({
    where: {
      userId,
      status: { in: ['pending', 'preparing', 'ready'] },
    },
    select: {
      id: true,
      type: true,
      status: true,
      totalFiles: true,
      processedFiles: true,
      totalSizeBytes: true,
      outputFileName: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Compute a content hash from sorted file IDs.
 * This is used for cache reuse - if two downloads have the same content hash,
 * the cached files can be reused.
 */
function computeContentHash(fileIds: string[]): string {
  const sortedIds = [...fileIds].sort();
  return createHash('sha256').update(sortedIds.join(',')).digest('hex').substring(0, 32);
}

/**
 * Find an existing cached download job with matching content.
 * Returns the job if it's ready and not expired.
 */
async function findCachedDownload(contentHash: string): Promise<{
  id: string;
  totalFiles: number;
  totalSizeBytes: bigint;
  outputPath: string | null;
  outputParts: string | null;
  outputFileName: string | null;
  expiresAt: Date | null;
} | null> {
  const db = getDatabase();

  // Find a ready job with matching content hash that hasn't expired
  const cachedJob = await db.downloadJob.findFirst({
    where: {
      contentHash,
      status: 'ready',
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      totalFiles: true,
      totalSizeBytes: true,
      outputPath: true,
      outputParts: true,
      outputFileName: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!cachedJob || !cachedJob.outputPath) {
    return null;
  }

  // Verify the files still exist on disk
  const outputPaths: string[] = cachedJob.outputParts
    ? JSON.parse(cachedJob.outputParts)
    : [cachedJob.outputPath];

  for (const path of outputPaths) {
    if (!existsSync(path)) {
      logger.info({ contentHash }, 'Cached download files no longer exist on disk');
      return null;
    }
  }

  return cachedJob;
}

/**
 * Create a new download job.
 */
export async function createDownloadJob(
  options: CreateDownloadJobOptions
): Promise<DownloadJobResult> {
  const { userId, type, seriesId, fileIds, splitEnabled, splitSizeBytes } = options;

  // Compute content hash for cache lookup
  const contentHash = computeContentHash(fileIds);

  // Check for cached download with matching content
  const cachedJob = await findCachedDownload(contentHash);
  if (cachedJob) {
    logger.info({
      jobId: cachedJob.id,
      contentHash,
      fileCount: cachedJob.totalFiles,
    }, 'Reusing cached download');

    return {
      jobId: cachedJob.id,
      estimatedSize: Number(cachedJob.totalSizeBytes),
      fileCount: cachedJob.totalFiles,
      needsConfirmation: false, // No confirmation needed for cached downloads
      cached: true,
    };
  }

  // Check for existing active job (only if not reusing cache)
  if (await hasActiveDownload(userId)) {
    throw new Error('You already have a download in progress. Please wait for it to complete.');
  }

  // Estimate size
  const estimate = await estimateDownloadSize(fileIds);

  if (estimate.fileCount === 0) {
    throw new Error('No files available for download.');
  }

  const db = getDatabase();

  // Generate output filename
  let outputFileName: string;
  if (type === 'series' && seriesId) {
    const series = await db.series.findUnique({
      where: { id: seriesId },
      select: { name: true, startYear: true },
    });
    if (series) {
      const yearStr = series.startYear ? ` (${series.startYear})` : '';
      outputFileName = `${series.name}${yearStr} Issues 1-${estimate.fileCount}.zip`;
    } else {
      outputFileName = `Series Download.zip`;
    }
  } else if (type === 'bulk') {
    // Try to get series name from first file
    const firstFile = await db.comicFile.findFirst({
      where: { id: fileIds[0] },
      include: { series: { select: { name: true, startYear: true } } },
    });
    if (firstFile?.series) {
      const yearStr = firstFile.series.startYear ? ` (${firstFile.series.startYear})` : '';
      outputFileName = `${firstFile.series.name}${yearStr} (${estimate.fileCount} Issues).zip`;
    } else {
      outputFileName = `Download (${estimate.fileCount} Issues).zip`;
    }
  } else {
    outputFileName = `Download.zip`;
  }

  // Create job record
  const job = await db.downloadJob.create({
    data: {
      userId,
      type,
      seriesId,
      fileIds: JSON.stringify(fileIds),
      contentHash, // Store hash for cache reuse
      status: 'pending',
      totalFiles: estimate.fileCount,
      processedFiles: 0,
      totalSizeBytes: BigInt(estimate.totalSizeBytes),
      outputFileName,
      splitEnabled: splitEnabled ?? estimate.suggestSplit,
      splitSizeBytes: splitSizeBytes ? BigInt(splitSizeBytes) : BigInt(DEFAULT_SPLIT_SIZE),
    },
  });

  logger.info({
    type,
    fileCount: estimate.fileCount,
    totalSize: estimate.totalSizeBytes,
    contentHash,
  }, `Created download job ${job.id} for user ${userId}`);

  // Determine if confirmation is needed
  const needsConfirmation =
    estimate.fileCount > CONFIRMATION_ISSUE_THRESHOLD ||
    estimate.totalSizeBytes > CONFIRMATION_SIZE_THRESHOLD;

  return {
    jobId: job.id,
    estimatedSize: estimate.totalSizeBytes,
    fileCount: estimate.fileCount,
    needsConfirmation,
  };
}

/**
 * Get a download job by ID.
 */
export async function getDownloadJob(jobId: string) {
  const db = getDatabase();
  return db.downloadJob.findUnique({ where: { id: jobId } });
}

/**
 * Update a download job.
 */
export async function updateDownloadJob(
  jobId: string,
  data: {
    status?: DownloadJobStatus;
    processedFiles?: number;
    outputPath?: string;
    outputParts?: string[];
    outputSizeBytes?: bigint;
    skippedFiles?: number;
    skippedFileIds?: SkippedFile[];
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
    expiresAt?: Date;
  }
) {
  const db = getDatabase();

  const updateData: Record<string, unknown> = { ...data };

  if (data.outputParts) {
    updateData.outputParts = JSON.stringify(data.outputParts);
  }

  if (data.skippedFileIds) {
    updateData.skippedFileIds = JSON.stringify(data.skippedFileIds);
  }

  return db.downloadJob.update({
    where: { id: jobId },
    data: updateData,
  });
}

/**
 * Cancel a download job.
 */
export async function cancelDownloadJob(jobId: string): Promise<void> {
  const db = getDatabase();

  const job = await db.downloadJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error('Download job not found');
  }

  // Update status
  await db.downloadJob.update({
    where: { id: jobId },
    data: { status: 'cancelled' },
  });

  // Cleanup files
  await cleanupJobFiles(jobId);

  logger.info(`Cancelled download job ${jobId}`);
}

// =============================================================================
// Single File Download
// =============================================================================

/**
 * Stream a single file to the response.
 */
export async function streamSingleFile(
  fileId: string,
  res: Response
): Promise<void> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    select: { id: true, path: true, filename: true, size: true },
  });

  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // Verify file exists on disk
  try {
    await stat(file.path);
  } catch {
    res.status(404).json({ error: 'File no longer exists on disk' });
    return;
  }

  // Set headers
  const contentType = getContentType(file.filename);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', Number(file.size));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(file.filename)}"`
  );

  // Stream file
  const stream = createReadStream(file.path);
  await pipeline(stream, res);

  logger.info(`Streamed single file download: ${file.filename}`);
}

/**
 * Get content type for a comic file.
 */
function getContentType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case '.cbz':
      return 'application/vnd.comicbook+zip';
    case '.cbr':
      return 'application/vnd.comicbook-rar';
    case '.cb7':
      return 'application/x-7z-compressed';
    case '.cbt':
      return 'application/x-tar';
    default:
      return 'application/octet-stream';
  }
}

// =============================================================================
// ZIP Creation
// =============================================================================

/**
 * Create a ZIP archive for a download job.
 * Uses streaming to handle large files efficiently.
 */
export async function createDownloadZip(
  jobId: string,
  onProgress?: ProgressCallback
): Promise<ZipCreationResult> {
  const db = getDatabase();
  const archiver = (await import('archiver')).default;

  const job = await db.downloadJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return { success: false, paths: [], totalSize: 0, filesAdded: 0, filesSkipped: 0, error: 'Job not found' };
  }

  const fileIds: string[] = JSON.parse(job.fileIds);
  const outputDir = await getJobOutputDir(jobId);
  const baseName = job.outputFileName?.replace(/\.zip$/, '') || 'Download';
  const splitEnabled = job.splitEnabled;
  const splitSize = Number(job.splitSizeBytes) || DEFAULT_SPLIT_SIZE;

  // Get file info
  const files = await db.comicFile.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, path: true, filename: true, size: true },
    orderBy: [{ filename: 'asc' }],
  });

  if (files.length === 0) {
    return { success: false, paths: [], totalSize: 0, filesAdded: 0, filesSkipped: 0, error: 'No files found' };
  }

  // Track results
  const outputPaths: string[] = [];
  const skippedFiles: SkippedFile[] = [];
  let totalSize = 0;
  let filesAdded = 0;
  let currentPartSize = 0;
  let currentPartNumber = 1;

  // Create filename generator
  const getPartFilename = (partNum: number, totalParts: number): string => {
    if (totalParts === 1) {
      return `${baseName}.zip`;
    }
    return `${baseName} Part ${partNum}.zip`;
  };

  // Estimate total parts for naming
  const totalEstimatedSize = files.reduce((sum, f) => sum + Number(f.size), 0);
  const estimatedParts = splitEnabled ? Math.ceil(totalEstimatedSize / splitSize) : 1;

  // Start first archive
  let currentOutputPath = join(outputDir, getPartFilename(currentPartNumber, estimatedParts));
  let output = createWriteStream(currentOutputPath);
  let archive = archiver('zip', {
    zlib: { level: 0 }, // Store only - comics are already compressed
    forceZip64: true,   // Support > 4GB
  });

  // Track file counts for progress naming
  let partStartFileNum = 1;
  let partEndFileNum = 0;

  // Set up archive event handlers
  const setupArchiveHandlers = (arch: ReturnType<typeof archiver>, outPath: string) => {
    arch.on('warning', (err) => {
      logger.warn(`Archive warning: ${err.message}`);
    });

    arch.on('error', (err) => {
      logger.error(`Archive error: ${err.message}`);
      throw err;
    });
  };

  setupArchiveHandlers(archive, currentOutputPath);
  archive.pipe(output);

  // Add files one by one
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    // Check if file exists
    try {
      await stat(file.path);
    } catch (err) {
      skippedFiles.push({ id: file.id, filename: file.filename, reason: 'File not found on disk' });
      onProgress?.(i + 1, files.length, `Skipped: ${file.filename} (not found)`);
      continue;
    }

    // Check if we need to start a new part
    if (splitEnabled && currentPartSize + Number(file.size) > splitSize && currentPartSize > 0) {
      // Finalize current archive
      await archive.finalize();
      await new Promise<void>((resolve) => output.on('close', resolve));

      // Get actual size
      const partStats = await stat(currentOutputPath);
      totalSize += partStats.size;
      outputPaths.push(currentOutputPath);

      // Update output filename with actual issue range
      // (We'll rename later if needed)

      // Start new archive
      currentPartNumber++;
      partStartFileNum = filesAdded + 1;
      currentOutputPath = join(outputDir, getPartFilename(currentPartNumber, estimatedParts));
      output = createWriteStream(currentOutputPath);
      archive = archiver('zip', {
        zlib: { level: 0 },
        forceZip64: true,
      });
      setupArchiveHandlers(archive, currentOutputPath);
      archive.pipe(output);
      currentPartSize = 0;
    }

    // Add file to archive
    try {
      archive.file(file.path, { name: file.filename });
      currentPartSize += Number(file.size);
      filesAdded++;
      partEndFileNum = filesAdded;
      onProgress?.(i + 1, files.length, `Adding: ${file.filename}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      skippedFiles.push({ id: file.id, filename: file.filename, reason });
      onProgress?.(i + 1, files.length, `Skipped: ${file.filename} (${reason})`);
    }
  }

  // Finalize last archive
  await archive.finalize();
  await new Promise<void>((resolve) => output.on('close', resolve));

  // Get final size
  const finalStats = await stat(currentOutputPath);
  totalSize += finalStats.size;
  outputPaths.push(currentOutputPath);

  logger.info({
    parts: outputPaths.length,
    filesAdded,
    filesSkipped: skippedFiles.length,
    totalSize,
  }, `Created download ZIP for job ${jobId}`);

  return {
    success: true,
    paths: outputPaths,
    totalSize,
    filesAdded,
    filesSkipped: skippedFiles.length,
    skippedFiles: skippedFiles.length > 0 ? skippedFiles : undefined,
  };
}

/**
 * Execute a download job (called by queue worker).
 */
export async function executeDownloadJob(
  jobId: string,
  onProgress?: ProgressCallback
): Promise<void> {
  const db = getDatabase();

  // Update status to preparing
  await updateDownloadJob(jobId, {
    status: 'preparing',
    startedAt: new Date(),
  });

  try {
    // Create ZIP
    const result = await createDownloadZip(jobId, onProgress);

    if (!result.success) {
      await updateDownloadJob(jobId, {
        status: 'failed',
        error: result.error || 'Failed to create ZIP archive',
      });
      return;
    }

    // Update job with results
    const expiresAt = new Date(Date.now() + JOB_EXPIRATION_MS);

    await updateDownloadJob(jobId, {
      status: 'ready',
      processedFiles: result.filesAdded,
      outputPath: result.paths[0],
      outputParts: result.paths.length > 1 ? result.paths : undefined,
      outputSizeBytes: BigInt(result.totalSize),
      skippedFiles: result.filesSkipped,
      skippedFileIds: result.skippedFiles,
      completedAt: new Date(),
      expiresAt,
    });

    logger.info(`Download job ${jobId} ready for download`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Download job ${jobId} failed: ${errorMessage}`);

    await updateDownloadJob(jobId, {
      status: 'failed',
      error: errorMessage,
    });

    // Cleanup on failure
    await cleanupJobFiles(jobId);
  }
}

// =============================================================================
// Cleanup Functions
// =============================================================================

/**
 * Cleanup files for a specific job.
 */
export async function cleanupJobFiles(jobId: string): Promise<void> {
  try {
    const downloadsDir = await getDownloadsCacheDir();
    const jobDir = join(downloadsDir, jobId);

    if (existsSync(jobDir)) {
      await rm(jobDir, { recursive: true, force: true });
      logger.info(`Cleaned up files for job ${jobId}`);
    }
  } catch (error) {
    logger.error(`Failed to cleanup job ${jobId}: ${error}`);
  }
}

/**
 * Cleanup expired download jobs.
 */
export async function cleanupExpiredDownloads(): Promise<number> {
  const db = getDatabase();

  // Find expired jobs
  const expiredJobs = await db.downloadJob.findMany({
    where: {
      expiresAt: { lt: new Date() },
      status: { in: ['ready', 'completed'] },
    },
    select: { id: true },
  });

  if (expiredJobs.length === 0) {
    return 0;
  }

  // Cleanup files and update status
  for (const job of expiredJobs) {
    await cleanupJobFiles(job.id);
  }

  // Update all to expired status
  await db.downloadJob.updateMany({
    where: { id: { in: expiredJobs.map((j) => j.id) } },
    data: { status: 'expired' },
  });

  logger.info(`Cleaned up ${expiredJobs.length} expired download jobs`);

  return expiredJobs.length;
}

/**
 * Cleanup stale jobs (stuck in preparing for too long).
 */
export async function cleanupStaleJobs(): Promise<number> {
  const db = getDatabase();

  const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);

  // Find stale jobs
  const staleJobs = await db.downloadJob.findMany({
    where: {
      status: 'preparing',
      startedAt: { lt: staleThreshold },
    },
    select: { id: true },
  });

  if (staleJobs.length === 0) {
    return 0;
  }

  // Cleanup files and update status
  for (const job of staleJobs) {
    await cleanupJobFiles(job.id);
  }

  // Update all to failed status
  await db.downloadJob.updateMany({
    where: { id: { in: staleJobs.map((j) => j.id) } },
    data: {
      status: 'failed',
      error: 'Job timed out during preparation',
    },
  });

  logger.info(`Cleaned up ${staleJobs.length} stale download jobs`);

  return staleJobs.length;
}

/**
 * Cleanup orphaned download directories.
 */
export async function cleanupOrphanedDownloads(): Promise<number> {
  const db = getDatabase();

  try {
    const downloadsDir = await getDownloadsCacheDir();
    const entries = await readdir(downloadsDir, { withFileTypes: true });

    let cleanedCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Check if job exists in database
      const job = await db.downloadJob.findUnique({
        where: { id: entry.name },
        select: { id: true, status: true },
      });

      // If job doesn't exist or is in a terminal state, cleanup
      if (!job || ['completed', 'failed', 'expired', 'cancelled'].includes(job.status)) {
        const dirPath = join(downloadsDir, entry.name);
        await rm(dirPath, { recursive: true, force: true });
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} orphaned download directories`);
    }

    return cleanedCount;
  } catch (error) {
    logger.error(`Failed to cleanup orphaned downloads: ${error}`);
    return 0;
  }
}

/**
 * Run all cleanup tasks.
 */
export async function runDownloadCleanup(): Promise<{
  expired: number;
  stale: number;
  orphaned: number;
}> {
  const expired = await cleanupExpiredDownloads();
  const stale = await cleanupStaleJobs();
  const orphaned = await cleanupOrphanedDownloads();

  return { expired, stale, orphaned };
}

// =============================================================================
// Cache Management
// =============================================================================

export interface DownloadCacheStats {
  totalFiles: number;
  totalSizeBytes: number;
  jobCount: number;
  oldestJob: Date | null;
  newestJob: Date | null;
}

/**
 * Get download cache statistics.
 */
export async function getDownloadCacheStats(): Promise<DownloadCacheStats> {
  const db = getDatabase();

  // Get jobs with cached files
  const cachedJobs = await db.downloadJob.findMany({
    where: {
      status: 'ready',
      outputPath: { not: null },
    },
    select: {
      id: true,
      outputPath: true,
      outputParts: true,
      outputSizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let totalFiles = 0;
  let totalSizeBytes = 0;
  let validJobCount = 0;

  for (const job of cachedJobs) {
    const paths: string[] = job.outputParts
      ? JSON.parse(job.outputParts)
      : job.outputPath ? [job.outputPath] : [];

    // Check if files exist
    let jobHasFiles = false;
    for (const path of paths) {
      if (existsSync(path)) {
        totalFiles++;
        jobHasFiles = true;
        try {
          const fileStat = await stat(path);
          totalSizeBytes += fileStat.size;
        } catch {
          // File stat failed, skip
        }
      }
    }

    if (jobHasFiles) {
      validJobCount++;
    }
  }

  return {
    totalFiles,
    totalSizeBytes,
    jobCount: validJobCount,
    oldestJob: cachedJobs.length > 0 ? cachedJobs[0]!.createdAt : null,
    newestJob: cachedJobs.length > 0 ? cachedJobs[cachedJobs.length - 1]!.createdAt : null,
  };
}

/**
 * Clear all download cache files and mark jobs as expired.
 */
export async function clearDownloadCache(): Promise<{
  filesDeleted: number;
  bytesFreed: number;
  jobsCleared: number;
}> {
  const db = getDatabase();

  // Get stats before clearing
  const stats = await getDownloadCacheStats();

  // Get all jobs with cached files
  const cachedJobs = await db.downloadJob.findMany({
    where: {
      status: 'ready',
      outputPath: { not: null },
    },
    select: { id: true },
  });

  // Delete files for each job
  for (const job of cachedJobs) {
    await cleanupJobFiles(job.id);
  }

  // Mark all ready jobs as expired
  await db.downloadJob.updateMany({
    where: {
      status: 'ready',
    },
    data: {
      status: 'expired',
    },
  });

  // Also clean up the entire downloads directory to catch any orphans
  try {
    const downloadsDir = await getDownloadsCacheDir();
    const entries = await readdir(downloadsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = join(downloadsDir, entry.name);
        await rm(dirPath, { recursive: true, force: true });
      }
    }
  } catch (error) {
    logger.error(`Error cleaning downloads directory: ${error}`);
  }

  logger.info({
    filesDeleted: stats.totalFiles,
    bytesFreed: stats.totalSizeBytes,
    jobsCleared: cachedJobs.length,
  }, 'Cleared download cache');

  return {
    filesDeleted: stats.totalFiles,
    bytesFreed: stats.totalSizeBytes,
    jobsCleared: cachedJobs.length,
  };
}
