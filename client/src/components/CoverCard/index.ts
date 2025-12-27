/**
 * CoverCard Component Exports
 *
 * Now uses UnifiedMenu internally. Legacy exports maintained for backwards compatibility.
 */

// Main components
export { CoverCard } from './CoverCard';
export { CoverImage } from './CoverImage';
export { useCoverImage } from './useCoverImage';

// Context menu components - ContextMenu is a backwards-compatible wrapper
export { ContextMenu } from './ContextMenu';
export { useContextMenu } from '../UnifiedMenu';
export {
  MENU_ITEM_DEFINITIONS,
  DEFAULT_MENU_ITEMS,
  EXTENDED_MENU_ITEMS,
  SERIES_ISSUE_MENU_ITEMS,
  getMenuItemWithCount,
  filterMenuItems,
  mergeMenuItems,
} from '../UnifiedMenu/menuDefinitions';

// Types - export from local types.ts
export type {
  CoverCardProps,
  CoverCardFile,
  CoverCardSize,
  CoverCardVariant,
  CoverCardBadge,
  BadgeType,
  BadgePosition,
  ReadingProgressData,
  MenuItemPreset,
  CoverCardMenuItem,
  CoverImageProps,
  CoverImageStatus,
  ContextMenuProps,
  ContextMenuState,
  MenuPosition,
} from './types';
