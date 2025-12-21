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
    colorSecondary: '#e8e8f0',
    colorAccent: '#c41e24',

    // Text colors - Deep blue-gray
    colorText: '#1a1a2e',
    colorTextMuted: '#4a4a60',
    colorTextSubtle: '#7a7a90',

    // Semantic colors
    colorSuccess: '#2d8a4e',
    colorWarning: '#b8860b',
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
  },
};
