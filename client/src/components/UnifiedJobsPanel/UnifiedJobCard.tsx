/**
 * UnifiedJobCard Component
 *
 * Displays a single job in the unified jobs panel.
 */

import { formatDistanceToNow } from 'date-fns';
import type { UnifiedJob } from '../../services/api/jobs';
import { useCancelJob } from '../../hooks/queries/useUnifiedJobs';
import './UnifiedJobCard.css';

function getJobIcon(job: UnifiedJob): string {
  if (job.type === 'batch') {
    switch (job.batchType) {
      case 'convert': return '🔄';
      case 'rename': return '✏️';
      case 'move': return '📁';
      case 'delete': return '🗑️';
      case 'metadata_update': return '📝';
      case 'template_rename': return '📋';
      case 'restore_original': return '↩️';
      default: return '📦';
    }
  }
  switch (job.type) {
    case 'library-scan': return '🔍';
    case 'metadata': return '📥';
    case 'rating-sync': return '⭐';
    case 'review-sync': return '💬';
    case 'similarity': return '🔗';
    default: return '📋';
  }
}

interface UnifiedJobCardProps {
  job: UnifiedJob;
  onClick?: () => void;
}

export function UnifiedJobCard({ job, onClick }: UnifiedJobCardProps) {
  const cancelMutation = useCancelJob();

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (job.canCancel) {
      cancelMutation.mutate({ type: job.type, id: job.id });
    }
  };

  const timeAgo = formatDistanceToNow(new Date(job.createdAt), { addSuffix: true });

  return (
    <div
      className={`unified-job-card status-${job.status}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      role="button"
      tabIndex={0}
    >
      <div className="job-card-icon">{getJobIcon(job)}</div>
      <div className="job-card-content">
        <div className="job-card-header">
          <div className="job-card-info">
            <h4 className="job-card-title">{job.title}</h4>
            {job.subtitle && <p className="job-card-subtitle">{job.subtitle}</p>}
          </div>
          <div className="job-card-meta">
            <span className={`job-status-badge ${job.status}`}>{job.status}</span>
          </div>
        </div>

        {job.progress !== undefined && job.status === 'running' && (
          <div className="job-card-progress">
            <div className="job-progress-bar">
              <div
                className="job-progress-fill"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <div className="job-progress-text">{job.progress}%</div>
          </div>
        )}

        {job.type === 'batch' && job.stats && job.stats.failed > 0 && (
          <div className="job-card-stats">
            <span className="job-stat-error">{job.stats.failed} failed</span>
          </div>
        )}

        {job.error && <div className="job-card-error">{job.error}</div>}

        <div className="job-card-actions">
          {job.canCancel && (
            <button
              className="job-cancel-btn"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </button>
          )}
          <span className="job-card-time">{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}

export default UnifiedJobCard;
