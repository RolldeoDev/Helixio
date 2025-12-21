/**
 * Synthwave Theme Module - "Neon Arcade"
 *
 * "INSERT COIN TO CONTINUE"
 *
 * This module exports all Synthwave theme components and definitions.
 * Inspired by 1980s arcade culture, VHS aesthetics, and the synthwave genre.
 *
 * Self-contained module that can be imported independently:
 * - Theme definitions (dark/light variants)
 * - Visual effects component
 * - CSS imported automatically with effects component
 *
 * Usage:
 *   import { synthwaveDarkTheme, synthwaveLightTheme, SynthwaveEffects } from './themes/synthwave';
 */

// Theme definitions
export { synthwaveDarkTheme } from '../bundled/synthwave-dark';
export { synthwaveLightTheme } from '../bundled/synthwave-light';

// Visual effects component (imports CSS automatically)
export { SynthwaveEffects } from './SynthwaveEffects';

// Re-export types for convenience
export type { ThemeDefinition, ThemeTokens, ThemeMeta } from '../types';
