/**
 * Touch Gestures Hook
 *
 * Handles touch gestures for the reader:
 * - Swipe left/right for page navigation
 * - Pinch-to-zoom with smooth transitions
 * - Double-tap to toggle fit modes
 * - Long-press for context menu
 * - Pan when zoomed
 */

import React, { useCallback, useRef, useState } from 'react';

// =============================================================================
// Types
// =============================================================================

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface GestureCallbacks {
  onSwipe?: (direction: SwipeDirection) => void;
  onDoubleTap?: (x: number, y: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onPinchStart?: () => void;
  onPinch?: (scale: number, centerX: number, centerY: number) => void;
  onPinchEnd?: (finalScale: number) => void;
  onPan?: (deltaX: number, deltaY: number) => void;
  onPanEnd?: () => void;
  onTap?: (x: number, y: number) => void;
}

export interface GestureConfig {
  swipeThreshold?: number; // Minimum distance for swipe (px)
  swipeVelocityThreshold?: number; // Minimum velocity for swipe (px/ms)
  doubleTapDelay?: number; // Max time between taps (ms)
  longPressDelay?: number; // Time to trigger long press (ms)
  panEnabled?: boolean; // Whether panning is enabled
}

interface TouchPoint {
  x: number;
  y: number;
  time: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: Required<GestureConfig> = {
  swipeThreshold: 50,
  swipeVelocityThreshold: 0.3,
  doubleTapDelay: 300,
  longPressDelay: 500,
  panEnabled: true,
};

// =============================================================================
// Helper Functions
// =============================================================================

function getTouchDistance(touches: React.TouchList): number {
  if (touches.length < 2) return 0;
  const dx = touches[0]!.clientX - touches[1]!.clientX;
  const dy = touches[0]!.clientY - touches[1]!.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(touches: React.TouchList): { x: number; y: number } {
  if (touches.length === 0) return { x: 0, y: 0 };
  if (touches.length === 1) {
    return { x: touches[0]!.clientX, y: touches[0]!.clientY };
  }
  return {
    x: (touches[0]!.clientX + touches[1]!.clientX) / 2,
    y: (touches[0]!.clientY + touches[1]!.clientY) / 2,
  };
}

// =============================================================================
// Hook
// =============================================================================

export function useTouchGestures(
  callbacks: GestureCallbacks,
  config: GestureConfig = {}
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // State
  const [isPinching, setIsPinching] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  // Refs for gesture tracking
  const touchStartRef = useRef<TouchPoint | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchStartDistanceRef = useRef<number>(0);
  const lastPinchScaleRef = useRef<number>(1);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchCountRef = useRef(0);

  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touches = e.touches;
      touchCountRef.current = touches.length;

      if (touches.length === 1) {
        // Single touch - track for swipe/tap/long-press
        const touch = touches[0]!;
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
        };

        // Start long press timer
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          if (touchStartRef.current && callbacks.onLongPress) {
            callbacks.onLongPress(touchStartRef.current.x, touchStartRef.current.y);
            // Prevent further gesture handling
            touchStartRef.current = null;
          }
        }, mergedConfig.longPressDelay);

        // Enable panning if configured
        if (mergedConfig.panEnabled) {
          panStartRef.current = { x: touch.clientX, y: touch.clientY };
        }
      } else if (touches.length === 2) {
        // Two touches - start pinch
        clearLongPressTimer();
        setIsPinching(true);
        pinchStartDistanceRef.current = getTouchDistance(touches);
        lastPinchScaleRef.current = 1;
        callbacks.onPinchStart?.();
        e.preventDefault();
      }
    },
    [callbacks, mergedConfig, clearLongPressTimer]
  );

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touches = e.touches;

      if (touches.length === 2 && isPinching) {
        // Pinch zoom
        const currentDistance = getTouchDistance(touches);
        const scale = currentDistance / pinchStartDistanceRef.current;
        const center = getTouchCenter(touches);

        callbacks.onPinch?.(scale, center.x, center.y);
        lastPinchScaleRef.current = scale;
        e.preventDefault();
      } else if (touches.length === 1 && touchStartRef.current) {
        const touch = touches[0]!;
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = touch.clientY - touchStartRef.current.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Cancel long press if moved too far
        if (distance > 10) {
          clearLongPressTimer();
        }

        // Handle panning
        if (mergedConfig.panEnabled && panStartRef.current && !isPinching) {
          const panDeltaX = touch.clientX - panStartRef.current.x;
          const panDeltaY = touch.clientY - panStartRef.current.y;

          // Only start pan if moved significantly
          if (Math.abs(panDeltaX) > 10 || Math.abs(panDeltaY) > 10) {
            if (!isPanning) {
              setIsPanning(true);
            }
            callbacks.onPan?.(panDeltaX, panDeltaY);
            panStartRef.current = { x: touch.clientX, y: touch.clientY };
          }
        }
      }
    },
    [callbacks, isPinching, isPanning, mergedConfig, clearLongPressTimer]
  );

  // Handle touch end
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      clearLongPressTimer();

      const touches = e.touches;
      const changedTouches = e.changedTouches;

      // Handle pinch end
      if (isPinching && touches.length < 2) {
        setIsPinching(false);
        callbacks.onPinchEnd?.(lastPinchScaleRef.current);
        pinchStartDistanceRef.current = 0;
        return;
      }

      // Handle pan end
      if (isPanning) {
        setIsPanning(false);
        callbacks.onPanEnd?.();
        panStartRef.current = null;
        return;
      }

      // Handle single touch end (swipe/tap)
      if (touchCountRef.current === 1 && touchStartRef.current && changedTouches.length === 1) {
        const touch = changedTouches[0]!;
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = touch.clientY - touchStartRef.current.y;
        const deltaTime = Date.now() - touchStartRef.current.time;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Check for swipe
        const velocity = distance / deltaTime;
        if (
          distance > mergedConfig.swipeThreshold &&
          velocity > mergedConfig.swipeVelocityThreshold
        ) {
          // Determine swipe direction
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal swipe
            callbacks.onSwipe?.(deltaX > 0 ? 'right' : 'left');
          } else {
            // Vertical swipe
            callbacks.onSwipe?.(deltaY > 0 ? 'down' : 'up');
          }
        } else if (distance < 20) {
          // Tap (small movement tolerance)
          const now = Date.now();
          const tapX = touch.clientX;
          const tapY = touch.clientY;

          // Check for double tap
          if (
            lastTapRef.current &&
            now - lastTapRef.current.time < mergedConfig.doubleTapDelay &&
            Math.abs(tapX - lastTapRef.current.x) < 30 &&
            Math.abs(tapY - lastTapRef.current.y) < 30
          ) {
            // Double tap detected
            callbacks.onDoubleTap?.(tapX, tapY);
            lastTapRef.current = null;
          } else {
            // Single tap - wait to see if double tap follows
            lastTapRef.current = { x: tapX, y: tapY, time: now };

            // Fire single tap after delay if no double tap
            setTimeout(() => {
              if (lastTapRef.current && Date.now() - lastTapRef.current.time >= mergedConfig.doubleTapDelay) {
                callbacks.onTap?.(lastTapRef.current.x, lastTapRef.current.y);
                lastTapRef.current = null;
              }
            }, mergedConfig.doubleTapDelay + 10);
          }
        }
      }

      touchStartRef.current = null;
      panStartRef.current = null;
    },
    [callbacks, isPinching, isPanning, mergedConfig, clearLongPressTimer]
  );

  // Handle touch cancel
  const handleTouchCancel = useCallback(() => {
    clearLongPressTimer();
    setIsPinching(false);
    setIsPanning(false);
    touchStartRef.current = null;
    panStartRef.current = null;
    pinchStartDistanceRef.current = 0;
  }, [clearLongPressTimer]);

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    },
    state: {
      isPinching,
      isPanning,
    },
  };
}
