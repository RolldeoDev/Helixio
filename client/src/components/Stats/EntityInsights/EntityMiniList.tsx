import type { EntityStatResult } from '../../../services/api.service';
import type { ViewMode, PagesSubMode } from './EntityInsights';
import { formatNumber } from '../../../utils/format';
import './EntityInsights.css';

interface EntityMiniListProps {
  entities: EntityStatResult[];
  maxItems?: number;
  viewMode: ViewMode;
  pagesSubMode: PagesSubMode;
}

export function EntityMiniList({
  entities,
  maxItems = 3,
  viewMode,
  pagesSubMode,
}: EntityMiniListProps) {
  const displayEntities = entities.slice(0, maxItems);

  if (displayEntities.length === 0) {
    return <div className="entity-mini-list__empty">No data yet</div>;
  }

  return (
    <ul className="entity-mini-list">
      {displayEntities.map((entity, index) => {
        const readPercent = Math.round(entity.readPercentage);

        // Determine what to display based on view mode
        const count = viewMode === 'pages'
          ? (pagesSubMode === 'owned' ? entity.ownedPages : entity.readPages)
          : entity.ownedComics;

        return (
          <li key={`${entity.entityName}-${entity.entityRole ?? ''}`} className="entity-mini-item">
            <span className="entity-mini-item__rank">{index + 1}</span>
            <div className="entity-mini-item__info">
              <span className="entity-mini-item__name">
                {entity.entityName}
                {entity.entityRole && (
                  <span className="entity-mini-item__role">
                    {entity.entityRole}
                  </span>
                )}
              </span>
              <div className="entity-mini-item__progress">
                <div
                  className="entity-mini-item__progress-fill"
                  style={{ width: `${readPercent}%` }}
                />
              </div>
            </div>
            <span className="entity-mini-item__count">{formatNumber(count)}</span>
          </li>
        );
      })}
    </ul>
  );
}
