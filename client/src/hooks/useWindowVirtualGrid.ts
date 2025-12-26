/**
 * Window Virtual Grid Hook
 *
 * Virtualized grid that uses parent scroll instead of its own scroll container.
 * This allows the grid to be part of the normal page flow while still
 * only rendering visible items for performance.
 *
 * Key differences from useVirtualGrid:
 * - Finds and listens to the nearest scrollable ancestor
 * - Calculates visibility based on element position relative to scroll container
 * - Grid container has explicit height to maintain document flow
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

/**
 * Find the nearest scrollable ancestor of an element
 */
function getScrollParent(element: HTMLElement | null): HTMLElement | Window {
  if (!element) return window;

  let parent = element.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const overflowY = style.overflowY;
    const isScrollable = overflowY === 'auto' || overflowY === 'scroll';

    if (isScrollable && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }

  return window;
}

// =============================================================================
// Types
// =============================================================================

export interface WindowVirtualGridConfig {
  /** Fixed item width in pixels, OR use sliderValue for dynamic sizing */
  itemWidth?: number;
  /** Fixed item height in pixels, OR use sliderValue for dynamic sizing */
  itemHeight?: number;
  /** Slider value (1-10) for dynamic sizing that fills available width */
  sliderValue?: number;
  /** Aspect ratio for height calculation when using sliderValue (default 1.5) */
  aspectRatio?: number;
  /** Extra height for info area when using sliderValue (default 60) */
  infoHeight?: number;
  /** Minimum cover width when using sliderValue (default 80) */
  minCoverWidth?: number;
  /** Maximum cover width when using sliderValue (default 350) */
  maxCoverWidth?: number;
  /** Horizontal padding to subtract from container width (default 32) */
  horizontalPadding?: number;
  gap: number;
  overscan?: number; // Number of rows to render outside viewport
}

export interface WindowVirtualGridResult<T> {
  // Items to render (with position info)
  virtualItems: WindowVirtualItem<T>[];

  // Container dimensions
  totalHeight: number;
  totalWidth: number;

  // Reference to attach to grid container
  containerRef: React.RefObject<HTMLDivElement>;

  // Grid info
  columns: number;
  rows: number;

  // Scroll state for performance optimization
  isScrolling: boolean;
}

export interface WindowVirtualItem<T> {
  item: T;
  index: number;
  style: React.CSSProperties;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate optimal columns for a given container width to match target density.
 */
function calculateOptimalColumns(
  containerWidth: number,
  sliderValue: number,
  gap: number,
  minCoverWidth: number,
  maxCoverWidth: number
): number {
  if (containerWidth <= 0) return 1;

  const effectiveGap = Math.max(gap, 12);

  const minCols = 2;
  const maxCols = 14;
  const normalized = (sliderValue - 1) / 9;
  const targetCols = Math.round(minCols + normalized * (maxCols - minCols));

  const totalGaps = (targetCols - 1) * effectiveGap;
  const targetItemWidth = (containerWidth - totalGaps) / targetCols;

  if (targetItemWidth < minCoverWidth) {
    const maxPossibleCols = Math.floor((containerWidth + effectiveGap) / (minCoverWidth + effectiveGap));
    return Math.max(1, maxPossibleCols);
  }

  if (targetItemWidth > maxCoverWidth) {
    const minPossibleCols = Math.ceil((containerWidth + effectiveGap) / (maxCoverWidth + effectiveGap));
    return Math.max(minCols, minPossibleCols);
  }

  return targetCols;
}

// =============================================================================
// Hook
// =============================================================================

export function useWindowVirtualGrid<T>(
  items: T[],
  config: WindowVirtualGridConfig
): WindowVirtualGridResult<T> {
  const {
    itemWidth: fixedItemWidth,
    itemHeight: fixedItemHeight,
    sliderValue,
    aspectRatio = 1.5,
    infoHeight = 60,
    minCoverWidth = 80,
    maxCoverWidth = 350,
    horizontalPadding = 32,
    gap,
    overscan = 5,
  } = config;

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollParentRef = useRef<HTMLElement | Window | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Container dimensions
  const [containerWidth, setContainerWidth] = useState(0);

  // Visible range state
  const [visibleRange, setVisibleRange] = useState({ startRow: 0, endRow: 10 });

  // Scroll state for disabling effects
  const [isScrolling, setIsScrolling] = useState(false);

  // Enforce minimum gap
  const effectiveGap = Math.max(gap, 12);

  // Calculate columns and item dimensions
  const { columns, itemWidth, itemHeight, actualGap } = useMemo(() => {
    if (sliderValue !== undefined && containerWidth > 0) {
      const cols = calculateOptimalColumns(
        containerWidth,
        sliderValue,
        effectiveGap,
        minCoverWidth,
        maxCoverWidth
      );
      const totalGaps = (cols - 1) * effectiveGap;
      const width = Math.floor((containerWidth - totalGaps) / cols);
      const height = Math.round(width * aspectRatio) + infoHeight;

      return { columns: cols, itemWidth: width, itemHeight: height, actualGap: effectiveGap };
    }

    const width = fixedItemWidth ?? 160;
    const height = fixedItemHeight ?? Math.round(width * 1.5) + 60;

    if (containerWidth === 0) {
      return { columns: 1, itemWidth: width, itemHeight: height, actualGap: effectiveGap };
    }

    const availableWidth = containerWidth + effectiveGap;
    const cols = Math.max(1, Math.floor(availableWidth / (width + effectiveGap)));
    return { columns: cols, itemWidth: width, itemHeight: height, actualGap: effectiveGap };
  }, [containerWidth, sliderValue, fixedItemWidth, fixedItemHeight, effectiveGap, aspectRatio, infoHeight, minCoverWidth, maxCoverWidth]);

  // Calculate total rows
  const rows = Math.ceil(items.length / columns);

  // Calculate total grid dimensions
  const totalWidth = columns * (itemWidth + actualGap) - actualGap;
  const totalHeight = rows > 0 ? rows * (itemHeight + actualGap) - actualGap : 0;

  // Calculate visible range based on scroll parent position
  const calculateVisibleRange = useCallback(() => {
    const container = containerRef.current;
    const scrollParent = scrollParentRef.current;
    if (!container) return { startRow: 0, endRow: Math.min(10, rows - 1) };

    const rowHeight = itemHeight + actualGap;
    if (rowHeight <= 0) return { startRow: 0, endRow: Math.min(10, rows - 1) };

    // Get the viewport height (scroll parent's visible area)
    let viewportHeight: number;
    let containerOffsetTop: number;
    let scrollTop: number;

    if (scrollParent instanceof Window) {
      // Window scrolling
      const rect = container.getBoundingClientRect();
      viewportHeight = window.innerHeight;
      containerOffsetTop = rect.top + window.scrollY;
      scrollTop = window.scrollY;
    } else if (scrollParent) {
      // Element scrolling
      const containerRect = container.getBoundingClientRect();
      const parentRect = scrollParent.getBoundingClientRect();
      viewportHeight = scrollParent.clientHeight;
      // Container's position relative to scroll parent's content
      containerOffsetTop = containerRect.top - parentRect.top + scrollParent.scrollTop;
      scrollTop = scrollParent.scrollTop;
    } else {
      return { startRow: 0, endRow: Math.min(10, rows - 1) };
    }

    // Calculate which part of the container is visible
    const containerTop = containerOffsetTop;
    const containerBottom = containerTop + totalHeight;

    // Visible area within scroll parent
    const visibleTop = scrollTop;
    const visibleBottom = scrollTop + viewportHeight;

    // If container is completely below visible area
    if (containerTop > visibleBottom) {
      return { startRow: 0, endRow: Math.min(overscan, rows - 1) };
    }

    // If container is completely above visible area
    if (containerBottom < visibleTop) {
      const lastRow = rows - 1;
      return { startRow: Math.max(0, lastRow - overscan), endRow: lastRow };
    }

    // Calculate which rows are visible
    const scrolledIntoContainer = Math.max(0, visibleTop - containerTop);
    const startRow = Math.floor(scrolledIntoContainer / rowHeight);

    // Calculate how much of the container is visible
    const visibleStart = Math.max(containerTop, visibleTop);
    const visibleEnd = Math.min(containerBottom, visibleBottom);
    const visibleHeight = visibleEnd - visibleStart;
    const visibleRows = Math.ceil(visibleHeight / rowHeight) + 1;

    const startRowWithOverscan = Math.max(0, startRow - overscan);
    const endRowWithOverscan = Math.min(rows - 1, startRow + visibleRows + overscan);

    return { startRow: startRowWithOverscan, endRow: endRowWithOverscan };
  }, [rows, itemHeight, actualGap, overscan, totalHeight]);

  // Handle scroll with RAF throttling
  const handleScroll = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const newRange = calculateVisibleRange();

      setVisibleRange((prev) => {
        if (prev.startRow !== newRange.startRow || prev.endRow !== newRange.endRow) {
          return newRange;
        }
        return prev;
      });

      setIsScrolling(true);

      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
        scrollTimeoutRef.current = null;
      }, 100);

      rafIdRef.current = null;
    });
  }, [calculateVisibleRange]);

  // Create virtual items with positions
  const virtualItems = useMemo<WindowVirtualItem<T>[]>(() => {
    const result: WindowVirtualItem<T>[] = [];
    const startIndex = visibleRange.startRow * columns;
    const endIndex = Math.min(items.length - 1, (visibleRange.endRow + 1) * columns - 1);

    for (let i = startIndex; i <= endIndex; i++) {
      if (i >= items.length) break;

      const item = items[i]!;
      const row = Math.floor(i / columns);
      const col = i % columns;

      const x = col * (itemWidth + actualGap);
      const y = row * (itemHeight + actualGap);

      result.push({
        item,
        index: i,
        style: {
          position: 'absolute',
          width: itemWidth,
          height: itemHeight,
          transform: `translate3d(${x}px, ${y}px, 0)`,
        },
      });
    }

    return result;
  }, [items, visibleRange, columns, itemWidth, itemHeight, actualGap]);

  // Handle resize and scroll events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find the scrollable parent
    const scrollParent = getScrollParent(container);
    scrollParentRef.current = scrollParent;

    const updateDimensions = () => {
      const width = Math.max(0, container.clientWidth - horizontalPadding);
      setContainerWidth(width);

      // Recalculate visible range
      const newRange = calculateVisibleRange();
      setVisibleRange(newRange);
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    // Listen to scroll on the scroll parent
    const scrollTarget = scrollParent instanceof Window ? window : scrollParent;
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    // Also listen to resize for viewport changes
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      scrollTarget.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll, calculateVisibleRange, horizontalPadding]);

  // Recalculate on items change
  useEffect(() => {
    const newRange = calculateVisibleRange();
    setVisibleRange(newRange);
  }, [items.length, calculateVisibleRange]);

  return {
    virtualItems,
    totalHeight,
    totalWidth,
    containerRef,
    columns,
    rows,
    isScrolling,
  };
}
