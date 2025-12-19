/**
 * CoverImage Component
 *
 * Cover image with blur-up loading effect, progress bar, and status badges.
 */

import { useCoverImage } from './useCoverImage';
import type { ReadingProgressData } from './types';

interface CoverImageProps {
  fileId: string;
  filename: string;
  progress?: ReadingProgressData;
  eager?: boolean;
}

export function CoverImage({ fileId, filename, progress, eager }: CoverImageProps) {
  const {
    status,
    blurPlaceholder,
    coverUrl,
    handleLoad,
    handleError,
    handleRetry,
  } = useCoverImage(fileId, { eager });

  // Calculate progress percentage
  const progressPercent =
    progress && progress.totalPages > 0
      ? Math.round((progress.currentPage / progress.totalPages) * 100)
      : 0;
  const isInProgress = progress && progress.currentPage > 0 && !progress.completed;
  const isCompleted = progress?.completed;

  return (
    <>
      {/* Blur placeholder - shown immediately while full image loads */}
      {blurPlaceholder && status === 'loading' && (
        <img
          src={blurPlaceholder}
          alt=""
          className="cover-card__blur-placeholder"
          aria-hidden="true"
        />
      )}

      {/* Loading spinner - only show if no blur placeholder */}
      {status === 'loading' && !blurPlaceholder && (
        <div className="cover-card__loading">
          <div className="cover-card__spinner" />
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div
          className="cover-card__error"
          onClick={handleRetry}
          title="Click to retry"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleRetry();
            }
          }}
        >
          <span className="cover-card__error-icon">!</span>
          <span className="cover-card__error-text">Failed</span>
        </div>
      )}

      {/* Main cover image */}
      <img
        src={coverUrl}
        alt={filename}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        className={`cover-card__image ${status === 'loaded' ? 'cover-card__image--loaded' : 'cover-card__image--hidden'}`}
      />

      {/* Reading progress bar */}
      {isInProgress && (
        <div className="cover-card__progress">
          <div
            className="cover-card__progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Completed indicator */}
      {isCompleted && (
        <div className="cover-card__completed" title="Completed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </div>
      )}

      {/* Continue reading badge */}
      {isInProgress && (
        <div className="cover-card__continue-badge" title={`${progressPercent}% complete`}>
          Continue
        </div>
      )}
    </>
  );
}
