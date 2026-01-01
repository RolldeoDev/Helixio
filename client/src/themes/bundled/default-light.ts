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
    colorPrimaryText: '#FFFFFF',       // White text on dark amber backgrounds
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
