/**
 * ReviewCard Component
 *
 * Displays a single review from an external source or Helixio user.
 * Supports spoiler handling, author info, ratings, and expandable text.
 */

import { useState, useMemo } from 'react';
import type { ExternalReview, UserReview } from '../../hooks/queries';
import { SpoilerText } from './SpoilerText';
import { RatingStars } from '../RatingStars';
import { MarkdownContent } from '../MarkdownContent';
import './ReviewCard.css';

// =============================================================================
// Types
// =============================================================================

export interface ReviewCardProps {
  /** External review data */
  review?: ExternalReview;
  /** User review data */
  userReview?: UserReview;
  /** Whether to show expanded content by default */
  defaultExpanded?: boolean;
  /** Maximum characters to show when collapsed */
  previewLength?: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getSourceIcon(source: string): React.ReactNode {
  switch (source) {
    case 'anilist':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M6.361 2.943L0 21.056h4.942l1.077-3.133H11.4l1.052 3.133H22.9c.71 0 1.1-.392 1.1-1.101V17.53c0-.71-.39-1.101-1.1-1.101h-6.483V4.045c0-.71-.392-1.102-1.101-1.102h-2.422c-.71 0-1.101.392-1.101 1.102v1.064l-2.561-2.166c-.392-.355-1.026-.392-1.418-.037-.393.392-.43 1.026-.037 1.418l-.001.001 2.017 1.7v9.424H7.376l2.017-5.886-3.032-6.517z" />
        </svg>
      );
    case 'myanimelist':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M8.273 7.247v8.423l-2.103-.003v-5.216l-2.03 2.404-1.989-2.458-.02 5.285H.001L0 7.247h2.203l1.865 2.545 2.015-2.546 2.19.001zm8.628 2.069l.025 6.335h-2.229l-.026-3.377-1.36 1.894-1.306-1.81-.026 3.297H9.879L9.9 9.316l2.192.002 1.107 1.593 1.178-1.593h2.524l-.001-.002zm-3.588 8.59V20H6.781V17.91h6.532-.001zm5.266-14.97A7.857 7.857 0 0124 10.793a7.855 7.855 0 01-4.9 7.270 7.86 7.86 0 01-4.58.473V16.46a5.803 5.803 0 003.4-.125 5.815 5.815 0 003.626-5.39 5.81 5.81 0 00-3.185-5.2 5.804 5.804 0 00-3.833-.332V3.312a7.838 7.838 0 014.051.624z" />
        </svg>
      );
    case 'comicbookroundup':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      );
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

// Reserved for future source-specific styling
function _getSourceDisplayName(source: string): string {
  switch (source) {
    case 'anilist':
      return 'AniList';
    case 'myanimelist':
      return 'MyAnimeList';
    case 'comicbookroundup':
      return 'Comic Book Roundup';
    default:
      return source;
  }
}
void _getSourceDisplayName; // Suppress unused warning

// =============================================================================
// Main Component
// =============================================================================

export function ReviewCard({
  review,
  userReview,
  defaultExpanded = false,
  previewLength = 400,
}: ReviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Determine if this is an external or user review
  const isExternalReview = !!review;

  // Common data extraction
  const text = isExternalReview ? review.text : userReview?.publicReview || '';
  const hasSpoilers = isExternalReview ? review.hasSpoilers : false;
  const rating = isExternalReview ? review.rating : userReview?.rating;
  const displayRating = isExternalReview ? review.displayRating : null;
  const authorName = isExternalReview
    ? review.author.name
    : userReview?.displayName || userReview?.username || 'Anonymous';
  const authorAvatarUrl = isExternalReview ? review.author.avatarUrl : undefined;
  const authorProfileUrl = isExternalReview ? review.author.profileUrl : undefined;
  const source = isExternalReview ? review.source : 'helixio';
  const sourceDisplayName = isExternalReview ? review.sourceDisplayName : 'Helixio';
  const reviewDate = isExternalReview ? review.reviewDate : userReview?.reviewedAt;
  const reviewType = isExternalReview ? review.reviewType : 'user';
  const likes = isExternalReview ? review.likes : undefined;

  // Check if text needs truncation
  const needsTruncation = text.length > previewLength;
  const displayText = useMemo(() => {
    if (!needsTruncation || isExpanded) return text;
    // Truncate at word boundary
    const truncated = text.substring(0, previewLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > previewLength * 0.8 ? truncated.substring(0, lastSpace) : truncated) + '...';
  }, [text, needsTruncation, isExpanded, previewLength]);

  if (!text) return null;

  return (
    <article className={`review-card review-card--${source}`}>
      {/* Header: Author + Source + Rating */}
      <header className="review-card__header">
        {/* Author info */}
        <div className="review-card__author">
          {authorAvatarUrl ? (
            <img
              src={authorAvatarUrl}
              alt=""
              className="review-card__avatar"
              loading="lazy"
            />
          ) : (
            <div className="review-card__avatar review-card__avatar--placeholder">
              {authorName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="review-card__author-info">
            {authorProfileUrl ? (
              <a
                href={authorProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="review-card__author-name"
              >
                {authorName}
              </a>
            ) : (
              <span className="review-card__author-name">{authorName}</span>
            )}
            <div className="review-card__meta">
              <span className="review-card__source">
                {getSourceIcon(source)}
                {sourceDisplayName}
              </span>
              {reviewType === 'critic' && (
                <span className="review-card__badge review-card__badge--critic">Critic</span>
              )}
              {reviewDate && (
                <span className="review-card__date">{formatDate(reviewDate)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Rating */}
        {rating !== null && rating !== undefined && (
          <div className="review-card__rating">
            {displayRating ? (
              <span className="review-card__rating-display">{displayRating}</span>
            ) : (
              <RatingStars value={rating} readonly size="small" showEmpty />
            )}
          </div>
        )}
      </header>

      {/* Review Content */}
      <div className="review-card__content">
        {hasSpoilers ? (
          <SpoilerText text={displayText} />
        ) : (
          <div className="review-card__text">
            <MarkdownContent content={displayText} />
          </div>
        )}

        {/* Expand/Collapse button */}
        {needsTruncation && !hasSpoilers && (
          <button
            type="button"
            className="review-card__expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>

      {/* Footer: Likes, etc */}
      {likes !== undefined && likes > 0 && (
        <footer className="review-card__footer">
          <span className="review-card__likes">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777zM2.331 10.977a11.969 11.969 0 00-.831 4.398 12 12 0 00.52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 01-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227z" />
            </svg>
            {likes}
          </span>
        </footer>
      )}
    </article>
  );
}

export default ReviewCard;
