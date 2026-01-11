import type { ThemeDefinition } from '../types';
import { pulpEffects } from './pulp-dark';

/**
 * Pulp Noir Light Theme - "Newsstand Noir"
 *
 * The weathered pages of yesterday's crime stories.
 *
 * This theme captures the feeling of aged newsprint:
 * - Yellowed paper that's seen better days
 * - Sepia tones from decades of oxidation
 * - Ink that's bled and faded with time
 * - The musty charm of a vintage bookstore
 * - Headlines that once screamed from spinning racks
 *
 * "EXTRA! EXTRA! Read all about it!
 *  Murder on Fifth Avenue - Dame Found Dead!"
 */
export const pulpLightTheme: ThemeDefinition = {
  id: 'pulp',
  scheme: 'light',
  meta: {
    id: 'pulp',
    name: 'Newsstand Noir',
    description: 'Aged newsprint paper with sepia ink and vintage charm',
    author: 'Helixio',
    previewColors: {
      primary: '#5c4a32',      // Sepia ink
      secondary: '#f4ece0',    // Yellowed paper
      accent: '#8b2500',       // Blood red
      background: '#f4ece0',   // Aged paper
    },
  },
  tokens: {
    // Background colors - Yellowed newsprint paper
    colorBg: '#f4ece0',                    // Aged paper
    colorBgSecondary: '#ebe3d5',           // Darker aged paper
    colorBgTertiary: '#faf6f0',            // Fresh-ish paper
    colorBgElevated: '#ffffff',            // Clean overlay
    colorBgCard: '#f0e8da',                // Card stock
    colorSurfaceCardHover: 'rgba(92, 74, 50, 0.06)',

    // Primary & Accent - Sepia ink and blood
    colorPrimary: '#5c4a32',               // Sepia brown ink
    colorPrimaryHover: '#4a3c28',          // Darker ink
    colorPrimaryMuted: 'rgba(92, 74, 50, 0.12)',
    colorPrimaryText: '#f4ece0',           // Aged paper text on sepia backgrounds
    colorSecondary: '#d4c4a8',             // Aged highlight
    colorAccent: '#8b2500',                // Blood red accent

    // Text colors - Printing ink on aged paper
    colorText: '#2d2418',                  // Dense ink black
    colorTextMuted: '#5c4a32',             // Faded sepia
    colorTextSubtle: '#8b7355',            // Very faded

    // Semantic colors - Vintage print palette
    colorSuccess: '#4a5f3a',               // Forest green ink
    colorWarning: '#8b6914',               // Mustard yellow
    colorWarningText: '#ffffff',           // White text on dark gold
    colorError: '#8b2500',                 // Blood red
    colorDanger: '#6b1a00',                // Dark crimson
    colorInfo: '#4a5a6b',                  // Steel blue ink

    // Borders & interactions - Ink line work
    colorBorder: 'rgba(45, 36, 24, 0.2)',
    colorBorderSubtle: 'rgba(45, 36, 24, 0.1)',
    colorDivider: 'rgba(45, 36, 24, 0.15)',
    colorHover: 'rgba(92, 74, 50, 0.08)',
    colorSelected: 'rgba(92, 74, 50, 0.15)',
    colorFocusRing: 'rgba(92, 74, 50, 0.4)',

    // Typography - Classic newspaper headlines
    fontDisplay: "'Playfair Display', 'Bodoni Moda', Georgia, serif",
    fontBody: "'Crimson Pro', 'Libre Baskerville', Georgia, serif",

    // Shadows - Soft shadows like stacked papers
    shadowSm: '0 1px 3px rgba(45, 36, 24, 0.1)',
    shadowMd: '0 3px 10px rgba(45, 36, 24, 0.12)',
    shadowLg: '0 8px 25px rgba(45, 36, 24, 0.15)',
    shadowGlow: '0 0 20px rgba(92, 74, 50, 0.08)',
    shadowHoverGlow: '0 0 25px rgba(92, 74, 50, 0.12)',

    // Title effects - Subtle ink shadow
    shadowTitleLocation: '1px 1px 0',
    colorShadowTitle: 'rgba(139, 37, 0, 0.3)',

    // Issue badge - Sepia and vintage green
    colorIssueBadge: '#5c4a32',
    colorIssueBadgeCompleted: '#4a5f3a',
    colorIssueBadgeText: '#f4ece0',
    colorIssueBadgeTextCompleted: '#f4ece0',

    // Border radius - Sharp like magazine corners
    radiusXs: '1px',
    radiusSm: '2px',
    radiusMd: '3px',
    radiusLg: '4px',
    radiusXl: '6px',
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
  effects: pulpEffects,
};
