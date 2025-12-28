/**
 * CoverEditorModal Component
 *
 * A dedicated modal for editing comic cover images.
 * Wraps IssueCoverPicker in a modal container for better UX.
 */

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { IssueCoverPicker } from '../IssueCoverPicker';
import './CoverEditorModal.css';

interface CoverEditorModalProps {
  isOpen: boolean;
  fileId: string;
  currentCoverSource: 'auto' | 'page' | 'custom';
  currentCoverPageIndex: number | null;
  currentCoverHash: string | null;
  onClose: () => void;
  onCoverChange: (result: {
    source: 'auto' | 'page' | 'custom';
    pageIndex?: number;
    coverHash?: string;
  }) => void;
}

export function CoverEditorModal({
  isOpen,
  fileId,
  currentCoverSource,
  currentCoverPageIndex,
  currentCoverHash,
  onClose,
  onCoverChange,
}: CoverEditorModalProps) {
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

  // Handle cover change - close modal after successful change
  const handleCoverChange = useCallback(
    (result: { source: 'auto' | 'page' | 'custom'; pageIndex?: number; coverHash?: string }) => {
      onCoverChange(result);
      onClose();
    },
    [onCoverChange, onClose]
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="cover-editor-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="cover-editor-title">
      <div className="cover-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cover-editor-header">
          <h3 id="cover-editor-title">Edit Cover</h3>
          <button
            type="button"
            className="cover-editor-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="cover-editor-body">
          <IssueCoverPicker
            fileId={fileId}
            currentCoverSource={currentCoverSource}
            currentCoverPageIndex={currentCoverPageIndex}
            currentCoverHash={currentCoverHash}
            onCoverChange={handleCoverChange}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

export default CoverEditorModal;
