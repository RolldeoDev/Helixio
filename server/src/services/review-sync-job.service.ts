/**
 * Review Sync Job Service
 *
 * Background job processing for review synchronization.
 * Handles library-wide and scheduled review syncing with progress tracking.
 */

import { getDatabase } from './database.service.js';
import { createServiceLogger } from './logger.service.js';
import { syncSeriesReviews, type ReviewSyncOptions } from './review-sync.service.js';
import { sendJobProgress, sendJobComplete, sendJobError, sendJobStatusChange } from './sse.service.js';
import type { ReviewSource, ReviewSyncJobResult } from './review-providers/types.js';

const logger = createServiceLogger('review-sync-job');

// =============================================================================
// Types
// =============================================================================

export type ReviewSyncJobType = 'series' | 'library' | 'scheduled';

export interface CreateReviewSyncJobOptions {
  type: ReviewSyncJobType;
  seriesId?: string;
  libraryId?: string;
  sources?: ReviewSource[];
  forceRefresh?: boolean;
  reviewLimit?: number;
}

export interface ReviewSyncJobStatus {
  id: string;
  type: ReviewSyncJobType;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  seriesId: string | null;
  libraryId: string | null;
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  unmatchedItems: number;
  sources: ReviewSource[];
  forceRefresh: boolean;
  reviewLimit: number;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

// =============================================================================
// Job Queue State
// =============================================================================

let currentJobId: string | null = null;
let cancelRequested = false;
let isProcessing = false;

// =============================================================================
// Job Management Functions
// =============================================================================

/**
 * Create a new review sync job
 */
export async function createReviewSyncJob(
  options: CreateReviewSyncJobOptions
): Promise<string> {
  const db = getDatabase();

  const job = await db.reviewSyncJob.create({
    data: {
      type: options.type,
      seriesId: options.seriesId,
      libraryId: options.libraryId,
      sources: JSON.stringify(options.sources || []),
      forceRefresh: options.forceRefresh || false,
      reviewLimit: options.reviewLimit || 10,
      status: 'pending',
    },
  });

  logger.info({ jobId: job.id, type: options.type }, 'Created review sync job');

  // Start processing if not already processing
  if (!isProcessing) {
    processJobQueue();
  }

  return job.id;
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<ReviewSyncJobStatus | null> {
  const db = getDatabase();
  const job = await db.reviewSyncJob.findUnique({ where: { id: jobId } });

  if (!job) return null;

  return {
    id: job.id,
    type: job.type as ReviewSyncJobType,
    status: job.status as ReviewSyncJobStatus['status'],
    seriesId: job.seriesId,
    libraryId: job.libraryId,
    totalItems: job.totalItems,
    processedItems: job.processedItems,
    successItems: job.successItems,
    failedItems: job.failedItems,
    unmatchedItems: job.unmatchedItems,
    sources: JSON.parse(job.sources) as ReviewSource[],
    forceRefresh: job.forceRefresh,
    reviewLimit: job.reviewLimit,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

/**
 * Cancel a running job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const db = getDatabase();
  const job = await db.reviewSyncJob.findUnique({ where: { id: jobId } });

  if (!job || job.status !== 'running') {
    return false;
  }

  if (currentJobId === jobId) {
    cancelRequested = true;
    logger.info({ jobId }, 'Cancellation requested for review sync job');
    return true;
  }

  return false;
}

/**
 * Get list of recent jobs
 */
export async function getRecentJobs(
  options: { status?: string; limit?: number } = {}
): Promise<ReviewSyncJobStatus[]> {
  const db = getDatabase();

  const where = options.status ? { status: options.status } : {};

  const jobs = await db.reviewSyncJob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options.limit || 20,
  });

  return jobs.map((job) => ({
    id: job.id,
    type: job.type as ReviewSyncJobType,
    status: job.status as ReviewSyncJobStatus['status'],
    seriesId: job.seriesId,
    libraryId: job.libraryId,
    totalItems: job.totalItems,
    processedItems: job.processedItems,
    successItems: job.successItems,
    failedItems: job.failedItems,
    unmatchedItems: job.unmatchedItems,
    sources: JSON.parse(job.sources) as ReviewSource[],
    forceRefresh: job.forceRefresh,
    reviewLimit: job.reviewLimit,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  }));
}

// =============================================================================
// Job Processing
// =============================================================================

/**
 * Process the job queue
 */
async function processJobQueue(): Promise<void> {
  if (isProcessing) return;

  isProcessing = true;

  try {
    while (true) {
      const db = getDatabase();

      // Get next pending job
      const job = await db.reviewSyncJob.findFirst({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
      });

      if (!job) {
        break;
      }

      currentJobId = job.id;
      cancelRequested = false;

      try {
        await processJob(job);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ jobId: job.id, error: errorMessage }, 'Job processing failed');

        await db.reviewSyncJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            error: errorMessage,
            completedAt: new Date(),
          },
        });

        sendJobError(job.id, errorMessage);
      }

      currentJobId = null;
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Process a single job
 */
async function processJob(job: {
  id: string;
  type: string;
  seriesId: string | null;
  libraryId: string | null;
  sources: string;
  forceRefresh: boolean;
  reviewLimit: number;
}): Promise<void> {
  const db = getDatabase();

  // Mark as running
  await db.reviewSyncJob.update({
    where: { id: job.id },
    data: {
      status: 'running',
      startedAt: new Date(),
    },
  });

  sendJobStatusChange(job.id, 'review-sync', 'running');

  const sources = JSON.parse(job.sources) as ReviewSource[];
  const syncOptions: ReviewSyncOptions = {
    sources: sources.length > 0 ? sources : undefined,
    forceRefresh: job.forceRefresh,
    reviewLimit: job.reviewLimit,
  };

  const errors: Array<{
    seriesId: string;
    seriesName: string;
    source: ReviewSource;
    error: string;
  }> = [];
  const unmatchedSeriesList: Array<{
    seriesId: string;
    seriesName: string;
    attemptedSources: ReviewSource[];
  }> = [];

  let totalItems = 0;
  let processedItems = 0;
  let successItems = 0;
  let failedItems = 0;
  let unmatchedItems = 0;
  let totalReviews = 0;

  // Get series to process based on job type
  let seriesToProcess: Array<{ id: string; name: string }> = [];

  if (job.type === 'series' && job.seriesId) {
    const series = await db.series.findUnique({
      where: { id: job.seriesId },
      select: { id: true, name: true },
    });
    if (series) {
      seriesToProcess = [series];
    }
  } else if (job.type === 'library' && job.libraryId) {
    const series = await db.series.findMany({
      where: {
        issues: {
          some: {
            libraryId: job.libraryId,
          },
        },
      },
      select: { id: true, name: true },
    });
    seriesToProcess = series;
  } else if (job.type === 'scheduled') {
    // Get all series that might have external IDs
    const series = await db.series.findMany({
      where: {
        OR: [
          { anilistId: { not: null } },
          { malId: { not: null } },
        ],
      },
      select: { id: true, name: true },
    });
    seriesToProcess = series;
  }

  totalItems = seriesToProcess.length;

  // Update total count
  await db.reviewSyncJob.update({
    where: { id: job.id },
    data: { totalItems },
  });

  // Process each series
  for (const series of seriesToProcess) {
    if (cancelRequested) {
      await db.reviewSyncJob.update({
        where: { id: job.id },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
        },
      });
      sendJobStatusChange(job.id, 'review-sync', 'cancelled');
      return;
    }

    try {
      const result = await syncSeriesReviews(series.id, syncOptions);

      processedItems++;

      if (result.success) {
        successItems++;
        totalReviews += result.reviewCount;
      } else if (result.unmatchedSources.length === sources.length ||
                 (sources.length === 0 && result.matchedSources.length === 0)) {
        unmatchedItems++;
        unmatchedSeriesList.push({
          seriesId: series.id,
          seriesName: series.name,
          attemptedSources: sources.length > 0 ? sources : result.unmatchedSources,
        });
      } else {
        failedItems++;
      }

      // Collect errors
      if (result.errors && result.errors.length > 0) {
        for (const error of result.errors) {
          errors.push({
            seriesId: series.id,
            seriesName: series.name,
            source: error.source,
            error: error.error,
          });
        }
      }

      // Update progress every 10 items
      if (processedItems % 10 === 0 || processedItems === totalItems) {
        await db.reviewSyncJob.update({
          where: { id: job.id },
          data: {
            processedItems,
            successItems,
            failedItems,
            unmatchedItems,
          },
        });

        sendJobProgress(job.id, 'review-sync', {
          current: processedItems,
          total: totalItems,
          message: `Processed ${successItems} successful, ${failedItems} failed, ${unmatchedItems} unmatched`,
          detail: `${totalReviews} reviews fetched`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      failedItems++;
      processedItems++;

      errors.push({
        seriesId: series.id,
        seriesName: series.name,
        source: 'anilist', // Default to first source for general errors
        error: errorMessage,
      });

      logger.error(
        { seriesId: series.id, error: errorMessage },
        'Error syncing reviews for series'
      );
    }
  }

  // Finalize job
  const finalStatus = failedItems === totalItems ? 'failed' : 'completed';

  await db.reviewSyncJob.update({
    where: { id: job.id },
    data: {
      status: finalStatus,
      processedItems,
      successItems,
      failedItems,
      unmatchedItems,
      unmatchedSeries: JSON.stringify(unmatchedSeriesList),
      errorDetails: JSON.stringify(errors),
      completedAt: new Date(),
    },
  });

  sendJobComplete(job.id, {
    processed: processedItems,
    total: totalItems,
    success: successItems,
    failed: failedItems,
    unmatched: unmatchedItems,
    reviews: totalReviews,
  });

  logger.info(
    {
      jobId: job.id,
      totalItems,
      successItems,
      failedItems,
      unmatchedItems,
      totalReviews,
    },
    'Review sync job completed'
  );
}

/**
 * Recover interrupted jobs on startup
 */
export async function recoverInterruptedJobs(): Promise<void> {
  const db = getDatabase();

  // Reset any jobs that were interrupted (status = 'running')
  const result = await db.reviewSyncJob.updateMany({
    where: { status: 'running' },
    data: { status: 'pending' },
  });

  if (result.count > 0) {
    logger.info({ count: result.count }, 'Reset interrupted review sync jobs to pending');
    processJobQueue();
  }
}

/**
 * Cleanup old completed/failed jobs
 */
export async function cleanupOldJobs(daysOld: number = 7): Promise<number> {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const result = await db.reviewSyncJob.deleteMany({
    where: {
      status: { in: ['completed', 'failed', 'cancelled'] },
      completedAt: { lt: cutoff },
    },
  });

  if (result.count > 0) {
    logger.info({ count: result.count, daysOld }, 'Cleaned up old review sync jobs');
  }

  return result.count;
}

// =============================================================================
// Exports
// =============================================================================

export const ReviewSyncJobService = {
  createReviewSyncJob,
  getJobStatus,
  cancelJob,
  getRecentJobs,
  recoverInterruptedJobs,
  cleanupOldJobs,
};

export default ReviewSyncJobService;
