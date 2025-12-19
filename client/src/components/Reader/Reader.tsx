/**
 * Reader Component
 *
 * Main container for the comic reader.
 * Handles layout, page display, and coordinates all reader functionality.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useReader } from './ReaderContext';
import { ReaderToolbar } from './ReaderToolbar';
import { ReaderFooter } from './ReaderFooter';
import { ReaderPage } from './ReaderPage';
import { ReaderSettings } from './ReaderSettings';
import { ThumbnailStrip } from './ThumbnailStrip';
import { JumpToPageModal } from './JumpToPageModal';
import { ReadingQueue } from './ReadingQueue';
import { UpNextIndicator } from './UpNextIndicator';
import { useKeyboardShortcuts, ShortcutAction } from './hooks/useKeyboardShortcuts';
import { useTouchGestures } from './hooks/useTouchGestures';
import './Reader.css';

interface ReaderProps {
  onClose: () => void;
  onNavigateToFile?: (fileId: string) => void;
}

export function Reader({ onClose, onNavigateToFile }: ReaderProps) {
  const {
    state,
    showUI,
    hideUI,
    toggleUI,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    setMode,
    setDirection,
    setScaling,
    toggleFullscreen,
    toggleSettings,
    toggleThumbnailStrip,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    setPan,
    addBookmark,
    removeBookmark,
    isBookmarked,
    goToNextChapter,
    goToPrevChapter,
    rotatePageCW,
    rotatePageCCW,
  } = useReader();

  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [hoveredEdge, setHoveredEdge] = useState<'left' | 'right' | 'top' | 'bottom' | null>(null);
  const [isJumpToPageOpen, setIsJumpToPageOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [pinchBaseZoom, setPinchBaseZoom] = useState(1);

  const openJumpToPage = useCallback(() => {
    setIsJumpToPageOpen(true);
  }, []);

  const closeJumpToPage = useCallback(() => {
    setIsJumpToPageOpen(false);
  }, []);

  const toggleQueue = useCallback(() => {
    setIsQueueOpen((prev) => !prev);
  }, []);

  const closeQueue = useCallback(() => {
    setIsQueueOpen(false);
  }, []);

  // Handle keyboard shortcut actions
  const handleShortcutAction = useCallback(
    (action: ShortcutAction) => {
      switch (action) {
        // Navigation
        case 'nextPage':
          nextPage();
          break;
        case 'prevPage':
          prevPage();
          break;
        case 'firstPage':
          firstPage();
          break;
        case 'lastPage':
          lastPage();
          break;
        case 'nextChapter': {
          const nextFile = goToNextChapter();
          if (nextFile && onNavigateToFile) {
            onNavigateToFile(nextFile);
          }
          break;
        }
        case 'prevChapter': {
          const prevFile = goToPrevChapter();
          if (prevFile && onNavigateToFile) {
            onNavigateToFile(prevFile);
          }
          break;
        }
        case 'jumpToPage':
          openJumpToPage();
          break;

        // Reading modes
        case 'singleMode':
          setMode('single');
          break;
        case 'doubleMode':
          setMode('double');
          break;
        case 'doubleMangaMode':
          setMode('doubleManga');
          break;
        case 'continuousMode':
          setMode('continuous');
          break;
        case 'webtoonMode':
          setMode('webtoon');
          break;

        // Scaling
        case 'fitHeight':
          setScaling('fitHeight');
          break;
        case 'fitWidth':
          setScaling('fitWidth');
          break;
        case 'fitScreen':
          setScaling('fitScreen');
          break;
        case 'originalSize':
          setScaling('original');
          break;

        // Direction
        case 'toggleDirection':
          setDirection(state.direction === 'ltr' ? 'rtl' : 'ltr');
          break;

        // UI
        case 'toggleFullscreen':
          toggleFullscreen();
          break;
        case 'toggleUI':
          toggleUI();
          break;
        case 'toggleSettings':
          toggleSettings();
          break;
        case 'toggleThumbnails':
          toggleThumbnailStrip();
          break;
        case 'toggleQueue':
          toggleQueue();
          break;
        case 'closeReader':
          if (state.isSettingsOpen) {
            toggleSettings();
          } else if (isQueueOpen) {
            closeQueue();
          } else {
            onClose();
          }
          break;

        // Zoom
        case 'zoomIn':
          zoomIn();
          break;
        case 'zoomOut':
          zoomOut();
          break;
        case 'resetZoom':
          resetZoom();
          break;

        // Bookmarks
        case 'toggleBookmark':
          if (isBookmarked(state.currentPage)) {
            removeBookmark(state.currentPage);
          } else {
            addBookmark();
          }
          break;

        // Page rotation
        case 'rotateCW':
          rotatePageCW();
          break;
        case 'rotateCCW':
          rotatePageCCW();
          break;
      }
    },
    [
      nextPage, prevPage, firstPage, lastPage, goToNextChapter, goToPrevChapter,
      onNavigateToFile, openJumpToPage, setMode, setScaling, setDirection,
      state.direction, state.isSettingsOpen, state.currentPage,
      toggleFullscreen, toggleUI, toggleSettings, toggleThumbnailStrip, toggleQueue,
      closeQueue, onClose, zoomIn, zoomOut, resetZoom, isBookmarked, removeBookmark,
      addBookmark, rotatePageCW, rotatePageCCW, isQueueOpen,
    ]
  );

  // Set up keyboard shortcuts
  useKeyboardShortcuts({
    onAction: handleShortcutAction,
    enabled: !isJumpToPageOpen, // Disable when modal is open
  });

  // Set up touch gestures
  const { handlers: touchHandlers } = useTouchGestures({
    onSwipe: (direction) => {
      if (state.mode === 'continuous' || state.mode === 'webtoon') return; // No swipe in scroll modes

      if (direction === 'left') {
        // Swipe left = next (or prev in RTL)
        if (state.direction === 'rtl') prevPage();
        else nextPage();
      } else if (direction === 'right') {
        // Swipe right = prev (or next in RTL)
        if (state.direction === 'rtl') nextPage();
        else prevPage();
      }
    },
    onDoubleTap: () => {
      // Toggle between fit-to-screen and zoom to 150%
      if (state.zoom === 1) {
        setZoom(1.5);
      } else {
        resetZoom();
      }
    },
    onLongPress: () => {
      // Show UI on long press
      showUI();
    },
    onPinchStart: () => {
      setPinchBaseZoom(state.zoom);
    },
    onPinch: (scale) => {
      const newZoom = Math.max(0.25, Math.min(4, pinchBaseZoom * scale));
      setZoom(newZoom);
    },
    onPan: (deltaX, deltaY) => {
      if (state.zoom > 1) {
        setPan({
          x: state.panOffset.x + deltaX,
          y: state.panOffset.y + deltaY,
        });
      }
    },
    onTap: (x) => {
      // Calculate tap position relative to container
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const relativeX = (x - rect.left) / rect.width;

      // Same click zone logic as mouse
      if (relativeX > 0.33 && relativeX < 0.67) {
        toggleUI();
      } else if (relativeX <= 0.33) {
        if (state.direction === 'rtl') nextPage();
        else prevPage();
      } else {
        if (state.direction === 'rtl') prevPage();
        else nextPage();
      }
    },
  }, {
    panEnabled: state.zoom > 1,
  });

  // Auto-hide UI with mouse inactivity
  const resetHideTimer = useCallback(() => {
    if (!state.autoHideUI) return;

    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }

    showUI();

    hideTimeoutRef.current = setTimeout(() => {
      if (!state.isSettingsOpen) {
        hideUI();
      }
    }, 3000);
  }, [state.autoHideUI, state.isSettingsOpen, showUI, hideUI]);

  // Mouse move handler for auto-hide and edge detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const EDGE_THRESHOLD = 60; // pixels from edge to trigger hover

    const handleMouseMove = (e: MouseEvent) => {
      resetHideTimer();

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const width = rect.width;
      const height = rect.height;

      // Detect edge proximity
      if (y < EDGE_THRESHOLD) {
        setHoveredEdge('top');
        showUI();
      } else if (y > height - EDGE_THRESHOLD) {
        setHoveredEdge('bottom');
        showUI();
      } else if (x < EDGE_THRESHOLD) {
        setHoveredEdge('left');
      } else if (x > width - EDGE_THRESHOLD) {
        setHoveredEdge('right');
      } else {
        setHoveredEdge(null);
      }
    };

    const handleMouseLeave = () => {
      setHoveredEdge(null);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    // Initial hide timer
    resetHideTimer();

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [resetHideTimer, showUI]);

  // Click zones for navigation
  const handlePageClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const clickPosition = x / width;

      // Click in center third toggles UI
      if (clickPosition > 0.33 && clickPosition < 0.67) {
        toggleUI();
        return;
      }

      // Click in left third
      if (clickPosition <= 0.33) {
        if (state.direction === 'rtl') {
          nextPage();
        } else {
          prevPage();
        }
      }
      // Click in right third
      else {
        if (state.direction === 'rtl') {
          prevPage();
        } else {
          nextPage();
        }
      }
    },
    [state.direction, toggleUI, nextPage, prevPage]
  );

  // Background color class
  const bgClass = `reader-bg-${state.background}`;

  if (state.isLoading) {
    return (
      <div className={`reader ${bgClass}`}>
        <div className="reader-loading">
          <div className="reader-loading-spinner" />
          <p>Loading comic...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={`reader ${bgClass}`}>
        <div className="reader-error">
          <h2>Failed to load comic</h2>
          <p>{state.error}</p>
          <button onClick={onClose} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    );
  }

  if (state.pages.length === 0) {
    return (
      <div className={`reader ${bgClass}`}>
        <div className="reader-error">
          <h2>No pages found</h2>
          <p>This archive doesn't contain any readable images.</p>
          <button onClick={onClose} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`reader ${bgClass} ${state.isFullscreen ? 'reader-fullscreen' : ''}`}
      style={{
        filter: state.brightness !== 100 ? `brightness(${state.brightness}%)` : undefined,
      }}
    >
      {/* Toolbar */}
      <ReaderToolbar
        onClose={onClose}
        visible={state.isUIVisible}
        onNavigateToFile={onNavigateToFile}
        onToggleQueue={toggleQueue}
        isQueueOpen={isQueueOpen}
      />

      {/* Main page display area */}
      <div
        className="reader-content"
        onClick={handlePageClick}
        {...touchHandlers}
      >
        <ReaderPage />

        {/* Edge navigation zones */}
        {state.mode !== 'continuous' && state.mode !== 'webtoon' && (
          <>
            <div
              className={`reader-edge-zone reader-edge-left ${hoveredEdge === 'left' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (state.direction === 'rtl') nextPage();
                else prevPage();
              }}
            >
              <div className="reader-edge-arrow">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </div>
            </div>
            <div
              className={`reader-edge-zone reader-edge-right ${hoveredEdge === 'right' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (state.direction === 'rtl') prevPage();
                else nextPage();
              }}
            >
              <div className="reader-edge-arrow">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer with scrubber */}
      <ReaderFooter visible={state.isUIVisible} />

      {/* Thumbnail strip navigation */}
      <ThumbnailStrip visible={state.isUIVisible && state.isThumbnailStripOpen} />

      {/* Settings panel */}
      {state.isSettingsOpen && <ReaderSettings />}

      {/* Jump to page modal */}
      <JumpToPageModal isOpen={isJumpToPageOpen} onClose={closeJumpToPage} />

      {/* Reading queue sidebar */}
      <ReadingQueue
        visible={isQueueOpen}
        currentFileId={state.fileId}
        onNavigateToFile={onNavigateToFile}
        onClose={closeQueue}
      />

      {/* Up next indicator (shows when near end of comic) */}
      {state.fileId && onNavigateToFile && (
        <UpNextIndicator
          currentFileId={state.fileId}
          currentPage={state.currentPage}
          totalPages={state.totalPages}
          onNavigate={onNavigateToFile}
          visible={state.isUIVisible && !isQueueOpen}
        />
      )}
    </div>
  );
}
