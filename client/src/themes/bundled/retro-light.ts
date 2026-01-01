import type { ThemeDefinition } from '../types';
import { retroEffects } from './retro-dark';

/**
 * Retro Gaming Light Theme - "Game Boy"
 *
 * Inspired by the iconic Nintendo Game Boy's green LCD screen.
 * That distinctive dot-matrix display with its limited color palette
 * defined portable gaming for a generation.
 *
 * "A WINNER IS YOU!"
 */
export const retroLightTheme: ThemeDefinition = {
  id: 'retro',
  scheme: 'light',
  meta: {
    id: 'retro',
    name: 'Pixel Quest',
    description: 'Game Boy inspired LCD green palette',
    author: 'Helixio',
    previewColors: {
      primary: '#306850',      // Dark Game Boy green
      secondary: '#9bbc0f',    // Classic LCD green
      accent: '#0f380f',       // Darkest GB shade
      background: '#9bbc0f',
    },
  },
  tokens: {
    // Background colors - Game Boy LCD greens
    colorBg: '#9bbc0f',              // Classic LCD green (lightest)
    colorBgSecondary: '#8bac0f',     // Slightly darker
    colorBgTertiary: '#aac820',      // Highlight green
    colorBgElevated: '#9bbc0f',
    colorBgCard: '#8bac0f',
    colorSurfaceCardHover: 'rgba(15, 56, 15, 0.1)',

    // Primary & Accent - Game Boy 4-shade palette
    colorPrimary: '#306850',          // Mid-dark green
    colorPrimaryHover: '#0f380f',     // Darkest shade
    colorPrimaryMuted: 'rgba(48, 104, 80, 0.25)',
    colorPrimaryText: '#9bbc0f',      // LCD green text on dark green backgrounds
    colorSecondary: '#8bac0f',
    colorAccent: '#0f380f',           // Darkest green (sprites/text)

    // Text colors - Game Boy dark greens
    colorText: '#0f380f',             // Darkest shade for text
    colorTextMuted: '#306850',        // Mid shade
    colorTextSubtle: '#4a7858',       // Lighter mid

    // Semantic colors - Adjusted for GB palette feel
    colorSuccess: '#306850',
    colorWarning: '#0f380f',
    colorError: '#0f380f',
    colorDanger: '#0f380f',
    colorInfo: '#306850',

    // Borders & interactions
    colorBorder: '#306850',
    colorBorderSubtle: 'rgba(48, 104, 80, 0.4)',
    colorDivider: 'linear-gradient(90deg, transparent, #306850 20%, #0f380f 50%, #306850 80%, transparent)',
    colorHover: 'rgba(15, 56, 15, 0.1)',
    colorSelected: 'rgba(15, 56, 15, 0.2)',
    colorFocusRing: 'rgba(15, 56, 15, 0.5)',

    // Typography - Same pixel fonts
    fontDisplay: "'Press Start 2P', 'VT323', monospace",
    fontBody: "'VT323', 'Press Start 2P', monospace",

    // Shadows - Pixel-art hard shadows
    shadowSm: '3px 3px 0 rgba(15, 56, 15, 0.3)',
    shadowMd: '4px 4px 0 rgba(15, 56, 15, 0.4)',
    shadowLg: '6px 6px 0 rgba(15, 56, 15, 0.4)',
    shadowGlow: '0 0 0 2px #0f380f',
    shadowHoverGlow: '0 0 0 3px #0f380f, 0 0 10px rgba(15, 56, 15, 0.3)',

    // Title effects - Game Boy style
    shadowTitleLocation: '2px 2px 0',
    colorShadowTitle: '#306850',

    // Issue badge - Dark Game Boy green
    colorIssueBadge: '#306850',
    colorIssueBadgeCompleted: '#0f380f',
    colorIssueBadgeText: '#9bbc0f',
    colorIssueBadgeTextCompleted: '#9bbc0f',

    // Border radius - Pixel-perfect with no rounding
    radiusXs: '0px',
    radiusSm: '0px',
    radiusMd: '0px',
    radiusLg: '0px',
    radiusXl: '0px',
    radiusFull: '0px',

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
  effects: retroEffects,
};
