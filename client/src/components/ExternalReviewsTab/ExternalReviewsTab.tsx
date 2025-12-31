/**
 * ExternalReviewsTab Component
 *
 * Tab content for displaying external reviews on the SeriesDetailPage.
 * Shows combined view of external reviews (AniList, MAL) and Helixio user reviews.
 */

import { useState, useMemo } from 'react';
import {
  useSeriesReviews,
  useSyncSeriesReviews,
  useReviewSources,
  type ExternalReview,
  type UserReview,
  type ReviewSource,
} from '../../hooks/queries';
import { ReviewCard } from './ReviewCard';
import './ExternalReviewsTab.css';

// =============================================================================
// Types
// =============================================================================

export interface ExternalReviewsTabProps {
  /** Series ID to show reviews for */
  seriesId: string;
  /** Series name for display */
  seriesName?: string;
}

type ReviewFilter = 'all' | 'external' | 'user' | ReviewSource;

// =============================================================================
// Helper Functions
// =============================================================================

function getFilterLabel(filter: ReviewFilter): string {
  switch (filter) {
    case 'all':
      return 'All Reviews';
    case 'external':
      return 'External';
    case 'user':
      return 'Community';
    case 'anilist':
      return 'AniList';
    case 'myanimelist':
      return 'MyAnimeList';
    case 'comicbookroundup':
      return 'Comic Book Roundup';
    default:
      return filter;
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function ExternalReviewsTab({ seriesId, seriesName }: ExternalReviewsTabProps) {
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>('all');
  const [showSpoilers, setShowSpoilers] = useState(false);

  // Fetch reviews data
  const {
    data: reviewsData,
    isLoading,
    error,
    refetch,
  } = useSeriesReviews(seriesId, {
    includeUserReviews: true,
    skipSpoilers: !showSpoilers,
  });

  // Fetch available sources (for future source selector)
  const { data: _sources } = useReviewSources();

  // Sync mutation
  const syncMutation = useSyncSeriesReviews();

  // Filter reviews based on active filter
  const filteredReviews = useMemo(() => {
    if (!reviewsData) return { external: [], user: [] };

    let external = reviewsData.externalReviews;
    let user = reviewsData.userReviews;

    switch (activeFilter) {
      case 'external':
        user = [];
        break;
      case 'user':
        external = [];
        break;
      case 'anilist':
      case 'myanimelist':
      case 'comicbookroundup':
        external = external.filter((r) => r.source === activeFilter);
        user = [];
        break;
      case 'all':
      default:
        // Show all
        break;
    }

    return { external, user };
  }, [reviewsData, activeFilter]);

  // Combine and sort reviews by date
  const sortedReviews = useMemo(() => {
    const combined: Array<{ type: 'external' | 'user'; data: ExternalReview | UserReview }> = [
      ...filteredReviews.external.map((r) => ({ type: 'external' as const, data: r })),
      ...filteredReviews.user.map((r) => ({ type: 'user' as const, data: r })),
    ];

    // Sort by date descending (most recent first)
    combined.sort((a, b) => {
      const dateA = a.type === 'external'
        ? (a.data as ExternalReview).reviewDate
        : (a.data as UserReview).reviewedAt;
      const dateB = b.type === 'external'
        ? (b.data as ExternalReview).reviewDate
        : (b.data as UserReview).reviewedAt;

      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return combined;
  }, [filteredReviews]);

  // Get available source filters
  const availableFilters = useMemo(() => {
    const filters: ReviewFilter[] = ['all'];

    if (reviewsData) {
      const hasExternal = reviewsData.externalReviews.length > 0;
      const hasUser = reviewsData.userReviews.length > 0;

      if (hasExternal && hasUser) {
        filters.push('external', 'user');
      }

      // Add source-specific filters
      const sourcesWithReviews = new Set(
        reviewsData.externalReviews.map((r) => r.source)
      );
      if (sourcesWithReviews.has('anilist')) filters.push('anilist');
      if (sourcesWithReviews.has('myanimelist')) filters.push('myanimelist');
      if (sourcesWithReviews.has('comicbookroundup')) filters.push('comicbookroundup');
    }

    return filters;
  }, [reviewsData]);

  const handleSync = () => {
    syncMutation.mutate(
      { seriesId, options: { forceRefresh: true } },
      {
        onSuccess: () => {
          refetch();
        },
      }
    );
  };

  const totalCount = (reviewsData?.counts?.external ?? 0) + (reviewsData?.counts?.user ?? 0);

  // Loading state
  if (isLoading) {
    return (
      <div className="external-reviews-tab external-reviews-tab--loading">
        <div className="spinner" />
        <span>Loading reviews...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="external-reviews-tab external-reviews-tab--error">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <circle cx="12" cy="16" r="0.5" fill="currentColor" />
        </svg>
        <p>Failed to load reviews</p>
        <button className="btn-primary" onClick={() => refetch()}>
          Try Again
        </button>
      </div>
    );
  }

  // Empty state
  if (totalCount === 0) {
    return (
      <div className="external-reviews-tab external-reviews-tab--empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <h3>No Reviews Yet</h3>
        <p>
          {seriesName
            ? `No reviews found for "${seriesName}".`
            : 'No reviews found for this series.'}
        </p>
        <p className="external-reviews-tab__empty-hint">
          Reviews can be synced from AniList and MyAnimeList if the series has matching entries.
        </p>
        <button
          className="btn-primary"
          onClick={handleSync}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? 'Syncing...' : 'Sync Reviews'}
        </button>
      </div>
    );
  }

  return (
    <div className="external-reviews-tab">
      {/* Header with filters and actions */}
      <header className="external-reviews-tab__header">
        <div className="external-reviews-tab__filters">
          {availableFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`external-reviews-tab__filter ${activeFilter === filter ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter)}
            >
              {getFilterLabel(filter)}
              {filter === 'all' && (
                <span className="external-reviews-tab__filter-count">{totalCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="external-reviews-tab__actions">
          <label className="external-reviews-tab__toggle">
            <input
              type="checkbox"
              checked={showSpoilers}
              onChange={(e) => setShowSpoilers(e.target.checked)}
            />
            <span>Show spoilers</span>
          </label>

          <button
            type="button"
            className="external-reviews-tab__sync-btn"
            onClick={handleSync}
            disabled={syncMutation.isPending}
            title="Sync reviews from external sources"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={syncMutation.isPending ? 'spinning' : ''}
            >
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncMutation.isPending ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </header>

      {/* Reviews list */}
      <div className="external-reviews-tab__list">
        {sortedReviews.map((item, index) => (
          <ReviewCard
            key={
              item.type === 'external'
                ? (item.data as ExternalReview).id
                : `user-${(item.data as UserReview).userId}-${index}`
            }
            review={item.type === 'external' ? (item.data as ExternalReview) : undefined}
            userReview={item.type === 'user' ? (item.data as UserReview) : undefined}
          />
        ))}
      </div>

      {/* Source attribution */}
      {reviewsData && reviewsData.externalReviews.length > 0 && (
        <footer className="external-reviews-tab__footer">
          <span>
            Reviews sourced from{' '}
            {[...new Set(reviewsData.externalReviews.map((r) => r.sourceDisplayName))].join(', ')}
          </span>
        </footer>
      )}
    </div>
  );
}

export default ExternalReviewsTab;
