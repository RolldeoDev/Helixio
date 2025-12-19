/**
 * RollbackPanel Component
 *
 * Displays operation history and allows users to rollback operations.
 * Shows file operations within the retention period (default 10 days).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getOperationHistory,
  getOperationStats,
  rollbackOperation,
  rollbackBatch as rollbackBatchApi,
  cleanupOperationLogs,
  type OperationHistoryEntry,
  type OperationStats,
} from '../../services/api.service';

interface RollbackPanelProps {
  onClose?: () => void;
  libraryId?: string;
}

export function RollbackPanel({ onClose, libraryId }: RollbackPanelProps) {
  const [operations, setOperations] = useState<OperationHistoryEntry[]>([]);
  const [stats, setStats] = useState<OperationStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<{
    operation?: string;
    status?: string;
    daysBack?: number;
  }>({ daysBack: 10 });

  const pageSize = 20;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [historyResult, statsResult] = await Promise.all([
        getOperationHistory({
          libraryId,
          operation: filter.operation,
          status: filter.status,
          daysBack: filter.daysBack,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        getOperationStats({ libraryId, daysBack: filter.daysBack }),
      ]);

      setOperations(historyResult.operations);
      setTotal(historyResult.total);
      setStats(statsResult);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [libraryId, filter, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRollback = async (operationId: string) => {
    try {
      const result = await rollbackOperation(operationId);
      if (result.success) {
        setSuccessMessage(`Successfully rolled back ${result.operation} operation`);
        setTimeout(() => setSuccessMessage(null), 3000);
        await loadData();
      } else {
        setError(result.error || 'Rollback failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rollback');
    }
  };

  const handleRollbackBatch = async (batchId: string) => {
    try {
      const result = await rollbackBatchApi(batchId);
      setSuccessMessage(
        `Rolled back ${result.rolledBack} operations (${result.failed} failed, ${result.skipped} skipped)`
      );
      setTimeout(() => setSuccessMessage(null), 5000);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rollback batch');
    }
  };

  const handleCleanup = async () => {
    try {
      const result = await cleanupOperationLogs(filter.daysBack);
      setSuccessMessage(result.message);
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cleanup logs');
    }
  };

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'move':
        return '→';
      case 'rename':
        return '✎';
      case 'delete':
        return '×';
      case 'quarantine':
        return '⚠';
      case 'restore':
        return '↩';
      case 'convert':
        return '⟲';
      case 'metadata_update':
        return '📝';
      case 'rollback':
        return '↶';
      default:
        return '•';
    }
  };

  const formatPath = (path: string) => {
    const parts = path.split('/');
    if (parts.length <= 3) return path;
    return `.../${parts.slice(-2).join('/')}`;
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="rollback-panel">
      <div className="rollback-panel-header">
        <h2>Operation History</h2>
        {onClose && (
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      {error && (
        <div className="rollback-panel-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {successMessage && (
        <div className="rollback-panel-success">
          <span>{successMessage}</span>
        </div>
      )}

      {/* Stats Summary */}
      {stats && (
        <div className="rollback-stats">
          <div className="stat">
            <span className="stat-value">{stats.totalOperations}</span>
            <span className="stat-label">Total Operations</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.reversibleCount}</span>
            <span className="stat-label">Reversible</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.rolledBackCount}</span>
            <span className="stat-label">Rolled Back</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rollback-filters">
        <select
          value={filter.operation || ''}
          onChange={(e) =>
            setFilter({ ...filter, operation: e.target.value || undefined })
          }
        >
          <option value="">All Operations</option>
          <option value="move">Move</option>
          <option value="rename">Rename</option>
          <option value="delete">Delete</option>
          <option value="quarantine">Quarantine</option>
          <option value="restore">Restore</option>
          <option value="convert">Convert</option>
          <option value="metadata_update">Metadata Update</option>
          <option value="rollback">Rollback</option>
        </select>

        <select
          value={filter.status || ''}
          onChange={(e) =>
            setFilter({ ...filter, status: e.target.value || undefined })
          }
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>

        <select
          value={filter.daysBack || 10}
          onChange={(e) =>
            setFilter({ ...filter, daysBack: parseInt(e.target.value) })
          }
        >
          <option value="1">Last 24 hours</option>
          <option value="3">Last 3 days</option>
          <option value="7">Last 7 days</option>
          <option value="10">Last 10 days</option>
          <option value="30">Last 30 days</option>
        </select>

        <button className="btn btn-ghost btn-sm" onClick={handleCleanup}>
          Cleanup Old Logs
        </button>
      </div>

      {/* Operations List */}
      {loading ? (
        <div className="rollback-loading">Loading...</div>
      ) : operations.length === 0 ? (
        <div className="rollback-empty">No operations found</div>
      ) : (
        <div className="rollback-list">
          {operations.map((op) => (
            <div
              key={op.id}
              className={`rollback-item ${op.canRollback ? 'rollback-item-reversible' : ''} ${op.alreadyRolledBack ? 'rollback-item-rolled-back' : ''}`}
            >
              <div className="rollback-item-icon">
                {getOperationIcon(op.operation)}
              </div>

              <div className="rollback-item-content">
                <div className="rollback-item-header">
                  <span className="rollback-operation">{op.operation}</span>
                  <span
                    className={`badge ${op.status === 'success' ? 'badge-success' : op.status === 'failed' ? 'badge-danger' : 'badge-secondary'}`}
                  >
                    {op.status}
                  </span>
                  {op.alreadyRolledBack && (
                    <span className="badge badge-info">rolled back</span>
                  )}
                  {op.batchType && (
                    <span className="badge badge-secondary">{op.batchType}</span>
                  )}
                </div>

                <div className="rollback-item-paths">
                  <div className="rollback-path">
                    <span className="path-label">From:</span>
                    <span className="path-value" title={op.source}>
                      {formatPath(op.source)}
                    </span>
                  </div>
                  {op.destination && (
                    <div className="rollback-path">
                      <span className="path-label">To:</span>
                      <span className="path-value" title={op.destination}>
                        {formatPath(op.destination)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="rollback-item-time">{formatTime(op.timestamp)}</div>
              </div>

              <div className="rollback-item-actions">
                {op.canRollback && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRollback(op.id)}
                  >
                    Rollback
                  </button>
                )}
                {op.batchId && !op.alreadyRolledBack && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleRollbackBatch(op.batchId!)}
                    title="Rollback entire batch"
                  >
                    Rollback Batch
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="rollback-pagination">
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default RollbackPanel;
