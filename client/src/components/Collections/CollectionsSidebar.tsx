/**
 * Collections Sidebar Component
 *
 * Displays collections and reading lists in the sidebar.
 * Allows creating, editing, and navigating to collections.
 */

import { useState, useCallback } from 'react';
import { useCollections, Collection, ReadingList } from '../../contexts/CollectionsContext';
import './Collections.css';

interface CollectionsSidebarProps {
  onSelectCollection?: (collection: Collection) => void;
  onSelectReadingList?: (list: ReadingList) => void;
  selectedCollectionId?: string;
  selectedReadingListId?: string;
}

export function CollectionsSidebar({
  onSelectCollection,
  onSelectReadingList,
  selectedCollectionId,
  selectedReadingListId,
}: CollectionsSidebarProps) {
  const {
    collections,
    readingLists,
    createCollection,
    createReadingList,
    deleteCollection,
    deleteReadingList,
  } = useCollections();

  const [isCreating, setIsCreating] = useState<'collection' | 'reading-list' | null>(null);
  const [newName, setNewName] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    collections: true,
    readingLists: true,
  });

  const toggleSection = useCallback((section: 'collections' | 'readingLists') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  const handleCreate = useCallback(() => {
    if (!newName.trim() || !isCreating) return;

    if (isCreating === 'collection') {
      createCollection(newName.trim());
    } else {
      createReadingList(newName.trim());
    }

    setNewName('');
    setIsCreating(null);
  }, [newName, isCreating, createCollection, createReadingList]);

  const handleDelete = useCallback((type: 'collection' | 'reading-list', id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this?')) return;

    if (type === 'collection') {
      deleteCollection(id);
    } else {
      deleteReadingList(id);
    }
  }, [deleteCollection, deleteReadingList]);

  const getCompletedCount = (list: ReadingList): number => {
    return list.items.filter(item => item.completed).length;
  };

  return (
    <div className="collections-sidebar">
      {/* Collections Section */}
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
          <span className="section-count">{collections.length}</span>
          <button
            className="section-add-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsCreating('collection');
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
            {isCreating === 'collection' && (
              <div className="collection-create-form">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Collection name..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') setIsCreating(null);
                  }}
                />
                <button className="create-btn" onClick={handleCreate} disabled={!newName.trim()}>
                  Create
                </button>
                <button className="cancel-btn" onClick={() => setIsCreating(null)}>
                  Cancel
                </button>
              </div>
            )}

            {collections.length === 0 && !isCreating && (
              <div className="empty-message">No collections yet</div>
            )}

            {collections.map(collection => (
              <div
                key={collection.id}
                className={`collection-item ${selectedCollectionId === collection.id ? 'selected' : ''}`}
                onClick={() => onSelectCollection?.(collection)}
              >
                <div className="collection-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="collection-info">
                  <span className="collection-name">{collection.name}</span>
                  <span className="collection-count">{collection.fileIds.length} items</span>
                </div>
                <button
                  className="collection-delete-btn"
                  onClick={(e) => handleDelete('collection', collection.id, e)}
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

      {/* Reading Lists Section */}
      <div className="collections-section">
        <div
          className="collections-section-header"
          onClick={() => toggleSection('readingLists')}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`section-chevron ${expandedSections.readingLists ? 'expanded' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="section-title">Reading Lists</span>
          <span className="section-count">{readingLists.length}</span>
          <button
            className="section-add-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsCreating('reading-list');
              setNewName('');
            }}
            title="Create reading list"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {expandedSections.readingLists && (
          <div className="collections-list">
            {isCreating === 'reading-list' && (
              <div className="collection-create-form">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Reading list name..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') setIsCreating(null);
                  }}
                />
                <button className="create-btn" onClick={handleCreate} disabled={!newName.trim()}>
                  Create
                </button>
                <button className="cancel-btn" onClick={() => setIsCreating(null)}>
                  Cancel
                </button>
              </div>
            )}

            {readingLists.length === 0 && !isCreating && (
              <div className="empty-message">No reading lists yet</div>
            )}

            {readingLists.map(list => {
              const completedCount = getCompletedCount(list);
              const totalCount = list.items.length;
              const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

              return (
                <div
                  key={list.id}
                  className={`collection-item reading-list ${selectedReadingListId === list.id ? 'selected' : ''}`}
                  onClick={() => onSelectReadingList?.(list)}
                >
                  <div className="collection-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                  </div>
                  <div className="collection-info">
                    <span className="collection-name">{list.name}</span>
                    <div className="reading-list-progress">
                      <span className="progress-text">{completedCount}/{totalCount}</span>
                      {totalCount > 0 && (
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className="collection-delete-btn"
                    onClick={(e) => handleDelete('reading-list', list.id, e)}
                    title="Delete reading list"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
