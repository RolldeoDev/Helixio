/**
 * Account Settings Component
 *
 * User profile, password, and session management.
 */

import { useState, useEffect } from 'react';
import { useAuth, Session } from '../../contexts/AuthContext';
import './AccountSettings.css';

export function AccountSettings() {
  const {
    user,
    updateProfile,
    changePassword,
    getSessions,
    revokeSession,
    logoutAll,
    error: authError,
    clearError,
  } = useAuth();

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profilePrivate, setProfilePrivate] = useState(user?.profilePrivate || false);
  const [hideReadingStats, setHideReadingStats] = useState(user?.hideReadingStats || false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load sessions
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const sessionList = await getSessions();
      setSessions(sessionList);
    } catch {
      // Silent fail for sessions
    } finally {
      setLoadingSessions(false);
    }
  };

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
    setError(null);

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
      // User will be logged out, redirect handled by App
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to logout', true);
    }
  };

  const formatSessionDate = (date: string): string => {
    return new Date(date).toLocaleString();
  };

  const parseUserAgent = (ua?: string): string => {
    if (!ua) return 'Unknown device';

    // Simple parsing
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS Device';
    if (ua.includes('Android')) return 'Android Device';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    return 'Unknown device';
  };

  if (!user) {
    return <div className="account-settings">Not logged in</div>;
  }

  return (
    <div className="account-settings">
      <h2>Account Settings</h2>

      {(error || authError) && <div className="account-error">{error || authError}</div>}
      {success && <div className="account-success">{success}</div>}

      {/* Profile Section */}
      <section className="account-section">
        <h3>Profile</h3>
        <form onSubmit={handleSaveProfile}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={user.username}
                disabled
                className="disabled"
              />
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

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={profilePrivate}
                onChange={(e) => setProfilePrivate(e.target.checked)}
              />
              <span>Make profile private</span>
            </label>
            <span className="form-hint">Hide your profile from other users</span>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={hideReadingStats}
                onChange={(e) => setHideReadingStats(e.target.checked)}
              />
              <span>Hide reading statistics</span>
            </label>
            <span className="form-hint">Don't show reading stats on your profile</span>
          </div>

          <button type="submit" className="btn-primary" disabled={savingProfile}>
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </section>

      {/* Password Section */}
      <section className="account-section">
        <h3>Change Password</h3>
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

      {/* Sessions Section */}
      <section className="account-section">
        <div className="section-header">
          <h3>Active Sessions</h3>
          <button className="btn-ghost danger" onClick={handleLogoutAll}>
            Logout All Devices
          </button>
        </div>

        {loadingSessions ? (
          <div className="sessions-loading">
            <div className="spinner-small" />
            <span>Loading sessions...</span>
          </div>
        ) : sessions.length === 0 ? (
          <p className="sessions-empty">No active sessions</p>
        ) : (
          <div className="session-list">
            {sessions.map((session) => (
              <div key={session.id} className="session-item">
                <div className="session-info">
                  <div className="session-device">
                    {parseUserAgent(session.userAgent)}
                    {session.ipAddress && (
                      <span className="session-ip">{session.ipAddress}</span>
                    )}
                  </div>
                  <div className="session-meta">
                    <span>Created: {formatSessionDate(session.createdAt)}</span>
                    <span>Last used: {formatSessionDate(session.lastUsed)}</span>
                  </div>
                </div>
                <button
                  className="btn-ghost danger"
                  onClick={() => handleRevokeSession(session.id)}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Account Info */}
      <section className="account-section">
        <h3>Account Info</h3>
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
    </div>
  );
}
