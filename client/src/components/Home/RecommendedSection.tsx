/**
 * Recommended Section
 *
 * Displays 3 recommendation carousels:
 * - Continue Your Series (series_continuation)
 * - Because You Like... (same_publisher/same_genre)
 * - Recently Added
 *
 * Each carousel has speech-bubble badges showing the reason for recommendation.
 */

import { useState, useEffect, useCallback } from 'react';
import { SectionHeader } from './SectionHeader';
import { ComicCarousel, ComicCarouselItem } from './ComicCarousel';
import {
  getRecommendations,
  RecommendationsResult,
  ComicRecommendation,
} from '../../services/api.service';

// =============================================================================
// Types
// =============================================================================

interface RecommendedSectionProps {
  libraryId?: string;
  onItemClick?: (fileId: string) => void;
  onItemsChange?: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert ComicRecommendation to ComicCarouselItem
 */
function toCardItem(rec: ComicRecommendation): ComicCarouselItem {
  // Determine badge type based on reason
  let badgeType: ComicCarouselItem['badgeType'] = 'info';
  if (rec.reason === 'series_continuation') {
    badgeType = 'primary';
  } else if (rec.reason === 'same_publisher') {
    badgeType = 'success';
  } else if (rec.reason === 'same_genre') {
    badgeType = 'warning';
  } else if (rec.reason === 'recently_added') {
    badgeType = 'info';
  }

  return {
    fileId: rec.fileId,
    filename: rec.filename,
    badge: rec.reasonDetail,
    badgeType,
  };
}

// =============================================================================
// Component
// =============================================================================

export function RecommendedSection({
  libraryId,
  onItemClick,
  onItemsChange,
}: RecommendedSectionProps) {
  const [recommendations, setRecommendations] = useState<RecommendationsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getRecommendations(8, libraryId);
      setRecommendations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recommendations');
      console.error('Error fetching recommendations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [libraryId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Loading state
  if (isLoading) {
    return (
      <>
        <section className="home-section">
          <SectionHeader title="Continue Your Series" />
          <div className="comic-carousel">
            <div className="comic-carousel-track">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton skeleton-card" />
              ))}
            </div>
          </div>
        </section>
        <section className="home-section">
          <SectionHeader title="Because You Like..." />
          <div className="comic-carousel">
            <div className="comic-carousel-track">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton skeleton-card" />
              ))}
            </div>
          </div>
        </section>
        <section className="home-section">
          <SectionHeader title="Recently Added" />
          <div className="comic-carousel">
            <div className="comic-carousel-track">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton skeleton-card" />
              ))}
            </div>
          </div>
        </section>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <section className="home-section">
        <SectionHeader title="Recommended For You" />
        <div className="home-empty-state">
          <svg className="home-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3 className="home-empty-state-title">Couldn't load recommendations</h3>
          <p className="home-empty-state-text">{error}</p>
          <button
            onClick={fetchRecommendations}
            className="home-refresh-btn"
            style={{
              marginTop: 'var(--spacing-md)',
              padding: 'var(--spacing-sm) var(--spacing-lg)',
              background: 'var(--color-primary)',
              color: 'var(--color-bg)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Try Again
          </button>
        </div>
      </section>
    );
  }

  // Check if we have any recommendations
  const hasSeriesContinuations = recommendations?.seriesFromHistory && recommendations.seriesFromHistory.length > 0;
  const hasSimilar = recommendations?.samePublisherGenre && recommendations.samePublisherGenre.length > 0;
  const hasRecent = recommendations?.recentlyAdded && recommendations.recentlyAdded.length > 0;
  const hasAnyRecommendations = hasSeriesContinuations || hasSimilar || hasRecent;

  // Empty state - no recommendations yet
  if (!hasAnyRecommendations) {
    return (
      <section className="home-section">
        <SectionHeader title="Recommended For You" />
        <div className="home-empty-state">
          <svg className="home-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <h3 className="home-empty-state-title">No recommendations yet</h3>
          <p className="home-empty-state-text">
            Start reading comics to get personalized recommendations based on your reading history.
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Continue Your Series */}
      {hasSeriesContinuations && (
        <section className="home-section">
          <SectionHeader
            title="Continue Your Series"
            subtitle={`${recommendations!.seriesFromHistory.length} available`}
            seeAllLink="/library?filter=series-continuation"
          />
          <ComicCarousel
            items={recommendations!.seriesFromHistory.map(toCardItem)}
            onItemClick={onItemClick}
            onItemsChange={onItemsChange}
          />
        </section>
      )}

      {/* Because You Like... */}
      {hasSimilar && (
        <section className="home-section">
          <SectionHeader
            title="Because You Like..."
            subtitle="Similar comics"
            seeAllLink="/library?filter=similar"
          />
          <ComicCarousel
            items={recommendations!.samePublisherGenre.map(toCardItem)}
            onItemClick={onItemClick}
            onItemsChange={onItemsChange}
          />
        </section>
      )}

      {/* Recently Added */}
      {hasRecent && (
        <section className="home-section">
          <SectionHeader
            title="Recently Added"
            subtitle="New arrivals"
            seeAllLink="/library?sort=recent"
          />
          <ComicCarousel
            items={recommendations!.recentlyAdded.map(toCardItem)}
            onItemClick={onItemClick}
            onItemsChange={onItemsChange}
          />
        </section>
      )}
    </>
  );
}
