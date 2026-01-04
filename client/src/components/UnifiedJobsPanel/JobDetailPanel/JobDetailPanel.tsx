/**
 * JobDetailPanel Component
 *
 * Slide-out panel showing job details and logs.
 * Uses virtualization for efficient rendering of large log lists.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { useJobDetails } from '../../../hooks/queries/useUnifiedJobs';
import type { UnifiedJobType, UnifiedLogType } from '../../../services/api/jobs';
import { BatchDetailTabs } from './BatchDetailTabs';
import {
  resumeBatchJob,
  abandonBatchJob,
  retryBatchJob,
  deleteBatchJob,
} from '../../../services/api/jobs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { JobLogEntry } from './JobLogEntry';
import { LogTypeFilter } from './LogTypeFilter';
import { useVirtualList } from '../../../hooks/useVirtualGrid';
import { useMetadataJob } from '../../../contexts/MetadataJobContext';
import { useLibraryScan } from '../../../contexts/LibraryScanContext';
import { truncatePath } from '../../../utils/format';
import './JobDetailPanel.css';

interface JobDetailPanelProps {
  jobType: UnifiedJobType;
  jobId: string;
  onClose: () => void;
}

export function JobDetailPanel({ jobType, jobId, onClose }: JobDetailPanelProps) {
  const { data: job, isLoading, error, refetch } = useJobDetails(jobType, jobId);
  const [visibleTypes, setVisibleTypes] = useState<Set<UnifiedLogType>>(
    new Set(['info', 'success', 'warning', 'error'])
  );

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Calculate log counts by type
  const logCounts = useMemo(() => {
    const counts: Record<UnifiedLogType, number> = {
      info: 0,
      success: 0,
      warning: 0,
      error: 0,
    };
    if (job?.logs) {
      for (const log of job.logs) {
        counts[log.type]++;
      }
    }
    return counts;
  }, [job?.logs]);

  // Filter logs by visible types
  const filteredLogs = useMemo(() => {
    if (!job?.logs) return [];
    return job.logs.filter((log) => visibleTypes.has(log.type));
  }, [job?.logs, visibleTypes]);

  // Virtual list for efficient rendering of large log lists
  // Uses 24px row height for compact log entries
  const { virtualItems, totalHeight, containerRef } = useVirtualList(filteredLogs, {
    itemHeight: 24,
    overscan: 10,
  });

  // Metadata job context for opening full results modal
  const { resumeJob } = useMetadataJob();

  // Library scan context for real-time SSE data
  const { getActiveScan } = useLibraryScan();
  const scanData = jobType === 'library-scan' && job?.libraryId
    ? getActiveScan(job.libraryId)
    : null;

  // Build enriched subtitle for library-scan jobs
  const enrichedSubtitle = useMemo(() => {
    if (jobType !== 'library-scan' || !scanData) {
      return job?.subtitle;
    }

    // Show folder progress if available
    if (scanData.foldersTotal && scanData.foldersTotal > 0 && job?.status === 'running') {
      return `Folder ${scanData.foldersComplete || 0} of ${scanData.foldersTotal}`;
    }

    return job?.subtitle;
  }, [jobType, job?.subtitle, job?.status, scanData]);

  // Show "View Full Results" button for completed metadata jobs
  const showViewFullResults =
    job?.type === 'metadata' &&
    job.status === 'completed';

  const handleViewFullResults = async () => {
    await resumeJob(jobId);
    onClose(); // Close the JobDetailPanel
  };

  const handleToggleType = useCallback((type: UnifiedLogType) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const queryClient = useQueryClient();

  const resumeMutation = useMutation({
    mutationFn: () => resumeBatchJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-jobs'] });
      refetch();
    },
  });

  const abandonMutation = useMutation({
    mutationFn: () => abandonBatchJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-jobs'] });
      onClose();
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryBatchJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-jobs'] });
      refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBatchJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-jobs'] });
      onClose();
    },
  });

  // Get available actions for batch jobs
  const getBatchActions = () => {
    if (job?.type !== 'batch') return [];

    const actions: Array<{ label: string; action: () => void; variant: 'primary' | 'secondary' | 'danger'; loading?: boolean }> = [];

    if (job.status === 'interrupted') {
      actions.push({
        label: 'Resume',
        action: () => resumeMutation.mutate(),
        variant: 'primary',
        loading: resumeMutation.isPending,
      });
      actions.push({
        label: 'Abandon',
        action: () => abandonMutation.mutate(),
        variant: 'secondary',
        loading: abandonMutation.isPending,
      });
    }

    if (job.status === 'completed' && job.stats?.failed && job.stats.failed > 0) {
      actions.push({
        label: 'Retry Failed',
        action: () => retryMutation.mutate(),
        variant: 'primary',
        loading: retryMutation.isPending,
      });
    }

    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      actions.push({
        label: 'Delete',
        action: () => deleteMutation.mutate(),
        variant: 'danger',
        loading: deleteMutation.isPending,
      });
    }

    return actions;
  };

  const batchActions = getBatchActions();

  // Use portal to render at document body level
  // This bypasses stacking context issues from parent containers
  return createPortal(
    <>
      <div className="job-detail-backdrop" onClick={onClose} />
      <div className="job-detail-panel">
        <div className="panel-header">
          <div className="panel-title-section">
            <h2 className="panel-title">{job?.title || 'Loading...'}</h2>
            {enrichedSubtitle && <p className="panel-subtitle">{enrichedSubtitle}</p>}
          </div>
          {(showViewFullResults || batchActions.length > 0) && (
            <div className="panel-header-actions">
              {showViewFullResults && (
                <button
                  className="panel-action-btn primary"
                  onClick={handleViewFullResults}
                  title="View complete workflow with all logs and results"
                >
                  View Full Results
                </button>
              )}
              {batchActions.map((action) => (
                <button
                  key={action.label}
                  className={`panel-action-btn ${action.variant}`}
                  onClick={action.action}
                  disabled={action.loading}
                >
                  {action.loading ? '...' : action.label}
                </button>
              ))}
            </div>
          )}
          <button className="panel-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {job && (
          <div className="panel-meta">
            <div className="panel-meta-item">
              <span className="panel-meta-label">Status:</span>
              <span className={`job-status-badge ${job.status}`}>{job.status}</span>
            </div>
            <div className="panel-meta-item">
              <span className="panel-meta-label">Created:</span>
              <span>{format(new Date(job.createdAt), 'MMM d, h:mm a')}</span>
            </div>
            {job.progress !== undefined && (
              <div className="panel-meta-item">
                <span className="panel-meta-label">Progress:</span>
                <span>{job.progress}%</span>
              </div>
            )}
          </div>
        )}

        {/* Library scan stats */}
        {jobType === 'library-scan' && scanData && job?.status === 'running' && (
          <div className="panel-scan-section">
            <div className="panel-scan-stats">
              <div className="panel-scan-stat">
                <span className="panel-scan-stat-value">{scanData.indexedFiles || 0}</span>
                <span className="panel-scan-stat-label">Files</span>
              </div>
              {(scanData.foldersTotal ?? 0) > 0 && (
                <div className="panel-scan-stat">
                  <span className="panel-scan-stat-value">{scanData.foldersComplete || 0}/{scanData.foldersTotal}</span>
                  <span className="panel-scan-stat-label">Folders</span>
                </div>
              )}
              <div className="panel-scan-stat">
                <span className="panel-scan-stat-value">{scanData.coversExtracted || 0}</span>
                <span className="panel-scan-stat-label">Covers</span>
              </div>
              <div className="panel-scan-stat">
                <span className="panel-scan-stat-value">{scanData.seriesCreated || 0}</span>
                <span className="panel-scan-stat-label">Series</span>
              </div>
            </div>
            {scanData.currentFolder && (
              <div className="panel-current-folder">
                <span className="panel-current-folder-label">Scanning:</span>
                <span className="panel-current-folder-path">{truncatePath(scanData.currentFolder, 50)}</span>
              </div>
            )}
          </div>
        )}

        <div className="panel-body">
          {isLoading ? (
            <div className="panel-loading">Loading job details...</div>
          ) : error ? (
            <div className="panel-error">
              Failed to load job details
              <button className="panel-error-retry" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          ) : job ? (
            job.type === 'batch' ? (
              <BatchDetailTabs job={job} />
            ) : (
              <>
                <LogTypeFilter
                  counts={logCounts}
                  visibleTypes={visibleTypes}
                  onToggle={handleToggleType}
                />
                <div className="panel-logs" ref={containerRef}>
                  {filteredLogs.length > 0 ? (
                    <div className="panel-logs-virtual" style={{ height: totalHeight, position: 'relative' }}>
                      {virtualItems.map((virtualItem) => (
                        <div key={virtualItem.index} style={virtualItem.style}>
                          <JobLogEntry log={virtualItem.item} compact />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="panel-empty">
                      {(job.logs?.length ?? 0) === 0
                        ? job.status === 'queued'
                          ? 'No log entries yet'
                          : 'No logs recorded'
                        : 'No logs match the current filter'}
                    </div>
                  )}
                </div>
              </>
            )
          ) : (
            <div className="panel-error">Job not found</div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

export default JobDetailPanel;
