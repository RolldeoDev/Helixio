/**
 * User Management Component
 *
 * Admin interface for managing users.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './UserManagement.css';

// =============================================================================
// Types
// =============================================================================

interface User {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  role: 'admin' | 'user' | 'guest';
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
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
// Component
// =============================================================================

export function UserManagement() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password.trim()) {
      showMessage('Username and password are required', true);
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
      showMessage('User created successfully');
      setShowCreateForm(false);
      setFormData({ username: '', password: '', email: '', displayName: '', role: 'user' });
      await loadUsers();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to create user', true);
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (user: User, newRole: string) => {
    try {
      await updateUserRole(user.id, newRole);
      showMessage(`${user.username}'s role updated to ${newRole}`);
      await loadUsers();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update role', true);
    }
  };

  const handleToggleActive = async (user: User) => {
    const action = user.isActive ? 'disable' : 'enable';
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} user "${user.username}"?`)) {
      return;
    }

    try {
      await updateUserActive(user.id, !user.isActive);
      showMessage(`User ${action}d successfully`);
      await loadUsers();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update user', true);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteUser(user.id);
      showMessage('User deleted');
      await loadUsers();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete user', true);
    }
  };

  const formatDate = (date?: string): string => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString();
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

      {error && <div className="management-error">{error}</div>}
      {success && <div className="management-success">{success}</div>}

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
                <th>Status</th>
                <th>Created</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={!user.isActive ? 'inactive' : ''}>
                  <td>
                    <div className="user-info">
                      <span className="user-name">
                        {user.displayName || user.username}
                        {user.id === currentUser?.id && (
                          <span className="you-badge">You</span>
                        )}
                      </span>
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
                    <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                      {user.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>{formatDate(user.lastLogin)}</td>
                  <td>
                    {user.id !== currentUser?.id && (
                      <div className="user-actions">
                        <button
                          className="btn-ghost small"
                          onClick={() => handleToggleActive(user)}
                        >
                          {user.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className="btn-ghost small danger"
                          onClick={() => handleDeleteUser(user)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
