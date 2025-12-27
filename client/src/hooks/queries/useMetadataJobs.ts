/**
 * useMetadataJobs Hook
 *
 * React Query hooks for metadata job management with adaptive polling.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  listMetadataJobs,
  createMetadataJob,
  getMetadataJob,
  startMetadataJob,
  cancelMetadataJob,
  abandonMetadataJob,
  deleteMetadataJob,
  updateMetadataJobOptions,
} from '../../services/api/metadata';
import type { MetadataJob, JobStatus, CreateApprovalSessionOptions } from '../../services/api/metadata';

// =============================================================================
// Constants
// =============================================================================

const TERMINAL_STATES: JobStatus[] = ['complete', 'error'];
const FAST_POLL_STATES: JobStatus[] = ['initializing', 'applying', 'fetching_issues'];
const SLOW_POLL_STATES: JobStatus[] = ['series_approval', 'file_review', 'options'];

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch all metadata jobs for the current user
 */
export function useMetadataJobsList() {
  return useQuery({
    queryKey: queryKeys.metadataJobs.list(),
    queryFn: async () => {
      const response = await listMetadataJobs();
      return response.jobs;
    },
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      // Poll if there are any active (non-terminal) jobs
      const hasActiveJob = jobs.some((j) => !TERMINAL_STATES.includes(j.status));
      return hasActiveJob ? 5000 : false;
    },
  });
}

/**
 * Fetch a single metadata job with adaptive polling
 *
 * Polls faster (1s) during active processing, slower (5s) during user interaction steps.
 * Stops polling when job reaches a terminal state.
 */
export function useMetadataJob(jobId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.metadataJobs.detail(jobId!),
    queryFn: async () => {
      const response = await getMetadataJob(jobId!);
      return response.job;
    },
    enabled: !!jobId && (options?.enabled !== false),
    // Adaptive polling based on job status
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job) return false;

      // Stop polling for terminal states
      if (TERMINAL_STATES.includes(job.status)) return false;

      // Fast polling during active work
      if (FAST_POLL_STATES.includes(job.status)) return 1000;

      // Slower polling during user interaction
      if (SLOW_POLL_STATES.includes(job.status)) return 5000;

      // Default: moderate polling
      return 2000;
    },
    staleTime: 0, // Always fetch fresh
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Create a new metadata job
 */
export function useCreateMetadataJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMetadataJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadataJobs.list() });
    },
  });
}

/**
 * Start processing a metadata job
 */
export function useStartMetadataJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startMetadataJob,
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadataJobs.detail(jobId) });
    },
  });
}

/**
 * Update job options before starting
 */
export function useUpdateMetadataJobOptions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, options }: { jobId: string; options: CreateApprovalSessionOptions }) =>
      updateMetadataJobOptions(jobId, options),
    onSuccess: (response) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadataJobs.detail(response.job.id),
      });
    },
  });
}

/**
 * Cancel an active metadata job
 */
export function useCancelMetadataJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelMetadataJob,
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadataJobs.detail(jobId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.metadataJobs.list() });
    },
  });
}

/**
 * Abandon a metadata job (cleanup without saving)
 */
export function useAbandonMetadataJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: abandonMetadataJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadataJobs.all });
    },
  });
}

/**
 * Delete a completed metadata job
 */
export function useDeleteMetadataJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMetadataJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metadataJobs.list() });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Check if there's an active metadata job
 */
export function useHasActiveMetadataJob() {
  const { data: jobs = [] } = useMetadataJobsList();
  return jobs.some((j) => !TERMINAL_STATES.includes(j.status));
}

/**
 * Invalidate all metadata job queries
 */
export function useInvalidateMetadataJobs() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.metadataJobs.all });
  };
}

// Re-export types for convenience
export type { MetadataJob, JobStatus };
