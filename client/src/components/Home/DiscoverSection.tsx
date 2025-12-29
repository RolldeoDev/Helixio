/**
 * Discover Section
 *
 * Intelligent series recommendations based on reading history.
 * Features:
 * - Personalized recommendations using similarity scores
 * - Recommendation reason badges (e.g., "Similar to Batman")
 * - Refresh button to get new recommendations
 * - Falls back to legacy random discover for unauthenticated users
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader } from './SectionHeader';
import { SkeletonCard } from '../LoadingState';
import { useAuth } from '../../contexts/AuthContext';
import {
  getIntelligentRecommendations,
  getDiscoverComics,
  submitRecommendationFeedback,
  type SeriesRecommendation,
  type DiscoverComic,
  type RecommendationFeedbackType,
} from '../../services/api.service';
import { getCoverUrl, getApiCoverUrl } from '../../services/api.service';

// =============================================================================
// Types
// =============================================================================

interface DiscoverSectionProps {
  libraryId?: string;
  /** Handler for series card clicks (intelligent mode) */
  onSeriesClick?: (seriesId: string) => void;
  /** Handler for comic file clicks (legacy mode) - kept for backward compatibility */
  onItemClick?: (fileId: string) => void;
  onItemsChange?: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the primary reason text for a recommendation
 */
function getReasonText(recommendation: SeriesRecommendation): string | null {
  const reasons = recommendation.reasons;
  if (!reasons || reasons.length === 0) {
    return null;
  }

  const reason = reasons[0];
  if (!reason) {
    return null;
  }

  switch (reason.type) {
    case 'similar_to':
      return reason.sourceSeriesName
        ? `Similar to ${reason.sourceSeriesName}`
        : 'Based on your reading';
    case 'genre':
      return reason.detail || 'Matches your genres';
    case 'creator':
      return reason.detail || 'Same creator';
    case 'popular':
      return 'Popular series';
    case 'random':
      return 'You might like';
    default:
      return null;
  }
}

/**
 * Get cover URL for a recommendation with smart fallback:
 * 1. Series coverHash (API downloaded cover)
 * 2. Series coverUrl (external URL)
 * 3. First issue coverHash
 * 4. First issue file cover (via getCoverUrl)
 */
function getRecommendationCoverUrl(series: SeriesRecommendation['series']): string | null {
  // Priority 1: Series has a direct coverHash (API downloaded cover)
  if (series.coverHash) {
    return getApiCoverUrl(series.coverHash);
  }
  // Priority 2: Series has a coverUrl (external URL)
  if (series.coverUrl) {
    return series.coverUrl;
  }
  // Priority 3: First issue has a coverHash
  if (series.firstIssueCoverHash) {
    return getApiCoverUrl(series.firstIssueCoverHash);
  }
  // Priority 4: First issue file cover
  if (series.firstIssueId) {
    return getCoverUrl(series.firstIssueId);
  }
  return null;
}

// =============================================================================
// Recommendation Card Component
// =============================================================================

interface RecommendationCardProps {
  recommendation: SeriesRecommendation;
  onClick: (seriesId: string) => void;
  onFeedback: (seriesId: string, type: RecommendationFeedbackType) => void;
  animationIndex: number;
  feedbackGiven?: RecommendationFeedbackType | null;
}

function RecommendationCard({ recommendation, onClick, onFeedback, animationIndex, feedbackGiven }: RecommendationCardProps) {
  const { series } = recommendation;
  const coverUrl = getRecommendationCoverUrl(series);
  const reasonText = getReasonText(recommendation);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleFeedback = (e: React.MouseEvent, type: RecommendationFeedbackType) => {
    e.stopPropagation();
    onFeedback(series.id, type);
  };

  return (
    <div
      className={`discover-card ${feedbackGiven ? 'discover-card--has-feedback' : ''}`}
      onClick={() => onClick(series.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(series.id)}
      style={{ '--animation-index': animationIndex } as React.CSSProperties}
    >
      <div className="discover-card__cover">
        {/* Loading/placeholder state */}
        {(!imageLoaded || imageError || !coverUrl) && (
          <div className="discover-card__placeholder">
            <span className="discover-card__initial">
              {series.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Cover image */}
        {coverUrl && !imageError && (
          <img
            src={coverUrl}
            alt={series.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            className={`discover-card__image ${imageLoaded ? 'discover-card__image--loaded' : ''}`}
          />
        )}

        {/* Reason badge */}
        {reasonText && (
          <div className="discover-card__reason">
            {reasonText}
          </div>
        )}

        {/* Feedback buttons - shown on hover */}
        <div className="discover-card__feedback">
          <button
            className={`discover-card__feedback-btn discover-card__feedback-btn--like ${feedbackGiven === 'like' ? 'active' : ''}`}
            onClick={(e) => handleFeedback(e, 'like')}
            title="Like this recommendation"
            aria-label="Like"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button
            className={`discover-card__feedback-btn discover-card__feedback-btn--dislike ${feedbackGiven === 'dislike' || feedbackGiven === 'not_interested' ? 'active' : ''}`}
            onClick={(e) => handleFeedback(e, 'not_interested')}
            title="Not interested"
            aria-label="Not interested"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
          </button>
        </div>

        {/* Issue count badge */}
        <div className="discover-card__count">
          {series.issueCount} {series.issueCount === 1 ? 'issue' : 'issues'}
        </div>
      </div>

      <div className="discover-card__info">
        <span className="discover-card__title" title={series.name}>
          {series.name}
        </span>
        <span className="discover-card__meta">
          {series.startYear && (
            <span className="discover-card__year">{series.startYear}</span>
          )}
          {series.publisher && (
            <span className="discover-card__publisher">{series.publisher}</span>
          )}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Legacy Card Component (for unauthenticated users)
// =============================================================================

interface LegacyCardProps {
  comic: DiscoverComic;
  onClick: (fileId: string) => void;
  animationIndex: number;
}

function LegacyCard({ comic, onClick, animationIndex }: LegacyCardProps) {
  const coverUrl = getCoverUrl(comic.fileId);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className="discover-card"
      onClick={() => onClick(comic.fileId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(comic.fileId)}
      style={{ '--animation-index': animationIndex } as React.CSSProperties}
    >
      <div className="discover-card__cover">
        {(!imageLoaded || imageError) && (
          <div className="discover-card__placeholder">
            <span className="discover-card__initial">
              {(comic.series || comic.filename).charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <img
          src={coverUrl}
          alt={comic.filename}
          loading="lazy"
          decoding="async"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`discover-card__image ${imageLoaded ? 'discover-card__image--loaded' : ''}`}
        />
      </div>

      <div className="discover-card__info">
        <span className="discover-card__title" title={comic.series || comic.filename}>
          {comic.series || comic.filename}
        </span>
        <span className="discover-card__meta">
          {comic.number && (
            <span className="discover-card__number">#{comic.number}</span>
          )}
          {comic.publisher && (
            <span className="discover-card__publisher">{comic.publisher}</span>
          )}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function DiscoverSection({
  libraryId,
  onSeriesClick,
  onItemClick,
}: DiscoverSectionProps) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [recommendations, setRecommendations] = useState<SeriesRecommendation[]>([]);
  const [legacyComics, setLegacyComics] = useState<DiscoverComic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track feedback given to each series (seriesId -> feedbackType)
  const [feedbackMap, setFeedbackMap] = useState<Map<string, RecommendationFeedbackType>>(new Map());

  // Carousel state
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Use intelligent recommendations only when authenticated
  const useIntelligent = isAuthenticated && user?.id;

  const fetchRecommendations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (useIntelligent && user?.id) {
        const data = await getIntelligentRecommendations(user.id, 20, libraryId);
        setRecommendations(data.recommendations);
        setLegacyComics([]);
      } else {
        // Fall back to legacy random discover
        const data = await getDiscoverComics(24, libraryId);
        setLegacyComics(data.comics);
        setRecommendations([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recommendations');
      console.error('Error fetching recommendations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [useIntelligent, user?.id, libraryId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Update carousel scroll state
  const updateScrollState = useCallback(() => {
    const container = carouselRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  }, []);

  // Check scroll state after content loads
  useEffect(() => {
    updateScrollState();
    // Re-check after a short delay to account for images loading
    const timer = setTimeout(updateScrollState, 200);
    return () => clearTimeout(timer);
  }, [recommendations, legacyComics, updateScrollState]);

  // Scroll carousel left/right
  const scrollCarousel = useCallback((direction: 'left' | 'right') => {
    const container = carouselRef.current;
    if (!container) return;

    // Scroll by approximately 4 cards worth
    const cardWidth = 160; // Approximate card width including gap
    const scrollAmount = cardWidth * 4;

    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  // Handle scroll event to update button visibility
  const handleScroll = useCallback(() => {
    updateScrollState();
  }, [updateScrollState]);

  // Handle series click - navigate to series detail page
  const handleSeriesClick = useCallback((seriesId: string) => {
    if (onSeriesClick) {
      onSeriesClick(seriesId);
    } else {
      navigate(`/series/${seriesId}`);
    }
  }, [navigate, onSeriesClick]);

  // Handle legacy comic click - navigate to reader or use callback
  const handleComicClick = useCallback((fileId: string) => {
    if (onItemClick) {
      onItemClick(fileId);
    } else {
      navigate(`/read/${fileId}`);
    }
  }, [navigate, onItemClick]);

  // Handle feedback submission
  const handleFeedback = useCallback(async (seriesId: string, feedbackType: RecommendationFeedbackType) => {
    if (!user?.id) return;

    // Optimistically update the feedback map
    setFeedbackMap((prev) => {
      const next = new Map(prev);
      // Toggle off if same feedback type is clicked again
      if (prev.get(seriesId) === feedbackType) {
        next.delete(seriesId);
      } else {
        next.set(seriesId, feedbackType);
      }
      return next;
    });

    try {
      await submitRecommendationFeedback(
        user.id,
        seriesId,
        feedbackType
      );

      // If disliked or not interested, remove from recommendations after a short delay
      if (feedbackType === 'dislike' || feedbackType === 'not_interested') {
        setTimeout(() => {
          setRecommendations((prev) => prev.filter((rec) => rec.seriesId !== seriesId));
        }, 500);
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      // Revert optimistic update on error
      setFeedbackMap((prev) => {
        const next = new Map(prev);
        next.delete(seriesId);
        return next;
      });
    }
  }, [user?.id]);

  // Items for display
  const hasItems = useIntelligent ? recommendations.length > 0 : legacyComics.length > 0;
  const itemCount = useIntelligent ? recommendations.length : legacyComics.length;

  // Loading state
  if (isLoading) {
    return (
      <section className="home-section">
        <SectionHeader title="Discover" />
        <div className="discover-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <SkeletonCard key={i} size="sm" />
          ))}
        </div>
      </section>
    );
  }

  // Error state
  if (error) {
    return (
      <section className="home-section">
        <SectionHeader title="Discover" />
        <div className="home-empty-state">
          <svg className="home-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3 className="home-empty-state-title">Couldn't load recommendations</h3>
          <p className="home-empty-state-text">{error}</p>
          <button
            onClick={() => fetchRecommendations()}
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

  // Empty state
  if (!hasItems) {
    return (
      <section className="home-section">
        <SectionHeader title="Discover" />
        <div className="home-empty-state">
          <svg className="home-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <h3 className="home-empty-state-title">Nothing to discover yet</h3>
          <p className="home-empty-state-text">
            {useIntelligent
              ? 'Read some comics and we\'ll recommend similar series you might enjoy.'
              : 'Add comics to your library to start discovering new reads.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="home-section">
      <SectionHeader
        title="Discover"
        subtitle={`${itemCount} ${useIntelligent ? 'recommendations' : 'to explore'}`}
        seeAllLink="/series"
      />

      {/* Carousel Container */}
      <div className="discover-carousel-container">
        {/* Left Navigation Arrow */}
        {canScrollLeft && (
          <button
            className="discover-carousel-nav discover-carousel-nav--left"
            onClick={() => scrollCarousel('left')}
            aria-label="Scroll left"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {/* Carousel Track */}
        <div
          ref={carouselRef}
          className="discover-carousel"
          onScroll={handleScroll}
        >
          {useIntelligent
            ? recommendations.map((rec, index) => (
                <RecommendationCard
                  key={rec.seriesId}
                  recommendation={rec}
                  onClick={handleSeriesClick}
                  onFeedback={handleFeedback}
                  animationIndex={index}
                  feedbackGiven={feedbackMap.get(rec.seriesId)}
                />
              ))
            : legacyComics.map((comic, index) => (
                <LegacyCard
                  key={comic.fileId}
                  comic={comic}
                  onClick={handleComicClick}
                  animationIndex={index}
                />
              ))}
        </div>

        {/* Right Navigation Arrow */}
        {canScrollRight && (
          <button
            className="discover-carousel-nav discover-carousel-nav--right"
            onClick={() => scrollCarousel('right')}
            aria-label="Scroll right"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
