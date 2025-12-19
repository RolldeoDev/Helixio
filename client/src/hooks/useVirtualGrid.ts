/**
 * Virtual Grid Hook
 *
 * Efficiently renders large grids by only rendering items that are visible
 * in the viewport. Supports variable item sizes and smooth scrolling.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface VirtualGridConfig {
  itemWidth: number;
  itemHeight: number;
  gap: number;
  overscan?: number; // Number of items to render outside viewport
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
}

export interface VirtualItem<T> {
  item: T;
  index: number;
  style: React.CSSProperties;
}

// =============================================================================
// Hook
// =============================================================================

export function useVirtualGrid<T>(
  items: T[],
  config: VirtualGridConfig
): VirtualGridResult<T> {
  const { itemWidth, itemHeight, gap, overscan = 3 } = config;

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Calculate columns based on container width
  const columns = useMemo(() => {
    if (containerWidth === 0) return 1;
    const availableWidth = containerWidth + gap;
    const cols = Math.floor(availableWidth / (itemWidth + gap));
    return Math.max(1, cols);
  }, [containerWidth, itemWidth, gap]);

  // Calculate total rows
  const rows = Math.ceil(items.length / columns);

  // Calculate total grid dimensions
  const totalWidth = columns * (itemWidth + gap) - gap;
  const totalHeight = rows * (itemHeight + gap) - gap;

  // Calculate visible range of rows
  const visibleRange = useMemo(() => {
    const rowHeight = itemHeight + gap;
    const startRow = Math.floor(scrollTop / rowHeight);
    const visibleRows = Math.ceil(containerHeight / rowHeight);

    const startRowWithOverscan = Math.max(0, startRow - overscan);
    const endRowWithOverscan = Math.min(rows - 1, startRow + visibleRows + overscan);

    return {
      startRow: startRowWithOverscan,
      endRow: endRowWithOverscan,
      start: startRowWithOverscan * columns,
      end: Math.min(items.length - 1, (endRowWithOverscan + 1) * columns - 1),
    };
  }, [scrollTop, containerHeight, itemHeight, gap, rows, columns, overscan, items.length]);

  // Create virtual items with positions
  const virtualItems = useMemo<VirtualItem<T>[]>(() => {
    const result: VirtualItem<T>[] = [];

    for (let i = visibleRange.start; i <= visibleRange.end; i++) {
      if (i >= items.length) break;

      const item = items[i]!;
      const row = Math.floor(i / columns);
      const col = i % columns;

      const left = col * (itemWidth + gap);
      const top = row * (itemHeight + gap);

      result.push({
        item,
        index: i,
        style: {
          position: 'absolute',
          left,
          top,
          width: itemWidth,
          height: itemHeight,
        },
      });
    }

    return result;
  }, [items, visibleRange, columns, itemWidth, itemHeight, gap]);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // Handle resize events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      setContainerWidth(container.clientWidth);
      setContainerHeight(container.clientHeight);
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // Scroll to a specific item index
  const scrollTo = useCallback((index: number) => {
    if (!containerRef.current) return;

    const row = Math.floor(index / columns);
    const top = row * (itemHeight + gap);

    containerRef.current.scrollTo({
      top,
      behavior: 'smooth',
    });
  }, [columns, itemHeight, gap]);

  return {
    virtualItems,
    totalHeight,
    totalWidth,
    containerRef,
    scrollTo,
    columns,
    rows,
    visibleRange: {
      start: visibleRange.start,
      end: visibleRange.end,
    },
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
}

export function useVirtualList<T>(
  items: T[],
  config: VirtualListConfig
): VirtualListResult<T> {
  const { itemHeight, overscan = 5 } = config;

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const totalHeight = items.length * itemHeight;

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);

    const startWithOverscan = Math.max(0, startIndex - overscan);
    const endWithOverscan = Math.min(items.length - 1, startIndex + visibleCount + overscan);

    return {
      start: startWithOverscan,
      end: endWithOverscan,
    };
  }, [scrollTop, containerHeight, itemHeight, overscan, items.length]);

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
          top: i * itemHeight,
          left: 0,
          right: 0,
          height: itemHeight,
        },
      });
    }

    return result;
  }, [items, visibleRange, itemHeight]);

  // Handle scroll
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

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
  };
}
