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
 * Deep navy backgrounds with vibrant cyan, magenta, and yellow accents
 * create a modern, tech-forward aesthetic perfect for managing
 * your comic collection.
 *
 * "Where every issue finds its place in the sequence."
 */
export const helixDarkTheme: ThemeDefinition = {
  id: 'default',
  scheme: 'dark',
  meta: {
    id: 'default',
    name: 'DNA Nexus',
    description: 'Modern dark theme with vibrant accent colors inspired by the Helixio logo',
    author: 'Helixio',
    previewColors: {
      primary: '#22D3EE',
      secondary: '#1E293B',
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
    colorSurfaceCardHover: 'rgba(34, 211, 238, 0.08)',

    // Primary & Accent - Vibrant logo colors
    colorPrimary: '#22D3EE',           // Cyan - main interactive color
    colorPrimaryHover: '#67E8F9',      // Lighter cyan on hover
    colorPrimaryMuted: 'rgba(34, 211, 238, 0.15)',
    colorSecondary: '#1E293B',         // Slate for secondary surfaces
    colorAccent: '#E91E8C',            // Magenta - highlights and special elements

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

    // Borders & interactions
    colorBorder: '#334155',            // Slate-700
    colorBorderSubtle: '#1E293B',      // Slate-800
    colorDivider: 'linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.3) 20%, rgba(233, 30, 140, 0.3) 80%, transparent)',
    colorHover: 'rgba(34, 211, 238, 0.08)',
    colorSelected: 'rgba(34, 211, 238, 0.15)',
    colorFocusRing: 'rgba(34, 211, 238, 0.5)',

    // Typography - Modern, clean fonts
    fontDisplay: "'Inter', 'SF Pro Display', system-ui, sans-serif",
    fontBody: "'Inter', 'SF Pro Text', system-ui, sans-serif",

    // Shadows - Subtle with brand color accents
    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.15)',
    shadowMd: '0 4px 6px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15)',
    shadowLg: '0 10px 15px rgba(0, 0, 0, 0.3), 0 4px 6px rgba(0, 0, 0, 0.2)',
    shadowGlow: '0 0 20px rgba(34, 211, 238, 0.15), 0 0 40px rgba(34, 211, 238, 0.05)',
    shadowHoverGlow: '0 0 25px rgba(34, 211, 238, 0.25), 0 0 50px rgba(233, 30, 140, 0.1)',

    // Title effects - Subtle cyan glow
    shadowTitleLocation: '0 2px 4px',
    colorShadowTitle: 'rgba(34, 211, 238, 0.3)',

    // Issue badge - Yellow from logo (high visibility)
    colorIssueBadge: '#FACC15',
    colorIssueBadgeCompleted: '#34D399',
    colorIssueBadgeText: '#0F172A',
    colorIssueBadgeTextCompleted: '#0F172A',

    // Border radius - Modern, slightly rounded
    radiusSm: '4px',
    radiusMd: '8px',
    radiusLg: '12px',
    radiusXl: '16px',
    radiusFull: '9999px',
  },
  effects: helixEffects,
};
