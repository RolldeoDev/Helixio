/**
 * UnifiedMenu Type Definitions
 *
 * Unified menu system that supports both context menus (right-click)
 * and action menus (overflow button).
 */

// =============================================================================
// Entity & Trigger Types
// =============================================================================

/**
 * Entity types that can have menus
 */
export type MenuEntityType = 'file' | 'series' | 'collection';

/**
 * Menu trigger types
 */
export type MenuTriggerType = 'context' | 'button';

// =============================================================================
// Action Identifiers
// =============================================================================

/**
 * All possible menu action identifiers
 */
export type MenuActionId =
  // File/Issue actions
  | 'read'
  | 'markRead'
  | 'markUnread'
  | 'addToCollection'
  | 'fetchMetadata'
  | 'editMetadata'
  | 'editPages'
  | 'rename'
  | 'rebuildCache'
  | 'quarantine'
  | 'restore'
  | 'delete'
  | 'download'
  // Series actions
  | 'viewSeries'
  | 'editSeries'
  | 'fetchSeriesMetadata'
  | 'fetchAllIssuesMetadata'
  | 'markAllRead'
  | 'markAllUnread'
  | 'downloadAll'
  | 'mergeWith'
  | 'linkSeries'
  | 'unlinkSeries'
  | 'manageRelationships'
  | 'changeTypeSpinoff'
  | 'changeTypePrequel'
  | 'changeTypeSequel'
  | 'changeTypeBonus'
  | 'changeTypeRelated'
  | 'hideSeries'
  | 'unhideSeries'
  | 'rebuildAllCache'
  // Collection actions
  | 'editCollection';

// =============================================================================
// Menu Context
// =============================================================================

/**
 * Entity-specific data for conditional menu item visibility
 */
export interface MenuEntityData {
  /** Whether the series is hidden */
  isHidden?: boolean;
  /** Whether the file/issue is marked as read/completed */
  isCompleted?: boolean;
  /** Whether the file is quarantined */
  isQuarantined?: boolean;
}

/**
 * Context passed to menu items and action handlers
 */
export interface MenuContext {
  /** Type of entity the menu is for */
  entityType: MenuEntityType;
  /** Primary entity ID (the one right-clicked or target of overflow menu) */
  entityId: string;
  /** All selected entity IDs (for bulk operations) */
  selectedIds: string[];
  /** Number of selected items */
  selectedCount: number;
  /** Entity-specific data for conditional logic */
  entityData?: MenuEntityData;
}

// =============================================================================
// Menu Items
// =============================================================================

/**
 * Unified menu item definition
 */
export interface MenuItem {
  /** Unique identifier for this action */
  id: MenuActionId | string;
  /** Display label */
  label: string;
  /** Optional icon */
  icon?: React.ReactNode;
  /** Whether this item is disabled */
  disabled?: boolean;
  /** Whether this is a dangerous/destructive action (red styling) */
  danger?: boolean;
  /** Show a divider before this item */
  dividerBefore?: boolean;
  /** Show a divider after this item */
  dividerAfter?: boolean;
  /** Show only when single item selected */
  singleOnly?: boolean;
  /** Show only when multiple items selected */
  multiOnly?: boolean;
  /** Dynamic visibility based on context */
  visible?: (context: MenuContext) => boolean;
}

/**
 * Menu item definition without id (used in MENU_ITEM_DEFINITIONS)
 */
export type MenuItemDefinition = Omit<MenuItem, 'id'>;

// =============================================================================
// Menu State
// =============================================================================

/**
 * Position for menu rendering
 */
export interface MenuPosition {
  x: number;
  y: number;
}

/**
 * Menu state for useUnifiedMenu hook
 */
export interface MenuState {
  /** Whether the menu is open */
  isOpen: boolean;
  /** Position for rendering (null when closed) */
  position: MenuPosition | null;
  /** How the menu was triggered */
  triggerType: MenuTriggerType;
  /** Context for the current menu */
  context: MenuContext | null;
}

// =============================================================================
// Component Props
// =============================================================================

/**
 * UnifiedMenu component props
 */
export interface UnifiedMenuProps {
  /** Menu state (position, context, etc.) */
  state: MenuState;
  /** Menu items to display */
  items: MenuItem[];
  /** Called when an action is selected */
  onAction: (actionId: string, context: MenuContext) => void;
  /** Called when menu should close */
  onClose: () => void;
  /** Optional trigger element ref for button positioning calculations */
  triggerRef?: React.RefObject<HTMLElement>;
  /** CSS class variant for styling */
  variant?: 'default' | 'action-menu';
  /** Size for action-menu variant */
  size?: 'small' | 'medium' | 'large';
}

// =============================================================================
// Backwards Compatibility
// =============================================================================

/**
 * Legacy menu item preset type (for CoverCard compatibility)
 * @deprecated Use MenuActionId instead
 */
export type MenuItemPreset =
  | 'read'
  | 'markRead'
  | 'markUnread'
  | 'addToCollection'
  | 'fetchMetadata'
  | 'editMetadata'
  | 'editPages'
  | 'rename'
  | 'rebuildCache'
  | 'quarantine'
  | 'restore'
  | 'delete';

/**
 * Legacy cover card menu item type (for CoverCard compatibility)
 * @deprecated Use MenuItem instead
 */
export interface CoverCardMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
  dividerAfter?: boolean;
  singleOnly?: boolean;
  multiOnly?: boolean;
}

/**
 * Legacy action menu item type (for ActionMenu compatibility)
 * @deprecated Use MenuItem instead
 */
export interface ActionMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
  dividerAfter?: boolean;
}

/**
 * Legacy series menu item preset type (for SeriesCoverCard compatibility)
 * @deprecated Use MenuActionId instead
 */
export type SeriesMenuItemPreset =
  | 'view'
  | 'fetchMetadata'
  | 'markAllRead'
  | 'markAllUnread'
  | 'mergeWith'
  | 'hide'
  | 'unhide';
