/**
 * SeriesCard Component
 *
 * Simplified, "dumb" card for the SeriesPage virtual grid.
 * Receives data, renders it, reports interactions. No internal state management.
 *
 * Rendering modes:
 * - Compact: Cover, title, issue count (for large card sizes)
 * - Full: Everything including progress bar, badges, hover actions
 */

import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GridItem, getNextSeriesIssue } from '../../../services/api/series';
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
  /** Card size setting (1-10, affects rendering mode) */
  cardSize: number;
  /** Whether selection mode is active (shows checkboxes) */
  selectable?: boolean;
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
  cardSize,
  selectable = false,
  onSelect,
  onContextMenu,
  style,
}: SeriesCardProps) {
  const navigate = useNavigate();

  // Determine rendering mode based on card size
  const isCompact = cardSize >= 7;
  const renderMode = isCompact ? 'compact' : 'full';

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

  // Checkbox change handler
  const handleCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      // Create a synthetic mouse event for the selection handler
      onSelect(id, { ctrlKey: true, metaKey: false, shiftKey: false } as React.MouseEvent);
    },
    [id, onSelect]
  );

  // Read button click - navigate to continue reading
  const handleReadClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (item.itemType !== 'series') return;

      try {
        const result = await getNextSeriesIssue(id);
        if (result.nextIssue) {
          navigate(`/read/${result.nextIssue.id}?filename=${encodeURIComponent(result.nextIssue.filename)}`);
        } else {
          // No unread issues - go to series detail
          navigate(`/series/${id}`);
        }
      } catch {
        // On error, fall back to series detail
        navigate(`/series/${id}`);
      }
    },
    [id, item.itemType, navigate]
  );

  // Build class names
  const cardClassName = [
    'series-card',
    `series-card--${renderMode}`,
    isSelected && 'series-card--selected',
    selectable && 'series-card--selectable',
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
        {/* Selection checkbox - always rendered, visibility controlled by CSS */}
        <label
          className="series-card__checkbox-wrapper"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            className="series-card__checkbox"
            aria-label={`Select ${name}`}
          />
          <span className="series-card__checkbox-custom" />
        </label>

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

        {/* Gradient overlay */}
        <div className="series-card__gradient" aria-hidden="true" />

        {/* Hover overlay with read button (series only) */}
        {item.itemType === 'series' && (
          <div className="series-card__hover-overlay">
            <button
              className="series-card__read-button"
              onClick={handleReadClick}
              aria-label={`Read ${name}`}
            >
              <svg
                className="series-card__read-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </button>
          </div>
        )}

        {/* Issue count badge */}
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
        {(startYear || publisher) && (
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
  if (prev.cardSize !== next.cardSize) return false;
  if (prev.selectable !== next.selectable) return false;

  // Check style properties (position and dimensions)
  if (prev.style.transform !== next.style.transform) return false;
  if (prev.style.width !== next.style.width) return false;
  if (prev.style.height !== next.style.height) return false;

  return true;
}

export const SeriesCard = React.memo(SeriesCardInner, arePropsEqual);
