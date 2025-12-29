import type { RecentlyReadItem } from '../../../services/api/series';
import { API_BASE } from '../../../services/api/shared';
import './AdminStats.css';

interface RecentlyReadCardProps {
  data: RecentlyReadItem[];
  isLoading: boolean;
}

function getCoverUrl(item: RecentlyReadItem): string | null {
  const hash = item.coverHash || item.firstIssueCoverHash;
  if (!hash) return null;
  return `${API_BASE}/covers/${hash}`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function RecentlyReadCard({ data, isLoading }: RecentlyReadCardProps) {
  if (isLoading) {
    return (
      <div className="admin-card">
        <div className="admin-card__header">
          <div>
            <h3 className="admin-card__title">Recently Read</h3>
            <p className="admin-card__subtitle">Latest reading activity</p>
          </div>
        </div>
        <div className="admin-card__skeleton" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="admin-card">
        <div className="admin-card__header">
          <div>
            <h3 className="admin-card__title">Recently Read</h3>
            <p className="admin-card__subtitle">Latest reading activity</p>
          </div>
        </div>
        <div className="admin-card__empty">No recent reading activity</div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-card__header">
        <div>
          <h3 className="admin-card__title">Recently Read</h3>
          <p className="admin-card__subtitle">Latest reading activity</p>
        </div>
      </div>
      <div className="admin-card__content">
        {data.map((item) => {
          const coverUrl = getCoverUrl(item);
          return (
            <div key={`${item.seriesId}-${item.lastReadAt}`} className="admin-card__row">
              <div className="admin-card__row-cover">
                {coverUrl && <img src={coverUrl} alt={item.seriesName} loading="lazy" />}
              </div>
              <div className="admin-card__row-info">
                <div className="admin-card__row-name">{item.seriesName}</div>
                <div className="admin-card__row-detail">
                  {item.publisher || 'Unknown Publisher'}
                </div>
              </div>
              <div className="admin-card__row-stats">
                <div className="admin-card__row-stat-value">
                  {formatRelativeTime(item.lastReadAt)}
                </div>
                <div className="admin-card__row-stat-label">
                  by {item.lastReadByUsername}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
