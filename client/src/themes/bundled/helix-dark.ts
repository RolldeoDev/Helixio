import type { EffectToggleDefinition, ThemeDefinition } from '../types';

// Shared effect definitions for Helix theme (used by both light and dark)
export const helixEffects: EffectToggleDefinition[] = [
  {
    id: 'dnaStrands',
    label: 'DNA Strands',
    description: 'Subtle animated DNA helix strands floating in the background',
    defaultEnabled: true,
    category: 'background',
  },
  {
    id: 'gradientMesh',
    label: 'Gradient Mesh',
    description: 'Soft color gradient overlay using brand colors',
    defaultEnabled: true,
    category: 'overlay',
  },
  {
    id: 'floatingNodes',
    label: 'Floating Nodes',
    description: 'Connected particles representing data nodes',
    defaultEnabled: false,
    category: 'particles',
  },
  {
    id: 'subtleGlow',
    label: 'Accent Glow',
    description: 'Soft glow effects on interactive elements',
    defaultEnabled: true,
    category: 'ui',
  },
];

/**
 * Helix Dark Theme - "DNA Nexus"
 *
 * The signature Helixio theme inspired by the DNA helix logo.
 * Deep navy backgrounds with a balanced triad of cyan, magenta, and yellow
 * accents create a modern, tech-forward aesthetic perfect for managing
 * your comic collection.
 *
 * Color Philosophy:
 * - Cyan (#22D3EE): Primary interactions, links, focus states
 * - Magenta (#E91E8C): Special accents, featured highlights
 * - Yellow (#FACC15): Warm accents, achievements, discovery moments
 *
 * "Where every issue finds its place in the sequence."
 */
export const helixDarkTheme: ThemeDefinition = {
  id: 'default',
  scheme: 'dark',
  meta: {
    id: 'default',
    name: 'DNA Nexus',
    description: 'Modern dark theme with balanced cyan, magenta & yellow accents from the Helixio logo',
    author: 'Helixio',
    previewColors: {
      primary: '#22D3EE',
      secondary: '#FACC15',
      accent: '#E91E8C',
      background: '#0F172A',
    },
  },
  tokens: {
    // Background colors - Deep navy slate (inspired by logo circle)
    colorBg: '#0F172A',
    colorBgSecondary: '#1E293B',
    colorBgTertiary: '#0A0F1C',
    colorBgElevated: '#1E293B',
    colorBgCard: '#162032',
    colorSurfaceCardHover: 'rgba(250, 204, 21, 0.06)',

    // Primary & Accent - Balanced CMY triad from logo
    colorPrimary: '#22D3EE',           // Cyan - main interactive color
    colorPrimaryHover: '#67E8F9',      // Lighter cyan on hover
    colorPrimaryMuted: 'rgba(34, 211, 238, 0.15)',
    colorPrimaryText: '#0F172A',       // Dark text on bright cyan backgrounds
    colorSecondary: '#FACC15',         // Yellow - warm secondary accent
    colorAccent: '#E91E8C',            // Magenta - special highlights

    // Text colors - Clean, high contrast
    colorText: '#F1F5F9',              // Bright slate-white
    colorTextMuted: '#94A3B8',         // Slate-400
    colorTextSubtle: '#64748B',        // Slate-500

    // Semantic colors - Harmonized with brand palette
    colorSuccess: '#34D399',           // Emerald-400
    colorWarning: '#FACC15',           // Yellow from logo
    colorError: '#F87171',             // Red-400
    colorDanger: '#EF4444',            // Red-500
    colorInfo: '#22D3EE',              // Cyan (matches primary)

    // Borders & interactions - Triadic color hints
    colorBorder: '#334155',            // Slate-700
    colorBorderSubtle: '#1E293B',      // Slate-800
    colorDivider: 'linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.25) 15%, rgba(250, 204, 21, 0.2) 50%, rgba(233, 30, 140, 0.25) 85%, transparent)',
    colorHover: 'rgba(250, 204, 21, 0.08)',
    colorSelected: 'rgba(34, 211, 238, 0.15)',
    colorFocusRing: 'rgba(34, 211, 238, 0.5)',

    // Typography - Modern, clean fonts
    fontDisplay: "'Inter', 'SF Pro Display', system-ui, sans-serif",
    fontBody: "'Inter', 'SF Pro Text', system-ui, sans-serif",

    // Shadows - Triadic glow accents
    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.15)',
    shadowMd: '0 4px 6px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15)',
    shadowLg: '0 10px 15px rgba(0, 0, 0, 0.3), 0 4px 6px rgba(0, 0, 0, 0.2)',
    shadowGlow: '0 0 20px rgba(34, 211, 238, 0.12), 0 0 40px rgba(250, 204, 21, 0.06)',
    shadowHoverGlow: '0 0 25px rgba(34, 211, 238, 0.2), 0 0 35px rgba(250, 204, 21, 0.12), 0 0 50px rgba(233, 30, 140, 0.08)',

    // Title effects - Warm yellow-cyan accent
    shadowTitleLocation: '0 2px 4px',
    colorShadowTitle: 'rgba(250, 204, 21, 0.25)',

    // Issue badge - Yellow from logo (high visibility)
    colorIssueBadge: '#FACC15',
    colorIssueBadgeCompleted: '#34D399',
    colorIssueBadgeText: '#0F172A',
    colorIssueBadgeTextCompleted: '#0F172A',

    // Border radius - Modern, slightly rounded
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
