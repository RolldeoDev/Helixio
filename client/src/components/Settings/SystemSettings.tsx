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
  getEmptySeries,
  cleanupEmptySeries,
  type SeriesCacheStats,
  type MismatchedFile,
  type RepairResult,
  type EmptySeries,
} from '../../services/api.service';
import { SectionCard } from '../SectionCard';
import { FactoryResetModal, FactoryResetSection } from '../FactoryReset';
import { ApiKeySettings } from './ApiKeySettings';
import { ToggleSwitch } from '../ToggleSwitch';
import { useApiToast } from '../../hooks';
import { useConfirmModal } from '../ConfirmModal';
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

  // Empty series cleanup state
  const [emptySeries, setEmptySeries] = useState<EmptySeries[] | null>(null);
  const [loadingEmptySeries, setLoadingEmptySeries] = useState(false);
  const [cleaningEmptySeries, setCleaningEmptySeries] = useState(false);
  const [showAllEmptySeries, setShowAllEmptySeries] = useState(false);

  // Factory reset modal state
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);

  // API key help modal state
  const [helpModal, setHelpModal] = useState<'comicVine' | 'anthropic' | null>(null);

  // File renaming state
  const [fileRenamingEnabled, setFileRenamingEnabled] = useState(false);
  const [savingFileRenaming, setSavingFileRenaming] = useState(false);

  // Similarity/Recommendations state
  const [similarityStats, setSimilarityStats] = useState<{
    totalPairs: number;
    avgScore: number;
    lastComputedAt: string | null;
    scheduler?: {
      isRunning: boolean;
      lastJobType?: string;
      nextScheduledRun?: string;
    };
  } | null>(null);
  const [loadingSimilarityStats, setLoadingSimilarityStats] = useState(false);
  const [rebuildingSimilarity, setRebuildingSimilarity] = useState(false);

  const { addToast } = useApiToast();
  const confirm = useConfirmModal();

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Load API keys
      const keysRes = await fetch(`${API_BASE}/config/api-keys`);
      const keys = await keysRes.json();
      // API returns objects with { value, source, readOnly } - extract the values
      setComicVineKey(keys.comicVine?.value || '');
      setAnthropicKey(keys.anthropic?.value || '');
      setMetronUsername(keys.metronUsername?.value || '');
      setMetronPassword(keys.metronPassword?.value || '');

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

      // Load file renaming setting
      const renamingRes = await fetch(`${API_BASE}/config/file-renaming`);
      if (renamingRes.ok) {
        const renamingData = await renamingRes.json();
        setFileRenamingEnabled(renamingData.enabled ?? false);
      }
    } catch (err) {
      console.error('Failed to load system settings:', err);
    }
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
      addToast('success', 'API keys saved successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save API keys');
    } finally {
      setSavingKeys(false);
    }
  };

  const handleTestMetron = async () => {
    setTestingMetron(true);
    setMetronTestResult(null);
    try {
      // Send current textbox values to test unsaved credentials
      const response = await fetch(`${API_BASE}/config/test-metron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: metronUsername || undefined,
          password: metronPassword || undefined,
        }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setMetronTestResult('success');
        addToast('success', 'Metron credentials are valid');
      } else {
        setMetronTestResult('error');
        addToast('error', data.error || 'Metron authentication failed');
      }
    } catch (err) {
      setMetronTestResult('error');
      addToast('error', err instanceof Error ? err.message : 'Failed to test Metron credentials');
    } finally {
      setTestingMetron(false);
    }
  };

  const handleTestComicVine = async () => {
    setTestingComicVine(true);
    setComicVineTestResult(null);
    try {
      // Send current textbox value to test unsaved API key
      const response = await fetch(`${API_BASE}/config/test-comicvine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: comicVineKey || undefined,
        }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setComicVineTestResult('success');
        addToast('success', 'ComicVine API key is valid');
      } else {
        setComicVineTestResult('error');
        addToast('error', data.error || 'ComicVine API key validation failed');
      }
    } catch (err) {
      setComicVineTestResult('error');
      addToast('error', err instanceof Error ? err.message : 'Failed to test ComicVine API key');
    } finally {
      setTestingComicVine(false);
    }
  };

  const handleTestAnthropic = async () => {
    setTestingAnthropic(true);
    setAnthropicTestResult(null);
    try {
      // Send current textbox value to test unsaved API key
      const response = await fetch(`${API_BASE}/config/test-anthropic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: anthropicKey || undefined,
        }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setAnthropicTestResult('success');
        addToast('success', 'Anthropic API key is valid');
      } else {
        setAnthropicTestResult('error');
        addToast('error', data.error || 'Anthropic API key validation failed');
      }
    } catch (err) {
      setAnthropicTestResult('error');
      addToast('error', err instanceof Error ? err.message : 'Failed to test Anthropic API key');
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
      addToast('success', 'Rate limit settings saved');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save settings');
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
      addToast('success', 'Cache settings saved');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save cache settings');
    } finally {
      setSavingCacheSettings(false);
    }
  };

  const handleClearCoverCache = async () => {
    const confirmed = await confirm({
      title: 'Clear Cover Cache',
      message: 'Clear the entire cover cache? Covers will be re-extracted when viewed.',
      confirmText: 'Clear',
      variant: 'warning',
    });
    if (!confirmed) return;

    setClearingCoverCache(true);
    try {
      const response = await fetch(`${API_BASE}/covers/cache/cleanup`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to clear cache');
      addToast('success', 'Cover cache cleared successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to clear cache');
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
      addToast('success', `Cleaned ${result.deleted} expired entries, freed ${result.freedMb.toFixed(1)} MB`);
      await loadSeriesCacheStats();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to clean series cache');
    } finally {
      setCleaningSeriesCache(false);
    }
  };

  const handleClearSeriesCache = async () => {
    const confirmed = await confirm({
      title: 'Clear Series Cache',
      message: 'Clear all cached series data? This will require re-fetching from APIs when needed.',
      confirmText: 'Clear',
      variant: 'warning',
    });
    if (!confirmed) return;

    setCleaningSeriesCache(true);
    try {
      const result = await clearSeriesCache();
      addToast('success', `Cleared ${result.deleted} entries, freed ${result.freedMb.toFixed(1)} MB`);
      await loadSeriesCacheStats();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to clear series cache');
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
    const confirmed = await confirm({
      title: 'Clear Download Cache',
      message: 'Clear all download cache files? Prepared ZIP files will be deleted.',
      confirmText: 'Clear',
      variant: 'warning',
    });
    if (!confirmed) return;

    setClearingDownloadCache(true);
    try {
      const response = await fetch(`${API_BASE}/downloads/cache`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to clear download cache');

      const result = await response.json();
      const freedMb = (result.bytesFreed / (1024 * 1024)).toFixed(1);
      addToast('success', `Cleared ${result.filesDeleted} file(s), freed ${freedMb} MB`);
      await loadDownloadCacheStats();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to clear download cache');
    } finally {
      setClearingDownloadCache(false);
    }
  };

  // Similarity stats handlers
  const loadSimilarityStats = async () => {
    setLoadingSimilarityStats(true);
    try {
      const response = await fetch(`${API_BASE}/recommendations/similarity-stats`);
      if (response.ok) {
        const stats = await response.json();
        setSimilarityStats(stats);
      }
    } catch (err) {
      console.error('Failed to load similarity stats:', err);
    } finally {
      setLoadingSimilarityStats(false);
    }
  };

  const handleRebuildSimilarity = async () => {
    const confirmed = await confirm({
      title: 'Recalculate Similarities',
      message: 'This will recalculate similarity scores for all series. This runs in the background and may take several minutes depending on your library size.',
      confirmText: 'Recalculate',
    });
    if (!confirmed) return;

    setRebuildingSimilarity(true);
    try {
      const response = await fetch(`${API_BASE}/recommendations/similarity/rebuild`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to start similarity rebuild');

      addToast('success', 'Similarity recalculation started. This runs in the background.');
      // Reload stats after a short delay to show updated status
      setTimeout(() => loadSimilarityStats(), 2000);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to start similarity rebuild');
    } finally {
      setRebuildingSimilarity(false);
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
        addToast('success', 'No mismatched series linkages found');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to check for mismatched files');
    } finally {
      setLoadingMismatched(false);
    }
  };

  const handleRepairLinkages = async () => {
    const confirmed = await confirm({
      title: 'Repair Linkages',
      message: `This will repair ${mismatchedFiles?.length || 0} mismatched file(s). Continue?`,
      confirmText: 'Repair',
    });
    if (!confirmed) return;

    setRepairing(true);
    setRepairResult(null);
    try {
      const result = await repairSeriesLinkages();
      setRepairResult(result);
      setMismatchedFiles(null);

      if (result.repaired > 0) {
        addToast('success',
          `Repaired ${result.repaired} file(s)` +
          (result.newSeriesCreated > 0 ? `, created ${result.newSeriesCreated} new series` : '')
        );
      } else if (result.totalMismatched === 0) {
        addToast('success', 'No mismatched files found to repair');
      } else {
        addToast('error', 'Repair completed with errors');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to repair series linkages');
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
      addToast('error', 'No files have been assigned an action');
      return;
    }

    const totalActions = useMetadataFiles.length + keepCurrentFiles.length;
    const confirmed = await confirm({
      title: 'Process Files',
      message: `Process ${totalActions} file(s)?`,
      confirmText: 'Process',
    });
    if (!confirmed) return;

    setProcessingManual(true);
    setRepairResult(null);

    try {
      let repaired = 0;
      let synced = 0;
      let newSeriesCreated = 0;
      const errors: string[] = [];

      if (useMetadataFiles.length > 0) {
        // Pass only the selected file IDs, not all mismatched files
        const repairResult = await repairSeriesLinkages(useMetadataFiles.map(f => f.fileId));
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
        addToast('success',
          `Processed: ${repaired} relinked` +
          (newSeriesCreated > 0 ? ` (${newSeriesCreated} new series)` : '') +
          `, ${synced} metadata synced`
        );
      } else if (errors.length > 0) {
        addToast('error', `Processing completed with ${errors.length} error(s)`);
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to process files');
    } finally {
      setProcessingManual(false);
    }
  };

  // Empty series cleanup handlers
  const handleCheckEmptySeries = async () => {
    setLoadingEmptySeries(true);
    setShowAllEmptySeries(false);
    try {
      const result = await getEmptySeries();
      setEmptySeries(result.series);
      if (result.count === 0) {
        addToast('success', 'No empty series found');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to check for empty series');
    } finally {
      setLoadingEmptySeries(false);
    }
  };

  const handleCleanupEmptySeries = async () => {
    const confirmed = await confirm({
      title: 'Clean Up Empty Series',
      message: `This will remove ${emptySeries?.length || 0} empty series from the database. They can be restored from the deleted series list. Continue?`,
      confirmText: 'Clean Up',
      variant: 'warning',
    });
    if (!confirmed) return;

    setCleaningEmptySeries(true);
    try {
      const result = await cleanupEmptySeries();
      setEmptySeries(null);
      if (result.deletedCount > 0) {
        addToast('success', `Removed ${result.deletedCount} empty series`);
      } else {
        addToast('success', 'No empty series found to clean up');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to clean up empty series');
    } finally {
      setCleaningEmptySeries(false);
    }
  };

  // File renaming toggle handler
  const handleFileRenamingToggle = async (enabled: boolean) => {
    setSavingFileRenaming(true);
    try {
      const response = await fetch(`${API_BASE}/config/file-renaming`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) {
        throw new Error('Failed to update file renaming setting');
      }

      setFileRenamingEnabled(enabled);
      addToast('success', `File renaming ${enabled ? 'enabled' : 'disabled'}`);

      // Inform user they may need to refresh the page to see the File Naming tab
      if (enabled) {
        addToast('info', 'Refresh the page to see the File Naming tab in Settings');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update setting');
    } finally {
      setSavingFileRenaming(false);
    }
  };

  return (
    <div className="system-settings">
      <h2>System Settings</h2>

      {/* Support Section */}
      <SectionCard
        title="Support Helixio"
        description="If Helixio has helped organize your collection, consider supporting its development. Every contribution helps fuel the developer's ever-growing comic addiction (it's for testing purposes, obviously)."
      >
        <div className="support-buttons">
          <a
            href="https://ko-fi.com/helixiodev"
            target="_blank"
            rel="noopener noreferrer"
            className="support-button kofi"
          >
            <img src="https://storage.ko-fi.com/cdn/cup-border.png" alt="" className="support-icon" />
            <span>Ko-fi</span>
          </a>
          <a
            href="https://buymeacoffee.com/HelixioDev"
            target="_blank"
            rel="noopener noreferrer"
            className="support-button buymeacoffee"
          >
            <img src="https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg" alt="" className="support-icon" />
            <span>Buy Me a Coffee</span>
          </a>
          <a
            href="https://paypal.me/HelixioDev"
            target="_blank"
            rel="noopener noreferrer"
            className="support-button paypal"
          >
            <svg className="support-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.77.77 0 0 1 .757-.629h6.724c2.228 0 3.948.483 5.107 1.433 1.159.95 1.611 2.37 1.343 4.218-.088.611-.236 1.18-.442 1.706a6.762 6.762 0 0 1-.876 1.528c-.364.454-.808.843-1.328 1.165-.522.323-1.136.573-1.84.751-.704.178-1.502.267-2.392.267h-2.04a.77.77 0 0 0-.757.63l-.789 4.776a.77.77 0 0 1-.757.63H7.076v-.008zm2.338-7.816l.835-5.05a.616.616 0 0 1 .609-.517h1.162c1.57 0 2.783-.199 3.637-.598.855-.399 1.283-1.056 1.283-1.97 0-.631-.226-1.089-.677-1.375-.452-.286-1.197-.429-2.234-.429h-1.993a.616.616 0 0 0-.609.517l-.013.063-1 6.359z"/>
            </svg>
            <span>PayPal</span>
          </a>
        </div>
      </SectionCard>

      {/* File Operations Section */}
      <SectionCard
        title="File Operations"
        description="Control how Helixio interacts with your comic files on disk."
      >
        <ToggleSwitch
          checked={fileRenamingEnabled}
          onChange={handleFileRenamingToggle}
          disabled={savingFileRenaming}
          label="Enable file renaming"
          description="When enabled, Helixio can rename comic files based on metadata and templates during the metadata approval workflow and batch operations. When disabled, all renaming features are hidden and no files will be renamed. This setting is disabled by default."
        />
      </SectionCard>

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
                <p>Click a side to choose: keep the current series or use the metadata series.</p>
              </div>

              <div className="bulk-action-bar">
                <span className="bulk-label">Quick:</span>
                <button className="btn-ghost" onClick={() => handleSetAllDecisions('keep-current')}>
                  All Keep Current
                </button>
                <button className="btn-ghost" onClick={() => handleSetAllDecisions('use-metadata')}>
                  All Use Metadata
                </button>
                <button className="btn-ghost" onClick={() => setFileDecisions({})}>
                  Clear All
                </button>
                <div className="decision-summary">
                  {Object.values(fileDecisions).filter(d => d === 'keep-current').length > 0 && (
                    <span className="count-badge keep">
                      {Object.values(fileDecisions).filter(d => d === 'keep-current').length} keep
                    </span>
                  )}
                  {Object.values(fileDecisions).filter(d => d === 'use-metadata').length > 0 && (
                    <span className="count-badge metadata">
                      {Object.values(fileDecisions).filter(d => d === 'use-metadata').length} use metadata
                    </span>
                  )}
                  {mismatchedFiles.length - Object.keys(fileDecisions).length > 0 && (
                    <span className="count-badge undecided">
                      {mismatchedFiles.length - Object.keys(fileDecisions).length} undecided
                    </span>
                  )}
                </div>
              </div>

              <div className="files-scroll-container">
                {mismatchedFiles.map((file) => {
                  const decision = fileDecisions[file.fileId];
                  return (
                    <div
                      key={file.fileId}
                      className={`linkage-file-card ${decision ? 'decided' : ''}`}
                    >
                      <span className="file-name">{file.fileName}</span>
                      <div className="linkage-comparison">
                        <div
                          className={`linkage-side current ${decision === 'keep-current' ? 'selected' : ''}`}
                          onClick={() => handleSetFileDecision(file.fileId, 'keep-current')}
                        >
                          <span className="side-label">Current Series</span>
                          <span className={`series-name ${!file.linkedSeriesName ? 'empty' : ''}`}>
                            {file.linkedSeriesName || '(no series)'}
                          </span>
                          <span className="action-indicator">
                            {decision === 'keep-current' ? (
                              <><span className="check-icon">✓</span> Keep this</>
                            ) : (
                              'Keep this'
                            )}
                          </span>
                        </div>
                        <span className="or-divider">or</span>
                        <div
                          className={`linkage-side metadata ${decision === 'use-metadata' ? 'selected' : ''}`}
                          onClick={() => handleSetFileDecision(file.fileId, 'use-metadata')}
                        >
                          <span className="side-label">Metadata Says</span>
                          <span className={`series-name ${!file.metadataSeries ? 'empty' : ''}`}>
                            {file.metadataSeries || '(no metadata)'}
                          </span>
                          <span className="action-indicator">
                            {decision === 'use-metadata' ? (
                              <><span className="check-icon">✓</span> Use this</>
                            ) : (
                              'Use this'
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                className="btn-primary"
                onClick={handleApplyManualDecisions}
                disabled={processingManual || Object.keys(fileDecisions).length === 0}
              >
                {processingManual ? 'Processing...' : `Apply ${Object.keys(fileDecisions).length} Decision${Object.keys(fileDecisions).length !== 1 ? 's' : ''}`}
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

        <div className="setting-group">
          <label>Empty Series Cleanup</label>
          <p className="setting-description">
            Find and remove series that have no issues. These are typically left over
            when files are moved or deleted outside of Helixio.
          </p>

          <div className="button-group">
            <button
              className="btn-secondary"
              onClick={handleCheckEmptySeries}
              disabled={loadingEmptySeries || cleaningEmptySeries}
            >
              {loadingEmptySeries ? 'Checking...' : 'Check for Empty Series'}
            </button>

            {emptySeries !== null && emptySeries.length > 0 && (
              <button
                className="btn-primary"
                onClick={handleCleanupEmptySeries}
                disabled={cleaningEmptySeries}
              >
                {cleaningEmptySeries ? 'Cleaning...' : `Clean Up ${emptySeries.length} Series`}
              </button>
            )}
          </div>

          {/* Empty series list */}
          {emptySeries !== null && emptySeries.length > 0 && (
            <div className="mismatched-files-list">
              <h5>Empty Series ({emptySeries.length})</h5>
              <div className="files-scroll-container">
                {(showAllEmptySeries ? emptySeries : emptySeries.slice(0, 10)).map((series) => (
                  <div key={series.id} className="mismatched-file-item">
                    <span className="file-name">{series.name}</span>
                    <span className="file-meta">
                      {series.publisher || 'Unknown Publisher'}
                      {series.startYear ? ` (${series.startYear})` : ''}
                    </span>
                  </div>
                ))}
                {!showAllEmptySeries && emptySeries.length > 10 && (
                  <button
                    className="show-more-btn"
                    onClick={() => setShowAllEmptySeries(true)}
                  >
                    ... and {emptySeries.length - 10} more
                  </button>
                )}
              </div>
            </div>
          )}

          {emptySeries !== null && emptySeries.length === 0 && (
            <div className="repair-result">
              <div className="result-details">
                <div>No empty series found</div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Recommendations Section */}
      <SectionCard
        title="Recommendations"
        description="Manage the similarity engine that powers series recommendations."
      >
        <div className="setting-group">
          <label>Series Similarity Data</label>
          <p className="setting-description">
            Similar series recommendations are based on precomputed similarity scores
            (genres, characters, creators, tags, etc.). These are normally updated nightly at 2 AM.
          </p>

          {loadingSimilarityStats ? (
            <div className="cache-loading">
              <div className="spinner-small" />
              <span>Loading...</span>
            </div>
          ) : similarityStats ? (
            <div className="cache-stats">
              <div className="stat-grid">
                <div className="stat-item">
                  <span className="stat-value">{similarityStats.totalPairs.toLocaleString()}</span>
                  <span className="stat-label">Similarity Pairs</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">
                    {(similarityStats.avgScore * 100).toFixed(1)}%
                  </span>
                  <span className="stat-label">Avg Score</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">
                    {similarityStats.lastComputedAt
                      ? new Date(similarityStats.lastComputedAt).toLocaleDateString()
                      : 'Never'}
                  </span>
                  <span className="stat-label">Last Computed</span>
                </div>
              </div>
              {similarityStats.scheduler?.isRunning && (
                <div className="similarity-running-badge">
                  <div className="spinner-small" />
                  <span>Computation in progress...</span>
                </div>
              )}
            </div>
          ) : (
            <button className="btn-ghost" onClick={loadSimilarityStats}>
              Load Statistics
            </button>
          )}

          <div className="button-group" style={{ marginTop: '1rem' }}>
            <button
              className="btn-secondary"
              onClick={loadSimilarityStats}
              disabled={loadingSimilarityStats}
            >
              {loadingSimilarityStats ? 'Loading...' : 'Refresh Stats'}
            </button>
            <button
              className="btn-primary"
              onClick={handleRebuildSimilarity}
              disabled={rebuildingSimilarity || similarityStats?.scheduler?.isRunning}
            >
              {rebuildingSimilarity ? 'Starting...' : 'Recalculate Similarities'}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Helixio API Keys Section */}
      <ApiKeySettings />

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
