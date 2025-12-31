/**
 * PreferencesStep Component
 *
 * Fourth step of the setup wizard. Allows user to select theme and reader mode.
 */

import { useState } from 'react';
import { useTheme } from '../../themes/ThemeContext';
import { getTheme } from '../../themes';
import type { ThemeId, ColorScheme } from '../../themes/types';
import './SetupWizard.css';

interface PreferencesStepProps {
  onComplete: () => void;
}

type ReaderMode = 'single' | 'double' | 'webtoon';

const BUNDLED_THEMES: ThemeId[] = [
  'default',
  'dc',
  'marvel',
  'sandman',
  'synthwave',
  'retro',
  'manga',
  'pulp',
  'high-contrast',
];

const READER_MODES: { id: ReaderMode; label: string; description: string }[] = [
  {
    id: 'single',
    label: 'Single Page',
    description: 'One page at a time, ideal for phones and tablets',
  },
  {
    id: 'double',
    label: 'Double Page',
    description: 'Two pages side by side, like a physical comic',
  },
  {
    id: 'webtoon',
    label: 'Webtoon',
    description: 'Continuous vertical scroll, ideal for web comics',
  },
];

export function PreferencesStep({ onComplete }: PreferencesStepProps) {
  const { themeId, colorScheme, setTheme, setColorScheme } = useTheme();
  const [selectedReaderMode, setSelectedReaderMode] = useState<ReaderMode>('single');

  // Get theme display info
  const getThemeInfo = (id: ThemeId, scheme: ColorScheme) => {
    const theme = getTheme(id, scheme);
    return theme
      ? { name: theme.meta?.name || id, colors: theme.tokens }
      : { name: id, colors: null };
  };

  // Handle finish - preferences are already saved via context
  const handleFinish = () => {
    // Reader mode could be saved to user settings here if needed
    // For now, we just complete the wizard
    onComplete();
  };

  return (
    <div className="setup-step preferences-step">
      <div className="step-header">
        <h2>Personalize Your Experience</h2>
        <p className="step-subtitle">
          Choose your preferred theme and reading style. You can change these anytime in Settings.
        </p>
      </div>

      <div className="preferences-sections">
        {/* Color Scheme */}
        <div className="preference-section">
          <h3 className="preference-title">Color Mode</h3>
          <div className="color-scheme-toggle">
            <button
              type="button"
              className={`scheme-option ${colorScheme === 'light' ? 'selected' : ''}`}
              onClick={() => setColorScheme('light')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              <span>Light</span>
            </button>
            <button
              type="button"
              className={`scheme-option ${colorScheme === 'dark' ? 'selected' : ''}`}
              onClick={() => setColorScheme('dark')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
              <span>Dark</span>
            </button>
          </div>
        </div>

        {/* Theme Selection */}
        <div className="preference-section">
          <h3 className="preference-title">Theme</h3>
          <div className="theme-grid">
            {BUNDLED_THEMES.map((id) => {
              const info = getThemeInfo(id, colorScheme);
              const isSelected = themeId === id;

              return (
                <button
                  key={id}
                  type="button"
                  className={`theme-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setTheme(id)}
                >
                  <div
                    className="theme-preview"
                    style={{
                      background: info.colors?.colorBg || '#1a1a1a',
                      borderColor: info.colors?.colorPrimary || '#6366f1',
                    }}
                  >
                    <div
                      className="theme-preview-accent"
                      style={{
                        background: info.colors?.colorPrimary || '#6366f1',
                      }}
                    />
                    <div
                      className="theme-preview-text"
                      style={{
                        background: info.colors?.colorText || '#ffffff',
                      }}
                    />
                  </div>
                  <span className="theme-name">{info.name}</span>
                  {isSelected && (
                    <span className="theme-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Reader Mode */}
        <div className="preference-section">
          <h3 className="preference-title">Default Reader Mode</h3>
          <div className="reader-mode-options">
            {READER_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`reader-mode-option ${selectedReaderMode === mode.id ? 'selected' : ''}`}
                onClick={() => setSelectedReaderMode(mode.id)}
              >
                <span className="reader-mode-label">{mode.label}</span>
                <span className="reader-mode-description">{mode.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="step-actions">
        <button className="btn-primary btn-lg" onClick={handleFinish}>
          Finish Setup
        </button>
      </div>
    </div>
  );
}
