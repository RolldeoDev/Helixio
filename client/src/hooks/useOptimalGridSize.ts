/**
 * useOptimalGridSize Hook
 *
 * Calculates optimal grid column count and item width to maximize cover space.
 * Instead of using CSS auto-fill which can leave gaps, this calculates exact
 * column counts and sizes items to fill the available width perfectly.
 *
 * The slider value (1-10) controls density:
 * - 1 = fewer columns, larger covers
 * - 10 = more columns, smaller covers
 *
 * Each step changes size by roughly 10-15% for meaningful visual difference.
 */

import { useState, useEffect, useRef, useMemo } from 'react';

export interface OptimalGridConfig {
  /** Slider value 1-10 (1 = largest, 10 = smallest) */
  sliderValue: number;
  /** Gap between items in pixels */
  gap?: number;
  /** Minimum allowed cover width */
  minCoverWidth?: number;
  /** Maximum allowed cover width */
  maxCoverWidth?: number;
  /** Aspect ratio for height calculation (default 1.5 for comics) */
  aspectRatio?: number;
  /** Extra height for info area below cover */
  infoHeight?: number;
  /** Horizontal padding to subtract from container width (default 32 for typical padding) */
  horizontalPadding?: number;
}

export interface OptimalGridResult {
  /** Reference to attach to container element */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Calculated number of columns */
  columns: number;
  /** Width of each item in pixels */
  itemWidth: number;
  /** Height of each item in pixels (based on aspect ratio + info) */
  itemHeight: number;
  /** Container width in pixels */
  containerWidth: number;
  /** Gap between items */
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
  const totalGaps = (targetCols - 1) * gap;
  const targetItemWidth = (containerWidth - totalGaps) / targetCols;

  // Ensure we respect minimum and maximum bounds
  if (targetItemWidth < minCoverWidth) {
    // Too many columns - calculate max that fits while respecting min width
    const maxPossibleCols = Math.floor((containerWidth + gap) / (minCoverWidth + gap));
    return Math.max(1, maxPossibleCols);
  }

  if (targetItemWidth > maxCoverWidth) {
    // Too few columns - calculate min needed to respect max width
    const minPossibleCols = Math.ceil((containerWidth + gap) / (maxCoverWidth + gap));
    return Math.max(minCols, minPossibleCols);
  }

  return targetCols;
}

/**
 * Hook to calculate optimal grid sizing that fills available width
 */
export function useOptimalGridSize(config: OptimalGridConfig): OptimalGridResult {
  const {
    sliderValue,
    gap = 16,
    minCoverWidth = 80,
    maxCoverWidth = 350,
    aspectRatio = 1.5,
    infoHeight = 60,
    horizontalPadding = 32,
  } = config;

  // Enforce minimum gap of 12px
  const effectiveGap = Math.max(gap, 12);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Observe container size changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      // Get inner width and subtract horizontal padding for actual usable space
      const width = container.clientWidth - horizontalPadding;
      setContainerWidth(Math.max(0, width));
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [horizontalPadding]);

  // Calculate optimal columns and item dimensions
  const gridMetrics = useMemo(() => {
    const columns = calculateOptimalColumns(
      containerWidth,
      sliderValue,
      effectiveGap,
      minCoverWidth,
      maxCoverWidth
    );

    // Calculate item width to fill container exactly (minus gaps)
    const totalGaps = (columns - 1) * effectiveGap;
    const itemWidth = containerWidth > 0
      ? Math.floor((containerWidth - totalGaps) / columns)
      : minCoverWidth;

    // Calculate height based on aspect ratio plus info area
    const itemHeight = Math.round(itemWidth * aspectRatio) + infoHeight;

    return { columns, itemWidth, itemHeight };
  }, [containerWidth, sliderValue, effectiveGap, minCoverWidth, maxCoverWidth, aspectRatio, infoHeight]);

  return {
    containerRef,
    columns: gridMetrics.columns,
    itemWidth: gridMetrics.itemWidth,
    itemHeight: gridMetrics.itemHeight,
    containerWidth,
    gap: effectiveGap,
  };
}

/**
 * Calculate optimal item width for a known container width
 * Utility function for when you already have container dimensions
 */
export function calculateOptimalItemWidth(
  containerWidth: number,
  sliderValue: number,
  gap: number = 16,
  minCoverWidth: number = 80,
  maxCoverWidth: number = 350
): { columns: number; itemWidth: number; gap: number } {
  // Enforce minimum gap of 12px
  const effectiveGap = Math.max(gap, 12);

  const columns = calculateOptimalColumns(
    containerWidth,
    sliderValue,
    effectiveGap,
    minCoverWidth,
    maxCoverWidth
  );

  const totalGaps = (columns - 1) * effectiveGap;
  const itemWidth = containerWidth > 0
    ? Math.floor((containerWidth - totalGaps) / columns)
    : minCoverWidth;

  return { columns, itemWidth, gap: effectiveGap };
}
