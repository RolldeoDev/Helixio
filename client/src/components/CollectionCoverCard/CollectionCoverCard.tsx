/**
 * CollectionCoverCard Component
 *
 * Cover card for displaying promoted collections in the series grid.
 * Shows server-generated mosaic or custom cover with aggregate reading progress.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { getCoverUrl, getApiCoverUrl, getCollectionCoverUrl } from '../../services/api.service';
import { ProgressRing } from '../Progress';
import './CollectionCoverCard.css';

// =============================================================================
// Types
// =============================================================================

export type CollectionCoverCardSize = 'small' | 'medium' | 'large';

/** Series cover info for fallback cover resolution */
export interface SeriesCoverInfo {
  id: string;
  name: string;
  coverHash?: string | null;
  coverFileId?: string | null;
  firstIssueId?: string | null;
  /** First issue's coverHash for cache-busting when issue cover changes */
  firstIssueCoverHash?: string | null;
}

export interface PromotedCollectionData {
  id: string;
  name: string;
  description?: string | null;
  isPromoted: boolean;
  coverType: 'auto' | 'series' | 'issue' | 'custom';
  coverSeriesId?: string | null;
  coverFileId?: string | null;
  coverHash?: string | null;
  derivedPublisher?: string | null;
  derivedStartYear?: number | null;
  derivedEndYear?: number | null;
  derivedGenres?: string | null;
  derivedIssueCount?: number | null;
  derivedReadCount?: number | null;
  overridePublisher?: string | null;
  overrideStartYear?: number | null;
  overrideEndYear?: number | null;
  overrideGenres?: string | null;
  totalIssues: number;
  readIssues: number;
  seriesCovers: SeriesCoverInfo[];
  /** Number of series in the collection (for placeholder display) */
  seriesCount?: number;
}

export interface CollectionCoverCardProps {
  /** Collection data */
  collection: PromotedCollectionData;

  /** Size variant */
  size?: CollectionCoverCardSize;

  /** Click handler */
  onClick?: (collectionId: string) => void;

  /** Show year in info section */
  showYear?: boolean;

  /** Show publisher in info section */
  showPublisher?: boolean;

  /** Custom class name */
  className?: string;

  /** Animation delay index */
  animationIndex?: number;

  /** Tab index for keyboard navigation */
  tabIndex?: number;
}

// =============================================================================
// Component
// =============================================================================

export function CollectionCoverCard({
  collection,
  size = 'medium',
  onClick,
  showYear = true,
  showPublisher = true,
  className = '',
  animationIndex,
  tabIndex = 0,
}: CollectionCoverCardProps) {
  // Determine cover display
  const coverUrl = useMemo(() => {
    // Auto mode: use server-generated mosaic cover
    if (collection.coverType === 'auto') {
      if (collection.coverHash) {
        return getCollectionCoverUrl(collection.coverHash);
      }
      // No coverHash = empty collection or not yet generated, show placeholder
      return null;
    }
    // Custom uploaded cover
    if (collection.coverType === 'custom' && collection.coverHash) {
      return getApiCoverUrl(collection.coverHash);
    }
    // Issue cover
    if (collection.coverType === 'issue' && collection.coverFileId) {
      return getCoverUrl(collection.coverFileId);
    }
    // Series cover
    if (collection.coverType === 'series' && collection.coverSeriesId) {
      // Find the series cover URL from seriesCovers
      const series = collection.seriesCovers.find((s) => s.id === collection.coverSeriesId);
      if (series) {
        if (series.coverHash) return getApiCoverUrl(series.coverHash);
        if (series.coverFileId) return getCoverUrl(series.coverFileId);
        if (series.firstIssueId) return getCoverUrl(series.firstIssueId, series.firstIssueCoverHash);
      }
    }
    return null;
  }, [collection]);

  const showPlaceholder = !coverUrl;

  // Cover loading state
  const [coverStatus, setCoverStatus] = useState<'loading' | 'loaded' | 'error'>(
    coverUrl ? 'loading' : 'error'
  );
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!coverUrl) {
      setCoverStatus('error');
      return;
    }

    const img = imgRef.current;
    if (img && img.complete) {
      if (img.naturalWidth > 0) {
        setCoverStatus('loaded');
      } else {
        setCoverStatus('error');
      }
    } else {
      setCoverStatus('loading');
    }
  }, [coverUrl]);

  const handleLoad = useCallback(() => {
    setCoverStatus('loaded');
  }, []);

  const handleError = useCallback(() => {
    setCoverStatus('error');
  }, []);

  // Calculate progress
  const totalIssues = collection.totalIssues;
  const readIssues = collection.readIssues;
  const progressPercent = totalIssues > 0 ? Math.round((readIssues / totalIssues) * 100) : 0;
  const isComplete = totalIssues > 0 && readIssues >= totalIssues;

  // Get display metadata (prefer overrides)
  const displayPublisher = collection.overridePublisher ?? collection.derivedPublisher;
  const displayYear = collection.overrideStartYear ?? collection.derivedStartYear;

  // Handle click
  const handleClick = useCallback(() => {
    onClick?.(collection.id);
  }, [collection.id, onClick]);

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onClick?.(collection.id);
      }
    },
    [collection.id, onClick]
  );

  // Animation style
  const animationStyle =
    animationIndex !== undefined
      ? ({ '--animation-index': animationIndex } as React.CSSProperties)
      : undefined;

  return (
    <div
      className={`collection-cover-card collection-cover-card--${size} ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={tabIndex}
      role="button"
      aria-label={`Collection: ${collection.name}${displayYear ? ` (${displayYear})` : ''}`}
      style={animationStyle}
    >
      {/* Collection badge */}
      <div className="collection-cover-card__badge">
        <svg className="collection-cover-card__badge-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
        </svg>
        Collection
      </div>

      {/* Cover */}
      <div className="collection-cover-card__cover">
        {/* Placeholder for empty collections or cover not yet generated */}
        {showPlaceholder && (
          <div className="collection-cover-card__placeholder">
            <svg className="collection-cover-card__placeholder-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
            </svg>
            <span className="collection-cover-card__placeholder-text">
              {collection.seriesCovers?.length === 0 ? 'Empty' : 'Loading...'}
            </span>
          </div>
        )}

        {/* Cover image (server-side mosaic, custom, issue, or series cover) */}
        {coverUrl && (
          <div className="collection-cover-card__cover-container">
            {coverStatus === 'loading' && (
              <div className="collection-cover-card__loading">
                <div className="collection-cover-card__spinner" />
              </div>
            )}

            {coverStatus === 'error' && (
              <div className="collection-cover-card__placeholder">
                <svg className="collection-cover-card__placeholder-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
                </svg>
              </div>
            )}

            <img
              ref={imgRef}
              src={coverUrl}
              alt={collection.name}
              loading="lazy"
              decoding="async"
              onLoad={handleLoad}
              onError={handleError}
              className={`collection-cover-card__image ${
                coverStatus === 'loaded' ? 'collection-cover-card__image--loaded' : ''
              }`}
            />
          </div>
        )}

        {/* Progress ring - shows percentage when in progress, 100% when completed */}
        {totalIssues > 0 && (progressPercent > 0 || isComplete) && (
          <ProgressRing
            progress={isComplete ? 100 : progressPercent}
            size="md"
            showLabel
            className="collection-cover-card__progress-ring"
          />
        )}

        {/* Issue count badge */}
        <div className="collection-cover-card__count-badge">
          {readIssues}/{totalIssues}
        </div>
      </div>

      {/* Info */}
      <div className="collection-cover-card__info">
        <span className="collection-cover-card__title" title={collection.name}>
          {collection.name}
        </span>
        <span className="collection-cover-card__meta">
          {showYear && displayYear && (
            <span className="collection-cover-card__year">{displayYear}</span>
          )}
          {showPublisher && displayPublisher && (
            <span className="collection-cover-card__publisher">{displayPublisher}</span>
          )}
          {!displayYear && !displayPublisher && collection.seriesCovers.length > 0 && (
            <span className="collection-cover-card__series-count">
              {collection.seriesCovers.length} series
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export default CollectionCoverCard;
