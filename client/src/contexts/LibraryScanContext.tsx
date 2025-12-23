/**
 * Library Scan Context
 *
 * Manages state for library scan jobs with polling for progress updates.
 * Provides functions to start scans, track progress, and cancel jobs.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  startLibraryScan,
  getScanJobStatus,
  cancelScanJob as apiCancelScanJob,
  type LibraryScanJob,
  type ScanJobStatus,
} from '../services/api.service';

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

const POLL_INTERVAL_ACTIVE = 1000; // 1 second during active processing
const POLL_INTERVAL_IDLE = 5000; // 5 seconds when idle/queued

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
  const [state, setState] = useState<LibraryScanState>({
    activeScans: {},
    viewingScanId: null,
    viewingLibraryId: null,
    starting: {},
    error: null,
  });

  const pollTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearTimeout);
    };
  }, []);

  // Poll for scan updates
  const pollScanStatus = useCallback(
    async (libraryId: string, jobId: string) => {
      try {
        const result = await getScanJobStatus(libraryId, jobId);
        const job = result.job;

        setState((prev) => ({
          ...prev,
          activeScans: {
            ...prev.activeScans,
            [libraryId]: job,
          },
          error: null,
        }));

        // Continue polling if not in terminal state
        const terminalStates: ScanJobStatus[] = ['complete', 'error', 'cancelled'];
        if (!terminalStates.includes(job.status)) {
          const isActive = ['discovering', 'cleaning', 'indexing', 'linking', 'covers'].includes(
            job.status
          );
          const interval = isActive ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE;

          pollTimers.current[libraryId] = setTimeout(() => {
            pollScanStatus(libraryId, jobId);
          }, interval);
        } else {
          // Clear from active scans after a delay (show completion message)
          setTimeout(() => {
            setState((prev) => {
              const { [libraryId]: _, ...rest } = prev.activeScans;
              return { ...prev, activeScans: rest };
            });
          }, 5000);
        }
      } catch (err) {
        console.error('Failed to poll scan status:', err);
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to get scan status',
        }));
      }
    },
    []
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

        // Start polling if not already complete
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

  // Calculate scan progress percentage
  const getScanProgress = useCallback((job: LibraryScanJob): number => {
    if (job.status === 'complete') return 100;
    if (job.status === 'queued') return 0;
    if (job.totalFiles === 0) return 0;

    // Weight each stage
    const weights = {
      discovering: 0.05,
      cleaning: 0.05,
      indexing: 0.4,
      linking: 0.3,
      covers: 0.2,
    };

    let progress = 0;

    // Completed stages
    if (['cleaning', 'indexing', 'linking', 'covers', 'complete'].includes(job.status)) {
      progress += weights.discovering * 100;
    }
    if (['indexing', 'linking', 'covers', 'complete'].includes(job.status)) {
      progress += weights.cleaning * 100;
    }
    if (['linking', 'covers', 'complete'].includes(job.status)) {
      progress += weights.indexing * 100;
    }
    if (['covers', 'complete'].includes(job.status)) {
      progress += weights.linking * 100;
    }

    // Current stage progress
    if (job.status === 'discovering') {
      // Discovery doesn't have a known total, estimate at 50%
      progress += weights.discovering * 50;
    } else if (job.status === 'indexing' && job.totalFiles > 0) {
      progress += weights.indexing * (job.indexedFiles / job.totalFiles) * 100;
    } else if (job.status === 'linking' && job.totalFiles > 0) {
      progress += weights.linking * (job.linkedFiles / job.totalFiles) * 100;
    } else if (job.status === 'covers' && job.totalFiles > 0) {
      progress += weights.covers * (job.coversExtracted / job.totalFiles) * 100;
    }

    return Math.min(100, Math.round(progress));
  }, []);

  // Get stage label
  const getScanStageLabel = useCallback((status: ScanJobStatus): string => {
    return STAGE_LABELS[status] || status;
  }, []);

  // Check for active scans on mount
  useEffect(() => {
    // This could be enhanced to check all libraries for active scans
    // For now, we rely on the scan being started from the UI
  }, []);

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
