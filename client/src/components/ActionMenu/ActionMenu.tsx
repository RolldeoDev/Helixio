/**
 * ActionMenu Component
 *
 * A "..." button that opens a dropdown menu with actions.
 * Now a thin wrapper around UnifiedMenu for consistency.
 *
 * Maintains the same API for backwards compatibility.
 */

import { useState, useRef, useCallback } from 'react';
import { UnifiedMenu } from '../UnifiedMenu';
import type { MenuItem, MenuState, MenuContext } from '../UnifiedMenu/types';
import '../UnifiedMenu/UnifiedMenu.css';

// =============================================================================
// Types
// =============================================================================

export interface ActionMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
  dividerAfter?: boolean;
}

export interface ActionMenuProps {
  /** Menu items to display */
  items: ActionMenuItem[];
  /** Called when an action is selected */
  onAction: (actionId: string) => void;
  /** Optional label for accessibility */
  ariaLabel?: string;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Custom class name */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function ActionMenu({
  items,
  onAction,
  ariaLabel = 'Actions',
  size = 'medium',
  className = '',
  disabled = false,
}: ActionMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Menu state
  const [menuState, setMenuState] = useState<MenuState>({
    isOpen: false,
    position: null,
    triggerType: 'button',
    context: null,
  });

  // Open the menu
  const openMenu = useCallback(() => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 200; // Approximate menu width
    const menuHeight = items.length * 36 + 8; // Approximate height

    // Position below button, aligned to right edge
    let x = rect.right - menuWidth;
    let y = rect.bottom + 4;

    // Viewport boundary checks
    if (x < 8) {
      x = rect.left;
    }
    if (y + menuHeight > window.innerHeight - 8) {
      y = rect.top - menuHeight - 4;
    }

    // Create a minimal context for the menu
    const context: MenuContext = {
      entityType: 'file',
      entityId: '',
      selectedIds: [],
      selectedCount: 0,
    };

    setMenuState({
      isOpen: true,
      position: { x, y },
      triggerType: 'button',
      context,
    });
  }, [items.length]);

  // Close the menu
  const closeMenu = useCallback(() => {
    setMenuState({
      isOpen: false,
      position: null,
      triggerType: 'button',
      context: null,
    });
  }, []);

  // Handle button click
  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuState.isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  // Handle button keyboard
  const handleButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (menuState.isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    } else if (e.key === 'Escape' && menuState.isOpen) {
      closeMenu();
    }
  };

  // Handle menu action - pass through to parent
  const handleAction = useCallback(
    (actionId: string) => {
      onAction(actionId);
      closeMenu();
    },
    [onAction, closeMenu]
  );

  // Convert ActionMenuItem[] to MenuItem[]
  const menuItems: MenuItem[] = items.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    disabled: item.disabled,
    danger: item.danger,
    dividerBefore: item.dividerBefore,
    dividerAfter: item.dividerAfter,
  }));

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`action-menu-trigger action-menu-trigger--${size} ${className}`}
        onClick={handleButtonClick}
        onKeyDown={handleButtonKeyDown}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={menuState.isOpen}
        disabled={disabled}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      <UnifiedMenu
        state={menuState}
        items={menuItems}
        onAction={handleAction}
        onClose={closeMenu}
        variant="action"
      />
    </>
  );
}
