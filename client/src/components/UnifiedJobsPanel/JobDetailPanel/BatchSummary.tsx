/**
 * BatchSummary Component
 *
 * Summary statistics for a batch job.
 */

import { format } from 'date-fns';
import type { UnifiedJobDetails } from '../../../services/api/jobs';

interface BatchSummaryProps {
  job: UnifiedJobDetails;
}

export function BatchSummary({ job }: BatchSummaryProps) {
  const stats = job.stats || { total: 0, completed: 0, failed: 0, pending: 0 };
  const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), 'MMM d, h:mm a');
  };

  const getDuration = () => {
    if (!job.startedAt) return '-';
    const start = new Date(job.startedAt);
    const end = job.completedAt ? new Date(job.completedAt) : new Date();
    const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="batch-summary">
      <div className="summary-stats">
        <div className="summary-stat">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="summary-stat success">
          <span className="stat-value">{stats.completed}</span>
          <span className="stat-label">Completed</span>
        </div>
        <div className="summary-stat error">
          <span className="stat-value">{stats.failed}</span>
          <span className="stat-label">Failed</span>
        </div>
        <div className="summary-stat">
          <span className="stat-value">{stats.pending}</span>
          <span className="stat-label">Pending</span>
        </div>
      </div>

      <div className="summary-progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-text">{progress}%</span>
      </div>

      <div className="summary-info">
        <div className="info-row">
          <span className="info-label">Started:</span>
          <span className="info-value">{formatDate(job.startedAt)}</span>
        </div>
        {job.completedAt && (
          <div className="info-row">
            <span className="info-label">Completed:</span>
            <span className="info-value">{formatDate(job.completedAt)}</span>
          </div>
        )}
        <div className="info-row">
          <span className="info-label">Duration:</span>
          <span className="info-value">{getDuration()}</span>
        </div>
      </div>
    </div>
  );
}

export default BatchSummary;
