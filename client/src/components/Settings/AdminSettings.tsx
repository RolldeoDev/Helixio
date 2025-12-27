/**
 * Admin Settings Component
 *
 * User management, registration settings, and admin controls.
 * Only visible to admin users.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ToggleSwitch } from '../ToggleSwitch';
import { useApiToast } from '../../hooks';
import { useConfirmModal } from '../ConfirmModal';
import './AdminSettings.css';

interface User {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: 'admin' | 'user';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface LibraryAccess {
  libraryId: string;
  libraryName: string;
  hasAccess: boolean;
}

interface AppSettings {
  allowOpenRegistration: boolean;
}

export function AdminSettings() {
  const { user: currentUser } = useAuth();

  // App settings state
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // User management state
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'frozen'>('all');

  // Selected user state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userLibraryAccess, setUserLibraryAccess] = useState<LibraryAccess[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);

  const { addToast } = useApiToast();
  const confirm = useConfirmModal();

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  // Load app settings
  const loadSettings = async () => {
    try {
      const response = await fetch('/api/auth/settings', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch {
      // Settings not available yet
      setSettings({ allowOpenRegistration: false });
    }
  };

  // Load users
  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/auth/users', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else {
        addToast('error', 'Failed to load users');
      }
    } catch {
      addToast('error', 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  // Toggle registration
  const handleToggleRegistration = async () => {
    if (!settings) return;

    setSavingSettings(true);
    try {
      const response = await fetch('/api/auth/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          allowOpenRegistration: !settings.allowOpenRegistration,
        }),
      });

      if (response.ok) {
        setSettings({ ...settings, allowOpenRegistration: !settings.allowOpenRegistration });
        addToast('success',
          settings.allowOpenRegistration
            ? 'Open registration disabled'
            : 'Open registration enabled'
        );
      } else {
        addToast('error', 'Failed to update settings');
      }
    } catch {
      addToast('error', 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // Load user library access
  const handleSelectUser = async (user: User) => {
    setSelectedUser(user);
    setLoadingAccess(true);
    try {
      const response = await fetch(`/api/auth/users/${user.id}/library-access`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setUserLibraryAccess(data.libraries || []);
      }
    } catch {
      setUserLibraryAccess([]);
    } finally {
      setLoadingAccess(false);
    }
  };

  // Toggle library access
  const handleToggleLibraryAccess = async (libraryId: string, hasAccess: boolean) => {
    if (!selectedUser) return;

    try {
      const response = await fetch(`/api/auth/users/${selectedUser.id}/library-access/${libraryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ hasAccess: !hasAccess }),
      });

      if (response.ok) {
        setUserLibraryAccess(prev =>
          prev.map(lib =>
            lib.libraryId === libraryId ? { ...lib, hasAccess: !hasAccess } : lib
          )
        );
        addToast('success', `Library access ${hasAccess ? 'revoked' : 'granted'}`);
      } else {
        addToast('error', 'Failed to update library access');
      }
    } catch {
      addToast('error', 'Failed to update library access');
    }
  };

  // Freeze/unfreeze user
  const handleToggleFreeze = async (user: User) => {
    const action = user.isActive ? 'freeze' : 'unfreeze';
    if (user.isActive) {
      const confirmed = await confirm({
        title: 'Freeze User',
        message: `Freeze user "${user.username}"? This will log them out and prevent login.`,
        confirmText: 'Freeze',
        variant: 'warning',
      });
      if (!confirmed) return;
    }

    try {
      const response = await fetch(`/api/auth/users/${user.id}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        setUsers(prev =>
          prev.map(u =>
            u.id === user.id ? { ...u, isActive: !user.isActive } : u
          )
        );
        if (selectedUser?.id === user.id) {
          setSelectedUser({ ...selectedUser, isActive: !user.isActive });
        }
        addToast('success', user.isActive ? 'User frozen' : 'User unfrozen');
      } else {
        addToast('error', `Failed to ${action} user`);
      }
    } catch {
      addToast('error', `Failed to ${action} user`);
    }
  };

  // Change user role
  const handleToggleAdmin = async (user: User) => {
    if (user.id === currentUser?.id) {
      addToast('error', 'Cannot change your own role');
      return;
    }

    const newRole = user.role === 'admin' ? 'user' : 'admin';
    if (newRole === 'admin') {
      const confirmed = await confirm({
        title: 'Grant Admin Access',
        message: `Make "${user.username}" an admin? They will have full access.`,
        confirmText: 'Grant Admin',
        variant: 'warning',
      });
      if (!confirmed) return;
    }

    try {
      const response = await fetch(`/api/auth/users/${user.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        setUsers(prev =>
          prev.map(u =>
            u.id === user.id ? { ...u, role: newRole } : u
          )
        );
        if (selectedUser?.id === user.id) {
          setSelectedUser({ ...selectedUser, role: newRole });
        }
        addToast('success', `User is now ${newRole === 'admin' ? 'an admin' : 'a regular user'}`);
      } else {
        addToast('error', 'Failed to change role');
      }
    } catch {
      addToast('error', 'Failed to change role');
    }
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        user.username.toLowerCase().includes(query) ||
        user.displayName?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Role filter
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;

    // Status filter
    if (statusFilter === 'active' && !user.isActive) return false;
    if (statusFilter === 'frozen' && user.isActive) return false;

    return true;
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="admin-settings">
      <h2>Administration</h2>

      {/* Registration Settings */}
      <div className="admin-section">
        <div className="section-header">
          <h3>Registration</h3>
        </div>
        <div className="setting-row">
          <ToggleSwitch
            checked={settings?.allowOpenRegistration || false}
            onChange={handleToggleRegistration}
            disabled={savingSettings || !settings}
            label="Open Registration"
            description="Allow new users to create accounts from the login page"
          />
        </div>
        <p className="setting-note">
          New users will have no library access by default. You must grant access individually.
        </p>
      </div>

      {/* User Management */}
      <div className="admin-section">
        <div className="section-header">
          <h3>User Management</h3>
          <span className="user-count">{users.length} users</span>
        </div>

        {/* Search and Filters */}
        <div className="user-filters">
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="user-search"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'user')}
            className="filter-select"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admins</option>
            <option value="user">Users</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'frozen')}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="frozen">Frozen</option>
          </select>
        </div>

        {/* User List */}
        <div className="user-list">
          {loadingUsers ? (
            <div className="loading-users">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="no-users">No users found</div>
          ) : (
            filteredUsers.map(user => (
              <div
                key={user.id}
                className={`user-row ${selectedUser?.id === user.id ? 'selected' : ''} ${!user.isActive ? 'frozen' : ''}`}
                onClick={() => handleSelectUser(user)}
              >
                <div className="user-info">
                  <div className="user-name">
                    <span className="username">{user.username}</span>
                    {user.displayName && (
                      <span className="display-name">({user.displayName})</span>
                    )}
                    {user.role === 'admin' && <span className="admin-badge">Admin</span>}
                    {!user.isActive && <span className="frozen-badge">Frozen</span>}
                  </div>
                  <div className="user-meta">
                    {user.email && <span className="user-email">{user.email}</span>}
                    <span className="user-login">
                      Last login: {formatDate(user.lastLoginAt)}
                    </span>
                  </div>
                </div>
                <div className="user-actions" onClick={(e) => e.stopPropagation()}>
                  {user.id !== currentUser?.id && (
                    <>
                      <button
                        className={`action-btn ${user.isActive ? 'freeze' : 'unfreeze'}`}
                        onClick={() => handleToggleFreeze(user)}
                        title={user.isActive ? 'Freeze user' : 'Unfreeze user'}
                      >
                        {user.isActive ? 'Freeze' : 'Unfreeze'}
                      </button>
                      <button
                        className="action-btn role"
                        onClick={() => handleToggleAdmin(user)}
                        title={user.role === 'admin' ? 'Remove admin' : 'Make admin'}
                      >
                        {user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* User Details Panel */}
      {selectedUser && (
        <div className="admin-section user-details">
          <div className="section-header">
            <h3>Library Access for {selectedUser.username}</h3>
            <button
              className="close-btn"
              onClick={() => setSelectedUser(null)}
            >
              Close
            </button>
          </div>

          {loadingAccess ? (
            <div className="loading-access">Loading libraries...</div>
          ) : userLibraryAccess.length === 0 ? (
            <div className="no-libraries">No libraries configured</div>
          ) : (
            <div className="library-access-list">
              {userLibraryAccess.map(lib => (
                <div key={lib.libraryId} className="library-access-row">
                  <span className="library-name">{lib.libraryName}</span>
                  <ToggleSwitch
                    checked={lib.hasAccess}
                    onChange={() => handleToggleLibraryAccess(lib.libraryId, lib.hasAccess)}
                    size="small"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="user-details-info">
            <div className="detail-row">
              <span className="label">Username:</span>
              <span className="value">{selectedUser.username}</span>
            </div>
            {selectedUser.displayName && (
              <div className="detail-row">
                <span className="label">Display Name:</span>
                <span className="value">{selectedUser.displayName}</span>
              </div>
            )}
            {selectedUser.email && (
              <div className="detail-row">
                <span className="label">Email:</span>
                <span className="value">{selectedUser.email}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="label">Role:</span>
              <span className="value">{selectedUser.role}</span>
            </div>
            <div className="detail-row">
              <span className="label">Status:</span>
              <span className={`value ${selectedUser.isActive ? 'active' : 'frozen'}`}>
                {selectedUser.isActive ? 'Active' : 'Frozen'}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Created:</span>
              <span className="value">{formatDate(selectedUser.createdAt)}</span>
            </div>
            <div className="detail-row">
              <span className="label">Last Login:</span>
              <span className="value">{formatDate(selectedUser.lastLoginAt)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
