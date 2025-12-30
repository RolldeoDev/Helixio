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
import { ReaderInfo } from './ReaderInfo';
import { ThumbnailStrip } from './ThumbnailStrip';
import { JumpToPageModal } from './JumpToPageModal';
import { ReadingQueue } from './ReadingQueue';
import { UpNextIndicator } from './UpNextIndicator';
import { TransitionScreen } from './TransitionScreen';
import { MobileReaderUI } from './MobileReaderUI';
import { useKeyboardShortcuts, ShortcutAction } from './hooks/useKeyboardShortcuts';
import { useTouchGestures } from './hooks/useTouchGestures';
import { useReadingSession } from './hooks/useReadingSession';
import { useDeviceDetection } from '../../hooks';
import './Reader.css';

interface ReaderProps {
  onClose: () => void;
  onNavigateToFile?: (fileId: string, options?: { startPage?: number }) => void;
  onNavigateToSeries?: (seriesId: string) => void;
}

export function Reader({ onClose, onNavigateToFile, onNavigateToSeries }: ReaderProps) {
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
    toggleInfo,
    closeInfo,
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
    exitTransitionScreen,
  } = useReader();

  // Track reading session and page view times
  useReadingSession({
    fileId: state.fileId,
    currentPage: state.currentPage,
    totalPages: state.totalPages,
    isLoading: state.isLoading,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [hoveredEdge, setHoveredEdge] = useState<'left' | 'right' | 'top' | 'bottom' | null>(null);
  const [isJumpToPageOpen, setIsJumpToPageOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [pinchBaseZoom, setPinchBaseZoom] = useState(1);

  // Device detection for mobile/tablet UI
  const { isTouchDevice } = useDeviceDetection();

  // Determine if navigation should be reversed based on RTL direction and physical navigation setting
  const shouldReverseNavigation = useCallback(() => {
    // If usePhysicalNavigation is explicitly true, never reverse
    if (state.usePhysicalNavigation === true) return false;
    // If usePhysicalNavigation is explicitly false, reverse when RTL
    if (state.usePhysicalNavigation === false) return state.direction === 'rtl';
    // null = auto: reverse for RTL (manga-style navigation)
    return state.direction === 'rtl';
  }, [state.usePhysicalNavigation, state.direction]);

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
        // Navigation - respects RTL direction and usePhysicalNavigation setting
        case 'nextPage': {
          const reversed = shouldReverseNavigation();
          if (state.transitionScreen !== 'none') {
            // On transition screens, account for RTL reversal
            // In RTL: Right key (nextPage) = backward = previous issue (START screen)
            // In LTR: Right key (nextPage) = forward = next issue (END screen)
            if (reversed) {
              if (state.transitionScreen === 'start' && state.adjacentFiles?.previous && onNavigateToFile) {
                onNavigateToFile(state.adjacentFiles.previous.fileId, { startPage: 0 });
              } else if (state.transitionScreen === 'end') {
                // RTL + END screen: Right key = backward = return to last page
                exitTransitionScreen();
              }
            } else {
              if (state.transitionScreen === 'end' && state.adjacentFiles?.next && onNavigateToFile) {
                onNavigateToFile(state.adjacentFiles.next.fileId, { startPage: 0 });
              } else if (state.transitionScreen === 'start') {
                // LTR + START screen: Right key = forward = return to first page
                exitTransitionScreen();
              }
            }
          } else {
            reversed ? prevPage() : nextPage();
          }
          break;
        }
        case 'prevPage': {
          const reversed = shouldReverseNavigation();
          if (state.transitionScreen !== 'none') {
            // On transition screens, account for RTL reversal
            // In RTL: Left key (prevPage) = forward = next issue (END screen)
            // In LTR: Left key (prevPage) = backward = previous issue (START screen)
            if (reversed) {
              if (state.transitionScreen === 'end' && state.adjacentFiles?.next && onNavigateToFile) {
                onNavigateToFile(state.adjacentFiles.next.fileId, { startPage: 0 });
              } else if (state.transitionScreen === 'start') {
                // RTL + START screen: Left key = forward = return to first page
                exitTransitionScreen();
              }
            } else {
              if (state.transitionScreen === 'start' && state.adjacentFiles?.previous && onNavigateToFile) {
                onNavigateToFile(state.adjacentFiles.previous.fileId, { startPage: 0 });
              } else if (state.transitionScreen === 'end') {
                // LTR + END screen: Left key = backward = return to last page
                exitTransitionScreen();
              }
            }
          } else {
            reversed ? nextPage() : prevPage();
          }
          break;
        }
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
        case 'toggleInfo':
          toggleInfo();
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
          } else if (state.isInfoOpen) {
            closeInfo();
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
      state.direction, state.isSettingsOpen, state.isInfoOpen, state.currentPage,
      state.transitionScreen, state.adjacentFiles, toggleFullscreen, toggleUI,
      toggleSettings, toggleInfo, closeInfo, toggleThumbnailStrip, toggleQueue,
      closeQueue, onClose, zoomIn, zoomOut, resetZoom, isBookmarked, removeBookmark,
      addBookmark, rotatePageCW, rotatePageCCW, isQueueOpen, shouldReverseNavigation,
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

      // Swipe direction respects RTL direction and usePhysicalNavigation setting
      const reversed = shouldReverseNavigation();
      if (direction === 'left') {
        reversed ? prevPage() : nextPage();
      } else if (direction === 'right') {
        reversed ? nextPage() : prevPage();
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

      // Tap zones respect RTL direction and usePhysicalNavigation setting
      const reversed = shouldReverseNavigation();
      if (relativeX > 0.33 && relativeX < 0.67) {
        toggleUI();
      } else if (relativeX <= 0.33) {
        reversed ? nextPage() : prevPage();
      } else {
        reversed ? prevPage() : nextPage();
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

  // Click zones for navigation - respects RTL direction and usePhysicalNavigation setting
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

      // Click zones respect RTL direction and usePhysicalNavigation setting
      const reversed = shouldReverseNavigation();
      // Click in left third
      if (clickPosition <= 0.33) {
        reversed ? nextPage() : prevPage();
      }
      // Click in right third
      else {
        reversed ? prevPage() : nextPage();
      }
    },
    [toggleUI, nextPage, prevPage, shouldReverseNavigation]
  );

  // Background color class
  const bgClass = `reader-bg-${state.background}`;

  // Critical inline styles as fallback (CSS import may fail in some scenarios)
  const readerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
    overflow: 'hidden',
    backgroundColor: state.background === 'white' ? '#ffffff' : state.background === 'gray' ? '#2a2a2a' : '#000000',
  };

  if (state.isLoading) {
    return (
      <div className={`reader ${bgClass}`} style={readerStyle}>
        <div className="reader-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
          <div className="reader-loading-spinner" />
          <p>Loading comic...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={`reader ${bgClass}`} style={readerStyle}>
        <div className="reader-error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
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
      <div className={`reader ${bgClass}`} style={readerStyle}>
        <div className="reader-error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
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
        ...readerStyle,
        filter: state.brightness !== 100 ? `brightness(${state.brightness}%)` : undefined,
      }}
    >
      {/* Desktop Toolbar - hidden on touch devices */}
      {!isTouchDevice && (
        <ReaderToolbar
          onClose={onClose}
          visible={state.isUIVisible}
          onNavigateToFile={onNavigateToFile}
          onToggleQueue={toggleQueue}
          isQueueOpen={isQueueOpen}
        />
      )}

      {/* Mobile/Tablet UI - shown on touch devices */}
      {isTouchDevice && (
        <MobileReaderUI
          onExit={onClose}
          onToggleGuidedView={() => {/* Guided view not yet implemented */}}
          isGuidedViewActive={false}
        />
      )}

      {/* Main page display area */}
      <div
        className="reader-content"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
        onClick={handlePageClick}
        {...touchHandlers}
      >
        <ReaderPage />

        {/* Edge navigation zones - desktop only, hidden on touch devices */}
        {!isTouchDevice && state.mode !== 'continuous' && state.mode !== 'webtoon' && (
          <>
            <div
              className={`reader-edge-zone reader-edge-left ${hoveredEdge === 'left' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                // Respects RTL direction and usePhysicalNavigation setting
                shouldReverseNavigation() ? nextPage() : prevPage();
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
                // Respects RTL direction and usePhysicalNavigation setting
                shouldReverseNavigation() ? prevPage() : nextPage();
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

      {/* Desktop Footer with scrubber - hidden on touch devices */}
      {!isTouchDevice && <ReaderFooter visible={state.isUIVisible} />}

      {/* Thumbnail strip navigation */}
      <ThumbnailStrip visible={state.isUIVisible && state.isThumbnailStripOpen} />

      {/* Settings panel */}
      {state.isSettingsOpen && <ReaderSettings />}

      {/* Info panel */}
      {state.isInfoOpen && <ReaderInfo />}

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
      {state.fileId && onNavigateToFile && state.transitionScreen === 'none' && (
        <UpNextIndicator
          currentFileId={state.fileId}
          currentPage={state.currentPage}
          totalPages={state.totalPages}
          onNavigate={onNavigateToFile}
          visible={state.isUIVisible && !isQueueOpen}
        />
      )}

      {/* Transition screen (shows when navigating past first/last page) */}
      {state.transitionScreen !== 'none' && (
        <TransitionScreen
          type={state.transitionScreen}
          adjacentFile={
            state.transitionScreen === 'end'
              ? state.adjacentFiles?.next ?? null
              : state.adjacentFiles?.previous ?? null
          }
          seriesInfo={{
            seriesName: state.adjacentFiles?.seriesName ?? null,
            currentIndex: state.adjacentFiles?.currentIndex ?? 0,
            totalInSeries: state.adjacentFiles?.totalInSeries ?? 0,
          }}
          currentFileId={state.fileId}
          seriesId={state.adjacentFiles?.seriesId ?? null}
          direction={state.direction}
          onNavigate={(fileId) => onNavigateToFile?.(fileId, { startPage: 0 })}
          onReturn={exitTransitionScreen}
          onClose={onClose}
          onNavigateToSeries={(seriesId) => onNavigateToSeries?.(seriesId)}
        />
      )}
    </div>
  );
}
