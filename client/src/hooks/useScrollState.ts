/**
 * useScrollState Hook
 *
 * Tracks scroll state to enable performance optimizations during rapid scrolling.
 * Returns true while scrolling, false after scrolling stops.
 *
 * Usage:
 * - Add 'scrolling' class to container when isScrolling is true
 * - CSS rules can disable expensive effects (animations, transitions, hover states)
 * - Debounced to prevent flickering (150ms default)
 */

import { useState, useEffect, useRef, RefObject } from 'react';

interface UseScrollStateOptions {
  /** Delay in ms before considering scroll stopped (default: 150ms) */
  debounceMs?: number;
}

/**
 * Track scroll state for a container element
 * @param containerRef - Ref to the scrollable container
 * @param options - Configuration options
 * @returns isScrolling - true while actively scrolling
 */
export function useScrollState(
  containerRef: RefObject<HTMLElement>,
  options: UseScrollStateOptions = {}
): boolean {
  const { debounceMs = 150 } = options;

  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Set scrolling to true immediately
      if (!isScrolling) {
        setIsScrolling(true);
      }

      // Clear existing timeout
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }

      // Set scrolling to false after debounce period of no scroll events
      scrollTimeoutRef.current = window.setTimeout(() => {
        setIsScrolling(false);
        scrollTimeoutRef.current = null;
      }, debounceMs);
    };

    // Passive listener for better scroll performance
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [containerRef, debounceMs, isScrolling]);

  return isScrolling;
}

/**
 * Track scroll state for the window/document
 * @param options - Configuration options
 * @returns isScrolling - true while actively scrolling
 */
export function useWindowScrollState(options: UseScrollStateOptions = {}): boolean {
  const { debounceMs = 150 } = options;

  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!isScrolling) {
        setIsScrolling(true);
      }

      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = window.setTimeout(() => {
        setIsScrolling(false);
        scrollTimeoutRef.current = null;
      }, debounceMs);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [debounceMs, isScrolling]);

  return isScrolling;
}
