import type { ThemeDefinition } from '../types';
import { mangaEffects } from './manga-dark';

/**
 * Manga Light Theme - "Sakura Garden"
 *
 * A soft, ethereal Japanese aesthetic with cherry blossom pinks and cream whites.
 * Inspired by manga paper and spring gardens - clean, peaceful, delicate.
 *
 * Color philosophy:
 * - Warm cream whites like traditional manga paper
 * - Soft sakura pink tints throughout
 * - Deeper rose and wisteria for interactive elements
 * - Gentle contrast that feels calm and inviting
 */
export const mangaLightTheme: ThemeDefinition = {
  id: 'manga',
  scheme: 'light',
  meta: {
    id: 'manga',
    name: 'Sakura Garden',
    description: 'Soft Japanese aesthetic with cherry blossom pinks and cream',
    author: 'Helixio',
    previewColors: {
      primary: '#d47a8c',
      secondary: '#9b72cf',
      accent: '#c4a7e7',
      background: '#faf9f7',
    },
  },
  tokens: {
    // Background colors - Warm cream and soft pink
    colorBg: '#faf9f7',
    colorBgSecondary: '#fff5f6',
    colorBgTertiary: '#f5f3f0',
    colorBgElevated: '#ffffff',
    colorBgCard: '#ffffff',
    colorSurfaceCardHover: 'rgba(212, 122, 140, 0.06)',

    // Primary & Accent - Deep sakura and wisteria
    colorPrimary: '#d47a8c',
    colorPrimaryHover: '#c46878',
    colorPrimaryMuted: 'rgba(212, 122, 140, 0.12)',
    colorSecondary: '#f8f0f2',
    colorAccent: '#9b72cf',

    // Text colors - Warm charcoal
    colorText: '#2a2530',
    colorTextMuted: '#6b6472',
    colorTextSubtle: '#9a94a2',

    // Semantic colors - Soft, pastel versions
    colorSuccess: '#7ec88b',
    colorWarning: '#e5b567',
    colorError: '#e07a7a',
    colorDanger: '#d05858',
    colorInfo: '#6aaccc',

    // Borders & interactions
    colorBorder: '#e8e0e2',
    colorBorderSubtle: '#f0e8ea',
    colorDivider: 'linear-gradient(90deg, transparent, #e8e0e2 20%, #e8e0e2 80%, transparent)',
    colorHover: 'rgba(212, 122, 140, 0.08)',
    colorSelected: 'rgba(212, 122, 140, 0.12)',
    colorFocusRing: 'rgba(212, 122, 140, 0.35)',

    // Typography - Elegant Japanese-inspired fonts
    fontDisplay: "'Shippori Antique', 'Hiragino Mincho ProN', serif",
    fontBody: "'Zen Kaku Gothic New', 'Hiragino Sans', system-ui, sans-serif",

    // Shadows - Soft, ethereal
    shadowSm: '0 2px 8px rgba(42, 37, 48, 0.06)',
    shadowMd: '0 4px 16px rgba(42, 37, 48, 0.08)',
    shadowLg: '0 8px 32px rgba(42, 37, 48, 0.1)',
    shadowGlow: '0 0 20px rgba(212, 122, 140, 0.1), 0 0 40px rgba(155, 114, 207, 0.06)',
    shadowHoverGlow: '0 0 25px rgba(212, 122, 140, 0.15), 0 0 50px rgba(155, 114, 207, 0.1)',

    // Title effects - Soft sakura tint
    shadowTitleLocation: '0 1px 2px',
    colorShadowTitle: '#d47a8c',

    // Issue badge - Warm honey gold
    colorIssueBadge: '#d4a056',
    colorIssueBadgeCompleted: '#7ec88b',
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
