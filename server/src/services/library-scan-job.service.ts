/**
 * Library Scan Job Service
 *
 * Provides persistent job management for full library scans.
 * Jobs are stored in the database and can be monitored for progress.
 */

import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export type ScanJobStatus =
  | 'queued'
  | 'discovering'
  | 'cleaning'
  | 'indexing'
  | 'linking'
  | 'covers'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface ScanJobLogEntry {
  id: string;
  stage: string;
  message: string;
  detail?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
}

export interface LibraryScanJobData {
  id: string;
  libraryId: string;
  status: ScanJobStatus;
  currentStage: string;
  currentMessage: string | null;
  currentDetail: string | null;

  // Progress counters
  discoveredFiles: number;
  orphanedFiles: number;
  indexedFiles: number;
  linkedFiles: number;
  seriesCreated: number;
  coversExtracted: number;
  totalFiles: number;

  // Error tracking
  error: string | null;
  errorCount: number;

  // Timing
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Logs organized by stage
  logs: Record<string, ScanJobLogEntry[]>;
}

export interface ScanJobProgress {
  discoveredFiles?: number;
  orphanedFiles?: number;
  indexedFiles?: number;
  linkedFiles?: number;
  seriesCreated?: number;
  coversExtracted?: number;
  totalFiles?: number;
  errorCount?: number;
}

export type ProgressCallback = (message: string, detail?: string) => Promise<void> | void;

// =============================================================================
// Helper Functions
// =============================================================================

function organizeLogs(
  logs: Array<{
    id: string;
    stage: string;
    message: string;
    detail: string | null;
    type: string;
    timestamp: Date;
  }>
): Record<string, ScanJobLogEntry[]> {
  const logsByStage: Record<string, ScanJobLogEntry[]> = {};
  for (const log of logs) {
    const stageLogs = logsByStage[log.stage] ?? (logsByStage[log.stage] = []);
    stageLogs.push({
      id: log.id,
      stage: log.stage,
      message: log.message,
      detail: log.detail || undefined,
      type: log.type as 'info' | 'success' | 'warning' | 'error',
      timestamp: log.timestamp,
    });
  }
  return logsByStage;
}

// =============================================================================
// Job Management
// =============================================================================

/**
 * Create a new library scan job
 */
export async function createScanJob(libraryId: string): Promise<string> {
  const prisma = getDatabase();

  // Check if there's already an active scan for this library
  const existingJob = await prisma.libraryScanJob.findFirst({
    where: {
      libraryId,
      status: { notIn: ['complete', 'error', 'cancelled'] },
    },
  });

  if (existingJob) {
    // Return existing job ID instead of creating a new one
    return existingJob.id;
  }

  const job = await prisma.libraryScanJob.create({
    data: {
      libraryId,
      status: 'queued',
      currentStage: 'queued',
    },
  });

  return job.id;
}

/**
 * Get a scan job by ID
 */
export async function getScanJob(jobId: string): Promise<LibraryScanJobData | null> {
  const prisma = getDatabase();

  const job = await prisma.libraryScanJob.findUnique({
    where: { id: jobId },
    include: {
      logs: {
        orderBy: { timestamp: 'asc' },
      },
    },
  });

  if (!job) return null;

  return {
    id: job.id,
    libraryId: job.libraryId,
    status: job.status as ScanJobStatus,
    currentStage: job.currentStage,
    currentMessage: job.currentMessage,
    currentDetail: job.currentDetail,
    discoveredFiles: job.discoveredFiles,
    orphanedFiles: job.orphanedFiles,
    indexedFiles: job.indexedFiles,
    linkedFiles: job.linkedFiles,
    seriesCreated: job.seriesCreated,
    coversExtracted: job.coversExtracted,
    totalFiles: job.totalFiles,
    error: job.error,
    errorCount: job.errorCount,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    logs: organizeLogs(job.logs),
  };
}

/**
 * Get active scan job for a library
 */
export async function getActiveScanJobForLibrary(
  libraryId: string
): Promise<LibraryScanJobData | null> {
  const prisma = getDatabase();

  const job = await prisma.libraryScanJob.findFirst({
    where: {
      libraryId,
      status: { notIn: ['complete', 'error', 'cancelled'] },
    },
    include: {
      logs: {
        orderBy: { timestamp: 'asc' },
      },
    },
  });

  if (!job) return null;

  return {
    id: job.id,
    libraryId: job.libraryId,
    status: job.status as ScanJobStatus,
    currentStage: job.currentStage,
    currentMessage: job.currentMessage,
    currentDetail: job.currentDetail,
    discoveredFiles: job.discoveredFiles,
    orphanedFiles: job.orphanedFiles,
    indexedFiles: job.indexedFiles,
    linkedFiles: job.linkedFiles,
    seriesCreated: job.seriesCreated,
    coversExtracted: job.coversExtracted,
    totalFiles: job.totalFiles,
    error: job.error,
    errorCount: job.errorCount,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    logs: organizeLogs(job.logs),
  };
}

/**
 * List all active scan jobs
 */
export async function listActiveScanJobs(): Promise<LibraryScanJobData[]> {
  const prisma = getDatabase();

  const jobs = await prisma.libraryScanJob.findMany({
    where: {
      status: { notIn: ['complete', 'error', 'cancelled'] },
    },
    include: {
      logs: {
        orderBy: { timestamp: 'asc' },
      },
      library: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return jobs.map((job) => ({
    id: job.id,
    libraryId: job.libraryId,
    status: job.status as ScanJobStatus,
    currentStage: job.currentStage,
    currentMessage: job.currentMessage,
    currentDetail: job.currentDetail,
    discoveredFiles: job.discoveredFiles,
    orphanedFiles: job.orphanedFiles,
    indexedFiles: job.indexedFiles,
    linkedFiles: job.linkedFiles,
    seriesCreated: job.seriesCreated,
    coversExtracted: job.coversExtracted,
    totalFiles: job.totalFiles,
    error: job.error,
    errorCount: job.errorCount,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    logs: organizeLogs(job.logs),
  }));
}

/**
 * List recent scan jobs for a library (including completed)
 */
export async function listScanJobsForLibrary(
  libraryId: string,
  limit = 10
): Promise<LibraryScanJobData[]> {
  const prisma = getDatabase();

  const jobs = await prisma.libraryScanJob.findMany({
    where: { libraryId },
    include: {
      logs: {
        orderBy: { timestamp: 'asc' },
        take: 50, // Limit logs per job
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return jobs.map((job) => ({
    id: job.id,
    libraryId: job.libraryId,
    status: job.status as ScanJobStatus,
    currentStage: job.currentStage,
    currentMessage: job.currentMessage,
    currentDetail: job.currentDetail,
    discoveredFiles: job.discoveredFiles,
    orphanedFiles: job.orphanedFiles,
    indexedFiles: job.indexedFiles,
    linkedFiles: job.linkedFiles,
    seriesCreated: job.seriesCreated,
    coversExtracted: job.coversExtracted,
    totalFiles: job.totalFiles,
    error: job.error,
    errorCount: job.errorCount,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    logs: organizeLogs(job.logs),
  }));
}

/**
 * Update scan job status
 */
export async function updateScanJobStatus(
  jobId: string,
  status: ScanJobStatus,
  stage?: string
): Promise<void> {
  const prisma = getDatabase();

  const data: Record<string, unknown> = { status };

  if (stage) {
    data.currentStage = stage;
  }

  if (status !== 'queued' && status !== 'complete' && status !== 'error' && status !== 'cancelled') {
    // Starting a new stage
    if (!data.startedAt) {
      const job = await prisma.libraryScanJob.findUnique({ where: { id: jobId } });
      if (job && !job.startedAt) {
        data.startedAt = new Date();
      }
    }
  }

  if (status === 'complete' || status === 'error' || status === 'cancelled') {
    data.completedAt = new Date();
  }

  await prisma.libraryScanJob.update({
    where: { id: jobId },
    data,
  });
}

/**
 * Update scan job progress counters
 */
export async function updateScanJobProgress(
  jobId: string,
  progress: ScanJobProgress
): Promise<void> {
  const prisma = getDatabase();

  await prisma.libraryScanJob.update({
    where: { id: jobId },
    data: progress,
  });
}

/**
 * Add a log entry to a scan job
 */
export async function addScanJobLog(
  jobId: string,
  stage: string,
  message: string,
  detail?: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
): Promise<void> {
  const prisma = getDatabase();

  await prisma.$transaction([
    prisma.libraryScanJobLog.create({
      data: {
        jobId,
        stage,
        message,
        detail,
        type,
      },
    }),
    prisma.libraryScanJob.update({
      where: { id: jobId },
      data: {
        currentMessage: message,
        currentDetail: detail,
      },
    }),
  ]);
}

/**
 * Mark job as errored
 */
export async function failScanJob(jobId: string, error: string): Promise<void> {
  const prisma = getDatabase();

  const job = await prisma.libraryScanJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  await prisma.libraryScanJob.update({
    where: { id: jobId },
    data: {
      status: 'error',
      error,
      completedAt: new Date(),
    },
  });

  await addScanJobLog(jobId, job.currentStage, 'Scan failed', error, 'error');
}

/**
 * Cancel a scan job
 */
export async function cancelScanJob(jobId: string): Promise<void> {
  const prisma = getDatabase();

  const job = await prisma.libraryScanJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  // Only cancel if not already complete
  if (['complete', 'error', 'cancelled'].includes(job.status)) {
    return;
  }

  await prisma.libraryScanJob.update({
    where: { id: jobId },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
    },
  });

  await addScanJobLog(jobId, job.currentStage, 'Scan cancelled by user', undefined, 'warning');
}

/**
 * Delete a scan job and its logs
 */
export async function deleteScanJob(jobId: string): Promise<void> {
  const prisma = getDatabase();

  // Logs are cascade deleted due to relation
  await prisma.libraryScanJob.delete({
    where: { id: jobId },
  });
}

/**
 * Clean up old completed scan jobs (keep last N per library)
 */
export async function cleanupOldScanJobs(keepPerLibrary = 5): Promise<number> {
  const prisma = getDatabase();

  // Get all libraries
  const libraries = await prisma.library.findMany({ select: { id: true } });
  let totalDeleted = 0;

  for (const library of libraries) {
    // Get completed jobs for this library, ordered by creation date
    const jobs = await prisma.libraryScanJob.findMany({
      where: {
        libraryId: library.id,
        status: { in: ['complete', 'error', 'cancelled'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    // Delete jobs beyond the keep limit
    const toDelete = jobs.slice(keepPerLibrary);
    if (toDelete.length > 0) {
      await prisma.libraryScanJob.deleteMany({
        where: { id: { in: toDelete.map((j) => j.id) } },
      });
      totalDeleted += toDelete.length;
    }
  }

  if (totalDeleted > 0) {
    console.log(`Cleaned up ${totalDeleted} old scan job(s)`);
  }

  return totalDeleted;
}

/**
 * Recover interrupted scan jobs (called on server startup)
 */
export async function recoverInterruptedScanJobs(): Promise<string[]> {
  const prisma = getDatabase();

  // Find jobs that were in progress when server stopped
  const interruptedJobs = await prisma.libraryScanJob.findMany({
    where: {
      status: { in: ['discovering', 'cleaning', 'indexing', 'linking', 'covers'] },
    },
  });

  const jobIds: string[] = [];

  for (const job of interruptedJobs) {
    // Mark as queued to be re-processed
    await prisma.libraryScanJob.update({
      where: { id: job.id },
      data: {
        status: 'queued',
        currentStage: 'queued',
      },
    });

    await addScanJobLog(
      job.id,
      job.currentStage,
      'Scan interrupted by server restart, re-queued',
      undefined,
      'warning'
    );

    jobIds.push(job.id);
  }

  if (jobIds.length > 0) {
    console.log(`Recovered ${jobIds.length} interrupted scan job(s)`);
  }

  return jobIds;
}

// =============================================================================
// Export
// =============================================================================

export const LibraryScanJobService = {
  createScanJob,
  getScanJob,
  getActiveScanJobForLibrary,
  listActiveScanJobs,
  listScanJobsForLibrary,
  updateScanJobStatus,
  updateScanJobProgress,
  addScanJobLog,
  failScanJob,
  cancelScanJob,
  deleteScanJob,
  cleanupOldScanJobs,
  recoverInterruptedScanJobs,
};

export default LibraryScanJobService;
