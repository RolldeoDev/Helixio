/**
 * ActionMenu Component
 *
 * A "..." button that opens a dropdown menu with actions.
 * Reusable for both series and issue action menus.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './ActionMenu.css';

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
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate menu position when opening
  const openMenu = useCallback(() => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 200; // Approximate menu width
    const menuHeight = items.length * 36 + 8; // Approximate height

    // Position below button, aligned to right edge
    let top = rect.bottom + 4;
    let left = rect.right - menuWidth;

    // Viewport boundary checks
    if (left < 8) {
      left = rect.left;
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = rect.top - menuHeight - 4;
    }

    setMenuPosition({ top, left });
    setIsOpen(true);
  }, [items.length]);

  // Close menu
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setMenuPosition(null);
  }, []);

  // Toggle menu
  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  // Handle action click
  const handleAction = (actionId: string) => {
    onAction(actionId);
    closeMenu();
  };

  // Handle keyboard on button
  const handleButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    } else if (e.key === 'Escape' && isOpen) {
      closeMenu();
    }
  };

  // Handle keyboard navigation in menu
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeMenu();
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = document.activeElement;
      const nextButton = current?.nextElementSibling?.querySelector('button')
        || current?.parentElement?.nextElementSibling?.querySelector('button');
      if (nextButton instanceof HTMLElement) {
        nextButton.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = document.activeElement;
      const prevButton = current?.previousElementSibling?.querySelector('button')
        || current?.parentElement?.previousElementSibling?.querySelector('button');
      if (prevButton instanceof HTMLElement) {
        prevButton.focus();
      }
    }
  };

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        closeMenu();
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
  }, [isOpen, closeMenu]);

  // Focus first item when menu opens
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const firstButton = menuRef.current.querySelector('button:not([disabled])');
      if (firstButton instanceof HTMLElement) {
        firstButton.focus();
      }
    }
  }, [isOpen]);

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
        aria-expanded={isOpen}
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

      {isOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          className="action-menu"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, index) => (
            <div key={item.id}>
              {item.dividerBefore && index > 0 && (
                <div className="action-menu__divider" role="separator" />
              )}

              <button
                type="button"
                className={`action-menu__item ${item.danger ? 'action-menu__item--danger' : ''} ${item.disabled ? 'action-menu__item--disabled' : ''}`}
                onClick={() => !item.disabled && handleAction(item.id)}
                disabled={item.disabled}
                role="menuitem"
                tabIndex={0}
              >
                {item.icon && (
                  <span className="action-menu__icon">{item.icon}</span>
                )}
                <span className="action-menu__label">{item.label}</span>
              </button>

              {item.dividerAfter && index < items.length - 1 && (
                <div className="action-menu__divider" role="separator" />
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
