import type { EffectToggleDefinition, ThemeDefinition } from '../types';

// Shared effect definitions for Endless Night theme (used by both light and dark)
export const endlessNightEffects: EffectToggleDefinition[] = [
  {
    id: 'ravenFeathers',
    label: 'Raven Feathers',
    description: 'Dark feathers drifting slowly through the void',
    defaultEnabled: true,
    category: 'particles',
  },
  {
    id: 'starfieldDrift',
    label: 'Starfield Drift',
    description: 'Distant stars rotating slowly in the infinite darkness',
    defaultEnabled: true,
    category: 'background',
  },
];

/**
 * Endless Night Dark Theme
 *
 * Gothic supernatural elegance meets impossible architecture.
 * Navigate the halls of Dream's palace - intimate darkness punctuated
 * by warm candlelight, with glimpses of infinite starfields beyond
 * impossible windows.
 *
 * Inspired by Neil Gaiman's The Sandman - The Endless aesthetic
 * combined with the impossible architecture of The Dreaming.
 *
 * Color Philosophy:
 * - True black void as the canvas of infinity
 * - Moonlight ivory for text - pale and otherworldly
 * - Amber candlelight for warmth in the darkness
 * - Deep ocean teal for cool mystery and depth
 *
 * "Everybody has a secret world inside of them."
 * - Dream of the Endless
 */
export const sandmanDarkTheme: ThemeDefinition = {
  id: 'sandman',
  scheme: 'dark',
  meta: {
    id: 'sandman',
    name: 'Endless Night',
    description: 'Gothic elegance and impossible architecture in the realm of the Endless',
    author: 'Helixio',
    previewColors: {
      primary: '#d4a574',      // Amber candlelight
      secondary: '#050507',    // True void black
      accent: '#2d7d8a',       // Deep ocean teal
      background: '#050507',   // Absolute darkness
    },
  },
  tokens: {
    // Background colors - True void blacks
    colorBg: '#050507',                    // Absolute void - true black
    colorBgSecondary: '#0a0b0f',           // Deep blue-black surface
    colorBgTertiary: '#12141a',            // Elevated surfaces
    colorBgElevated: '#14161e',            // Modal/dropdown surfaces
    colorBgCard: '#08090d',                // Card background - near void
    colorSurfaceCardHover: 'rgba(212, 165, 116, 0.08)', // Amber candlelight hover

    // Primary & Accent - Amber candlelight and ocean teal
    colorPrimary: '#d4a574',               // Amber candlelight - warm accent
    colorPrimaryHover: '#e0b88a',          // Brighter amber on hover
    colorPrimaryMuted: 'rgba(212, 165, 116, 0.15)', // Subtle amber presence
    colorPrimaryText: '#0a0b0f',           // Dark text on amber backgrounds
    colorSecondary: '#0a0b0f',             // Deep surface color
    colorAccent: '#2d7d8a',                // Deep ocean teal - cool mystery

    // Text colors - Moonlight ivory
    colorText: '#e8e4df',                  // Moonlight ivory
    colorTextMuted: '#9a958d',             // Weathered stone grey
    colorTextSubtle: '#6a665f',            // Distant shadow grey

    // Semantic colors - Harmonized with the palette
    colorSuccess: '#5a9e7a',               // Muted emerald
    colorWarning: '#d4a574',               // Amber (matches primary)
    colorWarningText: '#1a1a1a',           // Dark text on mid-tone amber
    colorError: '#b86a6a',                 // Muted crimson
    colorDanger: '#944a4a',                // Deep blood red
    colorInfo: '#5a9aaa',                  // Light teal

    // Borders & interactions - Subtle amber and teal hints
    colorBorder: 'rgba(212, 165, 116, 0.12)', // Subtle amber glow
    colorBorderSubtle: 'rgba(212, 165, 116, 0.06)', // Very subtle border
    colorDivider: 'rgba(45, 125, 138, 0.15)', // Teal divider
    colorHover: 'rgba(212, 165, 116, 0.08)', // Amber hover
    colorSelected: 'rgba(212, 165, 116, 0.15)', // Amber selected
    colorFocusRing: 'rgba(45, 125, 138, 0.5)', // Teal focus ring

    // Typography - Art Nouveau elegance
    fontDisplay: "'Cormorant Garamond', Garamond, Georgia, serif",
    fontBody: "'Libre Baskerville', Baskerville, Georgia, serif",

    // Shadows - Deep voids with subtle warm glows
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.5)',
    shadowMd: '0 4px 20px rgba(0, 0, 0, 0.6)',
    shadowLg: '0 8px 40px rgba(0, 0, 0, 0.7)',
    shadowGlow: '0 0 30px rgba(212, 165, 116, 0.15)',
    shadowHoverGlow: '0 0 40px rgba(212, 165, 116, 0.25), 0 0 60px rgba(45, 125, 138, 0.1)',

    // Title effects - Candlelight illumination
    shadowTitleLocation: '0 0 20px',
    colorShadowTitle: 'rgba(212, 165, 116, 0.3)',

    // Issue badge - Amber candlelight
    colorIssueBadge: '#d4a574',
    colorIssueBadgeCompleted: '#5a9e7a',
    colorIssueBadgeText: '#0a0b0f',
    colorIssueBadgeTextCompleted: '#0a0b0f',

    // Border radius - Soft, organic curves (Art Nouveau influence)
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
  effects: endlessNightEffects,
};
