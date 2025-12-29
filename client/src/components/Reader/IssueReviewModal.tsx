/**
 * IssueReviewModal Component
 *
 * Modal for editing private notes and public review for an issue.
 * Features tabs to switch between private notes and public review.
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './IssueReviewModal.css';

type TabType = 'notes' | 'review';

export interface IssueReviewModalProps {
  isOpen: boolean;
  initialNotes: string | null;
  initialReview: string | null;
  initialVisibility: 'private' | 'public';
  onClose: () => void;
  onSave: (data: {
    privateNotes: string | null;
    publicReview: string | null;
    reviewVisibility: 'private' | 'public';
  }) => void;
  isSaving?: boolean;
}

export function IssueReviewModal({
  isOpen,
  initialNotes,
  initialReview,
  initialVisibility,
  onClose,
  onSave,
  isSaving = false,
}: IssueReviewModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('notes');
  const [notes, setNotes] = useState(initialNotes || '');
  const [review, setReview] = useState(initialReview || '');
  const [visibility, setVisibility] = useState(initialVisibility);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setNotes(initialNotes || '');
      setReview(initialReview || '');
      setVisibility(initialVisibility);
      setActiveTab('notes');
    }
  }, [isOpen, initialNotes, initialReview, initialVisibility]);

  // Focus management
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen, activeTab]);

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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSave = () => {
    onSave({
      privateNotes: notes.trim() || null,
      publicReview: review.trim() || null,
      reviewVisibility: visibility,
    });
  };

  const hasChanges =
    notes !== (initialNotes || '') ||
    review !== (initialReview || '') ||
    visibility !== initialVisibility;

  if (!isOpen) return null;

  // Stop keyboard events from bubbling to parent (TransitionScreen)
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };

  const modal = (
    <div className="issue-review-modal-overlay" onClick={handleBackdropClick} onKeyDown={handleModalKeyDown}>
      <div
        className="issue-review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-review-modal-title"
      >
        {/* Header */}
        <div className="issue-review-modal-header">
          <h3 id="issue-review-modal-title">Write Review</h3>
          <button
            type="button"
            className="issue-review-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="issue-review-modal-tabs">
          <button
            type="button"
            className={`issue-review-modal-tab ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            Private Notes
          </button>
          <button
            type="button"
            className={`issue-review-modal-tab ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => setActiveTab('review')}
          >
            Review
          </button>
        </div>

        {/* Body */}
        <div className="issue-review-modal-body">
          {activeTab === 'notes' ? (
            <div className="issue-review-modal-field">
              <label className="issue-review-modal-label">
                Private Notes
                <span className="issue-review-modal-hint">Only visible to you</span>
              </label>
              <textarea
                ref={textareaRef}
                className="issue-review-modal-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add private notes about this issue..."
                rows={6}
              />
            </div>
          ) : (
            <div className="issue-review-modal-field">
              <div className="issue-review-modal-label-row">
                <label className="issue-review-modal-label">
                  Review
                  <span className="issue-review-modal-hint">
                    {visibility === 'public' ? 'Visible to others' : 'Only visible to you'}
                  </span>
                </label>
                <button
                  type="button"
                  className={`issue-review-modal-visibility-toggle ${visibility === 'public' ? 'public' : ''}`}
                  onClick={() => setVisibility(visibility === 'public' ? 'private' : 'public')}
                >
                  {visibility === 'public' ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Public
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                      Private
                    </>
                  )}
                </button>
              </div>
              <textarea
                ref={textareaRef}
                className="issue-review-modal-textarea"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Write your review..."
                rows={6}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="issue-review-modal-footer">
          <button
            ref={cancelButtonRef}
            type="button"
            className="issue-review-modal-btn issue-review-modal-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="issue-review-modal-btn issue-review-modal-btn-primary"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default IssueReviewModal;
