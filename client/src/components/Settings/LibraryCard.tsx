/**
 * LibraryCard Component
 *
 * Displays a single library as an expandable card with view and edit modes.
 * Shows library info in collapsed state, reveals edit form when expanded.
 */

import { useState, useEffect } from 'react';
import { Library } from '../../services/api.service';
import { PresetsGrouped } from '../../services/api/reading';
import { SectionCard } from '../SectionCard';
import './LibrarySettings.css';

export interface LibraryCardProps {
  library: Library;
  readerPresets: PresetsGrouped | null;
  readerSettings: { presetId?: string; presetName?: string } | null;
  loadingReaderSettings: boolean;
  hasActiveScan: boolean;
  isDeleting?: boolean;
  onUpdate: (library: Library) => Promise<void>;
  onDelete: (library: Library) => void;
  onScan: (library: Library) => void;
  onReaderSettingsChange: (presetId: string | null) => Promise<void>;
}

export function LibraryCard({
  library,
  readerPresets,
  readerSettings,
  loadingReaderSettings,
  hasActiveScan,
  isDeleting = false,
  onUpdate,
  onDelete,
  onScan,
  onReaderSettingsChange,
}: LibraryCardProps) {
  const [editedLibrary, setEditedLibrary] = useState<Library>(library);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync editedLibrary with library prop
  useEffect(() => {
    setEditedLibrary(library);
    setHasChanges(false);
  }, [library]);

  // Track if there are unsaved changes
  useEffect(() => {
    const changed =
      editedLibrary.name !== library.name ||
      editedLibrary.type !== library.type ||
      editedLibrary.autoCompleteThreshold !== library.autoCompleteThreshold;
    setHasChanges(changed);
  }, [editedLibrary, library]);

  const handleSave = async () => {
    if (!hasChanges) return;

    setSaving(true);
    try {
      await onUpdate(editedLibrary);
      // Note: SectionCard manages its own collapse state, so we can't programmatically close it
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedLibrary(library);
    setHasChanges(false);
    // Note: SectionCard manages its own collapse state, so we can't programmatically close it
  };

  const handlePresetChange = async (presetId: string) => {
    await onReaderSettingsChange(presetId === '' ? null : presetId);
  };

  // Find the current preset name for display
  const currentPresetName = readerSettings?.presetName || 'Global Defaults';

  return (
    <SectionCard
      className="library-card"
      collapsible
      defaultCollapsed={true}
      title={library.name}
      description={library.rootPath}
      actions={
        <div className="library-card-header-actions">
          <span className={`library-type-badge ${library.type}`}>
            {library.type === 'manga' ? 'Manga' : 'Western'}
          </span>
        </div>
      }
    >
      <div className="library-card-content">
        {/* Library Settings Form */}
        <div className="library-form">
          <div className="library-form-row">
            <div className="form-group">
              <label htmlFor={`name-${library.id}`}>Library Name</label>
              <input
                id={`name-${library.id}`}
                type="text"
                value={editedLibrary.name}
                onChange={(e) => setEditedLibrary(prev => ({ ...prev, name: e.target.value }))}
                disabled={saving}
              />
            </div>

            <div className="form-group">
              <label htmlFor={`type-${library.id}`}>Library Type</label>
              <select
                id={`type-${library.id}`}
                value={editedLibrary.type}
                onChange={(e) => setEditedLibrary(prev => ({ ...prev, type: e.target.value as 'western' | 'manga' }))}
                disabled={saving}
              >
                <option value="western">Western Comics</option>
                <option value="manga">Manga</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor={`autocomplete-${library.id}`}>Auto-Complete Threshold</label>
            <p className="form-description">
              Automatically mark issues as complete when you exit after reaching this percentage.
            </p>
            <select
              id={`autocomplete-${library.id}`}
              value={editedLibrary.autoCompleteThreshold ?? 'disabled'}
              onChange={(e) => {
                const value = e.target.value;
                setEditedLibrary(prev => ({
                  ...prev,
                  autoCompleteThreshold: value === 'disabled' ? null : parseInt(value, 10),
                }));
              }}
              disabled={saving}
            >
              <option value="disabled">Disabled</option>
              <option value="90">90%</option>
              <option value="95">95% (Default)</option>
              <option value="98">98%</option>
              <option value="100">100% (Last page only)</option>
            </select>
          </div>
        </div>

        {/* Reader Preset Section */}
        <div className="library-reader-section">
          <div className="form-group">
            <label htmlFor={`reader-preset-${library.id}`}>Default Reader Preset</label>
            <p className="form-description">
              Choose a reader preset to apply when opening files from this library.
            </p>
            {loadingReaderSettings ? (
              <span className="loading-text">Loading presets...</span>
            ) : (
              <select
                id={`reader-preset-${library.id}`}
                value={readerSettings?.presetId || ''}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="reader-preset-select"
              >
                <option value="">Use Global Defaults</option>
                {readerPresets?.bundled && readerPresets.bundled.length > 0 && (
                  <optgroup label="Bundled">
                    {readerPresets.bundled.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                )}
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
            )}
          </div>
        </div>

        {/* Library Stats (read-only info) */}
        <div className="library-stats">
          <div className="library-stat-item">
            <span className="stat-label">Path</span>
            <span className="stat-value path">{library.rootPath}</span>
          </div>
          <div className="library-stat-item">
            <span className="stat-label">Auto-Complete</span>
            <span className="stat-value">
              {library.autoCompleteThreshold !== null && library.autoCompleteThreshold !== undefined
                ? `${library.autoCompleteThreshold}%`
                : 'Disabled'}
            </span>
          </div>
          <div className="library-stat-item">
            <span className="stat-label">Reader</span>
            <span className="stat-value">{currentPresetName}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="library-card-actions">
          <div className="library-card-actions-left">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onScan(library)}
              disabled={hasActiveScan || saving}
              title={hasActiveScan ? 'Scan in progress' : 'Scan library for new files'}
            >
              {hasActiveScan ? (
                <>
                  <span className="spinner-inline" />
                  Scanning...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon-svg">
                    <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                  </svg>
                  Scan
                </>
              )}
            </button>
            <button
              type="button"
              className="btn-ghost danger"
              onClick={() => onDelete(library)}
              disabled={saving || isDeleting}
            >
              {isDeleting ? (
                <>
                  <span className="spinner-inline" />
                  Removing...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon-svg">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Remove
                </>
              )}
            </button>
          </div>

          <div className="library-card-actions-right">
            {hasChanges && (
              <>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
