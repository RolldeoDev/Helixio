import type { ThemeDefinition } from '../types';

/**
 * Marvel Dark Theme - "Avengers"
 * Heroic dark theme inspired by Iron Man and Captain America
 */
export const marvelDarkTheme: ThemeDefinition = {
  id: 'marvel',
  scheme: 'dark',
  meta: {
    id: 'marvel',
    name: 'Marvel Mode',
    description: 'Heroic theme inspired by Iron Man armor and Captain America',
    author: 'Helixio',
    previewColors: {
      primary: '#ed1d24',
      secondary: '#1c2951',
      accent: '#ffc500',
      background: '#0a1628',
    },
  },
  tokens: {
    // Background colors - Captain America navy
    colorBg: '#0a1628',
    colorBgSecondary: '#0f1e36',
    colorBgTertiary: '#061020',
    colorBgElevated: '#152642',
    colorBgCard: '#0d1a2d',
    colorSurfaceCardHover: 'rgba(237, 29, 36, 0.1)',

    // Primary & Accent - Marvel red + Iron Man gold
    colorPrimary: '#ed1d24',
    colorPrimaryHover: '#ff3b42',
    colorPrimaryMuted: 'rgba(237, 29, 36, 0.15)',
    colorSecondary: '#1c2951',
    colorAccent: '#ffc500',

    // Text colors - Clean bright
    colorText: '#f0f0f0',
    colorTextMuted: '#8895a8',
    colorTextSubtle: '#5a6575',

    // Semantic colors - Marvel inspired
    colorSuccess: '#2eb82e', // Hulk green
    colorWarning: '#ffc500', // Iron Man gold
    colorError: '#ed1d24', // Marvel red
    colorDanger: '#c41e24',
    colorInfo: '#4a90d9', // Arc reactor blue

    // Borders & interactions
    colorBorder: '#2a3d5a',
    colorBorderSubtle: '#1e2e48',
    colorDivider: 'linear-gradient(90deg, transparent, #2a3d5a 20%, #2a3d5a 80%, transparent)',
    colorHover: 'rgba(237, 29, 36, 0.1)',
    colorSelected: 'rgba(237, 29, 36, 0.18)',
    colorFocusRing: 'rgba(237, 29, 36, 0.4)',

    // Typography - Modern heroic
    fontDisplay: "'Oswald', 'Inter', sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",

    // Shadows - Tech-inspired
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.3)',
    shadowMd: '0 4px 16px rgba(0, 0, 0, 0.35)',
    shadowLg: '0 8px 32px rgba(0, 0, 0, 0.45)',
    shadowGlow: '0 0 25px rgba(237, 29, 36, 0.25)',
    shadowHoverGlow: '0 0 30px rgba(237, 29, 36, 0.35)',

    // Title effects - Marvel red glow
    shadowTitleLocation: '0 0 8px',
    colorShadowTitle: '#ed1d24',

    // Issue badge - Iron Man gold
    colorIssueBadge: '#ffc500',
    colorIssueBadgeCompleted: '#2eb82e',
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
