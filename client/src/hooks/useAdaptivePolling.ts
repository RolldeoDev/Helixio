/**
 * useAdaptivePolling Hook
 *
 * Provides adaptive polling that switches between idle (slow) and active (fast)
 * intervals based on whether there is active work detected in the response.
 *
 * Usage:
 * ```typescript
 * const { data, isActive } = useAdaptivePolling({
 *   fetchFn: getCacheJobs,
 *   isActive: (data) => data.jobs.some(j => j.status === 'processing'),
 * });
 * ```
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_IDLE_INTERVAL = 60000; // 60 seconds when no active jobs
const DEFAULT_ACTIVE_INTERVAL = 2000; // 2 seconds when jobs are active
const FORCE_ACTIVE_DURATION = 30000; // Force active polling for 30s after triggerImmediate

export interface AdaptivePollingConfig<T> {
  /** Function to fetch data from the API */
  fetchFn: () => Promise<T>;

  /** Function to determine if there's active work from the response */
  isActive: (data: T) => boolean;

  /** Polling interval when no active jobs (default: 60000ms = 1 minute) */
  idleInterval?: number;

  /** Polling interval when jobs are active (default: 2000ms = 2 seconds) */
  activeInterval?: number;

  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
}

export interface AdaptivePollingResult<T> {
  /** Current data from the most recent fetch */
  data: T | null;

  /** Whether currently loading (first fetch only) */
  isLoading: boolean;

  /** Current error if any */
  error: Error | null;

  /** Whether the system detected active jobs */
  isActive: boolean;

  /** Current polling interval being used */
  currentInterval: number;

  /** Trigger an immediate refetch and force active polling temporarily */
  triggerImmediate: () => Promise<void>;

  /** Force refetch without changing polling state */
  refetch: () => Promise<void>;
}

export function useAdaptivePolling<T>(
  config: AdaptivePollingConfig<T>
): AdaptivePollingResult<T> {
  const {
    fetchFn,
    isActive: isActiveFn,
    idleInterval = DEFAULT_IDLE_INTERVAL,
    activeInterval = DEFAULT_ACTIVE_INTERVAL,
    enabled = true,
  } = config;

  // State
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [forceActiveUntil, setForceActiveUntil] = useState(0);

  // Refs to avoid stale closures and track component mount
  const fetchFnRef = useRef(fetchFn);
  const isActiveFnRef = useRef(isActiveFn);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  // Update refs when config changes
  useEffect(() => {
    fetchFnRef.current = fetchFn;
    isActiveFnRef.current = isActiveFn;
  }, [fetchFn, isActiveFn]);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Core fetch function
  const doFetch = useCallback(async () => {
    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const result = await fetchFnRef.current();

      // Only update state if still mounted
      if (!mountedRef.current) return;

      setData(result);
      setError(null);

      // Determine if active based on response
      const active = isActiveFnRef.current(result);
      setIsActive(active);
    } catch (err) {
      if (!mountedRef.current) return;

      const fetchError = err instanceof Error ? err : new Error(String(err));
      setError(fetchError);
      // Don't clear data on error - keep showing last known state
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
      fetchingRef.current = false;
    }
  }, []);

  // Calculate current interval
  const currentInterval = (() => {
    // If forced to active polling (user started a job), use active interval
    if (Date.now() < forceActiveUntil) return activeInterval;
    // Otherwise, base on detected activity
    return isActive ? activeInterval : idleInterval;
  })();

  // Trigger immediate fetch and force active polling for a duration
  const triggerImmediate = useCallback(async () => {
    // Force active polling for at least 30 seconds to catch job starting
    setForceActiveUntil(Date.now() + FORCE_ACTIVE_DURATION);
    await doFetch();
  }, [doFetch]);

  // Simple refetch without changing polling state
  const refetch = useCallback(async () => {
    await doFetch();
  }, [doFetch]);

  // Polling effect - recreates interval when currentInterval changes
  useEffect(() => {
    if (!enabled) return;

    // Fetch immediately on mount or when interval changes
    doFetch();

    // Set up interval with current interval value
    const interval = setInterval(() => {
      doFetch();
    }, currentInterval);

    return () => clearInterval(interval);
  }, [enabled, currentInterval, doFetch]);

  return {
    data,
    isLoading,
    error,
    isActive,
    currentInterval,
    triggerImmediate,
    refetch,
  };
}
