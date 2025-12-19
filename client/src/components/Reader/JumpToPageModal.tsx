/**
 * Jump to Page Modal
 *
 * Modal dialog for quickly navigating to a specific page number.
 */

import { useState, useRef, useEffect } from 'react';
import { useReader } from './ReaderContext';

interface JumpToPageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JumpToPageModal({ isOpen, onClose }: JumpToPageModalProps) {
  const { state, goToPage } = useReader();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setInputValue('');
      inputRef.current.focus();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const pageNum = parseInt(inputValue, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > state.totalPages) {
      // Invalid input - shake the input or show error
      inputRef.current?.select();
      return;
    }

    // Navigate to page (convert to 0-indexed)
    goToPage(pageNum - 1);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="jump-to-page-backdrop" onClick={handleBackdropClick}>
      <div className="jump-to-page-modal">
        <h3>Go to Page</h3>
        <form onSubmit={handleSubmit}>
          <div className="jump-to-page-input-group">
            <input
              ref={inputRef}
              type="number"
              min={1}
              max={state.totalPages}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`1-${state.totalPages}`}
              className="jump-to-page-input"
            />
            <span className="jump-to-page-total">/ {state.totalPages}</span>
          </div>
          <div className="jump-to-page-info">
            Current: Page {state.currentPage + 1}
          </div>
          <div className="jump-to-page-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Go
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
