/**
 * Cache Job Service
 *
 * Handles background cache generation for covers and thumbnails.
 * Jobs are queued and processed sequentially to avoid resource contention.
 *
 * This service uses an in-memory queue (not persisted) since cache generation
 * is idempotent and can be re-triggered at any time.
 */

import { getDatabase } from './database.service.js';
import { getCoverForFile } from './cover.service.js';
import {
  generateThumbnails,
  deleteThumbnails,
  ThumbnailProgress,
} from './thumbnail.service.js';
import { deleteCachedCover } from './cover.service.js';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('cache-job');

// =============================================================================
// Types
// =============================================================================

export type CacheJobType = 'cover' | 'thumbnails' | 'full';
export type CacheJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface CacheJob {
  id: string;
  type: CacheJobType;
  fileIds: string[];
  status: CacheJobStatus;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  currentFile?: string;
  currentProgress?: ThumbnailProgress;
  errors: Array<{ fileId: string; error: string }>;
}

// =============================================================================
// Queue State
// =============================================================================

const jobQueue: CacheJob[] = [];
let currentJob: CacheJob | null = null;
let isProcessing = false;
let shouldCancel = false;

// =============================================================================
// Job Management
// =============================================================================

/**
 * Enqueue a new cache generation job.
 */
export function enqueueCacheJob(
  type: CacheJobType,
  fileIds: string[]
): CacheJob {
  const job: CacheJob = {
    id: `cache_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    type,
    fileIds,
    status: 'queued',
    totalFiles: fileIds.length,
    processedFiles: 0,
    failedFiles: 0,
    queuedAt: new Date(),
    errors: [],
  };

  jobQueue.push(job);

  // Start processing if not already running
  if (!isProcessing) {
    setImmediate(() => processQueue());
  }

  return job;
}

/**
 * Get a specific cache job by ID.
 */
export function getCacheJob(jobId: string): CacheJob | null {
  if (currentJob?.id === jobId) return currentJob;
  return jobQueue.find((j) => j.id === jobId) || null;
}

/**
 * Get all active (queued or processing) jobs.
 */
export function getActiveJobs(): CacheJob[] {
  const jobs: CacheJob[] = [];
  if (currentJob) jobs.push(currentJob);
  jobs.push(...jobQueue.filter((j) => j.status === 'queued'));
  return jobs;
}

/**
 * Get the number of files waiting to be processed.
 */
export function getQueuedFileCount(): number {
  let count = 0;
  if (currentJob) {
    count += currentJob.totalFiles - currentJob.processedFiles - currentJob.failedFiles;
  }
  for (const job of jobQueue) {
    if (job.status === 'queued') {
      count += job.totalFiles;
    }
  }
  return count;
}

/**
 * Cancel a cache job.
 */
export function cancelCacheJob(jobId: string): boolean {
  // Cancel current job
  if (currentJob?.id === jobId) {
    shouldCancel = true;
    return true;
  }

  // Remove from queue
  const index = jobQueue.findIndex((j) => j.id === jobId);
  if (index !== -1) {
    jobQueue[index]!.status = 'cancelled';
    jobQueue.splice(index, 1);
    return true;
  }

  return false;
}

/**
 * Cancel all pending jobs.
 */
export function cancelAllJobs(): number {
  let cancelled = 0;

  // Cancel current job
  if (currentJob) {
    shouldCancel = true;
    cancelled++;
  }

  // Cancel queued jobs
  while (jobQueue.length > 0) {
    const job = jobQueue.pop();
    if (job) {
      job.status = 'cancelled';
      cancelled++;
    }
  }

  return cancelled;
}

// =============================================================================
// Queue Processing
// =============================================================================

/**
 * Process the job queue.
 */
async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  while (jobQueue.length > 0) {
    const job = jobQueue.shift();
    if (!job || job.status === 'cancelled') continue;

    currentJob = job;
    shouldCancel = false;

    try {
      await processJob(job);
    } catch (err) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.errors.push({
        fileId: 'job',
        error: err instanceof Error ? err.message : String(err),
      });
      logger.error({ jobId: job.id, error: err }, 'Job failed');
    }

    currentJob = null;
  }

  isProcessing = false;
}

/**
 * Process a single cache job.
 */
async function processJob(job: CacheJob): Promise<void> {
  job.status = 'processing';
  job.startedAt = new Date();

  logger.info({ jobId: job.id, type: job.type, fileCount: job.fileIds.length }, 'Starting job');

  const prisma = getDatabase();

  for (const fileId of job.fileIds) {
    // Check for cancellation
    if (shouldCancel) {
      job.status = 'cancelled';
      job.completedAt = new Date();
      logger.info({ jobId: job.id }, 'Job cancelled');
      return;
    }

    // Get file info
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: { id: true, path: true, filename: true, hash: true, libraryId: true },
    });

    if (!file || !file.hash) {
      job.failedFiles++;
      job.errors.push({ fileId, error: file ? 'File hash not available' : 'File not found' });
      continue;
    }

    job.currentFile = file.filename;

    try {
      // Generate cover if needed
      if (job.type === 'cover' || job.type === 'full') {
        const coverResult = await getCoverForFile(fileId);
        if (!coverResult.success) {
          // Log but don't fail the whole job for cover errors
          logger.warn({ filename: file.filename, error: coverResult.error }, 'Cover extraction failed');
        }
      }

      // Generate thumbnails if needed
      if (job.type === 'thumbnails' || job.type === 'full') {
        const result = await generateThumbnails(
          file.path,
          file.libraryId,
          file.hash,
          {
            width: 80,
            onProgress: (current, total) => {
              job.currentProgress = {
                fileId: file.id,
                filename: file.filename,
                currentPage: current,
                totalPages: total,
                status: 'generating',
              };
            },
          }
        );

        if (!result.success && result.errors.length > 0) {
          job.errors.push({
            fileId,
            error: result.errors.map((e) => e.error).join('; '),
          });
        }
      }

      job.processedFiles++;
    } catch (err) {
      job.failedFiles++;
      job.errors.push({
        fileId,
        error: err instanceof Error ? err.message : String(err),
      });
      logger.error({ filename: file.filename, error: err }, 'Error processing file');
    }

    // Clear current progress
    job.currentProgress = undefined;
  }

  job.status = job.failedFiles === job.totalFiles ? 'failed' : 'completed';
  job.completedAt = new Date();

  logger.info(
    { jobId: job.id, status: job.status, succeeded: job.processedFiles, failed: job.failedFiles },
    'Job completed'
  );
}

// =============================================================================
// Cache Rebuild
// =============================================================================

/**
 * Delete and regenerate cache for specific files.
 */
export async function rebuildCacheForFiles(
  fileIds: string[],
  type: CacheJobType = 'full'
): Promise<CacheJob> {
  const prisma = getDatabase();

  // Delete existing cache for these files
  for (const fileId of fileIds) {
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: { libraryId: true, hash: true },
    });

    if (file?.hash) {
      if (type === 'cover' || type === 'full') {
        await deleteCachedCover(file.libraryId, file.hash);
      }
      if (type === 'thumbnails' || type === 'full') {
        await deleteThumbnails(file.libraryId, file.hash);
      }
    }
  }

  // Enqueue rebuild job
  return enqueueCacheJob(type, fileIds);
}

/**
 * Delete and regenerate cache for all files in a folder.
 */
export async function rebuildCacheForFolder(
  libraryId: string,
  folderPath: string,
  type: CacheJobType = 'full'
): Promise<CacheJob> {
  const prisma = getDatabase();

  // Get all files in the folder
  const files = await prisma.comicFile.findMany({
    where: {
      libraryId,
      relativePath: { startsWith: folderPath },
      status: { not: 'quarantined' },
    },
    select: { id: true, hash: true, libraryId: true },
  });

  const fileIds = files.map((f) => f.id);

  // Delete existing cache
  for (const file of files) {
    if (file.hash) {
      if (type === 'cover' || type === 'full') {
        await deleteCachedCover(file.libraryId, file.hash);
      }
      if (type === 'thumbnails' || type === 'full') {
        await deleteThumbnails(file.libraryId, file.hash);
      }
    }
  }

  // Enqueue rebuild job
  return enqueueCacheJob(type, fileIds);
}

// =============================================================================
// Import Hook
// =============================================================================

/**
 * Trigger cache generation for newly imported files.
 * Called after scan results are applied.
 */
export function triggerCacheGenerationForNewFiles(fileIds: string[]): void {
  if (fileIds.length === 0) return;

  logger.info({ fileCount: fileIds.length }, 'Triggering cache generation for new files');

  // Enqueue cover extraction first (faster, shows in UI quickly)
  enqueueCacheJob('cover', fileIds);

  // Enqueue thumbnail generation (slower, background task)
  enqueueCacheJob('thumbnails', fileIds);
}

/**
 * Delete and regenerate covers for an entire library or all libraries.
 * This is used for rebuilding the cover cache from System Settings.
 */
export async function rebuildCacheForLibrary(
  libraryId: string | null,
  type: CacheJobType = 'cover'
): Promise<CacheJob> {
  const prisma = getDatabase();

  // Get all files in the library (or all libraries if null)
  const files = await prisma.comicFile.findMany({
    where: libraryId
      ? { libraryId, status: { not: 'quarantined' } }
      : { status: { not: 'quarantined' } },
    select: { id: true, hash: true, libraryId: true },
  });

  const fileIds = files.map((f) => f.id);

  if (fileIds.length === 0) {
    // Return an empty completed job
    const job: CacheJob = {
      id: `cache_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      type,
      fileIds: [],
      status: 'completed',
      totalFiles: 0,
      processedFiles: 0,
      failedFiles: 0,
      queuedAt: new Date(),
      completedAt: new Date(),
      errors: [],
    };
    return job;
  }

  logger.info(
    { libraryId: libraryId || 'all', fileCount: fileIds.length, type },
    'Starting library cache rebuild'
  );

  // Delete existing cache for these files
  for (const file of files) {
    if (file.hash) {
      if (type === 'cover' || type === 'full') {
        await deleteCachedCover(file.libraryId, file.hash);
      }
      if (type === 'thumbnails' || type === 'full') {
        await deleteThumbnails(file.libraryId, file.hash);
      }
    }
  }

  // Enqueue rebuild job
  return enqueueCacheJob(type, fileIds);
}
