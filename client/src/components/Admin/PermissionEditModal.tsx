/**
 * Permission Edit Modal Component
 *
 * Modal for editing user permissions, library access, and resetting passwords.
 * Used by admins to manage user access controls.
 */

import { useState, useEffect, useCallback } from 'react';
import { ToggleSwitch } from '../ToggleSwitch';
import { useApiToast } from '../../hooks';
import './PermissionEditModal.css';

// =============================================================================
// Types
// =============================================================================

// User type shared with UserManagement component
interface User {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: 'admin' | 'user' | 'guest';
  isActive: boolean;
  permissions: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
}

interface Permission {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

interface LibraryAccess {
  libraryId: string;
  libraryName: string;
  hasAccess: boolean;
  permission: string;
}

interface PermissionEditModalProps {
  user: User;
  onClose: () => void;
  onSave: (updatedUser: User) => void;
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '/api/auth';

async function fetchPermissions(): Promise<Record<string, Permission>> {
  const response = await fetch(`${API_BASE}/permissions`, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch permissions');
  const data = await response.json();
  return data.permissions;
}

async function updateUserPermissions(
  userId: string,
  permissions: Record<string, boolean>
): Promise<User> {
  const response = await fetch(`${API_BASE}/users/${userId}/permissions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ permissions }),
  });
  if (!response.ok) throw new Error('Failed to update permissions');
  const data = await response.json();
  return data.user;
}

async function fetchLibraryAccess(userId: string): Promise<LibraryAccess[]> {
  const response = await fetch(`${API_BASE}/users/${userId}/library-access`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch library access');
  const data = await response.json();
  return data.libraries || [];
}

async function updateLibraryAccess(
  userId: string,
  libraryId: string,
  hasAccess: boolean
): Promise<void> {
  const response = await fetch(`${API_BASE}/users/${userId}/library-access/${libraryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ hasAccess }),
  });
  if (!response.ok) throw new Error('Failed to update library access');
}

async function resetPassword(userId: string, newPassword: string): Promise<void> {
  const response = await fetch(`${API_BASE}/users/${userId}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ newPassword }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to reset password');
  }
}

// =============================================================================
// Component
// =============================================================================

export function PermissionEditModal({ user, onClose, onSave }: PermissionEditModalProps) {
  const { addToast } = useApiToast();

  // Permission definitions from API
  const [permissionDefs, setPermissionDefs] = useState<Record<string, Permission>>({});
  const [loadingDefs, setLoadingDefs] = useState(true);

  // User's current permissions (parsed from JSON)
  const [userPerms, setUserPerms] = useState<Record<string, boolean>>({});
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});

  // Library access state
  const [libraries, setLibraries] = useState<LibraryAccess[]>([]);
  const [loadingLibraries, setLoadingLibraries] = useState(true);

  // Password reset state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Saving state
  const [saving, setSaving] = useState(false);

  // Parse user permissions from JSON
  useEffect(() => {
    try {
      const parsed = JSON.parse(user.permissions || '{}');
      setUserPerms(parsed);
    } catch {
      setUserPerms({});
    }
  }, [user.permissions]);

  // Load permission definitions
  useEffect(() => {
    let mounted = true;
    setLoadingDefs(true);
    fetchPermissions()
      .then((defs) => {
        if (mounted) setPermissionDefs(defs);
      })
      .catch((err) => {
        if (mounted) addToast('error', err.message);
      })
      .finally(() => {
        if (mounted) setLoadingDefs(false);
      });
    return () => {
      mounted = false;
    };
  }, [addToast]);

  // Load library access
  useEffect(() => {
    let mounted = true;
    setLoadingLibraries(true);
    fetchLibraryAccess(user.id)
      .then((libs) => {
        if (mounted) setLibraries(libs);
      })
      .catch((err) => {
        if (mounted) addToast('error', err.message);
      })
      .finally(() => {
        if (mounted) setLoadingLibraries(false);
      });
    return () => {
      mounted = false;
    };
  }, [user.id, addToast]);

  // Get effective permission value (pending changes override current)
  const getPermValue = useCallback(
    (key: string): boolean => {
      if (key in pendingChanges) return pendingChanges[key] ?? false;
      return userPerms[key] ?? false;
    },
    [userPerms, pendingChanges]
  );

  // Toggle a permission
  const handleTogglePerm = (key: string, value: boolean) => {
    setPendingChanges((prev) => ({ ...prev, [key]: value }));
  };

  // Toggle library access
  const handleToggleLibrary = async (libraryId: string, currentAccess: boolean) => {
    try {
      await updateLibraryAccess(user.id, libraryId, !currentAccess);
      setLibraries((prev) =>
        prev.map((lib) =>
          lib.libraryId === libraryId ? { ...lib, hasAccess: !currentAccess } : lib
        )
      );
      addToast('success', currentAccess ? 'Access revoked' : 'Access granted');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update access');
    }
  };

  // Handle save permissions
  const handleSave = async () => {
    if (Object.keys(pendingChanges).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const updatedUser = await updateUserPermissions(user.id, pendingChanges);
      addToast('success', 'Permissions updated');
      onSave(updatedUser);
      onClose();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Handle password reset
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      addToast('error', 'Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('error', 'Passwords do not match');
      return;
    }

    setResettingPassword(true);
    try {
      await resetPassword(user.id, newPassword);
      addToast('success', 'Password reset successfully');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const isAdmin = user.role === 'admin';
  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  return (
    <div className="permission-modal-backdrop" onClick={handleBackdropClick}>
      <div className="permission-modal">
        <div className="permission-modal-header">
          <h2>Edit User: {user.displayName || user.username}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="permission-modal-body">
          {/* User Info Summary */}
          <div className="user-summary">
            <div className="summary-row">
              <span className="label">Username:</span>
              <span className="value">@{user.username}</span>
            </div>
            <div className="summary-row">
              <span className="label">Role:</span>
              <span className={`role-badge ${user.role}`}>{user.role}</span>
            </div>
            <div className="summary-row">
              <span className="label">Status:</span>
              <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                {user.isActive ? 'Active' : 'Frozen'}
              </span>
            </div>
          </div>

          {/* Permissions Section */}
          <div className="permission-section">
            <h3>Permissions</h3>
            {isAdmin ? (
              <p className="admin-note">
                Admins automatically have all permissions and cannot be restricted.
              </p>
            ) : loadingDefs ? (
              <p className="loading">Loading permissions...</p>
            ) : (
              <div className="permission-list">
                {Object.entries(permissionDefs).map(([key, def]) => (
                  <div key={key} className="permission-row">
                    <ToggleSwitch
                      checked={getPermValue(key)}
                      onChange={(checked) => handleTogglePerm(key, checked)}
                      label={def.label}
                      description={def.description}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Library Access Section */}
          <div className="permission-section">
            <h3>Library Access</h3>
            {isAdmin ? (
              <p className="admin-note">
                Admins have access to all libraries.
              </p>
            ) : loadingLibraries ? (
              <p className="loading">Loading libraries...</p>
            ) : libraries.length === 0 ? (
              <p className="empty">No libraries configured</p>
            ) : (
              <div className="library-list">
                {libraries.map((lib) => (
                  <div key={lib.libraryId} className="library-row">
                    <span className="library-name">{lib.libraryName}</span>
                    <ToggleSwitch
                      checked={lib.hasAccess}
                      onChange={() => handleToggleLibrary(lib.libraryId, lib.hasAccess)}
                      size="small"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Password Reset Section */}
          <div className="permission-section">
            <h3>Reset Password</h3>
            <div className="password-reset-form">
              <div className="form-row">
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={resettingPassword}
                />
              </div>
              <div className="form-row">
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={resettingPassword}
                />
              </div>
              <button
                className="btn-secondary"
                onClick={handleResetPassword}
                disabled={resettingPassword || !newPassword}
              >
                {resettingPassword ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>

        <div className="permission-modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || !hasPendingChanges || isAdmin}
          >
            {saving ? 'Saving...' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
}
