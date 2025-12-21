// Theme System Type Definitions

export type ColorScheme = 'light' | 'dark';
export type ThemeId = 'default' | 'dc' | 'marvel' | 'sandman' | 'synthwave' | 'retro' | 'manga' | string; // string for external themes
export type ThemeKey = `${ThemeId}-${ColorScheme}`;

// Effect toggle definition - declared by each theme
export type EffectCategory = 'background' | 'overlay' | 'ui' | 'particles';

export interface EffectToggleDefinition {
  id: string;                    // Unique ID within theme: 'pixelGrid', 'crtEffect', etc.
  label: string;                 // Display name: 'Pixel Grid Overlay'
  description?: string;          // Optional tooltip: 'Adds CRT pixel pattern overlay'
  defaultEnabled: boolean;       // Default state when theme is first used
  category?: EffectCategory;     // For grouping in UI
}

// Effect toggle states - stored per-theme in preferences
export type EffectToggleStates = Record<string, boolean>;  // { pixelGrid: true, crtEffect: false, ... }

export type FontFamily =
  | 'oswald'
  | 'roboto'
  | 'bebas-neue'
  | 'inter'
  | 'cormorant-garamond'
  | 'dm-sans'
  | 'system';

export interface ThemeTokens {
  // Background colors
  colorBg: string;
  colorBgSecondary: string;
  colorBgTertiary: string;
  colorBgElevated: string;
  colorBgCard: string;
  colorSurfaceCardHover: string;

  // Accent/brand colors
  colorPrimary: string;
  colorPrimaryHover: string;
  colorPrimaryMuted: string;
  colorSecondary: string;
  colorAccent: string;

  // Text colors
  colorText: string;
  colorTextMuted: string;
  colorTextSubtle: string;

  // Semantic colors
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorDanger: string;
  colorInfo: string;

  // Borders & interactions
  colorBorder: string;
  colorBorderSubtle: string;
  colorDivider: string;
  colorHover: string;
  colorSelected: string;
  colorFocusRing: string;

  // Typography
  fontDisplay: string;
  fontBody: string;

  // Shadows
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  shadowGlow: string;
  shadowHoverGlow: string;

  // Title effects
  shadowTitleLocation: string; // Shadow offset/blur for headings (e.g., "4px 4px 0")
  colorShadowTitle: string; // Shadow color for title text shadow

  // Border radius
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusXl: string;
  radiusFull: string;
}

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  author?: string;
  previewColors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
}

export interface ThemeDefinition {
  id: ThemeId;
  scheme: ColorScheme;
  meta: ThemeMeta;
  tokens: ThemeTokens;
  effects?: EffectToggleDefinition[];  // Available effects for this theme
}

export interface ThemePreferences {
  themeId: ThemeId;
  colorScheme: ColorScheme;
  followSystem: boolean;
  overrides: Record<string, Record<string, string>>; // Per-theme: { 'default-dark': { '--color-primary': '#fff' } }
  displayFont?: FontFamily;
  bodyFont?: FontFamily;
  effectToggles: Record<string, EffectToggleStates>; // Per-theme effect states: { 'retro-dark': { pixelGrid: true } }
}

export interface ExternalTheme {
  id: string;
  name: string;
  description: string;
  scheme: ColorScheme;
  css: string;
  enabled: boolean;
  filePath: string;
}

export interface ThemeContextValue {
  // Current state
  currentTheme: ThemeDefinition;
  themeId: ThemeId;
  colorScheme: ColorScheme;
  followSystem: boolean;
  userOverrides: Record<string, string>; // Current theme's overrides
  availableThemes: ThemeMeta[];
  externalThemes: ExternalTheme[];
  isEditorOpen: boolean;
  editingThemeId: ThemeId | null; // Theme being edited in the editor (may differ from current)

  // Effect toggles
  effectToggles: EffectToggleStates;           // Current theme's effect states
  availableEffects: EffectToggleDefinition[];  // Current theme's available effects
  getEffectEnabled: (effectId: string) => boolean;
  setEffectEnabled: (effectId: string, enabled: boolean) => void;
  setAllEffectsEnabled: (enabled: boolean) => void;
  getEffectTogglesForTheme: (themeId: ThemeId, scheme: ColorScheme) => EffectToggleStates;
  setEffectEnabledForTheme: (themeId: ThemeId, scheme: ColorScheme, effectId: string, enabled: boolean) => void;
  setAllEffectsEnabledForTheme: (themeId: ThemeId, scheme: ColorScheme, enabled: boolean) => void;

  // Theme selection
  setTheme: (themeId: ThemeId) => void;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
  setFollowSystem: (follow: boolean) => void;

  // Variable overrides (per-theme, persisted to localStorage)
  setOverride: (variable: string, value: string) => void;
  removeOverride: (variable: string) => void;
  clearAllOverrides: () => void;
  resetToDefaults: () => void;

  // Typography
  setDisplayFont: (font: FontFamily) => void;
  setBodyFont: (font: FontFamily) => void;

  // Editor UI
  openEditor: (themeId?: ThemeId) => void;
  closeEditor: () => void;
  getOverridesForTheme: (themeId: ThemeId, scheme: ColorScheme) => Record<string, string>;

  // External theme management
  enableExternalTheme: (themeId: string) => void;
  disableExternalTheme: (themeId: string) => void;
  deleteExternalTheme: (themeId: string) => Promise<void>;
  importTheme: (file: File) => Promise<void>;
  refreshExternalThemes: () => Promise<void>;

  // Export/utility
  getCSSVariable: (variable: string) => string;
  exportCurrentTheme: () => Promise<Blob>;
}

// Variable groups for the editor UI
export interface VariableGroup {
  name: string;
  variables: {
    key: string;
    label: string;
    type: 'color' | 'font' | 'size' | 'shadow' | 'radius';
  }[];
}

export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    name: 'Background Colors',
    variables: [
      { key: 'colorBg', label: '--color-bg', type: 'color' },
      { key: 'colorBgSecondary', label: '--color-bg-secondary', type: 'color' },
      { key: 'colorBgTertiary', label: '--color-bg-tertiary', type: 'color' },
      { key: 'colorBgElevated', label: '--color-bg-elevated', type: 'color' },
      { key: 'colorBgCard', label: '--color-bg-card', type: 'color' },
      { key: 'colorSurfaceCardHover', label: '--color-surface-card-hover', type: 'color' },
    ],
  },
  {
    name: 'Primary & Accent Colors',
    variables: [
      { key: 'colorPrimary', label: '--color-primary', type: 'color' },
      { key: 'colorPrimaryHover', label: '--color-primary-hover', type: 'color' },
      { key: 'colorPrimaryMuted', label: '--color-primary-muted', type: 'color' },
      { key: 'colorSecondary', label: '--color-secondary', type: 'color' },
      { key: 'colorAccent', label: '--color-accent', type: 'color' },
    ],
  },
  {
    name: 'Text Colors',
    variables: [
      { key: 'colorText', label: '--color-text', type: 'color' },
      { key: 'colorTextMuted', label: '--color-text-muted', type: 'color' },
      { key: 'colorTextSubtle', label: '--color-text-subtle', type: 'color' },
    ],
  },
  {
    name: 'Semantic Colors',
    variables: [
      { key: 'colorSuccess', label: '--color-success', type: 'color' },
      { key: 'colorWarning', label: '--color-warning', type: 'color' },
      { key: 'colorError', label: '--color-error', type: 'color' },
      { key: 'colorDanger', label: '--color-danger', type: 'color' },
      { key: 'colorInfo', label: '--color-info', type: 'color' },
    ],
  },
  {
    name: 'Border & Interaction Colors',
    variables: [
      { key: 'colorBorder', label: '--color-border', type: 'color' },
      { key: 'colorBorderSubtle', label: '--color-border-subtle', type: 'color' },
      { key: 'colorDivider', label: '--color-divider', type: 'color' },
      { key: 'colorHover', label: '--color-hover', type: 'color' },
      { key: 'colorSelected', label: '--color-selected', type: 'color' },
      { key: 'colorFocusRing', label: '--color-focus-ring', type: 'color' },
    ],
  },
  {
    name: 'Typography',
    variables: [
      { key: 'fontDisplay', label: '--font-display', type: 'font' },
      { key: 'fontBody', label: '--font-body', type: 'font' },
    ],
  },
  {
    name: 'Shadows',
    variables: [
      { key: 'shadowSm', label: '--shadow-sm', type: 'shadow' },
      { key: 'shadowMd', label: '--shadow-md', type: 'shadow' },
      { key: 'shadowLg', label: '--shadow-lg', type: 'shadow' },
      { key: 'shadowGlow', label: '--shadow-glow', type: 'shadow' },
      { key: 'shadowHoverGlow', label: '--shadow-hover-glow', type: 'shadow' },
    ],
  },
  {
    name: 'Title Effects',
    variables: [
      { key: 'shadowTitleLocation', label: '--shadow-title-location', type: 'shadow' },
      { key: 'colorShadowTitle', label: '--color-shadow-title', type: 'color' },
    ],
  },
  {
    name: 'Border Radius',
    variables: [
      { key: 'radiusSm', label: '--radius-sm', type: 'radius' },
      { key: 'radiusMd', label: '--radius-md', type: 'radius' },
      { key: 'radiusLg', label: '--radius-lg', type: 'radius' },
      { key: 'radiusXl', label: '--radius-xl', type: 'radius' },
      { key: 'radiusFull', label: '--radius-full', type: 'radius' },
    ],
  },
];

// Convert camelCase to kebab-case for CSS variables
export function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// Convert kebab-case to camelCase for TypeScript
export function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
