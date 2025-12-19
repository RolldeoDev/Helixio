/**
 * ContextMenu Component
 *
 * Right-click context menu for cover cards with configurable items.
 */

import { useEffect, useRef } from 'react';
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

  // Focus first item when menu opens
  useEffect(() => {
    const firstButton = menuRef.current?.querySelector('button');
    if (firstButton) {
      firstButton.focus();
    }
  }, []);

  return (
    <div
      ref={menuRef}
      className="cover-card-context-menu"
      style={{ top: position.y, left: position.x }}
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
}
