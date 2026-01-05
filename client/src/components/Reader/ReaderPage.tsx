/**
 * Reader Page
 *
 * Displays the current page(s) based on reading mode.
 * Handles image loading, scaling, and preloading.
 */

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useReader } from './ReaderContext';
import { useNetworkAwarePreload } from './hooks/useNetworkAwarePreload';
import { useImageCache } from './hooks/useImageCache';

export function ReaderPage() {
  const {
    state,
    nextPage,
    prevPage,
    setPageDimensions,
    isLandscape,
    goToPage,
    setZoom,
    getPageRotation,
    detectWebtoonFormat,
  } = useReader();
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const isScrollingToPageRef = useRef(false);
  const scrollRAFRef = useRef<number | null>(null);
  // Local scroll-based page tracking for virtualization (doesn't trigger re-renders)
  const scrollCenterPageRef = useRef(0);

  // Network-aware preloading configuration
  const preloadConfig = useNetworkAwarePreload(state.preloadCount);

  // Callbacks for image cache - memoized to prevent unnecessary re-renders
  const handleCacheImageLoaded = useCallback((pageIndex: number) => {
    // Sync with loadedImages state for CSS classes
    setLoadedImages((prev) => new Set(prev).add(pageIndex));
    setImageErrors((prev) => {
      const next = new Set(prev);
      next.delete(pageIndex);
      return next;
    });
  }, []);

  const handleCacheImageError = useCallback((pageIndex: number) => {
    setImageErrors((prev) => new Set(prev).add(pageIndex));
  }, []);

  // Memoize cache options to prevent recreating on every render
  const cacheOptions = useMemo(
    () => ({
      maxSize: 20,
      onImageLoaded: handleCacheImageLoaded,
      onImageError: handleCacheImageError,
    }),
    [handleCacheImageLoaded, handleCacheImageError]
  );

  // Persistent image cache for preloading (20 pages default)
  const imageCache = useImageCache(state.pages, cacheOptions);

  // Drag state for scroll interaction
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Touch state for pinch-to-zoom
  const lastTouchDistanceRef = useRef<number | null>(null);
  const lastTouchCenterRef = useRef({ x: 0, y: 0 });

  // Get current page(s) to display based on mode
  const displayPages = useMemo(() => {
    const pages: number[] = [];
    const current = state.currentPage;

    if (state.mode === 'single') {
      pages.push(current);
    } else if (state.mode === 'double' || state.mode === 'doubleManga') {
      // In double mode, show current and next page
      // First page always shows alone (typically a cover)
      if (current === 0) {
        pages.push(0);
      } else if (isLandscape(current)) {
        // Landscape pages show alone (they're already spreads)
        pages.push(current);
      } else {
        // Show pairs: 1-2, 3-4, etc.
        // But skip landscape pages when pairing
        const pairStart = current % 2 === 0 ? current - 1 : current;

        // Check if the pair start is landscape
        if (isLandscape(pairStart)) {
          pages.push(pairStart);
        } else {
          pages.push(pairStart);
          const nextPage = pairStart + 1;
          // Only add second page if it exists and isn't landscape
          if (nextPage < state.totalPages && !isLandscape(nextPage)) {
            pages.push(nextPage);
          }
        }
      }

      // Reverse order for manga mode OR when RTL direction is set in double mode
      if ((state.mode === 'doubleManga' || (state.mode === 'double' && state.direction === 'rtl')) && pages.length === 2) {
        pages.reverse();
      }
    } else if (state.mode === 'continuous' || state.mode === 'webtoon') {
      // In continuous/webtoon mode, show all pages (virtualized)
      for (let i = 0; i < state.totalPages; i++) {
        pages.push(i);
      }
    }

    return pages;
  }, [state.currentPage, state.mode, state.totalPages, state.direction, isLandscape]);

  // Pages to preload - adjusted based on network conditions
  const preloadPages = useMemo(() => {
    const toPreload: number[] = [];

    // Use network-aware preload count
    const behindCount = preloadConfig.preloadBehind;
    const aheadCount = preloadConfig.preloadCount;

    const start = Math.max(0, state.currentPage - behindCount);
    const end = Math.min(state.totalPages - 1, state.currentPage + aheadCount);

    for (let i = start; i <= end; i++) {
      if (!displayPages.includes(i)) {
        toPreload.push(i);
      }
    }

    return toPreload;
  }, [state.currentPage, state.totalPages, displayPages, preloadConfig.preloadCount, preloadConfig.preloadBehind]);

  // Preload images using persistent cache
  // Unlike the old approach, this doesn't destroy images on navigation
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const startPreload = () => {
      // Combine display pages and preload pages for cache
      const allPagesToCache = [...new Set([...displayPages, ...preloadPages])];

      // Filter to only pages not already loaded in cache
      const pagesToPreload = allPagesToCache.filter(
        (idx) => !imageCache.isLoaded(idx) && !imageCache.isLoading(idx)
      );

      if (pagesToPreload.length > 0) {
        imageCache.preload(pagesToPreload);
      }
    };

    // Apply network-aware delay before preloading
    if (preloadConfig.preloadDelay > 0) {
      timeoutId = setTimeout(startPreload, preloadConfig.preloadDelay);
    } else {
      startPreload();
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // NOTE: We intentionally do NOT clear the cache on cleanup!
      // This is the key fix - images persist across navigation.
    };
  }, [displayPages, preloadPages, preloadConfig.preloadDelay, imageCache]);

  // Evict distant pages when navigating to keep memory bounded
  useEffect(() => {
    // Keep pages within preload range + some buffer
    const protectedRange = Math.max(preloadConfig.preloadCount, preloadConfig.preloadBehind) + 5;
    imageCache.evictDistant(state.currentPage, protectedRange);
  }, [state.currentPage, preloadConfig.preloadCount, preloadConfig.preloadBehind, imageCache]);

  // Handle image load - capture dimensions for landscape detection
  const handleImageLoad = useCallback(
    (pageIndex: number, event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      setPageDimensions(pageIndex, img.naturalWidth, img.naturalHeight);

      setLoadedImages((prev) => new Set(prev).add(pageIndex));
      setImageErrors((prev) => {
        const next = new Set(prev);
        next.delete(pageIndex);
        return next;
      });
    },
    [setPageDimensions]
  );

  // Auto-detect webtoon format after loading several pages
  useEffect(() => {
    // Once we have loaded at least 5 pages, check for webtoon format
    if (loadedImages.size >= 5 && !state.isAutoWebtoon) {
      detectWebtoonFormat();
    }
  }, [loadedImages.size, state.isAutoWebtoon, detectWebtoonFormat]);

  // Handle image error
  const handleImageError = (pageIndex: number) => {
    setImageErrors((prev) => new Set(prev).add(pageIndex));
  };

  // Check if a page should be split (landscape + splitting enabled + single mode)
  const shouldSplitPage = useCallback(
    (pageIndex: number) => {
      if (state.splitting === 'none') return false;
      if (state.mode !== 'single') return false; // Only split in single page mode
      return isLandscape(pageIndex);
    },
    [state.splitting, state.mode, isLandscape]
  );

  // Get the split half for current page based on splitView state
  // Returns null if page shouldn't be split, or the current half being viewed
  const getSplitHalf = useCallback(
    (pageIndex: number): 'left' | 'right' | null => {
      if (!shouldSplitPage(pageIndex)) return null;
      if (state.splitView === 'full') return null; // Show full image initially
      return state.splitView;
    },
    [shouldSplitPage, state.splitView]
  );

  // Get color correction filter CSS
  const getColorCorrectionFilter = (): string => {
    switch (state.colorCorrection) {
      case 'sepia-correct':
        // Remove yellow/sepia tint by shifting hue and reducing saturation slightly
        return 'hue-rotate(-15deg) saturate(0.85)';
      case 'contrast-boost':
        // Boost contrast for faded scans
        return 'contrast(1.3) saturate(1.1)';
      case 'desaturate':
        // Convert to grayscale
        return 'grayscale(1)';
      case 'invert':
        // Invert colors (useful for some art styles or reading at night)
        return 'invert(1) hue-rotate(180deg)';
      default:
        return '';
    }
  };

  // Get scaling styles with zoom applied
  const getImageStyle = (pageIndex: number, splitHalf?: 'left' | 'right' | null) => {
    const colorFilter = getColorCorrectionFilter();
    const rotation = getPageRotation(pageIndex);
    const zoom = state.zoom;
    const dims = state.pageDimensions.get(pageIndex);

    // Build transform string - only for rotation
    const transforms: string[] = [];
    if (rotation !== 0) {
      transforms.push(`rotate(${rotation}deg)`);
    }

    const style: React.CSSProperties = {
      transform: transforms.length > 0 ? transforms.join(' ') : undefined,
      transformOrigin: 'center center',
      filter: colorFilter || undefined,
    };

    // Apply split styles if showing half of a spread
    if (splitHalf === 'left') {
      style.objectFit = 'cover';
      style.objectPosition = 'left center';
      style.width = '200%'; // Double width so half fills the container
      style.maxWidth = '200%';
      style.clipPath = 'inset(0 50% 0 0)'; // Clip right half
    } else if (splitHalf === 'right') {
      style.objectFit = 'cover';
      style.objectPosition = 'right center';
      style.width = '200%';
      style.maxWidth = '200%';
      style.clipPath = 'inset(0 0 0 50%)'; // Clip left half
      style.marginLeft = '-100%'; // Shift to show right half
    }

    // For zoomed view, use explicit pixel dimensions based on image size
    // This enables native scrolling since the image has actual larger dimensions
    if (zoom !== 1 && dims && !splitHalf) {
      // Calculate the base size at zoom=1 based on scaling mode
      const containerRef = document.querySelector('.reader-page-container');
      const containerWidth = containerRef?.clientWidth || window.innerWidth;
      const containerHeight = containerRef?.clientHeight || window.innerHeight;

      let baseWidth: number;
      let baseHeight: number;

      switch (state.scaling) {
        case 'fitHeight':
          // Height fills container, width scales proportionally
          baseHeight = containerHeight;
          baseWidth = (dims.width / dims.height) * baseHeight;
          break;
        case 'fitWidth':
          // Width fills container, height scales proportionally
          baseWidth = containerWidth;
          baseHeight = (dims.height / dims.width) * baseWidth;
          break;
        case 'fitScreen':
          // Fit within container maintaining aspect ratio
          const scaleX = containerWidth / dims.width;
          const scaleY = containerHeight / dims.height;
          const scale = Math.min(scaleX, scaleY);
          baseWidth = dims.width * scale;
          baseHeight = dims.height * scale;
          break;
        case 'original':
          baseWidth = dims.width;
          baseHeight = dims.height;
          break;
        case 'custom':
          baseWidth = state.customWidth || dims.width;
          baseHeight = (dims.height / dims.width) * baseWidth;
          break;
        default:
          baseWidth = dims.width;
          baseHeight = dims.height;
      }

      // Apply zoom to get final dimensions
      style.width = `${baseWidth * zoom}px`;
      style.height = `${baseHeight * zoom}px`;
      style.maxWidth = 'none';
      style.maxHeight = 'none';

      return style;
    }

    // Apply base scaling (no zoom or dimensions not available)
    switch (state.scaling) {
      case 'fitHeight':
        style.height = '100%';
        if (!splitHalf) {
          style.width = 'auto';
          style.maxWidth = 'none';
        }
        break;
      case 'fitWidth':
        if (!splitHalf) {
          style.width = '100%';
          style.height = 'auto';
          style.maxHeight = 'none';
        }
        break;
      case 'fitScreen':
        if (!splitHalf) {
          style.maxWidth = '100%';
          style.maxHeight = '100%';
          style.objectFit = 'contain';
        }
        break;
      case 'original':
        // No constraints - use natural size
        break;
      case 'custom':
        if (state.customWidth) {
          style.width = `${state.customWidth}px`;
          style.height = 'auto';
        }
        break;
    }

    return style;
  };

  // Track whether the page change was triggered by user scrolling (vs programmatic navigation)
  const isUserScrollingRef = useRef(false);
  // Track last programmatic page change for debouncing
  const lastProgrammaticPageRef = useRef<number | null>(null);
  // Debounce timer for updating current page during scroll
  const pageUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle scroll for continuous/webtoon mode - tracks which page is visible
  // Uses RAF for smooth updates without blocking scroll
  const handleScroll = useCallback(() => {
    if (state.mode !== 'continuous' && state.mode !== 'webtoon') return;
    if (isScrollingToPageRef.current) return;

    // Cancel any pending RAF to avoid stacking
    if (scrollRAFRef.current) {
      cancelAnimationFrame(scrollRAFRef.current);
    }

    scrollRAFRef.current = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      // Use top 40% of viewport as the "current page" detection zone
      const detectionPoint = containerRect.top + containerRect.height * 0.4;

      let currentVisiblePage = 0;

      // Find the page that occupies the detection point
      pageRefsRef.current.forEach((element, pageIndex) => {
        const rect = element.getBoundingClientRect();
        if (rect.top <= detectionPoint && rect.bottom > detectionPoint) {
          currentVisiblePage = pageIndex;
        }
      });

      // Update scroll center ref immediately (for any scroll-dependent logic)
      scrollCenterPageRef.current = currentVisiblePage;

      // Debounce the actual page state update to avoid too many re-renders
      // This keeps the UI responsive while scrolling
      if (currentVisiblePage !== state.currentPage &&
          lastProgrammaticPageRef.current !== currentVisiblePage) {

        // Clear any pending update
        if (pageUpdateTimerRef.current) {
          clearTimeout(pageUpdateTimerRef.current);
        }

        // Debounce the state update - only update after scrolling settles
        pageUpdateTimerRef.current = setTimeout(() => {
          isUserScrollingRef.current = true;
          goToPage(currentVisiblePage);
          setTimeout(() => {
            isUserScrollingRef.current = false;
          }, 100);
        }, 150); // Wait 150ms after last scroll before updating state
      }
    });
  }, [state.mode, state.currentPage, goToPage]);

  // Cleanup RAF and timers on unmount
  useEffect(() => {
    return () => {
      if (scrollRAFRef.current) {
        cancelAnimationFrame(scrollRAFRef.current);
      }
      if (pageUpdateTimerRef.current) {
        clearTimeout(pageUpdateTimerRef.current);
      }
    };
  }, []);

  // Reset scroll to top when page changes in single/double mode while zoomed
  // This ensures the user starts at the top of each new page
  useEffect(() => {
    if (state.mode === 'continuous' || state.mode === 'webtoon') return;
    if (state.zoom <= 1) return;

    const container = containerRef.current;
    if (!container) return;

    // Scroll to top-left when navigating to a new page while zoomed
    container.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  }, [state.currentPage, state.mode, state.zoom]);

  // Scroll to page in continuous/webtoon mode when currentPage changes externally
  // (e.g., from thumbnail click, scrubber, keyboard shortcut - NOT from user scrolling)
  useEffect(() => {
    if (state.mode !== 'continuous' && state.mode !== 'webtoon') return;

    // Don't scroll if this page change was triggered by user scrolling
    if (isUserScrollingRef.current) return;

    const pageElement = pageRefsRef.current.get(state.currentPage);
    if (!pageElement) return;

    const container = containerRef.current;
    if (!container) return;

    // Mark this as a programmatic scroll to prevent feedback loop
    lastProgrammaticPageRef.current = state.currentPage;
    isScrollingToPageRef.current = true;

    // Scroll the page to the top of the container (more intuitive for reading)
    const containerRect = container.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    const scrollOffset = pageRect.top - containerRect.top + container.scrollTop;

    container.scrollTo({
      top: scrollOffset,
      behavior: 'smooth',
    });

    // Reset flags after scroll animation completes
    setTimeout(() => {
      isScrollingToPageRef.current = false;
      lastProgrammaticPageRef.current = null;
    }, 400);
  }, [state.currentPage, state.mode]);

  // Wheel handler for zoom and navigation
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Ctrl/Cmd + wheel = zoom
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;

        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const oldZoom = state.zoom;
        const newZoom = Math.max(0.25, Math.min(4, oldZoom + delta));

        if (newZoom === oldZoom) return;

        // Store current scroll position to adjust after zoom
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;
        const rect = container.getBoundingClientRect();

        // Calculate cursor position relative to viewport
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        // Calculate the point in the content that's under the cursor (in normalized 0-1 space)
        const contentWidth = container.scrollWidth;
        const contentHeight = container.scrollHeight;
        const normalizedX = (scrollLeft + cursorX) / contentWidth;
        const normalizedY = (scrollTop + cursorY) / contentHeight;

        setZoom(newZoom);

        // After zoom, adjust scroll to keep cursor position stable
        // Use requestAnimationFrame to let the DOM update first
        requestAnimationFrame(() => {
          const newContentWidth = container.scrollWidth;
          const newContentHeight = container.scrollHeight;
          const newContentX = normalizedX * newContentWidth;
          const newContentY = normalizedY * newContentHeight;
          container.scrollLeft = newContentX - cursorX;
          container.scrollTop = newContentY - cursorY;
        });
        return;
      }

      // In continuous/webtoon mode, let native scroll work
      if (state.mode === 'continuous' || state.mode === 'webtoon') return;

      // When zoomed, let native scroll handle panning
      if (state.zoom > 1) {
        return;
      }

      // Horizontal scroll for page navigation - always matches physical direction
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        if (e.deltaX > 30) {
          nextPage();
        } else if (e.deltaX < -30) {
          prevPage();
        }
      }
    },
    [state.zoom, state.mode, setZoom, nextPage, prevPage]
  );

  // Track scroll position for drag-to-scroll
  const scrollStartRef = useRef({ x: 0, y: 0 });

  // Mouse handlers for drag-to-scroll when zoomed
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (state.zoom <= 1) return;
      if (e.button !== 0) return; // Only left click

      const container = containerRef.current;
      if (!container) return;

      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      scrollStartRef.current = { x: container.scrollLeft, y: container.scrollTop };
      e.preventDefault();
    },
    [state.zoom]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;

      const container = containerRef.current;
      if (!container) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Scroll in opposite direction of drag (natural scrolling)
      container.scrollLeft = scrollStartRef.current.x - deltaX;
      container.scrollTop = scrollStartRef.current.y - deltaY;
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Global mouse up handler for drag release
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(false);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging]);

  // Touch handlers for pinch-to-zoom
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return null;
    const dx = touches[0]!.clientX - touches[1]!.clientX;
    const dy = touches[0]!.clientY - touches[1]!.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touches: React.TouchList) => {
    if (touches.length < 2) {
      return { x: touches[0]!.clientX, y: touches[0]!.clientY };
    }
    return {
      x: (touches[0]!.clientX + touches[1]!.clientX) / 2,
      y: (touches[0]!.clientY + touches[1]!.clientY) / 2,
    };
  };

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Start pinch gesture
        lastTouchDistanceRef.current = getTouchDistance(e.touches);
        lastTouchCenterRef.current = getTouchCenter(e.touches);
        e.preventDefault();
      } else if (e.touches.length === 1 && state.zoom > 1) {
        // Start scroll gesture
        const container = containerRef.current;
        if (!container) return;

        setIsDragging(true);
        dragStartRef.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
        scrollStartRef.current = { x: container.scrollLeft, y: container.scrollTop };
      }
    },
    [state.zoom]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && lastTouchDistanceRef.current !== null) {
        // Pinch zoom
        e.preventDefault();
        const newDistance = getTouchDistance(e.touches);
        if (newDistance !== null) {
          const scale = newDistance / lastTouchDistanceRef.current;
          const newZoom = Math.max(0.25, Math.min(4, state.zoom * scale));
          setZoom(newZoom);
          lastTouchDistanceRef.current = newDistance;
        }
      } else if (e.touches.length === 1 && isDragging) {
        // Scroll via touch
        const container = containerRef.current;
        if (!container) return;

        const deltaX = e.touches[0]!.clientX - dragStartRef.current.x;
        const deltaY = e.touches[0]!.clientY - dragStartRef.current.y;

        container.scrollLeft = scrollStartRef.current.x - deltaX;
        container.scrollTop = scrollStartRef.current.y - deltaY;
      }
    },
    [state.zoom, isDragging, setZoom]
  );

  const handleTouchEnd = useCallback(() => {
    lastTouchDistanceRef.current = null;
    setIsDragging(false);
  }, []);

  // Set page ref for continuous mode tracking
  const setPageRef = useCallback((index: number, element: HTMLDivElement | null) => {
    if (element) {
      pageRefsRef.current.set(index, element);
    } else {
      pageRefsRef.current.delete(index);
    }
  }, []);

  // Calculate virtualized window for continuous/webtoon mode (only render images within this range)
  // Larger buffer for webtoon mode ensures smooth scrolling without visible loading
  const WEBTOON_BUFFER = 10; // More pages for webtoon's seamless scroll
  const CONTINUOUS_BUFFER = 5; // Standard buffer for continuous mode
  const virtualizedRange = useMemo(() => {
    if (state.mode !== 'continuous' && state.mode !== 'webtoon') return { start: 0, end: 0 };
    const buffer = state.mode === 'webtoon' ? WEBTOON_BUFFER : CONTINUOUS_BUFFER;
    return {
      start: Math.max(0, state.currentPage - buffer),
      end: Math.min(state.totalPages - 1, state.currentPage + buffer),
    };
  }, [state.mode, state.currentPage, state.totalPages]);

  // Check if a page should be rendered (within virtualization window)
  const isPageInVirtualizedRange = useCallback(
    (index: number) => {
      return index >= virtualizedRange.start && index <= virtualizedRange.end;
    },
    [virtualizedRange]
  );

  // Render webtoon mode with smooth vertical scrolling
  // NO virtualization - uses native lazy loading for smooth scroll experience
  if (state.mode === 'webtoon') {
    return (
      <div
        ref={containerRef}
        className="reader-page-container reader-webtoon"
        onScroll={handleScroll}
        style={{
          '--webtoon-gap': `${state.webtoonGap}px`,
          '--webtoon-max-width': `${state.webtoonMaxWidth}px`,
        } as React.CSSProperties}
      >
        {state.pages.map((page, index) => (
          <div
            key={page.path}
            ref={(el) => setPageRef(index, el)}
            className={`reader-webtoon-page ${index === state.currentPage ? 'current' : ''}`}
            data-page-index={index}
          >
            {imageErrors.has(index) ? (
              <div className="reader-page-error">
                <p>Failed to load page {index + 1}</p>
              </div>
            ) : (
              <img
                src={page.url}
                alt={`Page ${index + 1}`}
                loading="lazy"
                decoding="async"
                className={`reader-page-image ${loadedImages.has(index) ? 'loaded' : 'loading'}`}
                style={getImageStyle(index)}
                onLoad={(e) => handleImageLoad(index, e)}
                onError={() => handleImageError(index)}
                draggable={false}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  // Render continuous mode with virtualization
  if (state.mode === 'continuous') {
    return (
      <div
        ref={containerRef}
        className="reader-page-container reader-continuous"
        onScroll={handleScroll}
      >
        {state.pages.map((page, index) => {
          const isInRange = isPageInVirtualizedRange(index);

          return (
            <div
              key={page.path}
              ref={(el) => setPageRef(index, el)}
              className={`reader-page-wrapper ${state.showPageShadow ? 'with-shadow' : ''} ${index === state.currentPage ? 'current' : ''}`}
              data-page-index={index}
            >
              {isInRange ? (
                <>
                  {!loadedImages.has(index) && !imageErrors.has(index) && (
                    <div className="reader-page-loading">
                      <div className="reader-loading-spinner small" />
                    </div>
                  )}
                  {imageErrors.has(index) ? (
                    <div className="reader-page-error">
                      <p>Failed to load page {index + 1}</p>
                    </div>
                  ) : (
                    <img
                      src={page.url}
                      alt={`Page ${index + 1}`}
                      className={`reader-page-image ${loadedImages.has(index) ? 'loaded' : 'loading'}`}
                      style={getImageStyle(index)}
                      onLoad={(e) => handleImageLoad(index, e)}
                      onError={() => handleImageError(index)}
                      draggable={false}
                    />
                  )}
                </>
              ) : (
                <div className="reader-page-placeholder" aria-hidden="true">
                  <span className="page-placeholder-number">{index + 1}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Render single/double page mode
  const pageContent = displayPages.map((pageIndex) => {
    const page = state.pages[pageIndex];
    if (!page) return null;

    const splitHalf = getSplitHalf(pageIndex);

    // Determine spine shadow class for split view
    const spineClass = splitHalf && state.showPageShadow
      ? `with-spine ${splitHalf === 'left' ? 'split-left-view' : 'split-right-view'}`
      : '';

    return (
      <div
        key={page.path}
        className={`reader-page-wrapper ${state.showPageShadow ? 'with-shadow' : ''} ${splitHalf ? 'split-view' : ''} ${spineClass}`}
      >
        {!loadedImages.has(pageIndex) && !imageErrors.has(pageIndex) && (
          <div className="reader-page-loading">
            <div className="reader-loading-spinner small" />
          </div>
        )}
        {imageErrors.has(pageIndex) ? (
          <div className="reader-page-error">
            <p>Failed to load page {pageIndex + 1}</p>
          </div>
        ) : (
          <img
            src={page.url}
            alt={`Page ${pageIndex + 1}${splitHalf ? ` (${splitHalf} half)` : ''}`}
            className={`reader-page-image ${loadedImages.has(pageIndex) ? 'loaded' : 'loading'} ${splitHalf ? `split-${splitHalf}` : ''}`}
            style={getImageStyle(pageIndex, splitHalf)}
            onLoad={(e) => handleImageLoad(pageIndex, e)}
            onError={() => handleImageError(pageIndex)}
            draggable={false}
          />
        )}
      </div>
    );
  });

  return (
    <div
      ref={containerRef}
      className={`reader-page-container ${state.mode === 'double' || state.mode === 'doubleManga' ? 'reader-double' : 'reader-single'} ${isDragging ? 'dragging' : ''} ${state.zoom !== 1 ? 'zoomed' : ''}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pageContent}
    </div>
  );
}
