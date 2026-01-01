/**
 * BulkActionsBar Component
 *
 * Fixed bottom action bar that appears when series are selected.
 * Provides quick access to bulk operations.
 */

import React, { useState, useRef, useEffect } from 'react';
import './BulkActionsBar.css';

// =============================================================================
// Types
// =============================================================================

export interface BulkActionsBarProps {
  /** Number of selected items */
  selectedCount: number;
  /** Whether a bulk operation is in progress */
  isLoading: boolean;
  /** Clear selection handler */
  onClearSelection: () => void;
  /** Add to collection handler */
  onAddToCollection: () => void;
  /** Add to favorites handler */
  onAddToFavorites: () => void;
  /** Remove from favorites handler */
  onRemoveFromFavorites: () => void;
  /** Add to want to read handler */
  onAddToWantToRead: () => void;
  /** Remove from want to read handler */
  onRemoveFromWantToRead: () => void;
  /** Mark as read handler */
  onMarkAsRead: () => void;
  /** Mark as unread handler */
  onMarkAsUnread: () => void;
  /** Fetch metadata handler */
  onFetchMetadata: () => void;
  /** Hide series handler */
  onHideSeries: () => void;
  /** Unhide series handler */
  onUnhideSeries: () => void;
  /** Batch edit handler */
  onBatchEdit: () => void;
}

// =============================================================================
// Dropdown Menu Component
// =============================================================================

interface DropdownMenuProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}

function DropdownMenu({ label, icon, children, disabled }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <div className="bulk-actions-bar__dropdown" ref={menuRef}>
      <button
        className={`bulk-actions-bar__dropdown-trigger ${isOpen ? 'bulk-actions-bar__dropdown-trigger--open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {icon}
        <span>{label}</span>
        <svg className="bulk-actions-bar__dropdown-arrow" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 6H4.604a.25.25 0 00-.177.427z" />
        </svg>
      </button>
      {isOpen && (
        <div className="bulk-actions-bar__dropdown-menu">
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child as React.ReactElement<{ onClick?: () => void }>, {
                onClick: () => {
                  setIsOpen(false);
                  child.props.onClick?.();
                },
              });
            }
            return child;
          })}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  onClick?: () => void;
  children: React.ReactNode;
  danger?: boolean;
}

function DropdownItem({ onClick, children, danger }: DropdownItemProps) {
  return (
    <button
      className={`bulk-actions-bar__dropdown-item ${danger ? 'bulk-actions-bar__dropdown-item--danger' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// =============================================================================
// Icons
// =============================================================================

const HeartIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
  </svg>
);

const BookmarkIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const CloudDownloadIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
    <path d="M9 13h2v5a1 1 0 11-2 0v-5z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
  </svg>
);

const FolderPlusIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    <path stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="M8 11h4M10 9v4" fill="none" />
  </svg>
);

// =============================================================================
// Component
// =============================================================================

export function BulkActionsBar({
  selectedCount,
  isLoading,
  onClearSelection,
  onAddToCollection,
  onAddToFavorites,
  onRemoveFromFavorites,
  onAddToWantToRead,
  onRemoveFromWantToRead,
  onMarkAsRead,
  onMarkAsUnread,
  onFetchMetadata,
  onHideSeries,
  onUnhideSeries,
  onBatchEdit,
}: BulkActionsBarProps) {
  // Don't render if nothing is selected
  if (selectedCount === 0) return null;

  return (
    <div className="bulk-actions-bar" role="toolbar" aria-label="Bulk actions">
      {/* Selection info */}
      <div className="bulk-actions-bar__selection">
        <span className="bulk-actions-bar__count">
          {selectedCount} {selectedCount === 1 ? 'series' : 'series'} selected
        </span>
        <button
          className="bulk-actions-bar__clear"
          onClick={onClearSelection}
          aria-label="Clear selection"
        >
          Clear
        </button>
      </div>

      {/* Divider */}
      <div className="bulk-actions-bar__divider" />

      {/* Action buttons */}
      <div className="bulk-actions-bar__actions">
        {/* Add to Collection */}
        <button
          className="bulk-actions-bar__action"
          onClick={onAddToCollection}
          disabled={isLoading}
          title="Add to collection"
        >
          <FolderPlusIcon />
          <span>Collection</span>
        </button>

        {/* Favorites dropdown */}
        <DropdownMenu label="Favorite" icon={<HeartIcon />} disabled={isLoading}>
          <DropdownItem onClick={onAddToFavorites}>Add to Favorites</DropdownItem>
          <DropdownItem onClick={onRemoveFromFavorites}>Remove from Favorites</DropdownItem>
        </DropdownMenu>

        {/* Want to Read dropdown */}
        <DropdownMenu label="Want to Read" icon={<BookmarkIcon />} disabled={isLoading}>
          <DropdownItem onClick={onAddToWantToRead}>Add to Want to Read</DropdownItem>
          <DropdownItem onClick={onRemoveFromWantToRead}>Remove from Want to Read</DropdownItem>
        </DropdownMenu>

        {/* Reading dropdown */}
        <DropdownMenu label="Reading" icon={<CheckIcon />} disabled={isLoading}>
          <DropdownItem onClick={onMarkAsRead}>Mark All as Read</DropdownItem>
          <DropdownItem onClick={onMarkAsUnread}>Mark All as Unread</DropdownItem>
        </DropdownMenu>

        {/* Fetch Metadata */}
        <button
          className="bulk-actions-bar__action"
          onClick={onFetchMetadata}
          disabled={isLoading}
          title="Fetch metadata"
        >
          <CloudDownloadIcon />
          <span>Metadata</span>
        </button>

        {/* Batch Edit */}
        <button
          className="bulk-actions-bar__action"
          onClick={onBatchEdit}
          disabled={isLoading}
          title="Batch edit metadata"
        >
          <EditIcon />
          <span>Edit</span>
        </button>

        {/* Visibility dropdown */}
        <DropdownMenu label="Visibility" icon={<EyeOffIcon />} disabled={isLoading}>
          <DropdownItem onClick={onHideSeries}>Hide Series</DropdownItem>
          <DropdownItem onClick={onUnhideSeries}>Unhide Series</DropdownItem>
        </DropdownMenu>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="bulk-actions-bar__loading">
          <div className="bulk-actions-bar__spinner" />
        </div>
      )}
    </div>
  );
}
