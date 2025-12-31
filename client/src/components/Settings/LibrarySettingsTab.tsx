/**
 * LibrarySettingsTab Component
 *
 * Container for all library-related settings including:
 * - Library list with expandable cards
 * - Add library modal
 * - File classification settings (Manga and Western)
 */

import { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useLibraryScan } from '../../contexts/LibraryScanContext';
import { useConfirmModal } from '../ConfirmModal';
import { useApiToast } from '../../hooks';
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
import { LibraryCard } from './LibraryCard';
import { AddLibraryModal } from './AddLibraryModal';
import { LibraryScanModal } from '../LibraryScanModal';
import { SectionCard } from '../SectionCard';
import { ToggleSwitch } from '../ToggleSwitch';
import './LibrarySettings.css';

const API_BASE = '/api';

export function LibrarySettingsTab() {
  const { libraries, refreshLibraries, selectLibrary } = useApp();
  const { startScan, hasActiveScan } = useLibraryScan();
  const confirm = useConfirmModal();
  const { addToast } = useApiToast();

  // Modal states
  const [showAddLibraryModal, setShowAddLibraryModal] = useState(false);
  const [scanningLibrary, setScanningLibrary] = useState<Library | null>(null);

  // Reader presets
  const [readerPresets, setReaderPresets] = useState<PresetsGrouped | null>(null);
  const [libraryReaderSettings, setLibraryReaderSettings] = useState<Record<string, { presetId?: string; presetName?: string } | null>>({});
  const [loadingLibraryReaderSettings, setLoadingLibraryReaderSettings] = useState<Record<string, boolean>>({});

  // Manga classification settings
  const [mangaClassificationEnabled, setMangaClassificationEnabled] = useState(true);
  const [volumePageThreshold, setVolumePageThreshold] = useState(60);
  const [filenameOverridesPageCount, setFilenameOverridesPageCount] = useState(true);

  // Comic (Western) classification settings
  const [comicClassificationEnabled, setComicClassificationEnabled] = useState(true);
  const [issuePageThreshold, setIssuePageThreshold] = useState(50);
  const [omnibusPageThreshold, setOmnibusPageThreshold] = useState(200);
  const [comicFilenameOverridesPageCount, setComicFilenameOverridesPageCount] = useState(true);

  const [saving, setSaving] = useState(false);

  // Load reader presets
  useEffect(() => {
    if (!readerPresets) {
      getReaderPresetsGrouped().then(setReaderPresets).catch(console.error);
    }
  }, [readerPresets]);

  // Load reader settings for each library
  useEffect(() => {
    const loadSettings = async () => {
      for (const lib of libraries) {
        if (libraryReaderSettings[lib.id] === undefined) {
          setLoadingLibraryReaderSettings(prev => ({ ...prev, [lib.id]: true }));
          try {
            const settings = await getLibraryReaderSettings(lib.id);
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
      }
    };

    if (libraries.length > 0) {
      loadSettings();
    }
  }, [libraries]); // Removed libraryReaderSettings to prevent infinite loop

  // Load classification settings
  useEffect(() => {
    const loadClassificationSettings = async () => {
      // Load manga classification
      try {
        const mangaRes = await fetch(`${API_BASE}/config/manga-classification`);
        if (mangaRes.ok) {
          const mangaSettings = await mangaRes.json();
          setMangaClassificationEnabled(mangaSettings.enabled ?? true);
          setVolumePageThreshold(mangaSettings.volumePageThreshold ?? 60);
          setFilenameOverridesPageCount(mangaSettings.filenameOverridesPageCount ?? true);
        }
      } catch {
        // Use defaults
      }

      // Load comic classification
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
        // Use defaults
      }
    };

    loadClassificationSettings();
  }, []);

  // Library handlers
  const handleAddLibrary = async (library: { name: string; rootPath: string; type: 'western' | 'manga' }) => {
    try {
      await createLibrary(library);
      await refreshLibraries();
      addToast('success', 'Library added successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to add library');
      throw err; // Re-throw so modal knows the operation failed
    }
  };

  const handleUpdateLibrary = async (library: Library) => {
    try {
      await updateLibrary(library.id, {
        name: library.name,
        type: library.type,
        autoCompleteThreshold: library.autoCompleteThreshold,
      });
      await refreshLibraries();
      addToast('success', 'Library updated successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update library');
      throw err; // Re-throw so card knows the operation failed
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

    try {
      await deleteLibrary(library.id);
      await refreshLibraries();
      selectLibrary(null);
      addToast('success', 'Library removed successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete library');
    }
  };

  const handleScanLibrary = async (library: Library) => {
    setScanningLibrary(library);
    try {
      await startScan(library.id);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to start library scan');
      setScanningLibrary(null);
    }
  };

  const handleReaderSettingsChange = async (libraryId: string, presetId: string | null) => {
    if (presetId === null) {
      await deleteLibraryReaderSettings(libraryId);
      setLibraryReaderSettings(prev => ({ ...prev, [libraryId]: null }));
    } else {
      const allPresets = [...(readerPresets?.bundled || []), ...(readerPresets?.system || []), ...(readerPresets?.user || [])];
      const preset = allPresets.find(p => p.id === presetId);
      await applyPresetToLibrary(presetId, libraryId);
      setLibraryReaderSettings(prev => ({
        ...prev,
        [libraryId]: { presetId, presetName: preset?.name || 'Custom' }
      }));
    }
  };

  // Save classification settings
  const handleSaveClassificationSettings = async () => {
    setSaving(true);
    try {
      // Save manga classification
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

      // Save comic classification
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

      addToast('success', 'Classification settings saved');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="library-settings-tab">
      <h2>Libraries</h2>

      {/* Library List */}
      <div className="library-list">
        {libraries.length === 0 ? (
          <div className="library-empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3>No Libraries</h3>
            <p>Add a library to start organizing your comic collection.</p>
            <button
              className="btn-primary"
              onClick={() => setShowAddLibraryModal(true)}
            >
              Add Your First Library
            </button>
          </div>
        ) : (
          <>
            {libraries.map((library) => (
              <LibraryCard
                key={library.id}
                library={library}
                readerPresets={readerPresets}
                readerSettings={libraryReaderSettings[library.id] ?? null}
                loadingReaderSettings={loadingLibraryReaderSettings[library.id] ?? false}
                hasActiveScan={hasActiveScan(library.id)}
                onUpdate={handleUpdateLibrary}
                onDelete={handleDeleteLibrary}
                onScan={handleScanLibrary}
                onReaderSettingsChange={(presetId) => handleReaderSettingsChange(library.id, presetId)}
              />
            ))}

            <button
              className="btn-secondary add-library-btn"
              onClick={() => setShowAddLibraryModal(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon-svg">
                <path d="M12 4v16m8-8H4" />
              </svg>
              Add Library
            </button>
          </>
        )}
      </div>

      {/* Modals */}
      <AddLibraryModal
        isOpen={showAddLibraryModal}
        onClose={() => setShowAddLibraryModal(false)}
        onSubmit={handleAddLibrary}
      />

      {scanningLibrary && (
        <LibraryScanModal
          libraryId={scanningLibrary.id}
          libraryName={scanningLibrary.name}
          onClose={() => setScanningLibrary(null)}
        />
      )}

      {/* File Classification Settings */}
      <div className="classification-settings">
        {/* Manga Classification */}
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

        {/* Western Comic Classification */}
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
              onClick={handleSaveClassificationSettings}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Classification Settings'}
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
