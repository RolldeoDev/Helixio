/**
 * Reader Preset Settings Component
 *
 * Manages reader presets (create, edit, delete) in the Settings page.
 * Shows presets in separate sections: Bundled, System, and User presets.
 */

import { useState, useEffect } from 'react';
import {
  getReaderPresetsGrouped,
  createReaderPreset,
  updateReaderPreset,
  deleteReaderPreset,
  type ReaderPreset,
  type PresetsGrouped,
  type CreatePresetInput,
  type UpdatePresetInput,
} from '../../services/api.service';
import './ReaderPresetSettings.css';

// Icon mapping for presets
const PRESET_ICONS: Record<string, string> = {
  book: '\u{1F4D6}',
  scroll: '\u{1F4DC}',
  smartphone: '\u{1F4F1}',
  star: '\u{2B50}',
  heart: '\u{2764}',
  fire: '\u{1F525}',
  default: '\u{2699}',
};

function getPresetIcon(icon: string | null): string {
  if (!icon) return PRESET_ICONS.default ?? '⚙️';
  return PRESET_ICONS[icon] ?? icon; // Return the icon itself if it's an emoji
}

interface PresetCardProps {
  preset: ReaderPreset;
  onEdit: (preset: ReaderPreset) => void;
  onDelete: (preset: ReaderPreset) => void;
  canModify: boolean;
}

function PresetCard({ preset, onEdit, onDelete, canModify }: PresetCardProps) {
  return (
    <div className="preset-card">
      <div className="preset-header">
        <span className="preset-icon">{getPresetIcon(preset.icon)}</span>
        <div className="preset-title">
          <h4>{preset.name}</h4>
          {preset.description && <p className="preset-description">{preset.description}</p>}
        </div>
        {canModify && (
          <div className="preset-actions">
            <button className="btn btn-small" onClick={() => onEdit(preset)}>
              Edit
            </button>
            <button className="btn btn-small btn-danger" onClick={() => onDelete(preset)}>
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="preset-settings">
        <div className="preset-setting">
          <span className="label">Mode:</span>
          <span className="value">{preset.mode}</span>
        </div>
        <div className="preset-setting">
          <span className="label">Direction:</span>
          <span className="value">{preset.direction}</span>
        </div>
        <div className="preset-setting">
          <span className="label">Scaling:</span>
          <span className="value">{preset.scaling}</span>
        </div>
        <div className="preset-setting">
          <span className="label">Background:</span>
          <span className="value">{preset.background}</span>
        </div>
      </div>
    </div>
  );
}

interface PresetFormProps {
  preset?: ReaderPreset;
  onSave: (data: CreatePresetInput | UpdatePresetInput) => void | Promise<void>;
  onCancel: () => void;
  isEditing: boolean;
}

function PresetForm({ preset, onSave, onCancel, isEditing }: PresetFormProps) {
  const [name, setName] = useState(preset?.name || '');
  const [description, setDescription] = useState(preset?.description || '');
  const [icon, setIcon] = useState(preset?.icon || 'default');
  const [mode, setMode] = useState(preset?.mode || 'single');
  const [direction, setDirection] = useState(preset?.direction || 'ltr');
  const [scaling, setScaling] = useState(preset?.scaling || 'fitHeight');
  const [background, setBackground] = useState(preset?.background || 'black');
  const [brightness, setBrightness] = useState(preset?.brightness ?? 100);
  const [showPageShadow, setShowPageShadow] = useState(preset?.showPageShadow ?? true);
  const [autoHideUI, setAutoHideUI] = useState(preset?.autoHideUI ?? true);
  const [preloadCount, setPreloadCount] = useState(preset?.preloadCount ?? 3);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      description: description || undefined,
      icon: icon || undefined,
      mode,
      direction,
      scaling,
      background,
      brightness,
      showPageShadow,
      autoHideUI,
      preloadCount,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="preset-form">
      <h3>{isEditing ? 'Edit Preset' : 'Create New Preset'}</h3>

      <div className="form-group">
        <label htmlFor="preset-name">Name *</label>
        <input
          id="preset-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="My Custom Preset"
        />
      </div>

      <div className="form-group">
        <label htmlFor="preset-description">Description</label>
        <input
          id="preset-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description of when to use this preset"
        />
      </div>

      <div className="form-group">
        <label htmlFor="preset-icon">Icon</label>
        <select id="preset-icon" value={icon} onChange={(e) => setIcon(e.target.value)}>
          <option value="default">{PRESET_ICONS.default} Default</option>
          <option value="book">{PRESET_ICONS.book} Book</option>
          <option value="scroll">{PRESET_ICONS.scroll} Scroll</option>
          <option value="smartphone">{PRESET_ICONS.smartphone} Smartphone</option>
          <option value="star">{PRESET_ICONS.star} Star</option>
          <option value="heart">{PRESET_ICONS.heart} Heart</option>
          <option value="fire">{PRESET_ICONS.fire} Fire</option>
        </select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="preset-mode">Reading Mode</label>
          <select id="preset-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="single">Single Page</option>
            <option value="double">Double Page</option>
            <option value="doubleManga">Double (Manga)</option>
            <option value="continuous">Continuous</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="preset-direction">Direction</label>
          <select id="preset-direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="ltr">Left to Right</option>
            <option value="rtl">Right to Left</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="preset-scaling">Scaling</label>
          <select id="preset-scaling" value={scaling} onChange={(e) => setScaling(e.target.value)}>
            <option value="fitHeight">Fit Height</option>
            <option value="fitWidth">Fit Width</option>
            <option value="fitScreen">Fit Screen</option>
            <option value="original">Original Size</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="preset-background">Background</label>
          <select id="preset-background" value={background} onChange={(e) => setBackground(e.target.value)}>
            <option value="black">Black</option>
            <option value="gray">Gray</option>
            <option value="white">White</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="preset-brightness">Brightness: {brightness}%</label>
        <input
          id="preset-brightness"
          type="range"
          min="20"
          max="150"
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
        />
      </div>

      <div className="form-group">
        <label htmlFor="preset-preload">Preload Pages: {preloadCount}</label>
        <input
          id="preset-preload"
          type="range"
          min="0"
          max="10"
          value={preloadCount}
          onChange={(e) => setPreloadCount(Number(e.target.value))}
        />
      </div>

      <div className="form-row checkboxes">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showPageShadow}
            onChange={(e) => setShowPageShadow(e.target.checked)}
          />
          Show Page Shadow
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={autoHideUI}
            onChange={(e) => setAutoHideUI(e.target.checked)}
          />
          Auto-hide UI
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {isEditing ? 'Save Changes' : 'Create Preset'}
        </button>
      </div>
    </form>
  );
}

export function ReaderPresetSettings() {
  const [presets, setPresets] = useState<PresetsGrouped | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ReaderPreset | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ReaderPreset | null>(null);

  const loadPresets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReaderPresetsGrouped();
      setPresets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresets();
  }, []);

  const handleCreatePreset = async (data: CreatePresetInput) => {
    try {
      await createReaderPreset(data);
      await loadPresets();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create preset');
    }
  };

  const handleUpdatePreset = async (data: UpdatePresetInput) => {
    if (!editingPreset) return;
    try {
      await updateReaderPreset(editingPreset.id, data);
      await loadPresets();
      setEditingPreset(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preset');
    }
  };

  const handleDeletePreset = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteReaderPreset(deleteConfirm.id);
      await loadPresets();
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset');
    }
  };

  if (loading) {
    return <div className="loading">Loading presets...</div>;
  }

  if (showForm) {
    return (
      <div className="reader-preset-settings">
        <PresetForm
          onSave={(data) => handleCreatePreset(data as CreatePresetInput)}
          onCancel={() => setShowForm(false)}
          isEditing={false}
        />
      </div>
    );
  }

  if (editingPreset) {
    return (
      <div className="reader-preset-settings">
        <PresetForm
          preset={editingPreset}
          onSave={(data) => handleUpdatePreset(data as UpdatePresetInput)}
          onCancel={() => setEditingPreset(null)}
          isEditing={true}
        />
      </div>
    );
  }

  return (
    <div className="reader-preset-settings">
      <div className="section-header">
        <h2>Reader Presets</h2>
        <p className="description">
          Create and manage reader settings presets. Apply presets to libraries, series, or individual issues.
        </p>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Create New Preset
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete Preset?</h3>
            <p>Are you sure you want to delete "{deleteConfirm.name}"? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeletePreset}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {presets && (
        <>
          {/* Bundled Presets */}
          <div className="preset-section">
            <h3>Bundled Presets</h3>
            <p className="section-description">
              Built-in presets optimized for common reading styles. These cannot be modified or deleted.
            </p>
            <div className="preset-grid">
              {presets.bundled.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  canModify={false}
                />
              ))}
            </div>
          </div>

          {/* System Presets */}
          {presets.system.length > 0 && (
            <div className="preset-section">
              <h3>System Presets</h3>
              <p className="section-description">
                Shared presets visible to all users. Only administrators can modify these.
              </p>
              <div className="preset-grid">
                {presets.system.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    onEdit={setEditingPreset}
                    onDelete={setDeleteConfirm}
                    canModify={true} // TODO: Check if user is admin
                  />
                ))}
              </div>
            </div>
          )}

          {/* User Presets */}
          <div className="preset-section">
            <h3>My Presets</h3>
            <p className="section-description">
              Your personal presets. Only you can see and modify these.
            </p>
            {presets.user.length === 0 ? (
              <div className="empty-state">
                <p>You haven't created any presets yet.</p>
                <button className="btn btn-secondary" onClick={() => setShowForm(true)}>
                  Create Your First Preset
                </button>
              </div>
            ) : (
              <div className="preset-grid">
                {presets.user.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    onEdit={setEditingPreset}
                    onDelete={setDeleteConfirm}
                    canModify={true}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
