/**
 * Admin Settings Component
 *
 * User management, registration settings, and admin controls.
 * Only visible to admin users.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ToggleSwitch } from '../ToggleSwitch';
import { useApiToast } from '../../hooks';
import { useConfirmModal } from '../ConfirmModal';
import {
  getAllApiKeys,
  getApiKeySystemStats,
  adminRevokeApiKey,
  ApiKeyWithUser,
  SystemApiKeyStats,
  getKeyStatus,
  getStatusColor,
  formatLastUsed,
  formatExpiration,
} from '../../services/api/api-keys';
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

  // API Keys Admin state
  const [apiKeys, setApiKeys] = useState<ApiKeyWithUser[]>([]);
  const [apiKeyStats, setApiKeyStats] = useState<SystemApiKeyStats | null>(null);
  const [loadingApiKeys, setLoadingApiKeys] = useState(true);
  const [apiKeySearchQuery, setApiKeySearchQuery] = useState('');
  const [apiKeyStatusFilter, setApiKeyStatusFilter] = useState<'all' | 'active' | 'revoked' | 'expired'>('all');
  const [selectedApiKey, setSelectedApiKey] = useState<ApiKeyWithUser | null>(null);

  const { addToast } = useApiToast();
  const confirm = useConfirmModal();

  useEffect(() => {
    loadSettings();
    loadUsers();
    loadApiKeys();
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

  // Load API keys (admin)
  const loadApiKeys = useCallback(async () => {
    setLoadingApiKeys(true);
    try {
      const [keys, stats] = await Promise.all([
        getAllApiKeys(),
        getApiKeySystemStats(),
      ]);
      setApiKeys(keys);
      setApiKeyStats(stats);
    } catch {
      addToast('error', 'Failed to load API keys');
    } finally {
      setLoadingApiKeys(false);
    }
  }, [addToast]);

  // Revoke API key (admin)
  const handleRevokeApiKey = async (key: ApiKeyWithUser) => {
    const confirmed = await confirm({
      title: 'Revoke API Key',
      message: `Are you sure you want to revoke "${key.name}" belonging to ${key.user.username}? This action cannot be undone.`,
      confirmText: 'Revoke',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      await adminRevokeApiKey(key.id);
      addToast('success', 'API key revoked');
      loadApiKeys();
      setSelectedApiKey(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke API key';
      addToast('error', message);
    }
  };

  // Filter API keys
  const filteredApiKeys = apiKeys.filter(key => {
    // Search filter
    if (apiKeySearchQuery) {
      const query = apiKeySearchQuery.toLowerCase();
      const matchesSearch =
        key.name.toLowerCase().includes(query) ||
        key.user.username.toLowerCase().includes(query) ||
        key.user.displayName?.toLowerCase().includes(query) ||
        key.keyPrefix.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Status filter
    if (apiKeyStatusFilter !== 'all') {
      const status = getKeyStatus(key);
      if (status !== apiKeyStatusFilter) return false;
    }

    return true;
  });

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

      {/* API Keys Administration */}
      <div className="admin-section api-keys-admin-section">
        <div className="section-header">
          <h3>API Key Administration</h3>
          <span className="user-count">{apiKeys.length} keys</span>
        </div>

        {/* Stats Cards */}
        {apiKeyStats && (
          <div className="api-keys-stats">
            <div className="stat-card">
              <div className="stat-value">{apiKeyStats.totalKeys}</div>
              <div className="stat-label">Total Keys</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{apiKeyStats.activeKeys}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{apiKeyStats.expiredKeys}</div>
              <div className="stat-label">Expired</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{apiKeyStats.revokedKeys}</div>
              <div className="stat-label">Revoked</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{apiKeyStats.requestsLast24h.toLocaleString()}</div>
              <div className="stat-label">Requests (24h)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{apiKeyStats.requestsLast7d.toLocaleString()}</div>
              <div className="stat-label">Requests (7d)</div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="user-filters">
          <input
            type="text"
            placeholder="Search by user, key name, or prefix..."
            value={apiKeySearchQuery}
            onChange={(e) => setApiKeySearchQuery(e.target.value)}
            className="user-search"
          />
          <select
            value={apiKeyStatusFilter}
            onChange={(e) => setApiKeyStatusFilter(e.target.value as 'all' | 'active' | 'revoked' | 'expired')}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {/* API Keys List */}
        <div className="api-keys-list">
          {loadingApiKeys ? (
            <div className="loading-users">Loading API keys...</div>
          ) : filteredApiKeys.length === 0 ? (
            <div className="no-users">No API keys found</div>
          ) : (
            filteredApiKeys.map(key => {
              const status = getKeyStatus(key);
              const statusColor = getStatusColor(status);

              return (
                <div
                  key={key.id}
                  className={`api-key-row ${selectedApiKey?.id === key.id ? 'selected' : ''} ${status !== 'active' ? 'inactive' : ''}`}
                  onClick={() => setSelectedApiKey(key)}
                >
                  <div className="api-key-info">
                    <div className="api-key-header">
                      <span className="api-key-name">{key.name}</span>
                      <code className="api-key-prefix">{key.keyPrefix}...</code>
                      <span className={`status-badge ${statusColor}`}>{status}</span>
                    </div>
                    <div className="api-key-meta">
                      <span className="api-key-user">
                        User: <strong>{key.user.username}</strong>
                        {key.user.displayName && ` (${key.user.displayName})`}
                      </span>
                      <span>Created: {formatDate(key.createdAt)}</span>
                      <span>Last used: {formatLastUsed(key.lastUsedAt)}</span>
                      <span>{key.usageCount.toLocaleString()} requests</span>
                    </div>
                    <div className="api-key-scopes">
                      {key.scopes.slice(0, 4).map((scope) => (
                        <span key={scope} className="scope-badge-small">
                          {scope}
                        </span>
                      ))}
                      {key.scopes.length > 4 && (
                        <span className="scope-badge-small more">
                          +{key.scopes.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="api-key-actions" onClick={(e) => e.stopPropagation()}>
                    {status === 'active' && (
                      <button
                        className="action-btn freeze"
                        onClick={() => handleRevokeApiKey(key)}
                        title="Revoke API key"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* API Key Details Panel */}
      {selectedApiKey && (
        <div className="admin-section api-key-details">
          <div className="section-header">
            <h3>API Key Details: {selectedApiKey.name}</h3>
            <button
              className="close-btn"
              onClick={() => setSelectedApiKey(null)}
            >
              Close
            </button>
          </div>

          <div className="api-key-details-content">
            <div className="detail-row">
              <span className="label">Owner:</span>
              <span className="value">
                {selectedApiKey.user.username}
                {selectedApiKey.user.displayName && ` (${selectedApiKey.user.displayName})`}
                {selectedApiKey.user.role === 'admin' && <span className="admin-badge">Admin</span>}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Key Prefix:</span>
              <code className="value">{selectedApiKey.keyPrefix}...</code>
            </div>
            <div className="detail-row">
              <span className="label">Status:</span>
              <span className={`value status-${getStatusColor(getKeyStatus(selectedApiKey))}`}>
                {getKeyStatus(selectedApiKey)}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Created:</span>
              <span className="value">{formatDate(selectedApiKey.createdAt)}</span>
            </div>
            <div className="detail-row">
              <span className="label">Expires:</span>
              <span className="value">{formatExpiration(selectedApiKey.expiresAt)}</span>
            </div>
            <div className="detail-row">
              <span className="label">Last Used:</span>
              <span className="value">{formatLastUsed(selectedApiKey.lastUsedAt)}</span>
            </div>
            {selectedApiKey.lastUsedIp && (
              <div className="detail-row">
                <span className="label">Last IP:</span>
                <span className="value">{selectedApiKey.lastUsedIp}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="label">Total Requests:</span>
              <span className="value">{selectedApiKey.usageCount.toLocaleString()}</span>
            </div>
            <div className="detail-row">
              <span className="label">Rate Limit:</span>
              <span className="value">{selectedApiKey.rateLimitTier}</span>
            </div>
            {selectedApiKey.revokedAt && (
              <>
                <div className="detail-row">
                  <span className="label">Revoked At:</span>
                  <span className="value">{formatDate(selectedApiKey.revokedAt)}</span>
                </div>
                {selectedApiKey.revokedReason && (
                  <div className="detail-row">
                    <span className="label">Revoke Reason:</span>
                    <span className="value">{selectedApiKey.revokedReason}</span>
                  </div>
                )}
              </>
            )}

            <div className="detail-section">
              <h4>Scopes ({selectedApiKey.scopes.length})</h4>
              <div className="scope-list-full">
                {selectedApiKey.scopes.map((scope) => (
                  <span key={scope} className="scope-badge-small">{scope}</span>
                ))}
              </div>
            </div>

            {selectedApiKey.libraryIds && selectedApiKey.libraryIds.length > 0 && (
              <div className="detail-section">
                <h4>Library Restrictions</h4>
                <p className="detail-note">This key can only access {selectedApiKey.libraryIds.length} specific libraries</p>
              </div>
            )}

            {selectedApiKey.ipWhitelist && selectedApiKey.ipWhitelist.length > 0 && (
              <div className="detail-section">
                <h4>IP Whitelist</h4>
                <div className="ip-list">
                  {selectedApiKey.ipWhitelist.map((ip) => (
                    <code key={ip} className="ip-item">{ip}</code>
                  ))}
                </div>
              </div>
            )}

            {getKeyStatus(selectedApiKey) === 'active' && (
              <div className="detail-actions">
                <button
                  className="action-btn freeze"
                  onClick={() => handleRevokeApiKey(selectedApiKey)}
                >
                  Revoke This Key
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
