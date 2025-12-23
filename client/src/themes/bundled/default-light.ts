import type { ThemeDefinition } from '../types';

/**
 * Collector's Archive Light Theme
 * Elegant light theme with warm paper-like tones
 */
export const collectorsLightTheme: ThemeDefinition = {
  id: 'collectors',
  scheme: 'light',
  meta: {
    id: 'collectors',
    name: "Collector's Archive",
    description: 'Elegant light theme with warm paper-like tones',
    author: 'Helixio',
    previewColors: {
      primary: '#8b6914',
      secondary: '#e8e4de',
      accent: '#6b5344',
      background: '#faf8f5',
    },
  },
  tokens: {
    // Background colors - Warm cream/paper
    colorBg: '#faf8f5',
    colorBgSecondary: '#f2efe9',
    colorBgTertiary: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgCard: '#ffffff',
    colorSurfaceCardHover: 'rgba(139, 105, 20, 0.06)',

    // Primary & Accent - Deeper amber for contrast
    colorPrimary: '#8b6914',
    colorPrimaryHover: '#a37d1a',
    colorPrimaryMuted: 'rgba(139, 105, 20, 0.12)',
    colorSecondary: '#e8e4de',
    colorAccent: '#6b5344',

    // Text colors - Dark warm grays
    colorText: '#2c2824',
    colorTextMuted: '#5c5550',
    colorTextSubtle: '#8c857c',

    // Semantic colors - Adjusted for light background
    colorSuccess: '#2d8a4e',
    colorWarning: '#b8860b',
    colorError: '#c53030',
    colorDanger: '#b91c1c',
    colorInfo: '#2563eb',

    // Borders & interactions
    colorBorder: '#d4cfc6',
    colorBorderSubtle: '#e8e4de',
    colorDivider: 'linear-gradient(90deg, transparent, #d4cfc6 20%, #d4cfc6 80%, transparent)',
    colorHover: 'rgba(139, 105, 20, 0.06)',
    colorSelected: 'rgba(139, 105, 20, 0.12)',
    colorFocusRing: 'rgba(139, 105, 20, 0.4)',

    // Typography
    fontDisplay: "'Cormorant Garamond', Georgia, serif",
    fontBody: "'DM Sans', system-ui, -apple-system, sans-serif",

    // Shadows - Lighter for light theme
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.08)',
    shadowMd: '0 4px 16px rgba(0, 0, 0, 0.1)',
    shadowLg: '0 8px 32px rgba(0, 0, 0, 0.12)',
    shadowGlow: '0 0 20px rgba(139, 105, 20, 0.1)',
    shadowHoverGlow: '0 0 25px rgba(139, 105, 20, 0.2)',

    // Title effects
    shadowTitleLocation: '0 1px 2px',
    colorShadowTitle: 'rgba(0, 0, 0, 0.1)',

    // Issue badge - Deeper gold for light background contrast
    colorIssueBadge: '#d4980a',
    colorIssueBadgeCompleted: '#2d8a4e',
    colorIssueBadgeText: '#1a1a1a',
    colorIssueBadgeTextCompleted: '#ffffff',

    // Border radius
    radiusSm: '4px',
    radiusMd: '8px',
    radiusLg: '12px',
    radiusXl: '16px',
    radiusFull: '9999px',
  },
};
