/**
 * CollectionCoverCard Component
 *
 * Cover card for displaying promoted collections in the series grid.
 * Shows mosaic or custom cover with aggregate reading progress.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { MosaicCover, type SeriesCoverInfo } from '../MosaicCover';
import { getCoverUrl, getApiCoverUrl } from '../../services/api.service';
import './CollectionCoverCard.css';

// =============================================================================
// Types
// =============================================================================

export type CollectionCoverCardSize = 'small' | 'medium' | 'large';

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
  const customCoverUrl = useMemo(() => {
    if (collection.coverType === 'custom' && collection.coverHash) {
      return getApiCoverUrl(collection.coverHash);
    }
    if (collection.coverType === 'issue' && collection.coverFileId) {
      return getCoverUrl(collection.coverFileId);
    }
    if (collection.coverType === 'series' && collection.coverSeriesId) {
      // Find the series cover URL from seriesCovers
      const series = collection.seriesCovers.find((s) => s.id === collection.coverSeriesId);
      if (series) {
        if (series.coverHash) return getApiCoverUrl(series.coverHash);
        if (series.coverFileId) return getCoverUrl(series.coverFileId);
        if (series.firstIssueId) return getCoverUrl(series.firstIssueId);
      }
    }
    return null;
  }, [collection]);

  const showMosaic = collection.coverType === 'auto' || !customCoverUrl;

  // Custom cover state
  const [customCoverStatus, setCustomCoverStatus] = useState<'loading' | 'loaded' | 'error'>(
    customCoverUrl ? 'loading' : 'error'
  );
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!customCoverUrl) {
      setCustomCoverStatus('error');
      return;
    }

    const img = imgRef.current;
    if (img && img.complete) {
      if (img.naturalWidth > 0) {
        setCustomCoverStatus('loaded');
      } else {
        setCustomCoverStatus('error');
      }
    } else {
      setCustomCoverStatus('loading');
    }
  }, [customCoverUrl]);

  const handleLoad = useCallback(() => {
    setCustomCoverStatus('loaded');
  }, []);

  const handleError = useCallback(() => {
    setCustomCoverStatus('error');
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
        {/* Mosaic cover (auto mode or custom cover failed) */}
        {showMosaic && (
          <MosaicCover
            seriesCovers={collection.seriesCovers}
            alt={collection.name}
            size={size}
          />
        )}

        {/* Custom cover */}
        {!showMosaic && customCoverUrl && (
          <div className="collection-cover-card__custom-cover">
            {customCoverStatus === 'loading' && (
              <div className="collection-cover-card__loading">
                <div className="collection-cover-card__spinner" />
              </div>
            )}

            {customCoverStatus === 'error' && (
              <MosaicCover
                seriesCovers={collection.seriesCovers}
                alt={collection.name}
                size={size}
              />
            )}

            <img
              ref={imgRef}
              src={customCoverUrl}
              alt={collection.name}
              loading="lazy"
              decoding="async"
              onLoad={handleLoad}
              onError={handleError}
              className={`collection-cover-card__image ${
                customCoverStatus === 'loaded' ? 'collection-cover-card__image--loaded' : ''
              }`}
            />
          </div>
        )}

        {/* Progress bar */}
        {totalIssues > 0 && !isComplete && (
          <div className="collection-cover-card__progress">
            <div
              className="collection-cover-card__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Completed indicator */}
        {isComplete && (
          <div className="collection-cover-card__completed" title="Collection complete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </div>
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
