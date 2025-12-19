/**
 * Comic Notes Panel Component
 *
 * Panel for adding/editing notes and ratings for a comic.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAnnotations, ComicNote } from '../../contexts/AnnotationsContext';
import './Annotations.css';

// =============================================================================
// Types
// =============================================================================

interface ComicNotesPanelProps {
  fileId: string;
  filename: string;
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function ComicNotesPanel({
  fileId,
  filename,
  isOpen,
  onClose,
}: ComicNotesPanelProps) {
  const { getComicNote, setComicNote, deleteComicNote, exportAsMarkdown } = useAnnotations();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [existingNote, setExistingNote] = useState<ComicNote | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load existing note
  useEffect(() => {
    if (isOpen) {
      const note = getComicNote(fileId);
      if (note) {
        setExistingNote(note);
        setTitle(note.title);
        setContent(note.content);
        setRating(note.rating);
        setTags(note.tags);
      } else {
        setExistingNote(null);
        setTitle(filename.replace(/\.cb[rz7t]$/i, ''));
        setContent('');
        setRating(undefined);
        setTags([]);
      }
    }
  }, [isOpen, fileId, filename, getComicNote]);

  const handleSave = useCallback(() => {
    setIsSaving(true);

    setComicNote({
      fileId,
      title,
      content,
      rating,
      tags,
    });

    setTimeout(() => {
      setIsSaving(false);
    }, 500);
  }, [fileId, title, content, rating, tags, setComicNote]);

  const handleDelete = useCallback(() => {
    if (window.confirm('Delete this note?')) {
      deleteComicNote(fileId);
      setExistingNote(null);
      setTitle(filename.replace(/\.cb[rz7t]$/i, ''));
      setContent('');
      setRating(undefined);
      setTags([]);
    }
  }, [fileId, filename, deleteComicNote]);

  const handleExport = useCallback(() => {
    const markdown = exportAsMarkdown(fileId);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'notes'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fileId, title, exportAsMarkdown]);

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddTag();
      }
    },
    [handleAddTag]
  );

  if (!isOpen) return null;

  return (
    <div className="comic-notes-overlay" onClick={onClose}>
      <div
        className="comic-notes-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="notes-header">
          <h3>Comic Notes</h3>
          <button className="notes-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="notes-body">
          {/* Title */}
          <div className="notes-field">
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Comic title"
              className="notes-input"
            />
          </div>

          {/* Rating */}
          <div className="notes-field">
            <label>Rating</label>
            <div className="notes-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  className={`rating-star ${rating && rating >= star ? 'filled' : ''}`}
                  onClick={() => setRating(rating === star ? undefined : star)}
                  title={`${star} star${star !== 1 ? 's' : ''}`}
                >
                  {rating && rating >= star ? '★' : '☆'}
                </button>
              ))}
              {rating && (
                <button
                  className="rating-clear"
                  onClick={() => setRating(undefined)}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="notes-field">
            <label>Notes</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your thoughts about this comic..."
              className="notes-textarea"
              rows={8}
            />
          </div>

          {/* Tags */}
          <div className="notes-field">
            <label>Tags</label>
            <div className="notes-tags">
              {tags.map((tag) => (
                <span key={tag} className="notes-tag">
                  {tag}
                  <button
                    className="tag-remove"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="tag-input-wrapper">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add a tag..."
                className="tag-input"
              />
              <button className="tag-add" onClick={handleAddTag}>
                Add
              </button>
            </div>
          </div>

          {/* Metadata */}
          {existingNote && (
            <div className="notes-meta">
              <span>Created: {new Date(existingNote.createdAt).toLocaleString()}</span>
              <span>Updated: {new Date(existingNote.updatedAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="notes-footer">
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Notes'}
          </button>
          <button className="btn-secondary" onClick={handleExport}>
            Export as Markdown
          </button>
          {existingNote && (
            <button className="btn-danger" onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
