import type { EffectToggleDefinition, ThemeDefinition } from '../types';

// Shared effect definitions for Manga theme (used by both light and dark)
export const mangaEffects: EffectToggleDefinition[] = [
  {
    id: 'sakuraPetals',
    label: 'Sakura Petals',
    description: 'Gentle cherry blossom petals floating down',
    defaultEnabled: true,
    category: 'particles',
  },
  {
    id: 'paperTexture',
    label: 'Paper Texture',
    description: 'Subtle paper grain overlay for authentic manga feel',
    defaultEnabled: true,
    category: 'background',
  },
  {
    id: 'vignette',
    label: 'Vignette',
    description: 'Soft pink edges creating a dreamy focus',
    defaultEnabled: true,
    category: 'overlay',
  },
  {
    id: 'speedLines',
    label: 'Speed Lines',
    description: 'Manga-style action lines radiating from center',
    defaultEnabled: false,
    category: 'background',
  },
  {
    id: 'sparkleStars',
    label: 'Sparkle Stars',
    description: 'Twinkling stars for magical moments',
    defaultEnabled: true,
    category: 'particles',
  },
  {
    id: 'sakuraFlower',
    label: 'Sakura Flower',
    description: 'Decorative cherry blossom in corner',
    defaultEnabled: true,
    category: 'ui',
  },
  {
    id: 'mangaExpression',
    label: 'Manga Expressions',
    description: 'Japanese sound effects and expressions (Sugoi!, Kawaii, etc.)',
    defaultEnabled: true,
    category: 'ui',
  },
];

/**
 * Manga Dark Theme - "Midnight Manga"
 *
 * A serene Japanese aesthetic with sakura pink accents against deep ink blacks.
 * Inspired by reading manga late at night - soft, contemplative, elegant.
 *
 * Color philosophy:
 * - Deep ink backgrounds reminiscent of manga panel gutters
 * - Sakura pink (cherry blossom) as primary accent
 * - Wisteria purple as secondary accent
 * - Soft, muted tones that don't strain the eyes
 */
export const mangaDarkTheme: ThemeDefinition = {
  id: 'manga',
  scheme: 'dark',
  meta: {
    id: 'manga',
    name: 'Midnight Manga',
    description: 'Serene Japanese aesthetic with sakura pink and soft pastels',
    author: 'Helixio',
    previewColors: {
      primary: '#ffb7c5',
      secondary: '#c4a7e7',
      accent: '#e8ccd7',
      background: '#0f0f14',
    },
  },
  tokens: {
    // Background colors - Deep ink
    colorBg: '#0f0f14',
    colorBgSecondary: '#161622',
    colorBgTertiary: '#0a0a0e',
    colorBgElevated: '#1c1c28',
    colorBgCard: '#13131e',
    colorSurfaceCardHover: 'rgba(255, 183, 197, 0.06)',

    // Primary & Accent - Sakura pink and wisteria purple
    colorPrimary: '#ffb7c5',
    colorPrimaryHover: '#ffcdd7',
    colorPrimaryMuted: 'rgba(255, 183, 197, 0.15)',
    colorPrimaryText: '#1a1a1a',       // Dark text on light sakura pink
    colorSecondary: '#1e1e2e',
    colorAccent: '#c4a7e7',

    // Text colors - Soft warm white
    colorText: '#f8f4f5',
    colorTextMuted: '#a8a4b0',
    colorTextSubtle: '#6e6a78',

    // Semantic colors - Soft, muted versions
    colorSuccess: '#98d8aa',
    colorWarning: '#f5d89a',
    colorError: '#f5a9a9',
    colorDanger: '#e87a7a',
    colorInfo: '#a9c8e8',

    // Borders & interactions
    colorBorder: '#2a2a38',
    colorBorderSubtle: '#1f1f2a',
    colorDivider: 'linear-gradient(90deg, transparent, #2a2a38 20%, #2a2a38 80%, transparent)',
    colorHover: 'rgba(255, 183, 197, 0.08)',
    colorSelected: 'rgba(255, 183, 197, 0.15)',
    colorFocusRing: 'rgba(255, 183, 197, 0.4)',

    // Typography - Elegant Japanese-inspired fonts
    fontDisplay: "'Shippori Antique', 'Hiragino Mincho ProN', serif",
    fontBody: "'Zen Kaku Gothic New', 'Hiragino Sans', system-ui, sans-serif",

    // Shadows - Soft, dreamy
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.3)',
    shadowMd: '0 4px 16px rgba(0, 0, 0, 0.35)',
    shadowLg: '0 8px 32px rgba(0, 0, 0, 0.45)',
    shadowGlow: '0 0 20px rgba(255, 183, 197, 0.12), 0 0 40px rgba(196, 167, 231, 0.08)',
    shadowHoverGlow: '0 0 25px rgba(255, 183, 197, 0.2), 0 0 50px rgba(196, 167, 231, 0.12)',

    // Title effects - Sakura pink soft glow
    shadowTitleLocation: '0 0 8px',
    colorShadowTitle: '#ffb7c5',

    // Issue badge - Soft warm gold complementing sakura pink
    colorIssueBadge: '#f0c674',
    colorIssueBadgeCompleted: '#98d8aa',
    colorIssueBadgeText: '#1a1a1a',
    colorIssueBadgeTextCompleted: '#1a1a1a',

    // Border radius - Soft, rounded edges
    radiusSm: '6px',
    radiusMd: '10px',
    radiusLg: '14px',
    radiusXl: '20px',
    radiusFull: '9999px',
  },
  effects: mangaEffects,
};
