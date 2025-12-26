import type { ThemeDefinition } from '../types';

/**
 * High Contrast Dark Theme
 * WCAG AAA compliant accessibility-focused theme
 *
 * Contrast ratios:
 * - Primary text (#FFFFFF) on background (#000000): 21:1 ✓ AAA
 * - Muted text (#E0E0E0) on background (#000000): 14.5:1 ✓ AAA
 * - Subtle text (#B0B0B0) on background (#000000): 9.4:1 ✓ AAA
 * - Primary accent (#00E5FF) on background (#000000): 12.6:1 ✓ AAA
 * - All interactive elements meet 3:1 minimum for UI components
 */
export const highContrastDarkTheme: ThemeDefinition = {
  id: 'high-contrast',
  scheme: 'dark',
  meta: {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'WCAG AAA compliant accessibility-focused theme with maximum contrast',
    author: 'Helixio',
    previewColors: {
      primary: '#00E5FF',
      secondary: '#1A1A1A',
      accent: '#FFD600',
      background: '#000000',
    },
  },
  tokens: {
    // Background colors - Pure black for maximum contrast
    colorBg: '#000000',
    colorBgSecondary: '#0D0D0D',
    colorBgTertiary: '#000000',
    colorBgElevated: '#1A1A1A',
    colorBgCard: '#0D0D0D',
    colorSurfaceCardHover: '#1F1F1F',

    // Primary & Accent - High visibility cyan and yellow
    // Cyan (#00E5FF) on black: 12.6:1 contrast ratio
    colorPrimary: '#00E5FF',
    colorPrimaryHover: '#4DF0FF',
    colorPrimaryMuted: '#003D45',
    colorSecondary: '#1A1A1A',
    // Yellow accent for maximum visibility
    colorAccent: '#FFD600',

    // Text colors - Pure white and high-contrast grays
    // White on black: 21:1 (maximum possible)
    colorText: '#FFFFFF',
    // Light gray for muted: 14.5:1 on black
    colorTextMuted: '#E0E0E0',
    // Lighter gray for subtle: 9.4:1 on black (still AAA compliant)
    colorTextSubtle: '#B0B0B0',

    // Semantic colors - Bright, saturated for visibility
    // All tested against black background for AAA compliance
    colorSuccess: '#00E676', // 11.3:1 contrast
    colorWarning: '#FFD600', // 15.1:1 contrast
    colorError: '#FF5252',   // 5.9:1 contrast (large text AAA, use with care)
    colorDanger: '#FF1744',  // 5.2:1 contrast (large text AAA)
    colorInfo: '#40C4FF',    // 10.9:1 contrast

    // Borders & interactions - Thick, visible boundaries
    colorBorder: '#666666',
    colorBorderSubtle: '#404040',
    colorDivider: '#666666',
    colorHover: '#1F1F1F',
    colorSelected: '#003D45',
    // Extra thick, bright focus ring for keyboard navigation
    colorFocusRing: '#FFD600',

    // Typography - System fonts optimized for readability
    // Using system fonts as they're optimized for each OS's accessibility features
    fontDisplay: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontBody: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",

    // Shadows - Minimal shadows, rely on borders for definition
    // High contrast themes should use solid borders, not subtle shadows
    shadowSm: '0 0 0 1px #404040',
    shadowMd: '0 0 0 2px #404040',
    shadowLg: '0 0 0 3px #404040',
    shadowGlow: '0 0 0 2px #00E5FF',
    shadowHoverGlow: '0 0 0 3px #00E5FF',

    // Title effects - Solid shadow for depth without reducing contrast
    shadowTitleLocation: '2px 2px 0',
    colorShadowTitle: '#333333',

    // Issue badge - High contrast yellow/black combination
    colorIssueBadge: '#FFD600',
    colorIssueBadgeCompleted: '#00E676',
    colorIssueBadgeText: '#000000',
    colorIssueBadgeTextCompleted: '#000000',

    // Border radius - Slightly reduced for cleaner visual boundaries
    radiusSm: '2px',
    radiusMd: '4px',
    radiusLg: '6px',
    radiusXl: '8px',
    radiusFull: '9999px',
  },
};
