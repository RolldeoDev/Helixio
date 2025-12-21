import { useState } from 'react';
import type { StatsSummary, EntityType } from '../../../services/api.service';
import { EntityInsightCard } from './EntityInsightCard';
import { EntityDrawer } from '../EntityDrawer/EntityDrawer';
import './EntityInsights.css';

interface EntityInsightsProps {
  summary: StatsSummary | null;
  isLoading: boolean;
}

const ENTITY_CONFIG: {
  type: EntityType;
  title: string;
  icon: React.ReactNode;
  key: 'topCreators' | 'topGenres' | 'topCharacters' | 'topPublishers';
}[] = [
  {
    type: 'creator',
    title: 'Top Creators',
    key: 'topCreators',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    type: 'genre',
    title: 'Top Genres',
    key: 'topGenres',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
        <path d="M6 6h.008v.008H6V6z" />
      </svg>
    ),
  },
  {
    type: 'character',
    title: 'Top Characters',
    key: 'topCharacters',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    type: 'publisher',
    title: 'Publishers',
    key: 'topPublishers',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
];

export function EntityInsights({ summary, isLoading }: EntityInsightsProps) {
  const [drawerType, setDrawerType] = useState<EntityType | null>(null);

  const handleOpenDrawer = (type: EntityType) => {
    setDrawerType(type);
  };

  const handleCloseDrawer = () => {
    setDrawerType(null);
  };

  if (isLoading) {
    return (
      <section className="entity-insights entity-insights--loading">
        <div className="entity-insights__header">
          <h3 className="entity-insights__title">Insights by Category</h3>
        </div>
        <div className="entity-insights__grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="entity-insight-card entity-insight-card--skeleton">
              <div className="skeleton-header" />
              <div className="skeleton-list" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="entity-insights">
      <div className="entity-insights__header">
        <h3 className="entity-insights__title">Insights by Category</h3>
        <span className="entity-insights__subtitle">
          Your most read creators, genres, characters, and publishers
        </span>
      </div>

      <div className="entity-insights__grid">
        {ENTITY_CONFIG.map((config, index) => (
          <EntityInsightCard
            key={config.type}
            type={config.type}
            title={config.title}
            icon={config.icon}
            entities={summary?.[config.key] ?? []}
            onViewAll={() => handleOpenDrawer(config.type)}
            animationDelay={200 + index * 50}
          />
        ))}
      </div>

      <EntityDrawer
        entityType={drawerType}
        onClose={handleCloseDrawer}
      />
    </section>
  );
}
