/**
 * ContextMenu Component
 *
 * Backwards-compatible wrapper around UnifiedMenu for right-click context menus.
 * Uses React Portal to render at document body for correct fixed positioning.
 */

import { useMemo, useCallback } from 'react';
import { UnifiedMenu, mergeMenuItems } from '../UnifiedMenu';
import type { MenuState, MenuItem } from '../UnifiedMenu/types';
import type { MenuItemPreset, CoverCardMenuItem, MenuPosition } from './types';

interface ContextMenuProps {
  position: MenuPosition;
  items: MenuItemPreset[];
  customItems?: CoverCardMenuItem[];
  selectedCount: number;
  onAction: (action: string) => void;
  onClose: () => void;
}

export function ContextMenu({
  position,
  items,
  customItems,
  selectedCount,
  onAction,
  onClose,
}: ContextMenuProps) {
  // Build menu items from presets
  const menuItems: MenuItem[] = useMemo(() => {
    return mergeMenuItems(items, customItems, selectedCount);
  }, [items, customItems, selectedCount]);

  // Create menu state compatible with UnifiedMenu
  const menuState: MenuState = useMemo(
    () => ({
      isOpen: true,
      position,
      triggerType: 'context' as const,
      context: {
        entityType: 'file' as const,
        entityId: '',
        selectedIds: [],
        selectedCount,
      },
    }),
    [position, selectedCount]
  );

  // Handle action - pass through just the action ID
  const handleAction = useCallback(
    (actionId: string) => {
      onAction(actionId);
    },
    [onAction]
  );

  return (
    <UnifiedMenu
      state={menuState}
      items={menuItems}
      onAction={handleAction}
      onClose={onClose}
      variant="context"
    />
  );
}
