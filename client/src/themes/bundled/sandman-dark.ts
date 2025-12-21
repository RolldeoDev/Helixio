import type { ThemeDefinition } from '../types';

/**
 * Sandman Dark Theme - "The Dreaming"
 *
 * Enter the realm of Morpheus, Lord of Dreams.
 *
 * This theme transforms the interface into an ethereal dreamscape:
 * - Deep void blacks that seem to extend infinitely
 * - Cosmic purples and blues reminiscent of the night sky
 * - Stardust gold accents like sand falling through an hourglass
 * - Typography that feels ancient yet timeless
 * - Shadows that breathe and glow with inner light
 *
 * "It is a fool's prerogative to utter truths that no one else will speak."
 * - Dream of the Endless
 */
export const sandmanDarkTheme: ThemeDefinition = {
  id: 'sandman',
  scheme: 'dark',
  meta: {
    id: 'sandman',
    name: 'The Dreaming',
    description: 'Enter the realm of Morpheus, Lord of Dreams',
    author: 'Helixio',
    previewColors: {
      primary: '#c9a227',      // Dream sand gold
      secondary: '#000000',    // True black void
      accent: '#b8c8e0',       // Ethereal pale blue
      background: '#000000',   // Absolute black
    },
  },
  tokens: {
    // Background colors - True blacks inspired by Sandman artwork
    colorBg: '#000000',                    // Absolute void - true black
    colorBgSecondary: '#050508',           // Near-black with hint of blue
    colorBgTertiary: '#0a0a0f',            // Deep space
    colorBgElevated: '#101015',            // Elevated surface
    colorBgCard: '#050508',                // Card background - near black
    colorSurfaceCardHover: 'rgba(201, 162, 39, 0.1)', // Dream sand hover

    // Primary & Accent - Dream sand gold and ethereal blue
    colorPrimary: '#c9a227',               // Dream Sand - classic gold
    colorPrimaryHover: '#e0b830',          // Bright gold on hover
    colorPrimaryMuted: 'rgba(201, 162, 39, 0.15)', // Subtle gold presence
    colorSecondary: '#0a0a0f',             // Deep dark blue-black
    colorAccent: '#b8c8e0',                // Ethereal pale blue

    // Text colors - Ghostly pale like Morpheus
    colorText: '#f0f0f5',                  // Ghostly white
    colorTextMuted: '#a0a0b0',             // Misty grey
    colorTextSubtle: '#707080',            // Faded grey

    // Semantic colors - Muted against the void
    colorSuccess: '#70b080',               // Muted green
    colorWarning: '#c9a227',               // Gold warning
    colorError: '#c06060',                 // Muted red
    colorDanger: '#a04040',                // Dark red
    colorInfo: '#8090b0',                  // Light dream blue

    // Borders & interactions - Subtle ethereal blue
    colorBorder: 'rgba(160, 180, 220, 0.15)', // Ethereal blue border
    colorBorderSubtle: 'rgba(160, 180, 220, 0.08)', // Very subtle border
    colorDivider: 'rgba(160, 180, 220, 0.1)', // Subtle divider
    colorHover: 'rgba(201, 162, 39, 0.1)', // Gold hover
    colorSelected: 'rgba(201, 162, 39, 0.2)', // Gold selected
    colorFocusRing: 'rgba(201, 162, 39, 0.5)', // Gold focus ring

    // Typography - Ancient Scripts
    fontDisplay: "'Cinzel', 'Cormorant Garamond', Georgia, serif",
    fontBody: "'Crimson Text', 'EB Garamond', Georgia, serif",

    // Shadows - Deep blacks with subtle blue glow
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.6)',
    shadowMd: '0 4px 20px rgba(0, 0, 0, 0.7)',
    shadowLg: '0 8px 40px rgba(0, 0, 0, 0.8)',
    shadowGlow: '0 0 30px rgba(201, 162, 39, 0.25)',
    shadowHoverGlow: '0 0 35px rgba(201, 162, 39, 0.35)',
  },
};
