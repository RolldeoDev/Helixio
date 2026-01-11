import type { EffectToggleDefinition, ThemeDefinition } from '../types';

// Shared effect definitions for Synthwave theme (used by both light and dark)
export const synthwaveEffects: EffectToggleDefinition[] = [
  {
    id: 'neonGrid',
    label: 'Neon Grid',
    description: 'Perspective floor grid receding to the horizon',
    defaultEnabled: true,
    category: 'background',
  },
  {
    id: 'scanLines',
    label: 'CRT Scanlines',
    description: 'Subtle horizontal lines like an old monitor',
    defaultEnabled: true,
    category: 'overlay',
  },
  {
    id: 'vignette',
    label: 'Vignette',
    description: 'Dark purple gradient at screen edges',
    defaultEnabled: true,
    category: 'overlay',
  },
  {
    id: 'floatingParticles',
    label: 'Floating Particles',
    description: 'Neon magenta and cyan particles drifting upward',
    defaultEnabled: true,
    category: 'particles',
  },
  {
    id: 'neonSign',
    label: 'Neon Sign',
    description: 'Glowing "ARCADE" sign in the corner',
    defaultEnabled: true,
    category: 'ui',
  },
  {
    id: 'arcadeQuote',
    label: 'Arcade Quotes',
    description: 'Rotating retro gaming quotes',
    defaultEnabled: true,
    category: 'ui',
  },
];

/**
 * Synthwave Dark Theme - "Neon Arcade"
 *
 * Retro-futuristic aesthetic inspired by 1980s arcade games, VHS culture,
 * and the synthwave music genre. Deep purple-black backgrounds with
 * vibrant neon pink, cyan, and purple accents.
 *
 * "INSERT COIN TO CONTINUE"
 */
export const synthwaveDarkTheme: ThemeDefinition = {
  id: 'synthwave',
  scheme: 'dark',
  meta: {
    id: 'synthwave',
    name: 'Neon Arcade',
    description: 'Retro-futuristic synthwave aesthetic with neon glow effects',
    author: 'Helixio',
    previewColors: {
      primary: '#ff00ff',
      secondary: '#0a0a12',
      accent: '#00ffff',
      background: '#0a0a12',
    },
  },
  tokens: {
    // Background colors - Deep space purple-black void
    colorBg: '#0a0a12',
    colorBgSecondary: '#0f0f1a',
    colorBgTertiary: '#06060c',
    colorBgElevated: '#14142a',
    colorBgCard: '#0d0d1a',
    colorSurfaceCardHover: 'rgba(255, 0, 255, 0.08)',

    // Primary & Accent - Hot neon colors
    colorPrimary: '#ff00ff',           // Hot magenta/neon pink
    colorPrimaryHover: '#ff44ff',      // Brighter magenta
    colorPrimaryMuted: 'rgba(255, 0, 255, 0.15)',
    colorPrimaryText: '#0a0a12',       // Dark text on neon magenta backgrounds
    colorSecondary: '#14142a',         // Deep purple for secondary surfaces
    colorAccent: '#00ffff',            // Cyan/aqua

    // Text colors - High contrast on dark
    colorText: '#f0f0ff',              // Near-white with slight blue tint
    colorTextMuted: '#9090c0',         // Muted purple-gray
    colorTextSubtle: '#606090',        // Subtle text for metadata

    // Semantic colors - Neon-inspired
    colorSuccess: '#00ff88',           // Neon green (arcade win)
    colorWarning: '#ffcc00',           // Electric yellow
    colorWarningText: '#000000',       // Black text on bright yellow for contrast
    colorError: '#ff3366',             // Neon red-pink
    colorDanger: '#ff0044',            // Intense warning red
    colorInfo: '#00ccff',              // Electric blue

    // Borders & interactions - Subtle neon accents
    colorBorder: 'rgba(150, 0, 255, 0.25)',
    colorBorderSubtle: 'rgba(150, 0, 255, 0.12)',
    colorDivider: 'linear-gradient(90deg, transparent, #ff00ff 20%, #00ffff 80%, transparent)',
    colorHover: 'rgba(255, 0, 255, 0.1)',
    colorSelected: 'rgba(255, 0, 255, 0.2)',
    colorFocusRing: 'rgba(0, 255, 255, 0.5)',

    // Typography - Futuristic, geometric
    fontDisplay: "'Orbitron', 'Exo 2', 'Inter', sans-serif",
    fontBody: "'Exo 2', 'Inter', system-ui, sans-serif",

    // Shadows - Neon glow effects (the signature look)
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.5), 0 0 10px rgba(150, 0, 255, 0.1)',
    shadowMd: '0 4px 16px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 0, 255, 0.15)',
    shadowLg: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 0, 255, 0.2)',
    shadowGlow: '0 0 30px rgba(255, 0, 255, 0.4), 0 0 60px rgba(0, 255, 255, 0.2)',
    shadowHoverGlow: '0 0 40px rgba(255, 0, 255, 0.5), 0 0 80px rgba(0, 255, 255, 0.3)',

    // Title effects - Neon pink/cyan dual glow
    shadowTitleLocation: '0 0 10px',
    colorShadowTitle: '#ff00ff',

    // Issue badge - Electric yellow arcade style
    colorIssueBadge: '#ffcc00',
    colorIssueBadgeCompleted: '#00ff88',
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
  effects: synthwaveEffects,
};
