/**
 * IssueReviewsTab Component
 *
 * Tab content for displaying external reviews on the IssueDetailPage.
 * Shows combined view of external reviews (Comic Book Roundup) and Helixio user reviews.
 * Supports manual sync with last-sync timestamp display.
 */

import { useState, useMemo } from 'react';
import {
  useIssueReviews,
  useSyncIssueReviews,
  useReviewSources,
  type ExternalReview,
  type UserReview,
  type ReviewSource,
} from '../../hooks/queries';
import { ReviewCard } from '../ExternalReviewsTab/ReviewCard';
import './IssueReviewsTab.css';

// =============================================================================
// Types
// =============================================================================

export interface IssueReviewsTabProps {
  /** File ID to show reviews for */
  fileId: string;
  /** Issue name for display */
  issueName?: string;
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
    case 'comicbookroundup':
      return 'Comic Book Roundup';
    default:
      return filter;
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// =============================================================================
// Main Component
// =============================================================================

export function IssueReviewsTab({ fileId, issueName }: IssueReviewsTabProps) {
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>('all');
  const [showSpoilers, setShowSpoilers] = useState(false);

  // Fetch reviews data
  const {
    data: reviewsData,
    isLoading,
    error,
    refetch,
  } = useIssueReviews(fileId, {
    includeUserReviews: true,
    skipSpoilers: !showSpoilers,
  });

  // Fetch available sources for status info
  const { data: sources } = useReviewSources();

  // Sync mutation
  const syncMutation = useSyncIssueReviews();

  // Find CBR source status
  const cbrSource = sources?.find((s) => s.source === 'comicbookroundup');

  // Get last synced time from the most recent external review
  const lastSyncedAt = useMemo(() => {
    if (!reviewsData?.externalReviews?.length) return null;
    const cbrReviews = reviewsData.externalReviews.filter((r) => r.source === 'comicbookroundup');
    const firstReview = cbrReviews[0];
    if (!firstReview) return null;
    // All reviews from same sync have same lastSyncedAt, just grab first one
    return firstReview.lastSyncedAt;
  }, [reviewsData]);

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
      if (sourcesWithReviews.has('comicbookroundup')) filters.push('comicbookroundup');
    }

    return filters;
  }, [reviewsData]);

  const handleSync = () => {
    // The mutation already invalidates queries via onSuccess, no need for manual refetch
    syncMutation.mutate({ fileId, options: { forceRefresh: true, reviewLimit: 15 } });
  };

  const totalCount = (reviewsData?.counts?.external ?? 0) + (reviewsData?.counts?.user ?? 0);

  // Loading state
  if (isLoading) {
    return (
      <div className="issue-reviews-tab issue-reviews-tab--loading" role="status" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <span>Loading reviews...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="issue-reviews-tab issue-reviews-tab--error" role="alert">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <circle cx="12" cy="16" r="0.5" fill="currentColor" />
        </svg>
        <p>Failed to load reviews</p>
        {error instanceof Error && error.message && (
          <p className="issue-reviews-tab__error-message">{error.message}</p>
        )}
        <button className="btn-primary" onClick={() => refetch()} aria-label="Retry loading reviews">
          Try Again
        </button>
      </div>
    );
  }

  // Empty state
  if (totalCount === 0) {
    return (
      <div className="issue-reviews-tab issue-reviews-tab--empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <h3>No Reviews Yet</h3>
        <p>
          {issueName
            ? `No reviews found for "${issueName}".`
            : 'No reviews found for this issue.'}
        </p>
        <p className="issue-reviews-tab__empty-hint">
          Reviews can be fetched from Comic Book Roundup if available.
        </p>

        {/* Source status */}
        {cbrSource && (
          <div className="issue-reviews-tab__source-status">
            <span className="source-name">Comic Book Roundup:</span>
            <span className={`source-status ${cbrSource.available ? 'available' : 'unavailable'}`}>
              {cbrSource.available ? 'Available' : 'Unavailable'}
            </span>
            {lastSyncedAt && (
              <span className="source-last-sync">
                (last checked {formatRelativeTime(lastSyncedAt)})
              </span>
            )}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleSync}
          disabled={syncMutation.isPending}
          aria-label="Fetch reviews from external sources"
        >
          {syncMutation.isPending ? 'Fetching...' : 'Fetch Reviews'}
        </button>
      </div>
    );
  }

  return (
    <div className="issue-reviews-tab">
      {/* Header with filters and actions */}
      <header className="issue-reviews-tab__header">
        <div className="issue-reviews-tab__filters">
          {availableFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`issue-reviews-tab__filter ${activeFilter === filter ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter)}
            >
              {getFilterLabel(filter)}
              {filter === 'all' && (
                <span className="issue-reviews-tab__filter-count">{totalCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="issue-reviews-tab__actions">
          {/* Last sync info */}
          {lastSyncedAt && (
            <span className="issue-reviews-tab__last-sync">
              Updated {formatRelativeTime(lastSyncedAt)}
            </span>
          )}

          <label className="issue-reviews-tab__toggle">
            <input
              type="checkbox"
              checked={showSpoilers}
              onChange={(e) => setShowSpoilers(e.target.checked)}
            />
            <span>Show spoilers</span>
          </label>

          <button
            type="button"
            className="issue-reviews-tab__sync-btn"
            onClick={handleSync}
            disabled={syncMutation.isPending}
            title="Refresh reviews from external sources"
            aria-label="Refresh reviews from external sources"
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
            {syncMutation.isPending ? 'Fetching...' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* Reviews list */}
      <div className="issue-reviews-tab__list">
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
        <footer className="issue-reviews-tab__footer">
          <span>
            Reviews sourced from{' '}
            {[...new Set(reviewsData.externalReviews.map((r) => r.sourceDisplayName))].join(', ')}
          </span>
        </footer>
      )}
    </div>
  );
}

export default IssueReviewsTab;
