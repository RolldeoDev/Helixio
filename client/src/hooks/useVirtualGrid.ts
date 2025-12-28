/**
 * Virtual Grid Hook - Performance Optimized for Chrome
 *
 * Efficiently renders large grids by only rendering items visible in viewport.
 *
 * Chrome-specific optimizations:
 * - RAF-throttled scroll handling (no re-render on every scroll event)
 * - CSS transforms for GPU-accelerated positioning
 * - Minimal state updates (only when visible range changes)
 * - Scroll velocity detection to pause loading during fast scroll
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface VirtualGridConfig {
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

export interface VirtualGridResult<T> {
  // Items to render (with position info)
  virtualItems: VirtualItem<T>[];

  // Container dimensions
  totalHeight: number;
  totalWidth: number;

  // Scroll handling
  containerRef: React.RefObject<HTMLDivElement>;
  scrollTo: (index: number) => void;

  // Grid info
  columns: number;
  rows: number;
  visibleRange: { start: number; end: number };

  // Scroll state for performance optimization
  isScrolling: boolean;
}

export interface VirtualItem<T> {
  item: T;
  index: number;
  style: React.CSSProperties;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Calculate optimal columns for a given container width to match target density.
 * Ensures gaps are always respected and covers have meaningful size differences.
 */
function calculateOptimalColumns(
  containerWidth: number,
  sliderValue: number,
  gap: number,
  minCoverWidth: number,
  maxCoverWidth: number
): number {
  if (containerWidth <= 0) return 1;

  // Ensure minimum gap is always 12px
  const effectiveGap = Math.max(gap, 12);

  // Map slider value to target columns with more dramatic range
  // slider 1 -> 2 columns (very large)
  // slider 3 -> 4 columns
  // slider 5 -> 6 columns (medium)
  // slider 7 -> 9 columns
  // slider 10 -> 14 columns (small)
  const minCols = 2;
  const maxCols = 14;
  const normalized = (sliderValue - 1) / 9; // 0 to 1
  // More linear progression for consistent ~15% size change per step
  const targetCols = Math.round(minCols + normalized * (maxCols - minCols));

  // Calculate what width we'd get with target columns (accounting for gaps)
  const totalGaps = (targetCols - 1) * effectiveGap;
  const targetItemWidth = (containerWidth - totalGaps) / targetCols;

  // Ensure we respect minimum and maximum bounds
  if (targetItemWidth < minCoverWidth) {
    // Too many columns - calculate max that fits while respecting min width
    const maxPossibleCols = Math.floor((containerWidth + effectiveGap) / (minCoverWidth + effectiveGap));
    return Math.max(1, maxPossibleCols);
  }

  if (targetItemWidth > maxCoverWidth) {
    // Too few columns - calculate min needed to respect max width
    const minPossibleCols = Math.ceil((containerWidth + effectiveGap) / (maxCoverWidth + effectiveGap));
    return Math.max(minCols, minPossibleCols);
  }

  return targetCols;
}

export function useVirtualGrid<T>(
  items: T[],
  config: VirtualGridConfig
): VirtualGridResult<T> {
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
    overscan = 5, // Increased for smoother fast scrolling
  } = config;

  const containerRef = useRef<HTMLDivElement>(null);

  // Use refs for scroll position to avoid re-renders on every scroll
  const scrollTopRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Container dimensions - only update on resize
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Visible range state - only update when range actually changes
  const [visibleRange, setVisibleRange] = useState({ startRow: 0, endRow: 0 });

  // Scroll state for disabling effects
  const [isScrolling, setIsScrolling] = useState(false);

  // Enforce minimum gap of 12px
  const effectiveGap = Math.max(gap, 12);

  // Calculate columns and item dimensions based on config mode
  const { columns, itemWidth, itemHeight, actualGap } = useMemo(() => {
    // Dynamic sizing mode: use sliderValue to calculate optimal sizing
    if (sliderValue !== undefined && containerWidth > 0) {
      const cols = calculateOptimalColumns(
        containerWidth,
        sliderValue,
        effectiveGap,
        minCoverWidth,
        maxCoverWidth
      );
      // Calculate item width to fill container exactly (minus gaps)
      const totalGaps = (cols - 1) * effectiveGap;
      const width = Math.floor((containerWidth - totalGaps) / cols);
      const height = Math.round(width * aspectRatio) + infoHeight;

      return { columns: cols, itemWidth: width, itemHeight: height, actualGap: effectiveGap };
    }

    // Fixed sizing mode: use provided dimensions
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

  // Calculate total grid dimensions (using actualGap for proper spacing)
  const totalWidth = columns * (itemWidth + actualGap) - actualGap;
  const totalHeight = rows * (itemHeight + actualGap) - actualGap;

  // Calculate visible range from scroll position
  const calculateVisibleRange = useCallback((scrollTop: number) => {
    const rowHeight = itemHeight + actualGap;
    const startRow = Math.floor(scrollTop / rowHeight);
    const visibleRows = Math.ceil(containerHeight / rowHeight);

    const startRowWithOverscan = Math.max(0, startRow - overscan);
    const endRowWithOverscan = Math.min(rows - 1, startRow + visibleRows + overscan);

    return { startRow: startRowWithOverscan, endRow: endRowWithOverscan };
  }, [containerHeight, itemHeight, actualGap, rows, overscan]);

  // Handle scroll with RAF throttling
  const handleScroll = useCallback(() => {
    // Cancel any pending RAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      scrollTopRef.current = scrollTop;

      // Calculate new visible range
      const newRange = calculateVisibleRange(scrollTop);

      // Only update state if range actually changed
      setVisibleRange((prev) => {
        if (prev.startRow !== newRange.startRow || prev.endRow !== newRange.endRow) {
          return newRange;
        }
        return prev;
      });

      // Set scrolling state
      setIsScrolling(true);

      // Clear existing scroll end timeout
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Set scroll end timeout (shorter = more responsive, longer = less jittery)
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
        scrollTimeoutRef.current = null;
      }, 100);

      rafIdRef.current = null;
    });
  }, [calculateVisibleRange]);

  // Create virtual items with positions - uses CSS transforms for GPU acceleration
  const virtualItems = useMemo<VirtualItem<T>[]>(() => {
    const result: VirtualItem<T>[] = [];
    const startIndex = visibleRange.startRow * columns;
    const endIndex = Math.min(items.length - 1, (visibleRange.endRow + 1) * columns - 1);

    for (let i = startIndex; i <= endIndex; i++) {
      if (i >= items.length) break;

      const item = items[i]!;
      const row = Math.floor(i / columns);
      const col = i % columns;

      // Use actualGap for proper spacing between items
      const x = col * (itemWidth + actualGap);
      const y = row * (itemHeight + actualGap);

      result.push({
        item,
        index: i,
        style: {
          position: 'absolute',
          width: itemWidth,
          height: itemHeight,
          // Use transform instead of top/left for GPU acceleration
          transform: `translate3d(${x}px, ${y}px, 0)`,
        },
      });
    }

    return result;
  }, [items, visibleRange, columns, itemWidth, itemHeight, actualGap]);

  // Handle resize events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      // Subtract horizontal padding for actual usable width
      const width = Math.max(0, container.clientWidth - horizontalPadding);
      const height = container.clientHeight;

      setContainerWidth(width);
      setContainerHeight(height);

      // Calculate visible range directly using measured height
      // This avoids stale closure issues with calculateVisibleRange callback
      if (height > 0) {
        const rowHeight = itemHeight + actualGap;
        const scrollTop = scrollTopRef.current;
        const startRow = Math.floor(scrollTop / rowHeight);
        const visibleRows = Math.ceil(height / rowHeight);
        const startRowWithOverscan = Math.max(0, startRow - overscan);
        const endRowWithOverscan = Math.min(rows - 1, startRow + visibleRows + overscan);

        setVisibleRange({ startRow: startRowWithOverscan, endRow: endRowWithOverscan });
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    // Use passive listener for better scroll performance
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('scroll', handleScroll);

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll, horizontalPadding, itemHeight, actualGap, rows, overscan]);

  // Scroll to a specific item index
  const scrollTo = useCallback((index: number) => {
    if (!containerRef.current) return;

    const row = Math.floor(index / columns);
    const top = row * (itemHeight + actualGap);

    containerRef.current.scrollTo({
      top,
      behavior: 'smooth',
    });
  }, [columns, itemHeight, actualGap]);

  return {
    virtualItems,
    totalHeight,
    totalWidth,
    containerRef,
    scrollTo,
    columns,
    rows,
    visibleRange: {
      start: visibleRange.startRow * columns,
      end: Math.min(items.length - 1, (visibleRange.endRow + 1) * columns - 1),
    },
    isScrolling,
  };
}

// =============================================================================
// Virtual List Hook (for list view)
// =============================================================================

export interface VirtualListConfig {
  itemHeight: number;
  overscan?: number;
}

export interface VirtualListResult<T> {
  virtualItems: VirtualItem<T>[];
  totalHeight: number;
  containerRef: React.RefObject<HTMLDivElement>;
  scrollTo: (index: number) => void;
  visibleRange: { start: number; end: number };
  isScrolling: boolean;
}

export function useVirtualList<T>(
  items: T[],
  config: VirtualListConfig
): VirtualListResult<T> {
  const { itemHeight, overscan = 5 } = config;

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [containerHeight, setContainerHeight] = useState(0);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [isScrolling, setIsScrolling] = useState(false);

  const totalHeight = items.length * itemHeight;

  // Calculate visible range from scroll position
  const calculateVisibleRange = useCallback((scrollTop: number) => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);

    const startWithOverscan = Math.max(0, startIndex - overscan);
    const endWithOverscan = Math.min(items.length - 1, startIndex + visibleCount + overscan);

    return { start: startWithOverscan, end: endWithOverscan };
  }, [containerHeight, itemHeight, overscan, items.length]);

  // Handle scroll with RAF throttling
  const handleScroll = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      scrollTopRef.current = scrollTop;

      const newRange = calculateVisibleRange(scrollTop);

      setVisibleRange((prev) => {
        if (prev.start !== newRange.start || prev.end !== newRange.end) {
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

  // Create virtual items
  const virtualItems = useMemo<VirtualItem<T>[]>(() => {
    const result: VirtualItem<T>[] = [];

    for (let i = visibleRange.start; i <= visibleRange.end; i++) {
      if (i >= items.length) break;

      result.push({
        item: items[i]!,
        index: i,
        style: {
          position: 'absolute',
          left: 0,
          right: 0,
          height: itemHeight,
          transform: `translate3d(0, ${i * itemHeight}px, 0)`,
        },
      });
    }

    return result;
  }, [items, visibleRange, itemHeight]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      const height = container.clientHeight;
      setContainerHeight(height);

      const newRange = calculateVisibleRange(scrollTopRef.current);
      setVisibleRange(newRange);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('scroll', handleScroll);

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll, calculateVisibleRange]);

  // Scroll to index
  const scrollTo = useCallback((index: number) => {
    if (!containerRef.current) return;

    containerRef.current.scrollTo({
      top: index * itemHeight,
      behavior: 'smooth',
    });
  }, [itemHeight]);

  return {
    virtualItems,
    totalHeight,
    containerRef,
    scrollTo,
    visibleRange,
    isScrolling,
  };
}
