/**
 * CollectionsPage Component
 *
 * Full-page view for managing collections and reading lists.
 * Provides a more spacious layout than the sidebar for managing items.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollections, Collection, ReadingList } from '../contexts/CollectionsContext';
import './CollectionsPage.css';

type TabType = 'collections' | 'reading-lists';

export function CollectionsPage() {
  const navigate = useNavigate();
  const {
    collections,
    readingLists,
    createCollection,
    createReadingList,
    deleteCollection,
    deleteReadingList,
    updateCollection,
    updateReadingList,
  } = useCollections();

  const [activeTab, setActiveTab] = useState<TabType>('collections');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [selectedReadingList, setSelectedReadingList] = useState<ReadingList | null>(null);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;

    if (activeTab === 'collections') {
      createCollection(newName.trim());
    } else {
      createReadingList(newName.trim());
    }

    setNewName('');
    setIsCreating(false);
  }, [newName, activeTab, createCollection, createReadingList]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm('Are you sure you want to delete this? This action cannot be undone.')) return;

    if (activeTab === 'collections') {
      deleteCollection(id);
      if (selectedCollection?.id === id) {
        setSelectedCollection(null);
      }
    } else {
      deleteReadingList(id);
      if (selectedReadingList?.id === id) {
        setSelectedReadingList(null);
      }
    }
  }, [activeTab, deleteCollection, deleteReadingList, selectedCollection, selectedReadingList]);

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editingName.trim()) return;

    if (activeTab === 'collections') {
      updateCollection(editingId, { name: editingName.trim() });
    } else {
      updateReadingList(editingId, { name: editingName.trim() });
    }

    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, activeTab, updateCollection, updateReadingList]);

  const handleSelectCollection = (collection: Collection) => {
    setSelectedCollection(collection);
    setSelectedReadingList(null);
  };

  const handleSelectReadingList = (list: ReadingList) => {
    setSelectedReadingList(list);
    setSelectedCollection(null);
  };

  const getCompletedCount = (list: ReadingList): number => {
    return list.items.filter(item => item.completed).length;
  };

  const handleOpenFile = (fileId: string) => {
    navigate(`/read/${fileId}`);
  };

  return (
    <div className="collections-page">
      <div className="collections-page-header">
        <h1>Collections</h1>
        <p className="collections-subtitle">
          Organize your comics into collections and create reading lists to track your progress.
        </p>
      </div>

      {/* Tabs */}
      <div className="collections-tabs">
        <button
          className={`tab-btn ${activeTab === 'collections' ? 'active' : ''}`}
          onClick={() => setActiveTab('collections')}
        >
          Collections
          <span className="tab-count">{collections.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'reading-lists' ? 'active' : ''}`}
          onClick={() => setActiveTab('reading-lists')}
        >
          Reading Lists
          <span className="tab-count">{readingLists.length}</span>
        </button>
      </div>

      <div className="collections-layout">
        {/* Left Panel - List */}
        <div className="collections-list-panel">
          <div className="panel-header">
            <h2>{activeTab === 'collections' ? 'Collections' : 'Reading Lists'}</h2>
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
                placeholder={activeTab === 'collections' ? 'Collection name...' : 'Reading list name...'}
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

          {/* Collections List */}
          {activeTab === 'collections' && (
            <div className="items-list">
              {collections.length === 0 && !isCreating && (
                <div className="empty-state">
                  <p>No collections yet</p>
                  <button className="btn-primary" onClick={() => setIsCreating(true)}>
                    Create your first collection
                  </button>
                </div>
              )}

              {collections.map(collection => (
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
                        <span className="item-count">{collection.fileIds.length} items</span>
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
                            handleDelete(collection.id);
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
          )}

          {/* Reading Lists */}
          {activeTab === 'reading-lists' && (
            <div className="items-list">
              {readingLists.length === 0 && !isCreating && (
                <div className="empty-state">
                  <p>No reading lists yet</p>
                  <button className="btn-primary" onClick={() => setIsCreating(true)}>
                    Create your first reading list
                  </button>
                </div>
              )}

              {readingLists.map(list => {
                const completedCount = getCompletedCount(list);
                const totalCount = list.items.length;
                const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

                return (
                  <div
                    key={list.id}
                    className={`list-item ${selectedReadingList?.id === list.id ? 'selected' : ''}`}
                    onClick={() => handleSelectReadingList(list)}
                  >
                    {editingId === list.id ? (
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
                            <line x1="8" y1="6" x2="21" y2="6" />
                            <line x1="8" y1="12" x2="21" y2="12" />
                            <line x1="8" y1="18" x2="21" y2="18" />
                            <line x1="3" y1="6" x2="3.01" y2="6" />
                            <line x1="3" y1="12" x2="3.01" y2="12" />
                            <line x1="3" y1="18" x2="3.01" y2="18" />
                          </svg>
                        </div>
                        <div className="item-info">
                          <span className="item-name">{list.name}</span>
                          <div className="item-progress">
                            <span className="progress-text">{completedCount}/{totalCount}</span>
                            {totalCount > 0 && (
                              <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }} />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="item-actions">
                          <button
                            className="action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(list.id, list.name);
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
                              handleDelete(list.id);
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
          )}
        </div>

        {/* Right Panel - Detail View */}
        <div className="collections-detail-panel">
          {!selectedCollection && !selectedReadingList && (
            <div className="detail-empty">
              <p>Select a {activeTab === 'collections' ? 'collection' : 'reading list'} to view its contents</p>
            </div>
          )}

          {selectedCollection && (
            <div className="detail-content">
              <h2>{selectedCollection.name}</h2>
              <p className="detail-count">{selectedCollection.fileIds.length} items</p>

              {selectedCollection.fileIds.length === 0 ? (
                <div className="detail-empty-items">
                  <p>This collection is empty.</p>
                  <p className="hint">Add comics to this collection from the library view.</p>
                </div>
              ) : (
                <div className="detail-items">
                  {/* TODO: Fetch and display file details */}
                  <p className="placeholder">File details coming soon...</p>
                </div>
              )}
            </div>
          )}

          {selectedReadingList && (
            <div className="detail-content">
              <h2>{selectedReadingList.name}</h2>
              <p className="detail-count">
                {getCompletedCount(selectedReadingList)}/{selectedReadingList.items.length} completed
              </p>

              {selectedReadingList.items.length === 0 ? (
                <div className="detail-empty-items">
                  <p>This reading list is empty.</p>
                  <p className="hint">Add comics to this reading list from the library view.</p>
                </div>
              ) : (
                <div className="detail-items reading-list-items">
                  {selectedReadingList.items.map((item, index) => (
                    <div
                      key={item.fileId}
                      className={`reading-list-item ${item.completed ? 'completed' : ''}`}
                      onClick={() => handleOpenFile(item.fileId)}
                    >
                      <span className="item-order">{index + 1}</span>
                      <span className="item-id">{item.fileId.slice(0, 8)}...</span>
                      {item.completed && (
                        <span className="completed-badge">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
