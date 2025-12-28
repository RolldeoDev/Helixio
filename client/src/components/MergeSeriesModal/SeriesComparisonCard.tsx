/**
 * SeriesComparisonCard Component
 *
 * Card for displaying series information in merge comparison view.
 */

import {
  SeriesForMerge,
  resolveSeriesCoverUrl,
} from '../../services/api.service';

interface SeriesComparisonCardProps {
  series: SeriesForMerge;
  isSelected?: boolean;
  isTarget?: boolean;
  isSource?: boolean;
  onSelect?: () => void;
  showRadio?: boolean;
}

export function SeriesComparisonCard({
  series,
  isSelected,
  isTarget,
  isSource,
  onSelect,
  showRadio,
}: SeriesComparisonCardProps) {
  const coverUrl = resolveSeriesCoverUrl(series);

  const cardClasses = [
    'series-comparison-card',
    isSelected && 'selected',
    isTarget && 'target',
    isSource && 'source',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClasses}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => {
        if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {showRadio && (
        <div className="series-card-radio">
          <input
            type="radio"
            checked={isSelected}
            onChange={() => onSelect?.()}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className="series-card-cover">
        {coverUrl ? (
          <img src={coverUrl} alt={series.name} />
        ) : (
          <div className="series-card-placeholder">
            {series.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="series-card-info">
        <h4 className="series-card-name">{series.name}</h4>

        <div className="series-card-meta">
          {series.startYear && (
            <span className="series-card-year">
              {series.startYear}
              {series.endYear && series.endYear !== series.startYear
                ? `-${series.endYear}`
                : ''}
            </span>
          )}

          {series.publisher && (
            <span className="series-card-publisher">{series.publisher}</span>
          )}
        </div>

        <div className="series-card-stats">
          <span className="series-card-issue-count">
            {series.ownedIssueCount} issue{series.ownedIssueCount !== 1 ? 's' : ''}
            {series.issueCount && series.issueCount !== series.ownedIssueCount && (
              <span className="series-card-total"> / {series.issueCount} total</span>
            )}
          </span>
        </div>

        <div className="series-card-ids">
          {series.comicVineId && (
            <span className="series-card-id comicvine">CV: {series.comicVineId}</span>
          )}
          {series.metronId && (
            <span className="series-card-id metron">Metron: {series.metronId}</span>
          )}
        </div>

        {series.aliases && (
          <div className="series-card-aliases">
            <span className="series-card-aliases-label">Aliases:</span>{' '}
            {series.aliases}
          </div>
        )}
      </div>

      {isTarget && <div className="series-card-badge target-badge">Target</div>}
      {isSource && <div className="series-card-badge source-badge">Will be merged</div>}
    </div>
  );
}
