/**
 * useCoverImage Hook
 *
 * Handles cover image loading with blur-up effect.
 * Fetches blur placeholder from X-Blur-Placeholder header for instant perceived load.
 */

import { useState, useEffect, useCallback } from 'react';
import { getCoverUrl } from '../../services/api.service';
import type { CoverImageStatus } from './types';

interface UseCoverImageOptions {
  /** Disable lazy loading for above-the-fold items */
  eager?: boolean;
}

interface UseCoverImageReturn {
  /** Current loading status */
  status: CoverImageStatus;
  /** Tiny blur placeholder data URL */
  blurPlaceholder: string | null;
  /** Full cover image URL */
  coverUrl: string;
  /** Handle image load success */
  handleLoad: () => void;
  /** Handle image load error */
  handleError: () => void;
  /** Retry loading the image */
  handleRetry: (e?: React.MouseEvent) => void;
}

export function useCoverImage(
  fileId: string,
  _options: UseCoverImageOptions = {}
): UseCoverImageReturn {
  const [status, setStatus] = useState<CoverImageStatus>('loading');
  const [blurPlaceholder, setBlurPlaceholder] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Build URL with retry count to bust cache on retry
  const coverUrl = retryCount > 0
    ? `${getCoverUrl(fileId)}?retry=${retryCount}`
    : getCoverUrl(fileId);

  // Fetch cover with blur placeholder from header
  useEffect(() => {
    let cancelled = false;

    const fetchCover = async () => {
      try {
        const response = await fetch(coverUrl, {
          headers: { Accept: 'image/webp,image/jpeg,*/*' },
        });

        if (cancelled) return;

        if (!response.ok) {
          setStatus('error');
          return;
        }

        // Get blur placeholder from header
        const placeholder = response.headers.get('X-Blur-Placeholder');
        if (placeholder && !cancelled) {
          setBlurPlaceholder(placeholder);
        }

        // Image will load via the img tag
      } catch {
        if (!cancelled) {
          setStatus('error');
        }
      }
    };

    // Only fetch for blur placeholder on initial load
    if (retryCount === 0 && !blurPlaceholder) {
      fetchCover();
    }

    return () => {
      cancelled = true;
    };
  }, [coverUrl, retryCount, blurPlaceholder]);

  const handleLoad = useCallback(() => {
    setStatus('loaded');
  }, []);

  const handleError = useCallback(() => {
    setStatus('error');
  }, []);

  const handleRetry = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setStatus('loading');
    setBlurPlaceholder(null);
    setRetryCount((c) => c + 1);
  }, []);

  return {
    status,
    blurPlaceholder,
    coverUrl,
    handleLoad,
    handleError,
    handleRetry,
  };
}
