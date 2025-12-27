import type { EffectToggleDefinition, ThemeDefinition } from '../types';

// Shared effect definitions for Retro theme (used by both light and dark)
export const retroEffects: EffectToggleDefinition[] = [
  {
    id: 'pixelGrid',
    label: 'Pixel Grid',
    description: 'CRT pixel pattern overlay for authentic 8-bit feel',
    defaultEnabled: true,
    category: 'background',
  },
  {
    id: 'crtEffect',
    label: 'CRT Scanlines',
    description: 'Curved screen edges and horizontal scanlines',
    defaultEnabled: true,
    category: 'overlay',
  },
  {
    id: 'floatingPixels',
    label: 'Floating Pixels',
    description: 'Coins, stars, hearts, and gems floating upward',
    defaultEnabled: true,
    category: 'particles',
  },
  {
    id: 'gameQuote',
    label: 'Game Quotes',
    description: 'Classic gaming quotes with typewriter effect',
    defaultEnabled: true,
    category: 'ui',
  },
  {
    id: 'scoreDisplay',
    label: 'Score Display',
    description: 'Pages read counter in retro game UI style',
    defaultEnabled: true,
    category: 'ui',
  },
  {
    id: 'livesDisplay',
    label: 'Lives Display',
    description: 'Three hearts in corner',
    defaultEnabled: true,
    category: 'ui',
  },
];

/**
 * Retro Gaming Dark Theme - "Pixel Quest"
 *
 * Nostalgic 8-bit/16-bit gaming aesthetic with saturated primary colors.
 * Inspired by NES, SNES, Sega Genesis, and classic arcade cabinets.
 *
 * "IT'S DANGEROUS TO GO ALONE! TAKE THIS."
 */
export const retroDarkTheme: ThemeDefinition = {
  id: 'retro',
  scheme: 'dark',
  meta: {
    id: 'retro',
    name: 'Pixel Quest',
    description: 'Nostalgic 8-bit gaming aesthetic with saturated primary colors',
    author: 'Helixio',
    previewColors: {
      primary: '#e63946',      // Nintendo red
      secondary: '#1a1c2c',    // Deep pixel blue-black
      accent: '#29adff',       // Bright pixel blue
      background: '#1a1c2c',
    },
  },
  tokens: {
    // Background colors - Deep CRT blue-black (classic console UI)
    colorBg: '#1a1c2c',
    colorBgSecondary: '#232538',
    colorBgTertiary: '#13141f',
    colorBgElevated: '#2a2d42',
    colorBgCard: '#1e2030',
    colorSurfaceCardHover: 'rgba(255, 204, 0, 0.1)',

    // Primary & Accent - Classic gaming palette
    colorPrimary: '#e63946',           // Nintendo/Mario red
    colorPrimaryHover: '#ff4d5a',      // Brighter red
    colorPrimaryMuted: 'rgba(230, 57, 70, 0.2)',
    colorPrimaryText: '#FFFFFF',       // White text on red backgrounds
    colorSecondary: '#232538',         // Deep blue surface
    colorAccent: '#ffcc00',            // Coin gold / star power

    // Text colors - Crisp pixel-style
    colorText: '#f0f0f0',              // Clean white
    colorTextMuted: '#8b8b9a',         // Muted gray
    colorTextSubtle: '#5a5a6e',        // Subtle

    // Semantic colors - Saturated game UI style
    colorSuccess: '#00e436',           // Power-up green
    colorWarning: '#ffcc00',           // Coin gold
    colorError: '#e63946',             // Damage red
    colorDanger: '#be1c31',            // Critical red
    colorInfo: '#29adff',              // Item blue

    // Borders & interactions - Pixel-perfect edges
    colorBorder: '#3a3d5c',
    colorBorderSubtle: '#2a2d42',
    colorDivider: 'linear-gradient(90deg, transparent, #e63946 20%, #ffcc00 50%, #29adff 80%, transparent)',
    colorHover: 'rgba(255, 204, 0, 0.1)',
    colorSelected: 'rgba(255, 204, 0, 0.2)',
    colorFocusRing: 'rgba(41, 173, 255, 0.6)',

    // Typography - Pixel/retro gaming fonts
    fontDisplay: "'Press Start 2P', 'VT323', monospace",
    fontBody: "'VT323', 'Press Start 2P', monospace",

    // Shadows - Chunky pixel-art style (hard edges)
    shadowSm: '4px 4px 0 rgba(0, 0, 0, 0.4)',
    shadowMd: '6px 6px 0 rgba(0, 0, 0, 0.5)',
    shadowLg: '8px 8px 0 rgba(0, 0, 0, 0.5)',
    shadowGlow: '0 0 0 2px #e63946, 0 0 20px rgba(230, 57, 70, 0.3)',
    shadowHoverGlow: '0 0 0 3px #ffcc00, 0 0 30px rgba(255, 204, 0, 0.4)',

    // Title effects - Classic game title red drop shadow
    shadowTitleLocation: '4px 4px 0',
    colorShadowTitle: '#be1c31',

    // Issue badge - Coin gold
    colorIssueBadge: '#ffcc00',
    colorIssueBadgeCompleted: '#00e436',
    colorIssueBadgeText: '#1a1a1a',
    colorIssueBadgeTextCompleted: '#1a1a1a',

    // Border radius - Pixel-perfect with no rounding
    radiusSm: '0px',
    radiusMd: '0px',
    radiusLg: '0px',
    radiusXl: '0px',
    radiusFull: '0px',
  },
  effects: retroEffects,
};
