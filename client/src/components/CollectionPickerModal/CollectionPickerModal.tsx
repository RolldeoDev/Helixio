/**
 * CollectionPickerModal
 *
 * Modal dialog for adding files to collections.
 * Used when triggered from context menus.
 */

import { useState, useCallback, useEffect } from 'react';
import { useCollections } from '../../contexts/CollectionsContext';
import { getCollectionsForItem } from '../../services/api.service';
import './CollectionPickerModal.css';

interface CollectionPickerModalProps {
  // Items to add to collections
  fileIds?: string[];
  seriesIds?: string[];
  // Modal control
  isOpen: boolean;
  onClose: () => void;
}

export function CollectionPickerModal({
  fileIds = [],
  seriesIds = [],
  isOpen,
  onClose,
}: CollectionPickerModalProps) {
  const {
    collections,
    addToCollection,
    removeFromCollection,
    createCollection,
    isLoading: collectionsLoading,
  } = useCollections();

  const [itemCollectionIds, setItemCollectionIds] = useState<Set<string>>(new Set());
  const [isLoadingMemberships, setIsLoadingMemberships] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());

  // Determine if we're in bulk mode
  const isBulkMode = (fileIds.length + seriesIds.length) > 1;
  const singleFileId = fileIds.length === 1 ? fileIds[0] : undefined;
  const singleSeriesId = seriesIds.length === 1 ? seriesIds[0] : undefined;

  // Fetch memberships when opening (single item only)
  useEffect(() => {
    if (!isOpen) return;

    async function fetchMemberships() {
      if (isBulkMode || (!singleFileId && !singleSeriesId)) {
        setItemCollectionIds(new Set());
        return;
      }

      setIsLoadingMemberships(true);
      try {
        const result = await getCollectionsForItem(singleSeriesId, singleFileId);
        setItemCollectionIds(new Set(result.collections.map((c) => c.id)));
      } catch (err) {
        console.error('Error fetching collection memberships:', err);
      } finally {
        setIsLoadingMemberships(false);
      }
    }

    fetchMemberships();
  }, [isOpen, singleFileId, singleSeriesId, isBulkMode]);

  // Build items array for operations
  const getItems = useCallback(() => {
    const items: Array<{ seriesId?: string; fileId?: string }> = [];
    if (fileIds.length > 0) items.push(...fileIds.map((id) => ({ fileId: id })));
    if (seriesIds.length > 0) items.push(...seriesIds.map((id) => ({ seriesId: id })));
    return items;
  }, [fileIds, seriesIds]);

  const handleToggle = useCallback(async (collectionId: string) => {
    if (pendingToggles.has(collectionId)) return;

    setPendingToggles((prev) => new Set(prev).add(collectionId));

    const isInCollection = itemCollectionIds.has(collectionId);
    const items = getItems();

    try {
      if (isInCollection && !isBulkMode) {
        await removeFromCollection(collectionId, items);
        setItemCollectionIds((prev) => {
          const next = new Set(prev);
          next.delete(collectionId);
          return next;
        });
      } else {
        await addToCollection(collectionId, items);
        setItemCollectionIds((prev) => new Set(prev).add(collectionId));
      }
    } catch (err) {
      console.error('Error toggling collection:', err);
    } finally {
      setPendingToggles((prev) => {
        const next = new Set(prev);
        next.delete(collectionId);
        return next;
      });
    }
  }, [itemCollectionIds, getItems, addToCollection, removeFromCollection, pendingToggles, isBulkMode]);

  const handleCreateNew = useCallback(async () => {
    if (!newCollectionName.trim()) return;

    const collection = await createCollection(newCollectionName.trim());
    if (collection) {
      const items = getItems();
      if (items.length > 0) {
        await addToCollection(collection.id, items);
        setItemCollectionIds((prev) => new Set(prev).add(collection.id));
      }
      setNewCollectionName('');
      setIsCreating(false);
    }
  }, [newCollectionName, createCollection, getItems, addToCollection]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateNew();
    } else if (e.key === 'Escape') {
      if (isCreating) {
        setIsCreating(false);
        setNewCollectionName('');
      } else {
        onClose();
      }
    }
  }, [handleCreateNew, isCreating, onClose]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const systemCollections = collections.filter((c) => c.isSystem);
  const userCollections = collections.filter((c) => !c.isSystem);

  const itemCount = fileIds.length + seriesIds.length;
  const title = isBulkMode
    ? `Add ${itemCount} items to collection`
    : 'Add to Collection';

  return (
    <div className="collection-picker-overlay" onClick={onClose}>
      <div
        className="collection-picker-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-picker-title"
      >
        <div className="collection-picker-header">
          <h3 id="collection-picker-title">{title}</h3>
          <button
            className="collection-picker-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="collection-picker-content">
          {collectionsLoading || isLoadingMemberships ? (
            <div className="collection-picker-loading">Loading...</div>
          ) : (
            <>
              {/* System collections */}
              {systemCollections.map((collection) => (
                <button
                  key={collection.id}
                  className={`collection-picker-item ${
                    !isBulkMode && itemCollectionIds.has(collection.id) ? 'checked' : ''
                  } ${pendingToggles.has(collection.id) ? 'pending' : ''}`}
                  onClick={() => handleToggle(collection.id)}
                  disabled={pendingToggles.has(collection.id)}
                >
                  <span className="collection-picker-item-icon">
                    {collection.iconName === 'heart' ? (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    ) : collection.iconName === 'bookmark' ? (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    )}
                  </span>
                  <span className="collection-picker-item-name">{collection.name}</span>
                  {!isBulkMode && itemCollectionIds.has(collection.id) && (
                    <span className="collection-picker-item-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}

              {systemCollections.length > 0 && userCollections.length > 0 && (
                <div className="collection-picker-divider" />
              )}

              {/* User collections */}
              {userCollections.map((collection) => (
                <button
                  key={collection.id}
                  className={`collection-picker-item ${
                    !isBulkMode && itemCollectionIds.has(collection.id) ? 'checked' : ''
                  } ${pendingToggles.has(collection.id) ? 'pending' : ''}`}
                  onClick={() => handleToggle(collection.id)}
                  disabled={pendingToggles.has(collection.id)}
                >
                  <span className="collection-picker-item-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                  <span className="collection-picker-item-name">{collection.name}</span>
                  {!isBulkMode && itemCollectionIds.has(collection.id) && (
                    <span className="collection-picker-item-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}

              {userCollections.length === 0 && systemCollections.length === 0 && (
                <div className="collection-picker-empty">No collections yet</div>
              )}

              <div className="collection-picker-divider" />

              {/* Create new collection */}
              {isCreating ? (
                <div className="collection-picker-create-form">
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Collection name"
                    className="collection-picker-input"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateNew}
                    disabled={!newCollectionName.trim()}
                    className="collection-picker-create-btn"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  className="collection-picker-item collection-picker-create"
                  onClick={() => setIsCreating(true)}
                >
                  <span className="collection-picker-item-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                  <span className="collection-picker-item-name">Create New Collection</span>
                </button>
              )}
            </>
          )}
        </div>

        <div className="collection-picker-footer">
          <button className="collection-picker-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
