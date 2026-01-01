/**
 * useStableGridLayout Hook
 *
 * Calculates grid layout with stability guarantees.
 * Only recalculates on:
 * - Window resize (debounced)
 * - Card size change (user-initiated)
 *
 * NEVER recalculates on:
 * - Data loading/refetch
 * - Filter changes
 * - Show/hide toggle
 */

import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { calculateGridLayout, GridLayout } from '../utils/gridCalculations';

interface UseStableGridLayoutOptions {
  cardSize: number;
  resizeDebounce?: number;
}

export function useStableGridLayout(
  containerRef: RefObject<HTMLElement>,
  options: UseStableGridLayoutOptions
): GridLayout | null {
  const { cardSize, resizeDebounce = 150 } = options;

  // Store layout in state
  const [layout, setLayout] = useState<GridLayout | null>(null);

  // Track container width in ref (doesn't trigger re-renders)
  const containerWidthRef = useRef<number>(0);

  // Measure and update layout
  const updateLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;

    // Only update if width actually changed
    if (width !== containerWidthRef.current) {
      containerWidthRef.current = width;
      setLayout(calculateGridLayout(width, cardSize));
    }
  }, [containerRef, cardSize]);

  // Initial measurement
  useEffect(() => {
    updateLayout();
  }, [updateLayout]);

  // Recalculate when card size changes
  useEffect(() => {
    if (containerWidthRef.current > 0) {
      setLayout(calculateGridLayout(containerWidthRef.current, cardSize));
    }
  }, [cardSize]);

  // Listen for window resize (debounced)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateLayout, resizeDebounce);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [updateLayout, resizeDebounce]);

  return layout;
}
