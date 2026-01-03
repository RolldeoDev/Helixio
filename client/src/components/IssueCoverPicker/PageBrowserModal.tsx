/**
 * PageBrowserModal Component
 *
 * Full-screen modal for browsing all comic pages and selecting one as the cover.
 * Uses virtualized grid for performance with large page counts.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualGrid } from '../../hooks/useVirtualGrid';
import { getPageThumbnailUrl } from '../../services/api.service';
import './PageBrowserModal.css';

interface PageBrowserModalProps {
  isOpen: boolean;
  fileId: string;
  pages: string[];
  currentSelectedIndex: number | null;
  onClose: () => void;
  onPageSelect: (pageIndex: number) => void;
}

interface PageItem {
  page: string;
  index: number;
}

export function PageBrowserModal({
  isOpen,
  fileId,
  pages,
  currentSelectedIndex,
  onClose,
  onPageSelect,
}: PageBrowserModalProps) {
  const [jumpValue, setJumpValue] = useState('');
  const jumpInputRef = useRef<HTMLInputElement>(null);

  // Create page items for virtualization
  const pageItems = useMemo<PageItem[]>(
    () => pages.map((page, index) => ({ page, index })),
    [pages]
  );

  // Virtual grid for efficient rendering
  const { virtualItems, totalHeight, containerRef, scrollTo } = useVirtualGrid(
    pageItems,
    {
      itemWidth: 140,
      itemHeight: 210,
      gap: 12,
      overscan: 4,
      horizontalPadding: 32,
    }
  );

  // Focus jump input when modal opens
  useEffect(() => {
    if (isOpen && jumpInputRef.current) {
      // Small delay to ensure modal is rendered
      const timer = setTimeout(() => {
        jumpInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Scroll to current selection when modal opens
  useEffect(() => {
    if (isOpen && currentSelectedIndex !== null && currentSelectedIndex >= 0) {
      // Small delay to ensure grid is rendered
      const timer = setTimeout(() => {
        scrollTo(currentSelectedIndex);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, currentSelectedIndex, scrollTo]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle page jump
  const handleJumpSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const pageNum = parseInt(jumpValue, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pages.length) {
        scrollTo(pageNum - 1); // Convert to 0-based index
        setJumpValue('');
      }
    },
    [jumpValue, pages.length, scrollTo]
  );

  // Handle page selection
  const handlePageClick = useCallback(
    (pageIndex: number) => {
      onPageSelect(pageIndex);
      // Modal will be closed by parent after selection
    },
    [onPageSelect]
  );

  if (!isOpen) return null;

  const modal = (
    <div className="page-browser-overlay" onClick={handleBackdropClick}>
      <div
        className="page-browser-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Select cover page"
      >
        {/* Header */}
        <div className="page-browser-header">
          <h2>Select Cover Page</h2>
          <button
            type="button"
            className="page-browser-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="page-browser-toolbar">
          <span className="page-browser-count">{pages.length} pages</span>
          <form className="page-jump-form" onSubmit={handleJumpSubmit}>
            <label htmlFor="pageJumpInput">Jump to:</label>
            <input
              ref={jumpInputRef}
              id="pageJumpInput"
              type="number"
              min={1}
              max={pages.length}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              placeholder={`1-${pages.length}`}
            />
            <button type="submit">Go</button>
          </form>
        </div>

        {/* Virtualized Grid */}
        <div className="page-browser-grid-container" ref={containerRef}>
          <div
            className="page-browser-grid"
            style={{ height: totalHeight }}
          >
            {virtualItems.map(({ item, style }) => (
              <button
                key={item.index}
                className={`page-browser-thumbnail ${
                  currentSelectedIndex === item.index ? 'selected' : ''
                }`}
                style={style}
                onClick={() => handlePageClick(item.index)}
                type="button"
                aria-label={`Page ${item.index + 1}`}
              >
                <img
                  src={getPageThumbnailUrl(fileId, item.page)}
                  alt={`Page ${item.index + 1}`}
                  loading="lazy"
                />
                <span className="page-browser-number">{item.index + 1}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default PageBrowserModal;
