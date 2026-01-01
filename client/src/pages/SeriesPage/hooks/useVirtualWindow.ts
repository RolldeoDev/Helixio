/**
 * useVirtualWindow Hook
 *
 * Handles scroll-based virtualization.
 * Returns which items to render based on scroll position.
 */

import { useState, useEffect, useCallback, RefObject } from 'react';
import { calculateVisibleRange, GridLayout, VisibleRangeResult } from '../utils/gridCalculations';

interface VirtualItem<T> {
  data: T;
  index: number;
  style: React.CSSProperties;
}

interface UseVirtualWindowOptions {
  overscanRows?: number;
  scrollThrottle?: number;
}

interface UseVirtualWindowReturn<T> {
  visibleItems: VirtualItem<T>[];
  totalHeight: number;
  /** Range actually visible in viewport (for NavigationSidebar) */
  visibleRange: { start: number; end: number };
  /** Range being rendered including overscan (for skeleton generation) */
  renderRange: { start: number; end: number };
  scrollToIndex: (index: number) => void;
}

const DEFAULT_OVERSCAN = 2;
const SCROLL_THROTTLE = 16; // ~60fps

export function useVirtualWindow<T extends { id: string }>(
  containerRef: RefObject<HTMLElement>,
  items: T[],
  layout: GridLayout | null,
  options: UseVirtualWindowOptions = {}
): UseVirtualWindowReturn<T> {
  const { overscanRows = DEFAULT_OVERSCAN, scrollThrottle = SCROLL_THROTTLE } = options;

  const [rangeResult, setRangeResult] = useState<VisibleRangeResult>({
    renderRange: { startIndex: 0, endIndex: 0 },
    viewportRange: { startIndex: 0, endIndex: 0 },
  });

  // Calculate visible range on scroll
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || !layout) return;

    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;

    const newResult = calculateVisibleRange(
      scrollTop,
      viewportHeight,
      layout,
      items.length,
      overscanRows
    );

    setRangeResult((prev) => {
      // Only update if render range actually changed (what we render)
      if (
        prev.renderRange.startIndex === newResult.renderRange.startIndex &&
        prev.renderRange.endIndex === newResult.renderRange.endIndex &&
        prev.viewportRange.startIndex === newResult.viewportRange.startIndex &&
        prev.viewportRange.endIndex === newResult.viewportRange.endIndex
      ) {
        return prev;
      }
      return newResult;
    });
  }, [containerRef, layout, items.length, overscanRows]);

  // Set up scroll listener with throttling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastScrollTime = 0;
    let rafId: number;

    const onScroll = () => {
      const now = Date.now();

      // Throttle updates
      if (now - lastScrollTime >= scrollThrottle) {
        lastScrollTime = now;
        rafId = requestAnimationFrame(handleScroll);
      }
    };

    container.addEventListener('scroll', onScroll, { passive: true });

    // Initial calculation
    handleScroll();

    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [containerRef, handleScroll, scrollThrottle]);

  // Recalculate when layout changes
  useEffect(() => {
    handleScroll();
  }, [layout, handleScroll]);

  // Scroll to a specific item index
  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container || !layout) return;

    const position = layout.getItemPosition(index);
    container.scrollTo({
      top: position.y,
      behavior: 'smooth',
    });
  }, [containerRef, layout]);

  // Build visible items array using render range (includes overscan)
  const visibleItems: VirtualItem<T>[] = [];
  const { renderRange, viewportRange } = rangeResult;

  if (layout) {
    for (let i = renderRange.startIndex; i < renderRange.endIndex && i < items.length; i++) {
      const item = items[i];
      if (!item) continue;

      const position = layout.getItemPosition(i);

      visibleItems.push({
        data: item,
        index: i,
        style: {
          position: 'absolute',
          width: layout.itemWidth,
          height: layout.itemHeight,
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        },
      });
    }
  }

  const totalHeight = layout?.getTotalHeight(items.length) ?? 0;

  return {
    visibleItems,
    totalHeight,
    // Return viewport range (not render range) for NavigationSidebar indicator
    visibleRange: { start: viewportRange.startIndex, end: viewportRange.endIndex },
    // Return render range (with overscan) for skeleton generation
    renderRange: { start: renderRange.startIndex, end: renderRange.endIndex },
    scrollToIndex,
  };
}
