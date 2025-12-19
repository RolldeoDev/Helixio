/**
 * Series Workflow Hook
 *
 * Manages series search, approval, skip, and reset operations.
 */

import { useCallback } from 'react';
import {
  searchJobSeries,
  approveJobSeries,
  skipJobSeries,
  navigateToJobSeriesGroup,
  type ApprovalSession,
} from '../services/api.service';
import type { JobStep, StepLogEntry } from './useStepLogs';

// =============================================================================
// Types
// =============================================================================

export interface SeriesWorkflowCallbacks {
  onSessionUpdate: (session: ApprovalSession | null) => void;
  onStepChange: (status: string) => void;
  addStepLog: (step: JobStep, log: Omit<StepLogEntry, 'timestamp'>) => void;
  normalizeSession: (session: ApprovalSession | null) => ApprovalSession | null;
}

export interface UseSeriesWorkflowReturn {
  searchSeries: (query: string) => Promise<void>;
  approveSeries: (seriesId: string, issueMatchingSeriesId?: string) => Promise<void>;
  skipSeries: () => Promise<void>;
  resetSeriesSelection: (seriesGroupIndex: number) => Promise<void>;
}

// =============================================================================
// Hook
// =============================================================================

export function useSeriesWorkflow(
  jobId: string | null,
  callbacks: SeriesWorkflowCallbacks
): UseSeriesWorkflowReturn {
  const { onSessionUpdate, onStepChange, addStepLog, normalizeSession } = callbacks;

  const searchSeries = useCallback(async (query: string) => {
    if (!jobId) return;
    try {
      const { job } = await searchJobSeries(jobId, query);
      onSessionUpdate(normalizeSession(job.session));
    } catch (err) {
      console.error('Failed to search series:', err);
    }
  }, [jobId, onSessionUpdate, normalizeSession]);

  const approveSeries = useCallback(async (seriesId: string, issueMatchingSeriesId?: string) => {
    if (!jobId) return;
    try {
      const { job } = await approveJobSeries(jobId, seriesId, issueMatchingSeriesId);
      onSessionUpdate(normalizeSession(job.session));
      onStepChange(job.status);
      const logMessage = issueMatchingSeriesId && issueMatchingSeriesId !== seriesId
        ? 'Series approved (using different series for issue matching)'
        : 'Series approved';
      addStepLog('series_approval', { message: logMessage, type: 'success' });
    } catch (err) {
      console.error('Failed to approve series:', err);
    }
  }, [jobId, onSessionUpdate, onStepChange, addStepLog, normalizeSession]);

  const skipSeries = useCallback(async () => {
    if (!jobId) return;
    try {
      const { job } = await skipJobSeries(jobId);
      onSessionUpdate(normalizeSession(job.session));
      onStepChange(job.status);
      addStepLog('series_approval', { message: 'Series skipped', type: 'info' });
    } catch (err) {
      console.error('Failed to skip series:', err);
    }
  }, [jobId, onSessionUpdate, onStepChange, addStepLog, normalizeSession]);

  const resetSeriesSelection = useCallback(async (seriesGroupIndex: number) => {
    if (!jobId) return;
    try {
      // Use navigate (not reset) to keep current selection visible
      const { job } = await navigateToJobSeriesGroup(jobId, seriesGroupIndex);
      onSessionUpdate(normalizeSession(job.session));
      onStepChange(job.status);
      addStepLog('series_approval', {
        message: 'Navigated to series selection',
        type: 'info',
      });
    } catch (err) {
      console.error('Failed to navigate to series selection:', err);
    }
  }, [jobId, onSessionUpdate, onStepChange, addStepLog, normalizeSession]);

  return {
    searchSeries,
    approveSeries,
    skipSeries,
    resetSeriesSelection,
  };
}
