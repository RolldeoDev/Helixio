import type { EffectToggleDefinition, ThemeDefinition } from '../types';

// Shared effect definitions for Pulp Noir theme (used by both light and dark)
export const pulpEffects: EffectToggleDefinition[] = [
  {
    id: 'paperTexture',
    label: 'Paper Texture',
    description: 'Aged paper grain overlay for authentic vintage feel',
    defaultEnabled: true,
    category: 'background',
  },
  {
    id: 'inkSplatter',
    label: 'Ink Splatter',
    description: 'Subtle ink drops and printing imperfections',
    defaultEnabled: true,
    category: 'overlay',
  },
  {
    id: 'filmGrain',
    label: 'Film Grain',
    description: 'Classic film noir grain effect',
    defaultEnabled: true,
    category: 'overlay',
  },
  {
    id: 'vignette',
    label: 'Vignette',
    description: 'Dark corners like vintage photographs',
    defaultEnabled: true,
    category: 'overlay',
  },
  {
    id: 'pulpQuote',
    label: 'Pulp Quotes',
    description: 'Classic detective noir quotes with typewriter effect',
    defaultEnabled: true,
    category: 'ui',
  },
  {
    id: 'smokeWisps',
    label: 'Smoke Wisps',
    description: 'Subtle cigarette smoke drifting in corners',
    defaultEnabled: true,
    category: 'particles',
  },
];

/**
 * Pulp Noir Dark Theme - "Midnight Confessions"
 *
 * Step into the shadowy world of pulp detective fiction.
 *
 * This theme transforms the interface into a smoky detective's office:
 * - Deep ink blacks that swallow the light
 * - Warm candlelight amber casting long shadows
 * - Blood red accents like danger lurking in darkness
 * - Aged brass metallic hints from desk lamps and doorknobs
 * - Typography that screams from vintage crime magazine covers
 *
 * "She walked into my office like trouble on high heels.
 *  I knew right then this case would be the death of me."
 */
export const pulpDarkTheme: ThemeDefinition = {
  id: 'pulp',
  scheme: 'dark',
  meta: {
    id: 'pulp',
    name: 'Old Time Confessions',
    description: 'Smoky detective office with candlelight amber and blood red accents',
    author: 'Helixio',
    previewColors: {
      primary: '#c9a227',      // Brass lamp light
      secondary: '#1a1512',    // Ink black
      accent: '#8b2500',       // Blood red
      background: '#1a1512',   // Deep shadow
    },
  },
  tokens: {
    // Background colors - Deep ink blacks like a noir film
    colorBg: '#1a1512',                    // Ink black with warm undertone
    colorBgSecondary: '#231e1a',           // Smoke-filled room
    colorBgTertiary: '#120f0c',            // Deepest shadow
    colorBgElevated: '#2d2620',            // Desk surface
    colorBgCard: '#1f1a16',                // Worn leather
    colorSurfaceCardHover: 'rgba(201, 162, 39, 0.08)', // Brass glint

    // Primary & Accent - Brass lamp and blood accents
    colorPrimary: '#c9a227',               // Brass desk lamp
    colorPrimaryHover: '#dab632',          // Polished brass
    colorPrimaryMuted: 'rgba(201, 162, 39, 0.15)',
    colorPrimaryText: '#1a1512',           // Dark text on brass backgrounds
    colorSecondary: '#2d2620',             // Tobacco brown
    colorAccent: '#8b2500',                // Dried blood / danger

    // Text colors - Aged paper and typewriter ink
    colorText: '#d4c4a8',                  // Yellowed paper
    colorTextMuted: '#9a8b72',             // Faded newsprint
    colorTextSubtle: '#6b5d4a',            // Worn text

    // Semantic colors - Muted, period-appropriate
    colorSuccess: '#5a7247',               // Old money green
    colorWarning: '#c9a227',               // Brass warning
    colorError: '#8b2500',                 // Blood red
    colorDanger: '#6b1a00',                // Dark crimson
    colorInfo: '#5c6b78',                  // Steel blue

    // Borders & interactions - Subtle brass accents
    colorBorder: 'rgba(201, 162, 39, 0.2)',
    colorBorderSubtle: 'rgba(201, 162, 39, 0.1)',
    colorDivider: 'rgba(201, 162, 39, 0.15)',
    colorHover: 'rgba(201, 162, 39, 0.1)',
    colorSelected: 'rgba(201, 162, 39, 0.2)',
    colorFocusRing: 'rgba(201, 162, 39, 0.5)',

    // Typography - Bold noir headlines and readable body
    fontDisplay: "'Playfair Display', 'Bodoni Moda', Georgia, serif",
    fontBody: "'Crimson Pro', 'Libre Baskerville', Georgia, serif",

    // Shadows - Deep noir shadows with warm lamp glow
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.5)',
    shadowMd: '0 4px 20px rgba(0, 0, 0, 0.6)',
    shadowLg: '0 8px 40px rgba(0, 0, 0, 0.7)',
    shadowGlow: '0 0 30px rgba(201, 162, 39, 0.15), 0 0 60px rgba(139, 37, 0, 0.1)',
    shadowHoverGlow: '0 0 35px rgba(201, 162, 39, 0.25), 0 0 70px rgba(139, 37, 0, 0.15)',

    // Title effects - Brass glow like a neon sign
    shadowTitleLocation: '2px 2px 0',
    colorShadowTitle: '#6b1a00',

    // Issue badge - Brass and blood
    colorIssueBadge: '#c9a227',
    colorIssueBadgeCompleted: '#5a7247',
    colorIssueBadgeText: '#1a1512',
    colorIssueBadgeTextCompleted: '#1a1512',

    // Border radius - Sharp edges like pulp magazine corners
    radiusSm: '2px',
    radiusMd: '3px',
    radiusLg: '4px',
    radiusXl: '6px',
    radiusFull: '9999px',
  },
  effects: pulpEffects,
};
