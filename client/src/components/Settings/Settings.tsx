/**
 * Settings Component
 *
 * Application settings including API keys, library management,
 * naming conventions, and cache configuration.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../themes/ThemeContext';
import { AccountSettings } from './AccountSettings';
import { AdminSettings } from './AdminSettings';
import { ThemeSettings } from './ThemeSettings';
import { ReaderPresetSettings } from './ReaderPresetSettings';
import { SystemSettings } from './SystemSettings';
import { FileNamingSettings } from './FileNamingSettings';
import { LibrarySettingsTab } from './LibrarySettingsTab';
import { HelixioLoader } from '../HelixioLoader';
import { SectionCard } from '../SectionCard';
import { ToggleSwitch } from '../ToggleSwitch';
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

const VALID_TABS: SettingsTab[] = ['appearance', 'general', 'libraries', 'file-naming', 'reader', 'system', 'account', 'admin'];

function isValidTab(tab: string | null): tab is SettingsTab {
  return tab !== null && VALID_TABS.includes(tab as SettingsTab);
}

export function Settings() {
  const { preferFilenameOverMetadata, setPreferFilenameOverMetadata, relatedSeriesPosition, setRelatedSeriesPosition } = useApp();
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const { addToast } = useApiToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get initial tab from URL or default to 'appearance'
  const tabParam = searchParams.get('tab');
  const initialTab = isValidTab(tabParam) ? tabParam : 'appearance';
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Update URL when tab changes
  const handleTabChange = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Settings state
  const [metadataSourcePriority, setMetadataSourcePriority] = useState<string[]>(['comicvine', 'metron']);

  // Cross-source matching settings
  const [autoMatchThreshold, setAutoMatchThreshold] = useState(0.95);
  const [autoApplyHighConfidence, setAutoApplyHighConfidence] = useState(true);

  // Load configuration
  useEffect(() => {
    const loadConfiguration = async () => {
      setLoading(true);
      try {
        // Load general config
        const configRes = await fetch(`${API_BASE}/config`);
        if (!configRes.ok) {
          throw new Error(`Failed to load configuration: ${configRes.status} ${configRes.statusText}`);
        }
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

      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };

    loadConfiguration();
  }, []);

  // Save general settings
  const handleSaveSettings = async () => {
    setSaving(true);
    try {
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

      addToast('success', 'Settings saved successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
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
            onClick={() => handleTabChange('appearance')}
          >
            Appearance
          </button>
          <button
            className={`tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => handleTabChange('general')}
          >
            General
          </button>
          <button
            className={`tab ${activeTab === 'libraries' ? 'active' : ''}`}
            onClick={() => handleTabChange('libraries')}
          >
            Libraries
          </button>
          <button
            className={`tab ${activeTab === 'file-naming' ? 'active' : ''}`}
            onClick={() => handleTabChange('file-naming')}
          >
            File Naming
          </button>
          <button
            className={`tab ${activeTab === 'reader' ? 'active' : ''}`}
            onClick={() => handleTabChange('reader')}
          >
            Reader
          </button>
          <button
            className={`tab ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => handleTabChange('system')}
          >
            System
          </button>
          {isAuthenticated && (
            <>
              <button
                className={`tab ${activeTab === 'account' ? 'active' : ''}`}
                onClick={() => handleTabChange('account')}
              >
                Account
              </button>
              {isAdmin && (
                <button
                  className={`tab ${activeTab === 'admin' ? 'active' : ''}`}
                  onClick={() => handleTabChange('admin')}
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
            <LibrarySettingsTab />
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
