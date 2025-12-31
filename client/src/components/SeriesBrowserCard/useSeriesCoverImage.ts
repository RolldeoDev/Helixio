/**
 * useSeriesCoverImage Hook - Chrome Performance Optimized
 *
 * Handles series cover image loading with batched IntersectionObserver callbacks.
 * Similar to useCoverImage but for series covers (API covers, user covers, first issue).
 *
 * Chrome-specific optimizations:
 * - Batched visibility updates via requestIdleCallback/setTimeout
 * - Single global IntersectionObserver for all images
 * - No image loading during rapid scroll (visibility updates are debounced)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getCoverUrl, getApiCoverUrl } from '../../services/api.service';

export type CoverImageStatus = 'loading' | 'loaded' | 'error';

interface SeriesCoverData {
  coverSource?: 'api' | 'user' | 'auto';
  /** Server-computed resolved cover source (takes priority over coverSource) */
  resolvedCoverSource?: 'api' | 'user' | 'firstIssue' | 'none' | null;
  coverHash?: string | null;
  coverFileId?: string | null;
  firstIssueId?: string | null;
  firstIssueCoverHash?: string | null;
}

interface UseSeriesCoverImageOptions {
  /** Disable lazy loading for above-the-fold items */
  eager?: boolean;
}

interface UseSeriesCoverImageReturn {
  /** Current loading status */
  status: CoverImageStatus;
  /** Whether the image is in/near viewport */
  isInView: boolean;
  /** Full cover image URL (empty until in view) */
  coverUrl: string;
  /** Ref to attach to container for intersection observation */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Handle image load success */
  handleLoad: () => void;
  /** Handle image load error */
  handleError: () => void;
  /** Retry loading the image */
  handleRetry: (e?: React.MouseEvent) => void;
}

// =============================================================================
// Batched IntersectionObserver
// Collects visibility changes and applies them in batches during idle time
// =============================================================================

let globalObserver: IntersectionObserver | null = null;
const pendingUpdates = new Map<Element, () => void>();
let batchTimeout: ReturnType<typeof setTimeout> | null = null;

// Process pending visibility updates in a batch
function processBatch() {
  const updates = Array.from(pendingUpdates.values());
  pendingUpdates.clear();
  batchTimeout = null;
  updates.forEach((callback) => callback());
}

// Schedule batch processing
function scheduleBatch() {
  if (batchTimeout !== null) return;

  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(
      () => processBatch(),
      { timeout: 100 }
    );
    batchTimeout = setTimeout(() => {}, 100);
  } else {
    batchTimeout = setTimeout(processBatch, 50);
  }
}

function getGlobalObserver(): IntersectionObserver {
  if (!globalObserver) {
    globalObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const element = entry.target;
            const storedCallback = (element as Element & { __visibilityCallback?: () => void }).__visibilityCallback;
            if (storedCallback) {
              pendingUpdates.set(element, storedCallback);
              scheduleBatch();
            }
            globalObserver?.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '300px',
        threshold: 0,
      }
    );
  }
  return globalObserver;
}

// =============================================================================
// Compute Series Cover URL
// =============================================================================

function computeSeriesCoverUrl(data: SeriesCoverData): string | null {
  const {
    coverSource,
    resolvedCoverSource,
    coverHash,
    coverFileId,
    firstIssueId,
    firstIssueCoverHash,
  } = data;

  // If server provided resolvedCoverSource, use it to determine the correct endpoint
  // - 'api' covers are stored at /api/covers/series/{hash}
  // - 'user' and 'firstIssue' covers are file-based at /api/covers/{fileId}
  if (resolvedCoverSource) {
    if (resolvedCoverSource === 'api' && coverHash) {
      return getApiCoverUrl(coverHash);
    }
    if ((resolvedCoverSource === 'firstIssue' || resolvedCoverSource === 'user') && coverFileId) {
      return getCoverUrl(coverFileId);
    }
    if (resolvedCoverSource === 'none') {
      return null;
    }
  }

  // Fallback for old data without resolvedCoverSource (legacy support)
  if (coverSource === 'api') {
    if (coverHash) return getApiCoverUrl(coverHash);
    if (firstIssueId) return getCoverUrl(firstIssueId, firstIssueCoverHash);
    return null;
  }

  if (coverSource === 'user') {
    if (coverFileId) return getCoverUrl(coverFileId);
    if (firstIssueId) return getCoverUrl(firstIssueId, firstIssueCoverHash);
    return null;
  }

  // 'auto' mode or unset: Priority fallback chain
  if (coverHash) return getApiCoverUrl(coverHash);
  if (coverFileId) return getCoverUrl(coverFileId);
  if (firstIssueId) return getCoverUrl(firstIssueId, firstIssueCoverHash);
  return null;
}

// =============================================================================
// Hook
// =============================================================================

export function useSeriesCoverImage(
  coverData: SeriesCoverData,
  options: UseSeriesCoverImageOptions = {}
): UseSeriesCoverImageReturn {
  const { eager = false } = options;

  // Compute the cover URL
  const computedUrl = useMemo(() => computeSeriesCoverUrl(coverData), [
    coverData.coverSource,
    coverData.resolvedCoverSource,
    coverData.coverHash,
    coverData.coverFileId,
    coverData.firstIssueId,
    coverData.firstIssueCoverHash,
  ]);

  const [status, setStatus] = useState<CoverImageStatus>(computedUrl ? 'loading' : 'error');
  const [isInView, setIsInView] = useState(eager);
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync isInView with eager prop changes
  // This ensures first-row items (eager=true) load even if they mounted before eager was determined
  useEffect(() => {
    if (eager && !isInView) {
      setIsInView(true);
    }
  }, [eager, isInView]);

  // Sync status with computedUrl changes - if URL becomes null, show error state
  useEffect(() => {
    if (!computedUrl) {
      setStatus('error');
    } else if (status === 'error' && computedUrl) {
      // URL became available, reset to loading
      setStatus('loading');
    }
  }, [computedUrl, status]);

  // Timeout for stuck loading states (10 seconds)
  useEffect(() => {
    if (status !== 'loading' || !computedUrl) return;

    const timeout = setTimeout(() => {
      setStatus('error');
    }, 10000);

    return () => clearTimeout(timeout);
  }, [status, computedUrl, retryCount]);

  // Set up IntersectionObserver for visibility detection
  useEffect(() => {
    if (eager || isInView) return;

    const element = containerRef.current;
    if (!element) return;

    const observer = getGlobalObserver();

    const visibilityCallback = () => {
      setIsInView(true);
    };
    (element as Element & { __visibilityCallback?: () => void }).__visibilityCallback = visibilityCallback;

    observer.observe(element);

    return () => {
      observer.unobserve(element);
      pendingUpdates.delete(element);
      delete (element as Element & { __visibilityCallback?: () => void }).__visibilityCallback;
    };
  }, [eager, isInView]);

  // Build URL with retry cache-busting
  const coverUrl = useMemo(() => {
    if (!isInView || !computedUrl) return '';
    if (retryCount > 0) {
      const separator = computedUrl.includes('?') ? '&' : '?';
      return `${computedUrl}${separator}retry=${retryCount}`;
    }
    return computedUrl;
  }, [isInView, computedUrl, retryCount]);

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
    setRetryCount((c) => c + 1);
  }, []);

  return {
    status,
    isInView,
    coverUrl,
    containerRef,
    handleLoad,
    handleError,
    handleRetry,
  };
}
