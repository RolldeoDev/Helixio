/**
 * Reader Settings Panel
 *
 * Side panel for adjusting reader preferences.
 * Includes preset picker for quick preset application and
 * save preset functionality.
 */

import { useState, useEffect } from 'react';
import { useReader } from './ReaderContext';
import { PresetPicker } from './PresetPicker';
import { SavePresetModal } from './SavePresetModal';
import {
  getResolvedReaderSettingsWithOrigin,
  ReaderPreset,
} from '../../services/api.service';

export function ReaderSettings() {
  const {
    state,
    closeSettings,
    setMode,
    setDirection,
    setScaling,
    setCustomWidth,
    setSplitting,
    setBackground,
    setBrightness,
    setColorCorrection,
    togglePageShadow,
    toggleAutoHideUI,
    setUsePhysicalNavigation,
    saveSettings,
    setWebtoonGap,
    setWebtoonMaxWidth,
    rotatePageCW,
    rotatePageCCW,
    resetPageRotation,
    getPageRotation,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useReader();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [basedOnPresetName, setBasedOnPresetName] = useState<string | null>(null);

  // Load current preset origin info
  useEffect(() => {
    async function loadPresetOrigin() {
      try {
        const result = await getResolvedReaderSettingsWithOrigin(state.fileId);
        setBasedOnPresetName(result.basedOnPreset?.name || null);
      } catch (err) {
        console.error('Failed to load preset origin:', err);
      }
    }
    loadPresetOrigin();
  }, [state.fileId]);

  const currentRotation = getPageRotation(state.currentPage);

  const handlePresetApplied = (preset: ReaderPreset) => {
    // Update local state with the preset settings
    setMode(preset.mode as 'single' | 'double' | 'doubleManga' | 'continuous');
    setDirection(preset.direction as 'ltr' | 'rtl' | 'vertical');
    setScaling(preset.scaling as 'fitHeight' | 'fitWidth' | 'fitScreen' | 'original' | 'custom');
    setCustomWidth(preset.customWidth);
    setSplitting(preset.splitting as 'none' | 'ltr' | 'rtl');
    setBackground(preset.background as 'white' | 'gray' | 'black');
    setBrightness(preset.brightness);
    setColorCorrection(preset.colorCorrection as 'none' | 'sepia-correct' | 'contrast-boost' | 'desaturate' | 'invert');
    if (preset.showPageShadow !== state.showPageShadow) togglePageShadow();
    if (preset.autoHideUI !== state.autoHideUI) toggleAutoHideUI();
    setWebtoonGap(preset.webtoonGap ?? 8);
    setWebtoonMaxWidth(preset.webtoonMaxWidth ?? 800);
    // Update the preset origin name
    setBasedOnPresetName(preset.name);
  };

  const handleSaveAsDefault = async () => {
    await saveSettings();
    closeSettings();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on the overlay, not on children
    if (e.target === e.currentTarget) {
      closeSettings();
    }
  };

  return (
    <div className="reader-settings-overlay" onClick={handleOverlayClick}>
      <div className="reader-settings-panel">
        <div className="reader-settings-header">
          <h3>Reader Settings</h3>
          <button className="reader-settings-close" onClick={closeSettings}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="reader-settings-content">
          {/* Preset Picker */}
          <PresetPicker
            fileId={state.fileId}
            onPresetApplied={handlePresetApplied}
            basedOnPresetName={basedOnPresetName}
          />

          {/* Reading Mode */}
          <div className="reader-settings-section">
            <h4>Reading Mode</h4>
            <div className="reader-settings-options">
              <label className={`reader-settings-option ${state.mode === 'single' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="mode"
                  checked={state.mode === 'single'}
                  onChange={() => setMode('single')}
                />
                <span className="option-label">Single Page</span>
                <span className="option-hint">1</span>
              </label>
              <label className={`reader-settings-option ${state.mode === 'double' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="mode"
                  checked={state.mode === 'double'}
                  onChange={() => setMode('double')}
                />
                <span className="option-label">Double Page</span>
                <span className="option-hint">2</span>
              </label>
              <label className={`reader-settings-option ${state.mode === 'doubleManga' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="mode"
                  checked={state.mode === 'doubleManga'}
                  onChange={() => setMode('doubleManga')}
                />
                <span className="option-label">Double (Manga)</span>
              </label>
              <label className={`reader-settings-option ${state.mode === 'continuous' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="mode"
                  checked={state.mode === 'continuous'}
                  onChange={() => setMode('continuous')}
                />
                <span className="option-label">Continuous</span>
                <span className="option-hint">4</span>
              </label>
              <label className={`reader-settings-option ${state.mode === 'webtoon' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="mode"
                  checked={state.mode === 'webtoon'}
                  onChange={() => setMode('webtoon')}
                />
                <span className="option-label">Webtoon</span>
                <span className="option-hint">5</span>
              </label>
            </div>
            {state.isAutoWebtoon && state.mode !== 'webtoon' && (
              <div className="reader-settings-hint">
                Webtoon format detected - consider using Webtoon mode
              </div>
            )}
          </div>

          {/* Webtoon Settings (only show when in webtoon mode) */}
          {state.mode === 'webtoon' && (
            <div className="reader-settings-section">
              <h4>Webtoon Settings</h4>
              <div className="reader-settings-slider-group">
                <label>Gap between pages: {state.webtoonGap}px</label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={state.webtoonGap}
                  onChange={(e) => setWebtoonGap(parseInt(e.target.value))}
                  className="reader-settings-slider"
                />
              </div>
              <div className="reader-settings-slider-group">
                <label>Max width: {state.webtoonMaxWidth}px</label>
                <input
                  type="range"
                  min="400"
                  max="1600"
                  step="50"
                  value={state.webtoonMaxWidth}
                  onChange={(e) => setWebtoonMaxWidth(parseInt(e.target.value))}
                  className="reader-settings-slider"
                />
              </div>
            </div>
          )}

          {/* Reading Direction */}
          <div className="reader-settings-section">
            <h4>Reading Direction</h4>
            <div className="reader-settings-options">
              <label className={`reader-settings-option ${state.direction === 'ltr' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="direction"
                  checked={state.direction === 'ltr'}
                  onChange={() => setDirection('ltr')}
                />
                <span className="option-label">Left to Right</span>
              </label>
              <label className={`reader-settings-option ${state.direction === 'rtl' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="direction"
                  checked={state.direction === 'rtl'}
                  onChange={() => setDirection('rtl')}
                />
                <span className="option-label">Right to Left</span>
              </label>
              <label className={`reader-settings-option ${state.direction === 'vertical' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="direction"
                  checked={state.direction === 'vertical'}
                  onChange={() => setDirection('vertical')}
                />
                <span className="option-label">Vertical</span>
              </label>
            </div>
          </div>

          {/* Navigation Behavior - Only shown when direction is RTL */}
          {state.direction === 'rtl' && (
            <div className="reader-settings-section">
              <h4>Navigation Behavior</h4>
              <div className="reader-settings-options">
                <label className={`reader-settings-option ${state.usePhysicalNavigation !== true ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="navBehavior"
                    checked={state.usePhysicalNavigation !== true}
                    onChange={() => setUsePhysicalNavigation(null)}
                  />
                  <span className="option-label">Logical (Manga-style)</span>
                  <span className="option-hint">Right arrow = Previous</span>
                </label>
                <label className={`reader-settings-option ${state.usePhysicalNavigation === true ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="navBehavior"
                    checked={state.usePhysicalNavigation === true}
                    onChange={() => setUsePhysicalNavigation(true)}
                  />
                  <span className="option-label">Physical (Western-style)</span>
                  <span className="option-hint">Right arrow = Next</span>
                </label>
              </div>
            </div>
          )}

          {/* Image Scaling */}
          <div className="reader-settings-section">
            <h4>Image Scaling</h4>
            <div className="reader-settings-options">
              <label className={`reader-settings-option ${state.scaling === 'fitHeight' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="scaling"
                  checked={state.scaling === 'fitHeight'}
                  onChange={() => setScaling('fitHeight')}
                />
                <span className="option-label">Fit to Height</span>
                <span className="option-hint">H</span>
              </label>
              <label className={`reader-settings-option ${state.scaling === 'fitWidth' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="scaling"
                  checked={state.scaling === 'fitWidth'}
                  onChange={() => setScaling('fitWidth')}
                />
                <span className="option-label">Fit to Width</span>
                <span className="option-hint">W</span>
              </label>
              <label className={`reader-settings-option ${state.scaling === 'fitScreen' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="scaling"
                  checked={state.scaling === 'fitScreen'}
                  onChange={() => setScaling('fitScreen')}
                />
                <span className="option-label">Fit to Screen</span>
              </label>
              <label className={`reader-settings-option ${state.scaling === 'original' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="scaling"
                  checked={state.scaling === 'original'}
                  onChange={() => setScaling('original')}
                />
                <span className="option-label">Original Size</span>
                <span className="option-hint">O</span>
              </label>
              <label className={`reader-settings-option ${state.scaling === 'custom' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="scaling"
                  checked={state.scaling === 'custom'}
                  onChange={() => setScaling('custom')}
                />
                <span className="option-label">Custom Width</span>
              </label>
            </div>
            {state.scaling === 'custom' && (
              <div className="reader-settings-custom-width">
                <input
                  type="number"
                  value={state.customWidth || 800}
                  onChange={(e) => setCustomWidth(parseInt(e.target.value) || 800)}
                  min={100}
                  max={4000}
                  step={50}
                />
                <span>px</span>
              </div>
            )}
          </div>

          {/* Zoom */}
          <div className="reader-settings-section">
            <h4>Zoom: {Math.round(state.zoom * 100)}%</h4>
            <div className="reader-settings-zoom">
              <button className="btn-secondary" onClick={zoomOut} disabled={state.zoom <= 0.25}>
                -
              </button>
              <button className="btn-secondary" onClick={resetZoom}>
                Reset
              </button>
              <button className="btn-secondary" onClick={zoomIn} disabled={state.zoom >= 4}>
                +
              </button>
            </div>
          </div>

          {/* Page Rotation */}
          <div className="reader-settings-section">
            <h4>Page Rotation: {currentRotation}°</h4>
            <div className="reader-settings-zoom">
              <button
                className="btn-secondary"
                onClick={() => rotatePageCCW()}
                title="Rotate counter-clockwise"
              >
                ↺
              </button>
              <button
                className="btn-secondary"
                onClick={() => resetPageRotation()}
                disabled={currentRotation === 0}
              >
                Reset
              </button>
              <button
                className="btn-secondary"
                onClick={() => rotatePageCW()}
                title="Rotate clockwise"
              >
                ↻
              </button>
            </div>
            <div className="reader-settings-hint" style={{ marginTop: '8px', fontSize: '12px', opacity: 0.6 }}>
              Rotation applies to current page only
            </div>
          </div>

          {/* Image Splitting */}
          <div className="reader-settings-section">
            <h4>Image Splitting (for double-page spreads)</h4>
            <div className="reader-settings-options">
              <label className={`reader-settings-option ${state.splitting === 'none' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="splitting"
                  checked={state.splitting === 'none'}
                  onChange={() => setSplitting('none')}
                />
                <span className="option-label">None</span>
              </label>
              <label className={`reader-settings-option ${state.splitting === 'ltr' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="splitting"
                  checked={state.splitting === 'ltr'}
                  onChange={() => setSplitting('ltr')}
                />
                <span className="option-label">Left First</span>
              </label>
              <label className={`reader-settings-option ${state.splitting === 'rtl' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="splitting"
                  checked={state.splitting === 'rtl'}
                  onChange={() => setSplitting('rtl')}
                />
                <span className="option-label">Right First (Manga)</span>
              </label>
            </div>
          </div>

          {/* Background Color */}
          <div className="reader-settings-section">
            <h4>Background</h4>
            <div className="reader-settings-options horizontal">
              <label className={`reader-settings-color-option ${state.background === 'white' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="background"
                  checked={state.background === 'white'}
                  onChange={() => setBackground('white')}
                />
                <span className="color-swatch color-white" />
                <span className="option-label">White</span>
              </label>
              <label className={`reader-settings-color-option ${state.background === 'gray' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="background"
                  checked={state.background === 'gray'}
                  onChange={() => setBackground('gray')}
                />
                <span className="color-swatch color-gray" />
                <span className="option-label">Gray</span>
              </label>
              <label className={`reader-settings-color-option ${state.background === 'black' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="background"
                  checked={state.background === 'black'}
                  onChange={() => setBackground('black')}
                />
                <span className="color-swatch color-black" />
                <span className="option-label">Black</span>
              </label>
            </div>
          </div>

          {/* Brightness */}
          <div className="reader-settings-section">
            <h4>Brightness: {state.brightness}%</h4>
            <input
              type="range"
              min="20"
              max="150"
              value={state.brightness}
              onChange={(e) => setBrightness(parseInt(e.target.value))}
              className="reader-settings-slider"
            />
          </div>

          {/* Color Correction */}
          <div className="reader-settings-section">
            <h4>Color Correction</h4>
            <div className="reader-settings-options">
              <label className={`reader-settings-option ${state.colorCorrection === 'none' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="colorCorrection"
                  checked={state.colorCorrection === 'none'}
                  onChange={() => setColorCorrection('none')}
                />
                <span className="option-label">None</span>
              </label>
              <label className={`reader-settings-option ${state.colorCorrection === 'sepia-correct' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="colorCorrection"
                  checked={state.colorCorrection === 'sepia-correct'}
                  onChange={() => setColorCorrection('sepia-correct')}
                />
                <span className="option-label">Remove Yellow Tint</span>
              </label>
              <label className={`reader-settings-option ${state.colorCorrection === 'contrast-boost' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="colorCorrection"
                  checked={state.colorCorrection === 'contrast-boost'}
                  onChange={() => setColorCorrection('contrast-boost')}
                />
                <span className="option-label">Boost Contrast</span>
              </label>
              <label className={`reader-settings-option ${state.colorCorrection === 'desaturate' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="colorCorrection"
                  checked={state.colorCorrection === 'desaturate'}
                  onChange={() => setColorCorrection('desaturate')}
                />
                <span className="option-label">Desaturate</span>
              </label>
              <label className={`reader-settings-option ${state.colorCorrection === 'invert' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="colorCorrection"
                  checked={state.colorCorrection === 'invert'}
                  onChange={() => setColorCorrection('invert')}
                />
                <span className="option-label">Invert Colors</span>
              </label>
            </div>
          </div>

          {/* Toggles */}
          <div className="reader-settings-section">
            <h4>Options</h4>
            <label className="reader-settings-toggle">
              <input
                type="checkbox"
                checked={state.showPageShadow}
                onChange={togglePageShadow}
              />
              <span>Show page shadow</span>
            </label>
            <label className="reader-settings-toggle">
              <input
                type="checkbox"
                checked={state.autoHideUI}
                onChange={toggleAutoHideUI}
              />
              <span>Auto-hide controls</span>
            </label>
          </div>
        </div>

        <div className="reader-settings-footer">
          <button className="btn-secondary" onClick={() => setShowSaveModal(true)}>
            Save as Preset
          </button>
          <button className="btn-primary" onClick={handleSaveAsDefault}>
            Save as Default
          </button>
          <button className="btn-ghost" onClick={closeSettings}>
            Close
          </button>
        </div>
      </div>

      {/* Save Preset Modal */}
      <SavePresetModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSaved={() => {
          // Optionally refresh or show a success message
        }}
        currentSettings={{
          mode: state.mode,
          direction: state.direction,
          scaling: state.scaling,
          customWidth: state.customWidth,
          splitting: state.splitting,
          background: state.background,
          brightness: state.brightness,
          colorCorrection: state.colorCorrection,
          showPageShadow: state.showPageShadow,
          autoHideUI: state.autoHideUI,
          preloadCount: state.preloadCount,
          webtoonGap: state.webtoonGap,
          webtoonMaxWidth: state.webtoonMaxWidth,
        }}
      />
    </div>
  );
}
