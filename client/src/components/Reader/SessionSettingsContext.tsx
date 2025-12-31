/**
 * Session Settings Context
 *
 * Manages reader settings that persist within a single reading session.
 * When users change settings (zoom, brightness, color correction, etc.),
 * those changes persist for all issues read until the reader is closed.
 * When the reader reopens, settings reset to the resolved preset.
 *
 * This context wraps ReaderProvider and persists across file navigation
 * (when navigating between issues via reading queue, next/prev issue, etc.)
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  ReadingDirection,
  ImageScaling,
  ImageSplitting,
  BackgroundColor,
  ColorCorrection,
} from '../../services/api.service';
import type { ReadingMode } from './ReaderContext';

// =============================================================================
// Types
// =============================================================================

/**
 * Settings that are scoped to a reading session.
 * These persist when navigating between issues within the same session.
 */
export interface SessionSettings {
  mode: ReadingMode;
  direction: ReadingDirection;
  scaling: ImageScaling;
  customWidth: number | null;
  splitting: ImageSplitting;
  background: BackgroundColor;
  brightness: number;
  colorCorrection: ColorCorrection;
  showPageShadow: boolean;
  autoHideUI: boolean;
  preloadCount: number;
  usePhysicalNavigation: boolean | null;
  webtoonGap: number;
  webtoonMaxWidth: number;
  zoom: number;
}

export interface SessionSettingsContextValue {
  /**
   * Current session settings. Null if no modifications have been made this session.
   * When non-null, these settings override preset settings for all issues.
   */
  sessionSettings: SessionSettings | null;

  /**
   * The original preset settings from when the session started.
   * Used for "Reset to Preset" functionality.
   */
  presetSettings: SessionSettings | null;

  /**
   * Whether the user has modified any settings during this session.
   */
  hasSessionModifications: boolean;

  /**
   * Update a single setting value. Creates session settings if they don't exist.
   * Called when user changes any setting in the reader.
   */
  updateSessionSetting: <K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) => void;

  /**
   * Bulk update multiple settings at once.
   * Useful when applying a preset during the session.
   */
  updateSessionSettings: (settings: Partial<SessionSettings>) => void;

  /**
   * Called when loading settings from the API for a new file.
   * Stores the preset as baseline on first call, but does NOT overwrite session settings.
   */
  initializeFromPreset: (settings: SessionSettings) => void;

  /**
   * Clear session modifications and revert to preset settings.
   * Used by "Reset to Preset" button.
   */
  clearSessionSettings: () => void;
}

// =============================================================================
// Context
// =============================================================================

const SessionSettingsContext = createContext<SessionSettingsContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface SessionSettingsProviderProps {
  children: ReactNode;
}

export function SessionSettingsProvider({ children }: SessionSettingsProviderProps) {
  // Session settings - null means no modifications, use preset
  const [sessionSettings, setSessionSettings] = useState<SessionSettings | null>(null);

  // Preset settings - the original settings from the first file in this session
  const [presetSettings, setPresetSettings] = useState<SessionSettings | null>(null);

  const hasSessionModifications = sessionSettings !== null;

  /**
   * Initialize from preset settings (called when loading a new file).
   * On first call, stores preset as baseline.
   * On subsequent calls, does NOT overwrite session settings.
   */
  const initializeFromPreset = useCallback((settings: SessionSettings) => {
    // Only store preset if we don't have one yet (first file in session)
    setPresetSettings((current) => current ?? settings);
    // Don't modify sessionSettings - if user has made changes, keep them
  }, []);

  /**
   * Update a single setting value.
   */
  const updateSessionSetting = useCallback(<K extends keyof SessionSettings>(
    key: K,
    value: SessionSettings[K]
  ) => {
    setSessionSettings((current) => {
      // If we don't have session settings yet, create from preset
      const base = current ?? presetSettings;
      if (!base) {
        // Edge case: no preset loaded yet, shouldn't happen in normal flow
        console.warn('SessionSettings: Cannot update setting before preset is loaded');
        return current;
      }
      return { ...base, [key]: value };
    });
  }, [presetSettings]);

  /**
   * Bulk update multiple settings at once.
   */
  const updateSessionSettings = useCallback((settings: Partial<SessionSettings>) => {
    setSessionSettings((current) => {
      const base = current ?? presetSettings;
      if (!base) {
        console.warn('SessionSettings: Cannot update settings before preset is loaded');
        return current;
      }
      return { ...base, ...settings };
    });
  }, [presetSettings]);

  /**
   * Clear session modifications - revert to preset.
   */
  const clearSessionSettings = useCallback(() => {
    setSessionSettings(null);
  }, []);

  const value: SessionSettingsContextValue = {
    sessionSettings,
    presetSettings,
    hasSessionModifications,
    updateSessionSetting,
    updateSessionSettings,
    initializeFromPreset,
    clearSessionSettings,
  };

  return (
    <SessionSettingsContext.Provider value={value}>
      {children}
    </SessionSettingsContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access session settings context.
 * Must be used within a SessionSettingsProvider.
 */
export function useSessionSettings(): SessionSettingsContextValue {
  const context = useContext(SessionSettingsContext);
  if (!context) {
    throw new Error('useSessionSettings must be used within a SessionSettingsProvider');
  }
  return context;
}

/**
 * Optional hook that returns null if not within provider.
 * Useful for components that may or may not be in a session context.
 */
export function useSessionSettingsOptional(): SessionSettingsContextValue | null {
  return useContext(SessionSettingsContext);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract session-relevant settings from a full ReaderSettings object.
 */
export function extractSessionSettings(settings: {
  mode: ReadingMode;
  direction: ReadingDirection;
  scaling: ImageScaling;
  customWidth?: number | null;
  splitting: ImageSplitting;
  background: BackgroundColor;
  brightness: number;
  colorCorrection: ColorCorrection;
  showPageShadow: boolean;
  autoHideUI: boolean;
  preloadCount: number;
  usePhysicalNavigation?: boolean | null;
  webtoonGap?: number;
  webtoonMaxWidth?: number;
  zoom?: number;
}): SessionSettings {
  return {
    mode: settings.mode,
    direction: settings.direction,
    scaling: settings.scaling,
    customWidth: settings.customWidth ?? null,
    splitting: settings.splitting,
    background: settings.background,
    brightness: settings.brightness,
    colorCorrection: settings.colorCorrection,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
    usePhysicalNavigation: settings.usePhysicalNavigation ?? null,
    webtoonGap: settings.webtoonGap ?? 8,
    webtoonMaxWidth: settings.webtoonMaxWidth ?? 800,
    zoom: settings.zoom ?? 1,
  };
}
