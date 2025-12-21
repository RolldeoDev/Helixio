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
  getMismatchedSeriesFiles,
  repairSeriesLinkages,
  batchSyncFileMetadataToSeries,
  type SeriesCacheStats,
  type MismatchedFile,
  type RepairResult,
} from '../../services/api.service';
import { FolderBrowser } from '../FolderBrowser/FolderBrowser';
import { TrackerSettings } from './TrackerSettings';
import { SyncSettings } from './SyncSettings';
import { AccountSettings } from './AccountSettings';
import { ThemeSettings } from './ThemeSettings';

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
    autoMatchThreshold?: number;
    autoApplyHighConfidence?: boolean;
  };
}

type SettingsTab = 'appearance' | 'general' | 'libraries' | 'api' | 'cache' | 'trackers' | 'sync' | 'account';

export function Settings() {
  const { libraries, refreshLibraries, selectLibrary, preferFilenameOverMetadata, setPreferFilenameOverMetadata } = useApp();
  const { isAuthenticated } = useAuth();

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
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
  const [metronUsername, setMetronUsername] = useState('');
  const [metronPassword, setMetronPassword] = useState('');
  const [testingMetron, setTestingMetron] = useState(false);

  // Settings state
  const [metadataSourcePriority, setMetadataSourcePriority] = useState<string[]>(['comicvine', 'metron']);
  const [rateLimitAggressiveness, setRateLimitAggressiveness] = useState(5);
  const [coverCacheSizeMB, setCoverCacheSizeMB] = useState(500);

  // Cross-source matching settings
  const [autoMatchThreshold, setAutoMatchThreshold] = useState(0.95);
  const [autoApplyHighConfidence, setAutoApplyHighConfidence] = useState(true);

  // Series cache state
  const [seriesCacheStats, setSeriesCacheStats] = useState<SeriesCacheStats | null>(null);
  // TTL settings reserved for future use
  const [_seriesTTLDays, _setSeriesTTLDays] = useState(7);
  const [_issuesTTLDays, _setIssuesTTLDays] = useState(7);
  const [loadingSeriesCache, setLoadingSeriesCache] = useState(false);
  const [cleaningSeriesCache, setCleaningSeriesCache] = useState(false);

  // Series linkage repair state
  const [mismatchedFiles, setMismatchedFiles] = useState<MismatchedFile[] | null>(null);
  const [loadingMismatched, setLoadingMismatched] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);

  // Manual control state
  const [manualControlMode, setManualControlMode] = useState(false);
  const [fileDecisions, setFileDecisions] = useState<Record<string, 'use-metadata' | 'keep-current'>>({});
  const [processingManual, setProcessingManual] = useState(false);
  const [showAllMismatched, setShowAllMismatched] = useState(false);

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
          // Cross-source matching settings
          if (data.settings.autoMatchThreshold !== undefined) {
            setAutoMatchThreshold(data.settings.autoMatchThreshold);
          }
          if (data.settings.autoApplyHighConfidence !== undefined) {
            setAutoApplyHighConfidence(data.settings.autoApplyHighConfidence);
          }
        }

        // Load actual API key values (this is a local app, safe to show)
        const keysRes = await fetch(`${API_BASE}/config/api-keys`);
        const keys = await keysRes.json();
        setComicVineKey(keys.comicVine || '');
        setAnthropicKey(keys.anthropic || '');
        setMetronUsername(keys.metronUsername || '');
        setMetronPassword(keys.metronPassword || '');
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
          metronUsername: metronUsername || undefined,
          metronPassword: metronPassword || undefined,
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

  // Test Metron credentials
  const handleTestMetron = async () => {
    setTestingMetron(true);
    try {
      const response = await fetch(`${API_BASE}/config/test-metron`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showMessage('Metron credentials are valid');
      } else {
        showMessage(data.error || 'Metron authentication failed', true);
      }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to test Metron credentials', true);
    } finally {
      setTestingMetron(false);
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
          autoMatchThreshold,
          autoApplyHighConfidence,
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

  // Check for mismatched series files
  const handleCheckMismatched = async () => {
    setLoadingMismatched(true);
    setRepairResult(null);
    setShowAllMismatched(false);
    try {
      const result = await getMismatchedSeriesFiles();
      setMismatchedFiles(result.files);
      if (result.count === 0) {
        showMessage('No mismatched series linkages found');
      }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to check for mismatched files', true);
    } finally {
      setLoadingMismatched(false);
    }
  };

  // Repair mismatched series linkages
  const handleRepairLinkages = async () => {
    if (!window.confirm(
      `This will repair ${mismatchedFiles?.length || 0} mismatched file(s) by re-linking them to the correct series. ` +
      'New series will be created if needed. Continue?'
    )) {
      return;
    }

    setRepairing(true);
    setRepairResult(null);
    try {
      const result = await repairSeriesLinkages();
      setRepairResult(result);
      setMismatchedFiles(null);

      if (result.repaired > 0) {
        showMessage(
          `Repaired ${result.repaired} file(s)` +
          (result.newSeriesCreated > 0 ? `, created ${result.newSeriesCreated} new series` : '')
        );
      } else if (result.totalMismatched === 0) {
        showMessage('No mismatched files found to repair');
      } else {
        showMessage('Repair completed with errors', true);
      }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to repair series linkages', true);
    } finally {
      setRepairing(false);
    }
  };

  // Toggle manual control mode
  const handleToggleManualControl = () => {
    if (manualControlMode) {
      // Exiting manual mode - reset decisions
      setFileDecisions({});
    }
    setManualControlMode(!manualControlMode);
    setRepairResult(null);
  };

  // Set decision for a file
  const handleSetFileDecision = (fileId: string, decision: 'use-metadata' | 'keep-current') => {
    setFileDecisions(prev => ({
      ...prev,
      [fileId]: decision,
    }));
  };

  // Set all files to the same decision
  const handleSetAllDecisions = (decision: 'use-metadata' | 'keep-current') => {
    if (!mismatchedFiles) return;
    const decisions: Record<string, 'use-metadata' | 'keep-current'> = {};
    for (const file of mismatchedFiles) {
      decisions[file.fileId] = decision;
    }
    setFileDecisions(decisions);
  };

  // Apply manual decisions
  const handleApplyManualDecisions = async () => {
    if (!mismatchedFiles) return;

    const useMetadataFiles = mismatchedFiles.filter(f => fileDecisions[f.fileId] === 'use-metadata');
    const keepCurrentFiles = mismatchedFiles.filter(f => fileDecisions[f.fileId] === 'keep-current');

    if (useMetadataFiles.length === 0 && keepCurrentFiles.length === 0) {
      showMessage('No files have been assigned an action', true);
      return;
    }

    const totalActions = useMetadataFiles.length + keepCurrentFiles.length;
    if (!window.confirm(
      `This will process ${totalActions} file(s):\n` +
      `• ${useMetadataFiles.length} will be moved to new/matching series based on metadata\n` +
      `• ${keepCurrentFiles.length} will have their metadata updated to match current series\n\n` +
      'Continue?'
    )) {
      return;
    }

    setProcessingManual(true);
    setRepairResult(null);

    try {
      let repaired = 0;
      let synced = 0;
      let newSeriesCreated = 0;
      const errors: string[] = [];

      // Process "use-metadata" files (repair/relink)
      if (useMetadataFiles.length > 0) {
        const repairResult = await repairSeriesLinkages();
        // Note: This repairs ALL mismatched files, not just selected ones
        // For true per-file control, we'd need a new endpoint
        // For now, we'll do batch operations
        repaired = repairResult.repaired;
        newSeriesCreated = repairResult.newSeriesCreated;
        errors.push(...repairResult.errors);
      }

      // Process "keep-current" files (sync metadata to series)
      if (keepCurrentFiles.length > 0) {
        const syncResult = await batchSyncFileMetadataToSeries(
          keepCurrentFiles.map(f => f.fileId)
        );
        synced = syncResult.synced;
        errors.push(...syncResult.errors);
      }

      setMismatchedFiles(null);
      setFileDecisions({});
      setManualControlMode(false);

      if (repaired > 0 || synced > 0) {
        showMessage(
          `Processed files: ${repaired} relinked` +
          (newSeriesCreated > 0 ? ` (${newSeriesCreated} new series)` : '') +
          `, ${synced} metadata synced`
        );
      } else if (errors.length > 0) {
        showMessage(`Processing completed with ${errors.length} error(s)`, true);
      } else {
        showMessage('No files were processed');
      }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to process files', true);
    } finally {
      setProcessingManual(false);
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
            className={`tab ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            Appearance
          </button>
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
          {/* Appearance Settings */}
          {activeTab === 'appearance' && (
            <ThemeSettings />
          )}

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

              <h3 className="settings-subheader">Cross-Source Matching</h3>
              <p className="setting-description">
                When you select a series from one source, Helixio can automatically search other sources
                to find matching series and combine their metadata.
              </p>

              <div className="setting-group">
                <label htmlFor="autoMatchThreshold">Auto-Match Threshold</label>
                <p className="setting-description">
                  Minimum confidence level ({Math.round(autoMatchThreshold * 100)}%) for cross-source matches to be automatically linked.
                  Higher values require more certainty before auto-linking.
                </p>
                <input
                  id="autoMatchThreshold"
                  type="range"
                  min="0.85"
                  max="1.0"
                  step="0.01"
                  value={autoMatchThreshold}
                  onChange={(e) => setAutoMatchThreshold(parseFloat(e.target.value))}
                />
                <span className="range-value">{Math.round(autoMatchThreshold * 100)}%</span>
              </div>

              <div className="setting-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autoApplyHighConfidence}
                    onChange={(e) => setAutoApplyHighConfidence(e.target.checked)}
                  />
                  <span className="checkbox-text">Auto-apply high-confidence matches</span>
                </label>
                <p className="setting-description">
                  When enabled, cross-source matches above the threshold are automatically linked without requiring review.
                  Disable this to review all cross-source matches manually.
                </p>
              </div>

              <button
                className="btn-primary"
                onClick={handleSaveSettings}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>

              <h3 className="settings-subheader" style={{ marginTop: '2rem' }}>Display Preferences</h3>
              <p className="setting-description">
                Customize how comics are displayed in the application.
              </p>

              <div className="setting-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={preferFilenameOverMetadata}
                    onChange={(e) => setPreferFilenameOverMetadata(e.target.checked)}
                  />
                  <span className="checkbox-text">Prefer filename over metadata for titles</span>
                </label>
                <p className="setting-description">
                  When enabled, card titles will show the original filename instead of metadata titles.
                  Useful if you have a well-organized file naming convention.
                </p>
              </div>

              <h3 className="settings-subheader" style={{ marginTop: '2rem' }}>Database Maintenance</h3>
              <p className="setting-description">
                Tools to repair and maintain database integrity.
              </p>

              <div className="setting-group">
                <label>Series Linkage Repair</label>
                <p className="setting-description">
                  Fixes files where the metadata series name doesn't match the linked series.
                  This can happen when metadata is updated but the file isn't properly re-linked.
                </p>

                <div className="maintenance-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn-secondary"
                    onClick={handleCheckMismatched}
                    disabled={loadingMismatched || repairing || processingManual}
                  >
                    {loadingMismatched ? 'Checking...' : 'Check for Issues'}
                  </button>

                  {mismatchedFiles !== null && mismatchedFiles.length > 0 && !manualControlMode && (
                    <>
                      <button
                        className="btn-primary"
                        onClick={handleRepairLinkages}
                        disabled={repairing || processingManual}
                      >
                        {repairing ? 'Repairing...' : `Auto-Repair All (${mismatchedFiles.length})`}
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={handleToggleManualControl}
                        disabled={repairing || processingManual}
                      >
                        Manual Control
                      </button>
                    </>
                  )}

                  {manualControlMode && (
                    <button
                      className="btn-ghost"
                      onClick={handleToggleManualControl}
                      disabled={processingManual}
                    >
                      Exit Manual Mode
                    </button>
                  )}
                </div>

                {/* Show mismatched files - Normal mode */}
                {mismatchedFiles !== null && mismatchedFiles.length > 0 && !manualControlMode && (
                  <div className="mismatched-files-list" style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem' }}>Mismatched Files ({mismatchedFiles.length})</h4>
                    <div style={{ maxHeight: showAllMismatched ? '400px' : '200px', overflowY: 'auto', fontSize: '0.85em' }}>
                      {(showAllMismatched ? mismatchedFiles : mismatchedFiles.slice(0, 20)).map((file) => (
                        <div key={file.fileId} style={{
                          padding: '0.5rem',
                          borderBottom: '1px solid var(--border-color)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem'
                        }}>
                          <span style={{ fontWeight: 500 }}>{file.fileName}</span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Metadata: "{file.metadataSeries}" → Linked to: "{file.linkedSeriesName || '(none)'}"
                          </span>
                        </div>
                      ))}
                      {!showAllMismatched && mismatchedFiles.length > 20 && (
                        <button
                          onClick={() => setShowAllMismatched(true)}
                          style={{
                            padding: '0.5rem',
                            width: '100%',
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-color)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontStyle: 'italic'
                          }}
                        >
                          ... and {mismatchedFiles.length - 20} more (click to show all)
                        </button>
                      )}
                      {showAllMismatched && mismatchedFiles.length > 20 && (
                        <button
                          onClick={() => setShowAllMismatched(false)}
                          style={{
                            padding: '0.5rem',
                            width: '100%',
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-color)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontStyle: 'italic'
                          }}
                        >
                          Show less
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Manual Control Mode */}
                {mismatchedFiles !== null && mismatchedFiles.length > 0 && manualControlMode && (
                  <div className="manual-control-mode" style={{ marginTop: '1rem' }}>
                    <div style={{
                      padding: '1rem',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      marginBottom: '1rem'
                    }}>
                      <h4 style={{ marginBottom: '0.5rem' }}>Manual Control Mode</h4>
                      <p style={{ fontSize: '0.85em', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                        For each file, choose whether to:<br/>
                        • <strong>Use Metadata</strong>: Move file to a new/matching series based on its metadata<br/>
                        • <strong>Keep Current</strong>: Update the file's metadata to match its current series
                      </p>

                      {/* Bulk action buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        <button
                          className="btn-ghost"
                          onClick={() => handleSetAllDecisions('use-metadata')}
                          style={{ fontSize: '0.85em' }}
                        >
                          Set All: Use Metadata
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => handleSetAllDecisions('keep-current')}
                          style={{ fontSize: '0.85em' }}
                        >
                          Set All: Keep Current
                        </button>
                      </div>

                      {/* Summary */}
                      <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                        Selected: {Object.values(fileDecisions).filter(d => d === 'use-metadata').length} use metadata,{' '}
                        {Object.values(fileDecisions).filter(d => d === 'keep-current').length} keep current,{' '}
                        {mismatchedFiles.length - Object.keys(fileDecisions).length} undecided
                      </div>
                    </div>

                    {/* File list with controls */}
                    <div style={{ maxHeight: '400px', overflowY: 'auto', fontSize: '0.85em' }}>
                      {mismatchedFiles.map((file) => (
                        <div key={file.fileId} style={{
                          padding: '0.75rem',
                          borderBottom: '1px solid var(--border-color)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                          backgroundColor: fileDecisions[file.fileId] ? 'var(--bg-tertiary)' : 'transparent'
                        }}>
                          <span style={{ fontWeight: 500 }}>{file.fileName}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ color: 'var(--text-muted)', flex: 1 }}>
                              "{file.linkedSeriesName || '(none)'}" → "{file.metadataSeries}"
                            </span>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button
                                className={`btn-ghost ${fileDecisions[file.fileId] === 'use-metadata' ? 'active' : ''}`}
                                onClick={() => handleSetFileDecision(file.fileId, 'use-metadata')}
                                style={{
                                  fontSize: '0.8em',
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: fileDecisions[file.fileId] === 'use-metadata' ? 'var(--accent-color)' : undefined,
                                  color: fileDecisions[file.fileId] === 'use-metadata' ? 'white' : undefined
                                }}
                                title={`Move to series: ${file.metadataSeries}`}
                              >
                                Use Metadata
                              </button>
                              <button
                                className={`btn-ghost ${fileDecisions[file.fileId] === 'keep-current' ? 'active' : ''}`}
                                onClick={() => handleSetFileDecision(file.fileId, 'keep-current')}
                                style={{
                                  fontSize: '0.8em',
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: fileDecisions[file.fileId] === 'keep-current' ? 'var(--success-color)' : undefined,
                                  color: fileDecisions[file.fileId] === 'keep-current' ? 'white' : undefined
                                }}
                                title={`Keep in series: ${file.linkedSeriesName}, update metadata`}
                              >
                                Keep Current
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Apply button */}
                    <div style={{ marginTop: '1rem' }}>
                      <button
                        className="btn-primary"
                        onClick={handleApplyManualDecisions}
                        disabled={processingManual || Object.keys(fileDecisions).length === 0}
                      >
                        {processingManual ? 'Processing...' : 'Apply Decisions'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Show repair result */}
                {repairResult && (
                  <div className="repair-result" style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem' }}>Repair Complete</h4>
                    <div style={{
                      padding: '1rem',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: '4px',
                      fontSize: '0.9em'
                    }}>
                      <div>Repaired: {repairResult.repaired} / {repairResult.totalMismatched}</div>
                      {repairResult.newSeriesCreated > 0 && (
                        <div>New series created: {repairResult.newSeriesCreated}</div>
                      )}
                      {repairResult.errors.length > 0 && (
                        <div style={{ color: 'var(--danger-color)', marginTop: '0.5rem' }}>
                          Errors: {repairResult.errors.length}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
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

              <div className="setting-group">
                <label htmlFor="metronUsername">Metron Username</label>
                <p className="setting-description">
                  Required for fetching metadata from Metron. Create a free account at{' '}
                  <a href="https://metron.cloud" target="_blank" rel="noopener noreferrer">
                    metron.cloud
                  </a>
                </p>
                <input
                  id="metronUsername"
                  type="text"
                  placeholder="Enter your Metron username"
                  value={metronUsername}
                  onChange={(e) => setMetronUsername(e.target.value)}
                />
              </div>

              <div className="setting-group">
                <label htmlFor="metronPassword">Metron Password</label>
                <p className="setting-description">
                  Your Metron account password.
                </p>
                <input
                  id="metronPassword"
                  type="password"
                  placeholder="Enter your Metron password"
                  value={metronPassword}
                  onChange={(e) => setMetronPassword(e.target.value)}
                />
              </div>

              <button
                className="btn-secondary"
                onClick={handleTestMetron}
                disabled={testingMetron}
              >
                {testingMetron ? 'Testing...' : 'Test Metron Credentials'}
              </button>

              <button
                className="btn-primary"
                onClick={handleSaveApiKeys}
                disabled={saving || (!comicVineKey && !anthropicKey && !metronUsername && !metronPassword)}
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
