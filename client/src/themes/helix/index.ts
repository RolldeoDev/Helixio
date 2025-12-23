/**
 * Helix Theme Module - "DNA Nexus"
 *
 * "Where every issue finds its place in the sequence."
 *
 * This module exports all Helix theme components and definitions.
 * Inspired by the Helixio DNA helix logo with its vibrant cyan,
 * magenta, and yellow accent colors on a deep navy foundation.
 *
 * Self-contained module that can be imported independently:
 * - Theme definitions (dark: DNA Nexus, light: DNA Nexus Light)
 * - Visual effects component (DNA strands, gradient mesh, floating nodes)
 * - CSS imported automatically with effects component
 *
 * Usage:
 *   import { helixDarkTheme, helixLightTheme, HelixEffects } from './themes/helix';
 */

// Theme definitions
export { helixDarkTheme } from '../bundled/helix-dark';
export { helixLightTheme } from '../bundled/helix-light';

// Visual effects component (imports CSS automatically)
export { HelixEffects } from './HelixEffects';

// Re-export types for convenience
export type { ThemeDefinition, ThemeTokens, ThemeMeta } from '../types';
