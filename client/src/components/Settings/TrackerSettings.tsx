/**
 * Tracker Settings Component
 *
 * Manages external tracker integrations (AniList, MyAnimeList).
 */

import { useState, useEffect } from 'react';
import { useConfirmModal } from '../ConfirmModal';
import './TrackerSettings.css';

// =============================================================================
// Types
// =============================================================================

interface TrackerStatus {
  service: 'anilist' | 'myanimelist';
  configured: boolean;
  connected: boolean;
  expiresAt?: string;
}

interface TrackerUser {
  id: string | number;
  name: string;
  avatar?: string;
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '/api/trackers';

async function getTrackers(): Promise<{ trackers: TrackerStatus[] }> {
  const response = await fetch(API_BASE, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch trackers');
  return response.json();
}

async function getAuthUrl(service: string): Promise<{ url: string }> {
  const response = await fetch(`${API_BASE}/${service}/auth`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Failed to get ${service} auth URL`);
  return response.json();
}

async function exchangeCode(
  service: string,
  code: string,
  state?: string
): Promise<{ success: boolean; user: TrackerUser }> {
  const response = await fetch(`${API_BASE}/${service}/callback`, {
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
  const response = await fetch(`${API_BASE}/${service}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Failed to disconnect ${service}`);
}

// =============================================================================
// Component
// =============================================================================

export function TrackerSettings() {
  const confirm = useConfirmModal();
  const [trackers, setTrackers] = useState<TrackerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load tracker status
  useEffect(() => {
    loadTrackers();
  }, []);

  const loadTrackers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTrackers();
      setTrackers(data.trackers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trackers');
    } finally {
      setLoading(false);
    }
  };

  // Handle OAuth callback from popup
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const { type, code, state, service, error: callbackError } = event.data || {};

      if (type === 'tracker-callback') {
        if (callbackError) {
          setError(callbackError);
          setConnecting(null);
          return;
        }

        if (code && service) {
          try {
            await exchangeCode(service, code, state);
            setSuccess(`Successfully connected to ${formatServiceName(service)}`);
            await loadTrackers();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect');
          } finally {
            setConnecting(null);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnect = async (service: string) => {
    setConnecting(service);
    setError(null);
    setSuccess(null);

    try {
      const { url } = await getAuthUrl(service);

      // Open popup for OAuth
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
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Poll for popup close without successful auth
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          if (connecting === service) {
            setConnecting(null);
          }
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start authentication');
      setConnecting(null);
    }
  };

  const handleDisconnect = async (service: string) => {
    const confirmed = await confirm({
      title: 'Disconnect Tracker',
      message: `Disconnect from ${formatServiceName(service)}?`,
      confirmText: 'Disconnect',
      variant: 'warning',
    });
    if (!confirmed) return;

    setError(null);
    setSuccess(null);

    try {
      await disconnectTracker(service);
      setSuccess(`Disconnected from ${formatServiceName(service)}`);
      await loadTrackers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  const formatServiceName = (service: string): string => {
    switch (service) {
      case 'anilist':
        return 'AniList';
      case 'myanimelist':
        return 'MyAnimeList';
      default:
        return service;
    }
  };

  const getServiceDescription = (service: string): string => {
    switch (service) {
      case 'anilist':
        return 'Track your manga reading progress on AniList. Your reading activity will sync automatically.';
      case 'myanimelist':
        return 'Sync your manga collection with MyAnimeList. Keep your list updated across platforms.';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="tracker-settings">
        <div className="tracker-loading">
          <div className="spinner-small" />
          <span>Loading tracker settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tracker-settings">
      <h2>External Trackers</h2>
      <p className="section-description">
        Connect your accounts to sync reading progress with external tracking services.
      </p>

      {error && <div className="tracker-error">{error}</div>}
      {success && <div className="tracker-success">{success}</div>}

      <div className="tracker-list">
        {trackers.map((tracker) => (
          <div key={tracker.service} className="tracker-item">
            <div className="tracker-info">
              <div className="tracker-header">
                <span className={`tracker-icon tracker-icon-${tracker.service}`} />
                <h3>{formatServiceName(tracker.service)}</h3>
                {tracker.connected && (
                  <span className="tracker-badge connected">Connected</span>
                )}
                {!tracker.configured && (
                  <span className="tracker-badge not-configured">Not Configured</span>
                )}
              </div>
              <p className="tracker-description">
                {getServiceDescription(tracker.service)}
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
                  onClick={() => handleDisconnect(tracker.service)}
                  disabled={!!connecting}
                >
                  Disconnect
                </button>
              ) : tracker.configured ? (
                <button
                  className="btn-primary"
                  onClick={() => handleConnect(tracker.service)}
                  disabled={!!connecting}
                >
                  {connecting === tracker.service ? 'Connecting...' : 'Connect'}
                </button>
              ) : (
                <span className="tracker-setup-hint">
                  Set up API credentials on the server to enable
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="tracker-info-section">
        <h3>How Tracker Sync Works</h3>
        <ul>
          <li>When you finish reading a chapter, your progress is synced automatically</li>
          <li>Series must be linked to their tracker entry before sync works</li>
          <li>Use the "Link to Tracker" option in series details to connect titles</li>
          <li>Sync is one-way: Helixio → Tracker. Import from trackers coming soon.</li>
        </ul>
      </div>
    </div>
  );
}
