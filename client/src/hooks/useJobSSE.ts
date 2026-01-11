/**
 * useJobSSE Hook
 *
 * Generic hook for SSE-based job tracking with polling fallback.
 * Handles connection lifecycle, reconnection, and event dispatching.
 *
 * Reusable across all job types (metadata, ratings, reviews, etc.)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSSEReconnection } from './useSSEReconnection';
import type {
  JobProgressEvent,
  JobStatusEvent,
  JobCompleteEvent,
  JobErrorEvent,
  JobLogEvent,
  ConnectedEvent,
  PingEvent,
} from '../types/sse-events';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for job SSE connection
 */
export interface JobSSEConfig {
  /** SSE endpoint URL (e.g., '/api/external-ratings/jobs/:jobId/stream') */
  endpoint: string;

  /** Whether to enable SSE connection */
  enabled: boolean;

  /** Event handlers */
  onProgress?: (data: JobProgressEvent) => void;
  onStatus?: (data: JobStatusEvent) => void;
  onComplete?: (data: JobCompleteEvent) => void;
  onError?: (data: JobErrorEvent) => void;
  onLog?: (data: JobLogEvent) => void;
  onConnected?: (data: ConnectedEvent) => void;
  onPing?: (data: PingEvent) => void;

  /** Polling fallback function (called when SSE disconnected) */
  fallbackPoll?: () => void;

  /** Polling interval when SSE disconnected (milliseconds, default: 5000) */
  fallbackInterval?: number;

  /** Custom event handlers for non-standard SSE events */
  customEvents?: Record<string, (data: unknown) => void>;

  /** Whether to enable debug logging */
  debug?: boolean;
}

/**
 * Return value from useJobSSE
 */
export interface JobSSEResult {
  /** Whether SSE is currently connected */
  connected: boolean;

  /** Manually trigger reconnection */
  reconnect: () => void;

  /** Manually disconnect */
  disconnect: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_FALLBACK_INTERVAL = 5000; // 5 seconds

// =============================================================================
// Hook
// =============================================================================

/**
 * Generic SSE hook for job progress tracking.
 *
 * Features:
 * - Automatic connection management
 * - Exponential backoff reconnection
 * - Event type routing to callbacks
 * - Polling fallback when SSE disconnected
 * - Proper cleanup on unmount
 *
 * Usage:
 * ```typescript
 * const { connected } = useJobSSE({
 *   endpoint: '/api/external-ratings/jobs/abc123/stream',
 *   enabled: !!jobId,
 *   onProgress: (data) => console.log('Progress:', data),
 *   onComplete: (data) => console.log('Complete:', data),
 *   fallbackPoll: () => refetch(),
 * });
 * ```
 */
export function useJobSSE(config: JobSSEConfig): JobSSEResult {
  const {
    endpoint,
    enabled,
    onProgress,
    onStatus,
    onComplete,
    onError,
    onLog,
    onConnected,
    onPing,
    fallbackPoll,
    fallbackInterval = DEFAULT_FALLBACK_INTERVAL,
    customEvents,
    debug = false,
  } = config;

  // Connection state
  const [connected, setConnected] = useState(false);

  // EventSource reference
  const eventSourceRef = useRef<EventSource | null>(null);

  // Polling fallback timer
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Store callbacks in refs to avoid stale closures
  const callbacksRef = useRef({
    onProgress,
    onStatus,
    onComplete,
    onError,
    onLog,
    onConnected,
    onPing,
    fallbackPoll,
    customEvents,
  });

  useEffect(() => {
    callbacksRef.current = {
      onProgress,
      onStatus,
      onComplete,
      onError,
      onLog,
      onConnected,
      onPing,
      fallbackPoll,
      customEvents,
    };
  }, [onProgress, onStatus, onComplete, onError, onLog, onConnected, onPing, fallbackPoll, customEvents]);

  /**
   * Parse SSE event data safely
   */
  const parseEventData = useCallback(<T,>(event: MessageEvent): T | null => {
    try {
      return JSON.parse(event.data) as T;
    } catch (error) {
      if (debug) {
        console.error('Failed to parse SSE event data:', error);
      }
      return null;
    }
  }, [debug]);

  /**
   * Connect to SSE endpoint
   */
  const connectSSE = useCallback(() => {
    // Don't connect if disabled or already connected
    if (!enabled || eventSourceRef.current) return;

    if (debug) {
      console.log('[useJobSSE] Connecting to:', endpoint);
    }

    try {
      const eventSource = new EventSource(endpoint, {
        withCredentials: true,
      });

      // Handle connection opened
      eventSource.onopen = () => {
        setConnected(true);
        reconnectionControls.resetDelay();

        if (debug) {
          console.log('[useJobSSE] Connected to:', endpoint);
        }

        // Stop polling fallback when SSE connects
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      };

      // Handle connected event
      eventSource.addEventListener('connected', (event) => {
        const data = parseEventData<ConnectedEvent>(event);
        if (data && callbacksRef.current.onConnected) {
          callbacksRef.current.onConnected(data);
        }
      });

      // Handle ping event (keepalive)
      eventSource.addEventListener('ping', (event) => {
        const data = parseEventData<PingEvent>(event);
        if (data && callbacksRef.current.onPing) {
          callbacksRef.current.onPing(data);
        }
      });

      // Handle progress event
      eventSource.addEventListener('progress', (event) => {
        const data = parseEventData<JobProgressEvent>(event);
        if (data && callbacksRef.current.onProgress) {
          callbacksRef.current.onProgress(data);
        }
      });

      // Handle status event
      eventSource.addEventListener('status', (event) => {
        const data = parseEventData<JobStatusEvent>(event);
        if (data && callbacksRef.current.onStatus) {
          callbacksRef.current.onStatus(data);
        }
      });

      // Handle complete event
      eventSource.addEventListener('complete', (event) => {
        const data = parseEventData<JobCompleteEvent>(event);
        if (data && callbacksRef.current.onComplete) {
          callbacksRef.current.onComplete(data);
        }

        // Close connection after completion
        if (debug) {
          console.log('[useJobSSE] Job complete, closing connection');
        }
        disconnect();
      });

      // Handle error event (job error, not connection error)
      // Note: Custom error events from server are MessageEvent, not generic Event
      eventSource.addEventListener('error', (event) => {
        const data = parseEventData<JobErrorEvent>(event as MessageEvent);
        if (data && callbacksRef.current.onError) {
          callbacksRef.current.onError(data);
        }
      });

      // Handle log event
      eventSource.addEventListener('log', (event) => {
        const data = parseEventData<JobLogEvent>(event);
        if (data && callbacksRef.current.onLog) {
          callbacksRef.current.onLog(data);
        }
      });

      // Handle custom events
      if (callbacksRef.current.customEvents) {
        for (const [eventName, handler] of Object.entries(callbacksRef.current.customEvents)) {
          eventSource.addEventListener(eventName, (event) => {
            const data = parseEventData(event);
            if (data && handler) {
              handler(data);
            }
          });
        }
      }

      // Handle connection errors
      eventSource.onerror = () => {
        setConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        if (debug) {
          console.log('[useJobSSE] Connection error, scheduling reconnect');
        }

        // Schedule reconnection with exponential backoff
        reconnectionControls.scheduleReconnect();

        // Start polling fallback
        if (callbacksRef.current.fallbackPoll && !pollTimerRef.current) {
          pollTimerRef.current = setInterval(() => {
            callbacksRef.current.fallbackPoll?.();
          }, fallbackInterval);
        }
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      if (debug) {
        console.error('[useJobSSE] Failed to create EventSource:', error);
      }
      setConnected(false);

      // Fallback to polling on error
      if (callbacksRef.current.fallbackPoll && !pollTimerRef.current) {
        pollTimerRef.current = setInterval(() => {
          callbacksRef.current.fallbackPoll?.();
        }, fallbackInterval);
      }
    }
  }, [enabled, endpoint, debug, parseEventData, fallbackInterval]);

  /**
   * Disconnect from SSE
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnected(false);
    reconnectionControls.cancelReconnect();

    // Stop polling fallback
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (debug) {
      console.log('[useJobSSE] Disconnected from:', endpoint);
    }
  }, [debug, endpoint]);

  // Reconnection controls
  const reconnectionControls = useSSEReconnection({
    onReconnect: connectSSE,
    enabled: enabled,
  });

  /**
   * Manual reconnect trigger
   */
  const reconnect = useCallback(() => {
    disconnect();
    reconnectionControls.resetDelay();
    connectSSE();
  }, [disconnect, connectSSE, reconnectionControls]);

  // Connect/disconnect based on enabled flag
  useEffect(() => {
    if (enabled) {
      connectSSE();
    } else {
      disconnect();
    }

    // Cleanup on unmount or when disabled
    return () => {
      disconnect();
    };
  }, [enabled, connectSSE, disconnect]);

  return {
    connected,
    reconnect,
    disconnect,
  };
}
