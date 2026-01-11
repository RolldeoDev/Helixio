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
    colorBg: '#161210',                    // Deeper ink black
    colorBgSecondary: '#1e1915',           // Smoke-filled room, darker
    colorBgTertiary: '#0e0b09',            // Abyss shadow
    colorBgElevated: '#282220',            // Weathered desk surface
    colorBgCard: '#1a1512',                // Worn leather
    colorSurfaceCardHover: 'rgba(212, 168, 32, 0.10)', // Rich brass glint

    // Primary & Accent - Rich brass lamp and blood accents
    colorPrimary: '#d4a820',               // Rich polished brass
    colorPrimaryHover: '#e0b830',          // Gleaming brass
    colorPrimaryMuted: 'rgba(212, 168, 32, 0.18)',
    colorPrimaryText: '#0e0b09',           // Deep ink text on brass backgrounds
    colorSecondary: '#2a2420',             // Deep tobacco brown
    colorAccent: '#7a1f00',                // Darker dried blood

    // Text colors - Aged paper and typewriter ink
    colorText: '#d4c4a8',                  // Yellowed paper
    colorTextMuted: '#9a8b72',             // Faded newsprint
    colorTextSubtle: '#6b5d4a',            // Worn text

    // Semantic colors - Muted, period-appropriate
    colorSuccess: '#5a7247',               // Old money green
    colorWarning: '#c9a227',               // Brass warning
    colorWarningText: '#000000',           // Black text on brass for contrast
    colorError: '#8b2500',                 // Blood red
    colorDanger: '#6b1a00',                // Dark crimson
    colorInfo: '#5c6b78',                  // Steel blue

    // Borders & interactions - Rich brass accents
    colorBorder: 'rgba(212, 168, 32, 0.25)',
    colorBorderSubtle: 'rgba(212, 168, 32, 0.12)',
    colorDivider: 'rgba(212, 168, 32, 0.18)',
    colorHover: 'rgba(212, 168, 32, 0.12)',
    colorSelected: 'rgba(212, 168, 32, 0.25)',
    colorFocusRing: 'rgba(212, 168, 32, 0.55)',

    // Typography - Bold noir headlines and readable body
    fontDisplay: "'Playfair Display', 'Bodoni Moda', Georgia, serif",
    fontBody: "'Crimson Pro', 'Libre Baskerville', Georgia, serif",

    // Shadows - Deep noir shadows with warm lamp glow
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.6)',
    shadowMd: '0 4px 20px rgba(0, 0, 0, 0.7)',
    shadowLg: '0 8px 40px rgba(0, 0, 0, 0.8)',
    shadowGlow: '0 0 35px rgba(212, 168, 32, 0.22), 0 0 70px rgba(122, 31, 0, 0.15)',
    shadowHoverGlow: '0 0 45px rgba(212, 168, 32, 0.35), 0 0 90px rgba(122, 31, 0, 0.22)',

    // Title effects - Brass glow like a neon sign
    shadowTitleLocation: '2px 2px 0',
    colorShadowTitle: '#6b1a00',

    // Issue badge - Rich brass and blood
    colorIssueBadge: '#d4a820',
    colorIssueBadgeCompleted: '#5a7247',
    colorIssueBadgeText: '#161210',
    colorIssueBadgeTextCompleted: '#161210',

    // Border radius - Sharp edges like pulp magazine corners
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
