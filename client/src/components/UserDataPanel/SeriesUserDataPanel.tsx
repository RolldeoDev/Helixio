/**
 * SeriesUserDataPanel Component
 *
 * Specialized user data panel for series detail pages.
 * Shows explicit series rating plus computed average from issues.
 */

import { UserDataPanel } from './UserDataPanel';
import { useSeriesUserData, useUpdateSeriesUserData } from '../../hooks/queries';
import { RatingStars } from '../RatingStars';
import type { SeriesRatingStats } from '../../services/api/user-data';
import './SeriesUserDataPanel.css';

export interface SeriesUserDataPanelProps {
  /** Series ID */
  seriesId: string;
  /** Whether to start expanded */
  defaultExpanded?: boolean;
  /** Additional class name */
  className?: string;
}

/**
 * Displays average rating stats from issues
 */
function AverageRatingStats({ ratingStats }: { ratingStats: SeriesRatingStats }) {
  if (ratingStats.count === 0) {
    return (
      <div className="series-rating-stats">
        <span className="stats-label">Issue Ratings:</span>
        <span className="stats-value stats-empty">No issues rated yet</span>
      </div>
    );
  }

  return (
    <div className="series-rating-stats">
      <span className="stats-label">Average from Issues:</span>
      <span className="stats-value">
        <span className="stats-stars">
          <RatingStars value={ratingStats.average || 0} readonly size="small" showEmpty />
        </span>
        <span className="stats-number">
          {ratingStats.average?.toFixed(1)}
        </span>
        <span className="stats-count">
          ({ratingStats.count} of {ratingStats.totalIssues} rated)
        </span>
      </span>
    </div>
  );
}

export function SeriesUserDataPanel({
  seriesId,
  defaultExpanded = false,
  className = '',
}: SeriesUserDataPanelProps) {
  const { data, isLoading } = useSeriesUserData(seriesId);
  const updateMutation = useUpdateSeriesUserData();

  const userData = data?.data;
  const ratingStats = data?.ratingStats;

  // Check if user has any data for this series
  const hasUserData = userData?.rating !== null && userData?.rating !== undefined
    || userData?.privateNotes
    || userData?.publicReview;

  const handleRatingChange = (rating: number | null) => {
    updateMutation.mutate({ seriesId, input: { rating } });
  };

  const handlePrivateNotesChange = (privateNotes: string | null) => {
    updateMutation.mutate({ seriesId, input: { privateNotes } });
  };

  const handlePublicReviewChange = (publicReview: string | null) => {
    updateMutation.mutate({ seriesId, input: { publicReview } });
  };

  const handleVisibilityChange = (reviewVisibility: 'private' | 'public') => {
    updateMutation.mutate({ seriesId, input: { reviewVisibility } });
  };

  // Don't render the panel if user has no data (rating, notes, or review)
  // The user can add a rating via the sidebar, which will make this panel appear
  if (!isLoading && !hasUserData) {
    return null;
  }

  return (
    <UserDataPanel
      rating={userData?.rating ?? null}
      privateNotes={userData?.privateNotes ?? null}
      publicReview={userData?.publicReview ?? null}
      reviewVisibility={userData?.reviewVisibility ?? 'private'}
      isLoading={isLoading}
      isSaving={updateMutation.isPending}
      onRatingChange={handleRatingChange}
      onPrivateNotesChange={handlePrivateNotesChange}
      onPublicReviewChange={handlePublicReviewChange}
      onVisibilityChange={handleVisibilityChange}
      additionalStats={ratingStats && <AverageRatingStats ratingStats={ratingStats} />}
      title="Your Rating & Notes"
      defaultExpanded={defaultExpanded}
      className={`series-user-data-panel ${className}`}
    />
  );
}

export default SeriesUserDataPanel;
