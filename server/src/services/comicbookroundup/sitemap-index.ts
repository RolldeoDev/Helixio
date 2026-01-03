/**
 * ComicBookRoundup Sitemap Index
 *
 * Builds and searches a local index of CBR series from their public sitemaps.
 * Replaces the broken Google search fallback for series matching.
 *
 * Sitemaps provide complete coverage of all CBR series and are designed for
 * crawlers, so they don't block programmatic access like Google does.
 */

import * as cheerio from 'cheerio';
import * as APICache from '../api-cache.service.js';
import { createServiceLogger } from '../logger.service.js';
import { waitForRateLimit, updateRateLimitState } from './rate-limiter.js';
import type { CBRSearchQuery, CBRSeriesMatch, CBRSeriesEntry } from './types.js';

const logger = createServiceLogger('cbr-sitemap');

// =============================================================================
// Constants
// =============================================================================

const SITEMAP_URLS = [
  'https://comicbookroundup.com/sitemap_ssl.xml',
  'https://comicbookroundup.com/sitemap2_ssl.xml',
];

const SITEMAP_CACHE_KEY = 'sitemap-series-index';
const SITEMAP_CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days
const SITEMAP_FAILURE_TTL = 5 * 60 * 1000; // 5 minutes for failed fetches

const USER_AGENT =
  'Mozilla/5.0 (compatible; Helixio/1.0; +https://github.com/helixio)';

// =============================================================================
// Sitemap Fetching
// =============================================================================

/**
 * Fetch XML content from a sitemap URL.
 */
async function fetchSitemapXml(url: string): Promise<string | null> {
  await waitForRateLimit();

  try {
    logger.debug({ url }, 'Fetching sitemap');

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/xml,text/xml,*/*',
      },
    });

    updateRateLimitState(response.ok);

    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'Failed to fetch sitemap');
      return null;
    }

    return await response.text();
  } catch (error) {
    updateRateLimitState(false);
    logger.error({ url, error }, 'Error fetching sitemap');
    return null;
  }
}

/**
 * Fetch all sitemaps and return their combined XML content.
 */
async function fetchAllSitemaps(): Promise<string[]> {
  const xmlContents: string[] = [];

  for (const url of SITEMAP_URLS) {
    const xml = await fetchSitemapXml(url);
    if (xml) {
      xmlContents.push(xml);
    }
  }

  return xmlContents;
}

// =============================================================================
// Sitemap Parsing
// =============================================================================

/**
 * Extract all URLs from sitemap XML.
 */
export function parseSitemapUrls(xml: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: string[] = [];

  $('url loc').each((_, el) => {
    const url = $(el).text().trim();
    if (url) {
      urls.push(url);
    }
  });

  return urls;
}

/**
 * Convert a series slug to a human-readable name.
 * @example "helen-of-wyndhorn-(2024)" -> "Helen of Wyndhorn (2024)"
 */
function slugToName(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/**
 * Extract series entries from CBR review URLs.
 * Only extracts series pages, skipping issue pages.
 */
export function extractSeriesFromUrls(urls: string[]): CBRSeriesEntry[] {
  const seriesMap = new Map<string, CBRSeriesEntry>();

  // Pattern: /comic-books/reviews/{publisher}/{series}/{optional-issue}
  const reviewUrlPattern =
    /comicbookroundup\.com\/comic-books\/reviews\/([^/]+)\/([^/]+)(?:\/[^/]+)?$/;

  for (const url of urls) {
    const match = url.match(reviewUrlPattern);
    if (!match) continue;

    const [, publisher, seriesSlug] = match;
    if (!publisher || !seriesSlug) continue;

    const sourceId = `${publisher}/${seriesSlug}`;

    // Skip if we've already seen this series
    if (seriesMap.has(sourceId)) continue;

    seriesMap.set(sourceId, {
      sourceId,
      publisher,
      seriesSlug,
      seriesName: slugToName(seriesSlug),
    });
  }

  return Array.from(seriesMap.values());
}

// =============================================================================
// Index Building
// =============================================================================

/**
 * Build the complete series index from sitemaps.
 */
async function buildSeriesIndex(): Promise<CBRSeriesEntry[]> {
  logger.info('Building CBR series index from sitemaps');

  const xmlContents = await fetchAllSitemaps();

  if (xmlContents.length === 0) {
    logger.warn('Failed to fetch any sitemaps');
    return [];
  }

  // Parse all URLs from sitemaps
  const allUrls: string[] = [];
  for (const xml of xmlContents) {
    allUrls.push(...parseSitemapUrls(xml));
  }

  logger.debug({ urlCount: allUrls.length }, 'Parsed URLs from sitemaps');

  // Extract unique series
  const series = extractSeriesFromUrls(allUrls);

  logger.info({ seriesCount: series.length }, 'Built CBR series index');

  return series;
}

/**
 * Get the series index, using cache if available.
 */
export async function getSeriesIndex(): Promise<CBRSeriesEntry[]> {
  // Check cache first
  const cached = await APICache.get<CBRSeriesEntry[]>(
    'comicbookroundup',
    SITEMAP_CACHE_KEY,
    {}
  );

  if (cached && !cached.isStale) {
    logger.debug({ seriesCount: cached.data.length }, 'Using cached series index');
    return cached.data;
  }

  // Build fresh index
  const index = await buildSeriesIndex();

  // Cache the index (even if empty, to prevent retry storms)
  const cacheTtl = index.length > 0 ? SITEMAP_CACHE_TTL : SITEMAP_FAILURE_TTL;
  await APICache.set('comicbookroundup', SITEMAP_CACHE_KEY, {}, index, {
    ttl: cacheTtl,
  });

  return index;
}

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Normalize a string for comparison.
 * Converts to lowercase, splits camelCase, removes special characters, normalizes spaces.
 */
function normalize(str: string): string {
  return str
    // Split camelCase: "SelfMadeHero" -> "Self Made Hero"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Check if a publisher entry matches the query publisher.
 */
function matchesPublisher(entryPublisher: string, queryPublisher: string): boolean {
  const normalizedEntry = normalize(entryPublisher);
  const normalizedQuery = normalize(queryPublisher);

  return (
    normalizedEntry === normalizedQuery ||
    normalizedEntry.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedEntry)
  );
}

/**
 * Known publisher-to-imprint mappings.
 * Used to give partial credit when the query publisher is a parent
 * and the entry publisher is a known imprint.
 */
const PUBLISHER_IMPRINTS: Record<string, string[]> = {
  dc: ['vertigo', 'black label', 'wildstorm', 'milestone', 'dc black label'],
  marvel: ['max', 'icon', 'epic', 'ultimate', 'marvel knights'],
  image: ['top cow', 'skybound', 'shadowline'],
  'dark horse': ['berger books', 'dark horse originals'],
};

/**
 * Check if the entry publisher is a known imprint of the query publisher.
 * Example: "vertigo" is an imprint of "dc", so if query is "DC Comics"
 * and entry is "vertigo", this returns true.
 */
function isKnownImprint(entryPublisher: string, queryPublisher: string): boolean {
  const normalizedQuery = normalize(queryPublisher);
  const normalizedEntry = normalize(entryPublisher);

  for (const [parent, imprints] of Object.entries(PUBLISHER_IMPRINTS)) {
    if (normalizedQuery.includes(parent)) {
      if (imprints.some((imp) => normalizedEntry.includes(imp))) {
        return true;
      }
    }
  }
  return false;
}

// Weighting constants for match scoring
// Series name is heavily weighted (95%) to ensure exact name matches always win
// Publisher is a tie-breaker only (5%)
const NAME_WEIGHT = 0.95;
const PUBLISHER_WEIGHT = 0.05;

/**
 * Calculate a weighted match score for a series entry against a query.
 * Series name similarity accounts for 95% of the score.
 * Publisher match/imprint bonus accounts for 5% (tie-breaker only).
 */
function calculateMatchScore(entry: CBRSeriesEntry, query: CBRSearchQuery): number {
  const normalizedQueryName = normalize(query.seriesName);
  const normalizedEntryName = normalize(entry.seriesName);

  // Series name similarity (95% weight) - ensures name is dominant factor
  let nameScore = 0;
  if (normalizedEntryName === normalizedQueryName) {
    nameScore = 1.0; // Exact match
  } else if (
    normalizedEntryName.includes(normalizedQueryName) ||
    normalizedQueryName.includes(normalizedEntryName)
  ) {
    nameScore = 0.85; // Substring match
  } else {
    // Word overlap scoring
    const queryWords = normalizedQueryName.split(' ').filter(Boolean);
    const entryWords = normalizedEntryName.split(' ').filter(Boolean);
    const overlap = queryWords.filter((w) => entryWords.includes(w)).length;
    if (overlap > 0) {
      nameScore = overlap / Math.max(queryWords.length, entryWords.length);
    }
  }

  // Publisher bonus (5% weight) - tie-breaker only
  let publisherBonus = 0;
  if (query.publisher) {
    if (matchesPublisher(entry.publisher, query.publisher)) {
      publisherBonus = 1.0; // Full bonus for direct match
    } else if (isKnownImprint(entry.publisher, query.publisher)) {
      publisherBonus = 0.8; // Partial bonus for imprint relationship
    }
  }

  // Combined score: 95% name + 5% publisher
  return nameScore * NAME_WEIGHT + publisherBonus * PUBLISHER_WEIGHT;
}

/**
 * Search the series index for a matching series.
 * Uses weighted scoring where series name is the dominant factor (95%)
 * and publisher match is a tie-breaker (5%).
 */
export function searchSeriesIndex(
  query: CBRSearchQuery,
  index: CBRSeriesEntry[]
): CBRSeriesMatch | null {
  const normalizedQuery = normalize(query.seriesName);

  if (!normalizedQuery) {
    return null;
  }

  let bestMatch: CBRSeriesMatch | null = null;
  let bestScore = 0;

  for (const entry of index) {
    const score = calculateMatchScore(entry, query);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        sourceId: entry.sourceId,
        confidence: score,
        matchMethod: 'sitemap' as const,
        matchedName: entry.seriesName,
      };
    }
  }

  // Only return matches above threshold
  return bestMatch && bestMatch.confidence >= 0.6 ? bestMatch : null;
}

/**
 * Search for a series using the sitemap index.
 * Main entry point for series-matcher.ts.
 */
export async function searchViaSitemapIndex(
  query: CBRSearchQuery
): Promise<CBRSeriesMatch | null> {
  try {
    const index = await getSeriesIndex();

    if (index.length === 0) {
      logger.warn('Series index is empty, cannot search');
      return null;
    }

    const match = searchSeriesIndex(query, index);

    if (match) {
      logger.debug(
        {
          seriesName: query.seriesName,
          sourceId: match.sourceId,
          confidence: match.confidence,
        },
        'Found series via sitemap index'
      );
    }

    return match;
  } catch (error) {
    logger.error({ error, query }, 'Error searching sitemap index');
    return null;
  }
}

// =============================================================================
// Status and Management Functions
// =============================================================================

/**
 * Status information for the sitemap index cache.
 */
export interface SitemapIndexStatus {
  cached: boolean;
  seriesCount: number;
  createdAt: Date | null;
  expiresAt: Date | null;
  isStale: boolean;
  sitemapUrls: string[];
}

/**
 * Get the current status of the sitemap index cache.
 */
export async function getSitemapIndexStatus(): Promise<SitemapIndexStatus> {
  const cached = await APICache.get<CBRSeriesEntry[]>(
    'comicbookroundup',
    SITEMAP_CACHE_KEY,
    {}
  );

  return {
    cached: !!cached,
    seriesCount: cached?.data.length ?? 0,
    createdAt: cached?.createdAt ?? null,
    expiresAt: cached?.expiresAt ?? null,
    isStale: cached?.isStale ?? true,
    sitemapUrls: SITEMAP_URLS,
  };
}

/**
 * Result of refreshing the sitemap index.
 */
export interface SitemapRefreshResult {
  success: boolean;
  seriesCount: number;
  error?: string;
}

/**
 * Force refresh the sitemap index by invalidating cache and rebuilding.
 */
export async function refreshSitemapIndex(): Promise<SitemapRefreshResult> {
  logger.info('Manually refreshing sitemap index');

  // Invalidate existing cache
  await APICache.invalidate({
    source: 'comicbookroundup',
    endpoint: SITEMAP_CACHE_KEY,
  });

  // Rebuild index (this will fetch fresh and cache it)
  const index = await getSeriesIndex();

  const result: SitemapRefreshResult = {
    success: index.length > 0,
    seriesCount: index.length,
    error: index.length === 0 ? 'Failed to fetch sitemaps' : undefined,
  };

  logger.info({ result }, 'Sitemap index refresh complete');

  return result;
}
