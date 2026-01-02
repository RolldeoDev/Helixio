import type { EntityStatResult, EntityType } from '../../../services/api.service';
import { EntityMiniList } from './EntityMiniList';
import type { ViewMode, PagesSubMode } from './EntityInsights';
import './EntityInsights.css';

interface EntityInsightCardProps {
  type: EntityType;
  title: string;
  icon: React.ReactNode;
  entities: EntityStatResult[];
  onViewAll: () => void;
  animationDelay?: number;
  viewMode: ViewMode;
  pagesSubMode: PagesSubMode;
}

export function EntityInsightCard({
  title,
  icon,
  entities,
  onViewAll,
  animationDelay = 0,
  viewMode,
  pagesSubMode,
}: EntityInsightCardProps) {
  return (
    <div
      className="entity-insight-card"
      style={{ animationDelay: `${animationDelay}ms` }}
      onClick={onViewAll}
    >
      <div className="entity-insight-card__halftone" />

      <div className="entity-insight-card__header">
        <div className="entity-insight-card__icon">{icon}</div>
        <h4 className="entity-insight-card__title">{title}</h4>
      </div>

      <EntityMiniList
        entities={entities}
        maxItems={3}
        viewMode={viewMode}
        pagesSubMode={pagesSubMode}
      />

      <button className="entity-insight-card__view-all" onClick={(e) => {
        e.stopPropagation();
        onViewAll();
      }}>
        View All
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
