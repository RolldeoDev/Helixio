import type { EntityStatResult } from '../../../services/api.service';
import './EntityInsights.css';

interface EntityMiniListProps {
  entities: EntityStatResult[];
  maxItems?: number;
}

export function EntityMiniList({ entities, maxItems = 3 }: EntityMiniListProps) {
  const displayEntities = entities.slice(0, maxItems);

  if (displayEntities.length === 0) {
    return <div className="entity-mini-list__empty">No data yet</div>;
  }

  return (
    <ul className="entity-mini-list">
      {displayEntities.map((entity, index) => {
        const readPercent = Math.round(entity.readPercentage);

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
            <span className="entity-mini-item__count">{entity.ownedComics}</span>
          </li>
        );
      })}
    </ul>
  );
}
