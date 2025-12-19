/**
 * Network-Aware Preloading Hook
 *
 * Adjusts preloading behavior based on network conditions.
 * Uses the Network Information API where available.
 */

import { useState, useEffect, useCallback } from 'react';

// Network connection types from Network Information API
type EffectiveConnectionType = 'slow-2g' | '2g' | '3g' | '4g';

interface NetworkInfo {
  // Effective connection type
  effectiveType: EffectiveConnectionType;
  // Whether the user has requested reduced data usage
  saveData: boolean;
  // Estimated downlink speed in Mbps
  downlink: number;
  // Round-trip time in ms
  rtt: number;
}

interface NavigatorWithConnection extends Navigator {
  connection?: {
    effectiveType: EffectiveConnectionType;
    saveData: boolean;
    downlink: number;
    rtt: number;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  };
}

interface PreloadConfig {
  // Number of pages to preload ahead
  preloadCount: number;
  // Number of pages to preload behind (for back navigation)
  preloadBehind: number;
  // Delay before starting preload (ms)
  preloadDelay: number;
  // Whether to use low-quality preload images (if available)
  useLowQuality: boolean;
  // Connection quality descriptor
  quality: 'excellent' | 'good' | 'moderate' | 'poor' | 'offline';
}

const DEFAULT_CONFIG: PreloadConfig = {
  preloadCount: 3,
  preloadBehind: 1,
  preloadDelay: 100,
  useLowQuality: false,
  quality: 'good',
};

/**
 * Get preload configuration based on network conditions
 */
function getPreloadConfig(networkInfo: NetworkInfo | null, basePreloadCount: number): PreloadConfig {
  // If no network info available, use defaults based on provided count
  if (!networkInfo) {
    return {
      ...DEFAULT_CONFIG,
      preloadCount: basePreloadCount,
    };
  }

  // Honor data saver mode
  if (networkInfo.saveData) {
    return {
      preloadCount: 1,
      preloadBehind: 0,
      preloadDelay: 500,
      useLowQuality: true,
      quality: 'moderate',
    };
  }

  // Adjust based on effective connection type
  switch (networkInfo.effectiveType) {
    case 'slow-2g':
      return {
        preloadCount: 0, // Don't preload on very slow connections
        preloadBehind: 0,
        preloadDelay: 1000,
        useLowQuality: true,
        quality: 'poor',
      };
    case '2g':
      return {
        preloadCount: 1,
        preloadBehind: 0,
        preloadDelay: 500,
        useLowQuality: true,
        quality: 'poor',
      };
    case '3g':
      return {
        preloadCount: Math.min(basePreloadCount, 2),
        preloadBehind: 1,
        preloadDelay: 200,
        useLowQuality: false,
        quality: 'moderate',
      };
    case '4g':
    default:
      // Further refine based on actual speed metrics
      if (networkInfo.downlink >= 10) {
        // Very fast connection (10+ Mbps)
        return {
          preloadCount: Math.max(basePreloadCount, 5),
          preloadBehind: 2,
          preloadDelay: 0,
          useLowQuality: false,
          quality: 'excellent',
        };
      } else if (networkInfo.downlink >= 2) {
        // Good connection (2-10 Mbps)
        return {
          preloadCount: basePreloadCount,
          preloadBehind: 1,
          preloadDelay: 100,
          useLowQuality: false,
          quality: 'good',
        };
      } else {
        // Slower 4G connection
        return {
          preloadCount: Math.min(basePreloadCount, 2),
          preloadBehind: 1,
          preloadDelay: 200,
          useLowQuality: false,
          quality: 'moderate',
        };
      }
  }
}

/**
 * Hook for network-aware preloading configuration
 */
export function useNetworkAwarePreload(basePreloadCount: number = 3): PreloadConfig {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Get current network info
  const updateNetworkInfo = useCallback(() => {
    const nav = navigator as NavigatorWithConnection;
    if (nav.connection) {
      setNetworkInfo({
        effectiveType: nav.connection.effectiveType,
        saveData: nav.connection.saveData,
        downlink: nav.connection.downlink,
        rtt: nav.connection.rtt,
      });
    }
  }, []);

  useEffect(() => {
    const nav = navigator as NavigatorWithConnection;

    // Initial network info
    updateNetworkInfo();

    // Listen for network changes
    const handleConnectionChange = () => {
      updateNetworkInfo();
    };

    const handleOnline = () => {
      setIsOnline(true);
      updateNetworkInfo();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    // Network Information API events
    if (nav.connection) {
      nav.connection.addEventListener('change', handleConnectionChange);
    }

    // Online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (nav.connection) {
        nav.connection.removeEventListener('change', handleConnectionChange);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateNetworkInfo]);

  // Return offline config if not online
  if (!isOnline) {
    return {
      preloadCount: 0,
      preloadBehind: 0,
      preloadDelay: 0,
      useLowQuality: false,
      quality: 'offline',
    };
  }

  return getPreloadConfig(networkInfo, basePreloadCount);
}

/**
 * Simple network quality indicator component data
 */
export function useNetworkQuality(): {
  quality: PreloadConfig['quality'];
  label: string;
  color: string;
} {
  const config = useNetworkAwarePreload();

  const labels: Record<PreloadConfig['quality'], string> = {
    excellent: 'Excellent',
    good: 'Good',
    moderate: 'Moderate',
    poor: 'Slow',
    offline: 'Offline',
  };

  const colors: Record<PreloadConfig['quality'], string> = {
    excellent: '#22c55e', // green
    good: '#84cc16', // lime
    moderate: '#eab308', // yellow
    poor: '#f97316', // orange
    offline: '#ef4444', // red
  };

  return {
    quality: config.quality,
    label: labels[config.quality],
    color: colors[config.quality],
  };
}
