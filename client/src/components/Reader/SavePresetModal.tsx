/**
 * Save Preset Modal Component
 *
 * Modal for saving current reader settings as a new preset.
 */

import { useState } from 'react';
import {
  createReaderPreset,
  CreatePresetInput,
  ReaderSettings,
} from '../../services/api.service';

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  currentSettings: {
    mode: string;
    direction: string;
    scaling: string;
    customWidth: number | null;
    splitting: string;
    background: string;
    brightness: number;
    colorCorrection: string;
    showPageShadow: boolean;
    autoHideUI: boolean;
    preloadCount: number;
    webtoonGap: number;
    webtoonMaxWidth: number;
  };
}

const ICON_OPTIONS = [
  { value: 'book', label: '📖 Book' },
  { value: 'scroll', label: '📜 Scroll' },
  { value: 'smartphone', label: '📱 Phone' },
  { value: 'manga', label: '🇯🇵 Manga' },
  { value: 'webtoon', label: '📲 Webtoon' },
  { value: 'star', label: '⭐ Star' },
  { value: 'heart', label: '❤️ Heart' },
  { value: 'eye', label: '👁️ Eye' },
];

export function SavePresetModal({
  isOpen,
  onClose,
  onSaved,
  currentSettings,
}: SavePresetModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('book');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Please enter a name for the preset');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const input: CreatePresetInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        icon,
        mode: currentSettings.mode as ReaderSettings['mode'],
        direction: currentSettings.direction as ReaderSettings['direction'],
        scaling: currentSettings.scaling as ReaderSettings['scaling'],
        customWidth: currentSettings.customWidth,
        splitting: currentSettings.splitting as ReaderSettings['splitting'],
        background: currentSettings.background as ReaderSettings['background'],
        brightness: currentSettings.brightness,
        colorCorrection: currentSettings.colorCorrection as ReaderSettings['colorCorrection'],
        showPageShadow: currentSettings.showPageShadow,
        autoHideUI: currentSettings.autoHideUI,
        preloadCount: currentSettings.preloadCount,
        webtoonGap: currentSettings.webtoonGap,
        webtoonMaxWidth: currentSettings.webtoonMaxWidth,
      };

      await createReaderPreset(input);
      onSaved();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setIcon('book');
    setError(null);
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div className="save-preset-overlay" onClick={handleOverlayClick}>
      <div className="save-preset-modal">
        <div className="save-preset-header">
          <h3>Save as Preset</h3>
          <button className="save-preset-close" onClick={handleClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="save-preset-content">
            {error && (
              <div className="save-preset-error">{error}</div>
            )}

            <div className="save-preset-field">
              <label htmlFor="preset-name">Name *</label>
              <input
                id="preset-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Custom Preset"
                autoFocus
              />
            </div>

            <div className="save-preset-field">
              <label htmlFor="preset-description">Description</label>
              <textarea
                id="preset-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            <div className="save-preset-field">
              <label htmlFor="preset-icon">Icon</label>
              <select
                id="preset-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
              >
                {ICON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="save-preset-preview">
              <h4>Settings to Save</h4>
              <div className="save-preset-settings-list">
                <div><span>Mode:</span> {currentSettings.mode}</div>
                <div><span>Direction:</span> {currentSettings.direction}</div>
                <div><span>Scaling:</span> {currentSettings.scaling}</div>
                <div><span>Background:</span> {currentSettings.background}</div>
                <div><span>Brightness:</span> {currentSettings.brightness}%</div>
              </div>
            </div>
          </div>

          <div className="save-preset-footer">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Preset'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .save-preset-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
        }

        .save-preset-modal {
          width: 400px;
          max-width: 95%;
          max-height: 90vh;
          background: #1e1e1e;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .save-preset-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .save-preset-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #fff;
        }

        .save-preset-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.6);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .save-preset-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .save-preset-content {
          padding: 16px;
          overflow-y: auto;
        }

        .save-preset-error {
          padding: 10px 12px;
          background: rgba(255, 100, 100, 0.15);
          border: 1px solid rgba(255, 100, 100, 0.3);
          border-radius: 6px;
          color: #ff6b6b;
          font-size: 13px;
          margin-bottom: 16px;
        }

        .save-preset-field {
          margin-bottom: 16px;
        }

        .save-preset-field label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.8);
        }

        .save-preset-field input,
        .save-preset-field textarea,
        .save-preset-field select {
          width: 100%;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: #fff;
          font-size: 14px;
          font-family: inherit;
        }

        .save-preset-field input:focus,
        .save-preset-field textarea:focus,
        .save-preset-field select:focus {
          outline: none;
          border-color: #4a9eff;
        }

        .save-preset-field textarea {
          resize: vertical;
          min-height: 60px;
        }

        .save-preset-field select {
          cursor: pointer;
        }

        .save-preset-preview {
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }

        .save-preset-preview h4 {
          margin: 0 0 8px 0;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: rgba(255, 255, 255, 0.5);
        }

        .save-preset-settings-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 12px;
        }

        .save-preset-settings-list div {
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }

        .save-preset-settings-list span {
          color: rgba(255, 255, 255, 0.5);
        }

        .save-preset-footer {
          display: flex;
          gap: 8px;
          padding: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .save-preset-footer button {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .save-preset-footer .btn-secondary {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .save-preset-footer .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .save-preset-footer .btn-primary {
          background: #4a9eff;
          color: #fff;
        }

        .save-preset-footer .btn-primary:hover {
          background: #3a8eef;
        }

        .save-preset-footer .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
