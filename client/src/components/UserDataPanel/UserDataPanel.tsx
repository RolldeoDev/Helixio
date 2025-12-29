/**
 * UserDataPanel Component
 *
 * Collapsible section for user ratings, notes, and reviews.
 * Used in both series and issue detail pages.
 */

import React, { useState } from 'react';
import { RatingStars } from '../RatingStars';
import './UserDataPanel.css';

export interface UserDataPanelProps {
  /** Current rating (0.5-5.0 or null) */
  rating: number | null;
  /** Private notes content */
  privateNotes: string | null;
  /** Public review content */
  publicReview: string | null;
  /** Review visibility setting */
  reviewVisibility: 'private' | 'public';
  /** Loading state */
  isLoading?: boolean;
  /** Saving state */
  isSaving?: boolean;
  /** Callback when rating changes */
  onRatingChange?: (rating: number | null) => void;
  /** Callback when private notes change */
  onPrivateNotesChange?: (notes: string | null) => void;
  /** Callback when public review changes */
  onPublicReviewChange?: (review: string | null) => void;
  /** Callback when visibility changes */
  onVisibilityChange?: (visibility: 'private' | 'public') => void;
  /** Optional additional content (e.g., computed average for series) */
  additionalStats?: React.ReactNode;
  /** Panel title */
  title?: string;
  /** Start expanded */
  defaultExpanded?: boolean;
  /** Additional class name */
  className?: string;
}

export function UserDataPanel({
  rating,
  privateNotes,
  publicReview,
  reviewVisibility,
  isLoading = false,
  isSaving = false,
  onRatingChange,
  onPrivateNotesChange,
  onPublicReviewChange,
  onVisibilityChange,
  additionalStats,
  title = 'Your Rating & Notes',
  defaultExpanded = false,
  className = '',
}: UserDataPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const [localNotes, setLocalNotes] = useState(privateNotes || '');
  const [localReview, setLocalReview] = useState(publicReview || '');

  const hasContent = rating !== null || privateNotes || publicReview;
  const isReadonly = !onRatingChange;

  const handleNotesBlur = () => {
    setEditingNotes(false);
    if (onPrivateNotesChange) {
      const newNotes = localNotes.trim() || null;
      if (newNotes !== privateNotes) {
        onPrivateNotesChange(newNotes);
      }
    }
  };

  const handleReviewBlur = () => {
    setEditingReview(false);
    if (onPublicReviewChange) {
      const newReview = localReview.trim() || null;
      if (newReview !== publicReview) {
        onPublicReviewChange(newReview);
      }
    }
  };

  const handleVisibilityToggle = () => {
    if (onVisibilityChange) {
      onVisibilityChange(reviewVisibility === 'private' ? 'public' : 'private');
    }
  };

  // Update local state when props change
  React.useEffect(() => {
    if (!editingNotes) {
      setLocalNotes(privateNotes || '');
    }
  }, [privateNotes, editingNotes]);

  React.useEffect(() => {
    if (!editingReview) {
      setLocalReview(publicReview || '');
    }
  }, [publicReview, editingReview]);

  if (isLoading) {
    return (
      <div className={`user-data-panel ${className}`}>
        <div className="user-data-panel-loading">
          <span className="loading-spinner" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className={`user-data-panel ${isExpanded ? 'expanded' : 'collapsed'} ${className}`}>
      <button
        className="user-data-panel-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="user-data-panel-title">
          {title}
          {hasContent && !isExpanded && (
            <span className="user-data-summary">
              {rating !== null && (
                <span className="summary-rating">
                  <RatingStars value={rating} readonly size="small" showEmpty />
                </span>
              )}
              {(privateNotes || publicReview) && (
                <span className="summary-notes">
                  {privateNotes && publicReview
                    ? 'has notes & review'
                    : privateNotes
                    ? 'has notes'
                    : 'has review'}
                </span>
              )}
            </span>
          )}
        </span>
        <span className={`user-data-panel-chevron ${isExpanded ? 'rotated' : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="user-data-panel-content">
          {/* Rating Section */}
          <div className="user-data-section">
            <label className="user-data-label">Your Rating</label>
            <div className="user-data-rating-row">
              <RatingStars
                value={rating}
                onChange={onRatingChange}
                readonly={isReadonly}
                size="large"
                showEmpty
                allowClear
              />
              {rating !== null && !isReadonly && onRatingChange && (
                <button
                  className="clear-rating-button"
                  onClick={() => onRatingChange(null)}
                  type="button"
                  title="Clear rating"
                >
                  ✕
                </button>
              )}
              {isSaving && <span className="saving-indicator">Saving...</span>}
            </div>
          </div>

          {/* Additional Stats (e.g., average from issues) */}
          {additionalStats && (
            <div className="user-data-section user-data-stats">
              {additionalStats}
            </div>
          )}

          {/* Private Notes Section */}
          <div className="user-data-section">
            <label className="user-data-label">
              Private Notes
              <span className="label-hint">(only visible to you)</span>
            </label>
            {editingNotes || !isReadonly ? (
              <textarea
                className="user-data-textarea"
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                onFocus={() => setEditingNotes(true)}
                onBlur={handleNotesBlur}
                placeholder="Add your private notes..."
                rows={3}
                disabled={isReadonly}
              />
            ) : (
              <div
                className="user-data-text-display"
                onClick={() => !isReadonly && setEditingNotes(true)}
              >
                {privateNotes || <span className="placeholder">No notes</span>}
              </div>
            )}
          </div>

          {/* Public Review Section */}
          <div className="user-data-section">
            <div className="user-data-label-row">
              <label className="user-data-label">
                Review
                <span className="label-hint">
                  ({reviewVisibility === 'public' ? 'visible to others' : 'private'})
                </span>
              </label>
              {!isReadonly && (
                <button
                  className="visibility-toggle"
                  onClick={handleVisibilityToggle}
                  type="button"
                >
                  {reviewVisibility === 'public' ? 'Make Private' : 'Make Public'}
                </button>
              )}
            </div>
            {editingReview || !isReadonly ? (
              <textarea
                className="user-data-textarea"
                value={localReview}
                onChange={(e) => setLocalReview(e.target.value)}
                onFocus={() => setEditingReview(true)}
                onBlur={handleReviewBlur}
                placeholder="Write your review..."
                rows={4}
                disabled={isReadonly}
              />
            ) : (
              <div
                className="user-data-text-display"
                onClick={() => !isReadonly && setEditingReview(true)}
              >
                {publicReview || <span className="placeholder">No review</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default UserDataPanel;
