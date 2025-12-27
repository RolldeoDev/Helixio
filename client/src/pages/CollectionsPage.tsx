/**
 * CollectionsPage Component
 *
 * Full-page view for managing collections.
 * Provides a more spacious layout than the sidebar for managing items.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCollections, Collection } from '../contexts/CollectionsContext';
import {
  getCoverUrl,
  getApiCoverUrl,
  getCollectionCoverUrl,
  CollectionItem,
  toggleCollectionPromotion,
  updateCollectionCover,
  removeFromCollection as apiRemoveFromCollection,
  reorderCollectionItems,
  updateCollection as apiUpdateCollection,
} from '../services/api.service';
import { CollectionSettingsDrawer, CollectionUpdates } from '../components/CollectionSettingsDrawer';
import { CollectionIcon } from '../components/CollectionIcon';
import './CollectionsPage.css';

export function CollectionsPage() {
  const navigate = useNavigate();
  const { collectionId: urlCollectionId } = useParams<{ collectionId?: string }>();
  const {
    collections,
    isLoading,
    createCollection,
    updateCollection,
    deleteCollection,
    getCollectionWithItems,
    refreshCollections,
  } = useCollections();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Separate system collections from user collections
  const systemCollections = collections.filter((c) => c.isSystem);
  const userCollections = collections.filter((c) => !c.isSystem);

  // Helper to get collection cover URL
  const getCollectionCover = useCallback((collection: Collection): string | null => {
    if (!collection.coverType || collection.coverType === 'auto') {
      // Auto mode: use server-generated mosaic cover if available
      if (collection.coverHash) {
        return getCollectionCoverUrl(collection.coverHash);
      }
      return null;
    }
    if (collection.coverType === 'custom' && collection.coverHash) {
      return getApiCoverUrl(collection.coverHash);
    }
    if (collection.coverType === 'issue' && collection.coverFileId) {
      return getCoverUrl(collection.coverFileId);
    }
    // For series cover type, we'd need the series data which isn't in the list
    // Fall back to coverHash if available
    if (collection.coverHash) {
      return getApiCoverUrl(collection.coverHash);
    }
    return null;
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    await createCollection(newName.trim());
    setNewName('');
    setIsCreating(false);
  }, [newName, createCollection]);

  const handleDelete = useCallback(async (collection: Collection) => {
    if (collection.isSystem) {
      alert('System collections cannot be deleted.');
      return;
    }
    if (!confirm('Are you sure you want to delete this collection? This action cannot be undone.')) return;
    await deleteCollection(collection.id);
    if (selectedCollection?.id === collection.id) {
      setSelectedCollection(null);
      setCollectionItems([]);
    }
  }, [deleteCollection, selectedCollection]);

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editingName.trim()) return;
    await updateCollection(editingId, { name: editingName.trim() });
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, updateCollection]);

  const handleSelectCollection = useCallback(async (collection: Collection) => {
    setSelectedCollection(collection);
    setLoadingItems(true);
    try {
      const data = await getCollectionWithItems(collection.id);
      setCollectionItems(data?.items ?? []);
    } catch (err) {
      console.error('Error loading collection items:', err);
      setCollectionItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [getCollectionWithItems]);

  // Load collection from URL parameter, or first collection on mount
  useEffect(() => {
    if (collections.length === 0) return;

    // If URL has a collectionId, try to select that collection
    if (urlCollectionId) {
      const targetCollection = collections.find(c => c.id === urlCollectionId);
      if (targetCollection && selectedCollection?.id !== urlCollectionId) {
        handleSelectCollection(targetCollection);
        return;
      }
    }

    // Otherwise, select first collection if none selected
    const firstCollection = collections[0];
    if (!selectedCollection && firstCollection) {
      handleSelectCollection(firstCollection);
    }
  }, [collections, selectedCollection, handleSelectCollection, urlCollectionId]);

  const handleOpenFile = (fileId: string) => {
    navigate(`/read/${fileId}`);
  };

  const handleOpenSeries = (seriesId: string) => {
    navigate(`/series/${seriesId}`);
  };

  // Settings drawer handlers
  const handleSettingsSave = useCallback(async (updates: CollectionUpdates) => {
    if (!selectedCollection) return;

    try {
      // Update basic fields via collection update
      const basicUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) basicUpdates.name = updates.name;
      if (updates.deck !== undefined) basicUpdates.deck = updates.deck;
      if (updates.description !== undefined) basicUpdates.description = updates.description;
      // Lock flags
      if (updates.lockName !== undefined) basicUpdates.lockName = updates.lockName;
      if (updates.lockDeck !== undefined) basicUpdates.lockDeck = updates.lockDeck;
      if (updates.lockDescription !== undefined) basicUpdates.lockDescription = updates.lockDescription;
      if (updates.lockPublisher !== undefined) basicUpdates.lockPublisher = updates.lockPublisher;
      if (updates.lockStartYear !== undefined) basicUpdates.lockStartYear = updates.lockStartYear;
      if (updates.lockEndYear !== undefined) basicUpdates.lockEndYear = updates.lockEndYear;
      if (updates.lockGenres !== undefined) basicUpdates.lockGenres = updates.lockGenres;
      // Override metadata (now included in basicUpdates since route handles them)
      if (updates.overridePublisher !== undefined) basicUpdates.overridePublisher = updates.overridePublisher;
      if (updates.overrideStartYear !== undefined) basicUpdates.overrideStartYear = updates.overrideStartYear;
      if (updates.overrideEndYear !== undefined) basicUpdates.overrideEndYear = updates.overrideEndYear;
      if (updates.overrideGenres !== undefined) basicUpdates.overrideGenres = updates.overrideGenres;
      // New fields
      if (updates.rating !== undefined) basicUpdates.rating = updates.rating;
      if (updates.notes !== undefined) basicUpdates.notes = updates.notes;
      if (updates.visibility !== undefined) basicUpdates.visibility = updates.visibility;
      if (updates.readingMode !== undefined) basicUpdates.readingMode = updates.readingMode;

      if (Object.keys(basicUpdates).length > 0) {
        await apiUpdateCollection(selectedCollection.id, basicUpdates);
      }

      // Update cover if changed
      if (updates.coverType !== undefined) {
        // Determine the sourceId based on cover type
        const sourceId = updates.coverType === 'series'
          ? updates.coverSeriesId ?? undefined
          : updates.coverType === 'issue'
            ? updates.coverFileId ?? undefined
            : undefined;
        await updateCollectionCover(selectedCollection.id, updates.coverType, sourceId);
      }

      // Toggle promotion if changed
      if (updates.isPromoted !== undefined) {
        await toggleCollectionPromotion(selectedCollection.id);
      }

      // Refresh the collection data
      const data = await getCollectionWithItems(selectedCollection.id);
      if (data) {
        // CollectionWithItems extends Collection, so data itself contains all collection fields
        const { items, ...collectionData } = data;
        setSelectedCollection(collectionData as Collection);
        setCollectionItems(items ?? []);
      }

      // Refresh global collections context to update covers everywhere (including promoted collections)
      await refreshCollections();
    } catch (err) {
      console.error('Error saving collection settings:', err);
      throw err;
    }
  }, [selectedCollection, getCollectionWithItems, refreshCollections]);

  const handleRemoveItems = useCallback(async (itemIds: string[]) => {
    if (!selectedCollection) return;

    try {
      // Find the items to remove and format them for the API
      const itemsToRemove = collectionItems
        .filter(item => itemIds.includes(item.id))
        .map(item => ({
          seriesId: item.seriesId || undefined,
          fileId: item.fileId || undefined,
        }));

      await apiRemoveFromCollection(selectedCollection.id, itemsToRemove);

      // Refresh items
      const data = await getCollectionWithItems(selectedCollection.id);
      if (data) {
        const { items, ...collectionData } = data;
        setSelectedCollection(collectionData as Collection);
        setCollectionItems(items ?? []);
      }
    } catch (err) {
      console.error('Error removing items:', err);
      throw err;
    }
  }, [selectedCollection, collectionItems, getCollectionWithItems]);

  const handleReorderItems = useCallback(async (itemIds: string[]) => {
    if (!selectedCollection) return;

    try {
      await reorderCollectionItems(selectedCollection.id, itemIds);

      // Refresh items to get new order
      const data = await getCollectionWithItems(selectedCollection.id);
      if (data) {
        setCollectionItems(data.items ?? []);
      }
    } catch (err) {
      console.error('Error reordering items:', err);
      throw err;
    }
  }, [selectedCollection, getCollectionWithItems]);

  if (isLoading) {
    return (
      <div className="collections-page">
        <div className="collections-page-header">
          <h1>Collections</h1>
        </div>
        <div className="collections-loading">Loading collections...</div>
      </div>
    );
  }

  return (
    <div className="collections-page">
      <div className="collections-page-header">
        <h1>Collections</h1>
        <p className="collections-subtitle">
          Organize your comics and series into collections.
        </p>
      </div>

      <div className="collections-layout">
        {/* Left Panel - List */}
        <div className="collections-list-panel">
          {/* Quick Access Section */}
          {systemCollections.length > 0 && (
            <>
              <div className="panel-header">
                <h2>Quick Access</h2>
              </div>
              <div className="items-list">
                {systemCollections.map(collection => {
                  const coverUrl = getCollectionCover(collection);
                  return (
                    <div
                      key={collection.id}
                      className={`list-item system-collection ${selectedCollection?.id === collection.id ? 'selected' : ''}`}
                      onClick={() => handleSelectCollection(collection)}
                    >
                      <div className="item-cover-preview">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" />
                        ) : (
                          <div className="item-cover-placeholder">
                            <CollectionIcon size={16} />
                          </div>
                        )}
                      </div>
                      <div className="item-info">
                        <span className="item-name">{collection.name}</span>
                        <span className="item-count">{collection.itemCount ?? 0} items</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* User Collections Section */}
          <div className="panel-header">
            <h2>Collections</h2>
            <button
              className="create-btn"
              onClick={() => setIsCreating(true)}
            >
              + Create New
            </button>
          </div>

          {/* Create Form */}
          {isCreating && (
            <div className="create-form">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Collection name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setIsCreating(false);
                }}
              />
              <div className="form-actions">
                <button className="btn-primary" onClick={handleCreate} disabled={!newName.trim()}>
                  Create
                </button>
                <button className="btn-secondary" onClick={() => setIsCreating(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* User Collections List */}
          <div className="items-list">
            {userCollections.length === 0 && !isCreating && (
              <div className="empty-state">
                <p>No collections yet</p>
                <button className="btn-primary" onClick={() => setIsCreating(true)}>
                  Create your first collection
                </button>
              </div>
            )}

            {userCollections.map(collection => {
              const coverUrl = getCollectionCover(collection);
              return (
                <div
                  key={collection.id}
                  className={`list-item ${selectedCollection?.id === collection.id ? 'selected' : ''}`}
                  onClick={() => handleSelectCollection(collection)}
                >
                  {editingId === collection.id ? (
                    <div className="edit-form" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={handleSaveEdit}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="item-cover-preview">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" />
                        ) : (
                          <div className="item-cover-placeholder">
                            <CollectionIcon size={16} />
                          </div>
                        )}
                      </div>
                      <div className="item-info">
                        <span className="item-name">{collection.name}</span>
                        <span className="item-count">{collection.itemCount ?? 0} items</span>
                      </div>
                      <div className="item-actions">
                        <button
                          className="action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(collection.id, collection.name);
                          }}
                          title="Rename"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(collection);
                          }}
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel - Detail View */}
        <div className="collections-detail-panel">
          {!selectedCollection && (
            <div className="detail-empty">
              <p>Select a collection to view its contents</p>
            </div>
          )}

          {selectedCollection && (
            <div className="detail-content">
              <div className="detail-header">
                <div className="detail-header-top">
                  <div>
                    <h2>{selectedCollection.name}</h2>
                    <p className="detail-count">{collectionItems.length} items</p>
                  </div>
                  {!selectedCollection.isSystem && (
                    <button
                      className="settings-btn"
                      onClick={() => setIsSettingsOpen(true)}
                      title="Collection Settings"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Description section */}
                <div className="detail-description-section">
                  {selectedCollection.description ? (
                    <p className="description-text">{selectedCollection.description}</p>
                  ) : (
                    <p className="description-placeholder">No description</p>
                  )}
                </div>
              </div>

              {loadingItems ? (
                <div className="detail-loading">Loading items...</div>
              ) : collectionItems.length === 0 ? (
                <div className="detail-empty-items">
                  <p>This collection is empty.</p>
                  <p className="hint">Add comics or series to this collection from their detail pages.</p>
                </div>
              ) : (
                <div className="detail-items-grid">
                  {collectionItems.map((item) => {
                    const isSeries = !!item.seriesId && item.series;
                    const isFile = !!item.fileId && item.file;

                    // For series: Smart cover fallback: API > User > First Issue
                    // For files: use file cover endpoint
                    const coverUrl = isSeries
                      ? (item.series!.coverHash
                          ? getApiCoverUrl(item.series!.coverHash)
                          : item.series!.coverFileId
                            ? getCoverUrl(item.series!.coverFileId)
                            : item.series!.firstIssueId
                              ? getCoverUrl(item.series!.firstIssueId)
                              : null)
                      : isFile
                      ? getCoverUrl(item.fileId!)
                      : null;

                    const title = isSeries
                      ? item.series!.name
                      : isFile
                      ? item.file!.filename.replace(/\.(cbz|cbr|cb7|pdf)$/i, '')
                      : 'Unknown';

                    const subtitle = isSeries
                      ? [item.series!.publisher, item.series!.startYear].filter(Boolean).join(' • ') || null
                      : isFile && item.file!.seriesId
                      ? 'Issue'
                      : null;

                    return (
                      <div
                        key={item.id}
                        className="collection-item-card"
                        onClick={() => {
                          if (item.fileId) {
                            handleOpenFile(item.fileId);
                          } else if (item.seriesId) {
                            handleOpenSeries(item.seriesId);
                          }
                        }}
                      >
                        <div className="item-cover">
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt={title}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                target.parentElement?.classList.add('no-cover');
                              }}
                            />
                          ) : (
                            <div className="no-cover-placeholder">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <path d="M21 15l-5-5L5 21" />
                              </svg>
                            </div>
                          )}
                          <span className={`item-type-badge ${isSeries ? 'series' : 'issue'}`}>
                            {isSeries ? 'Series' : 'Issue'}
                          </span>
                        </div>
                        <div className="item-details">
                          <span className="item-title" title={title}>
                            {title}
                          </span>
                          {subtitle && (
                            <span className="item-subtitle">{subtitle}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Collection Settings Drawer */}
      {selectedCollection && !selectedCollection.isSystem && (
        <CollectionSettingsDrawer
          collection={selectedCollection}
          collectionItems={collectionItems}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
          onRemoveItems={handleRemoveItems}
          onReorderItems={handleReorderItems}
        />
      )}
    </div>
  );
}
