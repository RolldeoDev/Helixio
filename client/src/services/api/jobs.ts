/**
 * Unified Jobs API Service
 *
 * API functions for the unified jobs panel.
 */

import { get, post } from './shared';

// =============================================================================
// Types
// =============================================================================

export type UnifiedJobType =
  | 'metadata'
  | 'library-scan'
  | 'rating-sync'
  | 'review-sync'
  | 'similarity'
  | 'download';

export type UnifiedJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface UnifiedJob {
  id: string;
  type: UnifiedJobType;
  status: UnifiedJobStatus;
  title: string;
  subtitle?: string;
  progress?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  canCancel: boolean;
  canRetry: boolean;
}

export type UnifiedLogType = 'info' | 'success' | 'warning' | 'error';

export interface UnifiedJobLog {
  id: string;
  stage: string;
  message: string;
  detail?: string;
  type: UnifiedLogType;
  timestamp: string;
}

export interface UnifiedJobDetails extends UnifiedJob {
  logs: UnifiedJobLog[];
}

export interface JobSchedulerStatus {
  id: string;
  name: string;
  enabled: boolean;
  isRunning: boolean;
  lastRun?: string;
  nextRun?: string;
}

export interface AggregatedJobsResponse {
  active: UnifiedJob[];
  history: UnifiedJob[];
  schedulers: JobSchedulerStatus[];
  counts: {
    active: number;
    queued: number;
    running: number;
  };
}

export interface GetJobsOptions {
  status?: 'active' | 'completed' | 'all';
  types?: UnifiedJobType[];
  limit?: number;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get aggregated jobs from all sources
 */
export async function getJobs(
  options: GetJobsOptions = {}
): Promise<AggregatedJobsResponse> {
  const params = new URLSearchParams();

  if (options.status) {
    params.set('status', options.status);
  }
  if (options.types?.length) {
    params.set('types', options.types.join(','));
  }
  if (options.limit) {
    params.set('limit', options.limit.toString());
  }

  const queryString = params.toString();
  const url = queryString ? `/jobs?${queryString}` : '/jobs';

  // handleResponse already extracts .data from { success, data } responses
  return get<AggregatedJobsResponse>(url);
}

/**
 * Get count of active jobs (for sidebar badge)
 */
export async function getActiveJobCount(): Promise<number> {
  const response = await get<{ success: boolean; count: number }>('/jobs/count');
  return response.count;
}

/**
 * Cancel a job
 */
export async function cancelJob(
  type: UnifiedJobType,
  id: string
): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>(
    `/jobs/${type}/${id}/cancel`,
    {}
  );
}

/**
 * Get detailed job information including logs
 */
export async function getJobDetails(
  type: UnifiedJobType,
  id: string
): Promise<UnifiedJobDetails> {
  return get<UnifiedJobDetails>(`/jobs/${type}/${id}`);
}
