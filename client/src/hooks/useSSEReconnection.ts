/**
 * useSSEReconnection Hook
 *
 * Reusable SSE reconnection logic with exponential backoff.
 * Extracted from LibraryScanContext pattern for maximum reusability.
 */

import { useRef, useCallback, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface ReconnectionConfig {
  /** Initial reconnection delay in milliseconds (default: 3000ms) */
  initialDelay?: number;
  /** Maximum reconnection delay in milliseconds (default: 30000ms) */
  maxDelay?: number;
  /** Callback to execute on reconnection attempt */
  onReconnect: () => void;
  /** Whether reconnection is enabled (default: true) */
  enabled?: boolean;
}

export interface ReconnectionControls {
  /** Schedule a reconnection attempt */
  scheduleReconnect: () => void;
  /** Cancel any pending reconnection */
  cancelReconnect: () => void;
  /** Reset the backoff delay to initial value */
  resetDelay: () => void;
  /** Get current delay value */
  getCurrentDelay: () => number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_INITIAL_DELAY = 3000; // 3 seconds
const DEFAULT_MAX_DELAY = 30000; // 30 seconds

// =============================================================================
// Hook
// =============================================================================

/**
 * Manages SSE reconnection with exponential backoff.
 *
 * Usage:
 * ```typescript
 * const { scheduleReconnect, resetDelay } = useSSEReconnection({
 *   onReconnect: connectSSE,
 * });
 *
 * // On connection error
 * scheduleReconnect();
 *
 * // On successful connection
 * resetDelay();
 * ```
 */
export function useSSEReconnection(config: ReconnectionConfig): ReconnectionControls {
  const {
    initialDelay = DEFAULT_INITIAL_DELAY,
    maxDelay = DEFAULT_MAX_DELAY,
    onReconnect,
    enabled = true,
  } = config;

  // Track current delay (increases with each failed attempt)
  const delayRef = useRef(initialDelay);

  // Track pending reconnection timeout
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store onReconnect callback in ref to avoid stale closures
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  /**
   * Cancel any pending reconnection attempt
   */
  const cancelReconnect = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /**
   * Reset delay to initial value
   * Call this after a successful connection
   */
  const resetDelay = useCallback(() => {
    delayRef.current = initialDelay;
  }, [initialDelay]);

  /**
   * Get current delay value
   */
  const getCurrentDelay = useCallback(() => {
    return delayRef.current;
  }, []);

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  const scheduleReconnect = useCallback(() => {
    if (!enabled) return;

    // Cancel any existing timeout
    cancelReconnect();

    const currentDelay = delayRef.current;

    // Schedule reconnection
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;

      // Execute reconnection callback
      onReconnectRef.current();

      // Increase delay for next attempt (exponential backoff)
      delayRef.current = Math.min(currentDelay * 2, maxDelay);
    }, currentDelay);
  }, [enabled, maxDelay, cancelReconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelReconnect();
    };
  }, [cancelReconnect]);

  return {
    scheduleReconnect,
    cancelReconnect,
    resetDelay,
    getCurrentDelay,
  };
}
