/**
 * Settings Component
 *
 * Application settings including API keys, library management,
 * naming conventions, and cache configuration.
 */

import { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  createLibrary,
  deleteLibrary,
  updateLibrary,
  Library,
  getSeriesCacheStats,
  cleanSeriesCache,
  clearSeriesCache,
  type SeriesCacheStats,
} from '../../services/api.service';
import { FolderBrowser } from '../FolderBrowser/FolderBrowser';
import { TrackerSettings } from './TrackerSettings';
import { SyncSettings } from './SyncSettings';
import { AccountSettings } from './AccountSettings';

const API_BASE = '/api';

interface AppConfig {
  version: string;
  apiKeys: {
    comicVine?: string;
    anthropic?: string;
  };
  settings: {
    metadataSourcePriority: string[];
    rateLimitAggressiveness: number;
    coverCacheSizeMB: number;
    logRetentionDays: number;
  };
}

type SettingsTab = 'general' | 'libraries' | 'api' | 'cache' | 'trackers' | 'sync' | 'account';

export function Settings() {
  const { libraries, refreshLibraries, selectLibrary } = useApp();
  const { isAuthenticated } = useAuth();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Library management state
  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [newLibrary, setNewLibrary] = useState<{ name: string; rootPath: string; type: 'western' | 'manga' }>({ name: '', rootPath: '', type: 'western' });
  const [editingLibrary, setEditingLibrary] = useState<Library | null>(null);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);

  // API key state
  const [comicVineKey, setComicVineKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');

  // Settings state
  const [metadataSourcePriority, setMetadataSourcePriority] = useState<string[]>(['comicvine', 'metron']);
  const [rateLimitAggressiveness, setRateLimitAggressiveness] = useState(5);
  const [coverCacheSizeMB, setCoverCacheSizeMB] = useState(500);

  // Series cache state
  const [seriesCacheStats, setSeriesCacheStats] = useState<SeriesCacheStats | null>(null);
  // TTL settings reserved for future use
  const [_seriesTTLDays, _setSeriesTTLDays] = useState(7);
  const [_issuesTTLDays, _setIssuesTTLDays] = useState(7);
  const [loadingSeriesCache, setLoadingSeriesCache] = useState(false);
  const [cleaningSeriesCache, setCleaningSeriesCache] = useState(false);

  // Load configuration
  useEffect(() => {
    const loadConfiguration = async () => {
      setLoading(true);
      try {
        // Load general config
        const configRes = await fetch(`${API_BASE}/config`);
        const data: AppConfig = await configRes.json();
        setConfig(data);

        if (data.settings) {
          setMetadataSourcePriority(data.settings.metadataSourcePriority || ['comicvine', 'metron']);
          setRateLimitAggressiveness(data.settings.rateLimitAggressiveness || 5);
          setCoverCacheSizeMB(data.settings.coverCacheSizeMB || 500);
        }

        // Load actual API key values (this is a local app, safe to show)
        const keysRes = await fetch(`${API_BASE}/config/api-keys`);
        const keys = await keysRes.json();
        setComicVineKey(keys.comicVine || '');
        setAnthropicKey(keys.anthropic || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };

    loadConfiguration();
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

  // Save API keys
  const handleSaveApiKeys = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/config/api-keys`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comicVine: comicVineKey || undefined,
          anthropic: anthropicKey || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save API keys');
      }

      showMessage('API keys saved successfully');
      // Don't clear keys - keep them visible so user can see what was saved
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to save API keys', true);
    } finally {
      setSaving(false);
    }
  };

  // Save general settings
  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/config/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadataSourcePriority,
          rateLimitAggressiveness,
          coverCacheSizeMB,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      showMessage('Settings saved successfully');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to save settings', true);
    } finally {
      setSaving(false);
    }
  };

  // Library management
  const handleAddLibrary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLibrary.name || !newLibrary.rootPath) return;

    setSaving(true);
    try {
      await createLibrary(newLibrary);
      await refreshLibraries();
      setShowAddLibrary(false);
      setNewLibrary({ name: '', rootPath: '', type: 'western' });
      showMessage('Library added successfully');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to add library', true);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLibrary = async () => {
    if (!editingLibrary) return;

    setSaving(true);
    try {
      await updateLibrary(editingLibrary.id, {
        name: editingLibrary.name,
        type: editingLibrary.type,
      });
      await refreshLibraries();
      setEditingLibrary(null);
      showMessage('Library updated successfully');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update library', true);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLibrary = async (library: Library) => {
    if (!window.confirm(`Delete library "${library.name}"? This will remove it from Helixio but will not delete any files.`)) {
      return;
    }

    setSaving(true);
    try {
      await deleteLibrary(library.id);
      await refreshLibraries();
      selectLibrary(null);
      showMessage('Library removed successfully');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete library', true);
    } finally {
      setSaving(false);
    }
  };

  // Clear cover cache
  const handleClearCache = async () => {
    if (!window.confirm('Clear the entire cover cache? Covers will be re-extracted when viewed.')) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/covers/cache/cleanup`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to clear cache');
      }

      showMessage('Cover cache cleared successfully');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to clear cache', true);
    } finally {
      setSaving(false);
    }
  };

  // Load series cache stats
  const loadSeriesCacheStats = async () => {
    setLoadingSeriesCache(true);
    try {
      const stats = await getSeriesCacheStats();
      setSeriesCacheStats(stats);
    } catch (err) {
      console.error('Failed to load series cache stats:', err);
    } finally {
      setLoadingSeriesCache(false);
    }
  };

  // Clean expired series cache entries
  const handleCleanSeriesCache = async () => {
    setCleaningSeriesCache(true);
    try {
      const result = await cleanSeriesCache();
      showMessage(`Cleaned ${result.deleted} expired entries, freed ${result.freedMb.toFixed(1)} MB`);
      await loadSeriesCacheStats();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to clean series cache', true);
    } finally {
      setCleaningSeriesCache(false);
    }
  };

  // Clear all series cache
  const handleClearSeriesCache = async () => {
    if (!window.confirm('Clear all cached series data? This will require re-fetching from APIs when needed.')) {
      return;
    }

    setCleaningSeriesCache(true);
    try {
      const result = await clearSeriesCache();
      showMessage(`Cleared ${result.deleted} entries, freed ${result.freedMb.toFixed(1)} MB`);
      await loadSeriesCacheStats();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to clear series cache', true);
    } finally {
      setCleaningSeriesCache(false);
    }
  };

  // Load series cache stats when cache tab is selected
  useEffect(() => {
    if (activeTab === 'cache' && !seriesCacheStats && !loadingSeriesCache) {
      loadSeriesCacheStats();
    }
  }, [activeTab, seriesCacheStats, loadingSeriesCache]);

  if (loading) {
    return (
      <div className="settings-page">
        <div className="loading-overlay">
          <div className="spinner" />
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Settings</h1>
        {config && <span className="version">v{config.version}</span>}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="settings-content">
        {/* Tab Navigation */}
        <div className="settings-tabs">
          <button
            className={`tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`tab ${activeTab === 'libraries' ? 'active' : ''}`}
            onClick={() => setActiveTab('libraries')}
          >
            Libraries
          </button>
          <button
            className={`tab ${activeTab === 'api' ? 'active' : ''}`}
            onClick={() => setActiveTab('api')}
          >
            API Keys
          </button>
          <button
            className={`tab ${activeTab === 'cache' ? 'active' : ''}`}
            onClick={() => setActiveTab('cache')}
          >
            Cache
          </button>
          {isAuthenticated && (
            <>
              <button
                className={`tab ${activeTab === 'trackers' ? 'active' : ''}`}
                onClick={() => setActiveTab('trackers')}
              >
                Trackers
              </button>
              <button
                className={`tab ${activeTab === 'sync' ? 'active' : ''}`}
                onClick={() => setActiveTab('sync')}
              >
                Sync
              </button>
              <button
                className={`tab ${activeTab === 'account' ? 'active' : ''}`}
                onClick={() => setActiveTab('account')}
              >
                Account
              </button>
            </>
          )}
        </div>

        {/* Tab Content */}
        <div className="settings-panel">
          {/* General Settings */}
          {activeTab === 'general' && (
            <div className="settings-section">
              <h2>General Settings</h2>

              <div className="setting-group">
                <label>Metadata Source Priority</label>
                <p className="setting-description">
                  Order in which metadata sources are searched
                </p>
                <div className="priority-list">
                  {metadataSourcePriority.map((source, index) => (
                    <div key={source} className="priority-item">
                      <span className="priority-number">{index + 1}</span>
                      <span className="priority-name">
                        {source === 'comicvine' ? 'ComicVine' : 'Metron'}
                      </span>
                      <div className="priority-controls">
                        <button
                          className="btn-icon"
                          disabled={index === 0}
                          onClick={() => {
                            const arr = [...metadataSourcePriority];
                            [arr[index - 1], arr[index]] = [arr[index]!, arr[index - 1]!];
                            setMetadataSourcePriority(arr);
                          }}
                        >
                          ↑
                        </button>
                        <button
                          className="btn-icon"
                          disabled={index === metadataSourcePriority.length - 1}
                          onClick={() => {
                            const arr = [...metadataSourcePriority];
                            [arr[index], arr[index + 1]] = [arr[index + 1]!, arr[index]!];
                            setMetadataSourcePriority(arr);
                          }}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="setting-group">
                <label htmlFor="rateLimit">Rate Limit Aggressiveness</label>
                <p className="setting-description">
                  How aggressively to make API requests (1 = conservative, 10 = aggressive)
                </p>
                <input
                  id="rateLimit"
                  type="range"
                  min="1"
                  max="10"
                  value={rateLimitAggressiveness}
                  onChange={(e) => setRateLimitAggressiveness(parseInt(e.target.value, 10))}
                />
                <span className="range-value">{rateLimitAggressiveness}</span>
              </div>

              <button
                className="btn-primary"
                onClick={handleSaveSettings}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}

          {/* Libraries */}
          {activeTab === 'libraries' && (
            <div className="settings-section">
              <h2>Libraries</h2>

              <div className="library-list-settings">
                {libraries.map((library) => (
                  <div key={library.id} className="library-settings-item">
                    {editingLibrary?.id === library.id ? (
                      <div className="library-edit-form">
                        <input
                          type="text"
                          value={editingLibrary.name}
                          onChange={(e) =>
                            setEditingLibrary({ ...editingLibrary, name: e.target.value })
                          }
                        />
                        <select
                          value={editingLibrary.type}
                          onChange={(e) =>
                            setEditingLibrary({
                              ...editingLibrary,
                              type: e.target.value as 'western' | 'manga',
                            })
                          }
                        >
                          <option value="western">Western Comics</option>
                          <option value="manga">Manga</option>
                        </select>
                        <div className="edit-actions">
                          <button className="btn-primary" onClick={handleUpdateLibrary}>
                            Save
                          </button>
                          <button className="btn-ghost" onClick={() => setEditingLibrary(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="library-info">
                          <span className="library-name">{library.name}</span>
                          <span className="library-path">{library.rootPath}</span>
                          <span className="library-type badge">
                            {library.type === 'manga' ? 'Manga' : 'Western'}
                          </span>
                        </div>
                        <div className="library-actions">
                          <button
                            className="btn-ghost"
                            onClick={() => setEditingLibrary(library)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-ghost danger"
                            onClick={() => handleDeleteLibrary(library)}
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {libraries.length === 0 && (
                  <div className="empty-state">
                    <p>No libraries configured</p>
                  </div>
                )}
              </div>

              {showAddLibrary ? (
                <form className="add-library-settings-form" onSubmit={handleAddLibrary}>
                  <input
                    type="text"
                    placeholder="Library Name"
                    value={newLibrary.name}
                    onChange={(e) => setNewLibrary({ ...newLibrary, name: e.target.value })}
                    required
                  />
                  <div className="path-input-group">
                    <input
                      type="text"
                      placeholder="Root Path (e.g., /media/comics)"
                      value={newLibrary.rootPath}
                      onChange={(e) => setNewLibrary({ ...newLibrary, rootPath: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      className="btn-browse"
                      onClick={() => setShowFolderBrowser(true)}
                    >
                      Browse...
                    </button>
                  </div>
                  <select
                    value={newLibrary.type}
                    onChange={(e) =>
                      setNewLibrary({ ...newLibrary, type: e.target.value as 'western' | 'manga' })
                    }
                  >
                    <option value="western">Western Comics</option>
                    <option value="manga">Manga</option>
                  </select>
                  <div className="form-actions">
                    <button type="submit" className="btn-primary" disabled={saving}>
                      Add Library
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setShowAddLibrary(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button className="btn-secondary" onClick={() => setShowAddLibrary(true)}>
                  + Add Library
                </button>
              )}

              <FolderBrowser
                isOpen={showFolderBrowser}
                onClose={() => setShowFolderBrowser(false)}
                onSelect={(path) => setNewLibrary({ ...newLibrary, rootPath: path })}
                initialPath={newLibrary.rootPath}
              />
            </div>
          )}

          {/* API Keys */}
          {activeTab === 'api' && (
            <div className="settings-section">
              <h2>API Keys</h2>
              <p className="section-description">
                API keys are stored locally and never sent to external services except
                when making requests to those specific APIs.
              </p>

              <div className="setting-group">
                <label htmlFor="comicVineKey">ComicVine API Key</label>
                <p className="setting-description">
                  Required for fetching metadata from ComicVine.
                  {config?.apiKeys.comicVine === '***configured***' && (
                    <span className="configured-badge">Configured</span>
                  )}
                </p>
                <input
                  id="comicVineKey"
                  type="password"
                  placeholder={
                    config?.apiKeys.comicVine === '***configured***'
                      ? 'Enter new key to replace'
                      : 'Enter your ComicVine API key'
                  }
                  value={comicVineKey}
                  onChange={(e) => setComicVineKey(e.target.value)}
                />
              </div>

              <div className="setting-group">
                <label htmlFor="anthropicKey">Anthropic API Key</label>
                <p className="setting-description">
                  Required for LLM-powered filename parsing.
                  {config?.apiKeys.anthropic === '***configured***' && (
                    <span className="configured-badge">Configured</span>
                  )}
                </p>
                <input
                  id="anthropicKey"
                  type="password"
                  placeholder={
                    config?.apiKeys.anthropic === '***configured***'
                      ? 'Enter new key to replace'
                      : 'Enter your Anthropic API key'
                  }
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                />
              </div>

              <button
                className="btn-primary"
                onClick={handleSaveApiKeys}
                disabled={saving || (!comicVineKey && !anthropicKey)}
              >
                {saving ? 'Saving...' : 'Save API Keys'}
              </button>
            </div>
          )}

          {/* Cache Settings */}
          {activeTab === 'cache' && (
            <div className="settings-section">
              <h2>Cache Settings</h2>

              {/* Cover Cache */}
              <div className="cache-subsection">
                <h3>Cover Cache</h3>
                <div className="setting-group">
                  <label htmlFor="cacheSize">Cover Cache Size Limit</label>
                  <p className="setting-description">
                    Maximum disk space for cached cover images (in MB)
                  </p>
                  <input
                    id="cacheSize"
                    type="number"
                    min="100"
                    max="10000"
                    step="100"
                    value={coverCacheSizeMB}
                    onChange={(e) => setCoverCacheSizeMB(parseInt(e.target.value, 10))}
                  />
                  <span className="unit">MB</span>
                </div>

                <button
                  className="btn-primary"
                  onClick={handleSaveSettings}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Cache Settings'}
                </button>

                <div className="cache-actions">
                  <button
                    className="btn-secondary"
                    onClick={handleClearCache}
                    disabled={saving}
                  >
                    Clear Cover Cache
                  </button>
                  <p className="setting-description">
                    Remove all cached cover images. They will be re-extracted when viewed.
                  </p>
                </div>
              </div>

              {/* Series Cache */}
              <div className="cache-subsection">
                <h3>Series & Issue Cache</h3>
                <p className="setting-description">
                  Cached metadata from ComicVine and Metron to reduce API calls.
                </p>

                {loadingSeriesCache ? (
                  <div className="cache-stats-loading">
                    <div className="spinner-small" />
                    <span>Loading cache statistics...</span>
                  </div>
                ) : seriesCacheStats ? (
                  <div className="cache-stats">
                    <div className="stat-grid">
                      <div className="stat-item">
                        <span className="stat-value">{seriesCacheStats.totalEntries}</span>
                        <span className="stat-label">Total Entries</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-value">{seriesCacheStats.entriesWithIssues}</span>
                        <span className="stat-label">With Issues</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-value">{seriesCacheStats.totalSizeMb.toFixed(1)} MB</span>
                        <span className="stat-label">Total Size</span>
                      </div>
                    </div>
                    {seriesCacheStats.bySource && (
                      <div className="cache-by-source">
                        {Object.entries(seriesCacheStats.bySource).map(([source, count]) => (
                          <span key={source} className="source-badge">
                            {source}: {count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button className="btn-ghost" onClick={loadSeriesCacheStats}>
                    Load Statistics
                  </button>
                )}

                <div className="cache-actions">
                  <button
                    className="btn-secondary"
                    onClick={handleCleanSeriesCache}
                    disabled={cleaningSeriesCache}
                  >
                    {cleaningSeriesCache ? 'Cleaning...' : 'Clean Expired Entries'}
                  </button>
                  <button
                    className="btn-secondary danger"
                    onClick={handleClearSeriesCache}
                    disabled={cleaningSeriesCache}
                  >
                    {cleaningSeriesCache ? 'Clearing...' : 'Clear All Series Cache'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Trackers Settings */}
          {activeTab === 'trackers' && (
            <TrackerSettings />
          )}

          {/* Sync Settings */}
          {activeTab === 'sync' && (
            <SyncSettings />
          )}

          {/* Account Settings */}
          {activeTab === 'account' && (
            <AccountSettings />
          )}
        </div>
      </div>
    </div>
  );
}
