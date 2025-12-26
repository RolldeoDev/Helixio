/**
 * Entity Stats Page
 *
 * Detailed stats view for a specific entity (creator, genre, character, team, publisher).
 * Shows:
 * - Overall stats for the entity
 * - List of comics associated with the entity
 * - Related creators and characters
 * - Related series
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  getEntityDetails,
  EntityDetails,
  EntityType,
  EntityComic,
  RelatedEntity,
  RelatedSeries,
} from '../services/api.service';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import './EntityStatsPage.css';

// =============================================================================
// Helper Functions
// =============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours < 24) return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function getEntityTypeLabel(type: string): string {
  switch (type) {
    case 'creator': return 'Creator';
    case 'genre': return 'Genre';
    case 'character': return 'Character';
    case 'team': return 'Team';
    case 'publisher': return 'Publisher';
    default: return type;
  }
}

function getEntityTypePlural(type: string): string {
  switch (type) {
    case 'creator': return 'creators';
    case 'genre': return 'genres';
    case 'character': return 'characters';
    case 'team': return 'teams';
    case 'publisher': return 'publishers';
    default: return type;
  }
}

// =============================================================================
// Sub-components
// =============================================================================

interface StatBoxProps {
  label: string;
  value: string | number;
  subValue?: string;
}

function StatBox({ label, value, subValue }: StatBoxProps) {
  return (
    <div className="entity-stat-box">
      <span className="entity-stat-value">{value}</span>
      <span className="entity-stat-label">{label}</span>
      {subValue && <span className="entity-stat-sub">{subValue}</span>}
    </div>
  );
}

interface ComicListProps {
  comics: EntityComic[];
  onComicClick: (comic: EntityComic) => void;
}

function ComicList({ comics, onComicClick }: ComicListProps) {
  const [filter, setFilter] = useState<'all' | 'read' | 'unread'>('all');

  const filteredComics = comics.filter(comic => {
    if (filter === 'read') return comic.isRead;
    if (filter === 'unread') return !comic.isRead;
    return true;
  });

  return (
    <div className="entity-comics-section">
      <div className="entity-comics-header">
        <h3>Comics ({comics.length})</h3>
        <div className="entity-comics-filter">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={filter === 'read' ? 'active' : ''}
            onClick={() => setFilter('read')}
          >
            Read ({comics.filter(c => c.isRead).length})
          </button>
          <button
            className={filter === 'unread' ? 'active' : ''}
            onClick={() => setFilter('unread')}
          >
            Unread ({comics.filter(c => !c.isRead).length})
          </button>
        </div>
      </div>

      {filteredComics.length === 0 ? (
        <div className="entity-comics-empty">
          <p>No comics match the filter</p>
        </div>
      ) : (
        <div className="entity-comics-list">
          {filteredComics.map((comic) => (
            <div
              key={comic.fileId}
              className={`entity-comic-item ${comic.isRead ? 'read' : 'unread'}`}
              onClick={() => onComicClick(comic)}
            >
              <div className="entity-comic-status">
                {comic.isRead ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                )}
              </div>
              <div className="entity-comic-info">
                <span className="entity-comic-name">
                  {comic.seriesName ? `${comic.seriesName} #${comic.number || '?'}` : comic.filename}
                </span>
                {comic.lastReadAt && (
                  <span className="entity-comic-date">
                    Last read: {new Date(comic.lastReadAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              {comic.readingTime > 0 && (
                <span className="entity-comic-time">{formatDuration(comic.readingTime)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface RelatedEntitiesProps {
  title: string;
  entities: RelatedEntity[];
  onEntityClick: (entity: RelatedEntity) => void;
}

function RelatedEntities({ title, entities, onEntityClick }: RelatedEntitiesProps) {
  if (entities.length === 0) return null;

  return (
    <div className="entity-related-section">
      <h3>{title}</h3>
      <div className="entity-related-list">
        {entities.slice(0, 10).map((entity, index) => (
          <button
            key={`${entity.entityName}-${entity.entityRole || ''}-${index}`}
            className="entity-related-item"
            onClick={() => onEntityClick(entity)}
          >
            <span className="related-name">
              {entity.entityName}
              {entity.entityRole && <small> ({entity.entityRole})</small>}
            </span>
            <span className="related-count">{entity.sharedComics} shared</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface RelatedSeriesListProps {
  series: RelatedSeries[];
  onSeriesClick: (series: RelatedSeries) => void;
}

function RelatedSeriesList({ series, onSeriesClick }: RelatedSeriesListProps) {
  if (series.length === 0) return null;

  return (
    <div className="entity-related-section">
      <h3>Series</h3>
      <div className="entity-related-list">
        {series.slice(0, 10).map((s) => (
          <button
            key={s.seriesId}
            className="entity-related-item series"
            onClick={() => onSeriesClick(s)}
          >
            <span className="related-name">{s.seriesName}</span>
            <span className="related-count">
              {s.readCount}/{s.ownedCount} read
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function EntityStatsPage() {
  const { entityType, entityName } = useParams<{ entityType: string; entityName: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setBreadcrumbs } = useBreadcrumbs();

  const entityRole = searchParams.get('role') || undefined;
  const libraryId = searchParams.get('libraryId') || undefined;

  const [details, setDetails] = useState<EntityDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDetails() {
      if (!entityType || !entityName) return;

      setIsLoading(true);
      setError(null);

      try {
        const data = await getEntityDetails({
          entityType: entityType as EntityType,
          entityName: decodeURIComponent(entityName),
          entityRole,
          libraryId,
        });
        setDetails(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load entity details');
      } finally {
        setIsLoading(false);
      }
    }

    fetchDetails();
  }, [entityType, entityName, entityRole, libraryId]);

  // Set breadcrumbs when details load
  useEffect(() => {
    if (details && entityType && entityName) {
      setBreadcrumbs([
        { label: 'Statistics', path: '/stats' },
        { label: getEntityTypeLabel(details.entityType) + 's', path: '/stats' },
        {
          label: decodeURIComponent(entityName),
          path: `/stats/${entityType}/${entityName}`,
        },
      ]);
    }
  }, [details, entityType, entityName, setBreadcrumbs]);

  const handleComicClick = (comic: EntityComic) => {
    navigate(`/issue/${comic.fileId}`);
  };

  const handleRelatedCreatorClick = (entity: RelatedEntity) => {
    const params = new URLSearchParams();
    if (entity.entityRole) params.set('role', entity.entityRole);
    if (libraryId) params.set('libraryId', libraryId);
    const query = params.toString();
    navigate(`/stats/creator/${encodeURIComponent(entity.entityName)}${query ? `?${query}` : ''}`);
  };

  const handleRelatedCharacterClick = (entity: RelatedEntity) => {
    const params = new URLSearchParams();
    if (libraryId) params.set('libraryId', libraryId);
    const query = params.toString();
    navigate(`/stats/character/${encodeURIComponent(entity.entityName)}${query ? `?${query}` : ''}`);
  };

  const handleSeriesClick = (series: RelatedSeries) => {
    navigate(`/series/${series.seriesId}`);
  };

  const handleBackClick = () => {
    navigate(-1);
  };

  if (isLoading) {
    return (
      <div className="entity-stats-page loading">
        <div className="entity-stats-loading">
          <div className="entity-stats-spinner" />
          <p>Loading entity details...</p>
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="entity-stats-page error">
        <div className="entity-stats-error">
          <h3>Failed to load entity</h3>
          <p>{error || 'Entity not found'}</p>
          <button onClick={handleBackClick}>Go Back</button>
        </div>
      </div>
    );
  }

  const readPercentage = details.ownedComics > 0
    ? Math.round((details.readComics / details.ownedComics) * 100)
    : 0;

  return (
    <div className="entity-stats-page">
      {/* Header */}
      <div className="entity-stats-header">
        <button className="entity-back-button" onClick={handleBackClick}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>

        <div className="entity-stats-breadcrumb">
          <Link to="/">Home</Link>
          <span>/</span>
          <span
            className="breadcrumb-link"
            onClick={() => navigate('/', { state: { statsTab: getEntityTypePlural(details.entityType) } })}
          >
            {getEntityTypeLabel(details.entityType)}s
          </span>
          <span>/</span>
          <span>{details.entityName}</span>
        </div>
      </div>

      {/* Entity Title */}
      <div className="entity-stats-title">
        <h1>
          {details.entityName}
          {details.entityRole && (
            <span className="entity-role-badge">{details.entityRole}</span>
          )}
        </h1>
        <span className="entity-type-label">{getEntityTypeLabel(details.entityType)}</span>
      </div>

      {/* Stats Summary */}
      <div className="entity-stats-summary">
        <StatBox
          label="Comics"
          value={details.ownedComics}
          subValue={`${details.readComics} read (${readPercentage}%)`}
        />
        <StatBox
          label="Series"
          value={details.ownedSeries}
        />
        <StatBox
          label="Pages"
          value={formatNumber(details.ownedPages)}
          subValue={`${formatNumber(details.readPages)} read`}
        />
        <StatBox
          label="Reading Time"
          value={formatDuration(details.readTime)}
        />
      </div>

      {/* Progress Bar */}
      <div className="entity-progress-section">
        <div className="entity-progress-label">
          <span>Read Progress</span>
          <span>{readPercentage}%</span>
        </div>
        <div className="entity-progress-bar-large">
          <div
            className="entity-progress-fill-large"
            style={{ width: `${readPercentage}%` }}
          />
        </div>
      </div>

      {/* Content Grid */}
      <div className="entity-content-grid">
        {/* Comics List */}
        <div className="entity-content-main">
          <ComicList comics={details.comics} onComicClick={handleComicClick} />
        </div>

        {/* Sidebar with Related */}
        <div className="entity-content-sidebar">
          {details.entityType === 'creator' && (
            <RelatedEntities
              title="Frequent Collaborators"
              entities={details.relatedCreators}
              onEntityClick={handleRelatedCreatorClick}
            />
          )}

          {details.entityType !== 'character' && (
            <RelatedEntities
              title="Related Characters"
              entities={details.relatedCharacters}
              onEntityClick={handleRelatedCharacterClick}
            />
          )}

          {details.entityType === 'character' && (
            <RelatedEntities
              title="Associated Creators"
              entities={details.relatedCreators}
              onEntityClick={handleRelatedCreatorClick}
            />
          )}

          <RelatedSeriesList
            series={details.relatedSeries}
            onSeriesClick={handleSeriesClick}
          />
        </div>
      </div>
    </div>
  );
}

export default EntityStatsPage;
