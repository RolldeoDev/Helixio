import type { PopularSeriesItem } from '../../../services/api/series';
import { API_BASE } from '../../../services/api/shared';
import './AdminStats.css';

interface PopularSeriesCardProps {
  data: PopularSeriesItem[];
  isLoading: boolean;
}

function getCoverUrl(item: PopularSeriesItem): string | null {
  const hash = item.coverHash || item.firstIssueCoverHash;
  if (!hash) return null;
  return `${API_BASE}/covers/${hash}`;
}

export function PopularSeriesCard({ data, isLoading }: PopularSeriesCardProps) {
  if (isLoading) {
    return (
      <div className="admin-card">
        <div className="admin-card__header">
          <div>
            <h3 className="admin-card__title">Popular Series</h3>
            <p className="admin-card__subtitle">Most read series</p>
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
            <h3 className="admin-card__title">Popular Series</h3>
            <p className="admin-card__subtitle">Most read series</p>
          </div>
        </div>
        <div className="admin-card__empty">No series activity in this period</div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-card__header">
        <div>
          <h3 className="admin-card__title">Popular Series</h3>
          <p className="admin-card__subtitle">Most read series</p>
        </div>
      </div>
      <div className="admin-card__content">
        {data.map((series, index) => {
          const coverUrl = getCoverUrl(series);
          return (
            <div key={series.seriesId} className="admin-card__row">
              <span className={`admin-card__row-rank admin-card__row-rank--${index + 1}`}>
                {index + 1}
              </span>
              <div className="admin-card__row-cover">
                {coverUrl && <img src={coverUrl} alt={series.seriesName} loading="lazy" />}
              </div>
              <div className="admin-card__row-info">
                <div className="admin-card__row-name">{series.seriesName}</div>
                <div className="admin-card__row-detail">
                  {series.publisher || 'Unknown Publisher'} &bull; {series.userCount} reader{series.userCount !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="admin-card__row-stats">
                <div className="admin-card__row-stat-value">{series.readCount}</div>
                <div className="admin-card__row-stat-label">reads</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
