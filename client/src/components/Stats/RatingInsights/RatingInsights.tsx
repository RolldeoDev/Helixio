import type { RatingStats } from '../../../services/api/series';
import './RatingInsights.css';

interface RatingInsightsProps {
  ratingStats: RatingStats | null | undefined;
  isLoading: boolean;
}

function getRatingLabel(average: number | null): string {
  if (average === null) return 'No ratings yet';
  if (average >= 4.5) return 'Very Generous';
  if (average >= 4.0) return 'Generous';
  if (average >= 3.0) return 'Balanced';
  if (average >= 2.0) return 'Critical';
  return 'Very Critical';
}

export function RatingInsights({
  ratingStats,
  isLoading,
}: RatingInsightsProps) {
  if (isLoading) {
    return (
      <div className="rating-insights rating-insights--loading">
        <div className="rating-insights__header">
          <h3 className="rating-insights__title">Ratings & Reviews</h3>
        </div>
        <div className="rating-insights__skeleton" />
      </div>
    );
  }

  if (!ratingStats) {
    return (
      <div className="rating-insights">
        <div className="rating-insights__header">
          <h3 className="rating-insights__title">Ratings & Reviews</h3>
          <span className="rating-insights__subtitle">Start rating comics to see your stats</span>
        </div>
        <div className="rating-insights__empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
          <p>No ratings yet</p>
        </div>
      </div>
    );
  }

  const totalRatings = ratingStats.totalSeriesRated + ratingStats.totalIssuesRated;
  const ratingLabel = getRatingLabel(ratingStats.averageRatingGiven);

  const insights = [
    {
      id: 'total-ratings',
      label: 'Total Ratings',
      value: totalRatings.toLocaleString(),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      ),
      description: `${ratingStats.totalSeriesRated} series, ${ratingStats.totalIssuesRated} issues`,
    },
    {
      id: 'avg-rating',
      label: ratingLabel,
      value: ratingStats.averageRatingGiven?.toFixed(1) ?? '-',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
      description: 'Your average rating given',
    },
    {
      id: 'reviews-written',
      label: 'Reviews',
      value: ratingStats.totalReviewsWritten.toLocaleString(),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      ),
      description: 'Reviews and notes written',
    },
    {
      id: 'rating-streak',
      label: 'Rating Streak',
      value: ratingStats.longestRatingStreak.toString(),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
          <path d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1.001A3.75 3.75 0 0012 18z" />
        </svg>
      ),
      description: 'Longest consecutive days rating',
    },
    {
      id: 'genres-rated',
      label: 'Genres Rated',
      value: ratingStats.uniqueGenresRated.toString(),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
          <path d="M6 6h.008v.008H6V6z" />
        </svg>
      ),
      description: 'Different genres you\'ve rated',
    },
    {
      id: 'complete-series',
      label: 'Complete Series',
      value: ratingStats.seriesWithCompleteRatings.toString(),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
        </svg>
      ),
      description: 'Series with all issues rated',
    },
  ];

  // Calculate rating distribution for chart
  const maxDistCount = Math.max(...ratingStats.ratingDistribution.map(d => d.count), 1);

  return (
    <div className="rating-insights">
      <div className="rating-insights__header">
        <h3 className="rating-insights__title">Ratings & Reviews</h3>
        <span className="rating-insights__subtitle">Your rating habits at a glance</span>
      </div>

      <div className="rating-insights__content">
        <div className="rating-insights__grid">
          {insights.map((insight, index) => (
            <div
              key={insight.id}
              className="rating-insight-card"
              style={{ animationDelay: `${300 + index * 50}ms` }}
              title={insight.description}
            >
              <div className="rating-insight-card__icon">{insight.icon}</div>
              <div className="rating-insight-card__content">
                <span className="rating-insight-card__value">{insight.value}</span>
                <span className="rating-insight-card__label">{insight.label}</span>
              </div>
            </div>
          ))}
        </div>

        {totalRatings > 0 && (
          <div className="rating-insights__distribution">
            <h4 className="rating-insights__distribution-title">Rating Distribution</h4>
            <div className="rating-distribution">
              {ratingStats.ratingDistribution.map((d) => (
                <div key={d.rating} className="rating-distribution__bar">
                  <span className="rating-distribution__label">{d.rating}</span>
                  <div className="rating-distribution__track">
                    <div
                      className="rating-distribution__fill"
                      style={{ width: `${(d.count / maxDistCount) * 100}%` }}
                    />
                  </div>
                  <span className="rating-distribution__count">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(ratingStats.mostRatedGenre || ratingStats.mostRatedPublisher) && (
          <div className="rating-insights__favorites">
            {ratingStats.mostRatedGenre && (
              <div className="rating-insights__favorite">
                <span className="rating-insights__favorite-label">Most Rated Genre</span>
                <span className="rating-insights__favorite-value">
                  {ratingStats.mostRatedGenre.name}
                  <span className="rating-insights__favorite-count">
                    ({ratingStats.mostRatedGenre.count})
                  </span>
                </span>
              </div>
            )}
            {ratingStats.mostRatedPublisher && (
              <div className="rating-insights__favorite">
                <span className="rating-insights__favorite-label">Most Rated Publisher</span>
                <span className="rating-insights__favorite-value">
                  {ratingStats.mostRatedPublisher.name}
                  <span className="rating-insights__favorite-count">
                    ({ratingStats.mostRatedPublisher.count})
                  </span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
