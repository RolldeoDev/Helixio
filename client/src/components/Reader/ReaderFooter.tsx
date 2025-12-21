/**
 * Reader Footer
 *
 * Bottom bar with page navigation controls and progress scrubber.
 */

import { useCallback, useState, useRef, useEffect } from 'react';
import { useReader } from './ReaderContext';

interface ReaderFooterProps {
  visible: boolean;
}

export function ReaderFooter({ visible }: ReaderFooterProps) {
  const { state, goToPage, prevPage, nextPage, firstPage, lastPage } = useReader();
  const [isDragging, setIsDragging] = useState(false);
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);

  const progress = state.totalPages > 1
    ? (state.currentPage / (state.totalPages - 1)) * 100
    : 0;

  // Calculate page from scrubber position
  const getPageFromPosition = useCallback(
    (clientX: number) => {
      if (!scrubberRef.current) return 0;
      const rect = scrubberRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      return Math.round(percentage * (state.totalPages - 1));
    },
    [state.totalPages]
  );

  // Handle scrubber interactions
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const page = getPageFromPosition(e.clientX);
      setPreviewPage(page);
    },
    [getPageFromPosition]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const page = getPageFromPosition(e.clientX);
      setPreviewPage(page);
    },
    [isDragging, getPageFromPosition]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      setIsDragging(false);
      const page = getPageFromPosition(e.clientX);
      goToPage(page);
      setPreviewPage(null);
    },
    [isDragging, getPageFromPosition, goToPage]
  );

  // Global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Click on track to jump to page
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      const page = getPageFromPosition(e.clientX);
      goToPage(page);
    },
    [getPageFromPosition, goToPage]
  );

  const displayPage = previewPage ?? state.currentPage;

  // Get split view indicator
  const getSplitIndicator = () => {
    if (state.splitView === 'full') return '';
    if (state.splitView === 'left') return ' (L)';
    if (state.splitView === 'right') return ' (R)';
    return '';
  };

  return (
    <div className={`reader-footer ${visible ? 'visible' : 'hidden'}`}>
      <div className="reader-footer-controls">
        {/* First page */}
        <button
          className="reader-nav-btn"
          onClick={firstPage}
          disabled={state.currentPage === 0 && state.transitionScreen === 'none'}
          title="First Page (Home)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Previous page */}
        <button
          className="reader-nav-btn"
          onClick={prevPage}
          disabled={state.currentPage === 0 && !state.adjacentFiles?.previous && state.transitionScreen === 'none'}
          title="Previous Page (Left Arrow)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Progress scrubber */}
        <div
          ref={scrubberRef}
          className={`reader-scrubber ${isDragging ? 'dragging' : ''}`}
          onClick={handleTrackClick}
          onMouseDown={handleMouseDown}
        >
          <div className="reader-scrubber-track">
            {/* Bookmark indicators */}
            {state.bookmarks.map((bookmark) => {
              const position = state.totalPages > 1
                ? (bookmark / (state.totalPages - 1)) * 100
                : 0;
              return (
                <div
                  key={bookmark}
                  className="reader-scrubber-bookmark"
                  style={{ left: `${position}%` }}
                  title={`Bookmark: Page ${bookmark + 1}`}
                />
              );
            })}

            {/* Progress fill */}
            <div
              className="reader-scrubber-fill"
              style={{ width: `${previewPage !== null ? (previewPage / (state.totalPages - 1)) * 100 : progress}%` }}
            />

            {/* Thumb */}
            <div
              className="reader-scrubber-thumb"
              style={{ left: `${previewPage !== null ? (previewPage / (state.totalPages - 1)) * 100 : progress}%` }}
            />
          </div>

          {/* Preview tooltip */}
          {isDragging && previewPage !== null && (
            <div
              className="reader-scrubber-preview"
              style={{ left: `${(previewPage / (state.totalPages - 1)) * 100}%` }}
            >
              Page {previewPage + 1}
            </div>
          )}
        </div>

        {/* Next page */}
        <button
          className="reader-nav-btn"
          onClick={nextPage}
          disabled={state.transitionScreen === 'end' && !state.adjacentFiles?.next}
          title="Next Page (Right Arrow)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Last page */}
        <button
          className="reader-nav-btn"
          onClick={lastPage}
          disabled={state.currentPage === state.totalPages - 1 && state.transitionScreen === 'none'}
          title="Last Page (End)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>

        {/* Page count */}
        <span className="reader-page-count">
          {displayPage + 1}{getSplitIndicator()} / {state.totalPages}
        </span>
      </div>
    </div>
  );
}
