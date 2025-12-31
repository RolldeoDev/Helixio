/**
 * User Management Component
 *
 * Admin interface for managing users with permissions, library access, and password reset.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmModal } from '../ConfirmModal';
import { useApiToast } from '../../hooks';
import { PermissionBadges } from './PermissionBadge';
import { PermissionEditModal } from './PermissionEditModal';
import './UserManagement.css';

// =============================================================================
// Types
// =============================================================================

interface User {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  role: 'admin' | 'user' | 'guest';
  isActive: boolean;
  permissions: string;
  createdAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '/api/auth';

async function getUsers(): Promise<{ users: User[] }> {
  const response = await fetch(`${API_BASE}/users`, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch users');
  return response.json();
}

async function createUser(data: {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
  role?: string;
}): Promise<{ user: User }> {
  const response = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create user');
  }
  return response.json();
}

async function updateUserRole(userId: string, role: string): Promise<{ user: User }> {
  const response = await fetch(`${API_BASE}/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ role }),
  });
  if (!response.ok) throw new Error('Failed to update user role');
  return response.json();
}

async function updateUserActive(userId: string, isActive: boolean): Promise<{ user: User }> {
  const response = await fetch(`${API_BASE}/users/${userId}/active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ isActive }),
  });
  if (!response.ok) throw new Error('Failed to update user status');
  return response.json();
}

async function deleteUser(userId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/users/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to delete user');
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format relative time for last active display
 */
function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 5) return 'Online';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Check if user is online (active in last 5 minutes)
 */
function isOnline(lastActiveAt: string | null | undefined): boolean {
  if (!lastActiveAt) return false;
  const diffMs = new Date().getTime() - new Date(lastActiveAt).getTime();
  return diffMs < 5 * 60 * 1000; // 5 minutes
}

/**
 * Parse permissions JSON to object
 */
function parsePermissions(permsJson: string): Record<string, boolean> {
  try {
    return JSON.parse(permsJson || '{}');
  } catch {
    return {};
  }
}

// =============================================================================
// Component
// =============================================================================

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const confirm = useConfirmModal();
  const { addToast } = useApiToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create user state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    displayName: '',
    role: 'user',
  });
  const [creating, setCreating] = useState(false);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getUsers();
      setUsers(data.users);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password.trim()) {
      addToast('error', 'Username and password are required');
      return;
    }

    setCreating(true);
    try {
      await createUser({
        username: formData.username.trim(),
        password: formData.password,
        email: formData.email.trim() || undefined,
        displayName: formData.displayName.trim() || undefined,
        role: formData.role,
      });
      addToast('success', 'User created successfully');
      setShowCreateForm(false);
      setFormData({ username: '', password: '', email: '', displayName: '', role: 'user' });
      await loadUsers();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (user: User, newRole: string) => {
    try {
      await updateUserRole(user.id, newRole);
      addToast('success', `${user.username}'s role updated to ${newRole}`);
      await loadUsers();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleToggleActive = async (user: User) => {
    const action = user.isActive ? 'disable' : 'enable';
    const confirmed = await confirm({
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      message: `${action.charAt(0).toUpperCase() + action.slice(1)} user "${user.username}"?`,
      confirmText: action.charAt(0).toUpperCase() + action.slice(1),
      variant: user.isActive ? 'warning' : 'default',
    });
    if (!confirmed) return;

    try {
      await updateUserActive(user.id, !user.isActive);
      addToast('success', `User ${action}d successfully`);
      await loadUsers();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmed = await confirm({
      title: 'Delete User',
      message: `Delete user "${user.username}"? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteUser(user.id);
      addToast('success', 'User deleted');
      await loadUsers();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
  };

  const handleSaveUser = (updatedUser: User) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
    );
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="user-management">
        <div className="access-denied">
          <h2>Access Denied</h2>
          <p>You must be an administrator to manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-management">
      <div className="management-header">
        <h2>User Management</h2>
        <button
          className="btn-primary"
          onClick={() => setShowCreateForm(true)}
        >
          + Add User
        </button>
      </div>

      {loadError && <div className="management-error">{loadError}</div>}

      {/* Create User Form */}
      {showCreateForm && (
        <form className="create-user-form" onSubmit={handleCreateUser}>
          <h3>Create New User</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="username">Username *</label>
              <input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password *</label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="displayName">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="role">Role</label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="guest">Guest</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create User'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* User List */}
      {loading ? (
        <div className="users-loading">
          <div className="spinner-small" />
          <span>Loading users...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="users-empty">
          <p>No users found.</p>
        </div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Permissions</th>
                <th>Status</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={!user.isActive ? 'inactive' : ''}>
                  <td>
                    <div className="user-info">
                      <div className="user-name-row">
                        <span className={`online-indicator ${isOnline(user.lastActiveAt) ? 'online' : 'offline'}`} />
                        <span className="user-name">
                          {user.displayName || user.username}
                          {user.id === currentUser?.id && (
                            <span className="you-badge">You</span>
                          )}
                        </span>
                      </div>
                      <span className="user-username">@{user.username}</span>
                      {user.email && <span className="user-email">{user.email}</span>}
                    </div>
                  </td>
                  <td>
                    {user.id === currentUser?.id ? (
                      <span className={`role-badge ${user.role}`}>{user.role}</span>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user, e.target.value)}
                        className="role-select"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="guest">Guest</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <PermissionBadges
                      permissions={parsePermissions(user.permissions)}
                      activeOnly
                      compact
                      isAdmin={user.role === 'admin'}
                    />
                  </td>
                  <td>
                    <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                      {user.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <span className={`last-active ${isOnline(user.lastActiveAt) ? 'online' : ''}`}>
                      {formatRelativeTime(user.lastActiveAt)}
                    </span>
                  </td>
                  <td>
                    <div className="user-actions">
                      <button
                        className="btn-icon"
                        onClick={() => handleEditUser(user)}
                        title="Edit permissions"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      {user.id !== currentUser?.id && (
                        <>
                          <button
                            className="btn-icon"
                            onClick={() => handleToggleActive(user)}
                            title={user.isActive ? 'Disable user' : 'Enable user'}
                          >
                            {user.isActive ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                              </svg>
                            )}
                          </button>
                          <button
                            className="btn-icon danger"
                            onClick={() => handleDeleteUser(user)}
                            title="Delete user"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3,6 5,6 21,6" />
                              <path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <PermissionEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleSaveUser}
        />
      )}
    </div>
  );
}
