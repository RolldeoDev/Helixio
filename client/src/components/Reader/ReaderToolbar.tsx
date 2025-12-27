/**
 * Reader Toolbar
 *
 * Top toolbar with title, navigation, settings, and close button.
 */

import { useReader } from './ReaderContext';

interface ReaderToolbarProps {
  onClose: () => void;
  visible: boolean;
  onNavigateToFile?: (fileId: string) => void;
  onToggleQueue?: () => void;
  isQueueOpen?: boolean;
}

/**
 * Build a display title from file metadata.
 * Falls back to filename if insufficient metadata.
 */
function buildDisplayTitle(metadata: { series: string | null; number: string | null; volume: number | null; title: string | null } | null, filename: string): string {
  if (!metadata) {
    return filename;
  }

  const { series, number, volume, title } = metadata;

  // Need series AND (number OR title) to use metadata
  if (!series || (!number && !title)) {
    return filename;
  }

  let displayTitle = series;

  // Add volume if present
  if (volume !== null) {
    displayTitle += ` Vol. ${volume}`;
  }

  // Add issue number if present
  if (number) {
    displayTitle += ` #${number}`;
  }

  // Add title if present
  if (title) {
    displayTitle += ` - ${title}`;
  }

  return displayTitle;
}

export function ReaderToolbar({
  onClose,
  visible,
  onNavigateToFile,
  onToggleQueue,
  isQueueOpen,
}: ReaderToolbarProps) {
  const {
    state,
    toggleFullscreen,
    toggleSettings,
    toggleThumbnailStrip,
    addBookmark,
    isBookmarked,
    goToNextChapter,
    goToPrevChapter,
    hasNextChapter,
    hasPrevChapter,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useReader();

  const currentPageBookmarked = isBookmarked(state.currentPage);
  const displayTitle = buildDisplayTitle(state.metadata, state.filename);

  const handleBookmarkClick = () => {
    addBookmark();
  };

  const handlePrevChapter = () => {
    const prevFileId = goToPrevChapter();
    if (prevFileId && onNavigateToFile) {
      onNavigateToFile(prevFileId);
    }
  };

  const handleNextChapter = () => {
    const nextFileId = goToNextChapter();
    if (nextFileId && onNavigateToFile) {
      onNavigateToFile(nextFileId);
    }
  };

  // Show chapter info if available
  const chapterInfo = state.adjacentFiles?.seriesName
    ? `${state.adjacentFiles.currentIndex + 1} of ${state.adjacentFiles.totalInSeries}`
    : null;

  return (
    <div className={`reader-toolbar ${visible ? 'visible' : 'hidden'}`}>
      <div className="reader-toolbar-left">
        <button
          className="reader-toolbar-btn"
          onClick={onClose}
          title="Close Reader (Esc)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="reader-toolbar-title" title={displayTitle}>
          {displayTitle}
        </span>
      </div>

      <div className="reader-toolbar-center">
        {(hasPrevChapter || hasNextChapter) && (
          <button
            className="reader-toolbar-btn reader-chapter-btn"
            onClick={handlePrevChapter}
            disabled={!hasPrevChapter}
            title="Previous Issue ([)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
          </button>
        )}
        <span className="reader-page-indicator">
          {state.currentPage + 1} / {state.totalPages}
          {chapterInfo && <span className="reader-chapter-indicator"> ({chapterInfo})</span>}
        </span>
        {(hasPrevChapter || hasNextChapter) && (
          <button
            className="reader-toolbar-btn reader-chapter-btn"
            onClick={handleNextChapter}
            disabled={!hasNextChapter}
            title="Next Issue (])"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </button>
        )}
      </div>

      <div className="reader-toolbar-right">
        {/* Zoom controls - always visible */}
        <div className="reader-toolbar-zoom">
            <button
              className="reader-toolbar-btn reader-zoom-btn"
              onClick={zoomOut}
              title="Zoom Out (-)"
              disabled={state.zoom <= 0.25}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
            <button
              className="reader-toolbar-btn reader-zoom-btn"
              onClick={resetZoom}
              title="Reset Zoom (0)"
            >
              <span className="reader-zoom-level">{Math.round(state.zoom * 100)}%</span>
            </button>
            <button
              className="reader-toolbar-btn reader-zoom-btn"
              onClick={zoomIn}
              title="Zoom In (+)"
              disabled={state.zoom >= 4}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
        </div>

        <button
          className={`reader-toolbar-btn ${currentPageBookmarked ? 'active' : ''}`}
          onClick={handleBookmarkClick}
          title={currentPageBookmarked ? 'Remove Bookmark (B)' : 'Add Bookmark (B)'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={currentPageBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        <button
          className="reader-toolbar-btn"
          onClick={toggleFullscreen}
          title="Toggle Fullscreen (F)"
        >
          {state.isFullscreen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
        </button>

        <button
          className={`reader-toolbar-btn ${state.isThumbnailStripOpen ? 'active' : ''}`}
          onClick={toggleThumbnailStrip}
          title="Thumbnail Strip (T)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
        </button>

        {onToggleQueue && (
          <button
            className={`reader-toolbar-btn ${isQueueOpen ? 'active' : ''}`}
            onClick={onToggleQueue}
            title="Reading Queue (Q)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        )}

        <button
          className={`reader-toolbar-btn ${state.isSettingsOpen ? 'active' : ''}`}
          onClick={toggleSettings}
          title="Settings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        <button
          className="reader-toolbar-btn reader-close-btn"
          onClick={onClose}
          title="Close (Esc)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
