/**
 * Job Aggregator Service
 *
 * Aggregates jobs from multiple sources into a unified format.
 * Read-only service - does not modify any job state.
 */

import type {
  UnifiedJob,
  UnifiedJobType,
  UnifiedJobStatus,
  SchedulerStatus,
  AggregatedJobsResponse,
  UnifiedJobLog,
  UnifiedJobDetails,
} from './job-aggregator.types.js';

// Import job services
import { listAllJobs as listMetadataJobs, getJob as getMetadataJob } from './metadata-job.service.js';
import {
  listActiveScanJobs,
  getScanJob,
  type LibraryScanJobData,
} from './library-scan-job.service.js';
import { getJobs as getRatingSyncJobs } from './rating-sync-job.service.js';
import { getSchedulerStatus as getStatsSchedulerStatus } from './stats-scheduler.service.js';
import { getSchedulerStatus as getRatingSyncSchedulerStatus } from './rating-sync-scheduler.service.js';
import { getSimilaritySchedulerStatus } from './similarity/index.js';
import {
  getRecentBatches,
  findInterruptedBatches,
  getBatch,
  getActiveBatchId,
  type BatchProgress,
} from './batch.service.js';
import { getDatabase } from './database.service.js';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('job-aggregator');

// =============================================================================
// Status Mappers
// =============================================================================

function mapMetadataStatus(status: string): UnifiedJobStatus {
  switch (status) {
    case 'options':
    case 'initializing':
      return 'queued';
    case 'series_approval':
    case 'fetching_issues':
    case 'file_review':
    case 'applying':
      return 'running';
    case 'complete':
      return 'completed';
    case 'error':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}

function mapScanStatus(status: string): UnifiedJobStatus {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'discovering':
    case 'cleaning':
    case 'indexing':
    case 'linking':
    case 'covers':
      return 'running';
    case 'complete':
      return 'completed';
    case 'error':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}

function mapRatingSyncStatus(status: string): UnifiedJobStatus {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'processing':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}

function mapBatchStatus(status: string): UnifiedJobStatus {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'in_progress':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'paused':
      return 'interrupted';
    default:
      return 'running';
  }
}

// =============================================================================
// Job Converters
// =============================================================================

function convertMetadataJob(job: {
  id: string;
  status: string;
  totalFiles: number;
  error?: string | null;
  createdAt: Date;
  session?: {
    currentSeriesIndex?: number;
    seriesGroups?: unknown[];
  } | null;
}): UnifiedJob {
  const status = mapMetadataStatus(job.status);
  let subtitle = `${job.totalFiles} files`;

  if (job.status === 'series_approval' && job.session) {
    const current = (job.session.currentSeriesIndex ?? 0) + 1;
    const total = job.session.seriesGroups?.length ?? 0;
    subtitle = `Series ${current}/${total}`;
  } else if (job.status === 'applying') {
    subtitle = 'Applying changes...';
  }

  return {
    id: job.id,
    type: 'metadata',
    status,
    title: 'Metadata Job',
    subtitle,
    createdAt: job.createdAt,
    error: job.error || undefined,
    canCancel: status === 'queued' || status === 'running',
    canRetry: false,
    _raw: job,
  };
}

function convertScanJob(job: LibraryScanJobData, libraryName?: string): UnifiedJob {
  const status = mapScanStatus(job.status);

  // Calculate progress
  let progress: number | undefined;
  if (status === 'running' && job.totalFiles > 0) {
    const weights = { discovering: 5, cleaning: 5, indexing: 40, linking: 30, covers: 20 };
    const stageOrder = ['discovering', 'cleaning', 'indexing', 'linking', 'covers'];
    const currentIndex = stageOrder.indexOf(job.currentStage);

    if (currentIndex >= 0) {
      let completed = 0;
      for (let i = 0; i < currentIndex; i++) {
        completed += weights[stageOrder[i] as keyof typeof weights] || 0;
      }

      // Current stage progress
      const currentWeight = weights[job.currentStage as keyof typeof weights] || 0;
      let stageProgress = 0;
      if (job.currentStage === 'indexing' && job.totalFiles > 0) {
        stageProgress = job.indexedFiles / job.totalFiles;
      } else if (job.currentStage === 'linking' && job.totalFiles > 0) {
        stageProgress = job.linkedFiles / job.totalFiles;
      } else if (job.currentStage === 'covers' && job.totalFiles > 0) {
        stageProgress = job.coversExtracted / job.totalFiles;
      }

      progress = Math.round(completed + stageProgress * currentWeight);
    }
  } else if (status === 'completed') {
    progress = 100;
  }

  const stageLabels: Record<string, string> = {
    queued: 'Waiting...',
    discovering: 'Discovering files',
    cleaning: 'Cleaning orphans',
    indexing: `Indexing (${job.indexedFiles}/${job.totalFiles})`,
    linking: `Linking (${job.linkedFiles}/${job.totalFiles})`,
    covers: `Extracting covers (${job.coversExtracted}/${job.totalFiles})`,
    complete: 'Complete',
    error: 'Error',
    cancelled: 'Cancelled',
  };

  return {
    id: job.id,
    type: 'library-scan',
    status,
    title: libraryName ? `Library Scan: ${libraryName}` : 'Library Scan',
    subtitle: stageLabels[job.currentStage] || job.currentMessage || undefined,
    progress,
    createdAt: job.createdAt,
    startedAt: job.startedAt || undefined,
    completedAt: job.completedAt || undefined,
    error: job.error || undefined,
    canCancel: status === 'queued' || status === 'running',
    canRetry: false,
    libraryId: job.libraryId,
    _raw: job,
  };
}

function convertRatingSyncJob(job: {
  jobId: string;
  status: string;
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
}): UnifiedJob {
  const status = mapRatingSyncStatus(job.status);
  const progress =
    job.totalItems > 0
      ? Math.round((job.processedItems / job.totalItems) * 100)
      : undefined;

  return {
    id: job.jobId,
    type: 'rating-sync',
    status,
    title: 'Rating Sync',
    subtitle: `${job.processedItems}/${job.totalItems} items`,
    progress,
    createdAt: new Date(), // RatingSyncJob doesn't expose createdAt in getJobs
    canCancel: status === 'queued' || status === 'running',
    canRetry: false,
    _raw: job,
  };
}

function convertBatch(batch: BatchProgress): UnifiedJob {
  const status = mapBatchStatus(batch.status);

  const typeLabels: Record<string, string> = {
    convert: 'Convert to CBZ',
    rename: 'Rename Files',
    move: 'Move Files',
    delete: 'Delete Files',
    metadata_update: 'Update Metadata',
    template_rename: 'Template Rename',
    restore_original: 'Restore Original Names',
  };

  return {
    id: batch.id,
    type: 'batch',
    status,
    title: typeLabels[batch.type] || `Batch ${batch.type}`,
    subtitle: `${batch.completedItems}/${batch.totalItems} files`,
    progress: batch.progress,
    createdAt: batch.startedAt || new Date(),
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    error: batch.errors.length > 0 ? `${batch.errors.length} errors` : undefined,
    canCancel: status === 'running',
    canRetry: status === 'completed' && batch.failedItems > 0,
    batchType: batch.type as UnifiedJob['batchType'],
    stats: {
      total: batch.totalItems,
      completed: batch.completedItems,
      failed: batch.failedItems,
      pending: batch.totalItems - batch.completedItems - batch.failedItems,
    },
    _raw: batch,
  };
}

// =============================================================================
// Main Aggregation
// =============================================================================

export interface GetJobsOptions {
  status?: 'active' | 'completed' | 'all';
  types?: UnifiedJobType[];
  limit?: number;
}

export async function getAggregatedJobs(
  options: GetJobsOptions = {}
): Promise<AggregatedJobsResponse> {
  const { status = 'all', types, limit = 50 } = options;
  const db = getDatabase();

  const active: UnifiedJob[] = [];
  const history: UnifiedJob[] = [];

  try {
    // Get library names for scan jobs
    const libraries = await db.library.findMany({
      select: { id: true, name: true },
    });
    const libraryMap = new Map(libraries.map((l) => [l.id, l.name]));

    // Aggregate from each source
    const shouldInclude = (type: UnifiedJobType) => !types || types.includes(type);

    // 1. Metadata Jobs
    if (shouldInclude('metadata')) {
      try {
        const metadataJobs = await listMetadataJobs();
        for (const job of metadataJobs) {
          const unified = convertMetadataJob(job);
          if (unified.status === 'queued' || unified.status === 'running') {
            active.push(unified);
          } else if (status !== 'active') {
            history.push(unified);
          }
        }
      } catch (err) {
        logger.error({ err }, 'Failed to fetch metadata jobs');
      }
    }

    // 2. Library Scan Jobs
    if (shouldInclude('library-scan')) {
      try {
        const scanJobs = await listActiveScanJobs();
        for (const job of scanJobs) {
          const libraryName = libraryMap.get(job.libraryId);
          const unified = convertScanJob(job, libraryName);
          if (unified.status === 'queued' || unified.status === 'running') {
            active.push(unified);
          } else if (status !== 'active') {
            history.push(unified);
          }
        }

        // Also get recent completed scan jobs for history
        if (status !== 'active') {
          const recentScans = await db.libraryScanJob.findMany({
            where: {
              status: { in: ['complete', 'error', 'cancelled'] },
            },
            orderBy: { completedAt: 'desc' },
            take: limit,
            include: {
              library: { select: { name: true } },
            },
          });

          for (const scan of recentScans) {
            const unified = convertScanJob(
              {
                ...scan,
                logs: {},
              } as LibraryScanJobData,
              scan.library?.name
            );
            history.push(unified);
          }
        }
      } catch (err) {
        logger.error({ err }, 'Failed to fetch library scan jobs');
      }
    }

    // 3. Rating Sync Jobs
    if (shouldInclude('rating-sync')) {
      try {
        const ratingSyncJobs = await getRatingSyncJobs({ limit });
        for (const job of ratingSyncJobs) {
          const unified = convertRatingSyncJob(job);
          if (unified.status === 'queued' || unified.status === 'running') {
            active.push(unified);
          } else if (status !== 'active') {
            history.push(unified);
          }
        }
      } catch (err) {
        logger.error({ err }, 'Failed to fetch rating sync jobs');
      }
    }

    // 4. Review Sync Jobs (similar pattern to rating sync)
    if (shouldInclude('review-sync')) {
      try {
        const reviewSyncJobs = await db.reviewSyncJob.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        for (const job of reviewSyncJobs) {
          const jobStatus = mapRatingSyncStatus(job.status);
          const progress =
            job.totalItems > 0
              ? Math.round((job.processedItems / job.totalItems) * 100)
              : undefined;

          const unified: UnifiedJob = {
            id: job.id,
            type: 'review-sync',
            status: jobStatus,
            title: 'Review Sync',
            subtitle: `${job.processedItems}/${job.totalItems} items`,
            progress,
            createdAt: job.createdAt,
            startedAt: job.startedAt || undefined,
            completedAt: job.completedAt || undefined,
            error: job.error || undefined,
            canCancel: jobStatus === 'queued' || jobStatus === 'running',
            canRetry: false,
            _raw: job,
          };

          if (unified.status === 'queued' || unified.status === 'running') {
            active.push(unified);
          } else if (status !== 'active') {
            history.push(unified);
          }
        }
      } catch (err) {
        logger.error({ err }, 'Failed to fetch review sync jobs');
      }
    }

    // 5. Similarity Jobs
    if (shouldInclude('similarity')) {
      try {
        const similarityJobs = await db.similarityJob.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        for (const job of similarityJobs) {
          const jobStatus = mapRatingSyncStatus(job.status);
          const progress =
            job.totalPairs > 0
              ? Math.round((job.processedPairs / job.totalPairs) * 100)
              : undefined;

          const unified: UnifiedJob = {
            id: job.id,
            type: 'similarity',
            status: jobStatus,
            title: job.type === 'full' ? 'Similarity Rebuild' : 'Similarity Update',
            subtitle: `${job.processedPairs}/${job.totalPairs} pairs`,
            progress,
            createdAt: job.createdAt,
            startedAt: job.startedAt || undefined,
            completedAt: job.completedAt || undefined,
            error: job.error || undefined,
            canCancel: false,
            canRetry: false,
            _raw: job,
          };

          if (unified.status === 'queued' || unified.status === 'running') {
            active.push(unified);
          } else if (status !== 'active') {
            history.push(unified);
          }
        }
      } catch (err) {
        logger.error({ err }, 'Failed to fetch similarity jobs');
      }
    }

    // 6. Batch Operations
    if (shouldInclude('batch')) {
      try {
        // Get active batch
        const activeBatchId = getActiveBatchId();
        if (activeBatchId) {
          const activeBatch = await getBatch(activeBatchId);
          if (activeBatch) {
            const unified = convertBatch(activeBatch);
            active.push(unified);
          }
        }

        // Get interrupted batches
        const interrupted = await findInterruptedBatches();
        for (const batch of interrupted) {
          if (batch.id !== activeBatchId) {
            const unified = convertBatch(batch);
            active.push(unified);
          }
        }

        // Get recent completed batches for history
        if (status !== 'active') {
          const recent = await getRecentBatches(limit);
          for (const batch of recent) {
            if (batch.id !== activeBatchId && !interrupted.some(i => i.id === batch.id)) {
              const unified = convertBatch(batch);
              if (unified.status === 'queued' || unified.status === 'running' || unified.status === 'interrupted') {
                // Should already be in active, skip
              } else {
                history.push(unified);
              }
            }
          }
        }
      } catch (err) {
        logger.error({ err }, 'Failed to fetch batch operations');
      }
    }

    // Sort active by creation date (newest first)
    active.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Sort history by completion/creation date (newest first)
    history.sort((a, b) => {
      const aDate = a.completedAt || a.createdAt;
      const bDate = b.completedAt || b.createdAt;
      return bDate.getTime() - aDate.getTime();
    });

    // Limit history
    const limitedHistory = history.slice(0, limit);

    // Get scheduler statuses
    const schedulers = getSchedulerStatuses();

    // Calculate counts
    const counts = {
      active: active.length,
      queued: active.filter((j) => j.status === 'queued').length,
      running: active.filter((j) => j.status === 'running').length,
    };

    return {
      active,
      history: limitedHistory,
      schedulers,
      counts,
    };
  } catch (err) {
    logger.error({ err }, 'Failed to aggregate jobs');
    throw err;
  }
}

// =============================================================================
// Scheduler Status
// =============================================================================

function getSchedulerStatuses(): SchedulerStatus[] {
  const schedulers: SchedulerStatus[] = [];

  try {
    const statsStatus = getStatsSchedulerStatus();
    schedulers.push({
      id: 'stats',
      name: 'Stats Aggregation',
      enabled: statsStatus.isRunning,
      isRunning: statsStatus.isProcessing,
      lastRun: statsStatus.lastHourlyRun || undefined,
    });
  } catch {
    // Stats scheduler not available
  }

  try {
    const ratingStatus = getRatingSyncSchedulerStatus();
    schedulers.push({
      id: 'rating-sync',
      name: 'Rating Sync',
      enabled: ratingStatus.isRunning,
      isRunning: ratingStatus.isRunning,
      lastRun: ratingStatus.lastRunAt || undefined,
      nextRun: ratingStatus.nextRunAt || undefined,
    });
  } catch {
    // Rating sync scheduler not available
  }

  try {
    const similarityStatus = getSimilaritySchedulerStatus();
    schedulers.push({
      id: 'similarity',
      name: 'Similarity',
      enabled: similarityStatus.isRunning,
      isRunning: similarityStatus.isProcessing,
      lastRun: similarityStatus.lastNightlyRun || undefined,
    });
  } catch {
    // Similarity scheduler not available
  }

  return schedulers;
}

// =============================================================================
// Get Active Count (for sidebar badge)
// =============================================================================

export async function getActiveJobCount(): Promise<number> {
  const result = await getAggregatedJobs({ status: 'active' });
  return result.counts.active;
}

// =============================================================================
// Get Job Details
// =============================================================================

export async function getJobDetails(
  type: UnifiedJobType,
  id: string
): Promise<UnifiedJobDetails | null> {
  const db = getDatabase();

  try {
    switch (type) {
      case 'metadata': {
        const job = await getMetadataJob(id);
        if (!job) return null;

        // Flatten logs from step-grouped format
        const logs: UnifiedJobLog[] = [];
        for (const [step, stepLogs] of Object.entries(job.logs)) {
          for (const log of stepLogs) {
            logs.push({
              id: log.id,
              stage: step,
              message: log.message,
              detail: log.detail,
              type: log.type,
              timestamp: log.timestamp,
            });
          }
        }

        // Sort by timestamp descending (newest first)
        logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        const unified = convertMetadataJob(job);
        return {
          ...unified,
          logs: logs.slice(0, 1000),
        };
      }

      case 'library-scan': {
        const job = await getScanJob(id);
        if (!job) return null;

        // Flatten logs from stage-grouped format
        const logs: UnifiedJobLog[] = [];
        for (const [stage, stageLogs] of Object.entries(job.logs)) {
          for (const log of stageLogs) {
            logs.push({
              id: log.id,
              stage,
              message: log.message,
              detail: log.detail,
              type: log.type,
              timestamp: log.timestamp,
            });
          }
        }

        // Sort by timestamp descending (newest first)
        logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        // Get library name
        const library = await db.library.findUnique({
          where: { id: job.libraryId },
          select: { name: true },
        });

        const unified = convertScanJob(job, library?.name);
        return {
          ...unified,
          logs: logs.slice(0, 1000),
        };
      }

      case 'rating-sync': {
        const job = await db.ratingSyncJob.findUnique({
          where: { id },
        });
        if (!job) return null;

        const unified: UnifiedJob = {
          id: job.id,
          type: 'rating-sync',
          status: mapRatingSyncStatus(job.status),
          title: 'Rating Sync',
          subtitle: `${job.processedItems}/${job.totalItems} items`,
          progress: job.totalItems > 0
            ? Math.round((job.processedItems / job.totalItems) * 100)
            : undefined,
          createdAt: job.createdAt,
          startedAt: job.startedAt || undefined,
          completedAt: job.completedAt || undefined,
          error: job.error || undefined,
          canCancel: job.status === 'pending' || job.status === 'processing',
          canRetry: false,
        };

        return { ...unified, logs: [] };
      }

      case 'review-sync': {
        const job = await db.reviewSyncJob.findUnique({
          where: { id },
        });
        if (!job) return null;

        const unified: UnifiedJob = {
          id: job.id,
          type: 'review-sync',
          status: mapRatingSyncStatus(job.status),
          title: 'Review Sync',
          subtitle: `${job.processedItems}/${job.totalItems} items`,
          progress: job.totalItems > 0
            ? Math.round((job.processedItems / job.totalItems) * 100)
            : undefined,
          createdAt: job.createdAt,
          startedAt: job.startedAt || undefined,
          completedAt: job.completedAt || undefined,
          error: job.error || undefined,
          canCancel: job.status === 'pending' || job.status === 'processing',
          canRetry: false,
        };

        return { ...unified, logs: [] };
      }

      case 'similarity': {
        const job = await db.similarityJob.findUnique({
          where: { id },
        });
        if (!job) return null;

        const unified: UnifiedJob = {
          id: job.id,
          type: 'similarity',
          status: mapRatingSyncStatus(job.status),
          title: job.type === 'full' ? 'Similarity Rebuild' : 'Similarity Update',
          subtitle: `${job.processedPairs}/${job.totalPairs} pairs`,
          progress: job.totalPairs > 0
            ? Math.round((job.processedPairs / job.totalPairs) * 100)
            : undefined,
          createdAt: job.createdAt,
          startedAt: job.startedAt || undefined,
          completedAt: job.completedAt || undefined,
          error: job.error || undefined,
          canCancel: false,
          canRetry: false,
        };

        return { ...unified, logs: [] };
      }

      case 'batch': {
        const batch = await getBatch(id);
        if (!batch) return null;

        // Get operations for this batch
        const operations = await db.operationLog.findMany({
          where: { batchId: id },
          orderBy: { timestamp: 'desc' },
          take: 1000,
        });

        const unified = convertBatch(batch);
        return {
          ...unified,
          operations: operations.map(op => ({
            id: op.id,
            operation: op.operation,
            source: op.source,
            destination: op.destination,
            status: op.status as 'pending' | 'success' | 'failed',
            error: op.error,
            timestamp: op.timestamp,
          })),
        };
      }

      case 'download': {
        // Download jobs don't have structured logs yet
        // Return null as download handling is not implemented
        return null;
      }

      default:
        return null;
    }
  } catch (err) {
    logger.error({ err, type, id }, 'Failed to get job details');
    return null;
  }
}

// =============================================================================
// Exports
// =============================================================================

export const JobAggregatorService = {
  getAggregatedJobs,
  getActiveJobCount,
  getJobDetails,
};

export default JobAggregatorService;
