/**
 * UnifiedMenu Component
 *
 * Single menu component that supports both context menus (right-click)
 * and action menus (overflow button). Adapts positioning based on trigger type.
 *
 * Features:
 * - React Portal rendering to document.body
 * - Viewport boundary detection
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Focus management
 * - ARIA accessibility
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { MenuItem, MenuContext, MenuState, MenuPosition } from './types';
import './UnifiedMenu.css';

// =============================================================================
// Types
// =============================================================================

interface UnifiedMenuProps {
  /** Menu state (position, context, etc.) */
  state: MenuState;
  /** Menu items to display */
  items: MenuItem[];
  /** Called when an action is selected */
  onAction: (actionId: string, context: MenuContext) => void;
  /** Called when menu should close */
  onClose: () => void;
  /** CSS class variant for styling */
  variant?: 'default' | 'context' | 'action';
}

// =============================================================================
// Component
// =============================================================================

export function UnifiedMenu({
  state,
  items,
  onAction,
  onClose,
  variant = 'default',
}: UnifiedMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<MenuPosition | null>(null);

  // Determine CSS class based on variant
  const getMenuClass = () => {
    switch (variant) {
      case 'context':
        return 'cover-card-context-menu';
      case 'action':
        return 'action-menu';
      default:
        return 'unified-menu';
    }
  };

  const getItemClass = () => {
    switch (variant) {
      case 'context':
        return 'cover-card-context-menu__item';
      case 'action':
        return 'action-menu__item';
      default:
        return 'unified-menu__item';
    }
  };

  const getIconClass = () => {
    switch (variant) {
      case 'context':
        return 'cover-card-context-menu__icon';
      case 'action':
        return 'action-menu__icon';
      default:
        return 'unified-menu__icon';
    }
  };

  const getLabelClass = () => {
    switch (variant) {
      case 'context':
        return 'cover-card-context-menu__label';
      case 'action':
        return 'action-menu__label';
      default:
        return 'unified-menu__label';
    }
  };

  const getDividerClass = () => {
    switch (variant) {
      case 'context':
        return 'cover-card-context-menu__divider';
      case 'action':
        return 'action-menu__divider';
      default:
        return 'unified-menu__divider';
    }
  };

  // Handle menu item click
  const handleItemClick = useCallback(
    (actionId: string) => {
      if (state.context) {
        onAction(actionId, state.context);
      }
      onClose();
    },
    [state.context, onAction, onClose]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const current = document.activeElement;
        // Find next focusable button
        const buttons = menuRef.current?.querySelectorAll('button:not([disabled])');
        if (buttons) {
          const currentIndex = Array.from(buttons).indexOf(current as Element);
          const nextIndex = (currentIndex + 1) % buttons.length;
          (buttons[nextIndex] as HTMLElement).focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const current = document.activeElement;
        const buttons = menuRef.current?.querySelectorAll('button:not([disabled])');
        if (buttons) {
          const currentIndex = Array.from(buttons).indexOf(current as Element);
          const prevIndex = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
          (buttons[prevIndex] as HTMLElement).focus();
        }
      }
    },
    [onClose]
  );

  // Handle item keyboard activation
  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent, actionId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleItemClick(actionId);
      }
    },
    [handleItemClick]
  );

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (!state.isOpen || !state.position || !menuRef.current) {
      setAdjustedPosition(null);
      return;
    }

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;

    let { x, y } = state.position;

    // Prevent menu from going off right edge
    if (x + rect.width > viewportWidth - padding) {
      x = viewportWidth - rect.width - padding;
    }

    // Prevent menu from going off bottom edge
    if (y + rect.height > viewportHeight - padding) {
      y = viewportHeight - rect.height - padding;
    }

    // Ensure menu doesn't go off left or top edge
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    setAdjustedPosition({ x, y });

    // Focus first non-disabled item
    const firstButton = menu.querySelector('button:not([disabled])');
    if (firstButton instanceof HTMLElement) {
      firstButton.focus();
    }
  }, [state.isOpen, state.position]);

  // Click outside to close
  useEffect(() => {
    if (!state.isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use setTimeout to avoid immediate close from the click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [state.isOpen, onClose]);

  // Close on Escape globally
  useEffect(() => {
    if (!state.isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [state.isOpen, onClose]);

  // Don't render if not open or no position
  if (!state.isOpen || !state.position) {
    return null;
  }

  const position = adjustedPosition || state.position;
  const menuClass = getMenuClass();
  const itemClass = getItemClass();
  const iconClass = getIconClass();
  const labelClass = getLabelClass();
  const dividerClass = getDividerClass();

  const menuContent = (
    <div
      ref={menuRef}
      className={menuClass}
      style={{ top: position.y, left: position.x }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => (
        <div key={item.id}>
          {/* Divider before */}
          {item.dividerBefore && index > 0 && (
            <div className={dividerClass} role="separator" />
          )}

          {/* Menu item */}
          <button
            className={`${itemClass} ${item.danger ? `${itemClass}--danger` : ''} ${item.disabled ? `${itemClass}--disabled` : ''}`}
            onClick={() => !item.disabled && handleItemClick(item.id)}
            onKeyDown={(e) => !item.disabled && handleItemKeyDown(e, item.id)}
            disabled={item.disabled}
            role="menuitem"
            tabIndex={0}
          >
            {item.icon && <span className={iconClass}>{item.icon}</span>}
            <span className={labelClass}>{item.label}</span>
          </button>

          {/* Divider after */}
          {item.dividerAfter && index < items.length - 1 && (
            <div className={dividerClass} role="separator" />
          )}
        </div>
      ))}
    </div>
  );

  // Render via portal to document body
  return createPortal(menuContent, document.body);
}
