import type { LibraryReadingRanking } from '../../../services/api/series';
import './AdminStats.css';

interface PopularLibrariesCardProps {
  data: LibraryReadingRanking[];
  isLoading: boolean;
}

export function PopularLibrariesCard({ data, isLoading }: PopularLibrariesCardProps) {
  if (isLoading) {
    return (
      <div className="admin-card">
        <div className="admin-card__header">
          <div>
            <h3 className="admin-card__title">Popular Libraries</h3>
            <p className="admin-card__subtitle">Most read libraries</p>
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
            <h3 className="admin-card__title">Popular Libraries</h3>
            <p className="admin-card__subtitle">Most read libraries</p>
          </div>
        </div>
        <div className="admin-card__empty">No library activity in this period</div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-card__header">
        <div>
          <h3 className="admin-card__title">Popular Libraries</h3>
          <p className="admin-card__subtitle">Most read libraries</p>
        </div>
      </div>
      <div className="admin-card__content">
        {data.map((library, index) => (
          <div key={library.libraryId} className="admin-card__row">
            <span className={`admin-card__row-rank admin-card__row-rank--${index + 1}`}>
              {index + 1}
            </span>
            <div className="admin-card__row-info">
              <div className="admin-card__row-name">{library.libraryName}</div>
              <div className="admin-card__row-detail">
                {library.totalFiles.toLocaleString()} files &bull; {library.userCount} user{library.userCount !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="admin-card__row-stats">
              <div className="admin-card__row-stat-value">{library.readCount}</div>
              <div className="admin-card__row-stat-label">reads</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
