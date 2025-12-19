/**
 * BatchPanel Component
 *
 * Displays batch operations management UI including:
 * - Active batch progress
 * - Interrupted batches requiring attention
 * - Recent batch history
 * - Batch controls (cancel, resume, abandon, retry)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getActiveBatch,
  getInterruptedBatches,
  getRecentBatches,
  getBatch,
  cancelBatch,
  resumeBatch,
  abandonBatch,
  retryFailedBatchItems,
  deleteBatch,
  type BatchProgress,
  type BatchStatus,
} from '../../services/api.service';

interface BatchPanelProps {
  onClose?: () => void;
  libraryId?: string;
}

export function BatchPanel({ onClose, libraryId: _libraryId }: BatchPanelProps) {
  const [activeBatch, setActiveBatch] = useState<BatchProgress | null>(null);
  const [interruptedBatches, setInterruptedBatches] = useState<BatchProgress[]>([]);
  const [recentBatches, setRecentBatches] = useState<BatchProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [activeResult, interruptedResult, recentResult] = await Promise.all([
        getActiveBatch(),
        getInterruptedBatches(),
        getRecentBatches(20),
      ]);

      if (activeResult.activeBatchId) {
        const batchDetails = await getBatch(activeResult.activeBatchId);
        setActiveBatch(batchDetails);
      } else {
        setActiveBatch(null);
      }

      setInterruptedBatches(interruptedResult.batches);
      setRecentBatches(recentResult.batches);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Poll for updates when there's an active batch
    const interval = window.setInterval(() => {
      if (activeBatch?.status === 'in_progress') {
        loadData();
      }
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [loadData, activeBatch?.status]);

  const handleCancel = async () => {
    if (!activeBatch) return;
    try {
      await cancelBatch(activeBatch.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel batch');
    }
  };

  const handleResume = async (batchId: string) => {
    try {
      await resumeBatch(batchId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume batch');
    }
  };

  const handleAbandon = async (batchId: string) => {
    try {
      await abandonBatch(batchId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to abandon batch');
    }
  };

  const handleRetry = async (batchId: string) => {
    try {
      await retryFailedBatchItems(batchId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry batch');
    }
  };

  const handleDelete = async (batchId: string) => {
    try {
      await deleteBatch(batchId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete batch');
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

  const getStatusBadgeClass = (status: BatchStatus) => {
    switch (status) {
      case 'completed':
        return 'badge-success';
      case 'failed':
        return 'badge-danger';
      case 'in_progress':
        return 'badge-primary';
      case 'paused':
        return 'badge-warning';
      case 'cancelled':
        return 'badge-secondary';
      default:
        return 'badge-secondary';
    }
  };

  const getBatchTypeLabel = (type: string) => {
    switch (type) {
      case 'convert':
        return 'CBR to CBZ Conversion';
      case 'rename':
        return 'Rename Files';
      case 'move':
        return 'Move Files';
      case 'delete':
        return 'Delete Files';
      case 'metadata_update':
        return 'Update Metadata';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="batch-panel">
        <div className="batch-panel-header">
          <h2>Batch Operations</h2>
          {onClose && (
            <button className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <div className="batch-panel-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="batch-panel">
      <div className="batch-panel-header">
        <h2>Batch Operations</h2>
        {onClose && (
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      {error && (
        <div className="batch-panel-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Active Batch */}
      {activeBatch && (
        <section className="batch-section">
          <h3>Active Operation</h3>
          <div className="batch-card batch-card-active">
            <div className="batch-card-header">
              <span className="batch-type">{getBatchTypeLabel(activeBatch.type)}</span>
              <span className={`badge ${getStatusBadgeClass(activeBatch.status)}`}>
                {activeBatch.status}
              </span>
            </div>

            <div className="batch-progress">
              <div className="batch-progress-bar">
                <div
                  className="batch-progress-fill"
                  style={{ width: `${activeBatch.progress}%` }}
                />
              </div>
              <div className="batch-progress-text">
                {activeBatch.progress}% ({activeBatch.completedItems} /{' '}
                {activeBatch.totalItems})
              </div>
            </div>

            {activeBatch.currentItem && (
              <div className="batch-current-item">
                Current: {activeBatch.currentItem}
              </div>
            )}

            <div className="batch-stats">
              <span>Completed: {activeBatch.completedItems}</span>
              <span>Failed: {activeBatch.failedItems}</span>
              <span>Duration: {formatDuration(activeBatch.startedAt)}</span>
            </div>

            {activeBatch.status === 'in_progress' && (
              <div className="batch-actions">
                <button className="btn btn-warning" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Interrupted Batches */}
      {interruptedBatches.length > 0 && (
        <section className="batch-section">
          <h3>Needs Attention</h3>
          {interruptedBatches.map((batch) => (
            <div key={batch.id} className="batch-card batch-card-interrupted">
              <div className="batch-card-header">
                <span className="batch-type">{getBatchTypeLabel(batch.type)}</span>
                <span className={`badge ${getStatusBadgeClass(batch.status)}`}>
                  {batch.status}
                </span>
              </div>

              <div className="batch-progress">
                <div className="batch-progress-bar">
                  <div
                    className="batch-progress-fill batch-progress-paused"
                    style={{ width: `${batch.progress}%` }}
                  />
                </div>
                <div className="batch-progress-text">
                  {batch.progress}% ({batch.completedItems} / {batch.totalItems})
                </div>
              </div>

              {batch.lastProcessedPath && (
                <div className="batch-last-processed">
                  Last: {batch.lastProcessedPath.split('/').pop()}
                </div>
              )}

              <div className="batch-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => handleResume(batch.id)}
                >
                  Resume
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleAbandon(batch.id)}
                >
                  Abandon
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Recent Batches */}
      <section className="batch-section">
        <h3>Recent Batches</h3>
        {recentBatches.length === 0 ? (
          <div className="batch-empty">No recent batch operations</div>
        ) : (
          <div className="batch-list">
            {recentBatches
              .filter((b) => b.id !== activeBatch?.id)
              .filter(
                (b) => !interruptedBatches.find((ib) => ib.id === b.id)
              )
              .map((batch) => (
                <div key={batch.id} className="batch-card batch-card-history">
                  <div className="batch-card-header">
                    <span className="batch-type">
                      {getBatchTypeLabel(batch.type)}
                    </span>
                    <span className={`badge ${getStatusBadgeClass(batch.status)}`}>
                      {batch.status}
                    </span>
                  </div>

                  <div className="batch-stats">
                    <span>
                      {batch.completedItems}/{batch.totalItems} completed
                    </span>
                    {batch.failedItems > 0 && (
                      <span className="batch-failed">
                        {batch.failedItems} failed
                      </span>
                    )}
                    <span>
                      {batch.completedAt
                        ? new Date(batch.completedAt).toLocaleString()
                        : '-'}
                    </span>
                  </div>

                  {batch.errors.length > 0 && (
                    <details className="batch-errors">
                      <summary>
                        {batch.errors.length} error(s)
                      </summary>
                      <ul>
                        {batch.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>
                            <strong>{err.filename}:</strong> {err.error}
                          </li>
                        ))}
                        {batch.errors.length > 5 && (
                          <li>...and {batch.errors.length - 5} more</li>
                        )}
                      </ul>
                    </details>
                  )}

                  <div className="batch-actions">
                    {batch.status === 'completed' &&
                      batch.failedItems > 0 && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleRetry(batch.id)}
                        >
                          Retry Failed
                        </button>
                      )}
                    {['completed', 'failed', 'cancelled'].includes(
                      batch.status
                    ) && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDelete(batch.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default BatchPanel;
