/**
 * Job Actions Hook
 *
 * Manages job lifecycle operations: create, resume, cancel, abandon, apply.
 */

import { useCallback, MutableRefObject } from 'react';
import {
  createMetadataJob,
  getMetadataJob,
  updateMetadataJobOptions,
  startMetadataJob,
  cancelMetadataJob,
  abandonMetadataJob,
  applyJobChanges,
  type ApprovalSession,
  type CreateApprovalSessionOptions,
} from '../services/api.service';
import {
  type JobStep,
  type StepLogs,
  createEmptyStepLogs,
  convertDbLogsToStepLogs,
  getCompletedStepsFromStatus,
} from './useStepLogs';
import type { ApplyProgress } from './useJobPolling';
import type { ApplyResult } from '../services/api.service';

// =============================================================================
// Types
// =============================================================================

export interface JobState {
  jobId: string | null;
  fileIds: string[];
  options: CreateApprovalSessionOptions;
}

export interface JobActionsCallbacks {
  setJobId: (id: string | null) => void;
  setFileIds: (ids: string[]) => void;
  setHasActiveJob: (active: boolean) => void;
  setIsModalOpen: (open: boolean) => void;
  setStep: (step: JobStep) => void;
  setSession: (session: ApprovalSession | null) => void;
  setStepLogs: React.Dispatch<React.SetStateAction<StepLogs>>;
  setCurrentProgress: (progress: { message?: string | null; detail?: string | null }) => void;
  setCompletedSteps: React.Dispatch<React.SetStateAction<Set<JobStep>>>;
  setError: (error: string | null) => void;
  setOptions: (options: CreateApprovalSessionOptions) => void;
  setApplyResult: (result: ApplyResult | null) => void;
  setApplyProgress: (progress: ApplyProgress) => void;
  markStepCompleted: (step: JobStep) => void;
  loadActiveJobs: () => Promise<void>;
  normalizeSession: (session: ApprovalSession | null) => ApprovalSession | null;
  refreshFiles: () => void;
}

export interface UseJobActionsReturn {
  startJob: (fileIds: string[]) => Promise<void>;
  resumeJob: (jobId: string) => Promise<void>;
  setOptions: (options: CreateApprovalSessionOptions) => Promise<void>;
  beginSession: () => Promise<void>;
  cancelJob: () => Promise<void>;
  abandonJob: (targetJobId?: string) => Promise<void>;
  refreshJob: () => Promise<void>;
  applyChanges: () => Promise<void>;
  completeJob: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useJobActions(
  state: JobState,
  initializingRef: MutableRefObject<boolean>,
  callbacks: JobActionsCallbacks
): UseJobActionsReturn {
  const {
    setJobId,
    setFileIds,
    setHasActiveJob,
    setIsModalOpen,
    setStep,
    setSession,
    setStepLogs,
    setCurrentProgress,
    setCompletedSteps,
    setError,
    setOptions: setOptionsState,
    setApplyResult,
    setApplyProgress,
    markStepCompleted,
    loadActiveJobs,
    normalizeSession,
    refreshFiles,
  } = callbacks;

  const { jobId } = state;

  const resetState = useCallback(() => {
    setHasActiveJob(false);
    setIsModalOpen(false);
    setJobId(null);
    setSession(normalizeSession(null));
    setStep('options');
    setStepLogs(createEmptyStepLogs());
    setCurrentProgress({});
    setCompletedSteps(new Set());
    setError(null);
    setOptionsState({});
    setApplyResult(null);
    setApplyProgress({ phase: 'idle', current: 0, total: 0 });
  }, [
    setHasActiveJob,
    setIsModalOpen,
    setJobId,
    setSession,
    setStep,
    setStepLogs,
    setCurrentProgress,
    setCompletedSteps,
    setError,
    setOptionsState,
    setApplyResult,
    setApplyProgress,
    normalizeSession,
  ]);

  const startJob = useCallback(async (newFileIds: string[]) => {
    try {
      const { job } = await createMetadataJob(newFileIds);

      // Reset initializing ref for new job
      initializingRef.current = false;

      setJobId(job.id);
      setFileIds(newFileIds);
      setHasActiveJob(true);
      setIsModalOpen(true);
      setStep('options');
      setSession(normalizeSession(null));
      setStepLogs(createEmptyStepLogs());
      setCurrentProgress({});
      setCompletedSteps(new Set());
      setError(null);
      setOptionsState({});
      setApplyResult(null);
      setApplyProgress({ phase: 'idle', current: 0, total: 0 });

      loadActiveJobs();
    } catch (err) {
      console.error('Failed to create job:', err);
      setError(err instanceof Error ? err.message : 'Failed to create job');
    }
  }, [
    initializingRef,
    setJobId,
    setFileIds,
    setHasActiveJob,
    setIsModalOpen,
    setStep,
    setSession,
    setStepLogs,
    setCurrentProgress,
    setCompletedSteps,
    setError,
    setOptionsState,
    setApplyResult,
    setApplyProgress,
    loadActiveJobs,
    normalizeSession,
  ]);

  const resumeJob = useCallback(async (resumeJobId: string) => {
    try {
      const { job } = await getMetadataJob(resumeJobId);

      setJobId(job.id);
      setFileIds(job.fileIds);
      setHasActiveJob(true);
      setIsModalOpen(true);
      setStep(job.status as JobStep);
      setSession(normalizeSession(job.session));
      setStepLogs(convertDbLogsToStepLogs(job.logs));
      setCurrentProgress({
        message: job.currentProgressMessage,
        detail: job.currentProgressDetail,
      });
      setCompletedSteps(getCompletedStepsFromStatus(job.status as JobStep));
      setError(job.error);
      setOptionsState(job.options);
      setApplyResult(job.applyResult);
    } catch (err) {
      console.error('Failed to resume job:', err);
      setError(err instanceof Error ? err.message : 'Failed to resume job');
    }
  }, [
    setJobId,
    setFileIds,
    setHasActiveJob,
    setIsModalOpen,
    setStep,
    setSession,
    setStepLogs,
    setCurrentProgress,
    setCompletedSteps,
    setError,
    setOptionsState,
    setApplyResult,
    normalizeSession,
  ]);

  const setOptions = useCallback(async (newOptions: CreateApprovalSessionOptions) => {
    setOptionsState(newOptions);
    if (jobId) {
      try {
        await updateMetadataJobOptions(jobId, newOptions);
      } catch (err) {
        console.error('Failed to update job options:', err);
      }
    }
  }, [jobId, setOptionsState]);

  const beginSession = useCallback(async () => {
    if (initializingRef.current || !jobId) return;
    initializingRef.current = true;

    setStep('initializing');
    markStepCompleted('options');
    setError(null);
    setCurrentProgress({});

    try {
      await startMetadataJob(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start job');
      setStep('error');
      initializingRef.current = false;
    }
  }, [jobId, initializingRef, setStep, markStepCompleted, setError, setCurrentProgress]);

  const cancelJob = useCallback(async () => {
    if (jobId) {
      try {
        await cancelMetadataJob(jobId);
      } catch {
        // Ignore errors on cancel
      }
    }
    resetState();
    loadActiveJobs();
  }, [jobId, resetState, loadActiveJobs]);

  const abandonJob = useCallback(async (targetJobId?: string) => {
    const jobIdToAbandon = targetJobId || jobId;

    // Only reset UI state if abandoning the current job
    if (!targetJobId || targetJobId === jobId) {
      resetState();
    }

    if (jobIdToAbandon) {
      try {
        await abandonMetadataJob(jobIdToAbandon);
      } catch (err) {
        console.error('Failed to abandon job:', err);
      }
    }

    await loadActiveJobs();
  }, [jobId, resetState, loadActiveJobs]);

  const refreshJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const { job } = await getMetadataJob(jobId);
      setSession(normalizeSession(job.session));
      setStep(job.status as JobStep);
      setCompletedSteps(getCompletedStepsFromStatus(job.status as JobStep));
      setStepLogs(convertDbLogsToStepLogs(job.logs));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh job');
    }
  }, [jobId, setSession, setStep, setCompletedSteps, setStepLogs, setError, normalizeSession]);

  const applyChanges = useCallback(async () => {
    if (!jobId) return;
    try {
      setStep('applying');
      setApplyProgress({ phase: 'applying', current: 0, total: 0 });

      await applyJobChanges(jobId);
    } catch (err) {
      setApplyProgress({ phase: 'idle', current: 0, total: 0 });
      setError(err instanceof Error ? err.message : 'Failed to apply changes');
      setStep('error');
    }
  }, [jobId, setStep, setApplyProgress, setError]);

  const completeJob = useCallback(() => {
    resetState();
    loadActiveJobs();
    refreshFiles();
  }, [resetState, loadActiveJobs, refreshFiles]);

  return {
    startJob,
    resumeJob,
    setOptions,
    beginSession,
    cancelJob,
    abandonJob,
    refreshJob,
    applyChanges,
    completeJob,
  };
}
