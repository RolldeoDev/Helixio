/**
 * JobDetailPanel Component
 *
 * Slide-out panel showing job details and logs.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { useJobDetails } from '../../../hooks/queries/useUnifiedJobs';
import type { UnifiedJobType, UnifiedLogType } from '../../../services/api/jobs';
import { JobLogEntry } from './JobLogEntry';
import { LogTypeFilter } from './LogTypeFilter';
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

  // Use portal to render at document body level
  // This bypasses stacking context issues from parent containers
  return createPortal(
    <>
      <div className="job-detail-backdrop" onClick={onClose} />
      <div className="job-detail-panel">
        <div className="panel-header">
          <div className="panel-title-section">
            <h2 className="panel-title">{job?.title || 'Loading...'}</h2>
            {job?.subtitle && <p className="panel-subtitle">{job.subtitle}</p>}
          </div>
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
            <>
              <LogTypeFilter
                counts={logCounts}
                visibleTypes={visibleTypes}
                onToggle={handleToggleType}
              />
              <div className="panel-logs">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <JobLogEntry key={log.id} log={log} />
                  ))
                ) : (
                  <div className="panel-empty">
                    {job.logs.length === 0
                      ? job.status === 'queued'
                        ? 'No log entries yet'
                        : 'No logs recorded'
                      : 'No logs match the current filter'}
                  </div>
                )}
              </div>
            </>
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
