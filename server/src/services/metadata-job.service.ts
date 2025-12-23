/**
 * Metadata Job Service
 *
 * Provides persistent job management for metadata approval workflows.
 * Jobs are stored in the database and can be resumed after browser refresh
 * or server restart.
 */

import { getDatabase } from './database.service.js';
import {
  createSessionWithProgress,
  getSession,
  restoreSession,
  deleteSession,
  searchSeriesCustom,
  loadMoreSeriesResults,
  approveSeries,
  skipSeries,
  getAvailableIssuesForFile,
  manualSelectIssue,
  updateFieldApprovals,
  rejectFile,
  acceptAllFiles,
  rejectAllFiles,
  applyChanges,
  type ApprovalSession,
  type CreateSessionOptions,
  type ProgressCallback,
  type SeriesMatch,
  type FileChange,
} from './metadata-approval.service.js';
import type { MetadataSource } from './metadata-providers/types.js';
import { LRUCache } from './lru-cache.service.js';

// =============================================================================
// Types
// =============================================================================

export type JobStatus =
  | 'options'
  | 'initializing'
  | 'series_approval'
  | 'fetching_issues'
  | 'file_review'
  | 'applying'
  | 'complete'
  | 'cancelled'
  | 'error';

export interface JobLogEntry {
  id: string;
  step: string;
  message: string;
  detail?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
}

export interface MetadataJobData {
  id: string;
  status: JobStatus;
  step: string;
  fileIds: string[];
  options: CreateSessionOptions;
  session: ApprovalSession | null;
  currentSeriesIndex: number;
  totalFiles: number;
  processedFiles: number;
  error: string | null;
  applyResult: ApplyResult | null;
  createdAt: Date;
  updatedAt: Date;
  logs: Record<string, JobLogEntry[]>;
  // Progress snapshot for real-time display on reconnect
  currentProgressMessage: string | null;
  currentProgressDetail: string | null;
  lastProgressAt: Date | null;
}

export interface ApplyResult {
  total: number;
  successful: number;
  failed: number;
  converted: number;
  conversionFailed: number;
  results: Array<{ fileId: string; filename: string; success: boolean; error?: string; converted?: boolean }>;
}

// =============================================================================
// Constants
// =============================================================================

const JOB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// In-Memory Session Cache (LRU with bounded size)
// =============================================================================

// We keep active sessions in memory for performance, but persist state to DB
// LRU cache ensures memory stays bounded even with many concurrent sessions
// Note: No onEvict callback - session data persists in DB and can be restored
const activeJobs = new LRUCache<ApprovalSession>({
  maxSize: 50, // Max 50 active sessions in memory
  defaultTTL: JOB_TTL_MS, // 24 hours
});

// =============================================================================
// Helper Functions
// =============================================================================

function parseJsonSafe<T>(json: string | null, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}

// =============================================================================
// TTL Management
// =============================================================================

/**
 * Extend job expiration on user activity.
 * This prevents jobs from expiring while users are actively working on them.
 */
export async function touchJob(jobId: string): Promise<void> {
  const prisma = getDatabase();
  await prisma.metadataJob.update({
    where: { id: jobId },
    data: {
      expiresAt: new Date(Date.now() + JOB_TTL_MS),
      updatedAt: new Date(),
    },
  });

  // Also refresh the LRU cache entry TTL if present
  const session = activeJobs.get(jobId);
  if (session) {
    activeJobs.set(jobId, session); // Refreshes TTL in cache
  }
}

/**
 * Clean up expired jobs from the database.
 * Should be called on server startup.
 */
export async function cleanupExpiredJobs(): Promise<number> {
  const prisma = getDatabase();

  try {
    // Delete expired jobs (cascade deletes logs via Prisma relation)
    const result = await prisma.metadataJob.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (result.count > 0) {
      console.log(`Cleaned up ${result.count} expired metadata job(s)`);
    }

    return result.count;
  } catch (error) {
    console.error('Failed to cleanup expired jobs:', error);
    return 0;
  }
}

// =============================================================================
// Job Management
// =============================================================================

/**
 * Create a new metadata job
 */
export async function createJob(fileIds: string[]): Promise<string> {
  const prisma = getDatabase();
  const now = new Date();

  const job = await prisma.metadataJob.create({
    data: {
      fileIds: JSON.stringify(fileIds),
      options: '{}',
      status: 'options',
      step: 'options',
      totalFiles: fileIds.length,
      processedFiles: 0,
      currentSeriesIndex: 0,
      expiresAt: new Date(now.getTime() + JOB_TTL_MS),
    },
  });

  return job.id;
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<MetadataJobData | null> {
  const prisma = getDatabase();

  const job = await prisma.metadataJob.findUnique({
    where: { id: jobId },
    include: {
      logs: {
        orderBy: { timestamp: 'asc' },
      },
    },
  });

  if (!job) return null;

  // Check if expired
  if (job.expiresAt < new Date()) {
    await prisma.metadataJob.delete({ where: { id: jobId } });
    return null;
  }

  // Get session from memory or reconstruct from DB
  let session = activeJobs.get(jobId) || null;
  if (!session && job.sessionData) {
    session = parseJsonSafe<ApprovalSession | null>(job.sessionData, null);
  }

  // Organize logs by step
  const logsByStep: Record<string, JobLogEntry[]> = {};
  for (const log of job.logs) {
    const stepLogs = logsByStep[log.step] ?? (logsByStep[log.step] = []);
    stepLogs.push({
      id: log.id,
      step: log.step,
      message: log.message,
      detail: log.detail || undefined,
      type: log.type as 'info' | 'success' | 'warning' | 'error',
      timestamp: log.timestamp,
    });
  }

  return {
    id: job.id,
    status: job.status as JobStatus,
    step: job.step,
    fileIds: parseJsonSafe<string[]>(job.fileIds, []),
    options: parseJsonSafe<CreateSessionOptions>(job.options, {}),
    session,
    currentSeriesIndex: job.currentSeriesIndex,
    totalFiles: job.totalFiles,
    processedFiles: job.processedFiles,
    error: job.error,
    applyResult: parseJsonSafe<ApplyResult | null>(job.applyResult, null),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    logs: logsByStep,
    currentProgressMessage: job.currentProgressMessage,
    currentProgressDetail: job.currentProgressDetail,
    lastProgressAt: job.lastProgressAt,
  };
}

/**
 * List all active jobs
 */
export async function listJobs(): Promise<MetadataJobData[]> {
  const prisma = getDatabase();
  const now = new Date();

  // Clean up expired jobs first
  await prisma.metadataJob.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  const jobs = await prisma.metadataJob.findMany({
    where: {
      status: { notIn: ['complete', 'cancelled', 'error'] },
    },
    include: {
      logs: {
        orderBy: { timestamp: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return jobs.map((job) => {
    const logsByStep: Record<string, JobLogEntry[]> = {};
    for (const log of job.logs) {
      const stepLogs = logsByStep[log.step] ?? (logsByStep[log.step] = []);
      stepLogs.push({
        id: log.id,
        step: log.step,
        message: log.message,
        detail: log.detail || undefined,
        type: log.type as 'info' | 'success' | 'warning' | 'error',
        timestamp: log.timestamp,
      });
    }

    return {
      id: job.id,
      status: job.status as JobStatus,
      step: job.step,
      fileIds: parseJsonSafe<string[]>(job.fileIds, []),
      options: parseJsonSafe<CreateSessionOptions>(job.options, {}),
      session: activeJobs.get(job.id) || parseJsonSafe<ApprovalSession | null>(job.sessionData, null),
      currentSeriesIndex: job.currentSeriesIndex,
      totalFiles: job.totalFiles,
      processedFiles: job.processedFiles,
      error: job.error,
      applyResult: parseJsonSafe<ApplyResult | null>(job.applyResult, null),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      logs: logsByStep,
      currentProgressMessage: job.currentProgressMessage,
      currentProgressDetail: job.currentProgressDetail,
      lastProgressAt: job.lastProgressAt,
    };
  });
}

/**
 * List all jobs (including completed)
 */
export async function listAllJobs(): Promise<MetadataJobData[]> {
  const prisma = getDatabase();
  const now = new Date();

  // Clean up expired jobs first
  await prisma.metadataJob.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  const jobs = await prisma.metadataJob.findMany({
    include: {
      logs: {
        orderBy: { timestamp: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50, // Limit to recent jobs
  });

  return jobs.map((job) => {
    const logsByStep: Record<string, JobLogEntry[]> = {};
    for (const log of job.logs) {
      const stepLogs = logsByStep[log.step] ?? (logsByStep[log.step] = []);
      stepLogs.push({
        id: log.id,
        step: log.step,
        message: log.message,
        detail: log.detail || undefined,
        type: log.type as 'info' | 'success' | 'warning' | 'error',
        timestamp: log.timestamp,
      });
    }

    return {
      id: job.id,
      status: job.status as JobStatus,
      step: job.step,
      fileIds: parseJsonSafe<string[]>(job.fileIds, []),
      options: parseJsonSafe<CreateSessionOptions>(job.options, {}),
      session: activeJobs.get(job.id) || parseJsonSafe<ApprovalSession | null>(job.sessionData, null),
      currentSeriesIndex: job.currentSeriesIndex,
      totalFiles: job.totalFiles,
      processedFiles: job.processedFiles,
      error: job.error,
      applyResult: parseJsonSafe<ApplyResult | null>(job.applyResult, null),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      logs: logsByStep,
      currentProgressMessage: job.currentProgressMessage,
      currentProgressDetail: job.currentProgressDetail,
      lastProgressAt: job.lastProgressAt,
    };
  });
}

/**
 * Update job options
 */
export async function updateJobOptions(
  jobId: string,
  options: CreateSessionOptions
): Promise<void> {
  const prisma = getDatabase();
  await prisma.metadataJob.update({
    where: { id: jobId },
    data: { options: JSON.stringify(options) },
  });
}

/**
 * Add a log entry to a job and update progress snapshot
 */
export async function addJobLog(
  jobId: string,
  step: string,
  message: string,
  detail?: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
): Promise<void> {
  const prisma = getDatabase();
  const now = new Date();

  // Use transaction to update both log and progress snapshot atomically
  await prisma.$transaction([
    prisma.metadataJobLog.create({
      data: {
        jobId,
        step,
        message,
        detail,
        type,
      },
    }),
    prisma.metadataJob.update({
      where: { id: jobId },
      data: {
        currentProgressMessage: message,
        currentProgressDetail: detail,
        lastProgressAt: now,
      },
    }),
  ]);
}

/**
 * Start the job (begin session creation)
 */
export async function startJob(
  jobId: string,
  onProgress?: ProgressCallback
): Promise<ApprovalSession> {
  const prisma = getDatabase();
  const job = await prisma.metadataJob.findUnique({ where: { id: jobId } });

  if (!job) throw new Error('Job not found');

  const fileIds = parseJsonSafe<string[]>(job.fileIds, []);
  const options = parseJsonSafe<CreateSessionOptions>(job.options, {});

  // Update status to initializing
  await prisma.metadataJob.update({
    where: { id: jobId },
    data: { status: 'initializing', step: 'initializing' },
  });

  // Create progress callback that also saves to DB
  const progressWithPersist: ProgressCallback = async (message, detail) => {
    await addJobLog(jobId, 'initializing', message, detail, 'info');
    onProgress?.(message, detail);
  };

  try {
    // Create the session
    const session = await createSessionWithProgress(fileIds, options, progressWithPersist);

    // Store session in memory and DB
    activeJobs.set(jobId, session);

    await prisma.metadataJob.update({
      where: { id: jobId },
      data: {
        status: session.status,
        step: session.status,
        sessionData: JSON.stringify(session),
        currentSeriesIndex: session.currentSeriesIndex,
      },
    });

    await addJobLog(jobId, 'initializing', 'Session created successfully', undefined, 'success');

    return session;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await prisma.metadataJob.update({
      where: { id: jobId },
      data: {
        status: 'error',
        step: 'error',
        error: errorMessage,
      },
    });
    await addJobLog(jobId, 'initializing', 'Session creation failed', errorMessage, 'error');
    throw error;
  }
}

/**
 * Sync session state to database
 */
async function syncSessionToDb(jobId: string, session: ApprovalSession): Promise<void> {
  const prisma = getDatabase();
  await prisma.metadataJob.update({
    where: { id: jobId },
    data: {
      status: session.status,
      step: session.status,
      sessionData: JSON.stringify(session),
      currentSeriesIndex: session.currentSeriesIndex,
    },
  });
}

/**
 * Ensure the session is available in memory before operating on it.
 * This restores the session from the job's stored data if needed.
 */
function ensureSessionInMemory(job: MetadataJobData): void {
  if (!job.session) {
    throw new Error('Job session not found');
  }

  // Check if session exists in memory
  const existingSession = getSession(job.session.id);
  if (!existingSession) {
    // Session not in memory (expired or server restarted), restore it
    restoreSession(job.session);
  }
}

/**
 * Search with custom query (wrapper)
 * @param jobId - The job ID
 * @param query - The search query string
 * @param source - Optional specific source to search (if not provided, searches all configured sources)
 */
export async function jobSearchSeriesCustom(
  jobId: string,
  query: string,
  source?: MetadataSource
): Promise<SeriesMatch[]> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Extend job expiration on user activity
  await touchJob(jobId);

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  const results = await searchSeriesCustom(job.session.id, query, source);

  // Sync session state
  const updatedSession = getSession(job.session.id);
  if (updatedSession) {
    activeJobs.set(jobId, updatedSession);
    await syncSessionToDb(jobId, updatedSession);
  }

  const sourceInfo = source ? ` (${source})` : '';
  await addJobLog(jobId, 'series_approval', `Custom search: "${query}"${sourceInfo}`, `${results.length} results`);

  return results;
}

/**
 * Load more search results for current series (wrapper)
 * @param jobId - The job ID
 */
export async function jobLoadMoreSeriesResults(
  jobId: string
): Promise<SeriesMatch[]> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Extend job expiration on user activity
  await touchJob(jobId);

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  const results = await loadMoreSeriesResults(job.session.id);

  // Sync session state
  const updatedSession = getSession(job.session.id);
  if (updatedSession) {
    activeJobs.set(jobId, updatedSession);
    await syncSessionToDb(jobId, updatedSession);
  }

  await addJobLog(jobId, 'series_approval', `Loaded more results`, `${results.length} additional results`);

  return results;
}

/**
 * Approve series (wrapper)
 */
export async function jobApproveSeries(
  jobId: string,
  selectedSeriesId: string,
  issueMatchingSeriesId?: string,
  applyToRemaining?: boolean
): Promise<{ hasMore: boolean; nextIndex: number }> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Extend job expiration on user activity
  await touchJob(jobId);

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  // Create progress callback to log file matching progress
  const onProgress = async (message: string, detail?: string) => {
    await addJobLog(jobId, 'fetching_issues', message, detail, 'info');
  };

  const result = await approveSeries(job.session.id, selectedSeriesId, issueMatchingSeriesId, applyToRemaining, onProgress);

  // Sync session state
  const updatedSession = getSession(job.session.id);
  if (updatedSession) {
    activeJobs.set(jobId, updatedSession);
    await syncSessionToDb(jobId, updatedSession);
    const logDetail = applyToRemaining
      ? 'Auto-approved remaining series'
      : `Moving to ${result.hasMore ? 'next series' : 'file review'}`;
    await addJobLog(
      jobId,
      'series_approval',
      `Series approved`,
      logDetail,
      'success'
    );
  }

  return result;
}

/**
 * Skip series (wrapper)
 */
export async function jobSkipSeries(
  jobId: string
): Promise<{ hasMore: boolean; nextIndex: number }> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Extend job expiration on user activity
  await touchJob(jobId);

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  // Create progress callback to log file matching progress
  const onProgress = async (message: string, detail?: string) => {
    await addJobLog(jobId, 'fetching_issues', message, detail, 'info');
  };

  const result = await skipSeries(job.session.id, onProgress);

  // Sync session state
  const updatedSession = getSession(job.session.id);
  if (updatedSession) {
    activeJobs.set(jobId, updatedSession);
    await syncSessionToDb(jobId, updatedSession);
    await addJobLog(jobId, 'series_approval', 'Series skipped', undefined, 'info');
  }

  return result;
}

/**
 * Navigate to a series group for re-selection without clearing current selection (wrapper)
 * Used when user wants to review/change series - keeps current match visible.
 */
export async function jobNavigateToSeriesGroup(
  jobId: string,
  seriesGroupIndex: number
): Promise<ApprovalSession> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Extend job expiration on user activity
  await touchJob(jobId);

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  const { navigateToSeriesGroup } = await import('./metadata-approval.service.js');
  const session = await navigateToSeriesGroup(job.session.id, seriesGroupIndex);

  // Sync session state
  activeJobs.set(jobId, session);
  await syncSessionToDb(jobId, session);
  await addJobLog(
    jobId,
    'series_approval',
    'Navigated to series selection',
    `Reviewing series group ${seriesGroupIndex}`,
    'info'
  );

  return session;
}

/**
 * Reset a series group to allow re-selection and clear current match (wrapper)
 */
export async function jobResetSeriesGroup(
  jobId: string,
  seriesGroupIndex: number
): Promise<ApprovalSession> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Extend job expiration on user activity
  await touchJob(jobId);

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  const { resetSeriesGroup } = await import('./metadata-approval.service.js');
  const session = await resetSeriesGroup(job.session.id, seriesGroupIndex);

  // Sync session state
  activeJobs.set(jobId, session);
  await syncSessionToDb(jobId, session);
  await addJobLog(
    jobId,
    'series_approval',
    'Series reset for re-selection',
    `Returning to series group ${seriesGroupIndex}`,
    'info'
  );

  return session;
}

/**
 * Get available issues for manual selection (wrapper)
 */
export async function jobGetAvailableIssuesForFile(
  jobId: string,
  fileId: string
): Promise<{
  seriesName: string;
  source: 'comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal';
  sourceId: string;
  issues: Awaited<ReturnType<typeof getAvailableIssuesForFile>>['issues'];
  totalCount: number;
  currentMatchedIssueId: string | null;
}> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  return getAvailableIssuesForFile(job.session.id, fileId);
}

/**
 * Manual select issue (wrapper)
 */
export async function jobManualSelectIssue(
  jobId: string,
  fileId: string,
  issueSource: 'comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal',
  issueId: string
): Promise<FileChange> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  const result = await manualSelectIssue(job.session.id, fileId, issueSource, issueId);

  // Sync session state
  const updatedSession = getSession(job.session.id);
  if (updatedSession) {
    activeJobs.set(jobId, updatedSession);
    await syncSessionToDb(jobId, updatedSession);
  }

  return result;
}

/**
 * Update field approvals (wrapper)
 */
export async function jobUpdateFieldApprovals(
  jobId: string,
  fileId: string,
  fieldUpdates: Record<string, { approved?: boolean; editedValue?: string | number }>
): Promise<FileChange> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Extend job expiration on user activity
  await touchJob(jobId);

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  const result = updateFieldApprovals(job.session.id, fileId, fieldUpdates);

  // Sync session state
  const updatedSession = getSession(job.session.id);
  if (updatedSession) {
    activeJobs.set(jobId, updatedSession);
    await syncSessionToDb(jobId, updatedSession);
  }

  return result;
}

/**
 * Reject file (wrapper)
 */
export async function jobRejectFile(jobId: string, fileId: string): Promise<FileChange> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  const result = rejectFile(job.session.id, fileId);

  // Sync session state
  const updatedSession = getSession(job.session.id);
  if (updatedSession) {
    activeJobs.set(jobId, updatedSession);
    await syncSessionToDb(jobId, updatedSession);
  }

  return result;
}

/**
 * Accept all files (wrapper)
 */
export async function jobAcceptAllFiles(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Extend job expiration on user activity
  await touchJob(jobId);

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  acceptAllFiles(job.session.id);

  // Sync session state
  const updatedSession = getSession(job.session.id);
  if (updatedSession) {
    activeJobs.set(jobId, updatedSession);
    await syncSessionToDb(jobId, updatedSession);
  }
}

/**
 * Reject all files (wrapper)
 */
export async function jobRejectAllFiles(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Extend job expiration on user activity
  await touchJob(jobId);

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  rejectAllFiles(job.session.id);

  // Sync session state
  const updatedSession = getSession(job.session.id);
  if (updatedSession) {
    activeJobs.set(jobId, updatedSession);
    await syncSessionToDb(jobId, updatedSession);
  }
}

/**
 * Apply changes (wrapper)
 * Supports optional progress callback for real-time streaming updates.
 */
export async function jobApplyChanges(
  jobId: string,
  onProgress?: ProgressCallback
): Promise<ApplyResult> {
  const prisma = getDatabase();
  const job = await getJob(jobId);
  if (!job?.session) throw new Error('Job session not found');

  // Extend job expiration on user activity
  await touchJob(jobId);

  // Ensure session is in memory before operating
  ensureSessionInMemory(job);

  await prisma.metadataJob.update({
    where: { id: jobId },
    data: { status: 'applying', step: 'applying' },
  });

  await addJobLog(jobId, 'applying', 'Applying changes to files', undefined, 'info');

  // Create progress callback that logs to DB and streams to client
  const progressWithPersist: ProgressCallback = async (message, detail) => {
    await addJobLog(jobId, 'applying', message, detail, 'info');
    onProgress?.(message, detail);
  };

  try {
    const result = await applyChanges(job.session.id, progressWithPersist);

    await prisma.metadataJob.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        step: 'complete',
        applyResult: JSON.stringify(result),
      },
    });

    const summaryDetail = `${result.successful} successful, ${result.failed} failed${result.converted > 0 ? `, ${result.converted} converted` : ''}`;
    await addJobLog(
      jobId,
      'applying',
      'Changes applied successfully',
      summaryDetail,
      result.failed > 0 ? 'warning' : 'success'
    );

    // Clean up memory
    activeJobs.delete(jobId);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await prisma.metadataJob.update({
      where: { id: jobId },
      data: {
        status: 'error',
        step: 'error',
        error: errorMessage,
      },
    });
    await addJobLog(jobId, 'applying', 'Apply failed', errorMessage, 'error');
    throw error;
  }
}

/**
 * Cancel a job (keeps the job record but marks as cancelled)
 */
export async function cancelJob(jobId: string): Promise<void> {
  const prisma = getDatabase();
  const job = await getJob(jobId);

  if (job?.session) {
    try {
      deleteSession(job.session.id);
    } catch {
      // Ignore errors on cancel
    }
  }

  await prisma.metadataJob.update({
    where: { id: jobId },
    data: { status: 'cancelled', step: 'cancelled' },
  });

  await addJobLog(jobId, job?.step || 'cancelled', 'Job cancelled', undefined, 'warning');

  activeJobs.delete(jobId);
}

/**
 * Abandon a job completely - cancel, cleanup, and delete all traces
 */
export async function abandonJob(jobId: string): Promise<{ success: boolean; message: string }> {
  const prisma = getDatabase();
  const job = await getJob(jobId);

  if (!job) {
    return { success: false, message: 'Job not found' };
  }

  // 1. Delete the underlying approval session if it exists
  if (job.session) {
    try {
      deleteSession(job.session.id);
    } catch {
      // Continue cleanup even if session deletion fails
    }
  }

  // 2. Clear from in-memory cache
  activeJobs.delete(jobId);

  // 3. Delete all job logs
  await prisma.metadataJobLog.deleteMany({
    where: { jobId },
  });

  // 4. Delete the job record completely
  await prisma.metadataJob.delete({
    where: { id: jobId },
  });

  return { success: true, message: 'Job abandoned and all data cleaned up' };
}

/**
 * Delete a job completely
 */
export async function deleteJob(jobId: string): Promise<void> {
  const prisma = getDatabase();
  const job = await getJob(jobId);

  if (job?.session) {
    try {
      deleteSession(job.session.id);
    } catch {
      // Ignore errors
    }
  }

  await prisma.metadataJob.delete({ where: { id: jobId } });
  activeJobs.delete(jobId);
}

// =============================================================================
// Export
// =============================================================================

export const MetadataJobService = {
  createJob,
  getJob,
  listJobs,
  listAllJobs,
  updateJobOptions,
  addJobLog,
  startJob,
  searchSeriesCustom: jobSearchSeriesCustom,
  approveSeries: jobApproveSeries,
  skipSeries: jobSkipSeries,
  manualSelectIssue: jobManualSelectIssue,
  updateFieldApprovals: jobUpdateFieldApprovals,
  rejectFile: jobRejectFile,
  acceptAllFiles: jobAcceptAllFiles,
  rejectAllFiles: jobRejectAllFiles,
  applyChanges: jobApplyChanges,
  cancelJob,
  abandonJob,
  deleteJob,
  touchJob,
  cleanupExpiredJobs,
};

export default MetadataJobService;
