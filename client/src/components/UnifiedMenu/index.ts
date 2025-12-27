/**
 * UnifiedMenu Component Exports
 *
 * Unified menu system for both context menus and action menus.
 */

// Main component
export { UnifiedMenu } from './UnifiedMenu';

// Hooks
export { useUnifiedMenu, useContextMenu } from './useUnifiedMenu';
export type { UseContextMenuReturn, ContextMenuState } from './useUnifiedMenu';

// Types
export type {
  MenuEntityType,
  MenuTriggerType,
  MenuActionId,
  MenuItem,
  MenuItemDefinition,
  MenuContext,
  MenuEntityData,
  MenuPosition,
  MenuState,
  UnifiedMenuProps,
  // Backwards compatibility types
  MenuItemPreset,
  CoverCardMenuItem,
  ActionMenuItem,
  SeriesMenuItemPreset,
} from './types';

// Menu definitions
export {
  MENU_ITEM_DEFINITIONS,
  MENU_PRESETS,
  buildMenuItems,
  getMenuItemWithCount,
  filterMenuItems,
  mergeMenuItems,
  // Legacy preset arrays
  DEFAULT_MENU_ITEMS,
  EXTENDED_MENU_ITEMS,
  SERIES_ISSUE_MENU_ITEMS,
} from './menuDefinitions';
export type { MenuPresetKey } from './menuDefinitions';
