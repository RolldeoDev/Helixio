/**
 * Transition Screen Component
 *
 * Shows when navigating past the first/last page of a comic.
 * Displays next/previous issue info or a completion message.
 * On end screens, shows rating and review options for the current issue.
 */

import { useState } from 'react';
import { getCoverUrl } from '../../services/api.service';
import { RatingStars } from '../RatingStars';
import { IssueReviewModal } from './IssueReviewModal';
import { useIssueUserData, useUpdateIssueUserData } from '../../hooks/queries';
import './TransitionScreen.css';

interface AdjacentFile {
  fileId: string;
  filename: string;
  number?: string;
}

interface TransitionScreenProps {
  type: 'start' | 'end';
  adjacentFile: AdjacentFile | null;
  seriesInfo: {
    seriesName: string | null;
    currentIndex: number;
    totalInSeries: number;
  };
  /** The current file being read (for rating on end screens) */
  currentFileId: string;
  onNavigate: (fileId: string) => void;
  onReturn: () => void;
  onClose: () => void;
}

export function TransitionScreen({
  type,
  adjacentFile,
  seriesInfo,
  currentFileId,
  onNavigate,
  onReturn,
  onClose,
}: TransitionScreenProps) {
  const isEnd = type === 'end';
  const hasAdjacentIssue = adjacentFile !== null;

  // Rating and review state (only used on end screens)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // User data for the current issue
  const { data: userDataResponse } = useIssueUserData(isEnd ? currentFileId : undefined);
  const updateUserData = useUpdateIssueUserData();
  const userData = userDataResponse?.data;

  // Handle keyboard navigation (disabled when modal is open)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't handle keyboard shortcuts when review modal is open
    if (isReviewModalOpen) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (hasAdjacentIssue) {
        onNavigate(adjacentFile!.fileId);
      } else if (isEnd) {
        onClose();
      }
    } else if (e.key === 'Escape') {
      onReturn();
    }
  };

  // Handle rating change
  const handleRatingChange = (rating: number | null) => {
    updateUserData.mutate({
      fileId: currentFileId,
      input: { rating },
    });
  };

  // Handle review save
  const handleReviewSave = (data: {
    privateNotes: string | null;
    publicReview: string | null;
    reviewVisibility: 'private' | 'public';
  }) => {
    updateUserData.mutate({
      fileId: currentFileId,
      input: data,
    });
    setIsReviewModalOpen(false);
  };

  // Rating section component (shared between both end screen types)
  const RatingSection = () => (
    <div className="transition-rating-section">
      <span className="transition-rating-label">Rate this issue</span>
      <RatingStars
        value={userData?.rating ?? null}
        onChange={handleRatingChange}
        size="large"
        showEmpty
        allowClear
        ariaLabel="Rate this issue"
      />
      <button
        type="button"
        className="transition-review-btn"
        onClick={() => setIsReviewModalOpen(true)}
      >
        Write Review
      </button>
    </div>
  );

  // End screen with no next issue - show completion message
  if (isEnd && !hasAdjacentIssue) {
    return (
      <div className="transition-screen" onKeyDown={handleKeyDown} tabIndex={0}>
        <div className="transition-screen-content transition-complete">
          <div className="transition-complete-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="transition-complete-title">
            {seriesInfo.seriesName ? 'Series Complete!' : 'Finished Reading'}
          </h2>
          {seriesInfo.seriesName && (
            <p className="transition-series-name">{seriesInfo.seriesName}</p>
          )}
          <p className="transition-complete-subtitle">
            You've reached the end of this {seriesInfo.seriesName ? 'series' : 'comic'}.
          </p>
          <div className="transition-actions">
            <button className="transition-btn transition-btn-secondary" onClick={onReturn}>
              Back to Last Page
            </button>
            <button className="transition-btn transition-btn-primary" onClick={onClose}>
              Close Reader
            </button>
          </div>

          {/* Rating section for completed issue */}
          <RatingSection />
        </div>

        {/* Review modal */}
        <IssueReviewModal
          isOpen={isReviewModalOpen}
          initialNotes={userData?.privateNotes ?? null}
          initialReview={userData?.publicReview ?? null}
          initialVisibility={(userData?.reviewVisibility as 'private' | 'public') ?? 'private'}
          onClose={() => setIsReviewModalOpen(false)}
          onSave={handleReviewSave}
          isSaving={updateUserData.isPending}
        />
      </div>
    );
  }

  // Start or end screen with adjacent issue
  const label = isEnd ? 'Up Next' : 'Previous Issue';
  const actionText = isEnd ? 'Continue Reading' : 'Go to Previous';
  const returnText = isEnd ? 'Back to Last Page' : 'Back to First Page';

  return (
    <div className="transition-screen" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="transition-screen-content">
        <span className="transition-label">{label}</span>

        <div
          className="transition-cover"
          onClick={() => onNavigate(adjacentFile!.fileId)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigate(adjacentFile!.fileId);
            }
          }}
        >
          <img
            src={getCoverUrl(adjacentFile!.fileId)}
            alt={adjacentFile!.filename}
            loading="lazy"
          />
        </div>

        <div className="transition-info">
          <h3 className="transition-title">{adjacentFile!.filename}</h3>
          {adjacentFile!.number && (
            <span className="transition-issue-number">Issue #{adjacentFile!.number}</span>
          )}
          {seriesInfo.seriesName && seriesInfo.totalInSeries > 1 && (
            <span className="transition-progress">
              {isEnd
                ? `Issue ${seriesInfo.currentIndex + 2} of ${seriesInfo.totalInSeries}`
                : `Issue ${seriesInfo.currentIndex} of ${seriesInfo.totalInSeries}`
              }
            </span>
          )}
        </div>

        <div className="transition-actions">
          <button className="transition-btn transition-btn-secondary" onClick={onReturn}>
            {returnText}
          </button>
          <button
            className="transition-btn transition-btn-primary"
            onClick={() => onNavigate(adjacentFile!.fileId)}
          >
            {actionText}
          </button>
        </div>

        {/* Rating section only on end screens */}
        {isEnd && <RatingSection />}

        <p className="transition-hint">
          Press <kbd>{isEnd ? 'Next' : 'Previous'}</kbd> or <kbd>Enter</kbd> to continue
        </p>
      </div>

      {/* Review modal (only on end screens) */}
      {isEnd && (
        <IssueReviewModal
          isOpen={isReviewModalOpen}
          initialNotes={userData?.privateNotes ?? null}
          initialReview={userData?.publicReview ?? null}
          initialVisibility={(userData?.reviewVisibility as 'private' | 'public') ?? 'private'}
          onClose={() => setIsReviewModalOpen(false)}
          onSave={handleReviewSave}
          isSaving={updateUserData.isPending}
        />
      )}
    </div>
  );
}
