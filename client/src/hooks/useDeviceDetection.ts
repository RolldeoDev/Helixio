/**
 * useDeviceDetection Hook
 *
 * Provides device detection for responsive behavior, combining
 * CSS media query detection with JavaScript touch capability detection.
 */

import { useState, useEffect, useCallback } from 'react';

export interface DeviceInfo {
  /** True if device has touch capability (pointer: coarse) */
  isTouchDevice: boolean;
  /** True if touch device with width >= 768px */
  isTablet: boolean;
  /** True if touch device with width < 768px */
  isMobile: boolean;
  /** True if device has fine pointer (mouse/trackpad) */
  isDesktop: boolean;
  /** True if viewport is in landscape orientation */
  isLandscape: boolean;
  /** True if viewport is in portrait orientation */
  isPortrait: boolean;
  /** Current viewport width */
  screenWidth: number;
  /** Current viewport height */
  screenHeight: number;
}

const TABLET_MIN_WIDTH = 768;

/**
 * Check if the device has touch capability using multiple detection methods
 */
function detectTouchCapability(): boolean {
  // Primary: Check for coarse pointer (touch screens)
  if (typeof window !== 'undefined' && window.matchMedia) {
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    if (coarsePointer.matches) {
      return true;
    }
  }

  // Secondary: Check for hover: none (touch devices typically don't hover)
  if (typeof window !== 'undefined' && window.matchMedia) {
    const noHover = window.matchMedia('(hover: none)');
    if (noHover.matches) {
      return true;
    }
  }

  // Fallback: Check for touch event support
  if (typeof window !== 'undefined') {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  return false;
}

/**
 * Get current device info based on viewport and capabilities
 */
function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    // SSR fallback
    return {
      isTouchDevice: false,
      isTablet: false,
      isMobile: false,
      isDesktop: true,
      isLandscape: true,
      isPortrait: false,
      screenWidth: 1920,
      screenHeight: 1080,
    };
  }

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const isTouchDevice = detectTouchCapability();
  const isLandscape = screenWidth > screenHeight;
  const isPortrait = !isLandscape;

  // Desktop: has fine pointer (mouse/trackpad) OR non-touch device
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
  const isDesktop = hasFinePointer && !isTouchDevice;

  // Mobile: touch device with width < 768px
  const isMobile = isTouchDevice && screenWidth < TABLET_MIN_WIDTH;

  // Tablet: touch device with width >= 768px
  const isTablet = isTouchDevice && screenWidth >= TABLET_MIN_WIDTH;

  return {
    isTouchDevice,
    isTablet,
    isMobile,
    isDesktop,
    isLandscape,
    isPortrait,
    screenWidth,
    screenHeight,
  };
}

/**
 * Hook for detecting device type and capabilities
 *
 * @example
 * ```tsx
 * const { isTouchDevice, isTablet, isLandscape } = useDeviceDetection();
 *
 * if (isTouchDevice && isTablet) {
 *   // Render tablet-optimized UI
 * }
 * ```
 */
export function useDeviceDetection(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(getDeviceInfo);

  const updateDeviceInfo = useCallback(() => {
    setDeviceInfo(getDeviceInfo());
  }, []);

  useEffect(() => {
    // Update on resize
    window.addEventListener('resize', updateDeviceInfo);

    // Update on orientation change
    window.addEventListener('orientationchange', updateDeviceInfo);

    // Listen to media query changes for pointer type
    const pointerQuery = window.matchMedia('(pointer: coarse)');
    const hoverQuery = window.matchMedia('(hover: none)');

    // Modern API uses addEventListener, older uses addListener
    const addMediaListener = (
      query: MediaQueryList,
      handler: () => void
    ) => {
      if (query.addEventListener) {
        query.addEventListener('change', handler);
      } else {
        // Fallback for older browsers
        query.addListener(handler);
      }
    };

    const removeMediaListener = (
      query: MediaQueryList,
      handler: () => void
    ) => {
      if (query.removeEventListener) {
        query.removeEventListener('change', handler);
      } else {
        query.removeListener(handler);
      }
    };

    addMediaListener(pointerQuery, updateDeviceInfo);
    addMediaListener(hoverQuery, updateDeviceInfo);

    return () => {
      window.removeEventListener('resize', updateDeviceInfo);
      window.removeEventListener('orientationchange', updateDeviceInfo);
      removeMediaListener(pointerQuery, updateDeviceInfo);
      removeMediaListener(hoverQuery, updateDeviceInfo);
    };
  }, [updateDeviceInfo]);

  return deviceInfo;
}
