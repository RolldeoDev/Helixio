/**
 * MinimalSeriesCard Component
 *
 * Lightweight series card for high-performance grid rendering.
 * Minimal props, pure display - optimized for virtual grids with 5000+ items.
 *
 * Performance optimizations:
 * - Simple memoization with 4-field comparison
 * - Native lazy loading (loading="lazy", decoding="async")
 * - Skeleton shown until image loads
 * - CSS containment for layout isolation
 */

import React, { memo, useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCoverUrl, getApiCoverUrl } from '../../services/api/files';
import { ProgressRing } from '../Progress/ProgressRing';
import type { SeriesBrowseItem } from '../../services/api/series';
import './MinimalSeriesCard.css';

// =============================================================================
// Types
// =============================================================================

export interface MinimalSeriesCardProps {
  /** Series data from browse API */
  series: SeriesBrowseItem;
  /** Inline style (position from virtual grid) */
  style: React.CSSProperties;
}

// =============================================================================
// Component
// =============================================================================

function MinimalSeriesCardComponent({
  series,
  style,
}: MinimalSeriesCardProps) {
  const navigate = useNavigate();
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Memoize cover URL calculation
  const coverUrl = useMemo(() => {
    // Priority: API > User > First Issue
    if (series.coverSource === 'api' && series.coverHash) {
      return getApiCoverUrl(series.coverHash);
    }
    if (series.coverSource === 'user' && series.coverFileId) {
      return getCoverUrl(series.coverFileId);
    }
    // Auto fallback chain
    if (series.coverHash) return getApiCoverUrl(series.coverHash);
    if (series.coverFileId) return getCoverUrl(series.coverFileId);
    if (series.firstIssueId) {
      return getCoverUrl(series.firstIssueId, series.firstIssueCoverHash);
    }
    return null;
  }, [
    series.coverHash,
    series.coverFileId,
    series.coverSource,
    series.firstIssueId,
    series.firstIssueCoverHash,
  ]);

  // Calculate progress
  const progressPercent = series.issueCount > 0
    ? Math.round((series.readCount / series.issueCount) * 100)
    : 0;
  const isComplete = series.issueCount > 0 && series.readCount >= series.issueCount;

  // Reset image state when cover URL changes and check for cached images
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);

    // Check if image is already cached/loaded (handles browser cache)
    // This is needed because onLoad may not fire for cached images
    const img = imgRef.current;
    if (img && img.complete) {
      if (img.naturalWidth > 0) {
        setImageLoaded(true);
      } else if (coverUrl) {
        // Image failed to load (naturalWidth is 0 for broken images)
        setImageError(true);
      }
    }
  }, [coverUrl]);

  // Handle image load
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  // Handle image error
  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  // Navigate to series detail
  const handleClick = useCallback(() => {
    navigate(`/series/${series.id}`);
  }, [navigate, series.id]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate(`/series/${series.id}`);
      }
    },
    [navigate, series.id]
  );

  // Show skeleton until image loads (or if there's no cover URL)
  const showSkeleton = !imageLoaded && !imageError && coverUrl;
  const showPlaceholder = imageError || !coverUrl;

  return (
    <div
      className="minimal-series-card"
      style={style}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${series.name}${series.startYear ? ` (${series.startYear})` : ''}`}
    >
      <div className="minimal-series-card__cover">
        {/* Skeleton shown until image loads */}
        {showSkeleton && (
          <div className="minimal-series-card__skeleton" />
        )}

        {/* Image - always in DOM once we have a URL */}
        {coverUrl && !imageError && (
          <img
            ref={imgRef}
            src={coverUrl}
            alt={series.name}
            decoding="async"
            className={`minimal-series-card__image ${imageLoaded ? 'minimal-series-card__image--loaded' : ''}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}

        {/* Placeholder for no cover or error */}
        {showPlaceholder && (
          <div className="minimal-series-card__placeholder">
            {series.name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Progress ring in upper right - only show if there's progress */}
        {series.issueCount > 0 && progressPercent > 0 && (
          <div
            className="minimal-series-card__progress-ring"
            title={`${series.readCount} of ${series.issueCount} read`}
          >
            <ProgressRing
              progress={progressPercent}
              size="md"
              showLabel
              completed={isComplete}
            />
          </div>
        )}
      </div>

      <div className="minimal-series-card__info">
        <span className="minimal-series-card__title" title={series.name}>
          {series.name}
        </span>
        {series.publisher && (
          <span className="minimal-series-card__publisher">{series.publisher}</span>
        )}
        {series.startYear && (
          <span className="minimal-series-card__year">{series.startYear}</span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Memoization
// =============================================================================

/**
 * Simple equality check for memoization.
 * Only re-renders when essential props change.
 * Note: Must include width/height since transform can be identical
 * for items at position (0,0) even when size changes.
 */
function areEqual(
  prev: MinimalSeriesCardProps,
  next: MinimalSeriesCardProps
): boolean {
  return (
    prev.series.id === next.series.id &&
    prev.series.readCount === next.series.readCount &&
    prev.series.coverHash === next.series.coverHash &&
    prev.style.transform === next.style.transform &&
    prev.style.width === next.style.width &&
    prev.style.height === next.style.height
  );
}

export const MinimalSeriesCard = memo(MinimalSeriesCardComponent, areEqual);
