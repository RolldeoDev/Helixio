/**
 * Preset Picker Component
 *
 * Dropdown for quick preset selection in the reader settings panel.
 * Allows users to apply presets to the current reading settings.
 */

import { useState, useEffect, useRef } from 'react';
import {
  getReaderPresetsGrouped,
  applyPresetToIssue,
  PresetsGrouped,
  ReaderPreset,
} from '../../services/api.service';

interface PresetPickerProps {
  fileId: string;
  onPresetApplied: (preset: ReaderPreset) => void;
  basedOnPresetName?: string | null;
}

const PRESET_ICONS: Record<string, string> = {
  'book': '📖',
  'scroll': '📜',
  'smartphone': '📱',
  'manga': '🇯🇵',
  'webtoon': '📲',
  'default': '⚙️',
};

export function PresetPicker({ fileId, onPresetApplied, basedOnPresetName }: PresetPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [presets, setPresets] = useState<PresetsGrouped | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load presets when dropdown opens
  useEffect(() => {
    if (isOpen && !presets) {
      loadPresets();
    }
  }, [isOpen, presets]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const loadPresets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReaderPresetsGrouped();
      setPresets(data);
    } catch (err) {
      setError('Failed to load presets');
      console.error('Failed to load presets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = async (preset: ReaderPreset) => {
    setApplying(true);
    try {
      await applyPresetToIssue(preset.id, fileId);
      onPresetApplied(preset);
      setIsOpen(false);
    } catch (err) {
      setError('Failed to apply preset');
      console.error('Failed to apply preset:', err);
    } finally {
      setApplying(false);
    }
  };

  const getPresetIcon = (preset: ReaderPreset) => {
    if (preset.icon) {
      return PRESET_ICONS[preset.icon] || preset.icon;
    }
    return PRESET_ICONS['default'];
  };

  const hasPresets = presets && (
    presets.bundled.length > 0 ||
    presets.system.length > 0 ||
    presets.user.length > 0
  );

  return (
    <div className="reader-preset-picker" ref={dropdownRef}>
      <button
        className="reader-preset-picker-btn"
        onClick={() => setIsOpen(!isOpen)}
        disabled={applying}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        <span>Apply Preset</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {basedOnPresetName && (
        <div className="reader-preset-origin">
          Based on: {basedOnPresetName}
        </div>
      )}

      {isOpen && (
        <div className="reader-preset-dropdown">
          {loading ? (
            <div className="reader-preset-loading">Loading presets...</div>
          ) : error ? (
            <div className="reader-preset-error">{error}</div>
          ) : !hasPresets ? (
            <div className="reader-preset-empty">No presets available</div>
          ) : (
            <>
              {/* Bundled Presets */}
              {presets.bundled.length > 0 && (
                <div className="reader-preset-group">
                  <div className="reader-preset-group-label">Bundled</div>
                  {presets.bundled.map((preset) => (
                    <button
                      key={preset.id}
                      className="reader-preset-item"
                      onClick={() => handleApplyPreset(preset)}
                      disabled={applying}
                    >
                      <span className="preset-icon">{getPresetIcon(preset)}</span>
                      <span className="preset-name">{preset.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* System Presets */}
              {presets.system.length > 0 && (
                <div className="reader-preset-group">
                  <div className="reader-preset-group-label">System</div>
                  {presets.system.map((preset) => (
                    <button
                      key={preset.id}
                      className="reader-preset-item"
                      onClick={() => handleApplyPreset(preset)}
                      disabled={applying}
                    >
                      <span className="preset-icon">{getPresetIcon(preset)}</span>
                      <span className="preset-name">{preset.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* User Presets */}
              {presets.user.length > 0 && (
                <div className="reader-preset-group">
                  <div className="reader-preset-group-label">My Presets</div>
                  {presets.user.map((preset) => (
                    <button
                      key={preset.id}
                      className="reader-preset-item"
                      onClick={() => handleApplyPreset(preset)}
                      disabled={applying}
                    >
                      <span className="preset-icon">{getPresetIcon(preset)}</span>
                      <span className="preset-name">{preset.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <style>{`
        .reader-preset-picker {
          position: relative;
          margin-bottom: 16px;
        }

        .reader-preset-picker-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: inherit;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .reader-preset-picker-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .reader-preset-picker-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .reader-preset-picker-btn span {
          flex: 1;
          text-align: left;
        }

        .reader-preset-origin {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 4px;
          padding-left: 4px;
        }

        .reader-preset-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: #2a2a2a;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 100;
          max-height: 280px;
          overflow-y: auto;
        }

        .reader-preset-loading,
        .reader-preset-error,
        .reader-preset-empty {
          padding: 16px;
          text-align: center;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
        }

        .reader-preset-error {
          color: #ff6b6b;
        }

        .reader-preset-group {
          padding: 8px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .reader-preset-group:last-child {
          border-bottom: none;
        }

        .reader-preset-group-label {
          padding: 4px 12px 8px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: rgba(255, 255, 255, 0.4);
          font-weight: 600;
        }

        .reader-preset-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          background: transparent;
          border: none;
          color: inherit;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .reader-preset-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .reader-preset-item:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .reader-preset-item .preset-icon {
          font-size: 16px;
          width: 24px;
          text-align: center;
        }

        .reader-preset-item .preset-name {
          flex: 1;
          text-align: left;
        }
      `}</style>
    </div>
  );
}
