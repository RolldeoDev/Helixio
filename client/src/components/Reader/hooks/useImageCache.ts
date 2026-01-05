/**
 * Image Cache Hook for Reader
 *
 * Provides a persistent LRU cache for page images that survives across
 * page navigation. Prevents re-requesting already-loaded pages.
 */

import { useCallback, useRef, useEffect } from 'react';

export interface CachedImage {
  url: string;
  image: HTMLImageElement;
  timestamp: number;
  status: 'loading' | 'loaded' | 'error';
  pageIndex: number;
}

interface UseImageCacheOptions {
  maxSize: number;
  onImageLoaded?: (pageIndex: number, image: HTMLImageElement) => void;
  onImageError?: (pageIndex: number, error: Error) => void;
}

interface PageInfo {
  path: string;
  index: number;
  url: string;
}

interface UseImageCacheReturn {
  /**
   * Get a cached image by page index.
   * Returns undefined if not cached.
   */
  getImage: (pageIndex: number) => HTMLImageElement | undefined;

  /**
   * Check if a page is fully loaded (not loading, not error).
   */
  isLoaded: (pageIndex: number) => boolean;

  /**
   * Check if a page is currently loading.
   */
  isLoading: (pageIndex: number) => boolean;

  /**
   * Check if a page failed to load.
   */
  hasError: (pageIndex: number) => boolean;

  /**
   * Preload specific pages. Only fetches pages not already cached or loading.
   */
  preload: (pageIndexes: number[]) => void;

  /**
   * Clear entire cache (call on file change).
   */
  clear: () => void;

  /**
   * Evict pages far from current position to free memory.
   * @param currentPage The current page index
   * @param protectedRange Number of pages around current to keep
   */
  evictDistant: (currentPage: number, protectedRange: number) => void;

  /**
   * Get URL for a page, preferring cached blob URL if available.
   */
  getUrl: (pageIndex: number) => string | undefined;

  /**
   * Get cache statistics for debugging.
   */
  getStats: () => { size: number; loaded: number; loading: number; errors: number };
}

const DEFAULT_MAX_SIZE = 20;

/**
 * Hook for managing a persistent image cache in the reader.
 */
export function useImageCache(
  pages: PageInfo[],
  options: Partial<UseImageCacheOptions> = {}
): UseImageCacheReturn {
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;

  // Use refs to persist cache across renders without causing re-renders
  const cacheRef = useRef<Map<number, CachedImage>>(new Map());
  const pendingRef = useRef<Map<number, Promise<HTMLImageElement>>>(new Map());
  const fileIdRef = useRef<string | null>(null);

  // Use refs for callbacks so we always call the latest version
  const onImageLoadedRef = useRef(options.onImageLoaded);
  const onImageErrorRef = useRef(options.onImageError);

  // Keep callback refs up to date
  useEffect(() => {
    onImageLoadedRef.current = options.onImageLoaded;
    onImageErrorRef.current = options.onImageError;
  }, [options.onImageLoaded, options.onImageError]);

  // Detect file change by checking if URLs changed
  const currentFileId = pages.length > 0 ? (pages[0]?.url.split('/')[4] ?? null) : null; // Extract fileId from URL

  // Clear cache on file change
  useEffect(() => {
    if (fileIdRef.current !== null && fileIdRef.current !== currentFileId) {
      // File changed, clear cache
      cacheRef.current.clear();
      pendingRef.current.clear();
    }
    fileIdRef.current = currentFileId;
  }, [currentFileId]);

  // Load a single image
  const loadImage = useCallback(
    (pageIndex: number, url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
          const cached: CachedImage = {
            url,
            image: img,
            timestamp: Date.now(),
            status: 'loaded',
            pageIndex,
          };
          cacheRef.current.set(pageIndex, cached);
          pendingRef.current.delete(pageIndex);
          // Use ref to always call latest callback
          onImageLoadedRef.current?.(pageIndex, img);
          resolve(img);
        };

        img.onerror = () => {
          const error = new Error(`Failed to load image for page ${pageIndex}`);
          const cached: CachedImage = {
            url,
            image: img,
            timestamp: Date.now(),
            status: 'error',
            pageIndex,
          };
          cacheRef.current.set(pageIndex, cached);
          pendingRef.current.delete(pageIndex);
          // Use ref to always call latest callback
          onImageErrorRef.current?.(pageIndex, error);
          reject(error);
        };

        // Mark as loading before starting
        const loadingEntry: CachedImage = {
          url,
          image: img,
          timestamp: Date.now(),
          status: 'loading',
          pageIndex,
        };
        cacheRef.current.set(pageIndex, loadingEntry);

        // Start loading
        img.src = url;
      });
    },
    [] // No dependencies - uses refs for everything
  );

  const getImage = useCallback((pageIndex: number): HTMLImageElement | undefined => {
    const cached = cacheRef.current.get(pageIndex);
    if (cached?.status === 'loaded') {
      // Update timestamp for LRU tracking
      cached.timestamp = Date.now();
      return cached.image;
    }
    return undefined;
  }, []);

  const isLoaded = useCallback((pageIndex: number): boolean => {
    return cacheRef.current.get(pageIndex)?.status === 'loaded';
  }, []);

  const isLoading = useCallback((pageIndex: number): boolean => {
    return cacheRef.current.get(pageIndex)?.status === 'loading';
  }, []);

  const hasError = useCallback((pageIndex: number): boolean => {
    return cacheRef.current.get(pageIndex)?.status === 'error';
  }, []);

  const preload = useCallback(
    (pageIndexes: number[]): void => {
      for (const pageIndex of pageIndexes) {
        // Skip if already cached or loading
        const cached = cacheRef.current.get(pageIndex);
        if (cached && (cached.status === 'loaded' || cached.status === 'loading')) {
          continue;
        }

        // Skip if already pending
        if (pendingRef.current.has(pageIndex)) {
          continue;
        }

        // Get the page info
        const page = pages[pageIndex];
        if (!page) continue;

        // Start loading
        const promise = loadImage(pageIndex, page.url);
        pendingRef.current.set(pageIndex, promise);

        // Don't await - let it load in background
        promise.catch(() => {
          // Error already handled in loadImage
        });
      }

      // Evict if over capacity
      if (cacheRef.current.size > maxSize) {
        evictOldest(maxSize);
      }
    },
    [pages, loadImage, maxSize]
  );

  const evictOldest = useCallback((targetSize: number): void => {
    const entries = Array.from(cacheRef.current.entries());

    // Sort by timestamp (oldest first), but keep loading entries
    entries.sort((a, b) => {
      // Never evict loading entries
      if (a[1].status === 'loading') return 1;
      if (b[1].status === 'loading') return -1;
      return a[1].timestamp - b[1].timestamp;
    });

    // Evict oldest until under target size
    let evicted = 0;
    const toEvict = cacheRef.current.size - targetSize;

    for (const [pageIndex, cached] of entries) {
      if (evicted >= toEvict) break;
      if (cached.status === 'loading') continue; // Never evict loading

      cacheRef.current.delete(pageIndex);
      evicted++;
    }
  }, []);

  const evictDistant = useCallback(
    (currentPage: number, protectedRange: number): void => {
      const entries = Array.from(cacheRef.current.entries());

      for (const [pageIndex, cached] of entries) {
        // Never evict loading entries
        if (cached.status === 'loading') continue;

        // Calculate distance from current page
        const distance = Math.abs(pageIndex - currentPage);

        // Evict if outside protected range
        if (distance > protectedRange) {
          cacheRef.current.delete(pageIndex);
        }
      }
    },
    []
  );

  const clear = useCallback((): void => {
    cacheRef.current.clear();
    pendingRef.current.clear();
  }, []);

  const getUrl = useCallback(
    (pageIndex: number): string | undefined => {
      // For now, just return the original URL
      // Could be enhanced to use blob URLs in the future
      return pages[pageIndex]?.url;
    },
    [pages]
  );

  const getStats = useCallback(() => {
    const entries = Array.from(cacheRef.current.values());
    return {
      size: entries.length,
      loaded: entries.filter((e) => e.status === 'loaded').length,
      loading: entries.filter((e) => e.status === 'loading').length,
      errors: entries.filter((e) => e.status === 'error').length,
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cacheRef.current.clear();
      pendingRef.current.clear();
    };
  }, []);

  return {
    getImage,
    isLoaded,
    isLoading,
    hasError,
    preload,
    clear,
    evictDistant,
    getUrl,
    getStats,
  };
}
