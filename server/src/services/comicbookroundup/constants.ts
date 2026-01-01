/**
 * ComicBookRoundup Constants
 *
 * Shared constants for URL construction and publisher mapping.
 */

// =============================================================================
// Base URLs
// =============================================================================

export const BASE_URL = 'https://comicbookroundup.com';
export const REVIEWS_PATH = '/comic-books/reviews';

// =============================================================================
// Publisher Slug Mappings
// =============================================================================

/**
 * Known publisher name to URL slug mappings.
 * CBR uses specific slugs for publishers in URLs.
 */
export const PUBLISHER_SLUGS: Record<string, string> = {
  // Marvel
  marvel: 'marvel-comics',
  'marvel comics': 'marvel-comics',

  // DC
  dc: 'dc-comics',
  'dc comics': 'dc-comics',

  // Image
  image: 'image-comics',
  'image comics': 'image-comics',

  // Dark Horse
  'dark horse': 'dark-horse-comics',
  'dark horse comics': 'dark-horse-comics',

  // IDW
  idw: 'idw-publishing',
  'idw publishing': 'idw-publishing',

  // BOOM!
  boom: 'boom-studios',
  'boom! studios': 'boom-studios',
  'boom studios': 'boom-studios',

  // Dynamite
  dynamite: 'dynamite-entertainment',
  'dynamite entertainment': 'dynamite-entertainment',

  // Valiant
  valiant: 'valiant-comics',
  'valiant comics': 'valiant-comics',

  // Archie
  archie: 'archie-comics',
  'archie comics': 'archie-comics',

  // Oni
  oni: 'oni-press',
  'oni press': 'oni-press',

  // Vertigo (DC imprint but has its own section)
  vertigo: 'vertigo',

  // AfterShock
  aftershock: 'aftershock-comics',
  'aftershock comics': 'aftershock-comics',

  // Others
  'avatar press': 'avatar-press',
  'black mask': 'black-mask-studios',
  'titan comics': 'titan-comics',
  'mad cave studios': 'mad-cave-studios',
  'scout comics': 'scout-comics',
  'vault comics': 'vault-comics',
};

// =============================================================================
// Publisher Imprints
// =============================================================================

/**
 * Parent publisher to imprint fallbacks.
 * When a series isn't found under the main publisher, try these imprints.
 */
export const PUBLISHER_IMPRINTS: Record<string, string[]> = {
  'dc-comics': [
    'vertigo',
    'black-label',
    'dc-black-label',
    'wildstorm',
    'milestone',
    'america-best-comics',
    'dc-ink',
    'dc-zoom',
  ],
  'marvel-comics': ['max', 'icon', 'epic', 'marvel-knights', 'ultimate'],
  'image-comics': ['top-cow', 'skybound', 'shadowline'],
  'dark-horse-comics': ['berger-books', 'dark-horse-originals'],
};

// =============================================================================
// Homepage Detection
// =============================================================================

/**
 * Titles that indicate we got redirected to the homepage instead of a series page.
 * CBR often returns 200 with homepage HTML instead of a 404.
 */
export const HOMEPAGE_TITLES = [
  'new comics',
  'compare what the critics say',
  'comic book roundup',
];
