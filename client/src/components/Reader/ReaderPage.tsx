/**
 * Reader Page
 *
 * Displays the current page(s) based on reading mode.
 * Handles image loading, scaling, and preloading.
 */

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useReader } from './ReaderContext';
import { useNetworkAwarePreload } from './hooks/useNetworkAwarePreload';

export function ReaderPage() {
  const {
    state,
    nextPage,
    prevPage,
    setPageDimensions,
    isLandscape,
    goToPage,
    setZoom,
    setPan,
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

  // Pan state for drag interaction
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

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

      // Reverse order for manga mode
      if (state.mode === 'doubleManga' && pages.length === 2) {
        pages.reverse();
      }
    } else if (state.mode === 'continuous' || state.mode === 'webtoon') {
      // In continuous/webtoon mode, show all pages (virtualized)
      for (let i = 0; i < state.totalPages; i++) {
        pages.push(i);
      }
    }

    return pages;
  }, [state.currentPage, state.mode, state.totalPages, isLandscape]);

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

  // Preload images with network-aware delay
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const startPreload = () => {
      preloadPages.forEach((pageIndex) => {
        const page = state.pages[pageIndex];
        if (!page) return;

        const img = new Image();
        img.src = page.url;
        images.push(img);
      });
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
      images.forEach((img) => {
        img.src = '';
      });
    };
  }, [preloadPages, state.pages, preloadConfig.preloadDelay]);

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

  // Get scaling styles
  const getImageStyle = (pageIndex: number, splitHalf?: 'left' | 'right' | null) => {
    const colorFilter = getColorCorrectionFilter();
    const rotation = getPageRotation(pageIndex);

    // Build transform string
    const transforms: string[] = [];
    transforms.push(`scale(${state.zoom})`);
    transforms.push(`translate(${state.panOffset.x}px, ${state.panOffset.y}px)`);
    if (rotation !== 0) {
      transforms.push(`rotate(${rotation}deg)`);
    }

    const style: React.CSSProperties = {
      transform: transforms.join(' '),
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
        // No constraints
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

        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        const newZoom = Math.max(0.25, Math.min(4, state.zoom + delta));

        // Calculate cursor position relative to container center
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left - rect.width / 2;
        const cursorY = e.clientY - rect.top - rect.height / 2;

        // Adjust pan to zoom toward cursor position
        const zoomRatio = newZoom / state.zoom;
        const newPanX = state.panOffset.x - (cursorX / state.zoom) * (zoomRatio - 1);
        const newPanY = state.panOffset.y - (cursorY / state.zoom) * (zoomRatio - 1);

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
        return;
      }

      // In continuous/webtoon mode, let native scroll work
      if (state.mode === 'continuous' || state.mode === 'webtoon') return;

      // When zoomed, allow panning via scroll
      if (state.zoom !== 1) {
        // Allow native scroll behavior for panning
        return;
      }

      // Horizontal scroll for page navigation
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        if (e.deltaX > 30) {
          if (state.direction === 'rtl') prevPage();
          else nextPage();
        } else if (e.deltaX < -30) {
          if (state.direction === 'rtl') nextPage();
          else prevPage();
        }
      }
    },
    [state.zoom, state.mode, state.direction, state.panOffset, setZoom, setPan, nextPage, prevPage]
  );

  // Mouse handlers for drag panning when zoomed
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (state.zoom <= 1) return;
      if (e.button !== 0) return; // Only left click

      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...state.panOffset };
      e.preventDefault();
    },
    [state.zoom, state.panOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;

      const deltaX = (e.clientX - dragStartRef.current.x) / state.zoom;
      const deltaY = (e.clientY - dragStartRef.current.y) / state.zoom;

      setPan({
        x: panStartRef.current.x + deltaX,
        y: panStartRef.current.y + deltaY,
      });
    },
    [isDragging, state.zoom, setPan]
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
        // Start pan gesture
        setIsDragging(true);
        dragStartRef.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
        panStartRef.current = { ...state.panOffset };
      }
    },
    [state.zoom, state.panOffset]
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
        // Pan
        const deltaX = (e.touches[0]!.clientX - dragStartRef.current.x) / state.zoom;
        const deltaY = (e.touches[0]!.clientY - dragStartRef.current.y) / state.zoom;
        setPan({
          x: panStartRef.current.x + deltaX,
          y: panStartRef.current.y + deltaY,
        });
      }
    },
    [state.zoom, isDragging, setZoom, setPan]
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
  return (
    <div
      ref={containerRef}
      className={`reader-page-container ${state.mode === 'double' || state.mode === 'doubleManga' ? 'reader-double' : 'reader-single'} ${isDragging ? 'dragging' : ''} ${state.zoom > 1 ? 'zoomed' : ''}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {displayPages.map((pageIndex) => {
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
      })}
    </div>
  );
}
