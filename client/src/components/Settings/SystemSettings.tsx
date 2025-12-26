/**
 * System Settings Component
 *
 * Consolidates API Keys, Cache, Rate Limiting, Database Maintenance, and Factory Reset.
 */

import { useState, useEffect } from 'react';
import {
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
import { SectionCard } from '../SectionCard';
import { FactoryResetModal, FactoryResetSection } from '../FactoryReset';
import './SystemSettings.css';

const API_BASE = '/api';

interface AppConfig {
  version: string;
  apiKeys: {
    comicVine?: string;
    anthropic?: string;
  };
  settings?: {
    rateLimitAggressiveness?: number;
    coverCacheSizeMB?: number;
  };
}

export function SystemSettings() {
  // Config state (fetched internally)
  const [config, setConfig] = useState<AppConfig | null>(null);
  // API key state
  const [comicVineKey, setComicVineKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [metronUsername, setMetronUsername] = useState('');
  const [metronPassword, setMetronPassword] = useState('');
  const [testingMetron, setTestingMetron] = useState(false);
  const [testingComicVine, setTestingComicVine] = useState(false);
  const [testingAnthropic, setTestingAnthropic] = useState(false);
  const [comicVineTestResult, setComicVineTestResult] = useState<'success' | 'error' | null>(null);
  const [anthropicTestResult, setAnthropicTestResult] = useState<'success' | 'error' | null>(null);
  const [metronTestResult, setMetronTestResult] = useState<'success' | 'error' | null>(null);
  const [savingKeys, setSavingKeys] = useState(false);

  // Rate limiting state
  const [rateLimitAggressiveness, setRateLimitAggressiveness] = useState(5);
  const [savingRateLimit, setSavingRateLimit] = useState(false);

  // Cache state
  const [coverCacheSizeMB, setCoverCacheSizeMB] = useState(500);
  const [savingCacheSettings, setSavingCacheSettings] = useState(false);
  const [clearingCoverCache, setClearingCoverCache] = useState(false);

  // Series cache state
  const [seriesCacheStats, setSeriesCacheStats] = useState<SeriesCacheStats | null>(null);
  const [loadingSeriesCache, setLoadingSeriesCache] = useState(false);
  const [cleaningSeriesCache, setCleaningSeriesCache] = useState(false);

  // Download cache state
  const [downloadCacheStats, setDownloadCacheStats] = useState<{
    totalFiles: number;
    totalSizeBytes: number;
    jobCount: number;
    oldestJob: string | null;
    newestJob: string | null;
  } | null>(null);
  const [loadingDownloadCache, setLoadingDownloadCache] = useState(false);
  const [clearingDownloadCache, setClearingDownloadCache] = useState(false);

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

  // Factory reset modal state
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);

  // API key help modal state
  const [helpModal, setHelpModal] = useState<'comicVine' | 'anthropic' | null>(null);

  // Messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Load API keys
      const keysRes = await fetch(`${API_BASE}/config/api-keys`);
      const keys = await keysRes.json();
      setComicVineKey(keys.comicVine || '');
      setAnthropicKey(keys.anthropic || '');
      setMetronUsername(keys.metronUsername || '');
      setMetronPassword(keys.metronPassword || '');

      // Load general settings and config
      const configRes = await fetch(`${API_BASE}/config`);
      const data = await configRes.json();
      setConfig(data);
      if (data.settings) {
        setRateLimitAggressiveness(data.settings.rateLimitAggressiveness || 5);
        setCoverCacheSizeMB(data.settings.coverCacheSizeMB || 500);
      }

      // Load cache stats
      loadSeriesCacheStats();
      loadDownloadCacheStats();
    } catch (err) {
      console.error('Failed to load system settings:', err);
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

  // API Key handlers
  const handleSaveApiKeys = async () => {
    setSavingKeys(true);
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

      if (!response.ok) throw new Error('Failed to save API keys');
      showMessage('API keys saved successfully');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to save API keys', true);
    } finally {
      setSavingKeys(false);
    }
  };

  const handleTestMetron = async () => {
    setTestingMetron(true);
    setMetronTestResult(null);
    try {
      const response = await fetch(`${API_BASE}/config/test-metron`, { method: 'POST' });
      const data = await response.json();

      if (response.ok && data.success) {
        setMetronTestResult('success');
        showMessage('Metron credentials are valid');
      } else {
        setMetronTestResult('error');
        showMessage(data.error || 'Metron authentication failed', true);
      }
    } catch (err) {
      setMetronTestResult('error');
      showMessage(err instanceof Error ? err.message : 'Failed to test Metron credentials', true);
    } finally {
      setTestingMetron(false);
    }
  };

  const handleTestComicVine = async () => {
    setTestingComicVine(true);
    setComicVineTestResult(null);
    try {
      const response = await fetch(`${API_BASE}/config/test-comicvine`, { method: 'POST' });
      const data = await response.json();

      if (response.ok && data.success) {
        setComicVineTestResult('success');
        showMessage('ComicVine API key is valid');
      } else {
        setComicVineTestResult('error');
        showMessage(data.error || 'ComicVine API key validation failed', true);
      }
    } catch (err) {
      setComicVineTestResult('error');
      showMessage(err instanceof Error ? err.message : 'Failed to test ComicVine API key', true);
    } finally {
      setTestingComicVine(false);
    }
  };

  const handleTestAnthropic = async () => {
    setTestingAnthropic(true);
    setAnthropicTestResult(null);
    try {
      const response = await fetch(`${API_BASE}/config/test-anthropic`, { method: 'POST' });
      const data = await response.json();

      if (response.ok && data.success) {
        setAnthropicTestResult('success');
        showMessage('Anthropic API key is valid');
      } else {
        setAnthropicTestResult('error');
        showMessage(data.error || 'Anthropic API key validation failed', true);
      }
    } catch (err) {
      setAnthropicTestResult('error');
      showMessage(err instanceof Error ? err.message : 'Failed to test Anthropic API key', true);
    } finally {
      setTestingAnthropic(false);
    }
  };

  // Rate limit handler
  const handleSaveRateLimit = async () => {
    setSavingRateLimit(true);
    try {
      const response = await fetch(`${API_BASE}/config/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateLimitAggressiveness }),
      });

      if (!response.ok) throw new Error('Failed to save rate limit settings');
      showMessage('Rate limit settings saved');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to save settings', true);
    } finally {
      setSavingRateLimit(false);
    }
  };

  // Cache handlers
  const handleSaveCacheSettings = async () => {
    setSavingCacheSettings(true);
    try {
      const response = await fetch(`${API_BASE}/config/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverCacheSizeMB }),
      });

      if (!response.ok) throw new Error('Failed to save cache settings');
      showMessage('Cache settings saved');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to save cache settings', true);
    } finally {
      setSavingCacheSettings(false);
    }
  };

  const handleClearCoverCache = async () => {
    if (!window.confirm('Clear the entire cover cache? Covers will be re-extracted when viewed.')) {
      return;
    }

    setClearingCoverCache(true);
    try {
      const response = await fetch(`${API_BASE}/covers/cache/cleanup`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to clear cache');
      showMessage('Cover cache cleared successfully');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to clear cache', true);
    } finally {
      setClearingCoverCache(false);
    }
  };

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

  const loadDownloadCacheStats = async () => {
    setLoadingDownloadCache(true);
    try {
      const response = await fetch(`${API_BASE}/downloads/cache/stats`);
      if (response.ok) {
        const stats = await response.json();
        setDownloadCacheStats(stats);
      }
    } catch (err) {
      console.error('Failed to load download cache stats:', err);
    } finally {
      setLoadingDownloadCache(false);
    }
  };

  const handleClearDownloadCache = async () => {
    if (!window.confirm('Clear all download cache files? Prepared ZIP files will be deleted.')) {
      return;
    }

    setClearingDownloadCache(true);
    try {
      const response = await fetch(`${API_BASE}/downloads/cache`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to clear download cache');

      const result = await response.json();
      const freedMb = (result.bytesFreed / (1024 * 1024)).toFixed(1);
      showMessage(`Cleared ${result.filesDeleted} file(s), freed ${freedMb} MB`);
      await loadDownloadCacheStats();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to clear download cache', true);
    } finally {
      setClearingDownloadCache(false);
    }
  };

  // Database maintenance handlers
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

  const handleRepairLinkages = async () => {
    if (!window.confirm(
      `This will repair ${mismatchedFiles?.length || 0} mismatched file(s). Continue?`
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

  const handleToggleManualControl = () => {
    if (manualControlMode) {
      setFileDecisions({});
    }
    setManualControlMode(!manualControlMode);
    setRepairResult(null);
  };

  const handleSetFileDecision = (fileId: string, decision: 'use-metadata' | 'keep-current') => {
    setFileDecisions(prev => ({ ...prev, [fileId]: decision }));
  };

  const handleSetAllDecisions = (decision: 'use-metadata' | 'keep-current') => {
    if (!mismatchedFiles) return;
    const decisions: Record<string, 'use-metadata' | 'keep-current'> = {};
    for (const file of mismatchedFiles) {
      decisions[file.fileId] = decision;
    }
    setFileDecisions(decisions);
  };

  const handleApplyManualDecisions = async () => {
    if (!mismatchedFiles) return;

    const useMetadataFiles = mismatchedFiles.filter(f => fileDecisions[f.fileId] === 'use-metadata');
    const keepCurrentFiles = mismatchedFiles.filter(f => fileDecisions[f.fileId] === 'keep-current');

    if (useMetadataFiles.length === 0 && keepCurrentFiles.length === 0) {
      showMessage('No files have been assigned an action', true);
      return;
    }

    const totalActions = useMetadataFiles.length + keepCurrentFiles.length;
    if (!window.confirm(`Process ${totalActions} file(s)?`)) {
      return;
    }

    setProcessingManual(true);
    setRepairResult(null);

    try {
      let repaired = 0;
      let synced = 0;
      let newSeriesCreated = 0;
      const errors: string[] = [];

      if (useMetadataFiles.length > 0) {
        const repairResult = await repairSeriesLinkages();
        repaired = repairResult.repaired;
        newSeriesCreated = repairResult.newSeriesCreated;
        errors.push(...repairResult.errors);
      }

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
          `Processed: ${repaired} relinked` +
          (newSeriesCreated > 0 ? ` (${newSeriesCreated} new series)` : '') +
          `, ${synced} metadata synced`
        );
      } else if (errors.length > 0) {
        showMessage(`Processing completed with ${errors.length} error(s)`, true);
      }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to process files', true);
    } finally {
      setProcessingManual(false);
    }
  };

  return (
    <div className="system-settings">
      <h2>System Settings</h2>

      {error && <div className="system-error">{error}</div>}
      {success && <div className="system-success">{success}</div>}

      {/* API Keys Section */}
      <SectionCard
        title="API Keys"
        description="Credentials for external metadata services. Stored locally."
      >
        <div className="setting-group">
          <div className="label-with-help">
            <label htmlFor="comicVineKey">ComicVine API Key</label>
            <button
              type="button"
              className="help-btn"
              onClick={() => setHelpModal('comicVine')}
              title="How to get a ComicVine API key"
            >
              ?
            </button>
          </div>
          <p className="setting-description">
            Required for fetching metadata from ComicVine.
            {config?.apiKeys.comicVine === '***configured***' && (
              <span className="configured-badge">Configured</span>
            )}
          </p>
          <div className="api-key-input-row">
            <input
              id="comicVineKey"
              type="password"
              placeholder={
                config?.apiKeys.comicVine === '***configured***'
                  ? 'Enter new key to replace'
                  : 'Enter your ComicVine API key'
              }
              value={comicVineKey}
              onChange={(e) => {
                setComicVineKey(e.target.value);
                setComicVineTestResult(null);
              }}
            />
            {(comicVineKey || config?.apiKeys.comicVine === '***configured***') && (
              <button
                type="button"
                className="test-api-btn"
                onClick={handleTestComicVine}
                disabled={testingComicVine}
                title="Test API key"
              >
                {testingComicVine ? (
                  <span className="test-spinner" />
                ) : comicVineTestResult === 'success' ? (
                  <span className="test-result success">✓</span>
                ) : comicVineTestResult === 'error' ? (
                  <span className="test-result error">✕</span>
                ) : (
                  'Test'
                )}
              </button>
            )}
          </div>
        </div>

        <div className="setting-group">
          <div className="label-with-help">
            <label htmlFor="anthropicKey">Anthropic API Key</label>
            <button
              type="button"
              className="help-btn"
              onClick={() => setHelpModal('anthropic')}
              title="How to get an Anthropic API key"
            >
              ?
            </button>
          </div>
          <p className="setting-description">
            Required for LLM-powered filename parsing.
            {config?.apiKeys.anthropic === '***configured***' && (
              <span className="configured-badge">Configured</span>
            )}
          </p>
          <div className="api-key-input-row">
            <input
              id="anthropicKey"
              type="password"
              placeholder={
                config?.apiKeys.anthropic === '***configured***'
                  ? 'Enter new key to replace'
                  : 'Enter your Anthropic API key'
              }
              value={anthropicKey}
              onChange={(e) => {
                setAnthropicKey(e.target.value);
                setAnthropicTestResult(null);
              }}
            />
            {(anthropicKey || config?.apiKeys.anthropic === '***configured***') && (
              <button
                type="button"
                className="test-api-btn"
                onClick={handleTestAnthropic}
                disabled={testingAnthropic}
                title="Test API key"
              >
                {testingAnthropic ? (
                  <span className="test-spinner" />
                ) : anthropicTestResult === 'success' ? (
                  <span className="test-result success">✓</span>
                ) : anthropicTestResult === 'error' ? (
                  <span className="test-result error">✕</span>
                ) : (
                  'Test'
                )}
              </button>
            )}
          </div>
        </div>

        <div className="setting-group">
          <label htmlFor="metronUsername">Metron Username</label>
          <p className="setting-description">
            Create a free account at{' '}
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
          <input
            id="metronPassword"
            type="password"
            placeholder="Enter your Metron password"
            value={metronPassword}
            onChange={(e) => setMetronPassword(e.target.value)}
          />
        </div>

        <div className="button-group">
          {(metronUsername || metronPassword) && (
            <button
              className="btn-secondary test-metron-btn"
              onClick={handleTestMetron}
              disabled={testingMetron}
            >
              {testingMetron ? (
                <>
                  <span className="test-spinner" />
                  Testing...
                </>
              ) : metronTestResult === 'success' ? (
                <>
                  <span className="test-result success">✓</span>
                  Valid
                </>
              ) : metronTestResult === 'error' ? (
                <>
                  <span className="test-result error">✕</span>
                  Invalid
                </>
              ) : (
                'Test Metron'
              )}
            </button>
          )}
          <button
            className="btn-primary"
            onClick={handleSaveApiKeys}
            disabled={savingKeys || (!comicVineKey && !anthropicKey && !metronUsername && !metronPassword)}
          >
            {savingKeys ? 'Saving...' : 'Save API Keys'}
          </button>
        </div>
      </SectionCard>

      {/* Rate Limiting Section */}
      <SectionCard
        title="Rate Limiting"
        description="Control how aggressively the app makes API requests."
      >
        <div className="setting-group">
          <label htmlFor="rateLimit">Aggressiveness Level</label>
          <p className="setting-description">
            1 = conservative (slower, safer), 10 = aggressive (faster, may hit rate limits)
          </p>
          <div className="range-container">
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
        </div>

        <button
          className="btn-primary"
          onClick={handleSaveRateLimit}
          disabled={savingRateLimit}
        >
          {savingRateLimit ? 'Saving...' : 'Save Rate Limit'}
        </button>
      </SectionCard>

      {/* Cache Management Section */}
      <SectionCard
        title="Cache Management"
        description="Manage cached data to optimize performance and disk usage."
      >
        {/* Cover Cache */}
        <div className="cache-subsection">
          <h4>Cover Cache</h4>
          <div className="setting-group">
            <label htmlFor="cacheSize">Size Limit (MB)</label>
            <div className="number-input-container">
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
          </div>

          <div className="button-group">
            <button
              className="btn-secondary"
              onClick={handleClearCoverCache}
              disabled={clearingCoverCache}
            >
              {clearingCoverCache ? 'Clearing...' : 'Clear Cover Cache'}
            </button>
            <button
              className="btn-primary"
              onClick={handleSaveCacheSettings}
              disabled={savingCacheSettings}
            >
              {savingCacheSettings ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Series Cache */}
        <div className="cache-subsection">
          <h4>Series & Issue Cache</h4>
          <p className="setting-description">
            Cached metadata from ComicVine and Metron.
          </p>

          {loadingSeriesCache ? (
            <div className="cache-loading">
              <div className="spinner-small" />
              <span>Loading...</span>
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

          <div className="button-group">
            <button
              className="btn-secondary"
              onClick={handleCleanSeriesCache}
              disabled={cleaningSeriesCache}
            >
              {cleaningSeriesCache ? 'Cleaning...' : 'Clean Expired'}
            </button>
            <button
              className="btn-secondary danger"
              onClick={handleClearSeriesCache}
              disabled={cleaningSeriesCache}
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Download Cache */}
        <div className="cache-subsection">
          <h4>Download Cache</h4>
          <p className="setting-description">
            Prepared ZIP files for bulk downloads.
          </p>

          {loadingDownloadCache ? (
            <div className="cache-loading">
              <div className="spinner-small" />
              <span>Loading...</span>
            </div>
          ) : downloadCacheStats ? (
            <div className="cache-stats">
              <div className="stat-grid">
                <div className="stat-item">
                  <span className="stat-value">{downloadCacheStats.totalFiles}</span>
                  <span className="stat-label">ZIP Files</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">
                    {downloadCacheStats.totalSizeBytes >= 1024 * 1024 * 1024
                      ? `${(downloadCacheStats.totalSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                      : `${(downloadCacheStats.totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
                  <span className="stat-label">Total Size</span>
                </div>
              </div>
            </div>
          ) : (
            <button className="btn-ghost" onClick={loadDownloadCacheStats}>
              Load Statistics
            </button>
          )}

          <button
            className="btn-secondary danger"
            onClick={handleClearDownloadCache}
            disabled={clearingDownloadCache || (downloadCacheStats?.totalFiles === 0)}
          >
            {clearingDownloadCache ? 'Clearing...' : 'Clear Download Cache'}
          </button>
        </div>
      </SectionCard>

      {/* Database Maintenance Section */}
      <SectionCard
        title="Database Maintenance"
        description="Tools to repair and maintain database integrity."
      >
        <div className="setting-group">
          <label>Series Linkage Repair</label>
          <p className="setting-description">
            Fixes files where the metadata series name doesn't match the linked series.
          </p>

          <div className="button-group">
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

          {/* Mismatched files list - Normal mode */}
          {mismatchedFiles !== null && mismatchedFiles.length > 0 && !manualControlMode && (
            <div className="mismatched-files-list">
              <h5>Mismatched Files ({mismatchedFiles.length})</h5>
              <div className="files-scroll-container">
                {(showAllMismatched ? mismatchedFiles : mismatchedFiles.slice(0, 10)).map((file) => (
                  <div key={file.fileId} className="mismatched-file-item">
                    <span className="file-name">{file.fileName}</span>
                    <span className="file-meta">
                      Metadata: "{file.metadataSeries}" → Linked to: "{file.linkedSeriesName || '(none)'}"
                    </span>
                  </div>
                ))}
                {!showAllMismatched && mismatchedFiles.length > 10 && (
                  <button
                    className="show-more-btn"
                    onClick={() => setShowAllMismatched(true)}
                  >
                    ... and {mismatchedFiles.length - 10} more
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Manual Control Mode */}
          {mismatchedFiles !== null && mismatchedFiles.length > 0 && manualControlMode && (
            <div className="manual-control-mode">
              <div className="manual-control-header">
                <h5>Manual Control Mode</h5>
                <p className="setting-description">
                  <strong>Use Metadata</strong>: Move file to new/matching series<br/>
                  <strong>Keep Current</strong>: Update file's metadata to match current series
                </p>
              </div>

              <div className="bulk-actions">
                <button className="btn-ghost" onClick={() => handleSetAllDecisions('use-metadata')}>
                  Set All: Use Metadata
                </button>
                <button className="btn-ghost" onClick={() => handleSetAllDecisions('keep-current')}>
                  Set All: Keep Current
                </button>
              </div>

              <div className="decision-summary">
                Selected: {Object.values(fileDecisions).filter(d => d === 'use-metadata').length} use metadata,{' '}
                {Object.values(fileDecisions).filter(d => d === 'keep-current').length} keep current,{' '}
                {mismatchedFiles.length - Object.keys(fileDecisions).length} undecided
              </div>

              <div className="files-scroll-container">
                {mismatchedFiles.map((file) => (
                  <div
                    key={file.fileId}
                    className={`manual-file-item ${fileDecisions[file.fileId] ? 'decided' : ''}`}
                  >
                    <div className="file-info">
                      <span className="file-name">{file.fileName}</span>
                      <span className="file-meta">
                        "{file.linkedSeriesName || '(none)'}" → "{file.metadataSeries}"
                      </span>
                    </div>
                    <div className="decision-buttons">
                      <button
                        className={`btn-decision ${fileDecisions[file.fileId] === 'use-metadata' ? 'active-metadata' : ''}`}
                        onClick={() => handleSetFileDecision(file.fileId, 'use-metadata')}
                      >
                        Use Metadata
                      </button>
                      <button
                        className={`btn-decision ${fileDecisions[file.fileId] === 'keep-current' ? 'active-keep' : ''}`}
                        onClick={() => handleSetFileDecision(file.fileId, 'keep-current')}
                      >
                        Keep Current
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="btn-primary"
                onClick={handleApplyManualDecisions}
                disabled={processingManual || Object.keys(fileDecisions).length === 0}
              >
                {processingManual ? 'Processing...' : 'Apply Decisions'}
              </button>
            </div>
          )}

          {/* Repair result */}
          {repairResult && (
            <div className="repair-result">
              <h5>Repair Complete</h5>
              <div className="result-details">
                <div>Repaired: {repairResult.repaired} / {repairResult.totalMismatched}</div>
                {repairResult.newSeriesCreated > 0 && (
                  <div>New series created: {repairResult.newSeriesCreated}</div>
                )}
                {repairResult.errors.length > 0 && (
                  <div className="error-count">Errors: {repairResult.errors.length}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Factory Reset Section */}
      <SectionCard
        title="Danger Zone"
        description="Irreversible actions that reset your data."
        variant="danger"
      >
        <FactoryResetSection onShowModal={() => setShowFactoryResetModal(true)} />
      </SectionCard>

      {/* Factory Reset Modal */}
      <FactoryResetModal
        isOpen={showFactoryResetModal}
        onClose={() => setShowFactoryResetModal(false)}
      />

      {/* API Key Help Modal */}
      {helpModal && (
        <div className="help-modal-overlay" onClick={() => setHelpModal(null)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-modal-header">
              <h3>
                {helpModal === 'comicVine'
                  ? 'Getting a ComicVine API Key'
                  : 'Getting an Anthropic API Key'}
              </h3>
              <button
                type="button"
                className="help-modal-close"
                onClick={() => setHelpModal(null)}
              >
                &times;
              </button>
            </div>
            <div className="help-modal-content">
              {helpModal === 'comicVine' ? (
                <>
                  <ol>
                    <li>
                      Go to{' '}
                      <a
                        href="https://comicvine.gamespot.com"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        comicvine.gamespot.com
                      </a>
                    </li>
                    <li>Create a free account or sign in</li>
                    <li>
                      Visit the{' '}
                      <a
                        href="https://comicvine.gamespot.com/api/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        API page
                      </a>
                    </li>
                    <li>Your API key will be displayed on the page</li>
                    <li>Copy the key and paste it in the field above</li>
                  </ol>
                  <p className="help-note">
                    ComicVine's API is free for personal use. The API key is used to fetch
                    comic metadata including series info, issue details, and cover images.
                  </p>
                </>
              ) : (
                <>
                  <ol>
                    <li>
                      Go to{' '}
                      <a
                        href="https://console.anthropic.com"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        console.anthropic.com
                      </a>
                    </li>
                    <li>Create an account or sign in</li>
                    <li>Navigate to "API Keys" in the settings</li>
                    <li>Click "Create Key" to generate a new API key</li>
                    <li>Copy the key immediately (it won't be shown again)</li>
                    <li>Paste it in the field above</li>
                  </ol>
                  <p className="help-note">
                    Anthropic's API is a paid service. You'll need to add credits to your
                    account. The API is used for intelligent filename parsing when matching
                    comics to metadata sources.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
