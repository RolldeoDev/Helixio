/**
 * CommunityRatingsPanel Component
 *
 * Collapsible section displaying external community and critic ratings.
 * Shows ratings from various sources (ComicBookRoundup, etc.) separately.
 */

import { useState } from 'react';
import {
  useSeriesExternalRatings,
  useSyncSeriesRatings,
  type ExternalRatingDisplay,
} from '../../hooks/queries/useExternalRatings';
import { toStarRating, formatStarRating } from '../../utils/ratings';
import { RatingStars } from '../RatingStars';
import './CommunityRatingsPanel.css';

// =============================================================================
// Types
// =============================================================================

export interface CommunityRatingsPanelProps {
  /** Series ID to show ratings for */
  seriesId: string;
  /** Panel title */
  title?: string;
  /** Start expanded */
  defaultExpanded?: boolean;
  /** Additional class name */
  className?: string;
}

// =============================================================================
// Helper Components
// =============================================================================

interface RatingRowProps {
  rating: ExternalRatingDisplay;
}

function RatingRow({ rating }: RatingRowProps) {
  const getSourceIcon = (source: string): string => {
    switch (source) {
      case 'comicbookroundup':
        return 'CBR';
      case 'leagueofcomicgeeks':
        return 'LOCG';
      case 'comicvine':
        return 'CV';
      case 'metron':
        return 'M';
      case 'anilist':
        return 'AL';
      default:
        return source.substring(0, 2).toUpperCase();
    }
  };

  const formatLastSynced = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`rating-row ${rating.isStale ? 'stale' : ''}`}>
      <div className="rating-source">
        <span className="source-icon">{getSourceIcon(rating.source)}</span>
        <span className="source-name">{rating.sourceDisplayName}</span>
        {rating.sourceUrl && (
          <a
            href={rating.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="source-link"
            title={`View on ${rating.sourceDisplayName}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </a>
        )}
        <span className={`rating-type-badge ${rating.ratingType}`}>
          {rating.ratingType === 'critic' ? 'Critic' : 'User'}
        </span>
      </div>
      <div className="rating-value">
        <div className="rating-stars">
          <RatingStars value={toStarRating(rating.value)} readonly size="small" showEmpty />
        </div>
        <span className="rating-number">{formatStarRating(rating.value)}/5</span>
        <span className="rating-original">({rating.displayValue})</span>
        {rating.voteCount !== undefined && rating.voteCount > 0 && (
          <span className="vote-count">
            ({rating.voteCount.toLocaleString()})
          </span>
        )}
      </div>
      <div className="rating-meta">
        <span className="last-synced" title={`Last synced: ${new Date(rating.lastSyncedAt).toLocaleString()}`}>
          {formatLastSynced(rating.lastSyncedAt)}
        </span>
        {rating.isStale && (
          <span className="stale-indicator" title="Rating data may be outdated">
            Stale
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CommunityRatingsPanel({
  seriesId,
  title = 'Community Ratings',
  defaultExpanded = false,
  className = '',
}: CommunityRatingsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const {
    data,
    isLoading,
    isError,
    error,
  } = useSeriesExternalRatings(seriesId);

  const syncMutation = useSyncSeriesRatings();

  const handleSync = () => {
    syncMutation.mutate({
      seriesId,
      forceRefresh: true,
    });
  };

  // Group ratings by type
  const criticRatings = data?.ratings.filter((r) => r.ratingType === 'critic') || [];
  const communityRatings = data?.ratings.filter((r) => r.ratingType === 'community') || [];
  const hasRatings = (data?.ratings.length || 0) > 0;

  // Summary for collapsed state
  const getSummary = () => {
    if (!hasRatings) return null;

    const parts: string[] = [];
    if (data?.averages.critic.average !== null && data?.averages.critic.average !== undefined) {
      parts.push(`Critic: ${formatStarRating(data.averages.critic.average)}/5`);
    }
    if (data?.averages.community.average !== null && data?.averages.community.average !== undefined) {
      parts.push(`User: ${formatStarRating(data.averages.community.average)}/5`);
    }
    return parts.join(' | ');
  };

  if (isLoading) {
    return (
      <div className={`community-ratings-panel ${className}`}>
        <div className="community-ratings-loading">
          <span className="loading-spinner" />
          Loading ratings...
        </div>
      </div>
    );
  }

  return (
    <div className={`community-ratings-panel ${isExpanded ? 'expanded' : 'collapsed'} ${className}`}>
      <button
        className="community-ratings-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="community-ratings-title">
          {title}
          {!isExpanded && hasRatings && (
            <span className="community-ratings-summary">{getSummary()}</span>
          )}
        </span>
        <span className={`community-ratings-chevron ${isExpanded ? 'rotated' : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="community-ratings-content">
          {isError && (
            <div className="community-ratings-error">
              Failed to load ratings: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          )}

          {!hasRatings && !isError && (
            <div className="community-ratings-empty">
              <p>No external ratings found for this series.</p>
              <button
                className="sync-button"
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? 'Syncing...' : 'Search for Ratings'}
              </button>
            </div>
          )}

          {hasRatings && (
            <>
              {/* Critic Ratings Section */}
              {criticRatings.length > 0 && (
                <div className="ratings-section">
                  <h4 className="section-title">Critic Reviews</h4>
                  <div className="ratings-list">
                    {criticRatings.map((rating) => (
                      <RatingRow
                        key={`${rating.source}-${rating.ratingType}`}
                        rating={rating}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Community Ratings Section */}
              {communityRatings.length > 0 && (
                <div className="ratings-section">
                  <h4 className="section-title">User Ratings</h4>
                  <div className="ratings-list">
                    {communityRatings.map((rating) => (
                      <RatingRow
                        key={`${rating.source}-${rating.ratingType}`}
                        rating={rating}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Averages */}
              {data && (data.averages.critic.average !== null ||
                data.averages.community.average !== null) && (
                <div className="ratings-averages">
                  {data.averages.critic.average !== null && (
                    <div className="average-item">
                      <span className="average-label">Avg. Critic</span>
                      <span className="average-value">
                        {formatStarRating(data.averages.critic.average)}/5
                      </span>
                      <span className="average-original">
                        ({data.averages.critic.average.toFixed(1)}/10)
                      </span>
                      <span className="average-count">
                        ({data.averages.critic.count} source{data.averages.critic.count !== 1 ? 's' : ''})
                      </span>
                    </div>
                  )}
                  {data.averages.community.average !== null && (
                    <div className="average-item">
                      <span className="average-label">Avg. User</span>
                      <span className="average-value">
                        {formatStarRating(data.averages.community.average)}/5
                      </span>
                      <span className="average-original">
                        ({data.averages.community.average.toFixed(1)}/10)
                      </span>
                      <span className="average-count">
                        ({data.averages.community.count} source{data.averages.community.count !== 1 ? 's' : ''})
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Sync Button */}
              <div className="ratings-actions">
                <button
                  className="sync-button"
                  onClick={handleSync}
                  disabled={syncMutation.isPending}
                >
                  {syncMutation.isPending ? 'Syncing...' : 'Refresh Ratings'}
                </button>
                {syncMutation.isSuccess && (
                  <span className="sync-success">Updated!</span>
                )}
                {syncMutation.isError && (
                  <span className="sync-error">
                    Sync failed: {syncMutation.error instanceof Error ? syncMutation.error.message : 'Unknown error'}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default CommunityRatingsPanel;
