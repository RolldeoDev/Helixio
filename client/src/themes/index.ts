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
import { defaultDarkTheme } from './bundled/default-dark';
import { defaultLightTheme } from './bundled/default-light';
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

// Re-export types
export * from './types';

// Re-export theme effects components
export { SandmanEffects } from './sandman';
export { SynthwaveEffects } from './synthwave';
export { RetroEffects } from './retro';
export { MangaEffects } from './manga';

// All bundled themes
export const bundledThemes: Record<ThemeKey, ThemeDefinition> = {
  'default-dark': defaultDarkTheme,
  'default-light': defaultLightTheme,
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
  return getTheme('default', scheme) || defaultDarkTheme;
}

// Convert theme tokens to CSS variables
export function tokensToCSSVariables(tokens: ThemeTokens): Record<string, string> {
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
    colorSecondary: '--color-secondary',
    colorAccent: '--color-accent',
    colorText: '--color-text',
    colorTextMuted: '--color-text-muted',
    colorTextSubtle: '--color-text-subtle',
    colorSuccess: '--color-success',
    colorWarning: '--color-warning',
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
    radiusSm: '--radius-sm',
    radiusMd: '--radius-md',
    radiusLg: '--radius-lg',
    radiusXl: '--radius-xl',
    radiusFull: '--radius-full',
  };

  (Object.keys(tokens) as (keyof ThemeTokens)[]).forEach((key) => {
    const cssVar = keyMap[key];
    if (cssVar) {
      cssVars[cssVar] = tokens[key];
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
  const cssVars = tokensToCSSVariables(defaultDarkTheme.tokens);
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
