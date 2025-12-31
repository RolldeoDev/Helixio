/**
 * Settings Component
 *
 * Application settings including API keys, library management,
 * naming conventions, and cache configuration.
 */

import { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../themes/ThemeContext';
import {
  createLibrary,
  deleteLibrary,
  updateLibrary,
  Library,
} from '../../services/api.service';
import {
  getReaderPresetsGrouped,
  applyPresetToLibrary,
  deleteLibraryReaderSettings,
  getLibraryReaderSettings,
  PresetsGrouped,
} from '../../services/api/reading';
import { FolderBrowser } from '../FolderBrowser/FolderBrowser';
import { AccountSettings } from './AccountSettings';
import { AdminSettings } from './AdminSettings';
import { ThemeSettings } from './ThemeSettings';
import { ReaderPresetSettings } from './ReaderPresetSettings';
import { SystemSettings } from './SystemSettings';
import { FileNamingSettings } from './FileNamingSettings';
import { HelixioLoader } from '../HelixioLoader';
import { LibraryScanModal } from '../LibraryScanModal';
import { useLibraryScan } from '../../contexts/LibraryScanContext';
import { ToggleSwitch } from '../ToggleSwitch';
import { SectionCard } from '../SectionCard';
import { useConfirmModal } from '../ConfirmModal';
import { useApiToast } from '../../hooks';

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

type SettingsTab = 'appearance' | 'general' | 'libraries' | 'file-naming' | 'reader' | 'system' | 'account' | 'admin';

export function Settings() {
  const { libraries, refreshLibraries, selectLibrary, preferFilenameOverMetadata, setPreferFilenameOverMetadata, relatedSeriesPosition, setRelatedSeriesPosition } = useApp();
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const confirm = useConfirmModal();
  const { addToast } = useApiToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Library management state
  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [newLibrary, setNewLibrary] = useState<{ name: string; rootPath: string; type: 'western' | 'manga' }>({ name: '', rootPath: '', type: 'western' });
  const [editingLibrary, setEditingLibrary] = useState<Library | null>(null);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [scanningLibrary, setScanningLibrary] = useState<Library | null>(null);

  // Library scan context
  const { startScan, hasActiveScan } = useLibraryScan();

  // Library reader profile state
  const [readerPresets, setReaderPresets] = useState<PresetsGrouped | null>(null);
  const [libraryReaderSettings, setLibraryReaderSettings] = useState<Record<string, { presetId?: string; presetName?: string } | null>>({});
  const [loadingLibraryReaderSettings, setLoadingLibraryReaderSettings] = useState<Record<string, boolean>>({});

  // Settings state
  const [metadataSourcePriority, setMetadataSourcePriority] = useState<string[]>(['comicvine', 'metron']);

  // Cross-source matching settings
  const [autoMatchThreshold, setAutoMatchThreshold] = useState(0.95);
  const [autoApplyHighConfidence, setAutoApplyHighConfidence] = useState(true);

  // Manga classification settings
  const [mangaClassificationEnabled, setMangaClassificationEnabled] = useState(true);
  const [volumePageThreshold, setVolumePageThreshold] = useState(60);
  const [filenameOverridesPageCount, setFilenameOverridesPageCount] = useState(true);

  // Comic (Western) classification settings
  const [comicClassificationEnabled, setComicClassificationEnabled] = useState(true);
  const [issuePageThreshold, setIssuePageThreshold] = useState(50);
  const [omnibusPageThreshold, setOmnibusPageThreshold] = useState(200);
  const [comicFilenameOverridesPageCount, setComicFilenameOverridesPageCount] = useState(true);

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
          // Cross-source matching settings
          if (data.settings.autoMatchThreshold !== undefined) {
            setAutoMatchThreshold(data.settings.autoMatchThreshold);
          }
          if (data.settings.autoApplyHighConfidence !== undefined) {
            setAutoApplyHighConfidence(data.settings.autoApplyHighConfidence);
          }
        }

        // Load manga classification settings
        try {
          const mangaRes = await fetch(`${API_BASE}/config/manga-classification`);
          if (mangaRes.ok) {
            const mangaSettings = await mangaRes.json();
            setMangaClassificationEnabled(mangaSettings.enabled ?? true);
            setVolumePageThreshold(mangaSettings.volumePageThreshold ?? 60);
            setFilenameOverridesPageCount(mangaSettings.filenameOverridesPageCount ?? true);
          }
        } catch {
          // Use defaults if endpoint not available
        }

        // Load comic (Western) classification settings
        try {
          const comicRes = await fetch(`${API_BASE}/config/comic-classification`);
          if (comicRes.ok) {
            const comicSettings = await comicRes.json();
            setComicClassificationEnabled(comicSettings.enabled ?? true);
            setIssuePageThreshold(comicSettings.issuePageThreshold ?? 50);
            setOmnibusPageThreshold(comicSettings.omnibusPageThreshold ?? 200);
            setComicFilenameOverridesPageCount(comicSettings.filenameOverridesPageCount ?? true);
          }
        } catch {
          // Use defaults if endpoint not available
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };

    loadConfiguration();
  }, []);

  // Fetch reader presets when Libraries tab is active
  useEffect(() => {
    if (activeTab === 'libraries' && !readerPresets) {
      getReaderPresetsGrouped().then(setReaderPresets).catch(console.error);
    }
  }, [activeTab, readerPresets]);

  // Fetch reader settings for each library when Libraries tab is active
  useEffect(() => {
    if (activeTab === 'libraries' && libraries.length > 0) {
      libraries.forEach(async (lib) => {
        if (libraryReaderSettings[lib.id] === undefined) {
          setLoadingLibraryReaderSettings(prev => ({ ...prev, [lib.id]: true }));
          try {
            const settings = await getLibraryReaderSettings(lib.id);
            // Settings response includes basedOnPresetId/Name if a preset was applied
            const settingsWithPreset = settings as { basedOnPresetId?: string; basedOnPresetName?: string };
            setLibraryReaderSettings(prev => ({
              ...prev,
              [lib.id]: settingsWithPreset.basedOnPresetId ? {
                presetId: settingsWithPreset.basedOnPresetId,
                presetName: settingsWithPreset.basedOnPresetName
              } : null
            }));
          } catch {
            setLibraryReaderSettings(prev => ({ ...prev, [lib.id]: null }));
          } finally {
            setLoadingLibraryReaderSettings(prev => ({ ...prev, [lib.id]: false }));
          }
        }
      });
    }
  }, [activeTab, libraries, libraryReaderSettings]);

  // Save general settings
  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      // Save general settings
      const response = await fetch(`${API_BASE}/config/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadataSourcePriority,
          autoMatchThreshold,
          autoApplyHighConfidence,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      // Save manga classification settings
      const mangaResponse = await fetch(`${API_BASE}/config/manga-classification`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: mangaClassificationEnabled,
          volumePageThreshold,
          filenameOverridesPageCount,
        }),
      });

      if (!mangaResponse.ok) {
        throw new Error('Failed to save manga classification settings');
      }

      // Save comic (Western) classification settings
      const comicResponse = await fetch(`${API_BASE}/config/comic-classification`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: comicClassificationEnabled,
          issuePageThreshold,
          omnibusPageThreshold,
          filenameOverridesPageCount: comicFilenameOverridesPageCount,
        }),
      });

      if (!comicResponse.ok) {
        throw new Error('Failed to save comic classification settings');
      }

      addToast('success', 'Settings saved successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save settings');
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
      addToast('success', 'Library added successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to add library');
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
        autoCompleteThreshold: editingLibrary.autoCompleteThreshold,
      });
      await refreshLibraries();
      setEditingLibrary(null);
      addToast('success', 'Library updated successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update library');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLibrary = async (library: Library) => {
    const confirmed = await confirm({
      title: 'Delete Library',
      message: `Delete library "${library.name}"? This will remove it from Helixio but will not delete any files.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteLibrary(library.id);
      await refreshLibraries();
      selectLibrary(null);
      addToast('success', 'Library removed successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete library');
    } finally {
      setSaving(false);
    }
  };

  // Start library scan
  const handleScanLibrary = async (library: Library) => {
    setScanningLibrary(library);
    try {
      await startScan(library.id);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to start library scan');
      setScanningLibrary(null);
    }
  };

  if (loading) {
    return (
      <div className="settings-page">
        <div className="loading-overlay">
          <HelixioLoader size="md" message="Loading settings..." />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <img
          src={isDark ? '/helixioNameWhiteText.png' : '/helixioNameBlackText.png'}
          alt="Helixio"
          className="settings-logo"
        />
        {config && <span className="version">v{config.version}</span>}
      </div>

      {loadError && <div className="error-message">{loadError}</div>}

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
            className={`tab ${activeTab === 'file-naming' ? 'active' : ''}`}
            onClick={() => setActiveTab('file-naming')}
          >
            File Naming
          </button>
          <button
            className={`tab ${activeTab === 'reader' ? 'active' : ''}`}
            onClick={() => setActiveTab('reader')}
          >
            Reader
          </button>
          <button
            className={`tab ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => setActiveTab('system')}
          >
            System
          </button>
          {isAuthenticated && (
            <>
              <button
                className={`tab ${activeTab === 'account' ? 'active' : ''}`}
                onClick={() => setActiveTab('account')}
              >
                Account
              </button>
              {isAdmin && (
                <button
                  className={`tab ${activeTab === 'admin' ? 'active' : ''}`}
                  onClick={() => setActiveTab('admin')}
                >
                  Admin
                </button>
              )}
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

              <SectionCard title="Metadata Source Priority" description="Order in which metadata sources are searched">
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
              </SectionCard>

              <SectionCard
                title="Cross-Source Matching"
                description="When you select a series from one source, Helixio can automatically search other sources to find matching series and combine their metadata."
              >
                <div className="setting-group">
                  <label htmlFor="autoMatchThreshold">Auto-Match Threshold</label>
                  <p className="setting-description">
                    Minimum confidence level ({Math.round(autoMatchThreshold * 100)}%) for cross-source matches to be automatically linked.
                    Higher values require more certainty before auto-linking.
                  </p>
                  <div className="range-container">
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
                </div>

                <ToggleSwitch
                  checked={autoApplyHighConfidence}
                  onChange={setAutoApplyHighConfidence}
                  label="Auto-apply high-confidence matches"
                  description="When enabled, cross-source matches above the threshold are automatically linked without requiring review."
                />
              </SectionCard>

              <SectionCard title="Display Preferences" description="Customize how comics are displayed in the application.">
                <ToggleSwitch
                  checked={preferFilenameOverMetadata}
                  onChange={setPreferFilenameOverMetadata}
                  label="Prefer filename over metadata for titles"
                  description="When enabled, card titles will show the original filename instead of metadata titles. Useful if you have a well-organized file naming convention."
                />

                <div className="setting-group" style={{ marginTop: '1rem' }}>
                  <label>Related Series Position</label>
                  <p className="setting-description">
                    Where to display related series on the Series Detail page.
                  </p>
                  <div className="radio-group">
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="relatedSeriesPosition"
                        value="below"
                        checked={relatedSeriesPosition === 'below'}
                        onChange={() => setRelatedSeriesPosition('below')}
                      />
                      Below issues (default)
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="relatedSeriesPosition"
                        value="above"
                        checked={relatedSeriesPosition === 'above'}
                        onChange={() => setRelatedSeriesPosition('above')}
                      />
                      Above issues
                    </label>
                  </div>
                </div>
              </SectionCard>

              <div className="settings-actions">
                <button
                  className="btn-primary"
                  onClick={handleSaveSettings}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
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
                        <div className="setting-group" style={{ marginTop: '0.5rem' }}>
                          <label htmlFor={`autocomplete-${library.id}`}>Auto-complete threshold</label>
                          <p className="setting-description" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                            Automatically mark issues as complete when you exit after reaching this percentage.
                          </p>
                          <select
                            id={`autocomplete-${library.id}`}
                            value={editingLibrary.autoCompleteThreshold ?? 'disabled'}
                            onChange={(e) => {
                              const value = e.target.value;
                              setEditingLibrary({
                                ...editingLibrary,
                                autoCompleteThreshold: value === 'disabled' ? null : parseInt(value, 10),
                              });
                            }}
                          >
                            <option value="disabled">Disabled</option>
                            <option value="90">90%</option>
                            <option value="95">95% (Default)</option>
                            <option value="98">98%</option>
                            <option value="100">100% (Last page only)</option>
                          </select>
                        </div>
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
                          <span className="library-autocomplete muted" style={{ fontSize: '0.85rem' }}>
                            Auto-complete: {library.autoCompleteThreshold !== null && library.autoCompleteThreshold !== undefined
                              ? `${library.autoCompleteThreshold}%`
                              : 'Disabled'}
                          </span>
                          {/* Reader Profile */}
                          <div className="library-reader-profile">
                            <span className="reader-profile-label">Reader:</span>
                            {loadingLibraryReaderSettings[library.id] ? (
                              <span className="reader-profile-value muted">Loading...</span>
                            ) : libraryReaderSettings[library.id]?.presetName ? (
                              <span className="reader-profile-value">{libraryReaderSettings[library.id]?.presetName}</span>
                            ) : (
                              <span className="reader-profile-value muted">Global Defaults</span>
                            )}
                            <select
                              className="reader-profile-select"
                              value={libraryReaderSettings[library.id]?.presetId || ''}
                              onChange={async (e) => {
                                const presetId = e.target.value;
                                if (presetId === '') {
                                  // Clear to use global defaults
                                  await deleteLibraryReaderSettings(library.id);
                                  setLibraryReaderSettings(prev => ({ ...prev, [library.id]: null }));
                                } else {
                                  // Find preset name for display
                                  const allPresets = [...(readerPresets?.bundled || []), ...(readerPresets?.system || []), ...(readerPresets?.user || [])];
                                  const preset = allPresets.find(p => p.id === presetId);
                                  await applyPresetToLibrary(presetId, library.id);
                                  setLibraryReaderSettings(prev => ({
                                    ...prev,
                                    [library.id]: { presetId, presetName: preset?.name || 'Custom' }
                                  }));
                                }
                              }}
                            >
                              <option value="">Use Global Defaults</option>
                              {readerPresets?.bundled?.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                              {readerPresets?.system && readerPresets.system.length > 0 && (
                                <optgroup label="System">
                                  {readerPresets.system.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </optgroup>
                              )}
                              {readerPresets?.user && readerPresets.user.length > 0 && (
                                <optgroup label="My Presets">
                                  {readerPresets.user.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        </div>
                        <div className="library-actions">
                          <button
                            className="btn-ghost"
                            onClick={() => setEditingLibrary(library)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-ghost"
                            onClick={() => handleScanLibrary(library)}
                            disabled={hasActiveScan(library.id)}
                            title={hasActiveScan(library.id) ? 'Scan in progress' : 'Full library scan'}
                          >
                            {hasActiveScan(library.id) ? 'Scanning...' : 'Scan'}
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

              {/* Library Scan Modal */}
              {scanningLibrary && (
                <LibraryScanModal
                  libraryId={scanningLibrary.id}
                  libraryName={scanningLibrary.name}
                  onClose={() => setScanningLibrary(null)}
                />
              )}

              {/* Manga File Classification */}
              <SectionCard
                title="Manga File Classification"
                description="Smart classification of manga files as chapters or volumes based on page count and filename analysis. This applies during the metadata approval workflow."
              >
                <ToggleSwitch
                  checked={mangaClassificationEnabled}
                  onChange={setMangaClassificationEnabled}
                  label="Enable smart chapter/volume classification"
                  description={`Automatically classify manga files during metadata approval. Files with fewer than ${volumePageThreshold} pages are classified as chapters, while files with more pages are classified as volumes.`}
                />

                {mangaClassificationEnabled && (
                  <>
                    <div className="setting-group" style={{ marginTop: '1rem' }}>
                      <label htmlFor="volumeThreshold">Volume Page Threshold</label>
                      <p className="setting-description">
                        Page count at which files are classified as volumes instead of chapters.
                        Files with fewer pages are chapters, files with more are volumes.
                      </p>
                      <div className="range-container">
                        <input
                          id="volumeThreshold"
                          type="range"
                          min="30"
                          max="200"
                          step="10"
                          value={volumePageThreshold}
                          onChange={(e) => setVolumePageThreshold(parseInt(e.target.value, 10))}
                        />
                        <span className="range-value">{volumePageThreshold} pages</span>
                      </div>
                    </div>

                    <ToggleSwitch
                      checked={filenameOverridesPageCount}
                      onChange={setFilenameOverridesPageCount}
                      label="Filename type overrides page count"
                      description="When enabled, explicit type indicators in filenames (e.g., 'Vol 5', 'Ch 12') take precedence over page count-based classification."
                    />
                  </>
                )}
              </SectionCard>

              {/* Western Comic File Classification */}
              <SectionCard
                title="Western Comic Format Classification"
                description="Smart classification of comic files as Issues, TPBs, or Omnibus editions based on page count and filename analysis. This applies during metadata caching and approval."
              >
                <ToggleSwitch
                  checked={comicClassificationEnabled}
                  onChange={setComicClassificationEnabled}
                  label="Enable smart format classification"
                  description={`Automatically classify comic files. Files with fewer than ${issuePageThreshold} pages are classified as Issues, ${issuePageThreshold}-${omnibusPageThreshold} pages as TPBs, and over ${omnibusPageThreshold} pages as Omnibus.`}
                />

                {comicClassificationEnabled && (
                  <>
                    <div className="setting-group" style={{ marginTop: '1rem' }}>
                      <label htmlFor="issueThreshold">Issue Page Threshold</label>
                      <p className="setting-description">
                        Files with fewer than this many pages are classified as single issues.
                      </p>
                      <div className="range-container">
                        <input
                          id="issueThreshold"
                          type="range"
                          min="20"
                          max="100"
                          step="5"
                          value={issuePageThreshold}
                          onChange={(e) => setIssuePageThreshold(parseInt(e.target.value, 10))}
                        />
                        <span className="range-value">{issuePageThreshold} pages</span>
                      </div>
                    </div>

                    <div className="setting-group" style={{ marginTop: '1rem' }}>
                      <label htmlFor="omnibusThreshold">Omnibus Page Threshold</label>
                      <p className="setting-description">
                        Files with more than this many pages are classified as Omnibus editions. Files between the Issue and Omnibus thresholds are classified as TPBs (Trade Paperbacks).
                      </p>
                      <div className="range-container">
                        <input
                          id="omnibusThreshold"
                          type="range"
                          min="100"
                          max="500"
                          step="25"
                          value={omnibusPageThreshold}
                          onChange={(e) => setOmnibusPageThreshold(parseInt(e.target.value, 10))}
                        />
                        <span className="range-value">{omnibusPageThreshold} pages</span>
                      </div>
                    </div>

                    <ToggleSwitch
                      checked={comicFilenameOverridesPageCount}
                      onChange={setComicFilenameOverridesPageCount}
                      label="Filename format overrides page count"
                      description="When enabled, format indicators in filenames (e.g., 'TPB', 'Omnibus', 'Trade Paperback') take precedence over page count-based classification."
                    />
                  </>
                )}

                <div className="settings-actions" style={{ marginTop: '1rem' }}>
                  <button
                    className="btn-primary"
                    onClick={handleSaveSettings}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Classification Settings'}
                  </button>
                </div>
              </SectionCard>
            </div>
          )}

          {/* File Naming Settings */}
          {activeTab === 'file-naming' && (
            <FileNamingSettings />
          )}

          {/* Reader Settings */}
          {activeTab === 'reader' && (
            <div className="settings-section">
              <ReaderPresetSettings />
            </div>
          )}

          {/* System Settings */}
          {activeTab === 'system' && (
            <SystemSettings />
          )}

          {/* Account Settings */}
          {activeTab === 'account' && (
            <AccountSettings />
          )}

          {/* Admin Settings (Admin only) */}
          {activeTab === 'admin' && isAdmin && (
            <AdminSettings />
          )}
        </div>
      </div>
    </div>
  );
}
