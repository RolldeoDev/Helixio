/**
 * usePullToRefresh Hook
 *
 * A hook that implements pull-to-refresh gesture for touch devices.
 * Attaches to a scrollable container and triggers a refresh callback
 * when the user pulls down past a threshold.
 *
 * Features:
 * - Only activates when scrolled to top
 * - Resistance factor for natural feel
 * - Visual feedback with pull distance
 * - Haptic feedback on threshold reached (if supported)
 * - Automatic cleanup
 */

import { useRef, useState, useCallback, useEffect } from 'react';

interface PullToRefreshOptions {
  /** Callback when refresh is triggered */
  onRefresh: () => Promise<void>;
  /** Distance in pixels to pull before triggering refresh (default: 80) */
  threshold?: number;
  /** Resistance factor - higher = harder to pull (default: 2.5) */
  resistance?: number;
  /** Whether pull-to-refresh is enabled (default: true) */
  enabled?: boolean;
}

interface PullToRefreshState {
  /** Whether a refresh is currently in progress */
  isRefreshing: boolean;
  /** Current pull distance in pixels */
  pullDistance: number;
  /** Whether the threshold has been reached */
  thresholdReached: boolean;
}

interface PullToRefreshReturn extends PullToRefreshState {
  /** Ref to attach to the scrollable container */
  containerRef: React.RefObject<HTMLElement>;
  /** Ref to attach to the indicator element */
  indicatorRef: React.RefObject<HTMLDivElement>;
}

export function usePullToRefresh(options: PullToRefreshOptions): PullToRefreshReturn {
  const {
    onRefresh,
    threshold = 80,
    resistance = 2.5,
    enabled = true,
  } = options;

  const containerRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number>(0);
  const isPullingRef = useRef<boolean>(false);
  const hasTriggeredHapticRef = useRef<boolean>(false);

  const [state, setState] = useState<PullToRefreshState>({
    isRefreshing: false,
    pullDistance: 0,
    thresholdReached: false,
  });

  // Trigger haptic feedback if available
  const triggerHaptic = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || state.isRefreshing) return;

    const container = containerRef.current;
    if (!container) return;

    // Only start pull if scrolled to top
    if (container.scrollTop <= 0) {
      startYRef.current = e.touches[0]!.clientY;
      isPullingRef.current = true;
      hasTriggeredHapticRef.current = false;
    }
  }, [enabled, state.isRefreshing]);

  // Handle touch move
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPullingRef.current || !enabled || state.isRefreshing) return;

    const container = containerRef.current;
    if (!container) return;

    // Only continue if still at top
    if (container.scrollTop > 0) {
      isPullingRef.current = false;
      setState(prev => ({ ...prev, pullDistance: 0, thresholdReached: false }));
      return;
    }

    const currentY = e.touches[0]!.clientY;
    const deltaY = currentY - startYRef.current;

    // Only handle downward pulls
    if (deltaY > 0) {
      // Apply resistance
      const pullDistance = Math.min(deltaY / resistance, threshold * 1.5);
      const thresholdReached = pullDistance >= threshold;

      // Trigger haptic when threshold is first reached
      if (thresholdReached && !hasTriggeredHapticRef.current) {
        triggerHaptic();
        hasTriggeredHapticRef.current = true;
      }

      // Prevent default scrolling when pulling
      e.preventDefault();

      setState(prev => ({
        ...prev,
        pullDistance,
        thresholdReached,
      }));
    }
  }, [enabled, state.isRefreshing, threshold, resistance, triggerHaptic]);

  // Handle touch end
  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;

    if (state.thresholdReached && !state.isRefreshing) {
      setState(prev => ({ ...prev, isRefreshing: true, pullDistance: threshold }));

      try {
        await onRefresh();
      } catch (error) {
        console.error('Pull-to-refresh error:', error);
      } finally {
        setState({
          isRefreshing: false,
          pullDistance: 0,
          thresholdReached: false,
        });
      }
    } else {
      setState(prev => ({
        ...prev,
        pullDistance: 0,
        thresholdReached: false,
      }));
    }
  }, [state.thresholdReached, state.isRefreshing, onRefresh, threshold]);

  // Attach event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // Check if touch device
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Update indicator position
  useEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator) return;

    indicator.style.transform = `translateY(${state.pullDistance}px)`;
    indicator.style.opacity = state.pullDistance > 0 ? '1' : '0';
  }, [state.pullDistance]);

  return {
    ...state,
    containerRef: containerRef as React.RefObject<HTMLElement>,
    indicatorRef,
  };
}

export default usePullToRefresh;
