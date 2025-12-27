/**
 * Sync Settings Component
 *
 * Manages cloud sync devices and settings.
 */

import { useState, useEffect, useCallback } from 'react';
import { useConfirmModal } from '../ConfirmModal';
import './SyncSettings.css';

// =============================================================================
// Types
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

const API_BASE = '/api/sync';

async function getDevices(): Promise<{ devices: SyncDevice[] }> {
  const response = await fetch(`${API_BASE}/devices`, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch devices');
  return response.json();
}

async function registerDevice(deviceName: string): Promise<{ device: SyncDevice }> {
  const response = await fetch(`${API_BASE}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ deviceName }),
  });
  if (!response.ok) throw new Error('Failed to register device');
  return response.json();
}

async function removeDevice(deviceId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/devices/${deviceId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to remove device');
}

async function getSyncState(): Promise<SyncState> {
  const response = await fetch(`${API_BASE}/state`, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to get sync state');
  return response.json();
}

// Reserved for future use
// async function generateDeviceId(): Promise<{ deviceId: string }> {
//   const response = await fetch(`${API_BASE}/device-id`, { credentials: 'include' });
//   if (!response.ok) throw new Error('Failed to generate device ID');
//   return response.json();
// }

// =============================================================================
// Component
// =============================================================================

export function SyncSettings() {
  const confirm = useConfirmModal();
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [adding, setAdding] = useState(false);

  // Get current device ID from localStorage
  const [currentDeviceId] = useState(() => {
    return localStorage.getItem('helixio_device_id');
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [devicesData, stateData] = await Promise.all([
        getDevices(),
        getSyncState(),
      ]);
      setDevices(devicesData.devices);
      setSyncState(stateData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sync data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName.trim()) return;

    setAdding(true);
    setError(null);
    try {
      const { device } = await registerDevice(newDeviceName.trim());

      // Store device ID locally
      localStorage.setItem('helixio_device_id', device.deviceId);

      setSuccess('Device registered successfully');
      setShowAddDevice(false);
      setNewDeviceName('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register device');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveDevice = async (device: SyncDevice) => {
    const confirmed = await confirm({
      title: 'Remove Device',
      message: `Remove "${device.deviceName}" from sync?`,
      confirmText: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;

    setError(null);
    try {
      await removeDevice(device.deviceId);

      // Clear local device ID if this was the current device
      if (device.deviceId === currentDeviceId) {
        localStorage.removeItem('helixio_device_id');
      }

      setSuccess('Device removed');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove device');
    }
  };

  const handleRegisterThisDevice = async () => {
    const defaultName = `${navigator.platform || 'Device'} - ${new Date().toLocaleDateString()}`;
    setNewDeviceName(defaultName);
    setShowAddDevice(true);
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

  if (loading) {
    return (
      <div className="sync-settings">
        <div className="sync-loading">
          <div className="spinner-small" />
          <span>Loading sync settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-settings">
      <h2>Cloud Sync</h2>
      <p className="section-description">
        Sync your reading progress, bookmarks, and annotations across devices.
      </p>

      {error && <div className="sync-error">{error}</div>}
      {success && <div className="sync-success">{success}</div>}

      {/* Sync State */}
      {syncState && (
        <div className="sync-state-card">
          <h3>Sync Status</h3>
          <div className="sync-stats">
            <div className="sync-stat">
              <span className="stat-value">{syncState.progress.total}</span>
              <span className="stat-label">Progress Entries</span>
            </div>
            <div className="sync-stat">
              <span className="stat-value">{syncState.bookmarks.total}</span>
              <span className="stat-label">Bookmarks</span>
            </div>
            <div className="sync-stat">
              <span className="stat-value">{syncState.annotations.total}</span>
              <span className="stat-label">Annotations</span>
            </div>
            <div className="sync-stat">
              <span className="stat-value">v{syncState.currentVersion}</span>
              <span className="stat-label">Sync Version</span>
            </div>
          </div>
        </div>
      )}

      {/* Devices */}
      <div className="sync-devices-section">
        <div className="section-header">
          <h3>Synced Devices</h3>
          {!showAddDevice && !currentDeviceId && (
            <button className="btn-primary" onClick={handleRegisterThisDevice}>
              Register This Device
            </button>
          )}
        </div>

        {devices.length === 0 && !showAddDevice ? (
          <div className="sync-empty">
            <p>No devices registered for sync.</p>
            <button className="btn-secondary" onClick={handleRegisterThisDevice}>
              Get Started
            </button>
          </div>
        ) : (
          <div className="device-list">
            {devices.map((device) => (
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
                    <span>Registered: {new Date(device.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="device-actions">
                  <button
                    className="btn-ghost danger"
                    onClick={() => handleRemoveDevice(device)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Device Form */}
        {showAddDevice && (
          <form className="add-device-form" onSubmit={handleAddDevice}>
            <div className="form-group">
              <label htmlFor="deviceName">Device Name</label>
              <input
                id="deviceName"
                type="text"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                placeholder="e.g., MacBook Pro, iPad, etc."
                autoFocus
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={adding || !newDeviceName.trim()}>
                {adding ? 'Registering...' : 'Register Device'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowAddDevice(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Sync Info */}
      <div className="sync-info-section">
        <h3>How Sync Works</h3>
        <ul>
          <li>Reading progress is automatically synced when you close a comic</li>
          <li>Bookmarks and annotations sync in real-time</li>
          <li>Conflicts are resolved by keeping the most recent change</li>
          <li>Sync requires an internet connection to the Helixio server</li>
        </ul>
      </div>
    </div>
  );
}
