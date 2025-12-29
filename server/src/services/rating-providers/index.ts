/**
 * Rating Providers
 *
 * External rating providers for fetching community/critic ratings.
 */

// Export types
export * from './types.js';

// Export registry
export { RatingProviderRegistry, default as Registry } from './registry.js';

// Import providers to trigger registration
import './comicbookroundup.provider.js';
import './anilist.provider.js';

// Export individual providers
export { ComicBookRoundupProvider } from './comicbookroundup.provider.js';
export { AniListRatingProvider } from './anilist.provider.js';
