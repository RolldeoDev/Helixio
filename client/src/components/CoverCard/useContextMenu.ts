/**
 * useContextMenu Hook
 *
 * Manages context menu state including positioning and click-outside handling.
 */

import { useState, useCallback, useEffect } from 'react';
import type { ContextMenuState, MenuPosition } from './types';

interface UseContextMenuReturn {
  /** Current menu state */
  menuState: ContextMenuState;
  /** Open the context menu at a position */
  openMenu: (position: MenuPosition, fileId: string) => void;
  /** Close the context menu */
  closeMenu: () => void;
  /** Handle right-click on a card */
  handleContextMenu: (
    e: React.MouseEvent,
    fileId: string,
    ensureSelected?: () => void
  ) => void;
}

export function useContextMenu(): UseContextMenuReturn {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    isOpen: false,
    position: null,
    fileId: null,
  });

  const openMenu = useCallback((position: MenuPosition, fileId: string) => {
    // Adjust position to keep menu within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = 200; // Approximate menu width
    const menuHeight = 300; // Approximate max menu height

    let { x, y } = position;

    // Prevent menu from going off right edge
    if (x + menuWidth > viewportWidth) {
      x = viewportWidth - menuWidth - 8;
    }

    // Prevent menu from going off bottom edge
    if (y + menuHeight > viewportHeight) {
      y = viewportHeight - menuHeight - 8;
    }

    // Ensure menu doesn't go off left or top edge
    x = Math.max(8, x);
    y = Math.max(8, y);

    setMenuState({
      isOpen: true,
      position: { x, y },
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

      // Ensure the item is selected before showing menu
      if (ensureSelected) {
        ensureSelected();
      }

      openMenu({ x: e.clientX, y: e.clientY }, fileId);
    },
    [openMenu]
  );

  // Close menu on click outside
  useEffect(() => {
    if (!menuState.isOpen) return;

    const handleClickOutside = () => {
      // Close menu on any click (the menu will handle its own clicks)
      closeMenu();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };

    // Use setTimeout to avoid closing immediately on the same click that opened it
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
