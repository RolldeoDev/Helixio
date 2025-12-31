/**
 * SeriesCard Component
 *
 * Simplified, "dumb" card for the SeriesPage virtual grid.
 * Receives data, renders it, reports interactions. No internal state management.
 *
 * Rendering modes:
 * - Scrolling: Minimal render (cover + title only)
 * - Compact: Cover, title, issue count
 * - Full: Everything including progress bar, badges, hover actions
 */

import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GridItem } from '../../../services/api/series';
import { useCardCoverImage } from './useCardCoverImage';
import './SeriesCard.css';

// =============================================================================
// Types
// =============================================================================

export interface SeriesCardProps {
  /** Grid item data (series or collection) */
  item: GridItem;
  /** Whether this card is selected */
  isSelected: boolean;
  /** Whether the grid is currently scrolling (simplified render) */
  isScrolling: boolean;
  /** Card size setting (1-10, affects rendering mode) */
  cardSize: number;
  /** Selection handler */
  onSelect: (id: string, event: React.MouseEvent) => void;
  /** Context menu handler */
  onContextMenu: (id: string, event: React.MouseEvent) => void;
  /** Positioning style from virtual grid */
  style: React.CSSProperties;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getItemCoverData(item: GridItem) {
  if (item.itemType === 'series') {
    const series = item.series;
    return {
      coverSource: series.coverSource,
      resolvedCoverSource: series.resolvedCoverSource,
      coverHash: series.resolvedCoverHash ?? series.coverHash,
      coverFileId: series.resolvedCoverFileId ?? series.coverFileId,
      firstIssueId: series.issues?.[0]?.id ?? null,
      firstIssueCoverHash: series.issues?.[0]?.coverHash ?? null,
    };
  } else {
    // Collection - use derived cover from collection data
    const collection = item.collection;
    return {
      coverSource: 'auto' as const,
      resolvedCoverSource: null,
      coverHash: null,
      coverFileId: collection.coverFileId || null,
      firstIssueId: null,
      firstIssueCoverHash: null,
    };
  }
}

// =============================================================================
// Component
// =============================================================================

function SeriesCardInner({
  item,
  isSelected,
  isScrolling,
  cardSize,
  onSelect,
  onContextMenu,
  style,
}: SeriesCardProps) {
  const navigate = useNavigate();

  // Determine rendering mode
  const isCompact = cardSize >= 7;
  const renderMode = isScrolling ? 'scrolling' : isCompact ? 'compact' : 'full';

  // Extract display data
  const { id, name, issueCount, readCount } = item;
  const startYear = item.startYear;
  const publisher = item.publisher;

  // Progress calculations
  const progressPercent = issueCount > 0 ? Math.round((readCount / issueCount) * 100) : 0;
  const isComplete = issueCount > 0 && readCount >= issueCount;

  // Cover image
  const coverData = useMemo(() => getItemCoverData(item), [item]);
  const {
    status,
    coverUrl,
    containerRef,
    handleLoad,
    handleError,
  } = useCardCoverImage(coverData);

  // Click handler - navigate unless modifier keys are held
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Modifier keys trigger selection instead of navigation
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        e.preventDefault();
        onSelect(id, e);
        return;
      }

      // Navigate to detail page
      if (item.itemType === 'series') {
        navigate(`/series/${id}`);
      } else {
        navigate(`/collections/${id}`);
      }
    },
    [id, item.itemType, navigate, onSelect]
  );

  // Context menu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(id, e);
    },
    [id, onContextMenu]
  );

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (item.itemType === 'series') {
          navigate(`/series/${id}`);
        } else {
          navigate(`/collections/${id}`);
        }
      }
    },
    [id, item.itemType, navigate]
  );

  // Build class names
  const cardClassName = [
    'series-card',
    `series-card--${renderMode}`,
    isSelected && 'series-card--selected',
    item.itemType === 'collection' && 'series-card--collection',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClassName}
      style={style}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      role="button"
      aria-label={`${name}${startYear ? ` (${startYear})` : ''}`}
      aria-selected={isSelected}
    >
      {/* Cover */}
      <div ref={containerRef} className="series-card__cover">
        {/* Skeleton placeholder */}
        {status === 'loading' && (
          <div className="series-card__skeleton" aria-hidden="true" />
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="series-card__error">
            <span className="series-card__initial">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Cover image */}
        {coverUrl && (
          <img
            src={coverUrl}
            alt={name}
            loading="lazy"
            decoding="async"
            onLoad={handleLoad}
            onError={handleError}
            className={`series-card__image ${status === 'loaded' ? 'series-card__image--loaded' : ''}`}
          />
        )}

        {/* Gradient overlay (not in scrolling mode) */}
        {renderMode !== 'scrolling' && (
          <div className="series-card__gradient" aria-hidden="true" />
        )}

        {/* Issue count badge (not in scrolling mode) */}
        {renderMode !== 'scrolling' && (
          <div
            className={[
              'series-card__badge',
              isComplete && 'series-card__badge--complete',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {isComplete && (
              <svg className="series-card__check-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
              </svg>
            )}
            {readCount}/{issueCount}
          </div>
        )}

        {/* Progress bar (full mode only) */}
        {renderMode === 'full' && issueCount > 0 && (
          <div
            className={[
              'series-card__progress',
              isComplete && 'series-card__progress--complete',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div
              className="series-card__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Collection indicator */}
        {item.itemType === 'collection' && (
          <div className="series-card__collection-badge">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4z" />
            </svg>
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="series-card__info">
        <span className="series-card__title" title={name}>
          {name}
        </span>
        {renderMode !== 'scrolling' && (startYear || publisher) && (
          <div className="series-card__meta">
            {startYear && <span className="series-card__year">{startYear}</span>}
            {publisher && <span className="series-card__publisher">{publisher}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Memoization
// =============================================================================

/**
 * Custom comparison for React.memo.
 * Only re-render when display-affecting props change.
 */
function arePropsEqual(prev: SeriesCardProps, next: SeriesCardProps): boolean {
  // Check primitive props
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.updatedAt !== next.item.updatedAt) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isScrolling !== next.isScrolling) return false;
  if (prev.cardSize !== next.cardSize) return false;

  // Check style transform (position changes)
  if (prev.style.transform !== next.style.transform) return false;

  return true;
}

export const SeriesCard = React.memo(SeriesCardInner, arePropsEqual);
