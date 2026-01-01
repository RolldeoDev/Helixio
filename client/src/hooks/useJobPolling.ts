/**
 * Job Polling Hook
 *
 * Handles polling for metadata job state updates from the server.
 */

import { useEffect, useRef, MutableRefObject } from 'react';
import { getMetadataJob, type ApprovalSession, type ApplyResult } from '../services/api.service';
import {
  type JobStep,
  type StepLogs,
  convertDbLogsToStepLogs,
  getCompletedStepsFromStatus,
} from './useStepLogs';

// =============================================================================
// Types
// =============================================================================

export interface CurrentProgress {
  message?: string | null;
  detail?: string | null;
}

export interface ApplyProgress {
  phase: 'idle' | 'converting' | 'applying' | 'creating_series_json' | 'syncing_ratings' | 'complete';
  current: number;
  total: number;
  currentFile?: string;
}

/**
 * Parse progress messages from the job into structured ApplyProgress data.
 * This allows the UI to show accurate phase and progress during the apply step.
 */
export function parseApplyProgress(message?: string | null, detail?: string | null): ApplyProgress {
  if (!message) return { phase: 'idle', current: 0, total: 0 };

  // Parse "X of Y" from detail
  const countMatch = detail?.match(/(\d+) of (\d+)/);
  const current = countMatch && countMatch[1] ? parseInt(countMatch[1], 10) : 0;
  const total = countMatch && countMatch[2] ? parseInt(countMatch[2], 10) : 0;

  // Extract filename if present (Converting: X, Applying: X, Renaming: X, Moving: X)
  const filenameMatch = message.match(/(?:Converting|Applying|Renaming|Moving): (.+)/);
  const currentFile = filenameMatch?.[1];

  // Determine phase from message content
  let phase: ApplyProgress['phase'] = 'applying';
  if (message.includes('Converting')) {
    phase = 'converting';
  } else if (message.includes('series metadata') || message.includes('series.json') || message.includes('mixed series')) {
    phase = 'creating_series_json';
  } else if (message.includes('rating') || message.includes('Rating')) {
    phase = 'syncing_ratings';
  } else if (message.includes('complete') || message.includes('Complete')) {
    phase = 'complete';
  }

  return { phase, current, total, currentFile };
}

// Re-export ApplyResult from api.service
export type { ApplyResult } from '../services/api.service';

export interface JobPollingCallbacks {
  onStepChange: (step: JobStep) => void;
  onLogsUpdate: (logs: StepLogs) => void;
  onProgressUpdate: (progress: CurrentProgress) => void;
  onCompletedStepsUpdate: (steps: Set<JobStep>) => void;
  onSessionUpdate: (session: ApprovalSession | null) => void;
  onError: (error: string) => void;
  onComplete: (result: ApplyResult | null) => void;
  onJobsRefresh: () => void;
}

export interface UseJobPollingOptions {
  isModalOpen: boolean;
  jobId: string | null;
  step: JobStep;
  initializingRef: MutableRefObject<boolean>;
  normalizeSession: (session: ApprovalSession | null) => ApprovalSession | null;
  callbacks: JobPollingCallbacks;
}

// =============================================================================
// Hook
// =============================================================================

export function useJobPolling({
  isModalOpen,
  jobId,
  step,
  initializingRef,
  normalizeSession,
  callbacks,
}: UseJobPollingOptions): void {
  const {
    onStepChange,
    onLogsUpdate,
    onProgressUpdate,
    onCompletedStepsUpdate,
    onSessionUpdate,
    onError,
    onComplete,
    onJobsRefresh,
  } = callbacks;

  // Track current step for initialization detection
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (!isModalOpen || !jobId) return;
    if (['complete', 'error', 'cancelled', 'options'].includes(step)) return;

    const poll = async () => {
      try {
        const { job } = await getMetadataJob(jobId);
        const newStep = job.status as JobStep;

        // If we're in the middle of initializing (user just clicked Start),
        // don't let polling revert us back to 'options' - the server just hasn't
        // processed the queue yet. Wait for actual progress.
        if (initializingRef.current && newStep === 'options') {
          return;
        }

        // Reset initializingRef when job transitions out of 'initializing'
        if (stepRef.current === 'initializing' && newStep !== 'initializing') {
          initializingRef.current = false;
        }

        onStepChange(newStep);
        onLogsUpdate(convertDbLogsToStepLogs(job.logs));
        onProgressUpdate({
          message: job.currentProgressMessage,
          detail: job.currentProgressDetail,
        });
        onCompletedStepsUpdate(getCompletedStepsFromStatus(newStep));

        if (job.session) {
          onSessionUpdate(normalizeSession(job.session));
        }
        if (job.error) {
          onError(job.error);
        }

        // Handle completion - set apply result and refresh jobs list
        if (newStep === 'complete') {
          onComplete(job.applyResult);
          onJobsRefresh();
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Poll immediately, then at interval
    poll();

    // Use faster polling during active operations
    const isActiveOperation = ['initializing', 'applying', 'fetching_issues'].includes(step);
    const pollInterval = isActiveOperation ? 1000 : 2000;

    const interval = setInterval(poll, pollInterval);
    return () => clearInterval(interval);
  }, [
    isModalOpen,
    jobId,
    step,
    initializingRef,
    normalizeSession,
    onStepChange,
    onLogsUpdate,
    onProgressUpdate,
    onCompletedStepsUpdate,
    onSessionUpdate,
    onError,
    onComplete,
    onJobsRefresh,
  ]);
}
