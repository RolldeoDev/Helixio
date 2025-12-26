/**
 * MosaicCover Component
 *
 * Generates a composite cover image from multiple series covers.
 * Used for promoted collections to show a visual overview.
 *
 * Layout modes:
 * - 4+ series: 2x2 grid (shows first 4)
 * - 2-3 series: 2x1 side by side (shows first 2)
 * - 1 series: Single cover
 * - 0 series: Placeholder
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getCoverUrl, getApiCoverUrl } from '../../services/api.service';
import './MosaicCover.css';

// =============================================================================
// Types
// =============================================================================

export interface SeriesCoverInfo {
  /** Series ID */
  id: string;
  /** Series name (for alt text) */
  name: string;
  /** Cover hash from API (preferred) */
  coverHash?: string | null;
  /** Cover file ID from user selection */
  coverFileId?: string | null;
  /** First issue ID as fallback */
  firstIssueId?: string | null;
  /** Cover source preference */
  coverSource?: 'api' | 'user' | 'auto';
}

export interface MosaicCoverProps {
  /** Array of series cover info */
  seriesCovers: SeriesCoverInfo[];
  /** CSS class name */
  className?: string;
  /** Alt text for the mosaic */
  alt?: string;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the cover URL for a series based on its cover source preference
 */
function getSeriesCoverUrl(series: SeriesCoverInfo): string | null {
  const { coverHash, coverFileId, firstIssueId, coverSource = 'auto' } = series;

  if (coverSource === 'api') {
    if (coverHash) return getApiCoverUrl(coverHash);
    if (firstIssueId) return getCoverUrl(firstIssueId);
    return null;
  }

  if (coverSource === 'user') {
    if (coverFileId) return getCoverUrl(coverFileId);
    if (firstIssueId) return getCoverUrl(firstIssueId);
    return null;
  }

  // 'auto' mode: API > User > First Issue
  if (coverHash) return getApiCoverUrl(coverHash);
  if (coverFileId) return getCoverUrl(coverFileId);
  if (firstIssueId) return getCoverUrl(firstIssueId);
  return null;
}

// =============================================================================
// Sub-components
// =============================================================================

interface MosaicImageProps {
  url: string | null;
  alt: string;
  position: 'single' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

function MosaicImage({ url, alt, position }: MosaicImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    url ? 'loading' : 'error'
  );
  const imgRef = useRef<HTMLImageElement>(null);

  // Handle cached images
  useEffect(() => {
    if (!url) {
      setStatus('error');
      return;
    }

    const img = imgRef.current;
    if (img && img.complete) {
      if (img.naturalWidth > 0) {
        setStatus('loaded');
      } else {
        setStatus('error');
      }
    }
  }, [url]);

  const handleLoad = useCallback(() => {
    setStatus('loaded');
  }, []);

  const handleError = useCallback(() => {
    setStatus('error');
  }, []);

  return (
    <div className={`mosaic-cover__tile mosaic-cover__tile--${position}`}>
      {status === 'loading' && url && (
        <div className="mosaic-cover__loading">
          <div className="mosaic-cover__spinner" />
        </div>
      )}

      {(status === 'error' || !url) && (
        <div className="mosaic-cover__placeholder">
          <svg
            className="mosaic-cover__placeholder-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 14H7v-2h8v2zm2-4H7v-2h10v2zm0-4H7V7h10v2z" />
          </svg>
        </div>
      )}

      {url && (
        <img
          ref={imgRef}
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={`mosaic-cover__image ${status === 'loaded' ? 'mosaic-cover__image--loaded' : ''}`}
        />
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function MosaicCover({
  seriesCovers,
  className = '',
  alt = 'Collection cover',
  size = 'medium',
}: MosaicCoverProps) {
  const count = seriesCovers.length;

  // Determine layout mode
  const layoutMode = count >= 4 ? 'grid-2x2' : count >= 2 ? 'grid-2x1' : count === 1 ? 'single' : 'empty';

  // Get cover URLs for display
  const coverUrls = seriesCovers.slice(0, 4).map((series) => ({
    url: getSeriesCoverUrl(series),
    alt: series.name,
  }));

  return (
    <div
      className={`mosaic-cover mosaic-cover--${layoutMode} mosaic-cover--${size} ${className}`}
      role="img"
      aria-label={alt}
    >
      {layoutMode === 'empty' && (
        <div className="mosaic-cover__empty">
          <svg
            className="mosaic-cover__empty-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
          </svg>
          <span className="mosaic-cover__empty-text">No Series</span>
        </div>
      )}

      {layoutMode === 'single' && coverUrls[0] && (
        <MosaicImage url={coverUrls[0].url} alt={coverUrls[0].alt} position="single" />
      )}

      {layoutMode === 'grid-2x1' && (
        <>
          <MosaicImage
            url={coverUrls[0]?.url ?? null}
            alt={coverUrls[0]?.alt ?? 'Cover 1'}
            position="left"
          />
          <MosaicImage
            url={coverUrls[1]?.url ?? null}
            alt={coverUrls[1]?.alt ?? 'Cover 2'}
            position="right"
          />
        </>
      )}

      {layoutMode === 'grid-2x2' && (
        <>
          <MosaicImage
            url={coverUrls[0]?.url ?? null}
            alt={coverUrls[0]?.alt ?? 'Cover 1'}
            position="top-left"
          />
          <MosaicImage
            url={coverUrls[1]?.url ?? null}
            alt={coverUrls[1]?.alt ?? 'Cover 2'}
            position="top-right"
          />
          <MosaicImage
            url={coverUrls[2]?.url ?? null}
            alt={coverUrls[2]?.alt ?? 'Cover 3'}
            position="bottom-left"
          />
          <MosaicImage
            url={coverUrls[3]?.url ?? null}
            alt={coverUrls[3]?.alt ?? 'Cover 4'}
            position="bottom-right"
          />
        </>
      )}

      {/* Series count badge for 5+ series */}
      {count > 4 && (
        <div className="mosaic-cover__count-badge">+{count - 4}</div>
      )}
    </div>
  );
}

export default MosaicCover;
