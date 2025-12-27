import type { ThemeDefinition } from '../types';
import { sandmanEffects } from './sandman-dark';

/**
 * Sandman Light Theme - "Lucienne's Library"
 *
 * The vast library of the Dreaming, curated by Lucienne.
 * Every book ever written, every story ever dreamed.
 *
 * This light variant maintains the ethereal quality while
 * evoking the warm, ancient atmosphere of endless shelves:
 * - Aged parchment and cream backgrounds
 * - Ink blacks and deep purples for text
 * - Gold leaf accents and illuminated manuscript touches
 * - Subtle vellum textures and scholarly elegance
 *
 * "The library contains every book that has ever been dreamed.
 *  Every book that has ever been imagined. Every book that has
 *  ever been lost." - Lucienne
 */
export const sandmanLightTheme: ThemeDefinition = {
  id: 'sandman',
  scheme: 'light',
  meta: {
    id: 'sandman',
    name: 'The Dreaming',
    description: "Lucienne's Library - every story ever dreamed",
    author: 'Helixio',
    previewColors: {
      primary: '#8b6914',       // Antique gold - illuminated manuscripts
      secondary: '#f5f0e6',     // Aged parchment
      accent: '#4a3875',        // Royal purple - the binding of dream books
      background: '#faf6ed',    // Cream vellum
    },
  },
  tokens: {
    // Background colors - Ancient Parchment Layers
    colorBg: '#faf6ed',                    // Fresh Vellum - primary surface
    colorBgSecondary: '#f0ebe0',           // Aged Parchment - secondary areas
    colorBgTertiary: '#fffdf8',            // Pristine Page - brightest white
    colorBgElevated: '#ffffff',            // Floating Manuscript - pure elevated
    colorBgCard: '#fdfbf6',                // Dream Journal - card surfaces
    colorSurfaceCardHover: 'rgba(139, 105, 20, 0.06)', // Touch of gold hover

    // Primary & Accent - Illuminated Manuscript Colors
    colorPrimary: '#8b6914',               // Gold Leaf - rich antique gold
    colorPrimaryHover: '#a37d1a',          // Burnished Gold - activated
    colorPrimaryMuted: 'rgba(139, 105, 20, 0.12)', // Gold Dust - subtle
    colorPrimaryText: '#FFFFFF',           // White text on gold backgrounds
    colorSecondary: '#e8e3d9',             // Linen Paper - soft secondary
    colorAccent: '#4a3875',                // Royal Purple - dream binding

    // Text colors - Ink and Quill
    colorText: '#1a1520',                  // Midnight Ink - deep purple-black
    colorTextMuted: '#5c4d6b',             // Faded Script - muted purple
    colorTextSubtle: '#8a7a99',            // Aged Notation - light purple-gray

    // Semantic colors - Marginalia Markers
    colorSuccess: '#2d6a4f',               // Verdant Note - forest green
    colorWarning: '#b8860b',               // Ochre Mark - warning gold
    colorError: '#9b2335',                 // Crimson Seal - deep red
    colorDanger: '#7b1d1d',                // Blood Ink - danger
    colorInfo: '#2563eb',                  // Lapis Lazuli - information blue

    // Borders & interactions - Gilded Edges
    colorBorder: '#d4cfc6',                // Deckle Edge - visible boundary
    colorBorderSubtle: '#e8e4dc',          // Soft Margin - subtle
    colorDivider: 'linear-gradient(90deg, transparent, #8b6914 20%, #4a3875 50%, #8b6914 80%, transparent)', // Gold thread
    colorHover: 'rgba(139, 105, 20, 0.06)', // Touch of Gold
    colorSelected: 'rgba(74, 56, 117, 0.12)', // Selected Passage
    colorFocusRing: 'rgba(139, 105, 20, 0.4)', // Gilded Focus

    // Typography - Scholarly Scripts
    fontDisplay: "'Cinzel', 'Cormorant Garamond', Georgia, serif",
    fontBody: "'Crimson Text', 'EB Garamond', Georgia, serif",

    // Shadows - Candlelight and Depth
    shadowSm: '0 2px 8px rgba(26, 21, 32, 0.06), 0 0 0 1px rgba(139, 105, 20, 0.03)',
    shadowMd: '0 4px 16px rgba(26, 21, 32, 0.08), 0 0 0 1px rgba(139, 105, 20, 0.05)',
    shadowLg: '0 8px 32px rgba(26, 21, 32, 0.1), 0 0 20px rgba(74, 56, 117, 0.05)',
    shadowGlow: '0 0 20px rgba(139, 105, 20, 0.15), 0 0 40px rgba(74, 56, 117, 0.08)',
    shadowHoverGlow: '0 0 25px rgba(139, 105, 20, 0.25), 0 0 50px rgba(74, 56, 117, 0.12)',

    // Title effects - Gold leaf glow
    shadowTitleLocation: '0 1px 2px',
    colorShadowTitle: '#8b6914',

    // Issue badge - Antique gold
    colorIssueBadge: '#a37d1a',
    colorIssueBadgeCompleted: '#2d6a4f',
    colorIssueBadgeText: '#1a1a1a',
    colorIssueBadgeTextCompleted: '#ffffff',

    // Border radius
    radiusSm: '4px',
    radiusMd: '8px',
    radiusLg: '12px',
    radiusXl: '16px',
    radiusFull: '9999px',
  },
  effects: sandmanEffects,
};
