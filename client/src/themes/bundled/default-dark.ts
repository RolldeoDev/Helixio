import type { ThemeDefinition } from '../types';

/**
 * Default Dark Theme - "Collector's Archive"
 * Luxury dark theme inspired by fine hotels and rare book collections
 */
export const defaultDarkTheme: ThemeDefinition = {
  id: 'default',
  scheme: 'dark',
  meta: {
    id: 'default',
    name: "Collector's Archive",
    description: 'Luxury dark theme inspired by fine hotels and rare book collections',
    author: 'Helixio',
    previewColors: {
      primary: '#d4a574',
      secondary: '#2a3444',
      accent: '#8b7355',
      background: '#0f1419',
    },
  },
  tokens: {
    // Background colors - Deep slate
    colorBg: '#0f1419',
    colorBgSecondary: '#151b23',
    colorBgTertiary: '#0a0e12',
    colorBgElevated: '#1a222c',
    colorBgCard: '#161d26',
    colorSurfaceCardHover: 'rgba(212, 165, 116, 0.08)',

    // Primary & Accent - Warm amber
    colorPrimary: '#d4a574',
    colorPrimaryHover: '#e5bc92',
    colorPrimaryMuted: 'rgba(212, 165, 116, 0.15)',
    colorSecondary: '#2a3444',
    colorAccent: '#8b7355',

    // Text colors - Warm off-white
    colorText: '#e8e4de',
    colorTextMuted: '#7d8590',
    colorTextSubtle: '#565e68',

    // Semantic colors
    colorSuccess: '#7dcea0',
    colorWarning: '#e5b567',
    colorError: '#e07a7a',
    colorDanger: '#c75050',
    colorInfo: '#7eb8d8',

    // Borders & interactions
    colorBorder: '#2a3341',
    colorBorderSubtle: '#1f2730',
    colorDivider: 'linear-gradient(90deg, transparent, #2a3341 20%, #2a3341 80%, transparent)',
    colorHover: 'rgba(212, 165, 116, 0.08)',
    colorSelected: 'rgba(212, 165, 116, 0.15)',
    colorFocusRing: 'rgba(212, 165, 116, 0.4)',

    // Typography
    fontDisplay: "'Cormorant Garamond', Georgia, serif",
    fontBody: "'DM Sans', system-ui, -apple-system, sans-serif",

    // Shadows
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.25)',
    shadowMd: '0 4px 16px rgba(0, 0, 0, 0.3)',
    shadowLg: '0 8px 32px rgba(0, 0, 0, 0.4)',
    shadowGlow: '0 0 20px rgba(212, 165, 116, 0.15)',
    shadowHoverGlow: '0 0 25px rgba(212, 165, 116, 0.25)',

    // Title effects
    shadowTitleLocation: '0 2px 4px',
    colorShadowTitle: 'rgba(0, 0, 0, 0.3)',

    // Issue badge - Classic comic gold
    colorIssueBadge: '#f5c542',
    colorIssueBadgeCompleted: '#7dcea0',
    colorIssueBadgeText: '#1a1a1a',
    colorIssueBadgeTextCompleted: '#1a1a1a',

    // Border radius
    radiusSm: '4px',
    radiusMd: '8px',
    radiusLg: '12px',
    radiusXl: '16px',
    radiusFull: '9999px',
  },
};
