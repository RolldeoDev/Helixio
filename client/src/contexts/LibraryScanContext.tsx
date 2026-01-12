/**
 * Library Scan Context
 *
 * Manages state for library scan jobs with SSE for real-time progress updates.
 * Falls back to polling when SSE is unavailable.
 * Provides functions to start scans, track progress, and cancel jobs.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  startLibraryScan,
  getScanJobStatus,
  cancelScanJob as apiCancelScanJob,
  getAllActiveScans,
  type LibraryScanJob,
  type ScanJobStatus,
} from '../services/api.service';
import { invalidateAfterLibraryScan } from '../lib/cacheInvalidation';
import { useAuth } from './AuthContext';

// =============================================================================
// Types
// =============================================================================

export interface LibraryScanState {
  // Active scan tracking (per library)
  activeScans: Record<string, LibraryScanJob>;

  // Currently viewed scan (for modal)
  viewingScanId: string | null;
  viewingLibraryId: string | null;

  // Loading states
  starting: Record<string, boolean>;

  // Error state
  error: string | null;
}

export interface LibraryScanContextValue extends LibraryScanState {
  // Actions
  startScan: (libraryId: string) => Promise<LibraryScanJob | null>;
  cancelScan: (libraryId: string, jobId: string) => Promise<void>;
  viewScan: (libraryId: string, jobId: string) => void;
  closeScanView: () => void;
  refreshScan: (libraryId: string, jobId: string) => Promise<void>;

  // Helpers
  hasActiveScan: (libraryId: string) => boolean;
  getActiveScan: (libraryId: string) => LibraryScanJob | null;
  getScanProgress: (job: LibraryScanJob) => number;
  getScanStageLabel: (status: ScanJobStatus) => string;
}

// =============================================================================
// Context
// =============================================================================

const LibraryScanContext = createContext<LibraryScanContextValue | null>(null);

// =============================================================================
// Constants
// =============================================================================

// Fallback polling intervals (used when SSE is disconnected)
// These are intentionally longer since SSE is the primary update mechanism
const POLL_INTERVAL_ACTIVE = 30000; // 30 seconds during active processing (was 5s)
const POLL_INTERVAL_IDLE = 60000; // 60 seconds when idle/queued (was 15s)

// SSE reconnection settings
const SSE_RECONNECT_DELAY = 3000; // 3 seconds
const SSE_MAX_RECONNECT_DELAY = 30000; // 30 seconds max

const STAGE_LABELS: Record<ScanJobStatus, string> = {
  queued: 'Queued',
  discovering: 'Discovering Files',
  cleaning: 'Cleaning Orphans',
  indexing: 'Indexing Metadata',
  linking: 'Linking to Series',
  covers: 'Extracting Covers',
  complete: 'Complete',
  error: 'Error',
  cancelled: 'Cancelled',
};

// =============================================================================
// Provider
// =============================================================================

export function LibraryScanProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<LibraryScanState>({
    activeScans: {},
    viewingScanId: null,
    viewingLibraryId: null,
    starting: {},
    error: null,
  });

  // SSE connection state
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(SSE_RECONNECT_DELAY);

  // Polling timers (runs alongside SSE as backup)
  const pollTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Clean up timers and SSE on unmount
  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Handle scan completion (shared between SSE and polling)
  const handleScanComplete = useCallback((libraryId: string, status: ScanJobStatus) => {
    // Scan completed - invalidate React Query caches
    if (status === 'complete') {
      invalidateAfterLibraryScan(libraryId);
    }

    // Clear from active scans after a delay (show completion message)
    setTimeout(() => {
      setState((prev) => {
        const { [libraryId]: _, ...rest } = prev.activeScans;
        return { ...prev, activeScans: rest };
      });
    }, 5000);
  }, []);

  // Poll for scan updates (runs alongside SSE as backup)
  const pollScanStatus = useCallback(
    async (libraryId: string, jobId: string) => {
      try {
        const result = await getScanJobStatus(libraryId, jobId);
        const job = result.job;

        setState((prev) => {
          const existingJob = prev.activeScans[libraryId];
          return {
            ...prev,
            activeScans: {
              ...prev.activeScans,
              [libraryId]: {
                ...job,
                // Preserve SSE-provided transient fields if not in polled response
                // (these are not stored in database, only sent via SSE)
                foldersTotal: job.foldersTotal ?? existingJob?.foldersTotal,
                foldersComplete: job.foldersComplete ?? existingJob?.foldersComplete,
                currentFolder: job.currentFolder ?? existingJob?.currentFolder,
                // Prefer SSE-provided cover count (accumulated from cover-progress events)
                // over polled value which may be stale
                coversExtracted: existingJob?.coversExtracted ?? job.coversExtracted ?? 0,
              },
            },
            error: null,
          };
        });

        // Continue polling if not in terminal state
        const terminalStates: ScanJobStatus[] = ['complete', 'error', 'cancelled'];
        if (!terminalStates.includes(job.status)) {
          const isActive = ['discovering', 'cleaning', 'indexing', 'linking', 'covers'].includes(
            job.status
          );
          // Disable polling when SSE is connected (SSE provides real-time updates)
          // Only use polling as fallback when SSE is disconnected
          const interval = sseConnected
            ? 0  // Disable polling when SSE connected
            : (isActive ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE);

          if (interval > 0) {
            pollTimers.current[libraryId] = setTimeout(() => {
              pollScanStatus(libraryId, jobId);
            }, interval);
          }
        } else {
          handleScanComplete(libraryId, job.status);
        }
      } catch (err) {
        console.error('Failed to poll scan status:', err);
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to get scan status',
        }));
      }
    },
    [sseConnected, handleScanComplete]
  );

  // Start a new scan
  const startScan = useCallback(
    async (libraryId: string): Promise<LibraryScanJob | null> => {
      setState((prev) => ({
        ...prev,
        starting: { ...prev.starting, [libraryId]: true },
        error: null,
      }));

      try {
        const result = await startLibraryScan(libraryId);
        const job = result.job;

        setState((prev) => ({
          ...prev,
          activeScans: {
            ...prev.activeScans,
            [libraryId]: job,
          },
          starting: { ...prev.starting, [libraryId]: false },
        }));

        // Always start polling as a backup (SSE events might be missed during race conditions)
        // Polling will stop automatically when job reaches terminal state
        const terminalStates: ScanJobStatus[] = ['complete', 'error', 'cancelled'];
        if (!terminalStates.includes(job.status)) {
          pollScanStatus(libraryId, job.id);
        }

        return job;
      } catch (err) {
        console.error('Failed to start scan:', err);
        setState((prev) => ({
          ...prev,
          starting: { ...prev.starting, [libraryId]: false },
          error: err instanceof Error ? err.message : 'Failed to start scan',
        }));
        return null;
      }
    },
    [pollScanStatus]
  );

  // Cancel a scan
  const cancelScan = useCallback(async (libraryId: string, jobId: string) => {
    try {
      await apiCancelScanJob(libraryId, jobId);

      // Clear polling timer
      if (pollTimers.current[libraryId]) {
        clearTimeout(pollTimers.current[libraryId]);
        delete pollTimers.current[libraryId];
      }

      // Update state
      setState((prev) => {
        const { [libraryId]: _, ...rest } = prev.activeScans;
        return { ...prev, activeScans: rest };
      });
    } catch (err) {
      console.error('Failed to cancel scan:', err);
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to cancel scan',
      }));
    }
  }, []);

  // View scan details
  const viewScan = useCallback((libraryId: string, jobId: string) => {
    setState((prev) => ({
      ...prev,
      viewingScanId: jobId,
      viewingLibraryId: libraryId,
    }));
  }, []);

  // Close scan view
  const closeScanView = useCallback(() => {
    setState((prev) => ({
      ...prev,
      viewingScanId: null,
      viewingLibraryId: null,
    }));
  }, []);

  // Refresh scan status
  const refreshScan = useCallback(
    async (libraryId: string, jobId: string) => {
      await pollScanStatus(libraryId, jobId);
    },
    [pollScanStatus]
  );

  // Check if library has active scan
  const hasActiveScan = useCallback(
    (libraryId: string): boolean => {
      return !!state.activeScans[libraryId];
    },
    [state.activeScans]
  );

  // Get active scan for library
  const getActiveScan = useCallback(
    (libraryId: string): LibraryScanJob | null => {
      return state.activeScans[libraryId] || null;
    },
    [state.activeScans]
  );

  // Calculate scan progress percentage using folder-based formula:
  // Progress = (foldersComplete + foldersErrored*2 + coverJobsComplete) / ((foldersTotal - foldersSkipped) * 2)
  // Each folder with changes has 2 units of work: scanning + cover extraction
  // Errored folders count as 2 (no cover job coming, so count both units as done)
  const getScanProgress = useCallback((job: LibraryScanJob): number => {
    if (job.status === 'complete') return 100;
    if (job.status === 'queued') return 0;

    const foldersTotal = job.foldersTotal ?? 0;
    const foldersSkipped = job.foldersSkipped ?? 0;
    const foldersComplete = job.foldersComplete ?? 0;
    const foldersErrored = job.foldersErrored ?? 0;
    const coverJobsComplete = job.coverJobsComplete ?? 0;

    // Only folders with changes count toward the total
    const foldersWithChanges = foldersTotal - foldersSkipped;
    if (foldersWithChanges <= 0) {
      // No folders with changes yet, show 0% or estimate based on discovery
      if (job.status === 'discovering') return 5;
      return 0;
    }

    // Total units = folders with changes * 2 (folder processing + cover extraction)
    const totalUnits = foldersWithChanges * 2;

    // Completed units:
    // - Each completed folder = 1 unit (waiting for cover job)
    // - Each errored folder = 2 units (no cover job coming)
    // - Each completed cover job = 1 unit
    const completedUnits = foldersComplete + (foldersErrored * 2) + coverJobsComplete;

    const progress = (completedUnits / totalUnits) * 100;
    return Math.min(100, Math.round(progress));
  }, []);

  // Get stage label
  const getScanStageLabel = useCallback((status: ScanJobStatus): string => {
    return STAGE_LABELS[status] || status;
  }, []);

  // SSE connection for real-time scan progress
  const connectSSE = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const eventSource = new EventSource('/api/libraries/scans/stream', {
        withCredentials: true,
      });

      eventSource.onopen = () => {
        setSseConnected(true);
        // Reset reconnect delay on successful connection
        reconnectDelayRef.current = SSE_RECONNECT_DELAY;
        console.debug('Scan SSE connected');
      };

      // Handle scan progress events
      eventSource.addEventListener('scan-progress', (event) => {
        try {
          const data = JSON.parse(event.data);
          const libraryId = data.libraryId;

          if (!libraryId) {
            console.debug('SSE scan-progress event missing libraryId');
            return;
          }

          // Map SSE progress data to LibraryScanJob format
          setState((prev) => {
            const existingJob = prev.activeScans[libraryId];

            // If we don't have an existing job, we can't update it yet
            // The job will be set when startScan completes
            if (!existingJob) {
              console.debug('SSE event received but no active scan in state for library:', libraryId);
              return prev;
            }

            // Determine status from phase
            let status: ScanJobStatus = existingJob.status;
            if (data.phase === 'enumerating') {
              status = 'discovering';
            } else if (data.phase === 'processing') {
              status = 'indexing';
            } else if (data.phase === 'covers') {
              status = 'covers';
            } else if (data.phase === 'complete') {
              status = 'complete';
            } else if (data.phase === 'error') {
              status = 'error';
            }

            const updatedJob: LibraryScanJob = {
              ...existingJob,
              status,
              totalFiles: data.filesDiscovered || existingJob.totalFiles,
              discoveredFiles: data.filesDiscovered || existingJob.discoveredFiles,
              indexedFiles: data.filesCreated + data.filesUpdated,
              // linkedFiles = files linked to series (all processed files are linked)
              linkedFiles: data.filesCreated + data.filesUpdated,
              orphanedFiles: data.filesOrphaned,
              seriesCreated: data.seriesCreated,
              // Preserve coversExtracted from cover-progress events
              coversExtracted: existingJob.coversExtracted || 0,
              // Preserve coverJobsComplete from cover-progress events
              coverJobsComplete: existingJob.coverJobsComplete || 0,
              foldersTotal: data.foldersTotal,
              foldersComplete: data.foldersComplete,
              foldersSkipped: data.foldersSkipped,
              foldersErrored: data.foldersErrored,
              currentFolder: data.currentFolder,
            };

            // Check for terminal state
            const terminalStates: ScanJobStatus[] = ['complete', 'error', 'cancelled'];
            if (terminalStates.includes(status)) {
              // Handle completion
              setTimeout(() => handleScanComplete(libraryId, status), 0);
            }

            return {
              ...prev,
              activeScans: {
                ...prev.activeScans,
                [libraryId]: updatedJob,
              },
            };
          });
        } catch (error) {
          console.debug('Failed to parse scan progress event:', error);
        }
      });

      // Handle scan log events
      eventSource.addEventListener('scan-log', (event) => {
        try {
          const data = JSON.parse(event.data);
          const { libraryId, id: _id, stage, message, detail: _detail, type: _type, timestamp: _timestamp } = data;

          if (!libraryId) {
            console.debug('SSE scan-log event missing libraryId');
            return;
          }

          // Append log to scan logs (not needed - JobDetailPanel will fetch logs from API)
          // We could store them here for real-time display in LibraryScanModal,
          // but since we're replacing LibraryScanModal with JobDetailPanel,
          // we don't need to store logs in context
          console.debug('Scan log received:', { libraryId, stage, message });
        } catch (error) {
          console.debug('Failed to parse scan log event:', error);
        }
      });

      // Handle cover extraction progress events
      eventSource.addEventListener('cover-progress', (event) => {
        try {
          const data = JSON.parse(event.data);
          const libraryId = data.libraryId;

          if (!libraryId) {
            console.debug('SSE cover-progress event missing libraryId');
            return;
          }

          // Update cover count for the library's active scan
          setState((prev) => {
            const existingJob = prev.activeScans[libraryId];

            // If we don't have an existing job, ignore the cover progress
            if (!existingJob) {
              return prev;
            }

            // Only update counts when a cover job completes
            if (data.status === 'complete') {
              const newCovers = data.coversExtracted || 0;
              const existingCovers = existingJob.coversExtracted || 0;
              const existingJobsComplete = existingJob.coverJobsComplete || 0;

              // Use additive approach - each cover job adds its extracted covers
              // to the running total, and increment the completed job count
              const updatedJob = {
                ...existingJob,
                coversExtracted: existingCovers + newCovers,
                coverJobsComplete: existingJobsComplete + 1,
              };

              return {
                ...prev,
                activeScans: {
                  ...prev.activeScans,
                  [libraryId]: updatedJob,
                },
              };
            }

            return prev;
          });
        } catch (error) {
          console.debug('Failed to parse cover progress event:', error);
        }
      });

      eventSource.onerror = () => {
        setSseConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        // Schedule reconnect with exponential backoff
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, SSE_MAX_RECONNECT_DELAY);

        reconnectTimeoutRef.current = setTimeout(() => {
          console.debug('Attempting scan SSE reconnect...');
          connectSSE();
        }, delay);
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.debug('Failed to create scan EventSource:', error);
      setSseConnected(false);
    }
  }, [handleScanComplete]);

  // Set up SSE connection when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      // Clean up connection when not authenticated
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setSseConnected(false);
      return;
    }

    // Connect to SSE
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
    // connectSSE is stable (only depends on handleScanComplete which has empty deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Load active scans on mount to initialize state for SSE tracking
  // This ensures that if a user reloads the page or opens a new tab while a scan is running,
  // the SSE events will be properly processed and real-time data will be displayed
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadActiveScans = async () => {
      try {
        const { jobs } = await getAllActiveScans();
        if (jobs.length > 0) {
          setState((prev) => {
            const newActiveScans: Record<string, LibraryScanJob> = {};
            for (const job of jobs) {
              // Only add non-terminal scans
              const terminalStates: ScanJobStatus[] = ['complete', 'error', 'cancelled'];
              if (!terminalStates.includes(job.status)) {
                newActiveScans[job.libraryId] = job;
              }
            }

            // Merge with existing scans (don't overwrite scans started in this session)
            const mergedScans = { ...newActiveScans, ...prev.activeScans };

            return {
              ...prev,
              activeScans: mergedScans,
            };
          });

          // Start polling for each active scan as backup
          for (const job of jobs) {
            const terminalStates: ScanJobStatus[] = ['complete', 'error', 'cancelled'];
            if (!terminalStates.includes(job.status)) {
              pollScanStatus(job.libraryId, job.id);
            }
          }
        }
      } catch (err) {
        console.debug('Failed to load active scans:', err);
      }
    };

    loadActiveScans();
  }, [isAuthenticated, pollScanStatus]);

  const value: LibraryScanContextValue = {
    ...state,
    startScan,
    cancelScan,
    viewScan,
    closeScanView,
    refreshScan,
    hasActiveScan,
    getActiveScan,
    getScanProgress,
    getScanStageLabel,
  };

  return <LibraryScanContext.Provider value={value}>{children}</LibraryScanContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

export function useLibraryScan(): LibraryScanContextValue {
  const context = useContext(LibraryScanContext);
  if (!context) {
    throw new Error('useLibraryScan must be used within a LibraryScanProvider');
  }
  return context;
}

export default LibraryScanContext;
