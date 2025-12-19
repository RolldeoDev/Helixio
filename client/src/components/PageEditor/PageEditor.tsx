/**
 * PageEditor Component
 *
 * Visual preview of all pages in a comic with page selection for deletion.
 * Deletion is final after confirmation - no undo.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getArchiveContents } from '../../services/api.service';

interface PageEditorProps {
  fileId: string;
  filename: string;
  onClose?: () => void;
  onPagesDeleted?: () => void;
}

interface PageInfo {
  path: string;
  size: number;
  index: number;
}

type ImageLoadState = 'loading' | 'loaded' | 'error';

const API_BASE = '/api';

// Image extensions to filter for
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

function isImageFile(path: string): boolean {
  const ext = path.toLowerCase().split('.').pop();
  return ext ? IMAGE_EXTENSIONS.some((e) => e.slice(1) === ext) : false;
}

function getPageImageUrl(fileId: string, pagePath: string): string {
  return `${API_BASE}/archives/${fileId}/page/${encodeURIComponent(pagePath)}`;
}

/**
 * LazyImage component with loading states and error handling.
 * Loads images immediately when mounted (lazy loading handled by native browser).
 */
function LazyImage({
  src,
  alt,
  onLoadStart,
  onLoadEnd,
}: {
  src: string;
  alt: string;
  onLoadStart: () => void;
  onLoadEnd: () => void;
}) {
  const [loadState, setLoadState] = useState<ImageLoadState>('loading');
  const loadStartedRef = useRef(false);

  // Notify parent that we're starting to load
  useEffect(() => {
    if (!loadStartedRef.current) {
      loadStartedRef.current = true;
      console.log('[LazyImage] Starting load:', alt, src.substring(0, 50));
      onLoadStart();
    }
  }, [onLoadStart, alt, src]);

  const handleLoad = useCallback(() => {
    console.log('[LazyImage] Loaded:', alt);
    setLoadState('loaded');
    onLoadEnd();
  }, [onLoadEnd, alt]);

  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('[LazyImage] Error loading:', alt, e);
    setLoadState('error');
    onLoadEnd();
  }, [onLoadEnd, alt]);

  return (
    <div className="lazy-image-container">
      {loadState === 'loading' && (
        <div className="image-placeholder">
          <div className="mini-spinner" />
        </div>
      )}
      {loadState === 'error' && (
        <div className="image-error">
          <span>⚠️</span>
          <span>Failed to load</span>
        </div>
      )}
      {/*
        Image must NOT use display:none with loading="lazy" because browsers
        skip lazy-loading for hidden elements. Use opacity instead so the
        element is still in the viewport calculation.
      */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        style={{
          opacity: loadState === 'loaded' ? 1 : 0,
          position: loadState === 'loaded' ? 'static' : 'absolute',
        }}
      />
    </div>
  );
}

export function PageEditor({ fileId, filename, onClose, onPagesDeleted }: PageEditorProps) {
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [previewPage, setPreviewPage] = useState<PageInfo | null>(null);
  const [loadingCount, setLoadingCount] = useState(0);

  // Throttle concurrent image loads
  const handleLoadStart = useCallback(() => {
    setLoadingCount((c) => c + 1);
  }, []);

  const handleLoadEnd = useCallback(() => {
    setLoadingCount((c) => Math.max(0, c - 1));
  }, []);

  // Load archive contents
  useEffect(() => {
    console.log('[PageEditor] Starting load for fileId:', fileId);
    setLoading(true);
    setError(null);

    getArchiveContents(fileId)
      .then((response) => {
        console.log('[PageEditor] Got response:', response);
        // Filter for image files and sort them
        const imagePages = response.entries
          .filter((entry) => !entry.isDirectory && isImageFile(entry.path))
          .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
          .map((entry, index) => ({
            path: entry.path,
            size: entry.size,
            index,
          }));

        console.log('[PageEditor] Filtered to', imagePages.length, 'image pages');
        setPages(imagePages);
      })
      .catch((err) => {
        console.error('[PageEditor] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load pages');
      })
      .finally(() => {
        console.log('[PageEditor] Setting loading to false');
        setLoading(false);
      });
  }, [fileId]);

  const togglePageSelection = (index: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPages(new Set(pages.map((_, i) => i)));
  };

  const clearSelection = () => {
    setSelectedPages(new Set());
  };

  const selectRange = (start: number, end: number) => {
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    setSelectedPages((prev) => {
      const next = new Set(prev);
      for (let i = min; i <= max; i++) {
        next.add(i);
      }
      return next;
    });
  };

  const handleDeletePages = async () => {
    if (selectedPages.size === 0) return;

    const pagesToDelete = Array.from(selectedPages)
      .sort((a, b) => a - b)
      .map((i) => pages[i]!.path);

    const confirmMessage = selectedPages.size === 1
      ? 'Delete this page? This cannot be undone.'
      : `Delete ${selectedPages.size} pages? This cannot be undone.`;

    if (!window.confirm(confirmMessage)) return;

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/archives/${fileId}/pages/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: pagesToDelete }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete pages');
      }

      // Refresh the page list
      const contentsResponse = await getArchiveContents(fileId);
      const imagePages = contentsResponse.entries
        .filter((entry) => !entry.isDirectory && isImageFile(entry.path))
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
        .map((entry, index) => ({
          path: entry.path,
          size: entry.size,
          index,
        }));

      setPages(imagePages);
      setSelectedPages(new Set());
      onPagesDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete pages');
    } finally {
      setDeleting(false);
    }
  };

  const handlePageClick = (page: PageInfo, e: React.MouseEvent) => {
    if (e.shiftKey && selectedPages.size > 0) {
      // Range selection
      const lastSelected = Array.from(selectedPages).pop()!;
      selectRange(lastSelected, page.index);
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle single
      togglePageSelection(page.index);
    } else {
      // Select single (clear others)
      setSelectedPages(new Set([page.index]));
    }
  };

  const handlePageDoubleClick = (page: PageInfo) => {
    setPreviewPage(page);
  };

  if (loading) {
    return (
      <div className="page-editor">
        <div className="loading-overlay">
          <div className="spinner" />
          Loading pages...
        </div>
      </div>
    );
  }

  return (
    <div className="page-editor">
      <div className="page-editor-header">
        <div className="header-left">
          <h2>Page Editor</h2>
          <span className="filename">{filename}</span>
        </div>
        <div className="header-right">
          {onClose && (
            <button className="btn-icon" onClick={onClose} title="Close">
              ✕
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="page-editor-toolbar">
        <div className="toolbar-left">
          <span className="page-count">
            {pages.length} pages
          </span>
          {loadingCount > 0 && (
            <span className="loading-indicator">
              Loading {loadingCount}...
            </span>
          )}
          {selectedPages.size > 0 && (
            <span className="selection-count">
              {selectedPages.size} selected
            </span>
          )}
        </div>
        <div className="toolbar-right">
          <button className="btn-ghost" onClick={selectAll}>
            Select All
          </button>
          <button
            className="btn-ghost"
            onClick={clearSelection}
            disabled={selectedPages.size === 0}
          >
            Clear Selection
          </button>
          <button
            className="btn-danger"
            onClick={handleDeletePages}
            disabled={selectedPages.size === 0 || deleting}
          >
            {deleting
              ? 'Deleting...'
              : `Delete ${selectedPages.size || ''} Page${selectedPages.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      <div className="page-editor-content">
        <div className="page-grid">
          {pages.map((page) => {
            const isSelected = selectedPages.has(page.index);

            return (
              <div
                key={page.path}
                className={`page-item ${isSelected ? 'selected' : ''}`}
                onClick={(e) => handlePageClick(page, e)}
                onDoubleClick={() => handlePageDoubleClick(page)}
              >
                <div className="page-thumbnail">
                  <LazyImage
                    src={getPageImageUrl(fileId, page.path)}
                    alt={`Page ${page.index + 1}`}
                    onLoadStart={handleLoadStart}
                    onLoadEnd={handleLoadEnd}
                  />
                  {isSelected && (
                    <div className="selection-overlay">
                      <span className="checkmark">✓</span>
                    </div>
                  )}
                </div>
                <div className="page-info">
                  <span className="page-number">Page {page.index + 1}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="page-editor-footer">
        <p className="warning-text">
          Page deletion is permanent and cannot be undone.
        </p>
      </div>

      {/* Full-size Preview Modal */}
      {previewPage && (
        <div className="page-preview-modal" onClick={() => setPreviewPage(null)}>
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-icon close-btn"
              onClick={() => setPreviewPage(null)}
            >
              ✕
            </button>
            <img
              src={getPageImageUrl(fileId, previewPage.path)}
              alt={`Page ${previewPage.index + 1}`}
            />
            <div className="preview-info">
              Page {previewPage.index + 1} of {pages.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
