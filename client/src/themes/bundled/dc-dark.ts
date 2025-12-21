import type { ThemeDefinition } from '../types';

/**
 * DC Dark Theme - "Dark Knight"
 * Gothic noir theme inspired by Batman's Gotham with Superman accents
 */
export const dcDarkTheme: ThemeDefinition = {
  id: 'dc',
  scheme: 'dark',
  meta: {
    id: 'dc',
    name: 'DC Mode',
    description: 'Dark gothic theme inspired by Gotham City and the Dark Knight',
    author: 'Helixio',
    previewColors: {
      primary: '#ffd700',
      secondary: '#1a1a2e',
      accent: '#0066cc',
      background: '#0d0d14',
    },
  },
  tokens: {
    // Background colors - Deep Gotham noir
    colorBg: '#0d0d14',
    colorBgSecondary: '#12121c',
    colorBgTertiary: '#08080c',
    colorBgElevated: '#1a1a28',
    colorBgCard: '#141420',
    colorSurfaceCardHover: 'rgba(255, 215, 0, 0.08)',

    // Primary & Accent - Batman yellow + Superman blue
    colorPrimary: '#ffd700',
    colorPrimaryHover: '#ffe44d',
    colorPrimaryMuted: 'rgba(255, 215, 0, 0.12)',
    colorSecondary: '#1a1a2e',
    colorAccent: '#0066cc',

    // Text colors - Cool steel tones
    colorText: '#e0e0e8',
    colorTextMuted: '#8888a0',
    colorTextSubtle: '#5c5c70',

    // Semantic colors - DC inspired
    colorSuccess: '#44d62c', // Green Lantern
    colorWarning: '#ffd700', // Batman signal
    colorError: '#dc143c', // Wonder Woman red
    colorDanger: '#b22234',
    colorInfo: '#0066cc', // Superman blue

    // Borders & interactions
    colorBorder: '#2a2a3c',
    colorBorderSubtle: '#1e1e2a',
    colorDivider: 'linear-gradient(90deg, transparent, #2a2a3c 20%, #2a2a3c 80%, transparent)',
    colorHover: 'rgba(255, 215, 0, 0.08)',
    colorSelected: 'rgba(255, 215, 0, 0.15)',
    colorFocusRing: 'rgba(255, 215, 0, 0.4)',

    // Typography - Bold comic style
    fontDisplay: "'Bebas Neue', 'Oswald', sans-serif",
    fontBody: "'Roboto', system-ui, sans-serif",

    // Shadows - Dramatic noir
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.35)',
    shadowMd: '0 4px 16px rgba(0, 0, 0, 0.4)',
    shadowLg: '0 8px 32px rgba(0, 0, 0, 0.5)',
    shadowGlow: '0 0 20px rgba(255, 215, 0, 0.2)',
    shadowHoverGlow: '0 0 25px rgba(255, 215, 0, 0.3)',
  },
};
