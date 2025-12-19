/**
 * Bookmark With Note Modal Component
 *
 * Modal for adding/editing bookmarks with optional notes.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAnnotations, BookmarkWithNote } from '../../contexts/AnnotationsContext';
import './Annotations.css';

// =============================================================================
// Types
// =============================================================================

interface BookmarkWithNoteModalProps {
  fileId: string;
  pageIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// Bookmark Colors
// =============================================================================

const BOOKMARK_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
];

// =============================================================================
// Component
// =============================================================================

export function BookmarkWithNoteModal({
  fileId,
  pageIndex,
  isOpen,
  onClose,
}: BookmarkWithNoteModalProps) {
  const { getPageBookmark, addBookmark, deleteBookmark } = useAnnotations();

  const [note, setNote] = useState('');
  const [color, setColor] = useState(BOOKMARK_COLORS[0]!.value);
  const [existingBookmark, setExistingBookmark] = useState<BookmarkWithNote | null>(null);

  // Load existing bookmark
  useEffect(() => {
    if (isOpen) {
      const bookmark = getPageBookmark(fileId, pageIndex);
      if (bookmark) {
        setExistingBookmark(bookmark);
        setNote(bookmark.note);
        setColor(bookmark.color);
      } else {
        setExistingBookmark(null);
        setNote('');
        setColor(BOOKMARK_COLORS[0]!.value);
      }
    }
  }, [isOpen, fileId, pageIndex, getPageBookmark]);

  const handleSave = useCallback(() => {
    addBookmark({
      fileId,
      pageIndex,
      note,
      color,
    });
    onClose();
  }, [fileId, pageIndex, note, color, addBookmark, onClose]);

  const handleDelete = useCallback(() => {
    if (existingBookmark) {
      deleteBookmark(existingBookmark.id);
      onClose();
    }
  }, [existingBookmark, deleteBookmark, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && e.metaKey) {
        handleSave();
      }
    },
    [onClose, handleSave]
  );

  if (!isOpen) return null;

  return (
    <div className="bookmark-modal-overlay" onClick={onClose}>
      <div
        className="bookmark-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="bookmark-modal-header">
          <h3>{existingBookmark ? 'Edit Bookmark' : 'Add Bookmark'}</h3>
          <span className="bookmark-page">Page {pageIndex + 1}</span>
        </div>

        <div className="bookmark-modal-body">
          <label className="bookmark-label">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note about this page..."
            className="bookmark-textarea"
            rows={4}
            autoFocus
          />

          <label className="bookmark-label">Color</label>
          <div className="bookmark-colors">
            {BOOKMARK_COLORS.map((c) => (
              <button
                key={c.value}
                className={`bookmark-color ${color === c.value ? 'selected' : ''}`}
                style={{ backgroundColor: c.value }}
                onClick={() => setColor(c.value)}
                title={c.name}
              />
            ))}
          </div>
        </div>

        <div className="bookmark-modal-footer">
          <button className="btn-primary" onClick={handleSave}>
            {existingBookmark ? 'Update Bookmark' : 'Add Bookmark'}
          </button>
          {existingBookmark && (
            <button className="btn-danger" onClick={handleDelete}>
              Remove Bookmark
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Bookmarks List Component
// =============================================================================

interface BookmarksListProps {
  fileId: string;
  onGoToPage: (pageIndex: number) => void;
  onClose?: () => void;
}

export function BookmarksList({ fileId, onGoToPage, onClose }: BookmarksListProps) {
  const { getFileBookmarks, deleteBookmark } = useAnnotations();

  const bookmarks = getFileBookmarks(fileId);

  if (bookmarks.length === 0) {
    return (
      <div className="bookmarks-list empty">
        <p>No bookmarks yet</p>
        <p className="hint">Click the bookmark icon while reading to add one</p>
      </div>
    );
  }

  return (
    <div className="bookmarks-list">
      <div className="bookmarks-header">
        <span className="bookmarks-count">{bookmarks.length} Bookmarks</span>
        {onClose && (
          <button className="bookmarks-close" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      <ul className="bookmarks-items">
        {bookmarks.map((bookmark) => (
          <li key={bookmark.id} className="bookmark-item">
            <button
              className="bookmark-item-main"
              onClick={() => onGoToPage(bookmark.pageIndex)}
            >
              <span
                className="bookmark-item-marker"
                style={{ backgroundColor: bookmark.color }}
              />
              <div className="bookmark-item-info">
                <span className="bookmark-item-page">Page {bookmark.pageIndex + 1}</span>
                {bookmark.note && (
                  <span className="bookmark-item-note">{bookmark.note}</span>
                )}
              </div>
            </button>
            <button
              className="bookmark-item-delete"
              onClick={(e) => {
                e.stopPropagation();
                deleteBookmark(bookmark.id);
              }}
              title="Remove bookmark"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
