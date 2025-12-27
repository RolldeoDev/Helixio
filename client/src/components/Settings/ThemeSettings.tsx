import { useState } from 'react';
import { useTheme } from '../../themes/ThemeContext';
import { useApiToast } from '../../hooks';
import { getTheme } from '../../themes';
import type { ThemeId } from '../../themes/types';
import { ThemeMockup } from './ThemeMockup';
import { VariableEditor } from './VariableEditor';
import { ThemeDropZone } from './ThemeDropZone';
import { useConfirmModal } from '../ConfirmModal';
import './ThemeSettings.css';

/**
 * ThemeSettings - Complete theme management UI
 * Includes theme picker, color scheme toggle, external theme management, and variable editor
 */
export function ThemeSettings() {
  const {
    themeId,
    colorScheme,
    followSystem,
    externalThemes,
    setTheme,
    setColorScheme,
    setFollowSystem,
    enableExternalTheme,
    disableExternalTheme,
    deleteExternalTheme,
    refreshExternalThemes,
    exportCurrentTheme,
    isEditorOpen,
    openEditor,
    closeEditor,
  } = useTheme();

  const [isExporting, setIsExporting] = useState(false);
  const [deletingTheme, setDeletingTheme] = useState<string | null>(null);
  const { addToast } = useApiToast();
  const confirm = useConfirmModal();

  // Get unique bundled theme IDs
  const bundledThemeIds: ThemeId[] = ['default', 'dc', 'marvel', 'sandman', 'synthwave', 'retro', 'manga', 'pulp', 'high-contrast'];

  // Handle theme selection
  const handleSelectTheme = (id: ThemeId) => {
    setTheme(id);
  };

  // Handle export
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await exportCurrentTheme();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `helixio-theme-${themeId}-${colorScheme}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast('success', 'Theme exported');
    } catch (err) {
      console.error('Failed to export theme:', err);
      addToast('error', 'Failed to export theme');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle external theme delete
  const handleDeleteExternal = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete Theme',
      message: 'Are you sure you want to delete this theme?',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    setDeletingTheme(id);
    try {
      await deleteExternalTheme(id);
      addToast('success', 'Theme deleted');
    } catch (err) {
      console.error('Failed to delete theme:', err);
      addToast('error', 'Failed to delete theme');
    } finally {
      setDeletingTheme(null);
    }
  };

  // Show variable editor modal
  if (isEditorOpen) {
    return (
      <div className="theme-settings__editor-overlay">
        <div className="theme-settings__editor-modal">
          <VariableEditor onClose={closeEditor} />
        </div>
      </div>
    );
  }

  return (
    <div className="theme-settings">
      {/* Color Scheme Section */}
      <section className="theme-settings__section">
        <h3 className="theme-settings__section-title">Color Scheme</h3>
        <div className="theme-settings__scheme-options">
          <button
            className={`theme-settings__scheme-btn ${
              !followSystem && colorScheme === 'light'
                ? 'theme-settings__scheme-btn--active'
                : ''
            }`}
            onClick={() => setColorScheme('light')}
            type="button"
          >
            <span className="theme-settings__scheme-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </span>
            Light
          </button>
          <button
            className={`theme-settings__scheme-btn ${
              !followSystem && colorScheme === 'dark'
                ? 'theme-settings__scheme-btn--active'
                : ''
            }`}
            onClick={() => setColorScheme('dark')}
            type="button"
          >
            <span className="theme-settings__scheme-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            </span>
            Dark
          </button>
          <label className="theme-settings__follow-system">
            <input
              type="checkbox"
              checked={followSystem}
              onChange={(e) => setFollowSystem(e.target.checked)}
            />
            <span>Follow System</span>
          </label>
        </div>
      </section>

      {/* Bundled Themes Section */}
      <section className="theme-settings__section">
        <h3 className="theme-settings__section-title">Theme</h3>
        <div className="theme-settings__themes-grid">
          {bundledThemeIds.map((id) => {
            const theme = getTheme(id, colorScheme);
            if (!theme) return null;

            return (
              <ThemeMockup
                key={id}
                theme={theme}
                isSelected={themeId === id}
                onClick={() => handleSelectTheme(id)}
                onEdit={(themeIdToEdit) => openEditor(themeIdToEdit)}
              />
            );
          })}
        </div>
      </section>

      {/* External Themes Section */}
      {externalThemes.length > 0 && (
        <section className="theme-settings__section">
          <div className="theme-settings__section-header">
            <h3 className="theme-settings__section-title">External Themes</h3>
            <button
              className="theme-settings__refresh-btn"
              onClick={refreshExternalThemes}
              type="button"
              title="Refresh themes"
            >
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.534 7h3.932a.25.25 0 01.192.41l-1.966 2.36a.25.25 0 01-.384 0l-1.966-2.36a.25.25 0 01.192-.41zm-11 2h3.932a.25.25 0 00.192-.41L2.692 6.23a.25.25 0 00-.384 0L.342 8.59A.25.25 0 00.534 9z"/>
                <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 11-.771-.636A6.002 6.002 0 0113.917 7H12.9A5.002 5.002 0 008 3zM3.1 9a5.002 5.002 0 008.757 2.182.5.5 0 11.771.636A6.002 6.002 0 012.083 9H3.1z"/>
              </svg>
              Refresh
            </button>
          </div>
          <div className="theme-settings__external-list">
            {externalThemes.map((theme) => (
              <div key={theme.id} className="theme-settings__external-item">
                <div className="theme-settings__external-info">
                  <span className="theme-settings__external-name">
                    {theme.name}
                  </span>
                  <span className="theme-settings__external-scheme">
                    {theme.scheme}
                  </span>
                </div>
                <div className="theme-settings__external-actions">
                  {theme.enabled ? (
                    <button
                      className="theme-settings__external-btn"
                      onClick={() => disableExternalTheme(theme.id)}
                      type="button"
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      className="theme-settings__external-btn theme-settings__external-btn--primary"
                      onClick={() => {
                        enableExternalTheme(theme.id);
                        setTheme(theme.id);
                      }}
                      type="button"
                    >
                      Enable
                    </button>
                  )}
                  <button
                    className="theme-settings__external-btn theme-settings__external-btn--danger"
                    onClick={() => handleDeleteExternal(theme.id)}
                    disabled={deletingTheme === theme.id}
                    type="button"
                  >
                    {deletingTheme === theme.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Import Theme Section */}
      <section className="theme-settings__section">
        <h3 className="theme-settings__section-title">Import Theme</h3>
        <ThemeDropZone />
      </section>

      {/* Export Section */}
      <section className="theme-settings__section">
        <div className="theme-settings__export">
          <button
            className="theme-settings__export-btn"
            onClick={handleExport}
            disabled={isExporting}
            type="button"
          >
            {isExporting ? 'Exporting...' : 'Export Current Theme'}
          </button>
          <p className="theme-settings__export-hint">
            Export your current theme with any customizations as a .zip file
          </p>
        </div>
      </section>

      {/* Info about external themes location */}
      <section className="theme-settings__section theme-settings__section--info">
        <p className="theme-settings__info-text">
          External themes are loaded from <code>~/.helixio/themes/</code>
          <br />
          Changes to theme files are automatically detected.
        </p>
      </section>
    </div>
  );
}

export default ThemeSettings;
