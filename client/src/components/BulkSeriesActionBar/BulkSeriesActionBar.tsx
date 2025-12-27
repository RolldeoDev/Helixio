/**
 * BulkSeriesActionBar Component
 *
 * Fixed bottom action bar that appears when series are selected.
 * Provides bulk operations for multiple series at once.
 */

import { useState, useCallback } from 'react';
import './BulkSeriesActionBar.css';

export interface BulkSeriesActionBarProps {
  /** Number of selected series */
  selectedCount: number;
  /** Array of selected series IDs */
  selectedSeriesIds: string[];
  /** Clear the current selection */
  onClearSelection: () => void;
  /** Open collection picker modal */
  onAddToCollection: () => void;
  /** Remove from current collection (only shown in collection view) */
  onRemoveFromCollection?: () => void;
  /** Toggle favorite status */
  onToggleFavorite: (action: 'add' | 'remove') => void;
  /** Toggle want to read status */
  onToggleWantToRead: (action: 'add' | 'remove') => void;
  /** Mark all issues in selected series as read */
  onMarkRead: () => void;
  /** Mark all issues in selected series as unread */
  onMarkUnread: () => void;
  /** Fetch metadata for all issues in selected series */
  onFetchMetadata: () => void;
  /** Open batch edit modal */
  onBatchEdit: () => void;
  /** Open link series modal (only when exactly 1 series selected) */
  onLinkSeries?: () => void;
  /** Set hidden status for selected series */
  onSetHidden: (hidden: boolean) => void;
  /** Whether currently in a collection view */
  isInCollectionView?: boolean;
  /** Whether an operation is in progress */
  isLoading?: boolean;
}

interface ActionButton {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  dropdown?: { label: string; onClick: () => void }[];
}

export function BulkSeriesActionBar({
  selectedCount,
  selectedSeriesIds: _selectedSeriesIds,
  onClearSelection,
  onAddToCollection,
  onRemoveFromCollection,
  onToggleFavorite,
  onToggleWantToRead,
  onMarkRead,
  onMarkUnread,
  onFetchMetadata,
  onBatchEdit,
  onLinkSeries,
  onSetHidden,
  isInCollectionView = false,
  isLoading = false,
}: BulkSeriesActionBarProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const handleDropdownToggle = useCallback((id: string) => {
    setOpenDropdown((prev) => (prev === id ? null : id));
  }, []);

  const handleDropdownAction = useCallback((action: () => void) => {
    action();
    setOpenDropdown(null);
  }, []);

  // Close dropdown when clicking outside
  const handleBackdropClick = useCallback(() => {
    setOpenDropdown(null);
  }, []);

  const actions: ActionButton[] = [
    {
      id: 'collection',
      label: 'Collection',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
      onClick: onAddToCollection,
    },
    {
      id: 'favorite',
      label: 'Favorite',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      ),
      onClick: () => handleDropdownToggle('favorite'),
      dropdown: [
        { label: 'Add to Favorites', onClick: () => onToggleFavorite('add') },
        { label: 'Remove from Favorites', onClick: () => onToggleFavorite('remove') },
      ],
    },
    {
      id: 'wantToRead',
      label: 'Want to Read',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ),
      onClick: () => handleDropdownToggle('wantToRead'),
      dropdown: [
        { label: 'Add to Want to Read', onClick: () => onToggleWantToRead('add') },
        { label: 'Remove from Want to Read', onClick: () => onToggleWantToRead('remove') },
      ],
    },
    {
      id: 'read',
      label: 'Reading',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
      onClick: () => handleDropdownToggle('read'),
      dropdown: [
        { label: 'Mark All as Read', onClick: onMarkRead },
        { label: 'Mark All as Unread', onClick: onMarkUnread },
      ],
    },
    {
      id: 'metadata',
      label: 'Metadata',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
      onClick: onFetchMetadata,
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      ),
      onClick: onBatchEdit,
    },
    // Link Series - only shown when exactly 1 series is selected
    ...(selectedCount === 1 && onLinkSeries
      ? [
          {
            id: 'link',
            label: 'Link',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            ),
            onClick: onLinkSeries,
          },
        ]
      : []),
    {
      id: 'visibility',
      label: 'Visibility',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
      onClick: () => handleDropdownToggle('visibility'),
      dropdown: [
        { label: 'Hide Series', onClick: () => onSetHidden(true) },
        { label: 'Unhide Series', onClick: () => onSetHidden(false) },
      ],
    },
  ];

  // Add remove from collection action when in collection view
  if (isInCollectionView && onRemoveFromCollection) {
    actions.push({
      id: 'removeFromCollection',
      label: 'Remove',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      ),
      onClick: onRemoveFromCollection,
      danger: true,
    });
  }

  if (selectedCount === 0) {
    return null;
  }

  return (
    <>
      {/* Backdrop for closing dropdowns */}
      {openDropdown && (
        <div className="bulk-action-bar-backdrop" onClick={handleBackdropClick} />
      )}

      <div className={`bulk-series-action-bar ${isLoading ? 'loading' : ''}`}>
        <div className="bulk-action-bar-content">
          {/* Selection info */}
          <div className="bulk-action-bar-info">
            <span className="selection-count">
              {selectedCount} series selected
            </span>
            <button
              className="clear-selection-btn"
              onClick={onClearSelection}
              title="Clear selection"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Divider */}
          <div className="bulk-action-bar-divider" />

          {/* Action buttons */}
          <div className="bulk-action-bar-actions">
            {actions.map((action) => (
              <div key={action.id} className="bulk-action-wrapper">
                <button
                  className={`bulk-action-btn ${action.danger ? 'danger' : ''} ${action.dropdown ? 'has-dropdown' : ''}`}
                  onClick={action.onClick}
                  disabled={isLoading}
                  title={action.label}
                >
                  {action.icon}
                  <span className="action-label">{action.label}</span>
                  {action.dropdown && (
                    <svg className="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  )}
                </button>

                {/* Dropdown menu */}
                {action.dropdown && openDropdown === action.id && (
                  <div className="bulk-action-dropdown">
                    {action.dropdown.map((item, index) => (
                      <button
                        key={index}
                        className="dropdown-item"
                        onClick={() => handleDropdownAction(item.onClick)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Loading indicator */}
          {isLoading && (
            <div className="bulk-action-bar-loading">
              <svg className="spinner" viewBox="0 0 24 24" width="20" height="20">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeLinecap="round" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
