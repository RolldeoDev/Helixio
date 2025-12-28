/**
 * useCoverImage Hook - Chrome Performance Optimized
 *
 * Handles cover image loading with batched IntersectionObserver callbacks.
 *
 * Chrome-specific optimizations:
 * - Batched visibility updates via requestIdleCallback/setTimeout
 * - Single global IntersectionObserver for all images
 * - No image loading during rapid scroll (visibility updates are debounced)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCoverUrl } from '../../services/api.service';
import type { CoverImageStatus } from './types';

interface UseCoverImageOptions {
  /** Disable lazy loading for above-the-fold items */
  eager?: boolean;
  /** Optional version/hash for cache-busting when cover changes */
  coverVersion?: string | null;
}

interface UseCoverImageReturn {
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
  // Copy and clear pending updates
  const updates = Array.from(pendingUpdates.values());
  pendingUpdates.clear();
  batchTimeout = null;

  // Apply all updates in one go
  updates.forEach((callback) => callback());
}

// Schedule batch processing
function scheduleBatch() {
  if (batchTimeout !== null) return; // Already scheduled

  // Use requestIdleCallback if available, otherwise setTimeout
  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
      () => processBatch(),
      { timeout: 100 }
    );
    // Set a dummy timeout to track scheduling
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
            const callback = pendingUpdates.get(entry.target);
            if (!callback) {
              // Store the callback for batch processing
              const element = entry.target;
              const storedCallback = (element as Element & { __visibilityCallback?: () => void }).__visibilityCallback;
              if (storedCallback) {
                pendingUpdates.set(element, storedCallback);
                scheduleBatch();
              }
            }
            // Unobserve immediately to prevent re-triggering
            globalObserver?.unobserve(entry.target);
          }
        });
      },
      {
        // Larger margin for smoother preloading
        rootMargin: '300px',
        threshold: 0,
      }
    );
  }
  return globalObserver;
}

// =============================================================================
// Hook
// =============================================================================

export function useCoverImage(
  fileId: string,
  options: UseCoverImageOptions = {}
): UseCoverImageReturn {
  const { eager = false, coverVersion } = options;

  const [status, setStatus] = useState<CoverImageStatus>('loading');
  const [isInView, setIsInView] = useState(eager);
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set up IntersectionObserver for visibility detection
  useEffect(() => {
    // If eager or already in view, skip observation
    if (eager || isInView) return;

    const element = containerRef.current;
    if (!element) return;

    const observer = getGlobalObserver();

    // Store callback on element for batch processing
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

  // Build URL - only when in view
  // Include coverVersion for cache-busting when cover changes
  const coverUrl = isInView
    ? (() => {
        const baseUrl = getCoverUrl(fileId);
        const params = new URLSearchParams();
        if (coverVersion) params.set('v', coverVersion);
        if (retryCount > 0) params.set('retry', retryCount.toString());
        const queryString = params.toString();
        return queryString ? `${baseUrl}?${queryString}` : baseUrl;
      })()
    : '';

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
