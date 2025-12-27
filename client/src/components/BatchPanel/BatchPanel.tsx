/**
 * BatchPanel Component (Job History)
 *
 * Displays unified job history including:
 * - Batch operations (conversions, renames, moves, deletes)
 * - Metadata jobs (metadata fetch and apply operations)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getActiveBatch,
  getInterruptedBatches,
  getRecentBatches,
  getBatch,
  getBatchOperations,
  cancelBatch,
  resumeBatch,
  abandonBatch,
  retryFailedBatchItems,
  deleteBatch,
  listAllMetadataJobs,
  deleteMetadataJob,
  type BatchProgress,
  type BatchStatus,
  type MetadataJob,
  type JobStatus,
} from '../../services/api.service';
import { useMetadataJob } from '../../contexts/MetadataJobContext';
import { useAdaptivePolling } from '../../hooks';
import './BatchPanel.css';

// Unified job type for display
type UnifiedJobType = 'batch' | 'metadata';

interface UnifiedJob {
  id: string;
  type: UnifiedJobType;
  subtype: string; // 'convert', 'rename', 'metadata_fetch', etc.
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  createdAt: string;
  completedAt?: string;
  startedAt?: string;
  error?: string | null;
  // Original data for actions
  batchData?: BatchProgress;
  metadataData?: MetadataJob;
}

interface BatchOperation {
  id: string;
  operation: string;
  source: string;
  destination: string | null;
  status: string;
  error: string | null;
  timestamp: string;
  reversible: boolean;
}

interface BatchPanelProps {
  onClose?: () => void;
  libraryId?: string;
}

export function BatchPanel({ onClose, libraryId: _libraryId }: BatchPanelProps) {
  const navigate = useNavigate();
  const { resumeJob, openModal } = useMetadataJob();

  const [allJobs, setAllJobs] = useState<UnifiedJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<UnifiedJob | null>(null);
  const [batchOperations, setBatchOperations] = useState<BatchOperation[]>([]);
  const [operationsTotal, setOperationsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingOperations, setLoadingOperations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operationFilter, setOperationFilter] = useState<'all' | 'completed' | 'failed'>('all');

  // Convert BatchStatus to unified status
  const normalizeBatchStatus = (status: BatchStatus): string => {
    switch (status) {
      case 'in_progress':
        return 'in_progress';
      case 'completed':
        return 'complete';
      case 'failed':
        return 'error';
      case 'paused':
        return 'paused';
      case 'cancelled':
        return 'cancelled';
      default:
        return status;
    }
  };

  // Convert JobStatus to unified status
  const normalizeMetadataStatus = (status: JobStatus): string => {
    switch (status) {
      case 'complete':
        return 'complete';
      case 'error':
        return 'error';
      case 'cancelled':
        return 'cancelled';
      case 'applying':
        return 'in_progress';
      case 'fetching_issues':
        return 'in_progress';
      case 'initializing':
        return 'in_progress';
      default:
        return status; // options, series_approval, file_review are paused/waiting states
    }
  };

  // Fetch all job data and return with hasActive flag for adaptive polling
  const fetchJobData = useCallback(async () => {
    // Fetch both batch operations and metadata jobs
    const [activeResult, interruptedResult, recentResult, metadataResult] = await Promise.all([
      getActiveBatch(),
      getInterruptedBatches(),
      getRecentBatches(50),
      listAllMetadataJobs(),
    ]);

    const jobs: UnifiedJob[] = [];

    // Process batch operations
    const batchMap = new Map<string, BatchProgress>();

    if (activeResult.activeBatchId) {
      const batchDetails = await getBatch(activeResult.activeBatchId);
      batchMap.set(batchDetails.id, batchDetails);
    }

    for (const batch of interruptedResult.batches) {
      if (!batchMap.has(batch.id)) {
        batchMap.set(batch.id, batch);
      }
    }

    for (const batch of recentResult.batches) {
      if (!batchMap.has(batch.id)) {
        batchMap.set(batch.id, batch);
      }
    }

    // Convert batches to unified format
    for (const batch of batchMap.values()) {
      jobs.push({
        id: batch.id,
        type: 'batch',
        subtype: batch.type,
        status: normalizeBatchStatus(batch.status),
        totalItems: batch.totalItems,
        completedItems: batch.completedItems,
        failedItems: batch.failedItems,
        createdAt: batch.startedAt || new Date().toISOString(),
        completedAt: batch.completedAt,
        startedAt: batch.startedAt,
        batchData: batch,
      });
    }

    // Convert metadata jobs to unified format
    for (const job of metadataResult.jobs) {
      const applyResult = job.applyResult;
      jobs.push({
        id: job.id,
        type: 'metadata',
        subtype: 'metadata_fetch',
        status: normalizeMetadataStatus(job.status),
        totalItems: job.totalFiles,
        completedItems: applyResult?.successful ?? job.processedFiles,
        failedItems: applyResult?.failed ?? 0,
        createdAt: job.createdAt,
        completedAt: job.status === 'complete' ? job.updatedAt : undefined,
        startedAt: job.createdAt,
        error: job.error,
        metadataData: job,
      });
    }

    // Sort by date (most recent first)
    jobs.sort((a, b) => {
      const dateA = a.completedAt || a.createdAt;
      const dateB = b.completedAt || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return {
      jobs,
      hasActive: jobs.some(j => j.status === 'in_progress'),
    };
  }, []);

  // Adaptive polling - polls every 60s when idle, 3s when jobs are active
  const { data: jobData, refetch, error: fetchError } = useAdaptivePolling({
    fetchFn: fetchJobData,
    isActive: (data) => data.hasActive,
    activeInterval: 3000,
  });

  // Track if initial load has completed
  const initialLoadDone = useRef(false);

  // Update state when job data changes
  useEffect(() => {
    if (jobData) {
      setAllJobs(jobData.jobs);
      setError(null);
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setLoading(false);
      }
    }
  }, [jobData]);

  // Handle fetch errors
  useEffect(() => {
    if (fetchError) {
      setError(fetchError.message || 'Failed to load job history');
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setLoading(false);
      }
    }
  }, [fetchError]);

  // Expose refetch as loadData for action handlers
  const loadData = refetch;

  const loadBatchOperations = useCallback(async (batchId: string, filter: string) => {
    setLoadingOperations(true);
    try {
      const status = filter === 'all' ? undefined : filter;
      const result = await getBatchOperations(batchId, { status, limit: 100 });
      setBatchOperations(result.operations);
      setOperationsTotal(result.total);
    } catch (err) {
      console.error('Failed to load operations:', err);
      setBatchOperations([]);
      setOperationsTotal(0);
    } finally {
      setLoadingOperations(false);
    }
  }, []);

  useEffect(() => {
    if (selectedJob?.type === 'batch' && selectedJob.batchData) {
      loadBatchOperations(selectedJob.id, operationFilter);
    } else {
      setBatchOperations([]);
      setOperationsTotal(0);
    }
  }, [selectedJob, operationFilter, loadBatchOperations]);

  const handleSelectJob = (job: UnifiedJob) => {
    if (selectedJob?.id === job.id) {
      setSelectedJob(null);
      setBatchOperations([]);
    } else {
      setSelectedJob(job);
      setOperationFilter('all');
    }
  };

  const handleOpenMetadataJob = async (job: UnifiedJob) => {
    if (job.metadataData) {
      await resumeJob(job.metadataData.id);
      openModal();
      navigate('/jobs');
    }
  };

  // Batch operation actions
  const handleCancelBatch = async (batchId: string) => {
    try {
      await cancelBatch(batchId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
    }
  };

  const handleResumeBatch = async (batchId: string) => {
    try {
      await resumeBatch(batchId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume job');
    }
  };

  const handleAbandonBatch = async (batchId: string) => {
    try {
      await abandonBatch(batchId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to abandon job');
    }
  };

  const handleRetryBatch = async (batchId: string) => {
    try {
      await retryFailedBatchItems(batchId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry job');
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    try {
      await deleteBatch(batchId);
      if (selectedJob?.id === batchId) {
        setSelectedJob(null);
        setBatchOperations([]);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    }
  };

  const handleDeleteMetadataJob = async (jobId: string) => {
    try {
      await deleteMetadataJob(jobId);
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    }
  };

  const formatDuration = (startedAt?: string, completedAt?: string) => {
    if (!startedAt) return '-';
    const start = new Date(startedAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'complete':
      case 'completed':
        return 'status-success';
      case 'error':
      case 'failed':
        return 'status-error';
      case 'in_progress':
      case 'applying':
      case 'fetching_issues':
      case 'initializing':
        return 'status-active';
      case 'paused':
      case 'options':
      case 'series_approval':
      case 'file_review':
        return 'status-warning';
      case 'cancelled':
        return 'status-muted';
      default:
        return 'status-muted';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'complete':
        return 'Complete';
      case 'error':
        return 'Error';
      case 'in_progress':
        return 'In Progress';
      case 'paused':
        return 'Paused';
      case 'cancelled':
        return 'Cancelled';
      case 'options':
        return 'Pending Setup';
      case 'series_approval':
        return 'Awaiting Approval';
      case 'file_review':
        return 'Awaiting Review';
      case 'applying':
        return 'Applying';
      case 'fetching_issues':
        return 'Fetching';
      case 'initializing':
        return 'Initializing';
      default:
        return status;
    }
  };

  const getJobTypeLabel = (job: UnifiedJob) => {
    if (job.type === 'metadata') {
      return 'Metadata Fetch';
    }
    switch (job.subtype) {
      case 'convert':
        return 'Conversion';
      case 'rename':
        return 'Rename';
      case 'move':
        return 'Move';
      case 'delete':
        return 'Delete';
      case 'metadata_update':
        return 'Metadata Update';
      default:
        return job.subtype;
    }
  };

  const getJobTypeIcon = (job: UnifiedJob) => {
    if (job.type === 'metadata') {
      return '📥';
    }
    switch (job.subtype) {
      case 'convert':
        return '🔄';
      case 'rename':
        return '✏️';
      case 'move':
        return '📁';
      case 'delete':
        return '🗑️';
      case 'metadata_update':
        return '📝';
      default:
        return '📋';
    }
  };

  const isJobDeletable = (job: UnifiedJob): boolean => {
    return ['complete', 'error', 'cancelled', 'completed', 'failed'].includes(job.status);
  };

  if (loading) {
    return (
      <div className="job-history-panel">
        <div className="job-history-header">
          <h1>Job History</h1>
          {onClose && (
            <button className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <div className="job-history-loading">Loading job history...</div>
      </div>
    );
  }

  return (
    <div className="job-history-panel">
      <div className="job-history-header">
        <h1>Job History</h1>
        <div className="job-history-actions">
          <button className="btn btn-secondary" onClick={() => loadData()}>
            Refresh
          </button>
          {onClose && (
            <button className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="job-history-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="job-history-content">
        {/* Job List */}
        <div className="job-list">
          {allJobs.length === 0 ? (
            <div className="job-list-empty">
              <div className="empty-icon">📋</div>
              <h3>No Job History</h3>
              <p>Jobs will appear here after you perform operations like metadata fetches, conversions, or renames.</p>
            </div>
          ) : (
            allJobs.map((job) => (
              <div
                key={job.id}
                className={`job-item ${selectedJob?.id === job.id ? 'selected' : ''} ${job.status === 'in_progress' ? 'active' : ''}`}
                onClick={() => handleSelectJob(job)}
              >
                <div className="job-item-icon">
                  {getJobTypeIcon(job)}
                </div>
                <div className="job-item-content">
                  <div className="job-item-header">
                    <span className="job-type">{getJobTypeLabel(job)}</span>
                    <span className={`job-status ${getStatusBadgeClass(job.status)}`}>
                      {getStatusLabel(job.status)}
                    </span>
                  </div>
                  <div className="job-item-meta">
                    <span className="job-files">
                      {job.completedItems}/{job.totalItems} files
                      {job.failedItems > 0 && (
                        <span className="job-failed"> ({job.failedItems} failed)</span>
                      )}
                    </span>
                    <span className="job-date">
                      {formatDate(job.completedAt || job.createdAt)}
                    </span>
                  </div>
                  {job.status === 'in_progress' && job.totalItems > 0 && (
                    <div className="job-progress-bar">
                      <div
                        className="job-progress-fill"
                        style={{ width: `${Math.round((job.completedItems / job.totalItems) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="job-item-arrow">›</div>
              </div>
            ))
          )}
        </div>

        {/* Job Detail Panel */}
        {selectedJob && (
          <div className="job-detail">
            <div className="job-detail-header">
              <div className="job-detail-title">
                <span className="job-detail-icon">{getJobTypeIcon(selectedJob)}</span>
                <h2>{getJobTypeLabel(selectedJob)}</h2>
                <span className={`job-status ${getStatusBadgeClass(selectedJob.status)}`}>
                  {getStatusLabel(selectedJob.status)}
                </span>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setSelectedJob(null)}
              >
                ×
              </button>
            </div>

            <div className="job-detail-stats">
              <div className="stat">
                <span className="stat-label">Total Files</span>
                <span className="stat-value">{selectedJob.totalItems}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Completed</span>
                <span className="stat-value stat-success">{selectedJob.completedItems}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Failed</span>
                <span className="stat-value stat-error">{selectedJob.failedItems}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Duration</span>
                <span className="stat-value">
                  {formatDuration(selectedJob.startedAt, selectedJob.completedAt)}
                </span>
              </div>
            </div>

            {selectedJob.error && (
              <div className="job-error-message">
                <strong>Error:</strong> {selectedJob.error}
              </div>
            )}

            {/* Actions */}
            <div className="job-detail-actions">
              {/* Metadata job actions */}
              {selectedJob.type === 'metadata' && (
                <>
                  {!['complete', 'cancelled', 'error'].includes(selectedJob.status) && (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleOpenMetadataJob(selectedJob)}
                    >
                      {selectedJob.status === 'complete' ? 'View Results' : 'Continue'}
                    </button>
                  )}
                  {selectedJob.status === 'complete' && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleOpenMetadataJob(selectedJob)}
                    >
                      View Results
                    </button>
                  )}
                  {isJobDeletable(selectedJob) && (
                    <button
                      className="btn btn-ghost btn-danger"
                      onClick={() => handleDeleteMetadataJob(selectedJob.id)}
                    >
                      Delete
                    </button>
                  )}
                </>
              )}

              {/* Batch operation actions */}
              {selectedJob.type === 'batch' && selectedJob.batchData && (
                <>
                  {selectedJob.batchData.status === 'in_progress' && (
                    <button
                      className="btn btn-warning"
                      onClick={() => handleCancelBatch(selectedJob.id)}
                    >
                      Cancel
                    </button>
                  )}
                  {selectedJob.batchData.status === 'paused' && (
                    <>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleResumeBatch(selectedJob.id)}
                      >
                        Resume
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleAbandonBatch(selectedJob.id)}
                      >
                        Abandon
                      </button>
                    </>
                  )}
                  {selectedJob.batchData.status === 'completed' && selectedJob.batchData.failedItems > 0 && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleRetryBatch(selectedJob.id)}
                    >
                      Retry Failed
                    </button>
                  )}
                  {['completed', 'failed', 'cancelled'].includes(selectedJob.batchData.status) && (
                    <button
                      className="btn btn-ghost btn-danger"
                      onClick={() => handleDeleteBatch(selectedJob.id)}
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Operations List (only for batch operations) */}
            {selectedJob.type === 'batch' && (
              <div className="job-operations">
                <div className="job-operations-header">
                  <h3>Operations ({operationsTotal})</h3>
                  <div className="operation-filters">
                    <button
                      className={`filter-btn ${operationFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setOperationFilter('all')}
                    >
                      All
                    </button>
                    <button
                      className={`filter-btn ${operationFilter === 'completed' ? 'active' : ''}`}
                      onClick={() => setOperationFilter('completed')}
                    >
                      Completed
                    </button>
                    <button
                      className={`filter-btn ${operationFilter === 'failed' ? 'active' : ''}`}
                      onClick={() => setOperationFilter('failed')}
                    >
                      Failed
                    </button>
                  </div>
                </div>

                {loadingOperations ? (
                  <div className="job-operations-loading">Loading operations...</div>
                ) : batchOperations.length === 0 ? (
                  <div className="job-operations-empty">No operations found</div>
                ) : (
                  <div className="job-operations-list">
                    {batchOperations.map((op) => (
                      <div
                        key={op.id}
                        className={`operation-item ${op.status === 'failed' ? 'failed' : ''}`}
                      >
                        <div className="operation-status">
                          {op.status === 'completed' && '✓'}
                          {op.status === 'failed' && '✗'}
                          {op.status === 'pending' && '○'}
                        </div>
                        <div className="operation-content">
                          <div className="operation-file">
                            {op.source.split('/').pop()}
                          </div>
                          {op.destination && (
                            <div className="operation-dest">
                              → {op.destination.split('/').pop()}
                            </div>
                          )}
                          {op.error && (
                            <div className="operation-error">{op.error}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Metadata job details */}
            {selectedJob.type === 'metadata' && selectedJob.metadataData && (
              <div className="job-metadata-details">
                <h3>Job Details</h3>
                <div className="metadata-info">
                  <div className="info-row">
                    <span className="info-label">Files Processed:</span>
                    <span className="info-value">{selectedJob.metadataData.totalFiles}</span>
                  </div>
                  {selectedJob.metadataData.applyResult && (
                    <>
                      <div className="info-row">
                        <span className="info-label">Successfully Updated:</span>
                        <span className="info-value stat-success">{selectedJob.metadataData.applyResult.successful}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">Failed:</span>
                        <span className="info-value stat-error">{selectedJob.metadataData.applyResult.failed}</span>
                      </div>
                      {selectedJob.metadataData.applyResult.converted > 0 && (
                        <div className="info-row">
                          <span className="info-label">Converted to CBZ:</span>
                          <span className="info-value">{selectedJob.metadataData.applyResult.converted}</span>
                        </div>
                      )}
                    </>
                  )}
                  {selectedJob.metadataData.options?.useLLMCleanup && (
                    <div className="info-row">
                      <span className="info-label">LLM Cleanup:</span>
                      <span className="info-value">Enabled</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default BatchPanel;
