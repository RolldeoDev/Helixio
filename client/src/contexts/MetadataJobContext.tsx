/**
 * Metadata Job Context
 *
 * Manages persistent metadata approval job state.
 * Jobs are persisted to the database and survive browser refreshes.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import {
  createMetadataJob,
  getMetadataJob,
  listMetadataJobs,
  updateMetadataJobOptions,
  startMetadataJob,
  cancelMetadataJob,
  abandonMetadataJob,
  searchJobSeries,
  loadMoreJobSeriesResults,
  approveJobSeries,
  skipJobSeries,
  navigateToJobSeriesGroup,
  applyJobChanges,
  expandSeriesResult,
  searchSeriesFullData,
  type MetadataJob,
  type ApprovalSession,
  type CreateApprovalSessionOptions,
  type ApplyResult,
  type SeriesMatch,
  type MergedSeriesMetadata,
  type MetadataSource,
} from '../services/api.service';
import { useApp } from './AppContext';
import {
  type JobStep,
  type StepLogs,
  type StepLogEntry,
  createEmptyStepLogs,
  convertDbLogsToStepLogs,
  getCompletedStepsFromStatus,
} from '../hooks/useStepLogs';
import type { CurrentProgress, ApplyProgress } from '../hooks/useJobPolling';

// =============================================================================
// Session Normalization Helper
// =============================================================================

/**
 * Normalizes session data from the server to match client expectations.
 * Server returns `id` but client expects `sessionId`.
 * Also ensures all required fields have fallback values.
 */
function normalizeSession(session: ApprovalSession | null): ApprovalSession | null {
  if (!session) return null;

  // Handle server returning 'id' instead of 'sessionId'
  const sessionWithId = session as ApprovalSession & { id?: string };
  const sessionId = session.sessionId || sessionWithId.id || '';

  return {
    ...session,
    sessionId,
    // Ensure seriesGroups is always an array
    seriesGroups: session.seriesGroups || [],
    // Ensure currentSeriesIndex has a default
    currentSeriesIndex: session.currentSeriesIndex ?? 0,
    // Compute currentSeriesGroup if not provided
    currentSeriesGroup: session.currentSeriesGroup ||
      (session.seriesGroups?.[session.currentSeriesIndex ?? 0] as ApprovalSession['currentSeriesGroup']) ||
      null,
  };
}

// =============================================================================
// Re-exports from hooks (types and utilities)
// =============================================================================

export type { JobStep, StepLogEntry, StepLogs } from '../hooks/useStepLogs';
export type { CurrentProgress, ApplyProgress } from '../hooks/useJobPolling';
export { type ApplyResult };

interface MetadataJobState {
  /** Whether there's an active job */
  hasActiveJob: boolean;
  /** Whether the modal is currently shown */
  isModalOpen: boolean;
  /** Current step in the workflow */
  step: JobStep;
  /** The current job ID */
  jobId: string | null;
  /** The active session */
  session: ApprovalSession | null;
  /** Logs organized by step (from database) - single source of truth */
  stepLogs: StepLogs;
  /** Current progress snapshot for real-time display */
  currentProgress: CurrentProgress;
  /** Set of completed steps */
  completedSteps: Set<JobStep>;
  /** Error message if any */
  error: string | null;
  /** File IDs being processed */
  fileIds: string[];
  /** Options for the session */
  options: CreateApprovalSessionOptions;
  /** Apply result when complete */
  applyResult: ApplyResult | null;
  /** List of all active jobs */
  activeJobs: MetadataJob[];
  /** Structured apply progress for real-time display */
  applyProgress: ApplyProgress;
  /** Timestamp when last job was completed (for triggering page refreshes) */
  lastCompletedJobAt: number | null;
}

/** Result of expanding a series with multi-source data */
export interface ExpandedSeriesResult {
  merged: MergedSeriesMetadata;
  sourceResults: Record<MetadataSource, SeriesMatch | null>;
}

interface MetadataJobContextValue extends MetadataJobState {
  /** Start a new metadata job */
  startJob: (fileIds: string[]) => void;
  /** Resume an existing job */
  resumeJob: (jobId: string) => Promise<void>;
  /** Update options before starting */
  setOptions: (options: CreateApprovalSessionOptions) => void;
  /** Begin the session (after options are set) */
  beginSession: () => Promise<void>;
  /** Open the modal to view current job */
  openModal: () => void;
  /** Close the modal (job continues in background) */
  closeModal: () => void;
  /** Cancel the current job */
  cancelJob: () => Promise<void>;
  /** Abandon a job - cancel, cleanup, and delete all data. Uses current job if no ID provided. */
  abandonJob: (targetJobId?: string) => Promise<void>;
  /** Refresh job from API */
  refreshJob: () => Promise<void>;
  /** Update session directly */
  updateSession: (session: ApprovalSession) => void;
  /** Update step based on session status */
  updateStepFromStatus: (status: string) => void;
  /** Set apply result and mark complete */
  setApplyResult: (result: ApplyResult) => void;
  /** Complete and close the job */
  completeJob: () => void;
  /** Add a log entry for a specific step */
  addStepLog: (step: JobStep, log: Omit<StepLogEntry, 'timestamp'>) => void;
  /** Mark a step as completed */
  markStepCompleted: (step: JobStep) => void;
  /** Load active jobs from API */
  loadActiveJobs: () => Promise<void>;
  /** Search series with custom query
   * @param query - The search query string
   * @param source - Optional specific source to search (if not provided, searches all configured sources)
   */
  searchSeries: (query: string, source?: MetadataSource) => Promise<void>;
  /** Load more search results for current series */
  loadMoreSeriesResults: () => Promise<void>;
  /** Approve current series
   * @param seriesId - Series to use for series-level metadata
   * @param issueMatchingSeriesId - Series to use for issue matching (optional)
   * @param applyToRemaining - If true, auto-approve remaining series with top matches
   */
  approveSeries: (seriesId: string, issueMatchingSeriesId?: string, applyToRemaining?: boolean) => Promise<void>;
  /** Skip current series */
  skipSeries: () => Promise<void>;
  /** Reset a series group to allow re-selection (go back to series approval) */
  resetSeriesSelection: (seriesGroupIndex: number) => Promise<void>;
  /** Apply approved changes */
  applyChanges: () => Promise<void>;
  /** Expand a single series result to fetch data from all sources */
  expandResult: (series: SeriesMatch) => Promise<ExpandedSeriesResult>;
  /** Search all enabled sources (full data mode) */
  searchAllSources: (query: string) => Promise<ExpandedSeriesResult | null>;
}

// =============================================================================
// Polling Configuration
// =============================================================================

/**
 * Get the polling interval based on job status.
 * Uses faster polling during active operations and slower polling during idle states.
 * Returns 0 for terminal states to stop polling entirely.
 */
function getPollingInterval(status: JobStep): number {
  switch (status) {
    // Active processing - poll frequently
    case 'initializing':
    case 'applying':
    case 'fetching_issues':
      return 1000;

    // Waiting for user input - poll less frequently
    case 'series_approval':
    case 'file_review':
    case 'options':
      return 5000;

    // Terminal states - no polling needed
    case 'complete':
    case 'error':
      return 0;

    default:
      return 2000;
  }
}

// =============================================================================
// Context
// =============================================================================

const MetadataJobContext = createContext<MetadataJobContextValue | null>(null);

export function useMetadataJob(): MetadataJobContextValue {
  const context = useContext(MetadataJobContext);
  if (!context) {
    throw new Error('useMetadataJob must be used within MetadataJobProvider');
  }
  return context;
}

// =============================================================================
// Provider
// =============================================================================

interface MetadataJobProviderProps {
  children: ReactNode;
}

export function MetadataJobProvider({ children }: MetadataJobProviderProps) {
  const { refreshFiles } = useApp();
  const [hasActiveJob, setHasActiveJob] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState<JobStep>('options');
  const [jobId, setJobId] = useState<string | null>(null);
  const [session, setSession] = useState<ApprovalSession | null>(null);
  const [stepLogs, setStepLogs] = useState<StepLogs>(createEmptyStepLogs);
  const [currentProgress, setCurrentProgress] = useState<CurrentProgress>({});
  const [completedSteps, setCompletedSteps] = useState<Set<JobStep>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [options, setOptionsState] = useState<CreateApprovalSessionOptions>({});
  const [applyResult, setApplyResultState] = useState<ApplyResult | null>(null);
  const [activeJobs, setActiveJobs] = useState<MetadataJob[]>([]);
  const [applyProgress, setApplyProgress] = useState<ApplyProgress>({
    phase: 'idle',
    current: 0,
    total: 0,
  });
  const [lastCompletedJobAt, setLastCompletedJobAt] = useState<number | null>(null);

  const initializingRef = useRef(false);
  // Track when user is navigating back to series selection to prevent polling race conditions
  const navigatingToSeriesRef = useRef(false);

  // Load active jobs on mount and auto-detect existing in-progress jobs
  useEffect(() => {
    async function checkForActiveJobs() {
      try {
        const { jobs } = await listMetadataJobs();
        setActiveJobs(jobs);

        // If there's an in-progress job on initial load, show the banner
        if (jobs.length > 0) {
          const activeJob = jobs[0];
          if (activeJob && activeJob.status !== 'options' && activeJob.status !== 'complete') {
            setHasActiveJob(true);
          }
        }
      } catch (err) {
        console.error('Failed to load active jobs:', err);
      }
    }
    checkForActiveJobs();
  }, []);

  const loadActiveJobs = useCallback(async () => {
    try {
      const { jobs } = await listMetadataJobs();
      setActiveJobs(jobs);

      // Only set hasActiveJob if there are actually jobs and we don't have one selected
      // Don't set it to true - only to false if there are no jobs
      if (jobs.length === 0) {
        setHasActiveJob(false);
      }
    } catch (err) {
      console.error('Failed to load active jobs:', err);
    }
  }, []);

  // Polling effect - fetch job state when modal is open and job is active
  // Uses adaptive polling intervals based on job status
  useEffect(() => {
    if (!isModalOpen || !jobId) return;

    // Get polling interval for current step - 0 means no polling
    const pollInterval = getPollingInterval(step);
    if (pollInterval === 0) return;

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

        // If user is navigating back to series selection, don't let polling
        // overwrite the step with stale data. The navigation callback will
        // update the step with fresh data from the API response.
        if (navigatingToSeriesRef.current) {
          return;
        }

        // Reset initializingRef when job transitions out of 'initializing'
        if (step === 'initializing' && newStep !== 'initializing') {
          initializingRef.current = false;
        }

        setStep(newStep);
        setStepLogs(convertDbLogsToStepLogs(job.logs));
        setCurrentProgress({
          message: job.currentProgressMessage,
          detail: job.currentProgressDetail,
        });
        setCompletedSteps(getCompletedStepsFromStatus(newStep));

        if (job.session) {
          setSession(normalizeSession(job.session));
        }
        if (job.error) {
          setError(job.error);
        }

        // Handle completion - set apply result and refresh jobs list
        if (newStep === 'complete') {
          if (job.applyResult) {
            setApplyResultState(job.applyResult);
          }
          setApplyProgress({ phase: 'complete', current: 0, total: 0 });
          loadActiveJobs();
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Poll immediately, then at adaptive interval
    poll();

    const interval = setInterval(poll, pollInterval);
    return () => clearInterval(interval);
  }, [isModalOpen, jobId, step, loadActiveJobs]);

  const addStepLog = useCallback((targetStep: JobStep, log: Omit<StepLogEntry, 'timestamp'>) => {
    const entry: StepLogEntry = {
      ...log,
      timestamp: new Date().toISOString(),
    };
    setStepLogs((prev) => ({
      ...prev,
      [targetStep]: [...prev[targetStep], entry],
    }));
  }, []);

  const markStepCompleted = useCallback((targetStep: JobStep) => {
    setCompletedSteps((prev) => new Set([...prev, targetStep]));
  }, []);

  const updateStepFromStatus = useCallback((status: string) => {
    const jobStep = status as JobStep;
    setStep(jobStep);
    setCompletedSteps(getCompletedStepsFromStatus(jobStep));
  }, []);

  const startJob = useCallback(async (newFileIds: string[]) => {
    try {
      // Create a new job in the database
      const { job } = await createMetadataJob(newFileIds);

      // Reset initializing ref for new job (may be stale from previous job)
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
      setApplyResultState(null);
      setApplyProgress({ phase: 'idle', current: 0, total: 0 });

      // Refresh active jobs list
      loadActiveJobs();
    } catch (err) {
      console.error('Failed to create job:', err);
      setError(err instanceof Error ? err.message : 'Failed to create job');
    }
  }, [loadActiveJobs]);

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
      setApplyResultState(job.applyResult);
    } catch (err) {
      console.error('Failed to resume job:', err);
      setError(err instanceof Error ? err.message : 'Failed to resume job');
    }
  }, []);

  const setOptions = useCallback(async (newOptions: CreateApprovalSessionOptions) => {
    setOptionsState(newOptions);
    if (jobId) {
      try {
        await updateMetadataJobOptions(jobId, newOptions);
      } catch (err) {
        console.error('Failed to update job options:', err);
      }
    }
  }, [jobId]);

  const beginSession = useCallback(async () => {
    if (initializingRef.current || !jobId) return;
    initializingRef.current = true;

    setStep('initializing');
    markStepCompleted('options');
    setError(null);
    setCurrentProgress({});

    try {
      // Enqueue the job for background processing
      // The job will be processed by the server's job queue
      // Polling will pick up progress updates automatically
      await startMetadataJob(jobId);

      // Note: We don't need to handle progress here anymore.
      // The polling effect (lines 302-329) will automatically:
      // - Fetch job state every 1-2 seconds
      // - Update step, stepLogs, currentProgress, and session
      // - Detect when job transitions to series_approval or error
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start job');
      setStep('error');
      initializingRef.current = false;
    }
    // Note: initializingRef stays true until polling detects completion
    // This prevents double-starts during the initialization phase
  }, [jobId, markStepCompleted]);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const cancelJob = useCallback(async () => {
    if (jobId) {
      try {
        await cancelMetadataJob(jobId);
      } catch {
        // Ignore errors on cancel
      }
    }
    setHasActiveJob(false);
    setIsModalOpen(false);
    setJobId(null);
    setSession(normalizeSession(null));
    setStep('options');
    setStepLogs(createEmptyStepLogs());
    setCurrentProgress({});
    setCompletedSteps(new Set());
    setError(null);
    setApplyProgress({ phase: 'idle', current: 0, total: 0 });
    loadActiveJobs();
  }, [jobId, loadActiveJobs]);

  const abandonJob = useCallback(async (targetJobId?: string) => {
    // Use provided jobId or fall back to current job
    const jobIdToAbandon = targetJobId || jobId;

    // Only reset UI state if abandoning the current job
    if (!targetJobId || targetJobId === jobId) {
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
      setApplyResultState(null);
      setApplyProgress({ phase: 'idle', current: 0, total: 0 });
    }

    // Call the API to clean up on server
    if (jobIdToAbandon) {
      try {
        await abandonMetadataJob(jobIdToAbandon);
      } catch (err) {
        console.error('Failed to abandon job:', err);
      }
    }

    // Refresh the jobs list after server cleanup
    await loadActiveJobs();
  }, [jobId, loadActiveJobs]);

  const refreshJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const { job } = await getMetadataJob(jobId);
      setSession(normalizeSession(job.session));
      updateStepFromStatus(job.status);
      setStepLogs(convertDbLogsToStepLogs(job.logs));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh job');
    }
  }, [jobId, updateStepFromStatus]);

  const updateSession = useCallback((newSession: ApprovalSession) => {
    setSession(normalizeSession(newSession));
  }, []);

  const searchSeries = useCallback(async (query: string, source?: MetadataSource) => {
    if (!jobId) return;
    try {
      const { job } = await searchJobSeries(jobId, query, source);
      setSession(normalizeSession(job.session));
    } catch (err) {
      console.error('Failed to search series:', err);
    }
  }, [jobId]);

  const loadMoreSeriesResults = useCallback(async () => {
    if (!jobId) return;
    try {
      const { job } = await loadMoreJobSeriesResults(jobId);
      setSession(normalizeSession(job.session));
    } catch (err) {
      console.error('Failed to load more series results:', err);
    }
  }, [jobId]);

  const approveSeries = useCallback(async (seriesId: string, issueMatchingSeriesId?: string, applyToRemaining?: boolean) => {
    if (!jobId) return;
    try {
      const { job } = await approveJobSeries(jobId, seriesId, issueMatchingSeriesId, applyToRemaining);
      setSession(normalizeSession(job.session));
      updateStepFromStatus(job.status);
      let logMessage = issueMatchingSeriesId && issueMatchingSeriesId !== seriesId
        ? 'Series approved (using different series for issue matching)'
        : 'Series approved';
      if (applyToRemaining) {
        logMessage += ' (applied to remaining series)';
      }
      addStepLog('series_approval', { message: logMessage, type: 'success' });
    } catch (err) {
      console.error('Failed to approve series:', err);
    }
  }, [jobId, updateStepFromStatus, addStepLog]);

  const skipSeries = useCallback(async () => {
    if (!jobId) return;
    try {
      const { job } = await skipJobSeries(jobId);
      setSession(normalizeSession(job.session));
      updateStepFromStatus(job.status);
      addStepLog('series_approval', { message: 'Series skipped', type: 'info' });
    } catch (err) {
      console.error('Failed to skip series:', err);
    }
  }, [jobId, updateStepFromStatus, addStepLog]);

  const resetSeriesSelection = useCallback(async (seriesGroupIndex: number) => {
    if (!jobId) return;

    // Set flag to prevent polling from overwriting state during navigation
    navigatingToSeriesRef.current = true;

    try {
      // Use navigate (not reset) to keep current selection visible
      const { job } = await navigateToJobSeriesGroup(jobId, seriesGroupIndex);
      setSession(normalizeSession(job.session));
      updateStepFromStatus(job.status);
      addStepLog('series_approval', {
        message: 'Navigated to series selection',
        type: 'info',
      });
    } catch (err) {
      console.error('Failed to navigate to series selection:', err);
    } finally {
      // Clear the flag after navigation completes (success or error)
      navigatingToSeriesRef.current = false;
    }
  }, [jobId, updateStepFromStatus, addStepLog]);

  const applyChanges = useCallback(async () => {
    if (!jobId) return;
    try {
      setStep('applying');
      // Reset apply progress at start
      setApplyProgress({ phase: 'applying', current: 0, total: 0 });

      // Enqueue the apply operation for background processing
      // The job will be processed by the server's job queue
      // Polling will pick up progress updates automatically
      await applyJobChanges(jobId);

      // Note: We don't need to handle progress here anymore.
      // The polling effect will automatically:
      // - Fetch job state every 1-2 seconds
      // - Update stepLogs and currentProgress from the job's progress fields
      // - Detect when job status transitions to 'complete' or 'error'
      // - Handle applyResult when status becomes 'complete'
    } catch (err) {
      setApplyProgress({ phase: 'idle', current: 0, total: 0 });
      setError(err instanceof Error ? err.message : 'Failed to apply changes');
      setStep('error');
    }
  }, [jobId]);

  const setApplyResult = useCallback((result: ApplyResult) => {
    setApplyResultState(result);
    setStep('complete');
  }, []);

  const completeJob = useCallback(() => {
    setHasActiveJob(false);
    setIsModalOpen(false);
    setJobId(null);
    setSession(normalizeSession(null));
    setStep('options');
    setStepLogs(createEmptyStepLogs());
    setCurrentProgress({});
    setCompletedSteps(new Set());
    setError(null);
    setApplyResultState(null);
    setApplyProgress({ phase: 'idle', current: 0, total: 0 });
    setLastCompletedJobAt(Date.now()); // Signal that a job was completed (for page refreshes)
    loadActiveJobs();
    refreshFiles();
  }, [loadActiveJobs, refreshFiles]);

  // Expand a single series result to fetch from all sources
  const expandResult = useCallback(async (series: SeriesMatch): Promise<ExpandedSeriesResult> => {
    try {
      // API now returns both merged and sourceResults directly
      const result = await expandSeriesResult(series);
      return {
        merged: result.merged,
        sourceResults: result.sourceResults,
      };
    } catch (err) {
      console.error('Failed to expand series result:', err);
      throw err;
    }
  }, []);

  // Search all enabled sources (full data mode)
  const searchAllSources = useCallback(async (query: string): Promise<ExpandedSeriesResult | null> => {
    try {
      const result = await searchSeriesFullData({ series: query });

      if (!result.merged) {
        return null;
      }

      // Convert the API result to our ExpandedSeriesResult format
      const sourceResults: Record<MetadataSource, SeriesMatch | null> = {
        comicvine: null,
        metron: null,
        gcd: null,
        anilist: null,
        mal: null,
      };

      // Populate from the results
      for (const [source, matches] of Object.entries(result.sourceResults)) {
        if (matches && matches.length > 0) {
          sourceResults[source as MetadataSource] = matches[0]!;
        }
      }

      return {
        merged: result.merged,
        sourceResults,
      };
    } catch (err) {
      console.error('Failed to search all sources:', err);
      throw err;
    }
  }, []);

  const value: MetadataJobContextValue = {
    // State
    hasActiveJob,
    isModalOpen,
    step,
    jobId,
    session,
    stepLogs,
    currentProgress,
    completedSteps,
    error,
    fileIds,
    options,
    applyResult,
    activeJobs,
    applyProgress,
    lastCompletedJobAt,

    // Actions
    startJob,
    resumeJob,
    setOptions,
    beginSession,
    openModal,
    closeModal,
    cancelJob,
    abandonJob,
    refreshJob,
    updateSession,
    updateStepFromStatus,
    setApplyResult,
    completeJob,
    addStepLog,
    markStepCompleted,
    loadActiveJobs,
    searchSeries,
    loadMoreSeriesResults,
    approveSeries,
    skipSeries,
    resetSeriesSelection,
    applyChanges,
    expandResult,
    searchAllSources,
  };

  return (
    <MetadataJobContext.Provider value={value}>
      {children}
    </MetadataJobContext.Provider>
  );
}

export default MetadataJobContext;
