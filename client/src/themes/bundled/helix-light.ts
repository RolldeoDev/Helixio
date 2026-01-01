import type { ThemeDefinition } from '../types';
import { helixEffects } from './helix-dark';

/**
 * Helix Light Theme - "DNA Nexus Light"
 *
 * The light variant of the signature Helixio theme.
 * Clean slate-white backgrounds with a balanced triad of cyan, magenta,
 * and yellow accents create a bright, modern workspace that's
 * easy on the eyes during long collection management sessions.
 *
 * Color Philosophy (darker for light bg contrast):
 * - Cyan (#0891B2): Primary interactions, links, focus states
 * - Magenta (#DB2777): Special accents, featured highlights
 * - Yellow (#B45309): Warm accents, achievements, discovery moments
 *
 * "Illuminate your collection."
 */
export const helixLightTheme: ThemeDefinition = {
  id: 'default',
  scheme: 'light',
  meta: {
    id: 'default',
    name: 'DNA Nexus',
    description: 'Clean light theme with balanced cyan, magenta & yellow accents from the Helixio logo',
    author: 'Helixio',
    previewColors: {
      primary: '#0891B2',
      secondary: '#B45309',
      accent: '#DB2777',
      background: '#F8FAFC',
    },
  },
  tokens: {
    // Background colors - Clean slate whites
    colorBg: '#F8FAFC',
    colorBgSecondary: '#F1F5F9',
    colorBgTertiary: '#FFFFFF',
    colorBgElevated: '#FFFFFF',
    colorBgCard: '#FFFFFF',
    colorSurfaceCardHover: 'rgba(180, 83, 9, 0.05)',

    // Primary & Accent - Balanced CMY triad (darker for light bg)
    colorPrimary: '#0891B2',           // Cyan-600 - main interactive color
    colorPrimaryHover: '#0E7490',      // Cyan-700 on hover
    colorPrimaryMuted: 'rgba(8, 145, 178, 0.12)',
    colorPrimaryText: '#FFFFFF',       // White text on dark cyan backgrounds
    colorSecondary: '#B45309',         // Amber-700 - warm secondary accent
    colorAccent: '#DB2777',            // Pink-600 - special highlights

    // Text colors - High contrast on light
    colorText: '#0F172A',              // Slate-900
    colorTextMuted: '#475569',         // Slate-600
    colorTextSubtle: '#64748B',        // Slate-500

    // Semantic colors - Adjusted for light background
    colorSuccess: '#059669',           // Emerald-600
    colorWarning: '#B45309',           // Amber-700 (matches secondary)
    colorError: '#DC2626',             // Red-600
    colorDanger: '#B91C1C',            // Red-700
    colorInfo: '#0891B2',              // Cyan-600

    // Borders & interactions - Triadic color hints
    colorBorder: '#CBD5E1',            // Slate-300
    colorBorderSubtle: '#E2E8F0',      // Slate-200
    colorDivider: 'linear-gradient(90deg, transparent, rgba(8, 145, 178, 0.2) 15%, rgba(180, 83, 9, 0.15) 50%, rgba(219, 39, 119, 0.2) 85%, transparent)',
    colorHover: 'rgba(180, 83, 9, 0.06)',
    colorSelected: 'rgba(8, 145, 178, 0.12)',
    colorFocusRing: 'rgba(8, 145, 178, 0.5)',

    // Typography - Same modern fonts
    fontDisplay: "'Inter', 'SF Pro Display', system-ui, sans-serif",
    fontBody: "'Inter', 'SF Pro Text', system-ui, sans-serif",

    // Shadows - Triadic glow accents (subtle for light theme)
    shadowSm: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.1)',
    shadowMd: '0 4px 6px rgba(15, 23, 42, 0.07), 0 2px 4px rgba(15, 23, 42, 0.06)',
    shadowLg: '0 10px 15px rgba(15, 23, 42, 0.1), 0 4px 6px rgba(15, 23, 42, 0.05)',
    shadowGlow: '0 0 20px rgba(8, 145, 178, 0.08), 0 0 40px rgba(180, 83, 9, 0.04)',
    shadowHoverGlow: '0 0 25px rgba(8, 145, 178, 0.12), 0 0 35px rgba(180, 83, 9, 0.08), 0 0 50px rgba(219, 39, 119, 0.05)',

    // Title effects - Warm amber accent
    shadowTitleLocation: '0 1px 2px',
    colorShadowTitle: 'rgba(180, 83, 9, 0.15)',

    // Issue badge - Amber for light background visibility
    colorIssueBadge: '#B45309',         // Amber-700
    colorIssueBadgeCompleted: '#059669', // Emerald-600
    colorIssueBadgeText: '#FFFFFF',
    colorIssueBadgeTextCompleted: '#FFFFFF',

    // Border radius - Same as dark
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
  effects: helixEffects,
};
