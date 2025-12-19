/**
 * Mobile Reader UI Component
 *
 * Provides mobile-first UI enhancements for the reader:
 * - Auto-hiding toolbar
 * - Large touch targets
 * - Bottom navigation (thumb-friendly)
 * - Landscape/portrait adaptation
 * - Guided View toggle
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useReader } from './ReaderContext';
import './MobileReaderUI.css';

// =============================================================================
// Types
// =============================================================================

interface MobileReaderUIProps {
  onToggleGuidedView: () => void;
  isGuidedViewActive: boolean;
  onExit: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const AUTO_HIDE_DELAY = 3000; // ms before UI auto-hides
const TOUCH_MOVE_THRESHOLD = 10; // pixels before considered a swipe

// =============================================================================
// Component
// =============================================================================

export function MobileReaderUI({
  onToggleGuidedView,
  isGuidedViewActive,
  onExit,
}: MobileReaderUIProps) {
  const {
    state,
    nextPage,
    prevPage,
    goToPage,
    toggleFullscreen,
    toggleSettings,
    toggleThumbnailStrip,
    addBookmark,
    removeBookmark,
    isBookmarked,
  } = useReader();

  const [isVisible, setIsVisible] = useState(true);
  const [showPageSlider, setShowPageSlider] = useState(false);
  const hideTimeoutRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Auto-hide logic
  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    if (state.autoHideUI && !state.isSettingsOpen) {
      hideTimeoutRef.current = window.setTimeout(() => {
        setIsVisible(false);
        setShowPageSlider(false);
      }, AUTO_HIDE_DELAY);
    }
  }, [state.autoHideUI, state.isSettingsOpen]);

  const showUI = useCallback(() => {
    setIsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // Touch handlers for tap-to-show
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0]!.clientX,
        y: e.touches[0]!.clientY,
      };
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0]!;
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

    // Only toggle UI on tap (not swipe)
    if (deltaX < TOUCH_MOVE_THRESHOLD && deltaY < TOUCH_MOVE_THRESHOLD) {
      if (!isVisible) {
        showUI();
      } else {
        // Tap in center to hide
        const screenWidth = window.innerWidth;
        const tapX = touch.clientX;
        if (tapX > screenWidth * 0.3 && tapX < screenWidth * 0.7) {
          setIsVisible(false);
          setShowPageSlider(false);
        }
      }
    }

    touchStartRef.current = null;
  }, [isVisible, showUI]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Show UI initially then schedule hide
  useEffect(() => {
    scheduleHide();
  }, [scheduleHide]);

  // Progress calculation
  const progress = state.totalPages > 0
    ? Math.round(((state.currentPage + 1) / state.totalPages) * 100)
    : 0;

  const currentBookmarked = isBookmarked(state.currentPage);

  const handleBookmarkToggle = async () => {
    if (currentBookmarked) {
      await removeBookmark(state.currentPage);
    } else {
      await addBookmark();
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value, 10);
    goToPage(page);
  };

  return (
    <div
      className={`mobile-reader-ui ${isVisible ? 'visible' : 'hidden'}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Toolbar */}
      <div className="mobile-toolbar-top">
        <button
          className="mobile-btn back"
          onClick={onExit}
          title="Back to Library"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="mobile-title">
          <span className="mobile-filename">{state.filename.replace(/\.cb[rz7t]$/i, '')}</span>
          <span className="mobile-page-info">
            {state.currentPage + 1} / {state.totalPages}
          </span>
        </div>

        <button
          className="mobile-btn settings"
          onClick={toggleSettings}
          title="Settings"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="mobile-toolbar-bottom">
        {/* Page Progress Bar (clickable) */}
        <div
          className="mobile-progress-bar"
          onClick={() => setShowPageSlider(!showPageSlider)}
        >
          <div
            className="mobile-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Page Slider (shown when progress bar is clicked) */}
        {showPageSlider && (
          <div className="mobile-page-slider">
            <span className="slider-label">1</span>
            <input
              type="range"
              min={0}
              max={state.totalPages - 1}
              value={state.currentPage}
              onChange={handleSliderChange}
              className="page-slider"
            />
            <span className="slider-label">{state.totalPages}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mobile-nav-buttons">
          <button
            className="mobile-nav-btn"
            onClick={prevPage}
            disabled={state.currentPage === 0}
            title="Previous Page"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <button
            className={`mobile-nav-btn bookmark ${currentBookmarked ? 'active' : ''}`}
            onClick={handleBookmarkToggle}
            title={currentBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill={currentBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <button
            className="mobile-nav-btn thumbnails"
            onClick={toggleThumbnailStrip}
            title="Thumbnails"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="6" height="6" rx="1" />
              <rect x="15" y="3" width="6" height="6" rx="1" />
              <rect x="3" y="15" width="6" height="6" rx="1" />
              <rect x="15" y="15" width="6" height="6" rx="1" />
            </svg>
          </button>

          <button
            className={`mobile-nav-btn guided ${isGuidedViewActive ? 'active' : ''}`}
            onClick={onToggleGuidedView}
            title={isGuidedViewActive ? 'Exit Guided View' : 'Guided View'}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="12" y1="3" x2="12" y2="21" />
            </svg>
          </button>

          <button
            className="mobile-nav-btn fullscreen"
            onClick={toggleFullscreen}
            title={state.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {state.isFullscreen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>

          <button
            className="mobile-nav-btn"
            onClick={nextPage}
            disabled={state.currentPage >= state.totalPages - 1}
            title="Next Page"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Reading Mode Indicator */}
      {state.mode === 'webtoon' && (
        <div className="mobile-mode-indicator">
          Webtoon Mode
        </div>
      )}
    </div>
  );
}
