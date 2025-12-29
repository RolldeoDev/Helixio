import type { UserReadingRanking } from '../../../services/api/series';
import './AdminStats.css';

interface ActiveUsersCardProps {
  data: UserReadingRanking[];
  isLoading: boolean;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) {
    return `${hours}h`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
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

export function ActiveUsersCard({ data, isLoading }: ActiveUsersCardProps) {
  if (isLoading) {
    return (
      <div className="admin-card">
        <div className="admin-card__header">
          <div>
            <h3 className="admin-card__title">Most Active Users</h3>
            <p className="admin-card__subtitle">Top readers by session count</p>
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
            <h3 className="admin-card__title">Most Active Users</h3>
            <p className="admin-card__subtitle">Top readers by session count</p>
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
          <h3 className="admin-card__title">Most Active Users</h3>
          <p className="admin-card__subtitle">Top readers by session count</p>
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
              <div className="admin-card__row-detail">
                {formatDuration(user.readingTime)} total reading time
              </div>
            </div>
            <div className="admin-card__row-stats">
              <div className="admin-card__row-stat-value">{user.readCount}</div>
              <div className="admin-card__row-stat-label">sessions</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
