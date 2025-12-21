/**
 * CollectionsPage Component
 *
 * Full-page view for managing collections.
 * Provides a more spacious layout than the sidebar for managing items.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollections, Collection } from '../contexts/CollectionsContext';
import { getCoverUrl, getApiCoverUrl, CollectionItem } from '../services/api.service';
import './CollectionsPage.css';

export function CollectionsPage() {
  const navigate = useNavigate();
  const {
    collections,
    isLoading,
    createCollection,
    updateCollection,
    deleteCollection,
    getCollectionWithItems,
  } = useCollections();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Separate system collections from user collections
  const systemCollections = collections.filter((c) => c.isSystem);
  const userCollections = collections.filter((c) => !c.isSystem);

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

  // Load first collection on mount
  useEffect(() => {
    const firstCollection = collections[0];
    if (!selectedCollection && firstCollection) {
      handleSelectCollection(firstCollection);
    }
  }, [collections, selectedCollection, handleSelectCollection]);

  const handleOpenFile = (fileId: string) => {
    navigate(`/read/${fileId}`);
  };

  const handleOpenSeries = (seriesId: string) => {
    navigate(`/series/${seriesId}`);
  };

  // Get icon for system collections
  const getSystemIcon = (collection: Collection) => {
    if (collection.iconName === 'heart') {
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    }
    if (collection.iconName === 'bookmark') {
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    );
  };

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
                {systemCollections.map(collection => (
                  <div
                    key={collection.id}
                    className={`list-item system-collection ${collection.iconName} ${selectedCollection?.id === collection.id ? 'selected' : ''}`}
                    onClick={() => handleSelectCollection(collection)}
                  >
                    <div className="item-icon system-icon">
                      {getSystemIcon(collection)}
                    </div>
                    <div className="item-info">
                      <span className="item-name">{collection.name}</span>
                      <span className="item-count">{collection.itemCount ?? 0} items</span>
                    </div>
                  </div>
                ))}
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

            {userCollections.map(collection => (
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
                    <div className="item-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
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
            ))}
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
              <h2>{selectedCollection.name}</h2>
              <p className="detail-count">{collectionItems.length} items</p>

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

                    // For series: use API cover hash if available
                    // For files: use file cover endpoint
                    const coverUrl = isSeries
                      ? (item.series!.coverHash ? getApiCoverUrl(item.series!.coverHash) : null)
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
    </div>
  );
}
