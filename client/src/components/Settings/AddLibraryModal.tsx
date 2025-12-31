/**
 * AddLibraryModal Component
 *
 * Modal dialog for adding a new library to Helixio.
 * Provides form fields for library name, root path (with folder browser),
 * and library type selection.
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderBrowser } from '../FolderBrowser/FolderBrowser';
import './LibrarySettings.css';

export interface AddLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (library: { name: string; rootPath: string; type: 'western' | 'manga' }) => Promise<void>;
}

export function AddLibraryModal({ isOpen, onClose, onSubmit }: AddLibraryModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    rootPath: '',
    type: 'western' as 'western' | 'manga',
  });
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showFolderBrowser) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showFolderBrowser, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({ name: '', rootPath: '', type: 'western' });
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Library name is required');
      return;
    }

    if (!formData.rootPath.trim()) {
      setError('Root path is required');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: formData.name.trim(),
        rootPath: formData.rootPath.trim(),
        type: formData.type,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add library');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleFolderSelect = (path: string) => {
    setShowFolderBrowser(false);

    // Update path and auto-generate name from folder if empty
    setFormData(prev => {
      if (!prev.name.trim() && path) {
        const folderName = path.split('/').filter(Boolean).pop() || '';
        return { ...prev, rootPath: path, name: folderName || prev.name };
      }
      return { ...prev, rootPath: path };
    });
  };

  if (!isOpen) return null;

  const modal = (
    <div className="add-library-modal-overlay" onClick={handleBackdropClick}>
      <div
        className="add-library-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-library-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="add-library-modal-header">
          <h2 id="add-library-title">Add Library</h2>
          <button
            type="button"
            className="btn-icon modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-library-modal-body">
          {error && (
            <div className="add-library-error">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="library-name">Library Name</label>
            <input
              ref={nameInputRef}
              id="library-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="My Comics"
              disabled={submitting}
            />
            <span className="form-hint">A descriptive name for this library</span>
          </div>

          <div className="form-group">
            <label htmlFor="library-path">Root Path</label>
            <div className="path-input-group">
              <input
                id="library-path"
                type="text"
                value={formData.rootPath}
                onChange={(e) => setFormData(prev => ({ ...prev, rootPath: e.target.value }))}
                placeholder="/path/to/comics"
                disabled={submitting}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowFolderBrowser(true)}
                disabled={submitting}
              >
                Browse...
              </button>
            </div>
            <span className="form-hint">The folder containing your comic files</span>
          </div>

          <div className="form-group">
            <label htmlFor="library-type">Library Type</label>
            <select
              id="library-type"
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as 'western' | 'manga' }))}
              disabled={submitting}
            >
              <option value="western">Western Comics</option>
              <option value="manga">Manga</option>
            </select>
            <span className="form-hint">
              {formData.type === 'manga'
                ? 'Right-to-left reading, manga metadata sources'
                : 'Left-to-right reading, comic metadata sources'}
            </span>
          </div>

          <div className="add-library-modal-footer">
            <button
              ref={cancelButtonRef}
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !formData.name.trim() || !formData.rootPath.trim()}
            >
              {submitting ? 'Adding...' : 'Add Library'}
            </button>
          </div>
        </form>

        <FolderBrowser
          isOpen={showFolderBrowser}
          onClose={() => setShowFolderBrowser(false)}
          onSelect={handleFolderSelect}
          initialPath={formData.rootPath}
        />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
