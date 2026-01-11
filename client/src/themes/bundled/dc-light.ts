import type { ThemeDefinition } from '../types';

/**
 * DC Light Theme - "Metropolis"
 * Clean, heroic light theme inspired by Superman's Metropolis
 */
export const dcLightTheme: ThemeDefinition = {
  id: 'dc',
  scheme: 'light',
  meta: {
    id: 'dc',
    name: 'DC Mode',
    description: 'Clean heroic theme inspired by Metropolis',
    author: 'Helixio',
    previewColors: {
      primary: '#0066cc',
      secondary: '#f0f0f8',
      accent: '#c41e24',
      background: '#f8f8fc',
    },
  },
  tokens: {
    // Background colors - Clean Metropolis white/blue
    colorBg: '#f8f8fc',
    colorBgSecondary: '#f0f0f8',
    colorBgTertiary: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgCard: '#ffffff',
    colorSurfaceCardHover: 'rgba(0, 102, 204, 0.06)',

    // Primary & Accent - Superman blue + red
    colorPrimary: '#0066cc',
    colorPrimaryHover: '#0080ff',
    colorPrimaryMuted: 'rgba(0, 102, 204, 0.1)',
    colorPrimaryText: '#FFFFFF',       // White text on blue backgrounds
    colorSecondary: '#e8e8f0',
    colorAccent: '#c41e24',

    // Text colors - Deep blue-gray
    colorText: '#1a1a2e',
    colorTextMuted: '#4a4a60',
    colorTextSubtle: '#7a7a90',

    // Semantic colors
    colorSuccess: '#2d8a4e',
    colorWarning: '#b8860b',
    colorWarningText: '#ffffff',           // White text on dark goldenrod
    colorError: '#c41e24',
    colorDanger: '#b91c1c',
    colorInfo: '#0066cc',

    // Borders & interactions
    colorBorder: '#d0d0e0',
    colorBorderSubtle: '#e8e8f0',
    colorDivider: 'linear-gradient(90deg, transparent, #d0d0e0 20%, #d0d0e0 80%, transparent)',
    colorHover: 'rgba(0, 102, 204, 0.06)',
    colorSelected: 'rgba(0, 102, 204, 0.12)',
    colorFocusRing: 'rgba(0, 102, 204, 0.4)',

    // Typography
    fontDisplay: "'Bebas Neue', 'Oswald', sans-serif",
    fontBody: "'Roboto', system-ui, sans-serif",

    // Shadows
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.06)',
    shadowMd: '0 4px 16px rgba(0, 0, 0, 0.08)',
    shadowLg: '0 8px 32px rgba(0, 0, 0, 0.1)',
    shadowGlow: '0 0 20px rgba(0, 102, 204, 0.15)',
    shadowHoverGlow: '0 0 25px rgba(0, 102, 204, 0.25)',

    // Title effects
    shadowTitleLocation: '0 1px 2px',
    colorShadowTitle: 'rgba(0, 102, 204, 0.2)',

    // Issue badge - Bold gold for light background
    colorIssueBadge: '#cc9900',
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
