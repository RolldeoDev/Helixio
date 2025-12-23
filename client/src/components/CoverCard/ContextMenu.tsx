/**
 * ContextMenu Component
 *
 * Right-click context menu for cover cards with configurable items.
 * Uses React Portal to render at document body for correct fixed positioning.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mergeMenuItems } from './menuPresets';
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Merge and filter menu items
  const menuItems = mergeMenuItems(items, customItems, selectedCount);

  // Handle menu item click
  const handleItemClick = (action: string) => {
    onAction(action);
    onClose();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, action: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleItemClick(action);
    }
  };

  // Adjust position after mount to keep menu within viewport
  useEffect(() => {
    if (!menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;

    let { x, y } = position;

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

    if (x !== position.x || y !== position.y) {
      setAdjustedPosition({ x, y });
    }

    // Focus first item
    const firstButton = menu.querySelector('button');
    if (firstButton) {
      firstButton.focus();
    }
  }, [position]);

  const menuContent = (
    <div
      ref={menuRef}
      className="cover-card-context-menu"
      style={{ top: adjustedPosition.y, left: adjustedPosition.x }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, index) => (
        <div key={item.id}>
          {/* Divider before */}
          {item.dividerBefore && index > 0 && (
            <div className="cover-card-context-menu__divider" role="separator" />
          )}

          {/* Menu item */}
          <button
            className={`cover-card-context-menu__item ${item.danger ? 'cover-card-context-menu__item--danger' : ''} ${item.disabled ? 'cover-card-context-menu__item--disabled' : ''}`}
            onClick={() => !item.disabled && handleItemClick(item.id)}
            onKeyDown={(e) => !item.disabled && handleKeyDown(e, item.id)}
            disabled={item.disabled}
            role="menuitem"
            tabIndex={0}
          >
            {item.icon && (
              <span className="cover-card-context-menu__icon">{item.icon}</span>
            )}
            <span className="cover-card-context-menu__label">{item.label}</span>
          </button>

          {/* Divider after */}
          {item.dividerAfter && index < menuItems.length - 1 && (
            <div className="cover-card-context-menu__divider" role="separator" />
          )}
        </div>
      ))}
    </div>
  );

  // Render via portal to document body for correct fixed positioning
  return createPortal(menuContent, document.body);
}
