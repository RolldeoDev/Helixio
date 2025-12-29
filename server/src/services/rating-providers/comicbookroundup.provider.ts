/**
 * ComicBookRoundup Rating Provider
 *
 * Scrapes community and critic ratings from comicbookroundup.com
 *
 * URL Structure: https://comicbookroundup.com/comic-books/reviews/{publisher-slug}/{series-slug}
 * Example: https://comicbookroundup.com/comic-books/reviews/dc-comics/batman
 */

import * as cheerio from 'cheerio';
import {
  type RatingProvider,
  type RatingData,
  type RatingSearchQuery,
  type RatingMatchResult,
  normalizeRating,
} from './types.js';
import * as APICache from '../api-cache.service.js';
import { getExternalRatingsSettings } from '../config.service.js';
import { createServiceLogger } from '../logger.service.js';

const logger = createServiceLogger('comicbookroundup-provider');

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = 'https://comicbookroundup.com';
const REVIEWS_PATH = '/comic-books/reviews';

/** Known publisher name to slug mappings */
const PUBLISHER_SLUGS: Record<string, string> = {
  marvel: 'marvel-comics',
  'marvel comics': 'marvel-comics',
  dc: 'dc-comics',
  'dc comics': 'dc-comics',
  image: 'image-comics',
  'image comics': 'image-comics',
  'dark horse': 'dark-horse-comics',
  'dark horse comics': 'dark-horse-comics',
  idw: 'idw-publishing',
  'idw publishing': 'idw-publishing',
  boom: 'boom-studios',
  'boom! studios': 'boom-studios',
  'boom studios': 'boom-studios',
  dynamite: 'dynamite-entertainment',
  'dynamite entertainment': 'dynamite-entertainment',
  valiant: 'valiant-comics',
  'valiant comics': 'valiant-comics',
  archie: 'archie-comics',
  'archie comics': 'archie-comics',
  oni: 'oni-press',
  'oni press': 'oni-press',
  vertigo: 'vertigo',
  aftershock: 'aftershock-comics',
  'aftershock comics': 'aftershock-comics',
  'avatar press': 'avatar-press',
  'black mask': 'black-mask-studios',
  'titan comics': 'titan-comics',
  'mad cave studios': 'mad-cave-studios',
  'scout comics': 'scout-comics',
  'vault comics': 'vault-comics',
};

/**
 * Parent publisher to imprint fallbacks
 * When a series isn't found under the main publisher, try these imprints
 */
const PUBLISHER_IMPRINTS: Record<string, string[]> = {
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
// Rate Limiting State
// =============================================================================

let lastRequestTime = 0;
let consecutiveErrors = 0;

/**
 * Reset rate limiter state (for testing)
 */
export function resetRateLimiter(): void {
  lastRequestTime = 0;
  consecutiveErrors = 0;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get rate limit delay based on settings
 */
function getRateLimitDelayMs(): number {
  const settings = getExternalRatingsSettings();
  const requestsPerMinute = settings?.scrapingRateLimit || 10;
  // Convert to ms between requests
  return Math.ceil(60000 / requestsPerMinute);
}

/**
 * Wait for rate limit
 */
async function waitForRateLimit(): Promise<void> {
  const delayMs = getRateLimitDelayMs();
  const backoffMultiplier = Math.pow(2, consecutiveErrors);
  const totalDelay = delayMs * backoffMultiplier;

  const timeSinceLastRequest = Date.now() - lastRequestTime;
  if (timeSinceLastRequest < totalDelay) {
    await new Promise((resolve) =>
      setTimeout(resolve, totalDelay - timeSinceLastRequest)
    );
  }
}

/**
 * Update rate limit state after request
 */
function updateRateLimitState(success: boolean): void {
  lastRequestTime = Date.now();
  if (success) {
    consecutiveErrors = 0;
  } else {
    consecutiveErrors = Math.min(consecutiveErrors + 1, 5);
  }
}

/**
 * Convert a name to a URL slug
 * Example: "Batman" -> "batman"
 * Example: "The Amazing Spider-Man" -> "the-amazing-spider-man"
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '') // Remove apostrophes
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Get the publisher slug for a publisher name
 */
function getPublisherSlug(publisher: string): string | null {
  const normalized = publisher.toLowerCase().trim();
  return PUBLISHER_SLUGS[normalized] || toSlug(publisher);
}

/**
 * Build the URL for a series on CBR
 */
function buildSeriesUrl(publisherSlug: string, seriesSlug: string): string {
  return `${BASE_URL}${REVIEWS_PATH}/${publisherSlug}/${seriesSlug}`;
}

/**
 * Check if HTML is a valid series page or if it's a redirect to the homepage
 * CBR often returns 200 with the homepage HTML instead of a 404
 */
function isValidSeriesPage(html: string): boolean {
  const $ = cheerio.load(html);
  const pageTitle = $('h1').first().text().trim().toLowerCase();

  // Homepage titles that indicate we got redirected
  const homepageTitles = [
    'new comics',
    'compare what the critics say',
    'comic book roundup',
  ];

  // If the h1 matches any homepage title, it's not a valid series page
  return !homepageTitles.some((t) => pageTitle.includes(t));
}

/**
 * Fetch a page with caching and rate limiting
 */
async function fetchPage(url: string): Promise<string | null> {
  // Check cache first
  const cacheKey = url.replace(BASE_URL, '');
  const cached = await APICache.get<{ html: string }>(
    'comicbookroundup' as APICache.CacheSource,
    cacheKey,
    {}
  );

  if (cached && !cached.isStale) {
    logger.debug({ url }, 'Cache hit');
    return cached.data.html;
  }

  await waitForRateLimit();

  try {
    logger.debug({ url }, 'Fetching page');

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    updateRateLimitState(response.ok);

    if (!response.ok) {
      if (response.status === 404) {
        logger.debug({ url }, 'Page not found');
        return null;
      }
      logger.warn({ url, status: response.status }, 'Failed to fetch page');
      return cached?.data.html || null; // Fall back to stale cache
    }

    const html = await response.text();

    // Cache the result
    const settings = getExternalRatingsSettings();
    const ttlDays = settings?.ratingTTLDays || 7;
    await APICache.set(
      'comicbookroundup' as APICache.CacheSource,
      cacheKey,
      {},
      { html },
      { ttl: ttlDays * 24 * 60 * 60 * 1000 }
    );

    return html;
  } catch (error) {
    updateRateLimitState(false);
    logger.error({ url, error }, 'Error fetching page');
    return cached?.data.html || null;
  }
}

/**
 * Parse ratings from the page HTML
 */
function parseRatings(html: string): {
  critic?: { value: number; count: number };
  community?: { value: number; count: number };
} {
  const $ = cheerio.load(html);

  const result: {
    critic?: { value: number; count: number };
    community?: { value: number; count: number };
  } = {};

  // Try to find ratings in structured data (JSON-LD)
  const jsonLdScript = $('script[type="application/ld+json"]').text();
  if (jsonLdScript) {
    try {
      const jsonLd = JSON.parse(jsonLdScript);
      if (jsonLd.aggregateRating) {
        result.critic = {
          value: parseFloat(jsonLd.aggregateRating.ratingValue) || 0,
          count: parseInt(jsonLd.aggregateRating.ratingCount) || 0,
        };
      }
    } catch {
      // JSON-LD parsing failed, continue with HTML parsing
    }
  }

  // Try to find ratings in the HTML
  // Look for text like "6.8 Avg. Critic Rating" and "7.4 Avg. User Rating"
  const pageText = $('body').text();

  // Critic rating pattern
  const criticMatch = pageText.match(
    /(\d+\.?\d*)\s*(?:Avg\.?\s*)?Critic\s*Rating/i
  );
  if (criticMatch?.[1] && !result.critic) {
    result.critic = {
      value: parseFloat(criticMatch[1]),
      count: 0, // Will be parsed separately if available
    };
  }

  // User/community rating pattern
  const userMatch = pageText.match(
    /(\d+\.?\d*)\s*(?:Avg\.?\s*)?User\s*Rating/i
  );
  if (userMatch?.[1]) {
    result.community = {
      value: parseFloat(userMatch[1]),
      count: 0,
    };
  }

  // Try to parse review counts
  const criticCountMatch = pageText.match(/(\d+)\s*Critic\s*Reviews?/i);
  if (criticCountMatch?.[1] && result.critic) {
    result.critic.count = parseInt(criticCountMatch[1]);
  }

  const userCountMatch = pageText.match(/(\d+)\s*User\s*Reviews?/i);
  if (userCountMatch?.[1] && result.community) {
    result.community.count = parseInt(userCountMatch[1]);
  }

  // Alternative: Look for rating elements with specific classes
  const criticRatingEl = $('[class*="CriticRating"], .critic-rating').first();
  if (criticRatingEl.length && !result.critic) {
    const ratingText = criticRatingEl.text();
    const value = parseFloat(ratingText);
    if (!isNaN(value)) {
      result.critic = { value, count: 0 };
    }
  }

  const userRatingEl = $('[class*="UserRating"], .user-rating').first();
  if (userRatingEl.length && !result.community) {
    const ratingText = userRatingEl.text();
    const value = parseFloat(ratingText);
    if (!isNaN(value)) {
      result.community = { value, count: 0 };
    }
  }

  return result;
}

/**
 * Extract sourceId from a full CBR URL
 * Input: https://comicbookroundup.com/comic-books/reviews/dark-horse-comics/helen-of-wyndhorn-(2024)
 * Output: dark-horse-comics/helen-of-wyndhorn-(2024)
 */
function parseSourceIdFromUrl(url: string): string | null {
  const match = url.match(
    /comicbookroundup\.com\/comic-books\/reviews\/([^/]+\/[^/]+?)(?:\/\d+)?(?:[?#]|$)/
  );
  return match?.[1] ?? null;
}

/**
 * Search Google for CBR series pages
 * Includes year and writer in query for better matching
 * Google provides much better results than DuckDuckGo for this use case
 */
async function searchForSeries(
  query: import('./types.js').RatingSearchQuery
): Promise<Array<{ url: string; title: string }>> {
  await waitForRateLimit();

  // Build search query with available metadata
  const queryParts = [
    'site:comicbookroundup.com/comic-books/reviews',
    `"${query.seriesName}"`,
  ];

  // Add publisher if available
  if (query.publisher) {
    queryParts.push(`"${query.publisher}"`);
  }

  // Add year if available (helps disambiguate reboots)
  if (query.year) {
    queryParts.push(`${query.year}`);
  }

  // Add writer if available (helps narrow results)
  if (query.writer) {
    queryParts.push(`"${query.writer}"`);
  }

  const searchQuery = queryParts.join(' ');
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=10`;

  logger.debug({ searchQuery }, 'Performing Google search for CBR series');

  try {
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      updateRateLimitState(false);
      logger.warn({ status: response.status }, 'Google search failed');
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: Array<{ url: string; title: string }> = [];

    // Google search results - look for links containing comicbookroundup.com
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      // Google wraps URLs in /url?q= format
      let actualUrl = href;
      if (href.startsWith('/url?')) {
        const urlMatch = href.match(/[?&]q=([^&]+)/);
        if (urlMatch?.[1]) {
          actualUrl = decodeURIComponent(urlMatch[1]);
        }
      }

      // Only include CBR review URLs
      if (actualUrl.includes('comicbookroundup.com/comic-books/reviews/')) {
        // Get the title from the link text or parent element
        let title = $(el).text().trim();

        // If the link text is empty or just the URL, try to get title from parent h3
        if (!title || title === actualUrl || title.length < 3) {
          const h3 = $(el).closest('div').find('h3').first();
          if (h3.length) {
            title = h3.text().trim();
          }
        }

        // Avoid duplicates
        if (title && !results.some(r => r.url === actualUrl)) {
          results.push({ url: actualUrl, title });
        }
      }
    });

    updateRateLimitState(true);
    logger.debug({ resultCount: results.length }, 'Google search completed');
    return results;
  } catch (error) {
    updateRateLimitState(false);
    logger.warn({ error }, 'Google search error');
    return [];
  }
}

/**
 * Find the best matching series from search results
 * Prefers series pages over issue pages
 */
function findBestSeriesMatch(
  seriesName: string,
  results: Array<{ url: string; title: string }>
): { sourceId: string; confidence: number; matchedName: string } | null {
  const normalizedQuery = seriesName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  let bestMatch: {
    sourceId: string;
    confidence: number;
    matchedName: string;
  } | null = null;

  for (const result of results) {
    const sourceId = parseSourceIdFromUrl(result.url);
    if (!sourceId) continue;

    // Skip issue pages (URLs ending in /number)
    if (/\/\d+$/.test(result.url)) continue;

    // Extract series name from title (format: "Series Name (Year) Comic Series Reviews")
    const titleMatch = result.title.match(
      /^(.+?)\s*(?:\(\d{4}\))?\s*Comic Series Reviews/i
    );
    const matchedName =
      titleMatch && titleMatch[1] ? titleMatch[1].trim() : result.title;
    const normalizedTitle = matchedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    // Calculate match confidence
    let confidence = 0;

    if (normalizedTitle === normalizedQuery) {
      confidence = 0.95; // Exact match
    } else if (
      normalizedTitle.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedTitle)
    ) {
      confidence = 0.85; // Substring match
    } else {
      // Word-based similarity
      const queryWords = normalizedQuery.split(' ');
      const titleWords = normalizedTitle.split(' ');
      const matchingWords = queryWords.filter((w) => titleWords.includes(w));
      confidence =
        0.5 +
        (matchingWords.length / Math.max(queryWords.length, titleWords.length)) *
          0.3;
    }

    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = { sourceId, confidence, matchedName };
    }
  }

  return bestMatch;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export const ComicBookRoundupProvider: RatingProvider = {
  name: 'comicbookroundup',
  displayName: 'Comic Book Roundup',
  supportsIssueRatings: true,
  ratingTypes: ['community', 'critic'],

  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    try {
      const response = await fetch(BASE_URL, {
        method: 'HEAD',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });
      return {
        available: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  async searchSeries(query: RatingSearchQuery): Promise<RatingMatchResult | null> {
    // ComicBookRoundup doesn't have a search API, so we need to construct the URL directly
    // We need both publisher and series name to construct the URL

    if (!query.publisher) {
      logger.debug(
        { seriesName: query.seriesName },
        'No publisher provided, cannot construct CBR URL'
      );
      return null;
    }

    const publisherSlug = getPublisherSlug(query.publisher);
    if (!publisherSlug) {
      logger.debug(
        { publisher: query.publisher },
        'Unknown publisher, cannot construct CBR URL'
      );
      return null;
    }

    const seriesSlug = toSlug(query.seriesName);
    const url = buildSeriesUrl(publisherSlug, seriesSlug);

    logger.debug({ url, seriesName: query.seriesName }, 'Attempting to match series');

    // Try to fetch the page to verify it exists
    const html = await fetchPage(url);

    // Check if we got a valid series page (not a redirect to homepage)
    if (!html || !isValidSeriesPage(html)) {
      // Try alternate URL formats
      // Sometimes series have "the-" prefix or volume suffixes
      const alternates = [
        toSlug(query.seriesName.replace(/^the\s+/i, '')), // Remove "The"
        toSlug(`the-${query.seriesName}`), // Add "The"
        toSlug(query.seriesName.replace(/\s*\(\d{4}\)\s*$/, '')), // Remove year
        toSlug(query.seriesName.replace(/\s*v\d+\s*$/i, '')), // Remove volume
        toSlug(query.seriesName.replace(/\s*vol\.?\s*\d+\s*$/i, '')), // Remove "Vol X"
      ];

      for (const altSlug of alternates) {
        if (altSlug !== seriesSlug) {
          const altUrl = buildSeriesUrl(publisherSlug, altSlug);
          const altHtml = await fetchPage(altUrl);
          if (altHtml && isValidSeriesPage(altHtml)) {
            // Found with alternate slug
            return {
              sourceId: `${publisherSlug}/${altSlug}`,
              confidence: 0.7, // Lower confidence for fuzzy match
              matchMethod: 'fuzzy',
              matchedName: query.seriesName,
            };
          }
        }
      }

      // Try publisher imprints as fallback (e.g., DC Comics -> Vertigo)
      const imprints = PUBLISHER_IMPRINTS[publisherSlug];
      if (imprints) {
        logger.debug(
          { publisherSlug, imprints },
          'Trying imprint fallbacks for publisher'
        );

        for (const imprintSlug of imprints) {
          // Try exact series slug with imprint
          const imprintUrl = buildSeriesUrl(imprintSlug, seriesSlug);
          const imprintHtml = await fetchPage(imprintUrl);
          if (imprintHtml && isValidSeriesPage(imprintHtml)) {
            logger.debug(
              { imprintSlug, seriesSlug },
              'Found series under imprint'
            );
            return {
              sourceId: `${imprintSlug}/${seriesSlug}`,
              confidence: 0.75, // Slightly lower confidence for imprint fallback
              matchMethod: 'fuzzy',
              matchedName: query.seriesName,
            };
          }

          // Try alternate slugs with imprint
          for (const altSlug of alternates) {
            if (altSlug !== seriesSlug) {
              const altImprintUrl = buildSeriesUrl(imprintSlug, altSlug);
              const altImprintHtml = await fetchPage(altImprintUrl);
              if (altImprintHtml && isValidSeriesPage(altImprintHtml)) {
                logger.debug(
                  { imprintSlug, altSlug },
                  'Found series under imprint with alternate slug'
                );
                return {
                  sourceId: `${imprintSlug}/${altSlug}`,
                  confidence: 0.65, // Even lower for fuzzy + imprint
                  matchMethod: 'fuzzy',
                  matchedName: query.seriesName,
                };
              }
            }
          }
        }
      }

      // === Web Search Fallback ===
      // When URL construction fails, use web search with full metadata
      logger.debug(
        {
          seriesName: query.seriesName,
          publisher: query.publisher,
          year: query.year,
          writer: query.writer,
        },
        'URL construction failed, trying web search fallback'
      );

      const searchResults = await searchForSeries(query);
      if (searchResults.length > 0) {
        const match = findBestSeriesMatch(query.seriesName, searchResults);
        if (match && match.confidence >= 0.6) {
          // Verify the page actually exists and has ratings
          const parts = match.sourceId.split('/');
          const verifyPublisher = parts[0];
          const verifySlug = parts[1];

          if (!verifyPublisher || !verifySlug) {
            logger.warn({ sourceId: match.sourceId }, 'Invalid sourceId format');
            return null;
          }

          const verifyUrl = buildSeriesUrl(verifyPublisher, verifySlug);
          const verifyHtml = await fetchPage(verifyUrl);

          if (verifyHtml && isValidSeriesPage(verifyHtml)) {
            logger.info(
              { sourceId: match.sourceId, confidence: match.confidence },
              'Found series via web search'
            );
            return {
              sourceId: match.sourceId,
              confidence: match.confidence,
              matchMethod: 'search',
              matchedName: match.matchedName,
            };
          }
        }
      }

      return null;
    }

    // Page exists, verify it's the right series by checking the title
    const $ = cheerio.load(html);
    const pageTitle = $('h1').first().text().trim().toLowerCase();
    const queryName = query.seriesName.toLowerCase();

    // Calculate basic similarity
    const similarity = pageTitle.includes(queryName) || queryName.includes(pageTitle) ? 0.9 : 0.7;

    return {
      sourceId: `${publisherSlug}/${seriesSlug}`,
      confidence: similarity,
      matchMethod: similarity >= 0.9 ? 'name_year' : 'fuzzy',
      matchedName: $('h1').first().text().trim(),
    };
  },

  async getSeriesRatings(sourceId: string): Promise<RatingData[]> {
    const url = `${BASE_URL}${REVIEWS_PATH}/${sourceId}`;
    const html = await fetchPage(url);

    if (!html) {
      logger.warn({ sourceId }, 'Failed to fetch series page');
      return [];
    }

    const parsed = parseRatings(html);
    const ratings: RatingData[] = [];

    if (parsed.critic && parsed.critic.value > 0) {
      ratings.push({
        source: 'comicbookroundup',
        sourceId,
        ratingType: 'critic',
        value: normalizeRating(parsed.critic.value, 10), // CBR uses 0-10 scale
        originalValue: parsed.critic.value,
        scale: 10,
        voteCount: parsed.critic.count,
      });
    }

    if (parsed.community && parsed.community.value > 0) {
      ratings.push({
        source: 'comicbookroundup',
        sourceId,
        ratingType: 'community',
        value: normalizeRating(parsed.community.value, 10),
        originalValue: parsed.community.value,
        scale: 10,
        voteCount: parsed.community.count,
      });
    }

    logger.debug(
      { sourceId, ratingCount: ratings.length },
      'Parsed series ratings'
    );

    return ratings;
  },

  async getIssueRatings(
    seriesSourceId: string,
    issueNumber: string
  ): Promise<RatingData[]> {
    // Issue URL format: /comic-books/reviews/{publisher}/{series}/{issue-number}
    const issueSlug = issueNumber.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const url = `${BASE_URL}${REVIEWS_PATH}/${seriesSourceId}/${issueSlug}`;
    const html = await fetchPage(url);

    // Check if we got a valid issue page (not a redirect to homepage)
    if (!html || !isValidSeriesPage(html)) {
      // Try with just the number (some issues use plain numbers)
      const numericUrl = `${BASE_URL}${REVIEWS_PATH}/${seriesSourceId}/${issueNumber}`;
      const numericHtml = await fetchPage(numericUrl);

      if (!numericHtml || !isValidSeriesPage(numericHtml)) {
        logger.debug(
          { seriesSourceId, issueNumber },
          'Issue page not found or redirected to homepage'
        );
        return [];
      }

      return this.parseIssueRatings(seriesSourceId, issueNumber, numericHtml);
    }

    return this.parseIssueRatings(seriesSourceId, issueNumber, html);
  },

  // Helper method for parsing issue ratings (not part of interface)
  parseIssueRatings(
    seriesSourceId: string,
    issueNumber: string,
    html: string
  ): RatingData[] {
    const parsed = parseRatings(html);
    const ratings: RatingData[] = [];
    const sourceId = `${seriesSourceId}/${issueNumber}`;

    if (parsed.critic && parsed.critic.value > 0) {
      ratings.push({
        source: 'comicbookroundup',
        sourceId,
        ratingType: 'critic',
        value: normalizeRating(parsed.critic.value, 10),
        originalValue: parsed.critic.value,
        scale: 10,
        voteCount: parsed.critic.count,
      });
    }

    if (parsed.community && parsed.community.value > 0) {
      ratings.push({
        source: 'comicbookroundup',
        sourceId,
        ratingType: 'community',
        value: normalizeRating(parsed.community.value, 10),
        originalValue: parsed.community.value,
        scale: 10,
        voteCount: parsed.community.count,
      });
    }

    return ratings;
  },
} as RatingProvider & {
  parseIssueRatings: (
    seriesSourceId: string,
    issueNumber: string,
    html: string
  ) => RatingData[];
};

// Register the provider
import { register } from './registry.js';
register(ComicBookRoundupProvider);

export default ComicBookRoundupProvider;
