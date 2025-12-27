/**
 * SeriesCoverCard Component
 *
 * Cover card for displaying series with progress indicators and count badges.
 * Supports theming via CSS custom properties.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getCoverUrl, getApiCoverUrl, type Series } from '../../services/api.service';
import { UnifiedMenu, buildMenuItems, MENU_PRESETS } from '../UnifiedMenu';
import type { MenuState, MenuContext, MenuItem } from '../UnifiedMenu/types';
import './SeriesCoverCard.css';

// =============================================================================
// Types
// =============================================================================

export type SeriesCoverCardSize = 'small' | 'medium' | 'large';

/** Menu item preset identifiers for series context menu */
export type SeriesMenuItemPreset = 'view' | 'fetchMetadata' | 'markAllRead' | 'markAllUnread' | 'mergeWith' | 'hide' | 'unhide';

/** Custom menu item for series cards */
export interface SeriesMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
  dividerAfter?: boolean;
}

export interface SeriesCoverCardProps {
  /** Series data */
  series: Series;

  /** Size variant */
  size?: SeriesCoverCardSize;

  /** Click handler */
  onClick?: (seriesId: string) => void;

  /** Context menu action handler */
  onMenuAction?: (action: SeriesMenuItemPreset | string, seriesId: string) => void;

  /** Enable context menu on right-click */
  contextMenuEnabled?: boolean;

  /** Show year in info section */
  showYear?: boolean;

  /** Show publisher in info section */
  showPublisher?: boolean;

  /** Enable selection checkbox */
  selectable?: boolean;

  /** Whether this series is currently selected */
  isSelected?: boolean;

  /** Selection change handler - called when checkbox is toggled */
  onSelectionChange?: (seriesId: string, selected: boolean, shiftKey?: boolean) => void;

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

export function SeriesCoverCard({
  series,
  size = 'medium',
  onClick,
  onMenuAction,
  contextMenuEnabled = false,
  showYear = true,
  showPublisher = true,
  selectable = false,
  isSelected = false,
  onSelectionChange,
  className = '',
  animationIndex,
  tabIndex = 0,
}: SeriesCoverCardProps) {
  // Memoize the cover URL to prevent recalculation
  const coverUrl = useMemo(() => {
    // Respect the coverSource setting:
    // - 'api': Use API cover (coverHash) if available
    // - 'user': Use coverFileId if available
    // - 'auto': Use automatic fallback (API > User > First Issue)
    const firstIssueId = series.issues?.[0]?.id;

    if (series.coverSource === 'api') {
      // Explicit API cover mode - only use coverHash
      if (series.coverHash) return getApiCoverUrl(series.coverHash);
      // Fall through to first issue if no API cover available
      if (firstIssueId) return getCoverUrl(firstIssueId);
      return null;
    }

    if (series.coverSource === 'user') {
      // Explicit user selection mode - use coverFileId
      if (series.coverFileId) return getCoverUrl(series.coverFileId);
      // Fall through to first issue if selection is invalid
      if (firstIssueId) return getCoverUrl(firstIssueId);
      return null;
    }

    // 'auto' mode or unset: Priority fallback chain
    // API cover (local cache) > User-set file > First issue in series
    if (series.coverHash) return getApiCoverUrl(series.coverHash);
    if (series.coverFileId) return getCoverUrl(series.coverFileId);
    if (firstIssueId) return getCoverUrl(firstIssueId);
    return null;
  }, [series.coverSource, series.coverFileId, series.coverHash, series.issues]);

  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    coverUrl ? 'loading' : 'error'
  );

  // Context menu state
  const [menuState, setMenuState] = useState<MenuState>({
    isOpen: false,
    position: null,
    triggerType: 'context',
    context: null,
  });

  const imgRef = useRef<HTMLImageElement>(null);

  // Build menu items based on hidden state
  const menuItems: MenuItem[] = useMemo(() => {
    const context: MenuContext = {
      entityType: 'series',
      entityId: series.id,
      selectedIds: [series.id],
      selectedCount: 1,
      entityData: {
        isHidden: series.isHidden,
      },
    };
    return buildMenuItems(MENU_PRESETS.seriesCard, context);
  }, [series.id, series.isHidden]);

  // Handle cached images that load before React attaches handlers
  useEffect(() => {
    if (!coverUrl) {
      setStatus('error');
      return;
    }

    const img = imgRef.current;
    if (img && img.complete) {
      if (img.naturalWidth > 0) {
        setStatus('loaded');
      } else {
        setStatus('error');
      }
    }
  }, [coverUrl]);

  const handleLoad = useCallback(() => {
    setStatus('loaded');
  }, []);

  const handleError = useCallback(() => {
    setStatus('error');
  }, []);

  // Calculate progress
  const progress = series.progress;
  const totalOwned = progress?.totalOwned ?? series._count?.issues ?? 0;
  const totalRead = progress?.totalRead ?? 0;
  const progressPercent = totalOwned > 0 ? Math.round((totalRead / totalOwned) * 100) : 0;
  const isComplete = totalOwned > 0 && totalRead >= totalOwned;

  // Handle click
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // If selectable and clicking anywhere on card (not checkbox), trigger selection
      if (selectable && onSelectionChange) {
        // Ctrl/Cmd click or Shift click triggers selection mode
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

  // Handle checkbox click (prevent propagation)
  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onClick?.(series.id);
      }
    },
    [series.id, onClick]
  );

  // Handle context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!contextMenuEnabled || !onMenuAction) return;

      e.preventDefault();
      e.stopPropagation();

      // Ensure series is selected when opening context menu
      if (!isSelected && onSelectionChange) {
        onSelectionChange(series.id, true);
      }

      setMenuState({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
        triggerType: 'context',
        context: {
          entityType: 'series',
          entityId: series.id,
          selectedIds: [series.id],
          selectedCount: 1,
          entityData: {
            isHidden: series.isHidden,
          },
        },
      });
    },
    [contextMenuEnabled, onMenuAction, series.id, series.isHidden, isSelected, onSelectionChange]
  );

  // Close menu
  const closeMenu = useCallback(() => {
    setMenuState({
      isOpen: false,
      position: null,
      triggerType: 'context',
      context: null,
    });
  }, []);

  // Handle menu action
  const handleMenuAction = useCallback(
    (actionId: string) => {
      closeMenu();
      // Map UnifiedMenu action IDs to legacy SeriesMenuItemPreset IDs
      const actionMap: Record<string, string> = {
        viewSeries: 'view',
        fetchSeriesMetadata: 'fetchMetadata',
        hideSeries: 'hide',
        unhideSeries: 'unhide',
      };
      const legacyAction = actionMap[actionId] || actionId;
      onMenuAction?.(legacyAction as SeriesMenuItemPreset, series.id);
    },
    [closeMenu, onMenuAction, series.id]
  );

  // Animation style
  const animationStyle = animationIndex !== undefined
    ? { '--animation-index': animationIndex } as React.CSSProperties
    : undefined;

  // Build class name with selection states
  const classNames = [
    'series-cover-card',
    `series-cover-card--${size}`,
    isSelected && 'series-cover-card--selected',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      tabIndex={tabIndex}
      role="button"
      aria-label={`${series.name}${series.startYear ? ` (${series.startYear})` : ''}`}
      style={animationStyle}
    >
      {/* Cover */}
      <div className="series-cover-card__cover">
        {/* Loading spinner */}
        {status === 'loading' && coverUrl && (
          <div className="series-cover-card__loading">
            <div className="series-cover-card__spinner" />
          </div>
        )}

        {/* Placeholder (no cover or error) */}
        {(status === 'error' || !coverUrl) && (
          <div className="series-cover-card__placeholder">
            <span className="series-cover-card__initial">
              {series.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Cover image */}
        {coverUrl && (
          <img
            ref={imgRef}
            src={coverUrl}
            alt={series.name}
            loading="lazy"
            decoding="async"
            onLoad={handleLoad}
            onError={handleError}
            className={`series-cover-card__image ${status === 'loaded' ? 'series-cover-card__image--loaded' : ''}`}
          />
        )}

        {/* Progress bar */}
        {totalOwned > 0 && !isComplete && (
          <div className="series-cover-card__progress">
            <div
              className="series-cover-card__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Completed indicator */}
        {isComplete && (
          <div className="series-cover-card__completed" title="Series complete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </div>
        )}

        {/* Issue count badge */}
        <div className="series-cover-card__count-badge">
          {totalRead}/{totalOwned}
        </div>

        {/* Selection checkbox */}
        {selectable && (
          <div className={`series-cover-card__checkbox ${isSelected ? 'series-cover-card__checkbox--checked' : ''}`}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleCheckboxChange}
              onClick={handleCheckboxClick}
              aria-label={`Select ${series.name}`}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="series-cover-card__info">
        <span className="series-cover-card__title" title={series.name}>
          {series.name}
        </span>
        <span className="series-cover-card__meta">
          {showYear && series.startYear && (
            <span className="series-cover-card__year">{series.startYear}</span>
          )}
          {showPublisher && series.publisher && (
            <span className="series-cover-card__publisher">{series.publisher}</span>
          )}
        </span>
      </div>

      {/* Context Menu - using UnifiedMenu component */}
      <UnifiedMenu
        state={menuState}
        items={menuItems}
        onAction={handleMenuAction}
        onClose={closeMenu}
        variant="context"
      />
    </div>
  );
}
