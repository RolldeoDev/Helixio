/**
 * Theme Registry
 * Central hub for all theme definitions and utilities
 */

import type {
  ThemeDefinition,
  ThemeMeta,
  ThemeId,
  ColorScheme,
  ThemeKey,
  ThemeTokens,
} from './types';

// Import bundled themes
// New default theme - Helix (DNA Nexus)
import { helixDarkTheme } from './bundled/helix-dark';
import { helixLightTheme } from './bundled/helix-light';
// Legacy Collector's Archive theme (renamed from default)
import { collectorsDarkTheme } from './bundled/default-dark';
import { collectorsLightTheme } from './bundled/default-light';
// Other themes
import { dcDarkTheme } from './bundled/dc-dark';
import { dcLightTheme } from './bundled/dc-light';
import { marvelDarkTheme } from './bundled/marvel-dark';
import { marvelLightTheme } from './bundled/marvel-light';
import { sandmanDarkTheme } from './bundled/sandman-dark';
import { sandmanLightTheme } from './bundled/sandman-light';
import { synthwaveDarkTheme } from './bundled/synthwave-dark';
import { synthwaveLightTheme } from './bundled/synthwave-light';
import { retroDarkTheme } from './bundled/retro-dark';
import { retroLightTheme } from './bundled/retro-light';
import { mangaDarkTheme } from './bundled/manga-dark';
import { mangaLightTheme } from './bundled/manga-light';
import { highContrastDarkTheme } from './bundled/high-contrast-dark';
import { highContrastLightTheme } from './bundled/high-contrast-light';
import { pulpDarkTheme } from './bundled/pulp-dark';
import { pulpLightTheme } from './bundled/pulp-light';

// Re-export types
export * from './types';

// Default token values for backward compatibility with external themes
// that may not have all the new properties
export const DEFAULT_TOKENS: Partial<ThemeTokens> = {
  // Radius
  radiusXs: '2px',
  // Overlays
  overlayDarkSubtle: 'rgba(0, 0, 0, 0.1)',
  overlayDarkLight: 'rgba(0, 0, 0, 0.2)',
  overlayDarkMedium: 'rgba(0, 0, 0, 0.3)',
  overlayDarkHeavy: 'rgba(0, 0, 0, 0.5)',
  overlayDarkIntense: 'rgba(0, 0, 0, 0.7)',
  overlayLightSubtle: 'rgba(255, 255, 255, 0.05)',
  overlayLightLight: 'rgba(255, 255, 255, 0.1)',
  overlayLightMedium: 'rgba(255, 255, 255, 0.15)',
  overlayLightHeavy: 'rgba(255, 255, 255, 0.3)',
  // Spacing
  spacing2: '2px',
  spacingXs: '4px',
  spacing6: '6px',
  spacingSm: '8px',
  spacing10: '10px',
  spacing12: '12px',
  spacingMd: '16px',
  spacing20: '20px',
  spacingLg: '24px',
  spacingXl: '32px',
  spacing2xl: '48px',
  // Font sizes
  fontSizeXs: '0.75rem',
  fontSizeSm: '0.875rem',
  fontSizeBase: '1rem',
  fontSizeLg: '1.125rem',
  fontSizeXl: '1.25rem',
  fontSize2xl: '1.5rem',
  fontSize3xl: '1.875rem',
  fontSize4xl: '2.25rem',
};

// Re-export theme effects components
export { HelixEffects } from './helix';
export { SandmanEffects } from './sandman';
export { SynthwaveEffects } from './synthwave';
export { RetroEffects } from './retro';
export { MangaEffects } from './manga';
export { PulpEffects } from './pulp';

// All bundled themes
export const bundledThemes: Record<ThemeKey, ThemeDefinition> = {
  // Default theme - Helix (DNA Nexus)
  'default-dark': helixDarkTheme,
  'default-light': helixLightTheme,
  // Collector's Archive (legacy default)
  'collectors-dark': collectorsDarkTheme,
  'collectors-light': collectorsLightTheme,
  // Other themes
  'dc-dark': dcDarkTheme,
  'dc-light': dcLightTheme,
  'marvel-dark': marvelDarkTheme,
  'marvel-light': marvelLightTheme,
  'sandman-dark': sandmanDarkTheme,
  'sandman-light': sandmanLightTheme,
  'synthwave-dark': synthwaveDarkTheme,
  'synthwave-light': synthwaveLightTheme,
  'retro-dark': retroDarkTheme,
  'retro-light': retroLightTheme,
  'manga-dark': mangaDarkTheme,
  'manga-light': mangaLightTheme,
  'high-contrast-dark': highContrastDarkTheme,
  'high-contrast-light': highContrastLightTheme,
  'pulp-dark': pulpDarkTheme,
  'pulp-light': pulpLightTheme,
};

// Get theme by ID and scheme
export function getTheme(id: ThemeId, scheme: ColorScheme): ThemeDefinition | undefined {
  const key = `${id}-${scheme}` as ThemeKey;
  return bundledThemes[key];
}

// Get all available theme metadata (for picker UI)
export function getAvailableThemes(): ThemeMeta[] {
  // Get unique theme IDs (not including scheme variants)
  const uniqueIds = new Set<ThemeId>();
  const themes: ThemeMeta[] = [];

  Object.values(bundledThemes).forEach((theme) => {
    if (!uniqueIds.has(theme.id)) {
      uniqueIds.add(theme.id);
      themes.push(theme.meta);
    }
  });

  return themes;
}

// Get the default theme
export function getDefaultTheme(scheme: ColorScheme = 'dark'): ThemeDefinition {
  return getTheme('default', scheme) || helixDarkTheme;
}

// Convert theme tokens to CSS variables
export function tokensToCSSVariables(tokens: ThemeTokens): Record<string, string> {
  // Merge with defaults for backward compatibility
  const mergedTokens = { ...DEFAULT_TOKENS, ...tokens } as ThemeTokens;
  const cssVars: Record<string, string> = {};

  // Map token keys to CSS variable names
  const keyMap: Record<keyof ThemeTokens, string> = {
    colorBg: '--color-bg',
    colorBgSecondary: '--color-bg-secondary',
    colorBgTertiary: '--color-bg-tertiary',
    colorBgElevated: '--color-bg-elevated',
    colorBgCard: '--color-bg-card',
    colorSurfaceCardHover: '--color-surface-card-hover',
    colorPrimary: '--color-primary',
    colorPrimaryHover: '--color-primary-hover',
    colorPrimaryMuted: '--color-primary-muted',
    colorPrimaryText: '--color-primary-text',
    colorSecondary: '--color-secondary',
    colorAccent: '--color-accent',
    colorText: '--color-text',
    colorTextMuted: '--color-text-muted',
    colorTextSubtle: '--color-text-subtle',
    colorSuccess: '--color-success',
    colorWarning: '--color-warning',
    colorWarningText: '--color-warning-text',
    colorError: '--color-error',
    colorDanger: '--color-danger',
    colorInfo: '--color-info',
    colorBorder: '--color-border',
    colorBorderSubtle: '--color-border-subtle',
    colorDivider: '--color-divider',
    colorHover: '--color-hover',
    colorSelected: '--color-selected',
    colorFocusRing: '--color-focus-ring',
    fontDisplay: '--font-display',
    fontBody: '--font-body',
    shadowSm: '--shadow-sm',
    shadowMd: '--shadow-md',
    shadowLg: '--shadow-lg',
    shadowGlow: '--shadow-glow',
    shadowHoverGlow: '--shadow-hover-glow',
    shadowTitleLocation: '--shadow-title-location',
    colorShadowTitle: '--color-shadow-title',
    colorIssueBadge: '--color-issue-badge',
    colorIssueBadgeCompleted: '--color-issue-badge-completed',
    colorIssueBadgeText: '--color-issue-badge-text',
    colorIssueBadgeTextCompleted: '--color-issue-badge-text-completed',
    radiusXs: '--radius-xs',
    radiusSm: '--radius-sm',
    radiusMd: '--radius-md',
    radiusLg: '--radius-lg',
    radiusXl: '--radius-xl',
    radiusFull: '--radius-full',
    // Overlays
    overlayDarkSubtle: '--overlay-dark-subtle',
    overlayDarkLight: '--overlay-dark-light',
    overlayDarkMedium: '--overlay-dark-medium',
    overlayDarkHeavy: '--overlay-dark-heavy',
    overlayDarkIntense: '--overlay-dark-intense',
    overlayLightSubtle: '--overlay-light-subtle',
    overlayLightLight: '--overlay-light-light',
    overlayLightMedium: '--overlay-light-medium',
    overlayLightHeavy: '--overlay-light-heavy',
    // Spacing
    spacing2: '--spacing-2',
    spacingXs: '--spacing-xs',
    spacing6: '--spacing-6',
    spacingSm: '--spacing-sm',
    spacing10: '--spacing-10',
    spacing12: '--spacing-12',
    spacingMd: '--spacing-md',
    spacing20: '--spacing-20',
    spacingLg: '--spacing-lg',
    spacingXl: '--spacing-xl',
    spacing2xl: '--spacing-2xl',
    // Font sizes
    fontSizeXs: '--font-size-xs',
    fontSizeSm: '--font-size-sm',
    fontSizeBase: '--font-size-base',
    fontSizeLg: '--font-size-lg',
    fontSizeXl: '--font-size-xl',
    fontSize2xl: '--font-size-2xl',
    fontSize3xl: '--font-size-3xl',
    fontSize4xl: '--font-size-4xl',
  };

  (Object.keys(mergedTokens) as (keyof ThemeTokens)[]).forEach((key) => {
    const cssVar = keyMap[key];
    if (cssVar) {
      cssVars[cssVar] = mergedTokens[key];
    }
  });

  return cssVars;
}

// Apply theme to document
export function applyThemeToDOM(
  theme: ThemeDefinition,
  overrides: Record<string, string> = {}
): void {
  const root = document.documentElement;

  // Set data attributes for CSS selectors
  root.setAttribute('data-theme', `${theme.id}-${theme.scheme}`);
  root.setAttribute('data-color-scheme', theme.scheme);

  // Convert tokens to CSS variables and apply
  const cssVars = tokensToCSSVariables(theme.tokens);

  Object.entries(cssVars).forEach(([variable, value]) => {
    root.style.setProperty(variable, value);
  });

  // Apply user overrides (highest priority)
  Object.entries(overrides).forEach(([variable, value]) => {
    // Ensure variable has -- prefix
    const cssVar = variable.startsWith('--') ? variable : `--${variable}`;
    root.style.setProperty(cssVar, value);
  });
}

// Remove theme from document (revert to CSS defaults)
export function removeThemeFromDOM(): void {
  const root = document.documentElement;

  root.removeAttribute('data-theme');
  root.removeAttribute('data-color-scheme');

  // Remove all inline style properties
  const cssVars = tokensToCSSVariables(helixDarkTheme.tokens);
  Object.keys(cssVars).forEach((variable) => {
    root.style.removeProperty(variable);
  });
}

// Generate CSS from theme (for export)
export function generateThemeCSS(
  theme: ThemeDefinition,
  overrides: Record<string, string> = {}
): string {
  const cssVars = tokensToCSSVariables(theme.tokens);

  // Merge with overrides
  const mergedVars = { ...cssVars, ...overrides };

  const varsCSS = Object.entries(mergedVars)
    .map(([variable, value]) => `  ${variable}: ${value};`)
    .join('\n');

  return `/* Theme: ${theme.meta.name} */
/* Scheme: ${theme.scheme} */
/* Generated by Helixio */

:root[data-theme="${theme.id}-${theme.scheme}"] {
${varsCSS}
}
`;
}

// Parse CSS theme file metadata from comments
export function parseThemeMetadata(css: string): Partial<ThemeMeta> & { scheme?: ColorScheme } {
  const nameMatch = css.match(/@theme-name:\s*(.+)/i) || css.match(/Theme:\s*(.+)/i);
  const descMatch = css.match(/@theme-description:\s*(.+)/i);
  const schemeMatch = css.match(/@theme-scheme:\s*(light|dark)/i) || css.match(/Scheme:\s*(light|dark)/i);
  const authorMatch = css.match(/@theme-author:\s*(.+)/i);

  return {
    name: nameMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim(),
    scheme: schemeMatch?.[1]?.toLowerCase() as ColorScheme | undefined,
    author: authorMatch?.[1]?.trim(),
  };
}
