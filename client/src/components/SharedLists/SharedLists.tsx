/**
 * Shared Reading Lists Component
 *
 * View and manage shared reading lists.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './SharedLists.css';

// =============================================================================
// Types
// =============================================================================

interface ListItem {
  fileId: string;
  order: number;
  notes?: string;
}

interface SharedList {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  shareCode?: string;
  items: ListItem[];
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface ListOwner {
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '/api/lists';

async function getMyLists(): Promise<{ lists: SharedList[] }> {
  const response = await fetch(API_BASE, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch lists');
  return response.json();
}

// Reserved for detail view
// async function getList(listId: string): Promise<{ list: SharedList }> {
//   const response = await fetch(`${API_BASE}/${listId}`, { credentials: 'include' });
//   if (!response.ok) throw new Error('Failed to fetch list');
//   return response.json();
// }

async function createList(data: {
  name: string;
  description?: string;
  isPublic?: boolean;
  items?: ListItem[];
}): Promise<{ list: SharedList }> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create list');
  return response.json();
}

async function updateList(
  listId: string,
  data: Partial<SharedList>
): Promise<{ list: SharedList }> {
  const response = await fetch(`${API_BASE}/${listId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update list');
  return response.json();
}

async function deleteList(listId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${listId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to delete list');
}

async function regenerateShareCode(listId: string): Promise<{ shareCode: string }> {
  const response = await fetch(`${API_BASE}/${listId}/regenerate-code`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to regenerate code');
  return response.json();
}

async function getPublicLists(page = 1): Promise<{
  lists: (SharedList & { owner: ListOwner })[];
  pagination: { page: number; total: number; totalPages: number };
}> {
  const response = await fetch(`${API_BASE}/browse/public?page=${page}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch public lists');
  return response.json();
}

// Reserved for viewing shared lists by code
// async function getSharedList(shareCode: string): Promise<{
//   list: SharedList;
//   owner: ListOwner;
//   isOwner: boolean;
// }> {
//   const response = await fetch(`${API_BASE}/shared/${shareCode}`, {
//     credentials: 'include',
//   });
//   if (!response.ok) throw new Error('List not found');
//   return response.json();
// }

// =============================================================================
// Component
// =============================================================================

export function SharedLists() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'my-lists' | 'browse'>('my-lists');
  const [myLists, setMyLists] = useState<SharedList[]>([]);
  const [publicLists, setPublicLists] = useState<(SharedList & { owner: ListOwner })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create/Edit state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingList, setEditingList] = useState<SharedList | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', isPublic: false });
  const [saving, setSaving] = useState(false);

  // View state (reserved for detail view)
  // const [selectedList, setSelectedList] = useState<SharedList | null>(null);

  const loadMyLists = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMyLists();
      setMyLists(data.lists);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lists');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadPublicLists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicLists();
      setPublicLists(data.lists);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load public lists');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'my-lists') {
      loadMyLists();
    } else {
      loadPublicLists();
    }
  }, [activeTab, loadMyLists, loadPublicLists]);

  const showMessage = (msg: string, isError = false) => {
    if (isError) {
      setError(msg);
      setSuccess(null);
    } else {
      setSuccess(msg);
      setError(null);
    }
    setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 3000);
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSaving(true);
    try {
      await createList({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        isPublic: formData.isPublic,
      });
      showMessage('List created successfully');
      setShowCreateForm(false);
      setFormData({ name: '', description: '', isPublic: false });
      await loadMyLists();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to create list', true);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingList || !formData.name.trim()) return;

    setSaving(true);
    try {
      await updateList(editingList.id, {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        isPublic: formData.isPublic,
      });
      showMessage('List updated successfully');
      setEditingList(null);
      setFormData({ name: '', description: '', isPublic: false });
      await loadMyLists();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update list', true);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteList = async (list: SharedList) => {
    if (!window.confirm(`Delete "${list.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteList(list.id);
      showMessage('List deleted');
      await loadMyLists();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete list', true);
    }
  };

  const handleRegenerateCode = async (list: SharedList) => {
    if (!window.confirm('Generate a new share code? The old link will stop working.')) {
      return;
    }

    try {
      const { shareCode } = await regenerateShareCode(list.id);
      showMessage('New share code generated');
      setMyLists(myLists.map((l) => (l.id === list.id ? { ...l, shareCode } : l)));
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to regenerate code', true);
    }
  };

  const handleEditClick = (list: SharedList) => {
    setEditingList(list);
    setFormData({
      name: list.name,
      description: list.description || '',
      isPublic: list.isPublic,
    });
    setShowCreateForm(false);
  };

  const handleCancelEdit = () => {
    setEditingList(null);
    setShowCreateForm(false);
    setFormData({ name: '', description: '', isPublic: false });
  };

  const copyShareLink = async (shareCode: string) => {
    const url = `${window.location.origin}/lists/shared/${shareCode}`;
    try {
      await navigator.clipboard.writeText(url);
      showMessage('Link copied to clipboard');
    } catch {
      showMessage('Failed to copy link', true);
    }
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString();
  };

  if (!isAuthenticated && activeTab === 'my-lists') {
    return (
      <div className="shared-lists">
        <div className="shared-lists-header">
          <h2>Reading Lists</h2>
          <div className="tabs">
            <button
              className="tab active"
              onClick={() => setActiveTab('my-lists')}
            >
              My Lists
            </button>
            <button
              className="tab"
              onClick={() => setActiveTab('browse')}
            >
              Browse Public
            </button>
          </div>
        </div>
        <div className="login-prompt">
          <p>Sign in to create and manage your reading lists.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shared-lists">
      <div className="shared-lists-header">
        <h2>Reading Lists</h2>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'my-lists' ? 'active' : ''}`}
            onClick={() => setActiveTab('my-lists')}
          >
            My Lists
          </button>
          <button
            className={`tab ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => setActiveTab('browse')}
          >
            Browse Public
          </button>
        </div>
      </div>

      {error && <div className="lists-error">{error}</div>}
      {success && <div className="lists-success">{success}</div>}

      {activeTab === 'my-lists' && (
        <div className="my-lists-section">
          {/* Create/Edit Form */}
          {(showCreateForm || editingList) && (
            <form
              className="list-form"
              onSubmit={editingList ? handleUpdateList : handleCreateList}
            >
              <h3>{editingList ? 'Edit List' : 'Create New List'}</h3>
              <div className="form-group">
                <label htmlFor="listName">Name</label>
                <input
                  id="listName"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Reading List"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="listDescription">Description</label>
                <textarea
                  id="listDescription"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                  />
                  <span>Make list public</span>
                </label>
                <span className="form-hint">
                  Public lists can be viewed by anyone. Private lists use a secret link.
                </span>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingList ? 'Update List' : 'Create List'}
                </button>
                <button type="button" className="btn-ghost" onClick={handleCancelEdit}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Create Button */}
          {!showCreateForm && !editingList && (
            <button
              className="btn-create-list"
              onClick={() => setShowCreateForm(true)}
            >
              + Create New List
            </button>
          )}

          {/* Lists */}
          {loading ? (
            <div className="lists-loading">
              <div className="spinner-small" />
              <span>Loading lists...</span>
            </div>
          ) : myLists.length === 0 ? (
            <div className="lists-empty">
              <p>You haven't created any reading lists yet.</p>
            </div>
          ) : (
            <div className="lists-grid">
              {myLists.map((list) => (
                <div key={list.id} className="list-card">
                  <div className="list-card-header">
                    <h4>{list.name}</h4>
                    <span className={`visibility-badge ${list.isPublic ? 'public' : 'private'}`}>
                      {list.isPublic ? 'Public' : 'Private'}
                    </span>
                  </div>
                  {list.description && (
                    <p className="list-description">{list.description}</p>
                  )}
                  <div className="list-meta">
                    <span>{list.itemCount || 0} items</span>
                    <span>Updated {formatDate(list.updatedAt)}</span>
                  </div>
                  <div className="list-actions">
                    <button
                      className="btn-ghost small"
                      onClick={() => handleEditClick(list)}
                    >
                      Edit
                    </button>
                    {!list.isPublic && list.shareCode && (
                      <button
                        className="btn-ghost small"
                        onClick={() => copyShareLink(list.shareCode!)}
                      >
                        Copy Link
                      </button>
                    )}
                    {!list.isPublic && (
                      <button
                        className="btn-ghost small"
                        onClick={() => handleRegenerateCode(list)}
                      >
                        New Code
                      </button>
                    )}
                    <button
                      className="btn-ghost small danger"
                      onClick={() => handleDeleteList(list)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'browse' && (
        <div className="browse-section">
          {loading ? (
            <div className="lists-loading">
              <div className="spinner-small" />
              <span>Loading public lists...</span>
            </div>
          ) : publicLists.length === 0 ? (
            <div className="lists-empty">
              <p>No public reading lists available.</p>
            </div>
          ) : (
            <div className="lists-grid">
              {publicLists.map((list) => (
                <div key={list.id} className="list-card">
                  <div className="list-card-header">
                    <h4>{list.name}</h4>
                  </div>
                  {list.description && (
                    <p className="list-description">{list.description}</p>
                  )}
                  <div className="list-owner">
                    by {list.owner.displayName || list.owner.username}
                  </div>
                  <div className="list-meta">
                    <span>{list.itemCount || 0} items</span>
                    <span>Updated {formatDate(list.updatedAt)}</span>
                  </div>
                  <div className="list-actions">
                    <button
                      className="btn-primary small"
                      onClick={() => navigate(`/lists/${list.id}`)}
                    >
                      View List
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
