/**
 * Review Providers
 *
 * External review provider system for fetching user and critic reviews
 * from various sources like AniList, MyAnimeList, and Comic Book Roundup.
 */

// Export types
export * from './types.js';

// Export registry
export { ReviewProviderRegistry, default as ReviewProviderRegistryDefault } from './registry.js';

// Import providers to trigger auto-registration
// These imports have side effects (self-registration)
import './anilist.provider.js';
import './mal.provider.js';
import './comicbookroundup.provider.js';
