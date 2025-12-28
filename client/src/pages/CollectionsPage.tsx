/**
 * CollectionsPage Component - Redesigned
 *
 * Full-page view for managing collections with rich collection cards
 * and metadata-focused detail panel.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
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
import { CollectionSettingsModal, CollectionUpdates } from '../components/CollectionSettingsModal';
import { CollectionListCard } from '../components/CollectionListCard';
import { CollectionMetadataStats } from '../components/CollectionMetadataStats';
import { TruncatedDescription } from '../components/TruncatedDescription';
import { SmartFilterSummary } from '../components/SmartFilterSummary';
import './CollectionsPage.css';

export function CollectionsPage() {
  const navigate = useNavigate();
  const { collectionId: urlCollectionId } = useParams<{ collectionId?: string }>();
  const {
    collections,
    isLoading,
    createCollection,
    deleteCollection,
    getCollectionWithItems,
    refreshCollections,
  } = useCollections();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Separate system collections from user collections
  const systemCollections = collections.filter((c) => c.isSystem);
  const userCollections = collections.filter((c) => !c.isSystem);

  // Computed metadata from items
  const seriesCount = useMemo(() => {
    const seriesIds = new Set(
      collectionItems.filter(i => i.seriesId).map(i => i.seriesId)
    );
    return seriesIds.size;
  }, [collectionItems]);

  const issueCount = useMemo(() => {
    return collectionItems.filter(i => i.fileId).length;
  }, [collectionItems]);

  const lastItemAddedAt = useMemo(() => {
    if (collectionItems.length === 0) return null;
    const timestamps = collectionItems
      .map(i => i.addedAt ? new Date(i.addedAt).getTime() : 0)
      .filter(t => t > 0);
    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps)).toISOString();
  }, [collectionItems]);

  // Helper to get collection cover URL
  const getCollectionCover = useCallback((collection: Collection): string | null => {
    if (!collection.coverType || collection.coverType === 'auto') {
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

  const handleDelete = useCallback(async () => {
    if (!selectedCollection || selectedCollection.isSystem) {
      return;
    }
    if (!confirm('Are you sure you want to delete this collection? This action cannot be undone.')) {
      return;
    }
    await deleteCollection(selectedCollection.id);
    setSelectedCollection(null);
    setCollectionItems([]);
  }, [deleteCollection, selectedCollection]);

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

    if (urlCollectionId) {
      const targetCollection = collections.find(c => c.id === urlCollectionId);
      if (targetCollection && selectedCollection?.id !== urlCollectionId) {
        handleSelectCollection(targetCollection);
        return;
      }
    }

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

  const handleViewDetails = useCallback(() => {
    if (selectedCollection) {
      navigate(`/collection/${selectedCollection.id}`);
    }
  }, [selectedCollection, navigate]);

  // Settings drawer handlers
  const handleSettingsSave = useCallback(async (updates: CollectionUpdates) => {
    if (!selectedCollection) return;

    try {
      const basicUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) basicUpdates.name = updates.name;
      if (updates.deck !== undefined) basicUpdates.deck = updates.deck;
      if (updates.description !== undefined) basicUpdates.description = updates.description;
      if (updates.lockName !== undefined) basicUpdates.lockName = updates.lockName;
      if (updates.lockDeck !== undefined) basicUpdates.lockDeck = updates.lockDeck;
      if (updates.lockDescription !== undefined) basicUpdates.lockDescription = updates.lockDescription;
      if (updates.lockPublisher !== undefined) basicUpdates.lockPublisher = updates.lockPublisher;
      if (updates.lockStartYear !== undefined) basicUpdates.lockStartYear = updates.lockStartYear;
      if (updates.lockEndYear !== undefined) basicUpdates.lockEndYear = updates.lockEndYear;
      if (updates.lockGenres !== undefined) basicUpdates.lockGenres = updates.lockGenres;
      if (updates.overridePublisher !== undefined) basicUpdates.overridePublisher = updates.overridePublisher;
      if (updates.overrideStartYear !== undefined) basicUpdates.overrideStartYear = updates.overrideStartYear;
      if (updates.overrideEndYear !== undefined) basicUpdates.overrideEndYear = updates.overrideEndYear;
      if (updates.overrideGenres !== undefined) basicUpdates.overrideGenres = updates.overrideGenres;
      if (updates.rating !== undefined) basicUpdates.rating = updates.rating;
      if (updates.notes !== undefined) basicUpdates.notes = updates.notes;
      if (updates.visibility !== undefined) basicUpdates.visibility = updates.visibility;
      if (updates.readingMode !== undefined) basicUpdates.readingMode = updates.readingMode;

      if (Object.keys(basicUpdates).length > 0) {
        await apiUpdateCollection(selectedCollection.id, basicUpdates);
      }

      if (updates.coverType !== undefined) {
        const sourceId = updates.coverType === 'series'
          ? updates.coverSeriesId ?? undefined
          : updates.coverType === 'issue'
            ? updates.coverFileId ?? undefined
            : undefined;
        await updateCollectionCover(selectedCollection.id, updates.coverType, sourceId);
      }

      if (updates.isPromoted !== undefined) {
        await toggleCollectionPromotion(selectedCollection.id);
      }

      const data = await getCollectionWithItems(selectedCollection.id);
      if (data) {
        const { items, ...collectionData } = data;
        setSelectedCollection(collectionData as Collection);
        setCollectionItems(items ?? []);
      }

      await refreshCollections();
    } catch (err) {
      console.error('Error saving collection settings:', err);
      throw err;
    }
  }, [selectedCollection, getCollectionWithItems, refreshCollections]);

  const handleRemoveItems = useCallback(async (itemIds: string[]) => {
    if (!selectedCollection) return;

    try {
      const itemsToRemove = collectionItems
        .filter(item => itemIds.includes(item.id))
        .map(item => ({
          seriesId: item.seriesId || undefined,
          fileId: item.fileId || undefined,
        }));

      await apiRemoveFromCollection(selectedCollection.id, itemsToRemove);

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
        {/* Left Panel - Collection List */}
        <div className="collections-list-panel">
          <div className="collections-list-scroll">
            {/* System Collections Section */}
            {systemCollections.length > 0 && (
              <div className="system-collections-section">
                <div className="list-section-header">
                  <h3>Quick Access</h3>
                </div>
                <div className="system-collections-list">
                  {systemCollections.map(collection => (
                    <CollectionListCard
                      key={collection.id}
                      collection={collection}
                      isSelected={selectedCollection?.id === collection.id}
                      coverUrl={getCollectionCover(collection)}
                      onSelect={() => handleSelectCollection(collection)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="collections-divider" />

            {/* User Collections Section */}
            <div className="list-section-header">
              <h3>My Collections</h3>
              <button
                className="create-btn"
                onClick={() => setIsCreating(true)}
              >
                + New
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
                    if (e.key === 'Escape') {
                      setIsCreating(false);
                      setNewName('');
                    }
                  }}
                />
                <div className="form-actions">
                  <button
                    className="btn-primary"
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                  >
                    Create
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setIsCreating(false);
                      setNewName('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* User Collections List */}
            <div className="user-collections-list">
              {userCollections.length === 0 && !isCreating && (
                <div className="list-empty-state">
                  <p>No collections yet</p>
                  <button
                    className="btn-primary"
                    onClick={() => setIsCreating(true)}
                    style={{ marginTop: '8px' }}
                  >
                    Create your first collection
                  </button>
                </div>
              )}

              {userCollections.map(collection => (
                <CollectionListCard
                  key={collection.id}
                  collection={collection}
                  isSelected={selectedCollection?.id === collection.id}
                  coverUrl={getCollectionCover(collection)}
                  onSelect={() => handleSelectCollection(collection)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel - Detail View */}
        <div className="collections-detail-panel">
          {!selectedCollection && (
            <div className="detail-empty">
              <svg className="detail-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              <p>Select a collection to view its details</p>
            </div>
          )}

          {selectedCollection && (
            <div className="detail-content">
              {/* Header */}
              <div className="detail-header">
                <div className="detail-header-top">
                  <div className="detail-title-section">
                    <div className="detail-title-row">
                      <h2>{selectedCollection.name}</h2>
                      {selectedCollection.isSmart && (
                        <span className="detail-smart-badge">
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                          </svg>
                          Smart
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="detail-actions">
                  {!selectedCollection.isSystem && (
                    <button
                      className="detail-action-btn"
                      onClick={() => setIsSettingsOpen(true)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </button>
                  )}
                  <button
                    className="detail-action-btn detail-action-btn--primary"
                    onClick={handleViewDetails}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    View Details
                  </button>
                  {!selectedCollection.isSystem && (
                    <button
                      className="detail-action-btn detail-action-btn--danger"
                      onClick={handleDelete}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Metadata Stats */}
              <div className="detail-stats-section">
                <CollectionMetadataStats
                  seriesCount={seriesCount}
                  issueCount={issueCount}
                  isSmart={selectedCollection.isSmart || false}
                  smartScope={selectedCollection.smartScope as 'series' | 'files' | null}
                  lastItemAddedAt={lastItemAddedAt}
                />
              </div>

              {/* Description */}
              <div className="detail-description-section">
                <TruncatedDescription
                  text={selectedCollection.description}
                  maxLines={3}
                  placeholder="No description"
                />
              </div>

              {/* Smart Filter (if applicable) */}
              {selectedCollection.isSmart && (
                <div className="detail-filter-section">
                  <SmartFilterSummary
                    filterDefinition={selectedCollection.filterDefinition || null}
                    smartScope={selectedCollection.smartScope as 'series' | 'files' | null}
                  />
                </div>
              )}

              <div className="detail-divider" />

              {/* Items Preview */}
              <div className="detail-items-section">
                <div className="items-section-header">
                  <h3>
                    Items
                    <span className="item-count">({collectionItems.length})</span>
                  </h3>
                  {collectionItems.length > 0 && (
                    <Link
                      to={`/collection/${selectedCollection.id}`}
                      className="view-details-link"
                    >
                      View Details Page
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  )}
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

                      const coverUrl = isSeries
                        ? (item.series!.coverHash
                            ? getApiCoverUrl(item.series!.coverHash)
                            : item.series!.coverFileId
                              ? getCoverUrl(item.series!.coverFileId)
                              : item.series!.firstIssueId
                                ? getCoverUrl(item.series!.firstIssueId, item.series!.firstIssueCoverHash)
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
                        ? [item.series!.publisher, item.series!.startYear].filter(Boolean).join(' \u2022 ') || null
                        : isFile && item.file!.seriesId
                        ? 'Issue'
                        : null;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="collection-item-card"
                          onClick={() => {
                            if (item.fileId) {
                              handleOpenFile(item.fileId);
                            } else if (item.seriesId) {
                              handleOpenSeries(item.seriesId);
                            }
                          }}
                        >
                          <div className={`item-cover ${!coverUrl ? 'no-cover' : ''}`}>
                            {coverUrl ? (
                              <img
                                src={coverUrl}
                                alt={title}
                                loading="lazy"
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
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collection Settings Modal */}
      {selectedCollection && (
        <CollectionSettingsModal
          collection={selectedCollection}
          collectionItems={collectionItems}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
          onRemoveItems={handleRemoveItems}
          onReorderItems={handleReorderItems}
          onRefresh={refreshCollections}
        />
      )}
    </div>
  );
}
