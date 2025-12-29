/**
 * Rating Sync Job Service
 *
 * Background job management for bulk rating sync operations.
 * Handles library-wide syncs with progress tracking and SSE updates.
 */

import { getDatabase } from './database.service.js';
import { createServiceLogger } from './logger.service.js';
import { getExternalRatingsSettings } from './config.service.js';
import { syncSeriesRatings, syncIssueRatings } from './rating-sync.service.js';
import {
  type RatingSource,
  type SeriesSyncResult,
} from './rating-providers/index.js';
import {
  sendJobProgress,
  sendJobComplete,
  sendJobError,
  sendJobStatusChange,
} from './sse.service.js';

const logger = createServiceLogger('rating-sync-job');

// =============================================================================
// Types
// =============================================================================

export type RatingSyncJobType = 'series' | 'library' | 'scheduled' | 'series-issues';
export type RatingSyncJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface CreateJobOptions {
  type: RatingSyncJobType;
  seriesId?: string;
  libraryId?: string;
  sources?: RatingSource[];
  forceRefresh?: boolean;
}

export interface RatingSyncJobResult {
  jobId: string;
  status: RatingSyncJobStatus;
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  unmatchedItems: number;
  errors?: string[];
  unmatchedSeries?: Array<{ id: string; name: string }>;
}

// =============================================================================
// Queue State
// =============================================================================

/** Currently processing job ID */
let currentJobId: string | null = null;

/** Whether the worker loop is running */
let isWorkerRunning = false;

/** Cancel flag for current job */
let cancelRequested = false;

// =============================================================================
// Job Creation
// =============================================================================

/**
 * Create a new rating sync job
 */
export async function createRatingSyncJob(
  options: CreateJobOptions
): Promise<string> {
  const db = getDatabase();
  const settings = getExternalRatingsSettings();

  // Determine sources to use
  const sources =
    options.sources || (settings?.enabledSources as RatingSource[]) || [];

  // Count items to process
  let totalItems = 0;

  if (options.type === 'series' && options.seriesId) {
    totalItems = 1;
  } else if (options.type === 'series-issues' && options.seriesId) {
    // Count comic files (issues) in this series that have metadata with issue numbers
    totalItems = await db.comicFile.count({
      where: {
        seriesId: options.seriesId,
        metadata: {
          number: { not: null },
        },
      },
    });
  } else if (options.type === 'library' && options.libraryId) {
    // Count series that have files in this library
    totalItems = await db.series.count({
      where: {
        issues: {
          some: {
            libraryId: options.libraryId,
          },
        },
      },
    });
  } else if (options.type === 'scheduled') {
    // For scheduled jobs, process all series with expired or no ratings
    totalItems = await db.series.count();
  }

  if (totalItems === 0) {
    throw new Error('No items to process');
  }

  // Create job record
  const job = await db.ratingSyncJob.create({
    data: {
      type: options.type,
      seriesId: options.seriesId,
      libraryId: options.libraryId,
      status: 'pending',
      totalItems,
      processedItems: 0,
      successItems: 0,
      failedItems: 0,
      unmatchedItems: 0,
      sources: JSON.stringify(sources),
      forceRefresh: options.forceRefresh ?? false,
    },
  });

  logger.info(
    { jobId: job.id, type: options.type, totalItems, sources },
    'Created rating sync job'
  );

  // Start worker if not running
  startWorker();

  return job.id;
}

/**
 * Get job status
 */
export async function getJobStatus(
  jobId: string
): Promise<RatingSyncJobResult | null> {
  const db = getDatabase();

  const job = await db.ratingSyncJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return null;
  }

  const result: RatingSyncJobResult = {
    jobId: job.id,
    status: job.status as RatingSyncJobStatus,
    totalItems: job.totalItems,
    processedItems: job.processedItems,
    successItems: job.successItems,
    failedItems: job.failedItems,
    unmatchedItems: job.unmatchedItems,
  };

  if (job.errorDetails) {
    try {
      result.errors = JSON.parse(job.errorDetails);
    } catch {
      result.errors = [job.errorDetails];
    }
  }

  if (job.unmatchedSeries) {
    try {
      result.unmatchedSeries = JSON.parse(job.unmatchedSeries);
    } catch {
      // Invalid JSON, ignore
    }
  }

  return result;
}

/**
 * Cancel a running job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const db = getDatabase();

  const job = await db.ratingSyncJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return false;
  }

  if (job.status === 'completed' || job.status === 'failed') {
    return false; // Already finished
  }

  if (currentJobId === jobId) {
    // Set cancel flag for running job
    cancelRequested = true;
  }

  await db.ratingSyncJob.update({
    where: { id: jobId },
    data: { status: 'cancelled' },
  });

  logger.info({ jobId }, 'Cancelled rating sync job');

  return true;
}

/**
 * Get all jobs (with optional filtering)
 */
export async function getJobs(options?: {
  status?: RatingSyncJobStatus;
  limit?: number;
}): Promise<RatingSyncJobResult[]> {
  const db = getDatabase();

  const jobs = await db.ratingSyncJob.findMany({
    where: options?.status ? { status: options.status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50,
  });

  return jobs.map((job) => ({
    jobId: job.id,
    status: job.status as RatingSyncJobStatus,
    totalItems: job.totalItems,
    processedItems: job.processedItems,
    successItems: job.successItems,
    failedItems: job.failedItems,
    unmatchedItems: job.unmatchedItems,
  }));
}

// =============================================================================
// Worker Loop
// =============================================================================

/**
 * Start the worker loop if not already running
 */
function startWorker(): void {
  if (isWorkerRunning) return;

  isWorkerRunning = true;
  processNextJob();
}

/**
 * Process the next pending job
 */
async function processNextJob(): Promise<void> {
  // If already processing, skip
  if (currentJobId) {
    return;
  }

  const db = getDatabase();

  try {
    // Get next pending job
    const job = await db.ratingSyncJob.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    if (!job) {
      // No more jobs to process
      isWorkerRunning = false;
      return;
    }

    currentJobId = job.id;
    cancelRequested = false;

    // Mark as processing
    await db.ratingSyncJob.update({
      where: { id: job.id },
      data: {
        status: 'processing',
        startedAt: new Date(),
      },
    });

    // Send SSE update
    sendJobStatusChange(job.id, 'processing');

    logger.info({ jobId: job.id, type: job.type }, 'Starting rating sync job');

    // Process the job
    await processJob(job);
  } catch (error) {
    logger.error({ error }, 'Error in worker loop');
  } finally {
    currentJobId = null;
    // Schedule next job processing
    setImmediate(() => processNextJob());
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
  totalItems: number;
}): Promise<void> {
  const db = getDatabase();

  const sources = JSON.parse(job.sources) as RatingSource[];
  const errors: string[] = [];
  const unmatchedSeries: Array<{ id: string; name: string }> = [];

  let processedItems = 0;
  let successItems = 0;
  let failedItems = 0;
  let unmatchedItems = 0;

  try {
    // Handle 'series-issues' job type separately (processes files, not series)
    if (job.type === 'series-issues' && job.seriesId) {
      await processSeriesIssuesJob(job);
      return;
    }

    // Get series to process
    let seriesIds: string[] = [];

    if (job.type === 'series' && job.seriesId) {
      seriesIds = [job.seriesId];
    } else if (job.type === 'library' && job.libraryId) {
      // Get series that have files in this library
      const series = await db.series.findMany({
        where: {
          issues: {
            some: {
              libraryId: job.libraryId,
            },
          },
        },
        select: { id: true },
      });
      seriesIds = series.map((s) => s.id);
    } else if (job.type === 'scheduled') {
      // For scheduled jobs, get series with expired or no ratings
      const allSeries = await db.series.findMany({
        select: { id: true },
      });
      seriesIds = allSeries.map((s) => s.id);
    }

    // Process each series
    for (const seriesId of seriesIds) {
      // Check for cancellation
      if (cancelRequested) {
        logger.info({ jobId: job.id }, 'Job cancelled by user');
        break;
      }

      try {
        const result = await syncSeriesRatings(seriesId, {
          sources,
          forceRefresh: job.forceRefresh,
        });

        processedItems++;

        if (result.success) {
          successItems++;
        } else if (result.unmatchedSources.length > 0) {
          unmatchedItems++;
          // Get series name for unmatched list
          const series = await db.series.findUnique({
            where: { id: seriesId },
            select: { name: true },
          });
          if (series) {
            unmatchedSeries.push({ id: seriesId, name: series.name });
          }
        } else {
          failedItems++;
          if (result.errors && result.errors.length > 0) {
            errors.push(
              ...result.errors.map(
                (e) => `${result.seriesName}: ${e.source} - ${e.error}`
              )
            );
          }
        }

        // Send progress update
        sendJobProgress(job.id, 'processing', {
          current: processedItems,
          total: job.totalItems,
          message: `Processing ${result.seriesName}`,
          detail: result.success
            ? `Found ${result.ratings.length} ratings`
            : 'No ratings found',
        });

        // Update job progress in database periodically (every 10 items)
        if (processedItems % 10 === 0) {
          await db.ratingSyncJob.update({
            where: { id: job.id },
            data: {
              processedItems,
              successItems,
              failedItems,
              unmatchedItems,
            },
          });
        }
      } catch (error) {
        processedItems++;
        failedItems++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Series ${seriesId}: ${errorMessage}`);
        logger.error(
          { jobId: job.id, seriesId, error },
          'Error syncing series ratings'
        );
      }
    }

    // Finalize job
    const finalStatus = cancelRequested ? 'cancelled' : 'completed';

    await db.ratingSyncJob.update({
      where: { id: job.id },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        processedItems,
        successItems,
        failedItems,
        unmatchedItems,
        errorDetails: errors.length > 0 ? JSON.stringify(errors) : null,
        unmatchedSeries:
          unmatchedSeries.length > 0 ? JSON.stringify(unmatchedSeries) : null,
      },
    });

    // Send completion SSE
    sendJobComplete(job.id, {
      status: finalStatus,
      processedItems,
      successItems,
      failedItems,
      unmatchedItems,
      unmatchedSeries,
    });

    logger.info(
      {
        jobId: job.id,
        status: finalStatus,
        processedItems,
        successItems,
        failedItems,
        unmatchedItems,
      },
      'Completed rating sync job'
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await db.ratingSyncJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        processedItems,
        successItems,
        failedItems,
        unmatchedItems,
        error: errorMessage,
        errorDetails: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    });

    // Send error SSE
    sendJobError(job.id, errorMessage);

    logger.error({ jobId: job.id, error }, 'Rating sync job failed');
  }
}

// =============================================================================
// Series-Issues Job Processing
// =============================================================================

/**
 * Process a series-issues job (syncs ratings for all files in a series)
 */
async function processSeriesIssuesJob(job: {
  id: string;
  seriesId: string | null;
  forceRefresh: boolean;
  totalItems: number;
}): Promise<void> {
  const db = getDatabase();

  if (!job.seriesId) {
    throw new Error('seriesId is required for series-issues job');
  }

  const errors: string[] = [];
  let processedItems = 0;
  let successItems = 0;
  let failedItems = 0;
  let unmatchedItems = 0; // Issues with no ratings available (stored as -1)

  // Get series info
  const series = await db.series.findUnique({
    where: { id: job.seriesId },
    select: { name: true },
  });

  if (!series) {
    throw new Error(`Series not found: ${job.seriesId}`);
  }

  // Get all files for this series with valid issue numbers
  const files = await db.comicFile.findMany({
    where: {
      seriesId: job.seriesId,
      metadata: {
        number: { not: null },
      },
    },
    include: {
      metadata: {
        select: { number: true, issueNumberSort: true },
      },
    },
    orderBy: {
      metadata: {
        issueNumberSort: { sort: 'asc', nulls: 'last' },
      },
    },
  });

  logger.info(
    { jobId: job.id, seriesId: job.seriesId, seriesName: series.name, issueCount: files.length },
    'Starting series-issues job'
  );

  // Process each file
  for (const file of files) {
    // Check for cancellation
    if (cancelRequested) {
      logger.info({ jobId: job.id }, 'Job cancelled by user');
      break;
    }

    const issueNumber = file.metadata?.number || 'Unknown';

    try {
      const result = await syncIssueRatings(file.id, {
        forceRefresh: job.forceRefresh,
      });

      processedItems++;

      if (result.success) {
        if (result.hasRatings) {
          successItems++;
        } else {
          // No ratings available (stored as -1)
          unmatchedItems++;
        }
      } else {
        failedItems++;
        if (result.error) {
          errors.push(`Issue ${issueNumber}: ${result.error}`);
        }
      }

      // Send progress update
      sendJobProgress(job.id, 'processing', {
        current: processedItems,
        total: job.totalItems,
        message: `Processing ${series.name} #${issueNumber}`,
        detail: result.hasRatings
          ? `Found ${result.ratings.length} ratings`
          : result.success
            ? 'No ratings available'
            : result.error || 'Failed',
      });

      // Update job progress in database periodically (every 5 items for issues)
      if (processedItems % 5 === 0) {
        await db.ratingSyncJob.update({
          where: { id: job.id },
          data: {
            processedItems,
            successItems,
            failedItems,
            unmatchedItems,
          },
        });
      }
    } catch (error) {
      processedItems++;
      failedItems++;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Issue ${issueNumber}: ${errorMessage}`);
      logger.error(
        { jobId: job.id, fileId: file.id, issueNumber, error },
        'Error syncing issue ratings'
      );
    }
  }

  // Finalize job
  const finalStatus = cancelRequested ? 'cancelled' : 'completed';

  await db.ratingSyncJob.update({
    where: { id: job.id },
    data: {
      status: finalStatus,
      completedAt: new Date(),
      processedItems,
      successItems,
      failedItems,
      unmatchedItems, // Count of issues with no ratings
      errorDetails: errors.length > 0 ? JSON.stringify(errors) : null,
    },
  });

  // Send completion SSE
  sendJobComplete(job.id, {
    status: finalStatus,
    processedItems,
    successItems,
    failedItems,
    unmatchedItems,
  });

  logger.info(
    {
      jobId: job.id,
      status: finalStatus,
      processedItems,
      successItems,
      failedItems,
      unmatchedItems,
    },
    'Completed series-issues job'
  );
}

// =============================================================================
// Startup Recovery
// =============================================================================

/**
 * Recover jobs that were interrupted by server restart
 */
export async function recoverInterruptedJobs(): Promise<void> {
  const db = getDatabase();

  try {
    // Find jobs that were processing when server stopped
    const interruptedJobs = await db.ratingSyncJob.findMany({
      where: { status: 'processing' },
    });

    for (const job of interruptedJobs) {
      logger.info({ jobId: job.id }, 'Recovering interrupted rating sync job');

      // Reset to pending so it will be reprocessed
      await db.ratingSyncJob.update({
        where: { id: job.id },
        data: {
          status: 'pending',
          startedAt: null,
        },
      });
    }

    if (interruptedJobs.length > 0) {
      logger.info(
        { count: interruptedJobs.length },
        'Recovered interrupted rating sync jobs'
      );
      // Start worker to process recovered jobs
      startWorker();
    }
  } catch (error) {
    logger.error({ error }, 'Failed to recover interrupted jobs');
  }
}

/**
 * Clean up old completed jobs
 */
export async function cleanupOldJobs(daysOld: number = 30): Promise<number> {
  const db = getDatabase();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await db.ratingSyncJob.deleteMany({
    where: {
      status: { in: ['completed', 'failed', 'cancelled'] },
      completedAt: { lt: cutoffDate },
    },
  });

  if (result.count > 0) {
    logger.info({ count: result.count, daysOld }, 'Cleaned up old rating sync jobs');
  }

  return result.count;
}

// =============================================================================
// Exports
// =============================================================================

export const RatingSyncJobService = {
  createJob: createRatingSyncJob,
  getStatus: getJobStatus,
  cancel: cancelJob,
  getJobs,
  recoverInterruptedJobs,
  cleanupOldJobs,
};

export default RatingSyncJobService;
