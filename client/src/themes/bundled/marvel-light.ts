import type { ThemeDefinition } from '../types';

/**
 * Marvel Light Theme - "Stark Industries"
 * Clean tech theme inspired by Tony Stark's lab
 */
export const marvelLightTheme: ThemeDefinition = {
  id: 'marvel',
  scheme: 'light',
  meta: {
    id: 'marvel',
    name: 'Marvel Mode',
    description: 'Clean tech theme inspired by Stark Industries',
    author: 'Helixio',
    previewColors: {
      primary: '#ed1d24',
      secondary: '#f0f4f8',
      accent: '#b8860b',
      background: '#f8fafc',
    },
  },
  tokens: {
    // Background colors - Clean tech white
    colorBg: '#f8fafc',
    colorBgSecondary: '#f0f4f8',
    colorBgTertiary: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgCard: '#ffffff',
    colorSurfaceCardHover: 'rgba(196, 30, 36, 0.06)',

    // Primary & Accent - Marvel red + darker gold
    colorPrimary: '#c41e24',
    colorPrimaryHover: '#ed1d24',
    colorPrimaryMuted: 'rgba(196, 30, 36, 0.1)',
    colorSecondary: '#e8ecf0',
    colorAccent: '#b8860b',

    // Text colors - Deep navy
    colorText: '#0a1628',
    colorTextMuted: '#3a4a5a',
    colorTextSubtle: '#6a7a8a',

    // Semantic colors
    colorSuccess: '#2d8a4e',
    colorWarning: '#b8860b',
    colorError: '#c41e24',
    colorDanger: '#b91c1c',
    colorInfo: '#2563eb',

    // Borders & interactions
    colorBorder: '#d0d8e0',
    colorBorderSubtle: '#e8ecf0',
    colorDivider: 'linear-gradient(90deg, transparent, #d0d8e0 20%, #d0d8e0 80%, transparent)',
    colorHover: 'rgba(196, 30, 36, 0.06)',
    colorSelected: 'rgba(196, 30, 36, 0.12)',
    colorFocusRing: 'rgba(196, 30, 36, 0.4)',

    // Typography
    fontDisplay: "'Oswald', 'Inter', sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",

    // Shadows
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.06)',
    shadowMd: '0 4px 16px rgba(0, 0, 0, 0.08)',
    shadowLg: '0 8px 32px rgba(0, 0, 0, 0.1)',
    shadowGlow: '0 0 20px rgba(196, 30, 36, 0.12)',
    shadowHoverGlow: '0 0 25px rgba(196, 30, 36, 0.2)',
  },
};
