import { useNavigate } from 'react-router-dom';
import type { EntityStatResult, EntityType } from '../../../services/api.service';
import './EntityDrawer.css';

interface EntityDrawerListProps {
  entities: EntityStatResult[];
  entityType: EntityType;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function EntityDrawerList({
  entities,
  entityType,
  isLoading,
  hasMore,
  onLoadMore,
}: EntityDrawerListProps) {
  const navigate = useNavigate();

  const handleEntityClick = (entity: EntityStatResult) => {
    const params = new URLSearchParams();
    params.set('type', entityType);
    params.set('name', entity.entityName);
    if (entity.entityRole) {
      params.set('role', entity.entityRole);
    }
    navigate(`/stats/entity?${params.toString()}`);
  };

  if (entities.length === 0 && !isLoading) {
    return (
      <div className="entity-drawer-list__empty">
        <p>No {entityType}s found in your collection.</p>
      </div>
    );
  }

  return (
    <div className="entity-drawer-list">
      {entities.map((entity, index) => {
        const readPercent = Math.round(entity.readPercentage);

        return (
          <div
            key={`${entity.entityName}-${entity.entityRole ?? ''}-${index}`}
            className="entity-drawer-item"
            onClick={() => handleEntityClick(entity)}
          >
            <span className="entity-drawer-item__rank">{index + 1}</span>

            <div className="entity-drawer-item__info">
              <span className="entity-drawer-item__name">
                {entity.entityName}
                {entity.entityRole && (
                  <span className="entity-drawer-item__role">{entity.entityRole}</span>
                )}
              </span>
              <div className="entity-drawer-item__stats">
                <span>{entity.ownedComics} comics</span>
                <span className="entity-drawer-item__divider">·</span>
                <span>{entity.readComics} read</span>
              </div>
            </div>

            <div className="entity-drawer-item__progress-wrapper">
              <div className="entity-drawer-item__progress">
                <div
                  className="entity-drawer-item__progress-fill"
                  style={{ width: `${readPercent}%` }}
                />
              </div>
              <span className="entity-drawer-item__percent">{readPercent}%</span>
            </div>

            <svg
              className="entity-drawer-item__chevron"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </div>
        );
      })}

      {hasMore && (
        <button
          className="entity-drawer-list__load-more"
          onClick={onLoadMore}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Load More'}
        </button>
      )}

      {isLoading && entities.length === 0 && (
        <div className="entity-drawer-list__loading">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="entity-drawer-item--skeleton" />
          ))}
        </div>
      )}
    </div>
  );
}
