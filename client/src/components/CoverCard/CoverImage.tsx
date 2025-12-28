/**
 * CoverImage Component
 *
 * Cover image with skeleton loading placeholder, progress bar, and status badges.
 *
 * Performance optimizations:
 * - Skeleton placeholder instead of fetch() for blur (eliminates network requests)
 * - IntersectionObserver-based visibility detection
 * - 100ms fade-in transition for smooth appearance
 * - Image only loads when in/near viewport
 */

import { useCoverImage } from './useCoverImage';
import type { ReadingProgressData } from './types';
import { ProgressRing } from '../Progress';

interface CoverImageProps {
  fileId: string;
  filename: string;
  progress?: ReadingProgressData;
  eager?: boolean;
  /** Optional cover version/hash for cache-busting when cover changes */
  coverVersion?: string | null;
}

export function CoverImage({ fileId, filename, progress, eager, coverVersion }: CoverImageProps) {
  const {
    status,
    isInView,
    coverUrl,
    containerRef,
    handleLoad,
    handleError,
    handleRetry,
  } = useCoverImage(fileId, { eager, coverVersion });

  // Calculate progress percentage
  const progressPercent =
    progress && progress.totalPages > 0
      ? Math.round((progress.currentPage / progress.totalPages) * 100)
      : 0;
  // Show progress ring when: in progress (started but not completed) OR completed
  const showProgressRing = progress && (progress.currentPage > 0 || progress.completed);
  // Use 100% for completed, otherwise use calculated progress
  const displayProgress = progress?.completed ? 100 : progressPercent;

  return (
    <div ref={containerRef} className="cover-card__image-container">
      {/* Skeleton placeholder - shown while image loads */}
      {status === 'loading' && (
        <div className="cover-card__skeleton" aria-hidden="true" />
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

      {/* Main cover image - only render src when in view */}
      {isInView && coverUrl && (
        <img
          src={coverUrl}
          alt={filename}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={`cover-card__image ${status === 'loaded' ? 'cover-card__image--loaded' : 'cover-card__image--hidden'}`}
        />
      )}

      {/* Reading progress ring - shows percentage when in progress, 100% when completed */}
      {showProgressRing && (
        <ProgressRing
          progress={displayProgress}
          size="sm"
          className="cover-card__progress-ring"
        />
      )}
    </div>
  );
}
