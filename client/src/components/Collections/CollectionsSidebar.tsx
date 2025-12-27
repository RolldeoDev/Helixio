/**
 * Collections Sidebar Component
 *
 * Displays collections in the sidebar with a Quick Access section
 * for system collections (Favorites, Want to Read).
 */

import { useState, useCallback } from 'react';
import { useCollections, Collection } from '../../contexts/CollectionsContext';
import { CollectionIcon } from '../CollectionIcon';
import './Collections.css';

interface CollectionsSidebarProps {
  onSelectCollection?: (collection: Collection) => void;
  selectedCollectionId?: string;
}

export function CollectionsSidebar({
  onSelectCollection,
  selectedCollectionId,
}: CollectionsSidebarProps) {
  const {
    collections,
    isLoading,
    createCollection,
    deleteCollection,
  } = useCollections();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    quickAccess: true,
    collections: true,
  });

  const toggleSection = useCallback((section: 'quickAccess' | 'collections') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;

    await createCollection(newName.trim());
    setNewName('');
    setIsCreating(false);
  }, [newName, createCollection]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this collection?')) return;
    await deleteCollection(id);
  }, [deleteCollection]);

  // Separate system collections (Quick Access) from user collections
  const systemCollections = collections.filter((c) => c.isSystem);
  const userCollections = collections.filter((c) => !c.isSystem);

  if (isLoading) {
    return (
      <div className="collections-sidebar">
        <div className="collections-loading">Loading collections...</div>
      </div>
    );
  }

  return (
    <div className="collections-sidebar">
      {/* Quick Access Section (System Collections) */}
      {systemCollections.length > 0 && (
        <div className="collections-section">
          <div
            className="collections-section-header"
            onClick={() => toggleSection('quickAccess')}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`section-chevron ${expandedSections.quickAccess ? 'expanded' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="section-title">Quick Access</span>
          </div>

          {expandedSections.quickAccess && (
            <div className="collections-list">
              {systemCollections.map(collection => (
                <div
                  key={collection.id}
                  className={`collection-item system-collection ${selectedCollectionId === collection.id ? 'selected' : ''}`}
                  onClick={() => onSelectCollection?.(collection)}
                >
                  <div className="collection-icon system-icon">
                    <CollectionIcon size={16} />
                  </div>
                  <div className="collection-info">
                    <span className="collection-name">{collection.name}</span>
                    <span className="collection-count">{collection.itemCount ?? 0} items</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* User Collections Section */}
      <div className="collections-section">
        <div
          className="collections-section-header"
          onClick={() => toggleSection('collections')}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`section-chevron ${expandedSections.collections ? 'expanded' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="section-title">Collections</span>
          <span className="section-count">{userCollections.length}</span>
          <button
            className="section-add-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsCreating(true);
              setNewName('');
            }}
            title="Create collection"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {expandedSections.collections && (
          <div className="collections-list">
            {isCreating && (
              <div className="collection-create-form">
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
                <button className="create-btn" onClick={handleCreate} disabled={!newName.trim()}>
                  Create
                </button>
                <button className="cancel-btn" onClick={() => setIsCreating(false)}>
                  Cancel
                </button>
              </div>
            )}

            {userCollections.length === 0 && !isCreating && (
              <div className="empty-message">No collections yet</div>
            )}

            {userCollections.map(collection => (
              <div
                key={collection.id}
                className={`collection-item ${selectedCollectionId === collection.id ? 'selected' : ''}`}
                onClick={() => onSelectCollection?.(collection)}
              >
                <div className="collection-icon">
                  <CollectionIcon size={16} />
                </div>
                <div className="collection-info">
                  <span className="collection-name">{collection.name}</span>
                  <span className="collection-count">{collection.itemCount ?? 0} items</span>
                </div>
                <button
                  className="collection-delete-btn"
                  onClick={(e) => handleDelete(collection.id, e)}
                  title="Delete collection"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
