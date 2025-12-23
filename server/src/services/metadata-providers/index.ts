/**
 * Metadata Providers Module
 *
 * Exports all metadata provider types, implementations, and registry.
 */

// Types
export * from './types.js';

// Providers
export { ComicVineProvider } from './comicvine.provider.js';
export { MetronProvider } from './metron.provider.js';
export { GCDProvider } from './gcd.provider.js';
export { AniListProvider } from './anilist.provider.js';
export { MALProvider } from './mal.provider.js';

// Registry
export { ProviderRegistry } from './registry.js';

// Initialize providers on module load
import { ProviderRegistry } from './registry.js';
import { ComicVineProvider } from './comicvine.provider.js';
import { MetronProvider } from './metron.provider.js';
import { GCDProvider } from './gcd.provider.js';
import { AniListProvider } from './anilist.provider.js';
import { MALProvider } from './mal.provider.js';

/**
 * Initialize all built-in providers
 * Call this once at application startup
 */
export function initializeProviders(): void {
  ProviderRegistry.register(ComicVineProvider);
  ProviderRegistry.register(MetronProvider);
  ProviderRegistry.register(GCDProvider);
  ProviderRegistry.register(AniListProvider);
  ProviderRegistry.register(MALProvider);
}

// Auto-initialize on import
initializeProviders();
