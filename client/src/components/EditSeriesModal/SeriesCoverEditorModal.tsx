/**
 * SeriesCoverEditorModal Component
 *
 * A dedicated modal for editing series cover images.
 * Wraps CoverPicker in a modal container for better UX.
 */

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CoverPicker } from './CoverPicker';
import type { SeriesIssue } from '../../services/api.service';
import './SeriesCoverEditorModal.css';

interface SeriesCoverEditorModalProps {
  isOpen: boolean;
  currentCoverSource: 'api' | 'user' | 'auto';
  currentCoverUrl: string | null;
  currentCoverHash: string | null;
  currentCoverFileId: string | null;
  issues: SeriesIssue[];
  onClose: () => void;
  onCoverChange: (source: 'api' | 'user' | 'auto', fileId: string | null, url: string | null) => void;
  onUpload?: (file: File) => Promise<void>;
  uploadedPreviewUrl?: string | null;
}

export function SeriesCoverEditorModal({
  isOpen,
  currentCoverSource,
  currentCoverUrl,
  currentCoverHash,
  currentCoverFileId,
  issues,
  onClose,
  onCoverChange,
  onUpload,
  uploadedPreviewUrl,
}: SeriesCoverEditorModalProps) {
  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Handle cover change - keep modal open to allow further edits
  const handleCoverChange = useCallback(
    (source: 'api' | 'user' | 'auto', fileId: string | null, url: string | null) => {
      onCoverChange(source, fileId, url);
    },
    [onCoverChange]
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="series-cover-editor-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="series-cover-editor-title"
    >
      <div className="series-cover-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="series-cover-editor-header">
          <h3 id="series-cover-editor-title">Edit Series Cover</h3>
          <button
            type="button"
            className="series-cover-editor-close"
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
        <div className="series-cover-editor-body">
          <CoverPicker
            currentCoverSource={currentCoverSource}
            currentCoverUrl={currentCoverUrl}
            currentCoverHash={currentCoverHash}
            currentCoverFileId={currentCoverFileId}
            issues={issues}
            onCoverChange={handleCoverChange}
            onUpload={onUpload}
            uploadedPreviewUrl={uploadedPreviewUrl}
          />
        </div>
        <div className="series-cover-editor-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SeriesCoverEditorModal;
