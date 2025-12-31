/**
 * Session Settings Context Tests
 *
 * Tests for the session-scoped reader settings that persist
 * within a single reading session.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import {
  SessionSettingsProvider,
  useSessionSettings,
  extractSessionSettings,
  type SessionSettings,
} from '../SessionSettingsContext';

// Helper to wrap hook in provider
const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionSettingsProvider>{children}</SessionSettingsProvider>
);

// Sample preset settings
const samplePresetSettings: SessionSettings = {
  mode: 'single',
  direction: 'ltr',
  scaling: 'fitHeight',
  customWidth: null,
  splitting: 'none',
  background: 'black',
  brightness: 100,
  colorCorrection: 'none',
  showPageShadow: true,
  autoHideUI: true,
  preloadCount: 3,
  usePhysicalNavigation: null,
  webtoonGap: 8,
  webtoonMaxWidth: 800,
  zoom: 1,
};

describe('SessionSettingsContext', () => {
  describe('Initial State', () => {
    it('should start with no session modifications', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      expect(result.current.sessionSettings).toBeNull();
      expect(result.current.presetSettings).toBeNull();
      expect(result.current.hasSessionModifications).toBe(false);
    });
  });

  describe('initializeFromPreset', () => {
    it('should store preset settings on first call', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      act(() => {
        result.current.initializeFromPreset(samplePresetSettings);
      });

      expect(result.current.presetSettings).toEqual(samplePresetSettings);
      expect(result.current.sessionSettings).toBeNull();
      expect(result.current.hasSessionModifications).toBe(false);
    });

    it('should not overwrite preset on subsequent calls', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      const firstPreset = { ...samplePresetSettings, mode: 'single' as const };
      const secondPreset = { ...samplePresetSettings, mode: 'double' as const };

      act(() => {
        result.current.initializeFromPreset(firstPreset);
      });

      act(() => {
        result.current.initializeFromPreset(secondPreset);
      });

      // Should still have the first preset
      expect(result.current.presetSettings?.mode).toBe('single');
    });
  });

  describe('updateSessionSetting', () => {
    it('should create session settings from preset when updating', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      // Initialize preset first
      act(() => {
        result.current.initializeFromPreset(samplePresetSettings);
      });

      // Update a setting
      act(() => {
        result.current.updateSessionSetting('zoom', 2);
      });

      expect(result.current.sessionSettings).not.toBeNull();
      expect(result.current.sessionSettings?.zoom).toBe(2);
      expect(result.current.hasSessionModifications).toBe(true);
    });

    it('should preserve other settings when updating one', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      act(() => {
        result.current.initializeFromPreset(samplePresetSettings);
      });

      act(() => {
        result.current.updateSessionSetting('brightness', 80);
      });

      // All other settings should be preserved from preset
      expect(result.current.sessionSettings?.mode).toBe('single');
      expect(result.current.sessionSettings?.direction).toBe('ltr');
      expect(result.current.sessionSettings?.brightness).toBe(80);
    });

    it('should update existing session settings', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      act(() => {
        result.current.initializeFromPreset(samplePresetSettings);
      });

      // First update
      act(() => {
        result.current.updateSessionSetting('zoom', 2);
      });

      // Second update
      act(() => {
        result.current.updateSessionSetting('brightness', 80);
      });

      expect(result.current.sessionSettings?.zoom).toBe(2);
      expect(result.current.sessionSettings?.brightness).toBe(80);
    });

    it('should warn if called before preset is initialized', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      act(() => {
        result.current.updateSessionSetting('zoom', 2);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'SessionSettings: Cannot update setting before preset is loaded'
      );
      expect(result.current.sessionSettings).toBeNull();

      consoleSpy.mockRestore();
    });
  });

  describe('updateSessionSettings', () => {
    it('should bulk update multiple settings', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      act(() => {
        result.current.initializeFromPreset(samplePresetSettings);
      });

      act(() => {
        result.current.updateSessionSettings({
          zoom: 2,
          brightness: 80,
          mode: 'double',
        });
      });

      expect(result.current.sessionSettings?.zoom).toBe(2);
      expect(result.current.sessionSettings?.brightness).toBe(80);
      expect(result.current.sessionSettings?.mode).toBe('double');
    });
  });

  describe('clearSessionSettings', () => {
    it('should clear session settings and revert to preset', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      act(() => {
        result.current.initializeFromPreset(samplePresetSettings);
      });

      // Make some changes
      act(() => {
        result.current.updateSessionSetting('zoom', 2);
        result.current.updateSessionSetting('brightness', 80);
      });

      expect(result.current.hasSessionModifications).toBe(true);

      // Clear
      act(() => {
        result.current.clearSessionSettings();
      });

      expect(result.current.sessionSettings).toBeNull();
      expect(result.current.hasSessionModifications).toBe(false);
      // Preset should still be there
      expect(result.current.presetSettings).toEqual(samplePresetSettings);
    });
  });

  describe('hasSessionModifications', () => {
    it('should be false initially', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });
      expect(result.current.hasSessionModifications).toBe(false);
    });

    it('should be false after initializing preset', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      act(() => {
        result.current.initializeFromPreset(samplePresetSettings);
      });

      expect(result.current.hasSessionModifications).toBe(false);
    });

    it('should be true after modifying a setting', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      act(() => {
        result.current.initializeFromPreset(samplePresetSettings);
      });

      act(() => {
        result.current.updateSessionSetting('zoom', 2);
      });

      expect(result.current.hasSessionModifications).toBe(true);
    });

    it('should be false after clearing session settings', () => {
      const { result } = renderHook(() => useSessionSettings(), { wrapper });

      act(() => {
        result.current.initializeFromPreset(samplePresetSettings);
      });

      act(() => {
        result.current.updateSessionSetting('zoom', 2);
      });

      act(() => {
        result.current.clearSessionSettings();
      });

      expect(result.current.hasSessionModifications).toBe(false);
    });
  });
});

describe('extractSessionSettings', () => {
  it('should extract session settings from full settings object', () => {
    const fullSettings = {
      mode: 'double' as const,
      direction: 'rtl' as const,
      scaling: 'fitWidth' as const,
      customWidth: 800,
      splitting: 'ltr' as const,
      background: 'white' as const,
      brightness: 120,
      colorCorrection: 'sepia-correct' as const,
      showPageShadow: false,
      autoHideUI: false,
      preloadCount: 5,
      usePhysicalNavigation: true,
      webtoonGap: 16,
      webtoonMaxWidth: 1000,
      zoom: 1.5,
    };

    const extracted = extractSessionSettings(fullSettings);

    expect(extracted).toEqual(fullSettings);
  });

  it('should use defaults for missing optional fields', () => {
    const minimalSettings = {
      mode: 'single' as const,
      direction: 'ltr' as const,
      scaling: 'fitHeight' as const,
      splitting: 'none' as const,
      background: 'black' as const,
      brightness: 100,
      colorCorrection: 'none' as const,
      showPageShadow: true,
      autoHideUI: true,
      preloadCount: 3,
    };

    const extracted = extractSessionSettings(minimalSettings);

    expect(extracted.customWidth).toBeNull();
    expect(extracted.usePhysicalNavigation).toBeNull();
    expect(extracted.webtoonGap).toBe(8);
    expect(extracted.webtoonMaxWidth).toBe(800);
    expect(extracted.zoom).toBe(1);
  });
});

describe('useSessionSettings error handling', () => {
  it('should throw if used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useSessionSettings());
    }).toThrow('useSessionSettings must be used within a SessionSettingsProvider');

    consoleSpy.mockRestore();
  });
});
