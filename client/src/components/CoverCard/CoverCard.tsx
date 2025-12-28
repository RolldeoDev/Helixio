/**
 * CoverCard Component
 *
 * Unified cover card for displaying comic files/issues with configurable
 * selection, context menu, and display options. Supports theming.
 */

import { useCallback, useMemo } from 'react';
import { CoverImage } from './CoverImage';
import { UnifiedMenu, useContextMenu, mergeMenuItems } from '../UnifiedMenu';
import { DEFAULT_MENU_ITEMS } from '../UnifiedMenu/menuDefinitions';
import { useApp } from '../../contexts/AppContext';
import { getTitleDisplay } from '../../utils/titleDisplay';
import type {
  CoverCardProps,
  CoverCardSize,
  CoverCardVariant,
} from './types';
import type { MenuState, MenuItem } from '../UnifiedMenu/types';
import './CoverCard.css';

/**
 * Get CSS class modifiers for size and variant
 */
function getModifierClasses(
  size: CoverCardSize,
  variant: CoverCardVariant,
  isSelected: boolean
): string {
  const classes: string[] = [];

  classes.push(`cover-card--${size}`);
  classes.push(`cover-card--${variant}`);

  if (isSelected) {
    classes.push('cover-card--selected');
  }

  return classes.join(' ');
}

export function CoverCard({
  file,
  progress,
  size = 'medium',
  variant = 'grid',
  badge,
  showInfo = true,
  showSeries = true,
  showSeriesAsSubtitle = false,
  showIssueNumber = true,
  selectable = false,
  isSelected = false,
  contextMenuEnabled = false,
  menuItems = DEFAULT_MENU_ITEMS,
  customMenuItems,
  selectedCount = 1,
  onClick,
  onDoubleClick,
  onRead,
  onSelectionChange,
  onMenuAction,
  onKeyDown,
  tabIndex = 0,
  ariaLabel,
  className = '',
  animationIndex,
  eager = false,
}: CoverCardProps) {
  const { menuState, handleContextMenu, closeMenu } = useContextMenu();
  const { preferFilenameOverMetadata } = useApp();

  // Compute display title using metadata with fallbacks
  const { primaryTitle, subtitle, tooltipTitle } = getTitleDisplay(file, {
    preferFilename: preferFilenameOverMetadata,
  });

  // Legacy displayName for backwards compatibility in aria-labels
  const displayName = primaryTitle;

  // Handle click
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick?.(file.id, e);
    },
    [file.id, onClick]
  );

  // Handle double click
  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.(file.id);
  }, [file.id, onDoubleClick]);

  // Handle read button click
  const handleReadClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRead?.(file.id);
    },
    [file.id, onRead]
  );

  // Handle checkbox change
  const handleCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onSelectionChange?.(file.id, e.target.checked);
    },
    [file.id, onSelectionChange]
  );

  // Handle checkbox click (prevent propagation)
  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Handle context menu
  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      if (!contextMenuEnabled) return;

      handleContextMenu(e, file.id, () => {
        // Ensure file is selected when opening context menu
        if (!isSelected && onSelectionChange) {
          onSelectionChange(file.id, true);
        }
      });
    },
    [contextMenuEnabled, file.id, handleContextMenu, isSelected, onSelectionChange]
  );

  // Handle menu action
  const handleMenuAction = useCallback(
    (action: string) => {
      onMenuAction?.(action, file.id);
      closeMenu();
    },
    [file.id, onMenuAction, closeMenu]
  );

  // Handle keyboard navigation
  const handleKeyDownInternal = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onDoubleClick?.(file.id);
      } else if (e.key === ' ' && selectable) {
        e.preventDefault();
        onSelectionChange?.(file.id, !isSelected);
      }
      onKeyDown?.(file.id, e);
    },
    [file.id, onDoubleClick, selectable, onSelectionChange, isSelected, onKeyDown]
  );

  // Build class name
  const modifiers = getModifierClasses(size, variant, isSelected);
  const fullClassName = `cover-card ${modifiers} ${className}`.trim();

  // Animation style for staggered entrance
  const animationStyle = animationIndex !== undefined
    ? { '--animation-index': animationIndex } as React.CSSProperties
    : undefined;

  // ARIA label
  const computedAriaLabel = ariaLabel || `${displayName}${progress?.completed ? ', completed' : ''}`;

  return (
    <>
      <div
        className={fullClassName}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleRightClick}
        onKeyDown={handleKeyDownInternal}
        tabIndex={tabIndex}
        role="button"
        aria-selected={isSelected}
        aria-label={computedAriaLabel}
        data-file-id={file.id}
        style={animationStyle}
      >
        {/* Badge */}
        {badge && (
          <div
            className={`cover-card__badge cover-card__badge--${badge.type || 'primary'} cover-card__badge--${badge.position || 'top-right'}`}
          >
            {badge.text}
          </div>
        )}

        {/* Cover image container */}
        <div className="cover-card__cover">
          <CoverImage
            fileId={file.id}
            filename={file.filename}
            progress={progress}
            eager={eager}
            coverVersion={'coverHash' in file ? file.coverHash : undefined}
          />

          {/* Issue number badge */}
          {showIssueNumber && file.metadata?.number && (
            <div
              className="cover-card__issue-badge"
              aria-label={`Issue ${file.metadata.number}${progress?.completed ? ', completed' : ''}`}
            >
              <span className="cover-card__issue-badge-hash">#</span>
              <span className="cover-card__issue-badge-number">{file.metadata.number}</span>
            </div>
          )}

          {/* Selection checkbox */}
          {selectable && (
            <div className={`cover-card__checkbox ${isSelected ? 'cover-card__checkbox--checked' : ''}`}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={handleCheckboxChange}
                onClick={handleCheckboxClick}
                aria-label={`Select ${displayName}`}
              />
            </div>
          )}

          {/* Read button overlay */}
          {onRead && (
            <div className="cover-card__read-overlay">
              <button
                className="cover-card__read-button"
                onClick={handleReadClick}
                aria-label={`Read ${displayName}`}
              >
                <svg
                  className="cover-card__read-icon"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 14H7v-2h8v2zm2-4H7v-2h10v2zm0-4H7V7h10v2z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Info section */}
        {showInfo && (
          <div className="cover-card__info">
            <span className="cover-card__title" title={tooltipTitle}>
              {primaryTitle}
            </span>
            {/* showSeriesAsSubtitle takes precedence over showSeries */}
            {showSeriesAsSubtitle && subtitle && (
              <span className="cover-card__series">
                {subtitle}
              </span>
            )}
            {/* Fallback to legacy showSeries behavior if not using subtitle mode */}
            {!showSeriesAsSubtitle && showSeries && file.metadata?.series && (
              <span className="cover-card__series">
                {file.metadata.series}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Context Menu (rendered via UnifiedMenu) */}
      {contextMenuEnabled && (
        <UnifiedMenuWrapper
          menuState={menuState}
          menuItems={menuItems}
          customMenuItems={customMenuItems}
          selectedCount={selectedCount}
          fileId={file.id}
          onAction={handleMenuAction}
          onClose={closeMenu}
        />
      )}
    </>
  );
}

// =============================================================================
// UnifiedMenu Wrapper for Legacy ContextMenu API
// =============================================================================

interface UnifiedMenuWrapperProps {
  menuState: { isOpen: boolean; position: { x: number; y: number } | null; fileId: string | null };
  menuItems: import('./types').MenuItemPreset[];
  customMenuItems?: import('./types').CoverCardMenuItem[];
  selectedCount: number;
  fileId: string;
  onAction: (action: string) => void;
  onClose: () => void;
}

function UnifiedMenuWrapper({
  menuState,
  menuItems: presetItems,
  customMenuItems,
  selectedCount,
  fileId,
  onAction,
  onClose,
}: UnifiedMenuWrapperProps) {
  // Build menu items from presets
  const items: MenuItem[] = useMemo(() => {
    return mergeMenuItems(presetItems, customMenuItems, selectedCount);
  }, [presetItems, customMenuItems, selectedCount]);

  // Convert legacy menu state to UnifiedMenu state
  const unifiedState: MenuState = useMemo(
    () => ({
      isOpen: menuState.isOpen,
      position: menuState.position,
      triggerType: 'context' as const,
      context: {
        entityType: 'file' as const,
        entityId: fileId,
        selectedIds: selectedCount > 1 ? [] : [fileId], // Selection handled externally
        selectedCount,
      },
    }),
    [menuState.isOpen, menuState.position, fileId, selectedCount]
  );

  // Handle action - just pass through the action ID
  const handleAction = useCallback(
    (actionId: string) => {
      onAction(actionId);
    },
    [onAction]
  );

  if (!unifiedState.isOpen || !unifiedState.position) {
    return null;
  }

  return (
    <UnifiedMenu
      state={unifiedState}
      items={items}
      onAction={handleAction}
      onClose={onClose}
      variant="context"
    />
  );
}
