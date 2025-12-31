/**
 * SeriesBrowserCard Component
 *
 * Cover card for the Series Browser page, built following LIBRARY_ARCH.md principles.
 * Uses the same performance patterns as the Library page's CoverCard:
 * - Batched IntersectionObserver for lazy image loading
 * - CSS-only skeleton with shimmer animation
 * - Image fade-in animation
 * - Scroll state detection for disabling effects
 *
 * This is a simplified version focused on display performance.
 * Context menus, selection, and bulk actions will be added in Phase 8.
 */

import React, { useCallback, useMemo } from 'react';
import { useSeriesCoverImage } from './useSeriesCoverImage';
import { ProgressRing } from '../Progress';
import type { Series } from '../../services/api.service';
import './SeriesBrowserCard.css';

// =============================================================================
// Types
// =============================================================================

/** Context menu action types */
export type SeriesCardMenuAction =
  | 'view'
  | 'fetchMetadata'
  | 'markAllRead'
  | 'markAllUnread'
  | 'merge'
  | 'link'
  | 'hide'
  | 'unhide';

interface SeriesBrowserCardProps {
  /** Series data */
  series: Series;

  /** Whether to load image immediately (for first row) */
  eager?: boolean;

  /** Click handler for navigation */
  onClick?: (seriesId: string) => void;

  /** Show year in info section */
  showYear?: boolean;

  /** Show publisher in info section */
  showPublisher?: boolean;

  /** Enable selection mode */
  selectable?: boolean;

  /** Whether this card is currently selected */
  isSelected?: boolean;

  /** Selection change callback (seriesId, selected, shiftKey) */
  onSelectionChange?: (seriesId: string, selected: boolean, shiftKey: boolean) => void;

  /** Enable context menu on right-click */
  contextMenuEnabled?: boolean;

  /** Context menu handler - receives event and seriesId for menu positioning */
  onContextMenu?: (e: React.MouseEvent, seriesId: string) => void;

  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Custom comparison for React.memo
 * Only re-render when display-affecting props change
 */
function arePropsEqual(
  prevProps: SeriesBrowserCardProps,
  nextProps: SeriesBrowserCardProps
): boolean {
  const prev = prevProps.series;
  const next = nextProps.series;

  // Identity
  if (prev.id !== next.id) return false;

  // Display fields
  if (prev.name !== next.name) return false;
  if (prev.startYear !== next.startYear) return false;
  if (prev.publisher !== next.publisher) return false;

  // Cover fields
  if (prev.coverHash !== next.coverHash) return false;
  if (prev.coverSource !== next.coverSource) return false;
  if (prev.coverFileId !== next.coverFileId) return false;
  if (prev.resolvedCoverHash !== next.resolvedCoverHash) return false;
  if (prev.resolvedCoverSource !== next.resolvedCoverSource) return false;
  if (prev.resolvedCoverFileId !== next.resolvedCoverFileId) return false;

  // Progress
  if (prev.progress?.totalRead !== next.progress?.totalRead) return false;
  if (prev.progress?.totalOwned !== next.progress?.totalOwned) return false;
  if (prev._count?.issues !== next._count?.issues) return false;

  // Options
  if (prevProps.eager !== nextProps.eager) return false;
  if (prevProps.showYear !== nextProps.showYear) return false;
  if (prevProps.showPublisher !== nextProps.showPublisher) return false;
  if (prevProps.className !== nextProps.className) return false;

  // Selection
  if (prevProps.selectable !== nextProps.selectable) return false;
  if (prevProps.isSelected !== nextProps.isSelected) return false;

  // Context menu
  if (prevProps.contextMenuEnabled !== nextProps.contextMenuEnabled) return false;

  return true;
}

export const SeriesBrowserCard = React.memo(function SeriesBrowserCard({
  series,
  eager = false,
  onClick,
  showYear = true,
  showPublisher = true,
  selectable = false,
  isSelected = false,
  onSelectionChange,
  contextMenuEnabled = false,
  onContextMenu,
  className = '',
}: SeriesBrowserCardProps) {
  // Build cover data for the hook
  const coverData = useMemo(() => {
    // Get first issue info for fallback
    const firstIssue = series.issues?.[0];
    const firstIssueId = firstIssue?.id;
    const firstIssueCoverHash = firstIssue?.coverHash;

    return {
      coverSource: series.coverSource,
      resolvedCoverSource: series.resolvedCoverSource,
      coverHash: series.resolvedCoverHash ?? series.coverHash,
      coverFileId: series.resolvedCoverFileId ?? series.coverFileId,
      firstIssueId,
      firstIssueCoverHash,
    };
  }, [
    series.coverSource,
    series.resolvedCoverSource,
    series.coverHash,
    series.coverFileId,
    series.resolvedCoverHash,
    series.resolvedCoverFileId,
    series.issues,
  ]);

  // Use the cover image hook with IntersectionObserver
  const {
    status,
    isInView,
    coverUrl,
    containerRef,
    handleLoad,
    handleError,
    handleRetry,
  } = useSeriesCoverImage(coverData, { eager });

  // Calculate progress
  const totalOwned = series.progress?.totalOwned ?? series._count?.issues ?? 0;
  const totalRead = series.progress?.totalRead ?? 0;
  const progressPercent = totalOwned > 0 ? Math.round((totalRead / totalOwned) * 100) : 0;
  const isComplete = totalOwned > 0 && totalRead >= totalOwned;
  const showProgress = totalOwned > 0 && (progressPercent > 0 || isComplete);

  // Handle click with selection modifiers
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (selectable && onSelectionChange) {
        // Ctrl/Cmd click or Shift click triggers selection
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          e.preventDefault();
          onSelectionChange(series.id, !isSelected, e.shiftKey);
          return;
        }
      }
      onClick?.(series.id);
    },
    [series.id, onClick, selectable, isSelected, onSelectionChange]
  );

  // Handle checkbox change
  const handleCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onSelectionChange?.(series.id, e.target.checked, false);
    },
    [series.id, onSelectionChange]
  );

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onClick?.(series.id);
      }
    },
    [series.id, onClick]
  );

  // Handle context menu (right-click)
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!contextMenuEnabled || !onContextMenu) return;

      e.preventDefault();
      e.stopPropagation();

      // Auto-select series when opening context menu
      if (!isSelected && onSelectionChange) {
        onSelectionChange(series.id, true, false);
      }

      // Dispatch to parent with event for positioning
      onContextMenu(e, series.id);
    },
    [contextMenuEnabled, onContextMenu, series.id, isSelected, onSelectionChange]
  );

  // Build class names
  const cardClassName = [
    'series-browser-card',
    selectable && 'series-browser-card--selectable',
    isSelected && 'series-browser-card--selected',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClassName}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      role="button"
      aria-label={`${series.name}${series.startYear ? ` (${series.startYear})` : ''}`}
      aria-selected={isSelected}
    >
      {/* Cover */}
      <div ref={containerRef} className="series-browser-card__cover">
        {/* Selection checkbox */}
        {selectable && (
          <label
            className="series-browser-card__checkbox-wrapper"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleCheckboxChange}
              className="series-browser-card__checkbox"
              aria-label={`Select ${series.name}`}
            />
            <span className="series-browser-card__checkbox-custom" />
          </label>
        )}

        {/* Skeleton placeholder - shown while loading */}
        {status === 'loading' && (
          <div className="series-browser-card__skeleton" aria-hidden="true" />
        )}

        {/* Error state */}
        {status === 'error' && (
          <div
            className="series-browser-card__error"
            onClick={handleRetry}
            title="Click to retry"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                handleRetry();
              }
            }}
          >
            <span className="series-browser-card__initial">
              {series.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Cover image - only render when in view */}
        {isInView && coverUrl && (
          <img
            src={coverUrl}
            alt={series.name}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={handleLoad}
            onError={handleError}
            className={`series-browser-card__image ${status === 'loaded' ? 'series-browser-card__image--loaded' : ''}`}
          />
        )}

        {/* Progress ring */}
        {showProgress && (
          <ProgressRing
            progress={isComplete ? 100 : progressPercent}
            size="md"
            showLabel
            className="series-browser-card__progress-ring"
          />
        )}

        {/* Issue count badge */}
        <div className="series-browser-card__count-badge">
          {totalRead}/{totalOwned}
        </div>
      </div>

      {/* Info section */}
      <div className="series-browser-card__info">
        <span className="series-browser-card__title" title={series.name}>
          {series.name}
        </span>
        <div className="series-browser-card__meta">
          {showYear && series.startYear && (
            <span className="series-browser-card__year">{series.startYear}</span>
          )}
          {showPublisher && series.publisher && (
            <span className="series-browser-card__publisher">{series.publisher}</span>
          )}
        </div>
      </div>
    </div>
  );
}, arePropsEqual);
