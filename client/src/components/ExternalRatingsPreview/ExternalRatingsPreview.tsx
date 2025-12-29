/**
 * ExternalRatingsPreview Component
 *
 * Compact display of external community/critic ratings for the series/issue hero sidebar.
 * Shows averages with source badges and opens a modal for full details.
 * Supports both series-level and issue-level ratings.
 */

import { useMemo } from 'react';
import {
  useSeriesExternalRatings,
  useIssueExternalRatings,
  type ExternalRatingDisplay,
} from '../../hooks/queries/useExternalRatings';
import { toStarRating, formatStarRating } from '../../utils/ratings';
import { RatingStars } from '../RatingStars';
import './ExternalRatingsPreview.css';

// =============================================================================
// Types
// =============================================================================

export interface ExternalRatingsPreviewProps {
  /** Series ID to show ratings for (mutually exclusive with fileId) */
  seriesId?: string;
  /** File/Issue ID to show ratings for (mutually exclusive with seriesId) */
  fileId?: string;
  /** Callback to open the full ratings modal */
  onViewDetails: () => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getSourceAbbrev(source: string): string {
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
}


/**
 * Compute averages from a list of ratings (used for issue ratings which don't have pre-computed averages)
 */
function computeAverages(ratings: ExternalRatingDisplay[]): {
  community: { average: number | null; count: number };
  critic: { average: number | null; count: number };
} {
  const communityRatings = ratings.filter((r) => r.ratingType === 'community');
  const criticRatings = ratings.filter((r) => r.ratingType === 'critic');

  const computeAvg = (arr: ExternalRatingDisplay[]) => {
    if (arr.length === 0) return { average: null, count: 0 };
    const sum = arr.reduce((acc, r) => acc + r.value, 0);
    return { average: sum / arr.length, count: arr.length };
  };

  return {
    community: computeAvg(communityRatings),
    critic: computeAvg(criticRatings),
  };
}

// =============================================================================
// Rating Row Component
// =============================================================================

interface RatingRowProps {
  label: string;
  average: number | null;
  count: number;
}

function RatingRow({ label, average, count }: RatingRowProps) {
  if (average === null || count === 0) return null;

  return (
    <div className="external-ratings-preview__row">
      <span className="external-ratings-preview__label">{label}</span>
      <div className="external-ratings-preview__value">
        <span className="external-ratings-preview__stars">
          <RatingStars value={toStarRating(average)} readonly size="small" showEmpty />
        </span>
        <span className="external-ratings-preview__number">{formatStarRating(average)}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ExternalRatingsPreview({
  seriesId,
  fileId,
  onViewDetails,
}: ExternalRatingsPreviewProps) {
  // Use the appropriate hook based on whether we're showing series or issue ratings
  const seriesQuery = useSeriesExternalRatings(seriesId);
  const issueQuery = useIssueExternalRatings(fileId);

  // Select the active query based on which ID was provided
  const isSeriesMode = !!seriesId;
  const activeQuery = isSeriesMode ? seriesQuery : issueQuery;
  const { data: rawData, isLoading } = activeQuery;

  // Normalize the data - compute averages for issue ratings
  const data = useMemo(() => {
    if (!rawData) return null;

    // Series data already has averages
    if (isSeriesMode && 'averages' in rawData) {
      return rawData as {
        ratings: ExternalRatingDisplay[];
        averages: { community: { average: number | null; count: number }; critic: { average: number | null; count: number } };
      };
    }

    // Issue data needs computed averages
    const ratings = 'ratings' in rawData ? rawData.ratings : [];
    return {
      ratings,
      averages: computeAverages(ratings),
    };
  }, [rawData, isSeriesMode]);

  // Get unique sources from all ratings
  const sources = data?.ratings
    ? [...new Set(data.ratings.map((r) => r.source))]
    : [];

  const hasCriticRating =
    data?.averages.critic.average !== null && (data?.averages.critic.count ?? 0) > 0;
  const hasCommunityRating =
    data?.averages.community.average !== null && (data?.averages.community.count ?? 0) > 0;
  const hasAnyRating = hasCriticRating || hasCommunityRating;

  // Don't render anything while loading or if no ratings
  if (isLoading) {
    return (
      <div className="external-ratings-preview external-ratings-preview--loading">
        <span className="external-ratings-preview__title">External Ratings</span>
        <span className="external-ratings-preview__loading">Loading...</span>
      </div>
    );
  }

  // When no ratings exist, return null - the parent component will show an icon instead
  if (!hasAnyRating) {
    return null;
  }

  return (
    <button
      className="external-ratings-preview"
      onClick={onViewDetails}
      type="button"
      title="View all external ratings"
    >
      <span className="external-ratings-preview__title">External Ratings</span>

      <div className="external-ratings-preview__ratings">
        <RatingRow
          label="Critics"
          average={data?.averages.critic.average ?? null}
          count={data?.averages.critic.count ?? 0}
        />
        <RatingRow
          label="Users"
          average={data?.averages.community.average ?? null}
          count={data?.averages.community.count ?? 0}
        />
      </div>

      {sources.length > 0 && (
        <div className="external-ratings-preview__sources">
          {sources.map((source) => (
            <span key={source} className="external-ratings-preview__source-badge">
              {getSourceAbbrev(source)}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export default ExternalRatingsPreview;
