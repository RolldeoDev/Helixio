/**
 * Menu Definitions
 *
 * Centralized menu item definitions and presets for the unified menu system.
 * Consolidates items from CoverCard, SeriesCoverCard, ActionMenu, and detail pages.
 */

import type {
  MenuItem,
  MenuItemDefinition,
  MenuActionId,
  MenuContext,
  MenuItemPreset,
  CoverCardMenuItem,
} from './types';

// =============================================================================
// Menu Item Definitions
// =============================================================================

/**
 * Full menu item definitions with all metadata
 * This is the single source of truth for all menu items
 */
export const MENU_ITEM_DEFINITIONS: Record<MenuActionId, MenuItemDefinition> = {
  // -------------------------------------------------------------------------
  // File/Issue Actions
  // -------------------------------------------------------------------------
  read: {
    label: 'Read',
    singleOnly: true,
  },
  markRead: {
    label: 'Mark as Read',
  },
  markUnread: {
    label: 'Mark as Unread',
  },
  addToCollection: {
    label: 'Add to Collection...',
    dividerBefore: true,
  },
  fetchMetadata: {
    label: 'Fetch Metadata',
  },
  editMetadata: {
    label: 'Edit Metadata',
  },
  rename: {
    label: 'Rename',
    singleOnly: true,
  },
  rebuildCache: {
    label: 'Rebuild Cover & Page Cache',
    dividerBefore: true,
  },
  quarantine: {
    label: 'Move to Quarantine',
    visible: (ctx) => !ctx.entityData?.isQuarantined,
  },
  restore: {
    label: 'Restore from Quarantine',
    visible: (ctx) => ctx.entityData?.isQuarantined === true,
  },
  delete: {
    label: 'Delete Permanently',
    danger: true,
    dividerBefore: true,
  },
  download: {
    label: 'Download',
    dividerBefore: true,
  },

  // -------------------------------------------------------------------------
  // Series Actions
  // -------------------------------------------------------------------------
  viewSeries: {
    label: 'View Series',
  },
  editSeries: {
    label: 'Edit Series',
  },
  fetchSeriesMetadata: {
    label: 'Fetch Metadata (Series)',
    dividerBefore: true,
  },
  fetchAllIssuesMetadata: {
    label: 'Fetch Metadata (All Issues)',
  },
  markAllRead: {
    label: 'Mark All as Read',
    dividerBefore: true,
  },
  markAllUnread: {
    label: 'Mark All as Unread',
  },
  downloadAll: {
    label: 'Download All Issues',
    dividerBefore: true,
  },
  mergeWith: {
    label: 'Merge with...',
    dividerBefore: true,
  },
  hideSeries: {
    label: 'Hide Series',
    dividerBefore: true,
    visible: (ctx) => !ctx.entityData?.isHidden,
  },
  unhideSeries: {
    label: 'Unhide Series',
    dividerBefore: true,
    visible: (ctx) => ctx.entityData?.isHidden === true,
  },
  rebuildAllCache: {
    label: 'Rebuild All Covers',
    dividerBefore: true,
  },

  // -------------------------------------------------------------------------
  // Collection Actions
  // -------------------------------------------------------------------------
  editCollection: {
    label: 'Edit Collection',
  },
};

// =============================================================================
// Menu Presets
// =============================================================================

/**
 * Preset menu configurations for different contexts
 */
export const MENU_PRESETS = {
  /**
   * Default menu items for CoverCard in grid views (GridView, CollectionDetailPage)
   */
  fileGridDefault: [
    'read',
    'markRead',
    'markUnread',
    'addToCollection',
    'fetchMetadata',
    'editMetadata',
    'rename',
    'rebuildCache',
  ] as MenuActionId[],

  /**
   * Extended menu items for ListView (includes file management)
   */
  fileListExtended: [
    'read',
    'markRead',
    'markUnread',
    'addToCollection',
    'fetchMetadata',
    'editMetadata',
    'rename',
    'restore',
    'quarantine',
    'rebuildCache',
    'delete',
  ] as MenuActionId[],

  /**
   * Menu items for issues within a series (SeriesDetailPage issues grid)
   */
  seriesIssue: [
    'read',
    'markRead',
    'markUnread',
    'addToCollection',
    'fetchMetadata',
    'editMetadata',
    'rebuildCache',
  ] as MenuActionId[],

  /**
   * Menu items for series cards (SeriesCoverCard context menu)
   */
  seriesCard: [
    'viewSeries',
    'fetchSeriesMetadata',
    'markAllRead',
    'markAllUnread',
    'mergeWith',
    'hideSeries',
    'unhideSeries',
  ] as MenuActionId[],

  /**
   * Menu items for series detail page overflow button
   */
  seriesDetail: [
    'editSeries',
    'fetchSeriesMetadata',
    'fetchAllIssuesMetadata',
    'markAllRead',
    'markAllUnread',
    'downloadAll',
    'mergeWith',
    'rebuildAllCache',
  ] as MenuActionId[],

  /**
   * Menu items for issue detail page overflow button
   */
  issueDetail: [
    'editMetadata',
    'fetchMetadata',
    'markRead',
    'markUnread',
    'download',
  ] as MenuActionId[],

  /**
   * Menu items for bulk issue selection (SeriesDetailPage selection bar)
   */
  issueBulk: [
    'markRead',
    'markUnread',
    'fetchMetadata',
    'download',
    'rebuildCache',
  ] as MenuActionId[],

  /**
   * Menu items for collection detail page overflow button
   */
  collectionDetail: [
    'editCollection',
    'markAllRead',
    'markAllUnread',
  ] as MenuActionId[],
} as const;

export type MenuPresetKey = keyof typeof MENU_PRESETS;

// =============================================================================
// Builder Functions
// =============================================================================

/**
 * Actions that show count in label when multiple items selected
 */
const COUNTABLE_ACTIONS: MenuActionId[] = [
  'markRead',
  'markUnread',
  'fetchMetadata',
  'editMetadata',
  'rebuildCache',
  'quarantine',
  'delete',
  'download',
];

/**
 * Get a single menu item definition with dynamic label based on selection count
 */
export function getMenuItemWithCount(
  actionId: MenuActionId,
  selectedCount: number
): MenuItem {
  const definition = MENU_ITEM_DEFINITIONS[actionId];
  if (!definition) {
    return { id: actionId, label: actionId };
  }

  let label = definition.label;
  if (COUNTABLE_ACTIONS.includes(actionId) && selectedCount > 1) {
    label = `${label} (${selectedCount})`;
  }

  return { ...definition, id: actionId, label };
}

/**
 * Build menu items from a preset or action ID array with context
 */
export function buildMenuItems(
  preset: MenuActionId[] | MenuPresetKey,
  context: MenuContext,
  customItems?: MenuItem[]
): MenuItem[] {
  const actionIds = typeof preset === 'string' ? MENU_PRESETS[preset] : preset;

  const items: MenuItem[] = actionIds
    .map((id) => {
      const def = MENU_ITEM_DEFINITIONS[id];
      if (!def) return null;

      // Check visibility condition
      if (def.visible && !def.visible(context)) return null;

      // Check single/multi conditions
      if (def.singleOnly && context.selectedCount > 1) return null;
      if (def.multiOnly && context.selectedCount === 1) return null;

      // Build label with count if applicable
      let label = def.label;
      if (context.selectedCount > 1 && !def.singleOnly) {
        if (COUNTABLE_ACTIONS.includes(id)) {
          label = `${label} (${context.selectedCount})`;
        }
      }

      return { ...def, id, label } as MenuItem;
    })
    .filter((item): item is MenuItem => item !== null);

  // Merge custom items
  if (customItems?.length) {
    const customById = new Map(customItems.map((item) => [item.id, item]));

    const merged = items.map((item) => {
      const custom = customById.get(item.id);
      if (custom) {
        customById.delete(item.id);
        return { ...item, ...custom };
      }
      return item;
    });

    // Add remaining custom items at the end
    return [...merged, ...Array.from(customById.values())];
  }

  return items;
}

/**
 * Filter menu items based on selection count
 * For backwards compatibility with CoverCard
 */
export function filterMenuItems(
  presets: MenuItemPreset[],
  selectedCount: number
): CoverCardMenuItem[] {
  return presets
    .map((preset) => getMenuItemWithCount(preset, selectedCount))
    .filter((item) => {
      if (item.singleOnly && selectedCount > 1) return false;
      if (item.multiOnly && selectedCount === 1) return false;
      return true;
    });
}

/**
 * Merge preset items with custom items
 * For backwards compatibility with CoverCard
 */
export function mergeMenuItems(
  presets: MenuItemPreset[],
  customItems: CoverCardMenuItem[] = [],
  selectedCount: number
): CoverCardMenuItem[] {
  const presetItems = filterMenuItems(presets, selectedCount);

  // Merge custom items - they can override preset items by id
  const customById = new Map(customItems.map((item) => [item.id, item]));

  const merged = presetItems.map((item) => {
    const custom = customById.get(item.id);
    if (custom) {
      customById.delete(item.id);
      return { ...item, ...custom };
    }
    return item;
  });

  // Add remaining custom items at the end
  return [...merged, ...Array.from(customById.values())];
}

// =============================================================================
// Legacy Preset Arrays (for backwards compatibility)
// =============================================================================

/**
 * Default menu items for GridView-style cards
 * @deprecated Use MENU_PRESETS.fileGridDefault instead
 */
export const DEFAULT_MENU_ITEMS: MenuItemPreset[] = MENU_PRESETS.fileGridDefault as MenuItemPreset[];

/**
 * Extended menu items for ListView-style cards (includes file management)
 * @deprecated Use MENU_PRESETS.fileListExtended instead
 */
export const EXTENDED_MENU_ITEMS: MenuItemPreset[] = MENU_PRESETS.fileListExtended as MenuItemPreset[];

/**
 * Menu items for series issues view
 * @deprecated Use MENU_PRESETS.seriesIssue instead
 */
export const SERIES_ISSUE_MENU_ITEMS: MenuItemPreset[] = MENU_PRESETS.seriesIssue as MenuItemPreset[];
