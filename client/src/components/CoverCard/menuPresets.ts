/**
 * Menu Presets
 *
 * Predefined context menu item configurations for CoverCard.
 */

import type { MenuItemPreset, CoverCardMenuItem } from './types';

/**
 * Full menu item definitions for all presets
 */
export const MENU_ITEM_DEFINITIONS: Record<MenuItemPreset, CoverCardMenuItem> = {
  read: {
    id: 'read',
    label: 'Read',
    singleOnly: true,
  },
  markRead: {
    id: 'markRead',
    label: 'Mark as Read',
  },
  markUnread: {
    id: 'markUnread',
    label: 'Mark as Unread',
    dividerAfter: true,
  },
  addToCollection: {
    id: 'addToCollection',
    label: 'Add to Collection...',
  },
  fetchMetadata: {
    id: 'fetchMetadata',
    label: 'Fetch Metadata',
  },
  editMetadata: {
    id: 'editMetadata',
    label: 'Edit Metadata',
  },
  editPages: {
    id: 'editPages',
    label: 'Edit Pages',
    singleOnly: true,
    dividerAfter: true,
  },
  rename: {
    id: 'rename',
    label: 'Rename',
    singleOnly: true,
  },
  rebuildCache: {
    id: 'rebuildCache',
    label: 'Rebuild Cover & Page Cache',
    dividerBefore: true,
  },
  restore: {
    id: 'restore',
    label: 'Restore from Quarantine',
  },
  quarantine: {
    id: 'quarantine',
    label: 'Move to Quarantine',
  },
  delete: {
    id: 'delete',
    label: 'Delete Permanently',
    danger: true,
    dividerBefore: true,
  },
};

/**
 * Default menu items for GridView-style cards
 */
export const DEFAULT_MENU_ITEMS: MenuItemPreset[] = [
  'read',
  'markRead',
  'markUnread',
  'addToCollection',
  'fetchMetadata',
  'editMetadata',
  'rename',
  'rebuildCache',
];

/**
 * Extended menu items for ListView-style cards (includes file management)
 */
export const EXTENDED_MENU_ITEMS: MenuItemPreset[] = [
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
];

/**
 * Menu items for series issues view
 */
export const SERIES_ISSUE_MENU_ITEMS: MenuItemPreset[] = [
  'read',
  'markRead',
  'markUnread',
  'addToCollection',
  'fetchMetadata',
  'editMetadata',
  'rebuildCache',
];

/**
 * Get menu item definition with dynamic label based on selection count
 */
export function getMenuItemWithCount(
  preset: MenuItemPreset,
  selectedCount: number
): CoverCardMenuItem {
  const definition = MENU_ITEM_DEFINITIONS[preset];

  // Items that show count in label when multiple selected
  const countableItems: MenuItemPreset[] = ['markRead', 'markUnread', 'fetchMetadata', 'editMetadata', 'rebuildCache', 'quarantine', 'delete'];

  if (countableItems.includes(preset) && selectedCount > 1) {
    return {
      ...definition,
      label: `${definition.label} (${selectedCount})`,
    };
  }

  return definition;
}

/**
 * Filter menu items based on selection count
 */
export function filterMenuItems(
  presets: MenuItemPreset[],
  selectedCount: number
): CoverCardMenuItem[] {
  return presets
    .map((preset) => getMenuItemWithCount(preset, selectedCount))
    .filter((item) => {
      // Filter out single-only items when multiple selected
      if (item.singleOnly && selectedCount > 1) {
        return false;
      }
      // Filter out multi-only items when single selected
      if (item.multiOnly && selectedCount === 1) {
        return false;
      }
      return true;
    });
}

/**
 * Merge preset items with custom items
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
