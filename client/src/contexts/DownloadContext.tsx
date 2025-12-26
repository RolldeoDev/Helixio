/**
 * Download Context
 *
 * Provides download functionality across the app including:
 * - Single file direct downloads
 * - Series/bulk ZIP downloads with background processing
 * - Real-time progress updates via SSE
 * - Download confirmation for large series
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

// =============================================================================
// Types
// =============================================================================

export type DownloadStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'downloading'
  | 'completed'
  | 'failed';

export interface DownloadJob {
  id: string;
  type: 'single' | 'series' | 'bulk';
  status: DownloadStatus;
  progress: number; // 0-100
  message: string;
  seriesName?: string;
  fileCount: number;
  totalSizeBytes: number;
  downloadUrls?: string[];
  outputParts?: string[];
  error?: string;
  createdAt: Date;
}

export interface DownloadEstimate {
  totalSizeBytes: number;
  fileCount: number;
  suggestSplit: boolean;
  estimatedParts: number;
  files: Array<{
    id: string;
    filename: string;
    size: number;
    exists: boolean;
  }>;
}

export interface ConfirmationState {
  isOpen: boolean;
  seriesId?: string;
  seriesName?: string;
  fileIds?: string[];
  estimate?: DownloadEstimate;
  onConfirm?: (options: { splitEnabled: boolean; splitSizeBytes?: number }) => void;
  onCancel?: () => void;
}

export interface DownloadContextType {
  // Active downloads
  activeDownloads: DownloadJob[];
  isDownloading: boolean;

  // Single file download
  downloadSingleFile: (fileId: string, filename: string) => void;

  // Series download
  requestSeriesDownload: (seriesId: string, seriesName: string) => Promise<void>;

  // Bulk download
  requestBulkDownload: (fileIds: string[], seriesName?: string) => Promise<void>;

  // Job management
  cancelDownload: (jobId: string) => void;
  clearCompleted: () => void;
  downloadReadyJob: (jobId: string, partIndex?: number) => void;

  // Confirmation modal state
  confirmationState: ConfirmationState;
  closeConfirmation: () => void;
}

// =============================================================================
// Context
// =============================================================================

const DownloadContext = createContext<DownloadContextType | null>(null);

// =============================================================================
// API Helpers
// =============================================================================

const API_BASE = '/api/downloads';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response.json();
}

// =============================================================================
// Provider
// =============================================================================

interface DownloadProviderProps {
  children: ReactNode;
}

export function DownloadProvider({ children }: DownloadProviderProps) {
  const [activeDownloads, setActiveDownloads] = useState<DownloadJob[]>([]);
  const [confirmationState, setConfirmationState] = useState<ConfirmationState>({
    isOpen: false,
  });

  // Track SSE connections
  const sseConnections = useRef<Map<string, EventSource>>(new Map());

  // ==========================================================================
  // Single File Download
  // ==========================================================================

  const downloadSingleFile = useCallback((fileId: string, filename: string) => {
    // Create a hidden anchor and trigger download
    const link = document.createElement('a');
    link.href = `${API_BASE}/file/${fileId}`;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // ==========================================================================
  // SSE Connection Management
  // ==========================================================================

  const connectToJobProgress = useCallback((jobId: string) => {
    // Close existing connection if any
    const existing = sseConnections.current.get(jobId);
    if (existing) {
      existing.close();
    }

    const eventSource = new EventSource(`${API_BASE}/job/${jobId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        setActiveDownloads((prev) =>
          prev.map((job) => {
            if (job.id !== jobId) return job;

            const progress =
              data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;

            let status: DownloadStatus = job.status;
            if (data.status === 'preparing') status = 'preparing';
            else if (data.status === 'ready') status = 'ready';
            else if (data.status === 'failed') status = 'failed';

            return {
              ...job,
              status,
              progress,
              message: data.message,
              error: data.status === 'failed' ? data.message : undefined,
            };
          })
        );

        // Close connection when job is complete
        if (data.status === 'ready' || data.status === 'failed') {
          eventSource.close();
          sseConnections.current.delete(jobId);
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    };

    eventSource.onerror = () => {
      // Reconnect after a delay
      eventSource.close();
      sseConnections.current.delete(jobId);

      setTimeout(() => {
        // Check if job still exists and needs reconnection
        setActiveDownloads((prev) => {
          const job = prev.find((j) => j.id === jobId);
          if (job && ['pending', 'preparing'].includes(job.status)) {
            connectToJobProgress(jobId);
          }
          return prev;
        });
      }, 3000);
    };

    sseConnections.current.set(jobId, eventSource);
  }, []);

  // ==========================================================================
  // Job Creation
  // ==========================================================================

  const createJobAndConnect = useCallback(
    async (
      type: 'series' | 'bulk',
      options: {
        seriesId?: string;
        fileIds?: string[];
        seriesName?: string;
        splitEnabled?: boolean;
        splitSizeBytes?: number;
      }
    ) => {
      const { seriesId, fileIds, seriesName, splitEnabled, splitSizeBytes } = options;

      try {
        let result: {
          jobId: string;
          estimatedSize: number;
          fileCount: number;
          needsConfirmation: boolean;
        };

        if (type === 'series' && seriesId) {
          result = await fetchApi(`/series/${seriesId}`, {
            method: 'POST',
            body: JSON.stringify({ splitEnabled, splitSizeBytes }),
          });
        } else if (type === 'bulk' && fileIds) {
          result = await fetchApi('/bulk', {
            method: 'POST',
            body: JSON.stringify({ fileIds, splitEnabled, splitSizeBytes }),
          });
        } else {
          throw new Error('Invalid job options');
        }

        // Add to active downloads
        const newJob: DownloadJob = {
          id: result.jobId,
          type,
          status: 'pending',
          progress: 0,
          message: 'Waiting in queue...',
          seriesName: seriesName || 'Download',
          fileCount: result.fileCount,
          totalSizeBytes: result.estimatedSize,
          createdAt: new Date(),
        };

        setActiveDownloads((prev) => [...prev, newJob]);

        // Connect to progress updates
        connectToJobProgress(result.jobId);
      } catch (error) {
        console.error('Failed to create download job:', error);
        throw error;
      }
    },
    [connectToJobProgress]
  );

  // ==========================================================================
  // Series Download
  // ==========================================================================

  const requestSeriesDownload = useCallback(
    async (seriesId: string, seriesName: string) => {
      try {
        // Get estimate first
        const estimate: DownloadEstimate = await fetchApi(
          `/estimate/series/${seriesId}`
        );

        // Check if confirmation is needed
        const needsConfirmation =
          estimate.fileCount > 50 ||
          estimate.totalSizeBytes > 1024 * 1024 * 1024; // 1GB

        if (needsConfirmation) {
          // Show confirmation modal
          setConfirmationState({
            isOpen: true,
            seriesId,
            seriesName,
            estimate,
            onConfirm: async (options) => {
              setConfirmationState({ isOpen: false });
              await createJobAndConnect('series', {
                seriesId,
                seriesName,
                splitEnabled: options.splitEnabled,
                splitSizeBytes: options.splitSizeBytes,
              });
            },
            onCancel: () => {
              setConfirmationState({ isOpen: false });
            },
          });
        } else {
          // Start download immediately
          await createJobAndConnect('series', {
            seriesId,
            seriesName,
            splitEnabled: estimate.suggestSplit,
          });
        }
      } catch (error) {
        console.error('Failed to request series download:', error);
        throw error;
      }
    },
    [createJobAndConnect]
  );

  // ==========================================================================
  // Bulk Download
  // ==========================================================================

  const requestBulkDownload = useCallback(
    async (fileIds: string[], seriesName?: string) => {
      try {
        // Get estimate first
        const estimate: DownloadEstimate = await fetchApi('/estimate/bulk', {
          method: 'POST',
          body: JSON.stringify({ fileIds }),
        });

        // Check if confirmation is needed
        const needsConfirmation =
          estimate.fileCount > 50 ||
          estimate.totalSizeBytes > 1024 * 1024 * 1024;

        if (needsConfirmation) {
          // Show confirmation modal
          setConfirmationState({
            isOpen: true,
            fileIds,
            seriesName,
            estimate,
            onConfirm: async (options) => {
              setConfirmationState({ isOpen: false });
              await createJobAndConnect('bulk', {
                fileIds,
                seriesName,
                splitEnabled: options.splitEnabled,
                splitSizeBytes: options.splitSizeBytes,
              });
            },
            onCancel: () => {
              setConfirmationState({ isOpen: false });
            },
          });
        } else {
          // Start download immediately
          await createJobAndConnect('bulk', {
            fileIds,
            seriesName,
            splitEnabled: estimate.suggestSplit,
          });
        }
      } catch (error) {
        console.error('Failed to request bulk download:', error);
        throw error;
      }
    },
    [createJobAndConnect]
  );

  // ==========================================================================
  // Job Management
  // ==========================================================================

  const cancelDownload = useCallback(async (jobId: string) => {
    try {
      await fetchApi(`/job/${jobId}`, { method: 'DELETE' });

      // Close SSE connection
      const connection = sseConnections.current.get(jobId);
      if (connection) {
        connection.close();
        sseConnections.current.delete(jobId);
      }

      // Remove from active downloads
      setActiveDownloads((prev) => prev.filter((job) => job.id !== jobId));
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }
  }, []);

  const clearCompleted = useCallback(() => {
    setActiveDownloads((prev) =>
      prev.filter((job) => !['completed', 'failed'].includes(job.status))
    );
  }, []);

  const downloadReadyJob = useCallback((jobId: string, partIndex = 0) => {
    const link = document.createElement('a');
    link.href = `${API_BASE}/job/${jobId}/download?part=${partIndex}`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Mark as downloading, then completed after a short delay
    setActiveDownloads((prev) =>
      prev.map((job) =>
        job.id === jobId ? { ...job, status: 'downloading' as DownloadStatus } : job
      )
    );

    setTimeout(() => {
      setActiveDownloads((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, status: 'completed' as DownloadStatus } : job
        )
      );
    }, 2000);
  }, []);

  const closeConfirmation = useCallback(() => {
    setConfirmationState({ isOpen: false });
  }, []);

  // ==========================================================================
  // Computed Values
  // ==========================================================================

  const isDownloading = activeDownloads.some((job) =>
    ['pending', 'preparing', 'downloading'].includes(job.status)
  );

  // ==========================================================================
  // Context Value
  // ==========================================================================

  const value: DownloadContextType = {
    activeDownloads,
    isDownloading,
    downloadSingleFile,
    requestSeriesDownload,
    requestBulkDownload,
    cancelDownload,
    clearCompleted,
    downloadReadyJob,
    confirmationState,
    closeConfirmation,
  };

  return (
    <DownloadContext.Provider value={value}>
      {children}
    </DownloadContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useDownloads(): DownloadContextType {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownloads must be used within a DownloadProvider');
  }
  return context;
}

// =============================================================================
// Utility Functions
// =============================================================================

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}
