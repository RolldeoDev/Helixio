/**
 * Manga/Anime Theme Module - "Sakura Collection"
 *
 * This module exports all Manga theme components and definitions.
 * Inspired by Japanese manga and anime aesthetics - serene, elegant, whimsical.
 *
 * Self-contained module that can be imported independently:
 * - Theme definitions (dark: Midnight Manga, light: Sakura Garden)
 * - Visual effects component (sakura petals, paper texture, expressions)
 * - CSS imported automatically with effects component
 *
 * Usage:
 *   import { mangaDarkTheme, mangaLightTheme, MangaEffects } from './themes/manga';
 */

// Theme definitions
export { mangaDarkTheme } from '../bundled/manga-dark';
export { mangaLightTheme } from '../bundled/manga-light';

// Visual effects component (imports CSS automatically)
export { MangaEffects } from './MangaEffects';

// Re-export types for convenience
export type { ThemeDefinition, ThemeTokens, ThemeMeta } from '../types';
