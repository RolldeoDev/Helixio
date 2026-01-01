import type { ThemeDefinition } from '../types';
import { endlessNightEffects } from './sandman-dark';

/**
 * Endless Night Light Theme - "The Library of Dreams"
 *
 * The vast library of the Dreaming, curated by Lucienne.
 * Every book ever written, every story ever dreamed.
 *
 * This light variant maintains the Art Nouveau elegance while
 * evoking the warm, ancient atmosphere of endless shelves:
 * - Aged ivory and warm cream backgrounds
 * - Deep charcoal and teal for text
 * - Amber candlelight accents preserved from the dark theme
 * - Scholarly elegance with organic curves
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
    name: 'Endless Night',
    description: 'The Library of Dreams - every story ever imagined',
    author: 'Helixio',
    previewColors: {
      primary: '#b8854a',       // Warm amber - candlelight preserved
      secondary: '#f8f5f0',     // Aged ivory
      accent: '#2d7d8a',        // Deep ocean teal - consistent with dark
      background: '#faf7f2',    // Warm cream
    },
  },
  tokens: {
    // Background colors - Aged Ivory Layers
    colorBg: '#faf7f2',                    // Warm cream - primary surface
    colorBgSecondary: '#f0ebe4',           // Aged ivory - secondary areas
    colorBgTertiary: '#fffdf9',            // Pristine page - brightest
    colorBgElevated: '#ffffff',            // Pure white - elevated surfaces
    colorBgCard: '#fdfbf7',                // Soft cream - card surfaces
    colorSurfaceCardHover: 'rgba(184, 133, 74, 0.08)', // Amber hover

    // Primary & Accent - Amber and Teal preserved
    colorPrimary: '#b8854a',               // Warm amber - candlelight
    colorPrimaryHover: '#a07040',          // Deeper amber on hover
    colorPrimaryMuted: 'rgba(184, 133, 74, 0.15)', // Subtle amber
    colorPrimaryText: '#faf7f2',           // Light text on amber backgrounds
    colorSecondary: '#e8e3da',             // Warm linen - soft secondary
    colorAccent: '#2d7d8a',                // Deep ocean teal - consistent

    // Text colors - Deep charcoal with teal hints
    colorText: '#1a1d20',                  // Deep charcoal - primary text
    colorTextMuted: '#4a5560',             // Muted slate - secondary
    colorTextSubtle: '#7a8590',            // Light slate - tertiary

    // Semantic colors - Muted and harmonized
    colorSuccess: '#3d7a5a',               // Forest green
    colorWarning: '#b8854a',               // Amber (matches primary)
    colorError: '#a85050',                 // Muted crimson
    colorDanger: '#8a3a3a',                // Deep red
    colorInfo: '#3a7a8a',                  // Teal (near accent)

    // Borders & interactions - Subtle warmth
    colorBorder: '#dcd5ca',                // Warm edge
    colorBorderSubtle: '#e8e3da',          // Soft margin
    colorDivider: 'rgba(45, 125, 138, 0.2)', // Teal thread
    colorHover: 'rgba(184, 133, 74, 0.08)', // Touch of amber
    colorSelected: 'rgba(45, 125, 138, 0.12)', // Selected with teal
    colorFocusRing: 'rgba(45, 125, 138, 0.4)', // Teal focus

    // Typography - Art Nouveau elegance (consistent with dark)
    fontDisplay: "'Cormorant Garamond', Garamond, Georgia, serif",
    fontBody: "'Libre Baskerville', Baskerville, Georgia, serif",

    // Shadows - Warm and subtle
    shadowSm: '0 2px 8px rgba(26, 29, 32, 0.06)',
    shadowMd: '0 4px 16px rgba(26, 29, 32, 0.08)',
    shadowLg: '0 8px 32px rgba(26, 29, 32, 0.1)',
    shadowGlow: '0 0 20px rgba(184, 133, 74, 0.12)',
    shadowHoverGlow: '0 0 25px rgba(184, 133, 74, 0.2), 0 0 50px rgba(45, 125, 138, 0.08)',

    // Title effects - Amber illumination
    shadowTitleLocation: '0 1px 3px',
    colorShadowTitle: 'rgba(184, 133, 74, 0.25)',

    // Issue badge - Warm amber
    colorIssueBadge: '#b8854a',
    colorIssueBadgeCompleted: '#3d7a5a',
    colorIssueBadgeText: '#faf7f2',
    colorIssueBadgeTextCompleted: '#faf7f2',

    // Border radius - Soft organic curves
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
