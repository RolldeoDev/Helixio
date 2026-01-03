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
 *
 * Architecture:
 * - Layout calculation is memoized and only depends on container width + config
 * - Visible range is calculated synchronously during resize/scroll
 * - No circular dependencies between effects
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
  /** Left padding offset for item positioning (default 0) */
  paddingLeft?: number;
  /** Top padding offset for item positioning (default 0) */
  paddingTop?: number;
  gap: number;
  overscan?: number; // Number of rows to render outside viewport
}

export interface VirtualGridResult<T> {
  // Items to render (with position info)
  virtualItems: VirtualItem<T>[];

  // Container dimensions
  totalHeight: number;
  totalWidth: number;

  // Scroll handling - callback ref for proper portal/modal support
  containerRef: (node: HTMLDivElement | null) => void;
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
// Layout Calculation (Pure Function)
// =============================================================================

interface GridLayout {
  columns: number;
  itemWidth: number;
  itemHeight: number;
  gap: number;
}

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

/**
 * Calculate grid layout from container width and config.
 * Pure function - no side effects.
 */
function calculateGridLayout(
  containerWidth: number,
  config: {
    fixedItemWidth?: number;
    fixedItemHeight?: number;
    sliderValue?: number;
    aspectRatio: number;
    infoHeight: number;
    minCoverWidth: number;
    maxCoverWidth: number;
    gap: number;
  }
): GridLayout {
  const effectiveGap = Math.max(config.gap, 12);

  // Dynamic sizing mode: use sliderValue to calculate optimal sizing
  if (config.sliderValue !== undefined && containerWidth > 0) {
    const cols = calculateOptimalColumns(
      containerWidth,
      config.sliderValue,
      effectiveGap,
      config.minCoverWidth,
      config.maxCoverWidth
    );
    // Calculate item width to fill container exactly (minus gaps)
    const totalGaps = (cols - 1) * effectiveGap;
    const width = Math.floor((containerWidth - totalGaps) / cols);
    const height = Math.round(width * config.aspectRatio) + config.infoHeight;

    return { columns: cols, itemWidth: width, itemHeight: height, gap: effectiveGap };
  }

  // Fixed sizing mode: use provided dimensions
  const width = config.fixedItemWidth ?? 160;
  const height = config.fixedItemHeight ?? Math.round(width * 1.5) + 60;

  if (containerWidth <= 0) {
    return { columns: 1, itemWidth: width, itemHeight: height, gap: effectiveGap };
  }

  const availableWidth = containerWidth + effectiveGap;
  const cols = Math.max(1, Math.floor(availableWidth / (width + effectiveGap)));
  return { columns: cols, itemWidth: width, itemHeight: height, gap: effectiveGap };
}

/**
 * Calculate visible row range based on scroll position and container height.
 * Pure function - no side effects.
 */
function calculateVisibleRows(
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  gap: number,
  totalRows: number,
  overscan: number,
  paddingTop: number
): { startRow: number; endRow: number } {
  if (containerHeight <= 0 || totalRows <= 0) {
    return { startRow: 0, endRow: 0 };
  }

  const rowHeight = itemHeight + gap;
  const adjustedScrollTop = Math.max(0, scrollTop - paddingTop);
  const startRow = Math.floor(adjustedScrollTop / rowHeight);
  const visibleRows = Math.ceil(containerHeight / rowHeight);

  const startRowWithOverscan = Math.max(0, startRow - overscan);
  const endRowWithOverscan = Math.min(totalRows - 1, startRow + visibleRows + overscan);

  return { startRow: startRowWithOverscan, endRow: endRowWithOverscan };
}

// =============================================================================
// Hook
// =============================================================================

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
    paddingLeft = 0,
    paddingTop = 0,
    gap,
    overscan = 5,
  } = config;

  // MutableRefObject is needed because we assign to .current in the callback ref
  const containerRef = useRef<HTMLDivElement | null>(null) as React.MutableRefObject<HTMLDivElement | null>;

  // Use refs for values that shouldn't trigger re-renders
  const scrollTopRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measureRetryRef = useRef<number | null>(null);
  const lastMeasuredWidthRef = useRef(0);
  const lastMeasuredHeightRef = useRef(0);

  // Track when container node changes (for callback ref pattern)
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);

  // Callback ref that updates both the ref and state when node changes
  // This ensures the effect re-runs when the container becomes available
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainerNode(node);
  }, []);

  // Container width state - triggers layout recalculation
  const [containerWidth, setContainerWidth] = useState(0);

  // Visible range state - calculated from scroll position
  const [visibleRange, setVisibleRange] = useState({ startRow: 0, endRow: 0 });

  // Scroll state for UI effects
  const [isScrolling, setIsScrolling] = useState(false);

  // Memoize layout config to prevent recalculation
  const layoutConfig = useMemo(
    () => ({
      fixedItemWidth,
      fixedItemHeight,
      sliderValue,
      aspectRatio,
      infoHeight,
      minCoverWidth,
      maxCoverWidth,
      gap,
    }),
    [fixedItemWidth, fixedItemHeight, sliderValue, aspectRatio, infoHeight, minCoverWidth, maxCoverWidth, gap]
  );

  // Calculate layout based on container width - memoized
  const layout = useMemo(
    () => calculateGridLayout(containerWidth, layoutConfig),
    [containerWidth, layoutConfig]
  );

  const { columns, itemWidth, itemHeight, gap: actualGap } = layout;

  // Calculate derived values
  const rows = items.length > 0 ? Math.ceil(items.length / columns) : 0;
  const totalWidth = paddingLeft + columns * (itemWidth + actualGap) - actualGap;
  const totalHeight = rows > 0 ? paddingTop + rows * (itemHeight + actualGap) - actualGap : 0;

  // Update visible range based on current measurements
  const updateVisibleRange = useCallback(
    (scrollTop: number, height: number) => {
      const newRange = calculateVisibleRows(
        scrollTop,
        height,
        itemHeight,
        actualGap,
        rows,
        overscan,
        paddingTop
      );

      setVisibleRange((prev) => {
        if (prev.startRow !== newRange.startRow || prev.endRow !== newRange.endRow) {
          return newRange;
        }
        return prev;
      });
    },
    [itemHeight, actualGap, rows, overscan, paddingTop]
  );

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

      updateVisibleRange(scrollTop, container.clientHeight);

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
  }, [updateVisibleRange]);

  // Create virtual items with positions - uses CSS transforms for GPU acceleration
  const virtualItems = useMemo<VirtualItem<T>[]>(() => {
    if (items.length === 0 || columns === 0) {
      return [];
    }

    const result: VirtualItem<T>[] = [];
    const startIndex = visibleRange.startRow * columns;
    const endIndex = Math.min(items.length - 1, (visibleRange.endRow + 1) * columns - 1);

    for (let i = startIndex; i <= endIndex; i++) {
      if (i >= items.length) break;

      const item = items[i]!;
      const row = Math.floor(i / columns);
      const col = i % columns;

      const x = paddingLeft + col * (itemWidth + actualGap);
      const y = paddingTop + row * (itemHeight + actualGap);

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
  }, [items, visibleRange, columns, itemWidth, itemHeight, actualGap, paddingLeft, paddingTop]);

  // Core measurement function - updates state when dimensions change
  // This is extracted so it can be called from multiple places (RAF retry, ResizeObserver)
  const performMeasurement = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return false;
    }

    const rawWidth = container.clientWidth;
    const rawHeight = container.clientHeight;
    const width = Math.max(0, rawWidth - horizontalPadding);
    const height = rawHeight;

    const hasValidDimensions = width > 0 && height > 0;
    const dimensionsChanged = width !== lastMeasuredWidthRef.current || height !== lastMeasuredHeightRef.current;

    if (dimensionsChanged) {
      lastMeasuredWidthRef.current = width;
      lastMeasuredHeightRef.current = height;
      setContainerWidth(width);

      if (hasValidDimensions && items.length > 0) {
        const scrollTop = container.scrollTop;
        scrollTopRef.current = scrollTop;

        const newLayout = calculateGridLayout(width, layoutConfig);
        const newRows = Math.ceil(items.length / newLayout.columns);

        if (newRows > 0) {
          const newRange = calculateVisibleRows(
            scrollTop,
            height,
            newLayout.itemHeight,
            newLayout.gap,
            newRows,
            overscan,
            paddingTop
          );

          setVisibleRange((prev) => {
            if (prev.startRow !== newRange.startRow || prev.endRow !== newRange.endRow) {
              return newRange;
            }
            return prev;
          });
        }
      }
    }

    return hasValidDimensions;
  }, [horizontalPadding, layoutConfig, items.length, overscan, paddingTop]);

  // Effect for container measurement with portal/modal support
  // Uses RAF polling to wait for browser to resolve flex layout
  // NOTE: Depends on containerNode (from callback ref) so it re-runs when container becomes available
  useEffect(() => {
    const container = containerNode;
    if (!container) return;

    let retryCount = 0;
    const maxRetries = 20;

    const measureWithRetry = () => {
      const hasValidDimensions = performMeasurement();
      if (!hasValidDimensions && retryCount < maxRetries) {
        retryCount++;
        measureRetryRef.current = requestAnimationFrame(measureWithRetry);
      } else {
        measureRetryRef.current = null;
      }
    };

    measureRetryRef.current = requestAnimationFrame(measureWithRetry);

    const resizeObserver = new ResizeObserver(() => {
      if (measureRetryRef.current !== null) {
        cancelAnimationFrame(measureRetryRef.current);
        measureRetryRef.current = null;
      }
      performMeasurement();
    });
    resizeObserver.observe(container);

    // Scroll listener
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('scroll', handleScroll);

      if (measureRetryRef.current !== null) {
        cancelAnimationFrame(measureRetryRef.current);
        measureRetryRef.current = null;
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [containerNode, performMeasurement, handleScroll]);

  // Scroll to a specific item index
  const scrollTo = useCallback(
    (index: number) => {
      if (!containerRef.current) return;

      const row = Math.floor(index / columns);
      const top = paddingTop + row * (itemHeight + actualGap);

      containerRef.current.scrollTo({
        top,
        behavior: 'smooth',
      });
    },
    [columns, itemHeight, actualGap, paddingTop]
  );

  return {
    virtualItems,
    totalHeight,
    totalWidth,
    containerRef: setContainerRef,
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
  const calculateVisibleRange = useCallback(
    (scrollTop: number, height: number) => {
      if (height <= 0) return { start: 0, end: 0 };

      const startIndex = Math.floor(scrollTop / itemHeight);
      const visibleCount = Math.ceil(height / itemHeight);

      const startWithOverscan = Math.max(0, startIndex - overscan);
      const endWithOverscan = Math.min(items.length - 1, startIndex + visibleCount + overscan);

      return { start: startWithOverscan, end: endWithOverscan };
    },
    [itemHeight, overscan, items.length]
  );

  const updateVisibleRange = useCallback(
    (scrollTop: number, height: number) => {
      const newRange = calculateVisibleRange(scrollTop, height);
      setVisibleRange((prev) => {
        if (prev.start !== newRange.start || prev.end !== newRange.end) {
          return newRange;
        }
        return prev;
      });
    },
    [calculateVisibleRange]
  );

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

      updateVisibleRange(scrollTop, container.clientHeight);

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
  }, [updateVisibleRange]);

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

  // Handle resize and setup scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureContainer = () => {
      const height = container.clientHeight;
      setContainerHeight((prev) => (prev !== height ? height : prev));
    };

    measureContainer();

    const resizeObserver = new ResizeObserver(measureContainer);
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
  }, [handleScroll]);

  // Update visible range when container height changes
  useEffect(() => {
    if (containerHeight > 0) {
      updateVisibleRange(scrollTopRef.current, containerHeight);
    }
  }, [containerHeight, updateVisibleRange]);

  // Scroll to index
  const scrollTo = useCallback(
    (index: number) => {
      if (!containerRef.current) return;

      containerRef.current.scrollTo({
        top: index * itemHeight,
        behavior: 'smooth',
      });
    },
    [itemHeight]
  );

  return {
    virtualItems,
    totalHeight,
    containerRef,
    scrollTo,
    visibleRange,
    isScrolling,
  };
}
