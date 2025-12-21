import type { ThemeDefinition } from '../types';
import { synthwaveEffects } from './synthwave-dark';

/**
 * Synthwave Light Theme - "Daytime Arcade"
 *
 * Pastel vaporwave-inspired variant with soft lavender backgrounds
 * and magenta/teal accents. Perfect for daytime browsing while
 * maintaining the retro-futuristic aesthetic.
 *
 * "GAME OVER - CONTINUE?"
 */
export const synthwaveLightTheme: ThemeDefinition = {
  id: 'synthwave',
  scheme: 'light',
  meta: {
    id: 'synthwave',
    name: 'Neon Arcade',
    description: 'Daytime Arcade - vapor-wave pastel variant',
    author: 'Helixio',
    previewColors: {
      primary: '#cc00cc',
      secondary: '#f8f4ff',
      accent: '#0099aa',
      background: '#f8f4ff',
    },
  },
  tokens: {
    // Background colors - Soft lavender/pastel
    colorBg: '#f8f4ff',
    colorBgSecondary: '#f0e8ff',
    colorBgTertiary: '#fdfbff',
    colorBgElevated: '#ffffff',
    colorBgCard: '#faf6ff',
    colorSurfaceCardHover: 'rgba(180, 0, 180, 0.06)',

    // Primary & Accent - Deeper neon for contrast on light
    colorPrimary: '#cc00cc',           // Deep magenta (readable on light)
    colorPrimaryHover: '#dd22dd',      // Brighter on hover
    colorPrimaryMuted: 'rgba(204, 0, 204, 0.12)',
    colorSecondary: '#e8e0f0',         // Light purple surface
    colorAccent: '#0099aa',            // Teal (darker cyan for contrast)

    // Text colors - Purple-based for retro feel
    colorText: '#1a1025',              // Deep purple-black
    colorTextMuted: '#5a4070',         // Muted purple
    colorTextSubtle: '#8070a0',        // Light purple

    // Semantic colors - Pastel versions
    colorSuccess: '#00aa66',           // Teal-green
    colorWarning: '#cc9900',           // Amber
    colorError: '#cc2255',             // Deep pink-red
    colorDanger: '#aa0033',            // Darker red
    colorInfo: '#0088cc',              // Ocean blue

    // Borders & interactions
    colorBorder: '#d0c0e0',
    colorBorderSubtle: '#e8e0f0',
    colorDivider: 'linear-gradient(90deg, transparent, #cc00cc 20%, #0099aa 80%, transparent)',
    colorHover: 'rgba(204, 0, 204, 0.06)',
    colorSelected: 'rgba(204, 0, 204, 0.12)',
    colorFocusRing: 'rgba(0, 153, 170, 0.4)',

    // Typography - Same futuristic fonts
    fontDisplay: "'Orbitron', 'Exo 2', 'Inter', sans-serif",
    fontBody: "'Exo 2', 'Inter', system-ui, sans-serif",

    // Shadows - Subtle purple tones
    shadowSm: '0 2px 8px rgba(60, 40, 80, 0.08)',
    shadowMd: '0 4px 16px rgba(60, 40, 80, 0.1)',
    shadowLg: '0 8px 32px rgba(60, 40, 80, 0.12)',
    shadowGlow: '0 0 20px rgba(204, 0, 204, 0.15)',
    shadowHoverGlow: '0 0 30px rgba(204, 0, 204, 0.25)',

    // Title effects - Pastel magenta glow
    shadowTitleLocation: '0 0 8px',
    colorShadowTitle: '#cc00cc',

    // Border radius
    radiusSm: '4px',
    radiusMd: '8px',
    radiusLg: '12px',
    radiusXl: '16px',
    radiusFull: '9999px',
  },
  effects: synthwaveEffects,
};
