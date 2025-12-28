/**
 * SeriesCoverCard Component
 *
 * Cover card for displaying series with progress indicators and count badges.
 * Supports theming via CSS custom properties.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getCoverUrl, getApiCoverUrl, type Series } from '../../services/api.service';
import { UnifiedMenu, buildMenuItems, MENU_PRESETS, MENU_ITEM_DEFINITIONS } from '../UnifiedMenu';
import type { MenuState, MenuContext, MenuItem } from '../UnifiedMenu/types';
import { ProgressRing } from '../Progress';
import { RelationshipTypeBadge } from '../RelationshipTypeBadge';
import type { RelationshipType } from '../../services/api/series';
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

  /** Relationship type for this series (when shown as a related series) */
  relationshipType?: RelationshipType;

  /** Show relationship type badge on the card */
  showRelationshipBadge?: boolean;

  /** Whether this series is a parent of the viewing series (for contextual badge labels) */
  isParentRelationship?: boolean;

  /** Show remove button on hover */
  showRemoveButton?: boolean;

  /** Handler for remove button click */
  onRemove?: () => void;

  /** Show relationship context menu (unlink, change type) instead of standard series menu */
  showRelationshipContextMenu?: boolean;

  /** Handler for unlink action (when showRelationshipContextMenu is true) */
  onUnlink?: () => void;

  /** Handler for change type action (when showRelationshipContextMenu is true) */
  onChangeType?: (newType: RelationshipType) => void;
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
  relationshipType,
  showRelationshipBadge = false,
  isParentRelationship = false,
  showRemoveButton = false,
  onRemove,
  showRelationshipContextMenu = false,
  onUnlink,
  onChangeType,
}: SeriesCoverCardProps) {
  // Memoize the cover URL to prevent recalculation
  const coverUrl = useMemo(() => {
    // Respect the coverSource setting:
    // - 'api': Use API cover (coverHash) if available
    // - 'user': Use coverFileId if available
    // - 'auto': Use automatic fallback (API > User > First Issue)
    // Support both issues array (full Series) and firstIssueId (RelatedSeriesInfo)
    const firstIssueId = series.issues?.[0]?.id || (series as { firstIssueId?: string }).firstIssueId;

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
  }, [series.coverSource, series.coverFileId, series.coverHash, series.issues, (series as { firstIssueId?: string }).firstIssueId]);

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

  // Long-press handling for touch devices
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_DURATION = 500; // ms
  const TOUCH_MOVE_THRESHOLD = 10; // px - cancel long-press if finger moves more than this

  // Build menu items based on hidden state or relationship context
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

    // When showing relationship context menu, build custom menu with unlink and change type options
    if (showRelationshipContextMenu && relationshipType) {
      const items: MenuItem[] = [
        // View series option
        { id: 'viewSeries', ...MENU_ITEM_DEFINITIONS.viewSeries },
        // Unlink option
        { id: 'unlinkSeries', ...MENU_ITEM_DEFINITIONS.unlinkSeries },
        // Change type submenu options
        { id: 'changeTypeSpinoff', ...MENU_ITEM_DEFINITIONS.changeTypeSpinoff },
        { id: 'changeTypePrequel', ...MENU_ITEM_DEFINITIONS.changeTypePrequel },
        { id: 'changeTypeSequel', ...MENU_ITEM_DEFINITIONS.changeTypeSequel },
        { id: 'changeTypeBonus', ...MENU_ITEM_DEFINITIONS.changeTypeBonus },
        { id: 'changeTypeRelated', ...MENU_ITEM_DEFINITIONS.changeTypeRelated },
      ];

      // Disable the current type option
      const typeMap: Record<RelationshipType, string> = {
        spinoff: 'changeTypeSpinoff',
        prequel: 'changeTypePrequel',
        sequel: 'changeTypeSequel',
        bonus: 'changeTypeBonus',
        related: 'changeTypeRelated',
      };
      const currentTypeId = typeMap[relationshipType];
      return items.map((item) =>
        item.id === currentTypeId ? { ...item, disabled: true } : item
      );
    }

    return buildMenuItems(MENU_PRESETS.seriesCard, context);
  }, [series.id, series.isHidden, showRelationshipContextMenu, relationshipType]);

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

  // Handle remove button click
  const handleRemoveClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onRemove?.();
    },
    [onRemove]
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

  // Open context menu at position (shared logic for right-click and long-press)
  const openContextMenuAt = useCallback(
    (x: number, y: number) => {
      if (!contextMenuEnabled || !onMenuAction) return;

      // Ensure series is selected when opening context menu
      if (!isSelected && onSelectionChange) {
        onSelectionChange(series.id, true);
      }

      setMenuState({
        isOpen: true,
        position: { x, y },
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

  // Cancel any pending long-press
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  }, []);

  // Handle touch start - begin long-press timer
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!contextMenuEnabled || !onMenuAction) return;

      const touch = e.touches[0];
      if (!touch) return;

      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

      longPressTimerRef.current = setTimeout(() => {
        const pos = touchStartPosRef.current;
        if (pos) {
          // Trigger haptic feedback if available
          if (navigator.vibrate) {
            navigator.vibrate(50);
          }
          openContextMenuAt(pos.x, pos.y);
        }
        cancelLongPress();
      }, LONG_PRESS_DURATION);
    },
    [contextMenuEnabled, onMenuAction, openContextMenuAt, cancelLongPress, LONG_PRESS_DURATION]
  );

  // Handle touch move - cancel if finger moved too far
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartPosRef.current) return;

      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);

      if (deltaX > TOUCH_MOVE_THRESHOLD || deltaY > TOUCH_MOVE_THRESHOLD) {
        cancelLongPress();
      }
    },
    [cancelLongPress, TOUCH_MOVE_THRESHOLD]
  );

  // Handle touch end - cancel long-press timer
  const handleTouchEnd = useCallback(() => {
    cancelLongPress();
  }, [cancelLongPress]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

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

      // Handle relationship-specific actions
      if (actionId === 'unlinkSeries') {
        onUnlink?.();
        return;
      }

      if (actionId.startsWith('changeType')) {
        const typeMap: Record<string, RelationshipType> = {
          changeTypeSpinoff: 'spinoff',
          changeTypePrequel: 'prequel',
          changeTypeSequel: 'sequel',
          changeTypeBonus: 'bonus',
          changeTypeRelated: 'related',
        };
        const newType = typeMap[actionId];
        if (newType) {
          onChangeType?.(newType);
          return;
        }
      }

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
    [closeMenu, onMenuAction, series.id, onUnlink, onChangeType]
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
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

        {/* Progress ring - shows percentage when in progress, 100% when completed */}
        {totalOwned > 0 && (progressPercent > 0 || isComplete) && (
          <ProgressRing
            progress={isComplete ? 100 : progressPercent}
            size="md"
            showLabel
            className="series-cover-card__progress-ring"
          />
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

        {/* Relationship type badge */}
        {showRelationshipBadge && relationshipType && (
          <RelationshipTypeBadge
            type={relationshipType}
            size="small"
            className="series-cover-card__relationship-badge"
            isParent={isParentRelationship}
          />
        )}

        {/* Remove button */}
        {showRemoveButton && onRemove && (
          <button
            className="series-cover-card__remove-btn"
            onClick={handleRemoveClick}
            aria-label="Remove relationship"
            title="Remove relationship"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
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
