/**
 * useVirtualWindow Hook
 *
 * Handles scroll-based virtualization.
 * Returns which items to render based on scroll position.
 */

import { useState, useEffect, useCallback, RefObject } from 'react';
import { calculateVisibleRange, GridLayout, VisibleRange } from '../utils/gridCalculations';

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
  isScrolling: boolean;
}

const DEFAULT_OVERSCAN = 2;
const SCROLL_THROTTLE = 16; // ~60fps
const SCROLL_END_DELAY = 150;

export function useVirtualWindow<T extends { id: string }>(
  containerRef: RefObject<HTMLElement>,
  items: T[],
  layout: GridLayout | null,
  options: UseVirtualWindowOptions = {}
): UseVirtualWindowReturn<T> {
  const { overscanRows = DEFAULT_OVERSCAN, scrollThrottle = SCROLL_THROTTLE } = options;

  const [visibleRange, setVisibleRange] = useState<VisibleRange>({ startIndex: 0, endIndex: 0 });
  const [isScrolling, setIsScrolling] = useState(false);

  // Calculate visible range on scroll
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || !layout) return;

    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;

    const newRange = calculateVisibleRange(
      scrollTop,
      viewportHeight,
      layout,
      items.length,
      overscanRows
    );

    setVisibleRange((prev) => {
      // Only update if range actually changed
      if (prev.startIndex === newRange.startIndex && prev.endIndex === newRange.endIndex) {
        return prev;
      }
      return newRange;
    });
  }, [containerRef, layout, items.length, overscanRows]);

  // Set up scroll listener with throttling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastScrollTime = 0;
    let rafId: number;
    let scrollEndTimeout: ReturnType<typeof setTimeout>;

    const onScroll = () => {
      const now = Date.now();
      setIsScrolling(true);

      // Clear previous scroll end timeout
      clearTimeout(scrollEndTimeout);

      // Throttle updates
      if (now - lastScrollTime >= scrollThrottle) {
        lastScrollTime = now;
        rafId = requestAnimationFrame(handleScroll);
      }

      // Set scroll end timeout
      scrollEndTimeout = setTimeout(() => {
        setIsScrolling(false);
      }, SCROLL_END_DELAY);
    };

    container.addEventListener('scroll', onScroll, { passive: true });

    // Initial calculation
    handleScroll();

    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
      clearTimeout(scrollEndTimeout);
    };
  }, [containerRef, handleScroll, scrollThrottle]);

  // Recalculate when layout changes
  useEffect(() => {
    handleScroll();
  }, [layout, handleScroll]);

  // Build visible items array
  const visibleItems: VirtualItem<T>[] = [];

  if (layout) {
    for (let i = visibleRange.startIndex; i < visibleRange.endIndex && i < items.length; i++) {
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
    isScrolling,
  };
}
