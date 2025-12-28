/**
 * MatchedFilesModal Component
 *
 * Displays all files matched to the current series group during series approval.
 * Shows full filenames and allows viewing file details.
 */

import { useEffect } from 'react';
import './MatchedFilesModal.css';

interface MatchedFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  seriesName: string;
  filenames: string[];
}

export function MatchedFilesModal({
  isOpen,
  onClose,
  seriesName,
  filenames,
}: MatchedFilesModalProps) {
  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="matched-files-modal-overlay" onClick={onClose}>
      <div className="matched-files-modal" onClick={(e) => e.stopPropagation()}>
        <div className="matched-files-header">
          <h3>Files in "{seriesName}"</h3>
          <button className="btn-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="matched-files-content">
          <p className="file-count-summary">
            {filenames.length} file{filenames.length !== 1 ? 's' : ''} matched to this series
          </p>
          <div className="matched-files-list">
            {filenames.map((filename, index) => (
              <div key={index} className="matched-file-item">
                <span className="file-index">{index + 1}</span>
                <span className="file-name" title={filename}>
                  {filename}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="matched-files-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default MatchedFilesModal;
