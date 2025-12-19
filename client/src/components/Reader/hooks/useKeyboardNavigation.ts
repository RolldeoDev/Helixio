/**
 * Keyboard Navigation Hook
 *
 * Handles all keyboard shortcuts for the reader.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useReader } from '../ReaderContext';
import { getNextInQueue } from '../../../services/api.service';

export function useKeyboardNavigation(
  onClose: () => void,
  onNavigateToFile?: (fileId: string) => void,
  onOpenJumpToPage?: () => void,
  onToggleQueue?: () => void
) {
  const {
    state,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    goToPage,
    setMode,
    setScaling,
    setDirection,
    toggleFullscreen,
    toggleUI,
    toggleSettings,
    toggleThumbnailStrip,
    zoomIn,
    zoomOut,
    resetZoom,
    addBookmark,
    removeBookmark,
    isBookmarked,
    goToNextChapter,
    goToPrevChapter,
  } = useReader();

  // Track if we've already triggered end-of-comic navigation to prevent double-fires
  const endOfComicTriggeredRef = useRef(false);

  // Reset the trigger when the current page changes (user navigated backwards)
  useEffect(() => {
    if (state.currentPage < state.totalPages - 1) {
      endOfComicTriggeredRef.current = false;
    }
  }, [state.currentPage, state.totalPages]);

  // Handle next page with auto-advance to queue
  const handleNextWithAutoAdvance = useCallback(async () => {
    // If not at the last page, just go to next page
    if (state.currentPage < state.totalPages - 1) {
      nextPage();
      return;
    }

    // At the last page - try to advance to next queue item
    if (endOfComicTriggeredRef.current) return; // Already triggered
    endOfComicTriggeredRef.current = true;

    try {
      const nextItem = await getNextInQueue();
      if (nextItem && onNavigateToFile) {
        onNavigateToFile(nextItem.fileId);
      }
    } catch {
      // No queue item available, just ignore
    }
  }, [state.currentPage, state.totalPages, nextPage, onNavigateToFile]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't handle keys when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Prevent default for all handled keys
      const handled = true;

      switch (e.key) {
        // Navigation
        case 'ArrowRight':
        case 'd':
        case 'D':
          if (state.direction === 'rtl') {
            prevPage();
          } else {
            handleNextWithAutoAdvance();
          }
          break;

        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (state.direction === 'rtl') {
            handleNextWithAutoAdvance();
          } else {
            prevPage();
          }
          break;

        case 'ArrowDown':
        case 's':
        case 'S':
          if (state.mode === 'continuous') {
            // Let default scroll behavior work
            return;
          }
          handleNextWithAutoAdvance();
          break;

        case 'ArrowUp':
        case 'w':
          // Note: uppercase 'W' is reserved for fitWidth scaling
          if (state.mode === 'continuous') {
            // Let default scroll behavior work
            return;
          }
          prevPage();
          break;

        case ' ': // Space
          e.preventDefault();
          if (e.shiftKey) {
            prevPage();
          } else {
            handleNextWithAutoAdvance();
          }
          break;

        case 'Home':
          firstPage();
          break;

        case 'End':
          lastPage();
          break;

        case 'PageDown':
          nextPage();
          break;

        case 'PageUp':
          prevPage();
          break;

        // Reading modes
        case '1':
          setMode('single');
          break;

        case '2':
          setMode('double');
          break;

        case '3':
          setMode('continuous');
          break;

        // Scaling
        case 'h':
        case 'H':
          setScaling('fitHeight');
          break;

        case 'W':
          // Only trigger if not combined with ctrl/cmd (lowercase 'w' is used for navigation)
          if (!e.ctrlKey && !e.metaKey) {
            setScaling('fitWidth');
          }
          break;

        case 'o':
        case 'O':
          setScaling('original');
          break;

        // Direction
        case 'r':
        case 'R':
          if (!e.ctrlKey && !e.metaKey) {
            // Toggle direction
            if (state.direction === 'ltr') {
              setDirection('rtl');
            } else {
              setDirection('ltr');
            }
          }
          break;

        // UI controls
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) {
            toggleFullscreen();
          }
          break;

        case 'm':
        case 'M':
          toggleUI();
          break;

        case 't':
        case 'T':
          toggleThumbnailStrip();
          break;

        case 'q':
        case 'Q':
          if (onToggleQueue) {
            onToggleQueue();
          }
          break;

        case 'g':
        case 'G':
          if (onOpenJumpToPage) {
            onOpenJumpToPage();
          }
          break;

        case 'Escape':
          if (state.isFullscreen) {
            // Exit fullscreen (browser handles this)
          } else if (state.isSettingsOpen) {
            toggleSettings();
          } else {
            onClose();
          }
          break;

        // Zoom
        case '+':
        case '=':
          zoomIn();
          break;

        case '-':
          zoomOut();
          break;

        case '0':
          resetZoom();
          break;

        // Bookmarks
        case 'b':
        case 'B':
          if (isBookmarked(state.currentPage)) {
            removeBookmark(state.currentPage);
          } else {
            addBookmark();
          }
          break;

        // Previous/Next chapter navigation
        case '[':
          {
            const prevFileId = goToPrevChapter();
            if (prevFileId && onNavigateToFile) {
              onNavigateToFile(prevFileId);
            }
          }
          break;

        case ']':
          {
            const nextFileId = goToNextChapter();
            if (nextFileId && onNavigateToFile) {
              onNavigateToFile(nextFileId);
            }
          }
          break;

        default:
          // Key not handled
          return;
      }

      // Prevent default for handled keys
      if (handled) {
        e.preventDefault();
      }
    },
    [
      state.direction,
      state.mode,
      state.isFullscreen,
      state.isSettingsOpen,
      state.currentPage,
      state.totalPages,
      nextPage,
      prevPage,
      firstPage,
      lastPage,
      goToPage,
      setMode,
      setScaling,
      setDirection,
      toggleFullscreen,
      toggleUI,
      toggleSettings,
      toggleThumbnailStrip,
      zoomIn,
      zoomOut,
      resetZoom,
      addBookmark,
      removeBookmark,
      isBookmarked,
      goToNextChapter,
      goToPrevChapter,
      handleNextWithAutoAdvance,
      onClose,
      onNavigateToFile,
      onOpenJumpToPage,
      onToggleQueue,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
