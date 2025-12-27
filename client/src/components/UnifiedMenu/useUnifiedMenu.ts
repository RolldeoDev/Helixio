/**
 * useUnifiedMenu Hook
 *
 * Manages unified menu state for both context menus (right-click)
 * and button menus (overflow click). Replaces useContextMenu with
 * extended functionality.
 */

import { useState, useCallback, useEffect } from 'react';
import type {
  MenuState,
  MenuContext,
  MenuPosition,
  MenuEntityType,
  MenuEntityData,
} from './types';

// =============================================================================
// Types
// =============================================================================

interface UseUnifiedMenuOptions {
  /** Type of entity this menu is for */
  entityType: MenuEntityType;
  /** Function to get entity-specific data for conditional menu items */
  getEntityData?: (entityId: string) => MenuEntityData | undefined;
}

interface UseUnifiedMenuReturn {
  /** Current menu state */
  menuState: MenuState;
  /** Open as context menu at cursor position */
  openContextMenu: (
    e: React.MouseEvent,
    entityId: string,
    selectedIds: string[]
  ) => void;
  /** Open as button menu below trigger element */
  openButtonMenu: (
    triggerRect: DOMRect,
    entityId: string,
    selectedIds: string[]
  ) => void;
  /** Close the menu */
  closeMenu: () => void;
  /** Handle right-click with auto-selection callback */
  handleContextMenu: (
    e: React.MouseEvent,
    entityId: string,
    selectedIds: string[] | Set<string>,
    ensureSelected?: () => void
  ) => void;
  /** Handle button click to open menu */
  handleButtonClick: (
    e: React.MouseEvent,
    entityId: string,
    selectedIds: string[] | Set<string>
  ) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useUnifiedMenu({
  entityType,
  getEntityData,
}: UseUnifiedMenuOptions): UseUnifiedMenuReturn {
  const [menuState, setMenuState] = useState<MenuState>({
    isOpen: false,
    position: null,
    triggerType: 'context',
    context: null,
  });

  /**
   * Create menu context from entity info
   */
  const createContext = useCallback(
    (entityId: string, selectedIds: string[]): MenuContext => {
      return {
        entityType,
        entityId,
        selectedIds,
        selectedCount: selectedIds.length || 1,
        entityData: getEntityData?.(entityId),
      };
    },
    [entityType, getEntityData]
  );

  /**
   * Open menu at cursor position (context menu)
   */
  const openContextMenu = useCallback(
    (e: React.MouseEvent, entityId: string, selectedIds: string[]) => {
      e.preventDefault();
      e.stopPropagation();

      setMenuState({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
        triggerType: 'context',
        context: createContext(entityId, selectedIds),
      });
    },
    [createContext]
  );

  /**
   * Open menu below trigger element (button menu)
   */
  const openButtonMenu = useCallback(
    (triggerRect: DOMRect, entityId: string, selectedIds: string[]) => {
      // Position below the trigger, right-aligned
      const menuWidth = 200; // Approximate width
      let x = triggerRect.right - menuWidth;
      const y = triggerRect.bottom + 4;

      // Keep menu on screen
      if (x < 8) {
        x = triggerRect.left;
      }

      setMenuState({
        isOpen: true,
        position: { x, y },
        triggerType: 'button',
        context: createContext(entityId, selectedIds),
      });
    },
    [createContext]
  );

  /**
   * Close the menu
   */
  const closeMenu = useCallback(() => {
    setMenuState({
      isOpen: false,
      position: null,
      triggerType: 'context',
      context: null,
    });
  }, []);

  /**
   * Handle right-click event with optional auto-selection
   */
  const handleContextMenu = useCallback(
    (
      e: React.MouseEvent,
      entityId: string,
      selectedIds: string[] | Set<string>,
      ensureSelected?: () => void
    ) => {
      e.preventDefault();
      e.stopPropagation();

      // Ensure the item is selected before showing menu
      if (ensureSelected) {
        ensureSelected();
      }

      const ids = Array.isArray(selectedIds)
        ? selectedIds
        : Array.from(selectedIds);

      // If entity is not in selection, treat as single-item operation
      const effectiveIds = ids.includes(entityId) ? ids : [entityId];

      setMenuState({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
        triggerType: 'context',
        context: createContext(entityId, effectiveIds),
      });
    },
    [createContext]
  );

  /**
   * Handle button click to open menu
   */
  const handleButtonClick = useCallback(
    (
      e: React.MouseEvent,
      entityId: string,
      selectedIds: string[] | Set<string>
    ) => {
      e.stopPropagation();

      const button = e.currentTarget;
      const rect = button.getBoundingClientRect();

      const ids = Array.isArray(selectedIds)
        ? selectedIds
        : Array.from(selectedIds);

      const effectiveIds = ids.length > 0 ? ids : [entityId];

      // Toggle menu
      if (menuState.isOpen) {
        closeMenu();
      } else {
        openButtonMenu(rect, entityId, effectiveIds);
      }
    },
    [menuState.isOpen, closeMenu, openButtonMenu]
  );

  // Close menu on click outside
  useEffect(() => {
    if (!menuState.isOpen) return;

    const handleClickOutside = () => {
      closeMenu();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };

    // Use setTimeout to avoid closing immediately on the same click
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuState.isOpen, closeMenu]);

  return {
    menuState,
    openContextMenu,
    openButtonMenu,
    closeMenu,
    handleContextMenu,
    handleButtonClick,
  };
}

// =============================================================================
// Backwards Compatibility
// =============================================================================

/**
 * Legacy context menu state type
 * @deprecated Use MenuState from './types' instead
 */
export interface ContextMenuState {
  isOpen: boolean;
  position: MenuPosition | null;
  fileId: string | null;
}

/**
 * Legacy useContextMenu hook signature
 * @deprecated Use useUnifiedMenu instead
 */
export interface UseContextMenuReturn {
  menuState: ContextMenuState;
  openMenu: (position: MenuPosition, fileId: string) => void;
  closeMenu: () => void;
  handleContextMenu: (
    e: React.MouseEvent,
    fileId: string,
    ensureSelected?: () => void
  ) => void;
}

/**
 * Legacy useContextMenu hook
 * @deprecated Use useUnifiedMenu instead
 */
export function useContextMenu(): UseContextMenuReturn {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    isOpen: false,
    position: null,
    fileId: null,
  });

  const openMenu = useCallback((position: MenuPosition, fileId: string) => {
    setMenuState({
      isOpen: true,
      position,
      fileId,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState({
      isOpen: false,
      position: null,
      fileId: null,
    });
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, fileId: string, ensureSelected?: () => void) => {
      e.preventDefault();
      e.stopPropagation();

      if (ensureSelected) {
        ensureSelected();
      }

      openMenu({ x: e.clientX, y: e.clientY }, fileId);
    },
    [openMenu]
  );

  useEffect(() => {
    if (!menuState.isOpen) return;

    const handleClickOutside = () => {
      closeMenu();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuState.isOpen, closeMenu]);

  return {
    menuState,
    openMenu,
    closeMenu,
    handleContextMenu,
  };
}
