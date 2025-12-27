/**
 * CollectionFlyout
 *
 * Dropdown menu showing all collections with checkmarks.
 * Allows adding/removing items from multiple collections.
 * Supports both series-level and file-level operations.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useCollections } from '../../contexts/CollectionsContext';
import { useToast } from '../../contexts/ToastContext';
import { getCollectionsForItem } from '../../services/api.service';
import { CollectionIcon } from '../CollectionIcon';
import './CollectionFlyout.css';

interface CollectionFlyoutProps {
  // What items are we managing
  seriesId?: string;
  fileId?: string;
  // For bulk operations (multiple selected files or series)
  fileIds?: string[];
  seriesIds?: string[];
  // Positioning
  align?: 'left' | 'right';
  // Size
  size?: 'small' | 'medium' | 'large';
  // Optional custom trigger (if not provided, uses default button)
  trigger?: React.ReactNode;
  className?: string;
}

export function CollectionFlyout({
  seriesId,
  fileId,
  fileIds,
  seriesIds,
  align = 'right',
  size = 'medium',
  trigger,
  className = '',
}: CollectionFlyoutProps) {
  const {
    collections,
    addToCollection,
    removeFromCollection,
    createCollection,
    isLoading: collectionsLoading,
  } = useCollections();
  const { addToast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [itemCollectionIds, setItemCollectionIds] = useState<Set<string>>(new Set());
  const [isLoadingMemberships, setIsLoadingMemberships] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());

  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build items array for operations
  const getItems = useCallback(() => {
    const items: Array<{ seriesId?: string; fileId?: string }> = [];
    if (seriesId) items.push({ seriesId });
    if (fileId) items.push({ fileId });
    if (seriesIds) items.push(...seriesIds.map((id) => ({ seriesId: id })));
    if (fileIds) items.push(...fileIds.map((id) => ({ fileId: id })));
    return items;
  }, [seriesId, fileId, seriesIds, fileIds]);

  // Fetch memberships when opening
  useEffect(() => {
    if (!isOpen) return;

    async function fetchMemberships() {
      if (!seriesId && !fileId) {
        // For bulk operations, we don't show checkmarks (too complex)
        setItemCollectionIds(new Set());
        return;
      }

      setIsLoadingMemberships(true);
      try {
        const result = await getCollectionsForItem(seriesId, fileId);
        setItemCollectionIds(new Set(result.collections.map((c) => c.id)));
      } catch (err) {
        console.error('Error fetching collection memberships:', err);
      } finally {
        setIsLoadingMemberships(false);
      }
    }

    fetchMemberships();
  }, [isOpen, seriesId, fileId]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setIsCreating(false);
        setNewCollectionName('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsCreating(false);
        setNewCollectionName('');
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Focus input when creating
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  // Check if we're in bulk mode (no checkmarks shown)
  const isBulkMode = !seriesId && !fileId && ((seriesIds?.length ?? 0) > 0 || (fileIds?.length ?? 0) > 0);

  const handleToggle = useCallback(async (collectionId: string) => {
    if (pendingToggles.has(collectionId)) return;

    setPendingToggles((prev) => new Set(prev).add(collectionId));

    const isInCollection = itemCollectionIds.has(collectionId);
    const items = getItems();
    const itemCount = items.length;
    const collection = collections.find(c => c.id === collectionId);
    const collectionName = collection?.name || 'collection';

    try {
      if (isInCollection) {
        await removeFromCollection(collectionId, items);
        setItemCollectionIds((prev) => {
          const next = new Set(prev);
          next.delete(collectionId);
          return next;
        });
        addToast('success', `Removed from ${collectionName}`);
      } else {
        await addToCollection(collectionId, items);
        setItemCollectionIds((prev) => new Set(prev).add(collectionId));
        addToast('success', isBulkMode
          ? `Added ${itemCount} items to ${collectionName}`
          : `Added to ${collectionName}`
        );
        // In bulk mode, close the flyout after adding
        if (isBulkMode) {
          setIsOpen(false);
        }
      }
    } catch (err) {
      console.error('Error toggling collection:', err);
      addToast('error', 'Failed to update collection');
    } finally {
      setPendingToggles((prev) => {
        const next = new Set(prev);
        next.delete(collectionId);
        return next;
      });
    }
  }, [itemCollectionIds, getItems, addToCollection, removeFromCollection, pendingToggles, collections, addToast, isBulkMode]);

  const handleCreateNew = useCallback(async () => {
    if (!newCollectionName.trim()) return;

    const collection = await createCollection(newCollectionName.trim());
    if (collection) {
      // Add items to the new collection
      const items = getItems();
      const itemCount = items.length;
      if (items.length > 0) {
        await addToCollection(collection.id, items);
        setItemCollectionIds((prev) => new Set(prev).add(collection.id));
        addToast('success', isBulkMode
          ? `Created "${collection.name}" and added ${itemCount} items`
          : `Created "${collection.name}" and added item`
        );
        // In bulk mode, close the flyout after creating and adding
        if (isBulkMode) {
          setIsOpen(false);
        }
      } else {
        addToast('success', `Created collection "${collection.name}"`);
      }
      setNewCollectionName('');
      setIsCreating(false);
    }
  }, [newCollectionName, createCollection, getItems, addToCollection, isBulkMode, addToast]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateNew();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewCollectionName('');
    }
  }, [handleCreateNew]);

  // Separate system and user collections
  const systemCollections = collections.filter((c) => c.isSystem);
  const userCollections = collections.filter((c) => !c.isSystem);

  const defaultTrigger = (
    <button
      ref={triggerRef}
      className={`collection-flyout-trigger collection-flyout-trigger--${size}`}
      onClick={() => setIsOpen(!isOpen)}
      aria-label="Add to collection"
      title="Add to collection"
      aria-haspopup="menu"
      aria-expanded={isOpen}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="9" y1="14" x2="15" y2="14" />
      </svg>
    </button>
  );

  return (
    <div className={`collection-flyout ${className}`}>
      {trigger ? (
        <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      ) : (
        defaultTrigger
      )}

      {isOpen && (
        <div
          ref={menuRef}
          className={`collection-flyout-menu collection-flyout-menu--${align}`}
          role="menu"
        >
          <div className="collection-flyout-header">Add to Collection</div>

          {collectionsLoading || isLoadingMemberships ? (
            <div className="collection-flyout-loading">Loading...</div>
          ) : (
            <>
              {/* System collections first */}
              {systemCollections.map((collection) => (
                <button
                  key={collection.id}
                  className={`collection-flyout-item ${
                    !isBulkMode && itemCollectionIds.has(collection.id) ? 'checked' : ''
                  } ${pendingToggles.has(collection.id) ? 'pending' : ''}`}
                  onClick={() => handleToggle(collection.id)}
                  disabled={pendingToggles.has(collection.id)}
                  role="menuitem"
                >
                  <span className="collection-flyout-item-icon">
                    <CollectionIcon
                      iconName={collection.iconName}
                      color={collection.color}
                      size={16}
                    />
                  </span>
                  <span className="collection-flyout-item-name">{collection.name}</span>
                  {!isBulkMode && itemCollectionIds.has(collection.id) && (
                    <span className="collection-flyout-item-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}

              {systemCollections.length > 0 && userCollections.length > 0 && (
                <div className="collection-flyout-divider" />
              )}

              {/* User collections */}
              {userCollections.map((collection) => (
                <button
                  key={collection.id}
                  className={`collection-flyout-item ${
                    !isBulkMode && itemCollectionIds.has(collection.id) ? 'checked' : ''
                  } ${pendingToggles.has(collection.id) ? 'pending' : ''}`}
                  onClick={() => handleToggle(collection.id)}
                  disabled={pendingToggles.has(collection.id)}
                  role="menuitem"
                >
                  <span className="collection-flyout-item-icon">
                    <CollectionIcon
                      iconName={collection.iconName}
                      color={collection.color}
                      size={16}
                    />
                  </span>
                  <span className="collection-flyout-item-name">{collection.name}</span>
                  {!isBulkMode && itemCollectionIds.has(collection.id) && (
                    <span className="collection-flyout-item-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}

              {userCollections.length === 0 && systemCollections.length === 0 && (
                <div className="collection-flyout-empty">No collections yet</div>
              )}

              <div className="collection-flyout-divider" />

              {/* Create new collection */}
              {isCreating ? (
                <div className="collection-flyout-create-form">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Collection name"
                    className="collection-flyout-input"
                  />
                  <button
                    onClick={handleCreateNew}
                    disabled={!newCollectionName.trim()}
                    className="collection-flyout-create-btn"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  className="collection-flyout-item collection-flyout-create"
                  onClick={() => setIsCreating(true)}
                  role="menuitem"
                >
                  <span className="collection-flyout-item-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                  <span className="collection-flyout-item-name">Create New Collection</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
