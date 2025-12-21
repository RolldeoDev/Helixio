import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import JSZip from 'jszip';
import type {
  ThemeContextValue,
  ThemeDefinition,
  ThemeId,
  ColorScheme,
  ThemeMeta,
  ExternalTheme,
  ThemePreferences,
  FontFamily,
  EffectToggleStates,
  EffectToggleDefinition,
} from './types';
import {
  getTheme,
  getDefaultTheme,
  getAvailableThemes,
  applyThemeToDOM,
  generateThemeCSS,
  bundledThemes,
} from './index';

const STORAGE_KEY = 'helixio-theme-preferences';

const defaultPreferences: ThemePreferences = {
  themeId: 'default',
  colorScheme: 'dark',
  followSystem: false,
  overrides: {},
  effectToggles: {}, // Per-theme effect toggle states
};

// Helper to get default effect states from a theme definition
function getDefaultEffectStates(theme: ThemeDefinition): EffectToggleStates {
  if (!theme.effects?.length) return {};
  return theme.effects.reduce((acc, effect) => {
    acc[effect.id] = effect.defaultEnabled;
    return acc;
  }, {} as EffectToggleStates);
}

// Merge stored effect states with theme defaults (handles new effects added to theme)
function mergeEffectStates(
  stored: EffectToggleStates | undefined,
  theme: ThemeDefinition
): EffectToggleStates {
  const defaults = getDefaultEffectStates(theme);
  return { ...defaults, ...(stored || {}) };
}

// Create context with undefined default (will be provided by ThemeProvider)
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Helper to get system color scheme
function getSystemColorScheme(): ColorScheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Load preferences from localStorage with migration support
function loadPreferences(): ThemePreferences {
  if (typeof window === 'undefined') return defaultPreferences;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);

      // Migration: Convert old effectsEnabled to new effectToggles format
      if ('effectsEnabled' in parsed && !('effectToggles' in parsed)) {
        const wasEnabled = parsed.effectsEnabled as boolean;
        delete parsed.effectsEnabled;
        // We'll apply the old global setting when effects are first accessed
        // Store a migration flag to handle this
        parsed.effectToggles = {};
        parsed._migratedFromEffectsEnabled = wasEnabled;
      }

      return { ...defaultPreferences, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load theme preferences:', e);
  }

  return defaultPreferences;
}

// Save preferences to localStorage
function savePreferences(prefs: ThemePreferences): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('Failed to save theme preferences:', e);
  }
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Load initial preferences
  const [preferences, setPreferences] = useState<ThemePreferences>(loadPreferences);
  const [externalThemes, setExternalThemes] = useState<ExternalTheme[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingThemeId, setEditingThemeId] = useState<ThemeId | null>(null);

  // Compute effective color scheme
  const effectiveColorScheme = useMemo((): ColorScheme => {
    if (preferences.followSystem) {
      return getSystemColorScheme();
    }
    return preferences.colorScheme;
  }, [preferences.followSystem, preferences.colorScheme]);

  // Get current theme definition
  const currentTheme = useMemo((): ThemeDefinition => {
    // First check bundled themes
    const bundled = getTheme(preferences.themeId, effectiveColorScheme);
    if (bundled) return bundled;

    // Check external themes
    const external = externalThemes.find(
      (t) => t.id === preferences.themeId && t.enabled
    );
    if (external) {
      // Convert external theme to ThemeDefinition format
      // For external themes, we use the default theme as base and apply CSS overrides
      const baseTheme = getDefaultTheme(effectiveColorScheme);
      return {
        ...baseTheme,
        id: external.id,
        scheme: external.scheme,
        meta: {
          id: external.id,
          name: external.name,
          description: external.description,
          previewColors: baseTheme.meta.previewColors,
        },
      };
    }

    // Fallback to default
    return getDefaultTheme(effectiveColorScheme);
  }, [preferences.themeId, effectiveColorScheme, externalThemes]);

  // Get current theme's overrides
  const themeKey = `${currentTheme.id}-${currentTheme.scheme}`;
  const userOverrides = preferences.overrides[themeKey] || {};

  // When editor is open, we may be editing a different theme
  const editingThemeKey = useMemo(() => {
    if (editingThemeId) {
      return `${editingThemeId}-${effectiveColorScheme}`;
    }
    return themeKey;
  }, [editingThemeId, effectiveColorScheme, themeKey]);

  // Apply theme when it changes
  useEffect(() => {
    applyThemeToDOM(currentTheme, userOverrides);
  }, [currentTheme, userOverrides]);

  // Listen for system color scheme changes
  useEffect(() => {
    if (!preferences.followSystem) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      // Re-apply theme with new system preference
      const newScheme = getSystemColorScheme();
      const theme = getTheme(preferences.themeId, newScheme) || getDefaultTheme(newScheme);
      const key = `${theme.id}-${theme.scheme}`;
      applyThemeToDOM(theme, preferences.overrides[key] || {});
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [preferences.followSystem, preferences.themeId, preferences.overrides]);

  // Save preferences when they change
  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  // Load external themes on mount
  useEffect(() => {
    refreshExternalThemes();

    // Set up SSE for hot reload
    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/themes/watch');
        eventSource.onmessage = (event) => {
          try {
            const themes = JSON.parse(event.data);
            setExternalThemes(themes);
          } catch (e) {
            console.warn('Failed to parse theme update:', e);
          }
        };
        eventSource.onerror = () => {
          // Reconnect after a delay
          eventSource?.close();
          setTimeout(connectSSE, 5000);
        };
      } catch (e) {
        // SSE not available, fall back to manual refresh
        console.warn('Theme hot reload not available');
      }
    };

    connectSSE();

    return () => {
      eventSource?.close();
    };
  }, []);

  // Actions
  const setTheme = useCallback((themeId: ThemeId) => {
    setPreferences((prev) => ({ ...prev, themeId }));
  }, []);

  const setColorScheme = useCallback((colorScheme: ColorScheme) => {
    setPreferences((prev) => ({ ...prev, colorScheme, followSystem: false }));
  }, []);

  const toggleColorScheme = useCallback(() => {
    setPreferences((prev) => ({
      ...prev,
      colorScheme: prev.colorScheme === 'dark' ? 'light' : 'dark',
      followSystem: false,
    }));
  }, []);

  const setFollowSystem = useCallback((followSystem: boolean) => {
    setPreferences((prev) => ({ ...prev, followSystem }));
  }, []);

  // Effect toggle methods
  const effectToggles = useMemo((): EffectToggleStates => {
    const key = `${currentTheme.id}-${currentTheme.scheme}`;
    const stored = preferences.effectToggles[key];

    // Handle migration from old effectsEnabled
    if ((preferences as unknown as { _migratedFromEffectsEnabled?: boolean })._migratedFromEffectsEnabled !== undefined) {
      const wasEnabled = (preferences as unknown as { _migratedFromEffectsEnabled: boolean })._migratedFromEffectsEnabled;
      // Initialize all effects based on old global setting
      const allStates: EffectToggleStates = {};
      currentTheme.effects?.forEach((effect) => {
        allStates[effect.id] = wasEnabled ? effect.defaultEnabled : false;
      });
      return allStates;
    }

    return mergeEffectStates(stored, currentTheme);
  }, [currentTheme, preferences.effectToggles, preferences]);

  const availableEffects = useMemo((): EffectToggleDefinition[] => {
    return currentTheme.effects || [];
  }, [currentTheme]);

  const getEffectEnabled = useCallback((effectId: string): boolean => {
    return effectToggles[effectId] ?? false;
  }, [effectToggles]);

  const setEffectEnabled = useCallback((effectId: string, enabled: boolean) => {
    const key = `${currentTheme.id}-${currentTheme.scheme}`;
    setPreferences((prev) => {
      // Clear migration flag if present
      const newPrefs = { ...prev };
      delete (newPrefs as unknown as { _migratedFromEffectsEnabled?: boolean })._migratedFromEffectsEnabled;

      return {
        ...newPrefs,
        effectToggles: {
          ...newPrefs.effectToggles,
          [key]: {
            ...mergeEffectStates(newPrefs.effectToggles[key], currentTheme),
            [effectId]: enabled,
          },
        },
      };
    });
  }, [currentTheme]);

  const setAllEffectsEnabled = useCallback((enabled: boolean) => {
    const key = `${currentTheme.id}-${currentTheme.scheme}`;
    const allStates: EffectToggleStates = {};
    currentTheme.effects?.forEach((effect) => {
      allStates[effect.id] = enabled;
    });

    setPreferences((prev) => {
      // Clear migration flag if present
      const newPrefs = { ...prev };
      delete (newPrefs as unknown as { _migratedFromEffectsEnabled?: boolean })._migratedFromEffectsEnabled;

      return {
        ...newPrefs,
        effectToggles: {
          ...newPrefs.effectToggles,
          [key]: allStates,
        },
      };
    });
  }, [currentTheme]);

  const getEffectTogglesForTheme = useCallback(
    (themeId: ThemeId, scheme: ColorScheme): EffectToggleStates => {
      const key = `${themeId}-${scheme}`;
      const theme = getTheme(themeId, scheme);
      if (!theme) return {};
      return mergeEffectStates(preferences.effectToggles[key], theme);
    },
    [preferences.effectToggles]
  );

  const setEffectEnabledForTheme = useCallback(
    (themeId: ThemeId, scheme: ColorScheme, effectId: string, enabled: boolean) => {
      const key = `${themeId}-${scheme}`;
      const theme = getTheme(themeId, scheme);
      if (!theme) return;

      setPreferences((prev) => ({
        ...prev,
        effectToggles: {
          ...prev.effectToggles,
          [key]: {
            ...mergeEffectStates(prev.effectToggles[key], theme),
            [effectId]: enabled,
          },
        },
      }));
    },
    []
  );

  const setAllEffectsEnabledForTheme = useCallback(
    (themeId: ThemeId, scheme: ColorScheme, enabled: boolean) => {
      const key = `${themeId}-${scheme}`;
      const theme = getTheme(themeId, scheme);
      if (!theme) return;

      const allStates: EffectToggleStates = {};
      theme.effects?.forEach((effect) => {
        allStates[effect.id] = enabled;
      });

      setPreferences((prev) => ({
        ...prev,
        effectToggles: {
          ...prev.effectToggles,
          [key]: allStates,
        },
      }));
    },
    []
  );

  const setOverride = useCallback(
    (variable: string, value: string) => {
      const key = editingThemeKey;
      setPreferences((prev) => ({
        ...prev,
        overrides: {
          ...prev.overrides,
          [key]: {
            ...(prev.overrides[key] || {}),
            [variable]: value,
          },
        },
      }));
    },
    [editingThemeKey]
  );

  const removeOverride = useCallback(
    (variable: string) => {
      const key = editingThemeKey;
      setPreferences((prev) => {
        const currentOverrides = { ...(prev.overrides[key] || {}) };
        delete currentOverrides[variable];

        return {
          ...prev,
          overrides: {
            ...prev.overrides,
            [key]: currentOverrides,
          },
        };
      });
    },
    [editingThemeKey]
  );

  const clearAllOverrides = useCallback(() => {
    const key = editingThemeKey;
    setPreferences((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        [key]: {},
      },
    }));
  }, [editingThemeKey]);

  const resetToDefaults = useCallback(() => {
    const key = editingThemeKey;
    // Get the original bundled theme
    const originalTheme = bundledThemes[key as keyof typeof bundledThemes];
    if (originalTheme) {
      // Clear overrides and re-apply original
      setPreferences((prev) => ({
        ...prev,
        overrides: {
          ...prev.overrides,
          [key]: {},
        },
      }));
    }
  }, [editingThemeKey]);

  const setDisplayFont = useCallback((font: FontFamily) => {
    const fontValue = getFontValue(font, 'display');
    setOverride('--font-display', fontValue);
  }, [setOverride]);

  const setBodyFont = useCallback((font: FontFamily) => {
    const fontValue = getFontValue(font, 'body');
    setOverride('--font-body', fontValue);
  }, [setOverride]);

  const openEditor = useCallback((themeIdToEdit?: ThemeId) => {
    setEditingThemeId(themeIdToEdit ?? preferences.themeId);
    setIsEditorOpen(true);
  }, [preferences.themeId]);
  const closeEditor = useCallback(() => {
    setIsEditorOpen(false);
    setEditingThemeId(null);
  }, []);

  const getOverridesForTheme = useCallback(
    (themeId: ThemeId, scheme: ColorScheme): Record<string, string> => {
      const key = `${themeId}-${scheme}`;
      return preferences.overrides[key] || {};
    },
    [preferences.overrides]
  );

  const enableExternalTheme = useCallback((id: string) => {
    setExternalThemes((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled: true } : t))
    );
  }, []);

  const disableExternalTheme = useCallback((id: string) => {
    setExternalThemes((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled: false } : t))
    );
  }, []);

  const deleteExternalTheme = useCallback(async (id: string) => {
    try {
      await fetch(`/api/themes/external/${id}`, { method: 'DELETE' });
      setExternalThemes((prev) => prev.filter((t) => t.id !== id));

      // If current theme was deleted, switch to default
      if (preferences.themeId === id) {
        setTheme('default');
      }
    } catch (e) {
      console.error('Failed to delete theme:', e);
      throw e;
    }
  }, [preferences.themeId, setTheme]);

  const importTheme = useCallback(async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('theme', file);

      const response = await fetch('/api/themes/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to import theme');
      }

      // Refresh themes list
      await refreshExternalThemes();
    } catch (e) {
      console.error('Failed to import theme:', e);
      throw e;
    }
  }, []);

  const refreshExternalThemes = useCallback(async () => {
    try {
      const response = await fetch('/api/themes/external');
      if (response.ok) {
        const themes = await response.json();
        setExternalThemes(themes);
      }
    } catch (e) {
      // External themes API not available
      console.warn('External themes not available');
    }
  }, []);

  const getCSSVariable = useCallback(
    (variable: string): string => {
      // Check user overrides first
      const cssVar = variable.startsWith('--') ? variable : `--${variable}`;
      if (userOverrides[cssVar]) {
        return userOverrides[cssVar];
      }

      // Get from computed style
      if (typeof window !== 'undefined') {
        return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
      }

      return '';
    },
    [userOverrides]
  );

  const exportCurrentTheme = useCallback(async (): Promise<Blob> => {
    const zip = new JSZip();

    // Create metadata
    const metadata = {
      id: `${currentTheme.id}-custom`,
      name: `${currentTheme.meta.name} (Custom)`,
      description: currentTheme.meta.description,
      author: 'User Export',
      version: '1.0.0',
      scheme: currentTheme.scheme,
    };

    // Generate CSS with overrides
    const css = generateThemeCSS(currentTheme, userOverrides);

    zip.file('theme.json', JSON.stringify(metadata, null, 2));
    zip.file('theme.css', css);

    return zip.generateAsync({ type: 'blob' });
  }, [currentTheme, userOverrides]);

  // Get available themes (bundled + external)
  const availableThemes: ThemeMeta[] = useMemo(() => {
    const bundled = getAvailableThemes();
    const external = externalThemes
      .filter((t) => t.enabled)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        previewColors: {
          primary: '#888',
          secondary: '#444',
          accent: '#666',
          background: t.scheme === 'dark' ? '#1a1a1a' : '#f5f5f5',
        },
      }));

    return [...bundled, ...external];
  }, [externalThemes]);

  const value: ThemeContextValue = {
    currentTheme,
    themeId: preferences.themeId,
    colorScheme: effectiveColorScheme,
    followSystem: preferences.followSystem,
    userOverrides,
    availableThemes,
    externalThemes,
    isEditorOpen,
    editingThemeId,
    // Effect toggles
    effectToggles,
    availableEffects,
    getEffectEnabled,
    setEffectEnabled,
    setAllEffectsEnabled,
    getEffectTogglesForTheme,
    setEffectEnabledForTheme,
    setAllEffectsEnabledForTheme,
    // Theme selection
    setTheme,
    setColorScheme,
    toggleColorScheme,
    setFollowSystem,
    setOverride,
    removeOverride,
    clearAllOverrides,
    resetToDefaults,
    setDisplayFont,
    setBodyFont,
    openEditor,
    closeEditor,
    getOverridesForTheme,
    enableExternalTheme,
    disableExternalTheme,
    deleteExternalTheme,
    importTheme,
    refreshExternalThemes,
    getCSSVariable,
    exportCurrentTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Hook to use theme context
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Helper to get font CSS value from FontFamily
function getFontValue(font: FontFamily, type: 'display' | 'body'): string {
  const fontMap: Record<FontFamily, string> = {
    'oswald': "'Oswald', sans-serif",
    'roboto': "'Roboto', system-ui, sans-serif",
    'bebas-neue': "'Bebas Neue', sans-serif",
    'inter': "'Inter', system-ui, sans-serif",
    'cormorant-garamond': "'Cormorant Garamond', Georgia, serif",
    'dm-sans': "'DM Sans', system-ui, sans-serif",
    'system': type === 'display'
      ? "system-ui, -apple-system, sans-serif"
      : "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  return fontMap[font] || fontMap.system;
}

export default ThemeContext;
