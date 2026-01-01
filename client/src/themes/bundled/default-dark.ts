import type { ThemeDefinition } from '../types';

/**
 * Collector's Archive Dark Theme
 * Luxury dark theme inspired by fine hotels and rare book collections
 */
export const collectorsDarkTheme: ThemeDefinition = {
  id: 'collectors',
  scheme: 'dark',
  meta: {
    id: 'collectors',
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
    colorPrimaryText: '#1a1a1a',       // Dark text on warm amber backgrounds
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
    radiusXs: '2px',
    radiusSm: '4px',
    radiusMd: '8px',
    radiusLg: '12px',
    radiusXl: '16px',
    radiusFull: '9999px',

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
  },
};
