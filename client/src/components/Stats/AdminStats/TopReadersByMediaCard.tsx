import type { TopReaderByMediaType } from '../../../services/api/series';
import './AdminStats.css';

interface TopReadersByMediaCardProps {
  data: TopReaderByMediaType[];
  isLoading: boolean;
}

function getInitials(username: string, displayName: string | null): string {
  const name = displayName || username;
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatHours(hours: number): string {
  if (hours >= 1) {
    return `${hours.toFixed(1)}h`;
  }
  return `${Math.round(hours * 60)}m`;
}

export function TopReadersByMediaCard({ data, isLoading }: TopReadersByMediaCardProps) {
  if (isLoading) {
    return (
      <div className="admin-card">
        <div className="admin-card__header">
          <div>
            <h3 className="admin-card__title">Top Readers by Media</h3>
            <p className="admin-card__subtitle">Comics vs Manga breakdown</p>
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
            <h3 className="admin-card__title">Top Readers by Media</h3>
            <p className="admin-card__subtitle">Comics vs Manga breakdown</p>
          </div>
        </div>
        <div className="admin-card__empty">No reading activity in this period</div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-card__header">
        <div>
          <h3 className="admin-card__title">Top Readers by Media</h3>
          <p className="admin-card__subtitle">Comics vs Manga breakdown</p>
        </div>
      </div>
      <div className="admin-card__content">
        {data.map((user, index) => (
          <div key={user.userId} className="admin-card__row">
            <span className={`admin-card__row-rank admin-card__row-rank--${index + 1}`}>
              {index + 1}
            </span>
            <div className="admin-card__row-avatar">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} />
              ) : (
                getInitials(user.username, user.displayName)
              )}
            </div>
            <div className="admin-card__row-info">
              <div className="admin-card__row-name">
                {user.displayName || user.username}
              </div>
              <div className="admin-card__media-breakdown">
                <div className="admin-card__media-item">
                  <span className="admin-card__media-dot admin-card__media-dot--comics" />
                  <span>Comics: {formatHours(user.comicsHours)}</span>
                </div>
                <div className="admin-card__media-item">
                  <span className="admin-card__media-dot admin-card__media-dot--manga" />
                  <span>Manga: {formatHours(user.mangaHours)}</span>
                </div>
              </div>
            </div>
            <div className="admin-card__row-stats">
              <div className="admin-card__row-stat-value">{user.readCount}</div>
              <div className="admin-card__row-stat-label">total</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
