/**
 * ComicBookRoundup Page Fetcher
 *
 * Handles fetching and caching of CBR pages with rate limiting.
 */

import * as cheerio from 'cheerio';
import * as APICache from '../api-cache.service.js';
import { getExternalRatingsSettings } from '../config.service.js';
import { createServiceLogger } from '../logger.service.js';
import { BASE_URL, HOMEPAGE_TITLES } from './constants.js';
import { waitForRateLimit, updateRateLimitState } from './rate-limiter.js';
import { getCacheKeyFromUrl } from './url-builder.js';
import type { CBRFetchResult } from './types.js';

const logger = createServiceLogger('cbr-fetcher');

// =============================================================================
// User Agent and Headers
// =============================================================================

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// =============================================================================
// Page Validation
// =============================================================================

/**
 * Check if HTML is a valid series/issue page or if it's a redirect to the homepage.
 * CBR often returns 200 with the homepage HTML instead of a 404.
 */
export function isValidSeriesPage(html: string): boolean {
  const $ = cheerio.load(html);
  const pageTitle = $('h1').first().text().trim().toLowerCase();

  // If the h1 matches any homepage title, it's not a valid series page
  return !HOMEPAGE_TITLES.some((t) => pageTitle.includes(t));
}

// =============================================================================
// Page Fetching
// =============================================================================

/**
 * Get the cache TTL in milliseconds.
 * Uses the longer review TTL (14 days) to maximize cache reuse.
 */
function getCacheTtlMs(): number {
  const settings = getExternalRatingsSettings();
  const ttlDays = settings?.reviewTTLDays || 14;
  return ttlDays * 24 * 60 * 60 * 1000;
}

/**
 * Fetch a page from CBR with caching and rate limiting.
 *
 * @param url - The full URL to fetch
 * @returns Fetch result with HTML, cache status, and cache key
 */
export async function fetchPage(url: string): Promise<CBRFetchResult> {
  const cacheKey = getCacheKeyFromUrl(url);

  // Check cache first
  const cached = await APICache.get<{ html: string }>(
    'comicbookroundup',
    cacheKey,
    {}
  );

  if (cached && !cached.isStale) {
    logger.debug({ url }, 'Cache hit');
    return {
      html: cached.data.html,
      fromCache: true,
      cacheKey,
    };
  }

  // Wait for rate limit before making request
  await waitForRateLimit();

  try {
    logger.debug({ url }, 'Fetching page');

    const response = await fetch(url, {
      headers: DEFAULT_HEADERS,
    });

    updateRateLimitState(response.ok);

    if (!response.ok) {
      if (response.status === 404) {
        logger.debug({ url }, 'Page not found');
        return { html: null, fromCache: false, cacheKey };
      }
      logger.warn({ url, status: response.status }, 'Failed to fetch page');
      // Fall back to stale cache if available
      return {
        html: cached?.data.html || null,
        fromCache: !!cached,
        cacheKey,
      };
    }

    const html = await response.text();

    // Cache the result with 14-day TTL
    await APICache.set(
      'comicbookroundup',
      cacheKey,
      {},
      { html },
      { ttl: getCacheTtlMs() }
    );

    return { html, fromCache: false, cacheKey };
  } catch (error) {
    updateRateLimitState(false);
    logger.error({ url, error }, 'Error fetching page');
    // Fall back to stale cache if available
    return {
      html: cached?.data.html || null,
      fromCache: !!cached,
      cacheKey,
    };
  }
}

/**
 * Fetch a page and validate it's not a homepage redirect.
 *
 * @param url - The full URL to fetch
 * @returns The HTML if valid, null if not found or homepage redirect
 */
export async function fetchValidPage(url: string): Promise<string | null> {
  const result = await fetchPage(url);

  if (!result.html) {
    return null;
  }

  if (!isValidSeriesPage(result.html)) {
    logger.debug({ url }, 'Page is homepage redirect');
    return null;
  }

  return result.html;
}
