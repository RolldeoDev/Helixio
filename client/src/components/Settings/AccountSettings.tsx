/**
 * Account Settings Component
 *
 * Consolidates Profile, Trackers, and Sync into accordion sections.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth, Session } from '../../contexts/AuthContext';
import { Accordion, AccordionSection } from '../Accordion';
import { ToggleSwitch } from '../ToggleSwitch';
import './AccountSettings.css';

// =============================================================================
// Types for Trackers
// =============================================================================

interface TrackerStatus {
  service: 'anilist' | 'myanimelist';
  configured: boolean;
  connected: boolean;
  expiresAt?: string;
}

// =============================================================================
// Types for Sync
// =============================================================================

interface SyncDevice {
  id: string;
  deviceId: string;
  deviceName: string;
  lastSyncAt: string | null;
  createdAt: string;
}

interface SyncState {
  currentVersion: number;
  progress: { total: number };
  bookmarks: { total: number };
  annotations: { total: number };
}

// =============================================================================
// API Functions
// =============================================================================

const TRACKER_API = '/api/trackers';
const SYNC_API = '/api/sync';

async function getTrackers(): Promise<{ trackers: TrackerStatus[] }> {
  const response = await fetch(TRACKER_API, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch trackers');
  return response.json();
}

async function getAuthUrl(service: string): Promise<{ url: string }> {
  const response = await fetch(`${TRACKER_API}/${service}/auth`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Failed to get ${service} auth URL`);
  return response.json();
}

async function exchangeCode(
  service: string,
  code: string,
  state?: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${TRACKER_API}/${service}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code, state }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Failed to connect ${service}`);
  }
  return response.json();
}

async function disconnectTracker(service: string): Promise<void> {
  const response = await fetch(`${TRACKER_API}/${service}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Failed to disconnect ${service}`);
}

async function getSyncDevices(): Promise<{ devices: SyncDevice[] }> {
  const response = await fetch(`${SYNC_API}/devices`, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch devices');
  return response.json();
}

async function registerDevice(deviceName: string): Promise<{ device: SyncDevice }> {
  const response = await fetch(`${SYNC_API}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ deviceName }),
  });
  if (!response.ok) throw new Error('Failed to register device');
  return response.json();
}

async function removeDevice(deviceId: string): Promise<void> {
  const response = await fetch(`${SYNC_API}/devices/${deviceId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to remove device');
}

async function getSyncState(): Promise<SyncState> {
  const response = await fetch(`${SYNC_API}/state`, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to get sync state');
  return response.json();
}

// =============================================================================
// Component
// =============================================================================

export function AccountSettings() {
  const {
    user,
    updateProfile,
    changePassword,
    getSessions,
    revokeSession,
    logoutAll,
    logout,
    error: authError,
    clearError,
  } = useAuth();

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profilePrivate, setProfilePrivate] = useState(user?.profilePrivate || false);
  const [hideReadingStats, setHideReadingStats] = useState(user?.hideReadingStats || false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Account deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Tracker state
  const [trackers, setTrackers] = useState<TrackerStatus[]>([]);
  const [loadingTrackers, setLoadingTrackers] = useState(true);
  const [connectingTracker, setConnectingTracker] = useState<string | null>(null);

  // Sync state
  const [syncDevices, setSyncDevices] = useState<SyncDevice[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loadingSync, setLoadingSync] = useState(true);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [addingDevice, setAddingDevice] = useState(false);
  const [currentDeviceId] = useState(() => localStorage.getItem('helixio_device_id'));

  // Messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load all data
  useEffect(() => {
    loadSessions();
    loadTrackers();
    loadSyncData();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const { type, code, state, service, error: callbackError } = event.data || {};

      if (type === 'tracker-callback') {
        if (callbackError) {
          showMessage(callbackError, true);
          setConnectingTracker(null);
          return;
        }

        if (code && service) {
          try {
            await exchangeCode(service, code, state);
            showMessage(`Connected to ${formatServiceName(service)}`);
            await loadTrackers();
          } catch (err) {
            showMessage(err instanceof Error ? err.message : 'Failed to connect', true);
          } finally {
            setConnectingTracker(null);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const sessionList = await getSessions();
      setSessions(sessionList);
    } catch {
      // Silent fail
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadTrackers = async () => {
    setLoadingTrackers(true);
    try {
      const data = await getTrackers();
      setTrackers(data.trackers);
    } catch (err) {
      console.error('Failed to load trackers:', err);
    } finally {
      setLoadingTrackers(false);
    }
  };

  const loadSyncData = useCallback(async () => {
    setLoadingSync(true);
    try {
      const [devicesData, stateData] = await Promise.all([
        getSyncDevices(),
        getSyncState(),
      ]);
      setSyncDevices(devicesData.devices);
      setSyncState(stateData);
    } catch (err) {
      console.error('Failed to load sync data:', err);
    } finally {
      setLoadingSync(false);
    }
  }, []);

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

  // Profile handlers
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    clearError();

    try {
      await updateProfile({
        displayName: displayName.trim() || undefined,
        email: email.trim() || undefined,
        profilePrivate,
        hideReadingStats,
      });
      showMessage('Profile updated successfully');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update profile', true);
    } finally {
      setSavingProfile(false);
    }
  };

  // Password handlers
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      showMessage('New passwords do not match', true);
      return;
    }

    if (newPassword.length < 8) {
      showMessage('Password must be at least 8 characters', true);
      return;
    }

    setChangingPassword(true);
    clearError();

    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showMessage('Password changed successfully');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to change password', true);
    } finally {
      setChangingPassword(false);
    }
  };

  // Session handlers
  const handleRevokeSession = async (sessionId: string) => {
    try {
      await revokeSession(sessionId);
      await loadSessions();
      showMessage('Session revoked');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to revoke session', true);
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm('This will log you out of all devices. Continue?')) {
      return;
    }

    try {
      await logoutAll();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to logout', true);
    }
  };

  // Avatar handlers
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showMessage('Please select an image file', true);
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      showMessage('Image must be under 5MB', true);
      return;
    }

    setUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch('/api/auth/me/avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload avatar');
      }

      const { avatarUrl } = await response.json();
      setAvatarPreview(avatarUrl + '?' + Date.now()); // Cache bust
      showMessage('Avatar updated');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to upload avatar', true);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!window.confirm('Remove your avatar?')) return;

    setUploadingAvatar(true);
    try {
      const response = await fetch('/api/auth/me/avatar', {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to remove avatar');
      }

      setAvatarPreview(null);
      showMessage('Avatar removed');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to remove avatar', true);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Account deletion handler
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!deletePassword) {
      showMessage('Password is required', true);
      return;
    }

    setDeletingAccount(true);
    try {
      const response = await fetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: deletePassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }

      // Account deleted, log out
      await logout();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete account', true);
      setDeletingAccount(false);
    }
  };

  // Tracker handlers
  const handleConnectTracker = async (service: string) => {
    setConnectingTracker(service);

    try {
      const { url } = await getAuthUrl(service);
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        url,
        `${service}-auth`,
        `width=${width},height=${height},left=${left},top=${top},popup=1`
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups.');
      }

      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          if (connectingTracker === service) {
            setConnectingTracker(null);
          }
        }
      }, 500);
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to start authentication', true);
      setConnectingTracker(null);
    }
  };

  const handleDisconnectTracker = async (service: string) => {
    if (!window.confirm(`Disconnect from ${formatServiceName(service)}?`)) {
      return;
    }

    try {
      await disconnectTracker(service);
      showMessage(`Disconnected from ${formatServiceName(service)}`);
      await loadTrackers();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to disconnect', true);
    }
  };

  // Sync handlers
  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName.trim()) return;

    setAddingDevice(true);
    try {
      const { device } = await registerDevice(newDeviceName.trim());
      localStorage.setItem('helixio_device_id', device.deviceId);
      showMessage('Device registered successfully');
      setShowAddDevice(false);
      setNewDeviceName('');
      await loadSyncData();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to register device', true);
    } finally {
      setAddingDevice(false);
    }
  };

  const handleRemoveDevice = async (device: SyncDevice) => {
    if (!window.confirm(`Remove "${device.deviceName}" from sync?`)) {
      return;
    }

    try {
      await removeDevice(device.deviceId);
      if (device.deviceId === currentDeviceId) {
        localStorage.removeItem('helixio_device_id');
      }
      showMessage('Device removed');
      await loadSyncData();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to remove device', true);
    }
  };

  // Utility functions
  const formatServiceName = (service: string): string => {
    switch (service) {
      case 'anilist': return 'AniList';
      case 'myanimelist': return 'MyAnimeList';
      default: return service;
    }
  };

  const formatSessionDate = (date: string): string => new Date(date).toLocaleString();

  const parseUserAgent = (ua?: string): string => {
    if (!ua) return 'Unknown device';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS Device';
    if (ua.includes('Android')) return 'Android Device';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    return 'Unknown device';
  };

  const formatLastSync = (date: string | null): string => {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const connectedTrackersCount = trackers.filter(t => t.connected).length;

  if (!user) {
    return <div className="account-settings">Not logged in</div>;
  }

  // Build accordion sections
  const sections: AccordionSection[] = [
    {
      id: 'profile',
      title: 'Profile & Security',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      defaultExpanded: true,
      children: (
        <>
          {/* Avatar Section */}
          <section className="account-subsection">
            <h4>Avatar</h4>
            <div className="avatar-section">
              <div className="avatar-preview">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="avatar-image" />
                ) : (
                  <div className="avatar-placeholder">
                    {(user.displayName?.[0] || user.username?.[0] || 'U').toUpperCase()}
                  </div>
                )}
              </div>
              <div className="avatar-actions">
                <label className="btn-secondary avatar-upload-btn">
                  {uploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    disabled={uploadingAvatar}
                    hidden
                  />
                </label>
                {avatarPreview && (
                  <button
                    type="button"
                    className="btn-ghost danger"
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="avatar-hint">JPEG, PNG or GIF. Max 5MB. Will be resized to 256x256.</p>
            </div>
          </section>

          {/* Profile Form */}
          <section className="account-subsection">
            <h4>Profile</h4>
            <form onSubmit={handleSaveProfile}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="username">Username</label>
                  <input id="username" type="text" value={user.username} disabled className="disabled" />
                  <span className="form-hint">Username cannot be changed</span>
                </div>
                <div className="form-group">
                  <label htmlFor="displayName">Display Name</label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Optional display name"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>

              <ToggleSwitch
                checked={profilePrivate}
                onChange={setProfilePrivate}
                label="Make profile private"
                description="Hide your profile from other users"
              />

              <ToggleSwitch
                checked={hideReadingStats}
                onChange={setHideReadingStats}
                label="Hide reading statistics"
                description="Don't show reading stats on your profile"
              />

              <button type="submit" className="btn-primary" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </section>

          {/* Password Form */}
          <section className="account-subsection">
            <h4>Change Password</h4>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="newPassword">New Password</label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={changingPassword || !currentPassword || !newPassword}
              >
                {changingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </section>

          {/* Sessions */}
          <section className="account-subsection">
            <div className="subsection-header">
              <h4>Active Sessions</h4>
              <button className="btn-ghost danger" onClick={handleLogoutAll}>
                Logout All Devices
              </button>
            </div>

            {loadingSessions ? (
              <div className="loading-state">
                <div className="spinner-small" />
                <span>Loading sessions...</span>
              </div>
            ) : sessions.length === 0 ? (
              <p className="empty-state">No active sessions</p>
            ) : (
              <div className="session-list">
                {sessions.map((session) => (
                  <div key={session.id} className="session-item">
                    <div className="session-info">
                      <div className="session-device">
                        {parseUserAgent(session.userAgent)}
                        {session.ipAddress && <span className="session-ip">{session.ipAddress}</span>}
                      </div>
                      <div className="session-meta">
                        <span>Created: {formatSessionDate(session.createdAt)}</span>
                        <span>Last used: {formatSessionDate(session.lastUsed)}</span>
                      </div>
                    </div>
                    <button className="btn-ghost danger" onClick={() => handleRevokeSession(session.id)}>
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Account Info */}
          <section className="account-subsection">
            <h4>Account Info</h4>
            <div className="account-info-grid">
              <div className="info-item">
                <span className="info-label">Role</span>
                <span className="info-value role-badge">{user.role}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Member since</span>
                <span className="info-value">{new Date(user.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </section>
        </>
      ),
    },
    {
      id: 'trackers',
      title: 'External Trackers',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
      badge: connectedTrackersCount > 0 ? connectedTrackersCount : undefined,
      children: (
        <>
          <p className="section-description">
            Connect your accounts to sync reading progress with external tracking services.
          </p>

          {loadingTrackers ? (
            <div className="loading-state">
              <div className="spinner-small" />
              <span>Loading trackers...</span>
            </div>
          ) : (
            <div className="tracker-list">
              {trackers.map((tracker) => (
                <div key={tracker.service} className="tracker-item">
                  <div className="tracker-info">
                    <div className="tracker-header">
                      <span className={`tracker-icon tracker-icon-${tracker.service}`} />
                      <h5>{formatServiceName(tracker.service)}</h5>
                      {tracker.connected && <span className="tracker-badge connected">Connected</span>}
                    </div>
                    <p className="tracker-description">
                      {tracker.service === 'anilist'
                        ? 'Track your manga reading progress on AniList.'
                        : 'Sync your manga collection with MyAnimeList.'}
                    </p>
                    {tracker.connected && tracker.expiresAt && (
                      <p className="tracker-expiry">
                        Token expires: {new Date(tracker.expiresAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="tracker-actions">
                    {tracker.connected ? (
                      <button
                        className="btn-ghost danger"
                        onClick={() => handleDisconnectTracker(tracker.service)}
                        disabled={!!connectingTracker}
                      >
                        Disconnect
                      </button>
                    ) : tracker.configured ? (
                      <button
                        className="btn-primary"
                        onClick={() => handleConnectTracker(tracker.service)}
                        disabled={!!connectingTracker}
                      >
                        {connectingTracker === tracker.service ? 'Connecting...' : 'Connect'}
                      </button>
                    ) : (
                      <span className="tracker-setup-hint">Configure on server</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ),
    },
    {
      id: 'sync',
      title: 'Cloud Sync',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
      ),
      badge: syncDevices.length > 0 ? syncDevices.length : undefined,
      children: (
        <>
          <p className="section-description">
            Sync your reading progress, bookmarks, and annotations across devices.
          </p>

          {loadingSync ? (
            <div className="loading-state">
              <div className="spinner-small" />
              <span>Loading sync data...</span>
            </div>
          ) : (
            <>
              {/* Sync State */}
              {syncState && (
                <div className="sync-stats">
                  <div className="sync-stat">
                    <span className="stat-value">{syncState.progress?.total ?? 0}</span>
                    <span className="stat-label">Progress</span>
                  </div>
                  <div className="sync-stat">
                    <span className="stat-value">{syncState.bookmarks?.total ?? 0}</span>
                    <span className="stat-label">Bookmarks</span>
                  </div>
                  <div className="sync-stat">
                    <span className="stat-value">{syncState.annotations?.total ?? 0}</span>
                    <span className="stat-label">Annotations</span>
                  </div>
                </div>
              )}

              {/* Devices */}
              <div className="sync-devices">
                <div className="subsection-header">
                  <h5>Synced Devices</h5>
                  {!showAddDevice && !currentDeviceId && (
                    <button
                      className="btn-primary"
                      onClick={() => {
                        setNewDeviceName(`${navigator.platform || 'Device'} - ${new Date().toLocaleDateString()}`);
                        setShowAddDevice(true);
                      }}
                    >
                      Register This Device
                    </button>
                  )}
                </div>

                {syncDevices.length === 0 && !showAddDevice ? (
                  <div className="empty-state">
                    <p>No devices registered for sync.</p>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setNewDeviceName(`${navigator.platform || 'Device'} - ${new Date().toLocaleDateString()}`);
                        setShowAddDevice(true);
                      }}
                    >
                      Get Started
                    </button>
                  </div>
                ) : (
                  <div className="device-list">
                    {syncDevices.map((device) => (
                      <div
                        key={device.id}
                        className={`device-item ${device.deviceId === currentDeviceId ? 'current' : ''}`}
                      >
                        <div className="device-info">
                          <div className="device-header">
                            <span className="device-name">{device.deviceName}</span>
                            {device.deviceId === currentDeviceId && (
                              <span className="device-badge">This Device</span>
                            )}
                          </div>
                          <div className="device-meta">
                            <span>Last sync: {formatLastSync(device.lastSyncAt)}</span>
                          </div>
                        </div>
                        <button className="btn-ghost danger" onClick={() => handleRemoveDevice(device)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {showAddDevice && (
                  <form className="add-device-form" onSubmit={handleAddDevice}>
                    <div className="form-group">
                      <label htmlFor="deviceName">Device Name</label>
                      <input
                        id="deviceName"
                        type="text"
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                        placeholder="e.g., MacBook Pro"
                        autoFocus
                      />
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="btn-primary" disabled={addingDevice || !newDeviceName.trim()}>
                        {addingDevice ? 'Registering...' : 'Register'}
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setShowAddDevice(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </>
      ),
    },
    {
      id: 'danger',
      title: 'Danger Zone',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      children: (
        <section className="account-subsection danger-zone">
          <h4>Delete Account</h4>
          <p className="danger-warning">
            Once you delete your account, there is no going back. This will permanently delete your
            account and remove all your data including reading progress, collections, bookmarks, and
            achievements.
          </p>

          {!showDeleteConfirm ? (
            <button
              type="button"
              className="btn-danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete My Account
            </button>
          ) : (
            <form onSubmit={handleDeleteAccount} className="delete-form">
              <p className="delete-confirm-text">
                To confirm, please enter your password:
              </p>
              <div className="form-group">
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  autoFocus
                />
              </div>
              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={deletingAccount || !deletePassword}
                >
                  {deletingAccount ? 'Deleting...' : 'Permanently Delete Account'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePassword('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      ),
    },
  ];

  return (
    <div className="account-settings">
      <h2>Account Settings</h2>

      {(error || authError) && <div className="account-error">{error || authError}</div>}
      {success && <div className="account-success">{success}</div>}

      <Accordion sections={sections} allowMultiple />
    </div>
  );
}
