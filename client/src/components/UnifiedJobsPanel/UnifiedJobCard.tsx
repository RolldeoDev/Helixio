/**
 * UnifiedJobCard Component
 *
 * Displays a single job in the unified jobs panel.
 */

import { formatDistanceToNow } from 'date-fns';
import type { UnifiedJob } from '../../services/api/jobs';
import { useCancelJob } from '../../hooks/queries/useUnifiedJobs';
import './UnifiedJobCard.css';

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
  );
}

export default UnifiedJobCard;
