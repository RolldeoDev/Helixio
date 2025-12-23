import type { ThemeDefinition } from '../types';
import { helixEffects } from './helix-dark';

/**
 * Helix Light Theme - "DNA Nexus Light"
 *
 * The light variant of the signature Helixio theme.
 * Clean slate-white backgrounds with the same vibrant cyan, magenta,
 * and yellow accents create a bright, modern workspace that's
 * easy on the eyes during long collection management sessions.
 *
 * "Illuminate your collection."
 */
export const helixLightTheme: ThemeDefinition = {
  id: 'default',
  scheme: 'light',
  meta: {
    id: 'default',
    name: 'DNA Nexus',
    description: 'Clean light theme with vibrant accent colors inspired by the Helixio logo',
    author: 'Helixio',
    previewColors: {
      primary: '#0891B2',
      secondary: '#F1F5F9',
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
    colorSurfaceCardHover: 'rgba(8, 145, 178, 0.06)',

    // Primary & Accent - Deeper versions for light background contrast
    colorPrimary: '#0891B2',           // Cyan-600 - darker for readability
    colorPrimaryHover: '#0E7490',      // Cyan-700 on hover
    colorPrimaryMuted: 'rgba(8, 145, 178, 0.12)',
    colorSecondary: '#E2E8F0',         // Slate-200
    colorAccent: '#DB2777',            // Pink-600 - darker magenta

    // Text colors - High contrast on light
    colorText: '#0F172A',              // Slate-900
    colorTextMuted: '#475569',         // Slate-600
    colorTextSubtle: '#64748B',        // Slate-500

    // Semantic colors - Adjusted for light background
    colorSuccess: '#059669',           // Emerald-600
    colorWarning: '#CA8A04',           // Yellow-600
    colorError: '#DC2626',             // Red-600
    colorDanger: '#B91C1C',            // Red-700
    colorInfo: '#0891B2',              // Cyan-600

    // Borders & interactions
    colorBorder: '#CBD5E1',            // Slate-300
    colorBorderSubtle: '#E2E8F0',      // Slate-200
    colorDivider: 'linear-gradient(90deg, transparent, rgba(8, 145, 178, 0.25) 20%, rgba(219, 39, 119, 0.25) 80%, transparent)',
    colorHover: 'rgba(8, 145, 178, 0.06)',
    colorSelected: 'rgba(8, 145, 178, 0.12)',
    colorFocusRing: 'rgba(8, 145, 178, 0.5)',

    // Typography - Same modern fonts
    fontDisplay: "'Inter', 'SF Pro Display', system-ui, sans-serif",
    fontBody: "'Inter', 'SF Pro Text', system-ui, sans-serif",

    // Shadows - Soft, subtle for light theme
    shadowSm: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.1)',
    shadowMd: '0 4px 6px rgba(15, 23, 42, 0.07), 0 2px 4px rgba(15, 23, 42, 0.06)',
    shadowLg: '0 10px 15px rgba(15, 23, 42, 0.1), 0 4px 6px rgba(15, 23, 42, 0.05)',
    shadowGlow: '0 0 20px rgba(8, 145, 178, 0.1)',
    shadowHoverGlow: '0 0 25px rgba(8, 145, 178, 0.15), 0 0 50px rgba(219, 39, 119, 0.05)',

    // Title effects - Subtle shadow
    shadowTitleLocation: '0 1px 2px',
    colorShadowTitle: 'rgba(15, 23, 42, 0.1)',

    // Issue badge - Adjusted for light background
    colorIssueBadge: '#CA8A04',         // Yellow-600
    colorIssueBadgeCompleted: '#059669', // Emerald-600
    colorIssueBadgeText: '#FFFFFF',
    colorIssueBadgeTextCompleted: '#FFFFFF',

    // Border radius - Same as dark
    radiusSm: '4px',
    radiusMd: '8px',
    radiusLg: '12px',
    radiusXl: '16px',
    radiusFull: '9999px',
  },
  effects: helixEffects,
};
