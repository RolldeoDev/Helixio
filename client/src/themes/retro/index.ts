/**
 * Retro Gaming Theme Module - "Pixel Quest"
 *
 * "IT'S DANGEROUS TO GO ALONE! TAKE THIS."
 *
 * This module exports all Retro Gaming theme components and definitions.
 * Inspired by 8-bit/16-bit consoles: NES, SNES, Sega Genesis, Game Boy.
 *
 * Self-contained module that can be imported independently:
 * - Theme definitions (dark: Pixel Quest, light: Game Boy)
 * - Visual effects component (pixel particles, CRT effects, game UI)
 * - CSS imported automatically with effects component
 *
 * Usage:
 *   import { retroDarkTheme, retroLightTheme, RetroEffects } from './themes/retro';
 */

// Theme definitions
export { retroDarkTheme } from '../bundled/retro-dark';
export { retroLightTheme } from '../bundled/retro-light';

// Visual effects component (imports CSS automatically)
export { RetroEffects } from './RetroEffects';

// Re-export types for convenience
export type { ThemeDefinition, ThemeTokens, ThemeMeta } from '../types';
