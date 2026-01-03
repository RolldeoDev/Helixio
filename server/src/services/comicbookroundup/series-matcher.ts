/**
 * ComicBookRoundup Series Matcher
 *
 * Handles searching and matching series on CBR.
 * Uses URL construction with fallbacks and Google search as last resort.
 */

import * as cheerio from 'cheerio';
import { createServiceLogger } from '../logger.service.js';
import { PUBLISHER_IMPRINTS } from './constants.js';
import { fetchValidPage } from './page-fetcher.js';
import { waitForRateLimit, updateRateLimitState } from './rate-limiter.js';
import {
  toSlug,
  getPublisherSlug,
  buildSeriesUrl,
  parseSourceIdFromUrl,
  getAlternateSlugs,
} from './url-builder.js';
import type { CBRSearchQuery, CBRSeriesMatch } from './types.js';

const logger = createServiceLogger('cbr-matcher');

// =============================================================================
// Google Search Fallback
// =============================================================================

/**
 * Search Google for CBR series pages.
 * Used when URL construction fails to find the series.
 */
async function searchForSeriesViaGoogle(
  query: CBRSearchQuery
): Promise<Array<{ url: string; title: string }>> {
  await waitForRateLimit();

  // Build search query with series name and writer only
  // Publisher and year can be incorrect, so we focus on name + writer for better matches
  const queryParts = [
    'site:comicbookroundup.com/comic-books/reviews',
    `"${query.seriesName}"`,
  ];

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

    // Parse Google search results
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
        let title = $(el).text().trim();

        // Try to get title from parent h3 if link text is empty
        if (!title || title === actualUrl || title.length < 3) {
          const h3 = $(el).closest('div').find('h3').first();
          if (h3.length) {
            title = h3.text().trim();
          }
        }

        // Avoid duplicates
        if (title && !results.some((r) => r.url === actualUrl)) {
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
 * Find the best matching series from Google search results.
 */
function findBestSeriesMatch(
  seriesName: string,
  results: Array<{ url: string; title: string }>
): CBRSeriesMatch | null {
  const normalizedQuery = seriesName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  let bestMatch: CBRSeriesMatch | null = null;

  for (const result of results) {
    const sourceId = parseSourceIdFromUrl(result.url);
    if (!sourceId) continue;

    // Skip issue pages (URLs ending in /number)
    if (/\/\d+$/.test(result.url)) continue;

    // Extract series name from title (format: "Series Name (Year) Comic Series Reviews")
    const titleMatch = result.title.match(
      /^(.+?)\s*(?:\(\d{4}\))?\s*Comic Series Reviews/i
    );
    const matchedName = titleMatch?.[1]?.trim() || result.title;
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
        (matchingWords.length / Math.max(queryWords.length, titleWords.length)) * 0.3;
    }

    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = { sourceId, confidence, matchMethod: 'search', matchedName };
    }
  }

  return bestMatch;
}

// =============================================================================
// Main Search Function
// =============================================================================

/**
 * Search for a series on CBR.
 *
 * Strategy:
 * 1. Try direct URL construction from publisher/series slugs
 * 2. Try alternate slug variations
 * 3. Try publisher imprints
 * 4. Fall back to Google search
 */
export async function searchSeries(
  query: CBRSearchQuery
): Promise<CBRSeriesMatch | null> {
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
  const primaryUrl = buildSeriesUrl(publisherSlug, seriesSlug);

  logger.debug({ url: primaryUrl, seriesName: query.seriesName }, 'Attempting to match series');

  // Strategy 1: Try primary URL
  const primaryHtml = await fetchValidPage(primaryUrl);
  if (primaryHtml) {
    const $ = cheerio.load(primaryHtml);
    const pageTitle = $('h1').first().text().trim().toLowerCase();
    const queryName = query.seriesName.toLowerCase();

    const similarity =
      pageTitle.includes(queryName) || queryName.includes(pageTitle) ? 0.9 : 0.7;

    return {
      sourceId: `${publisherSlug}/${seriesSlug}`,
      confidence: similarity,
      matchMethod: similarity >= 0.9 ? 'exact' : 'fuzzy',
      matchedName: $('h1').first().text().trim(),
    };
  }

  // Strategy 2: Try alternate slug variations
  const alternateSlugs = getAlternateSlugs(query.seriesName);
  for (const altSlug of alternateSlugs) {
    const altUrl = buildSeriesUrl(publisherSlug, altSlug);
    const altHtml = await fetchValidPage(altUrl);
    if (altHtml) {
      return {
        sourceId: `${publisherSlug}/${altSlug}`,
        confidence: 0.7,
        matchMethod: 'fuzzy',
        matchedName: query.seriesName,
      };
    }
  }

  // Strategy 3: Try publisher imprints
  const imprints = PUBLISHER_IMPRINTS[publisherSlug];
  if (imprints) {
    logger.debug({ publisherSlug, imprints }, 'Trying imprint fallbacks');

    for (const imprintSlug of imprints) {
      // Try exact series slug with imprint
      const imprintUrl = buildSeriesUrl(imprintSlug, seriesSlug);
      const imprintHtml = await fetchValidPage(imprintUrl);
      if (imprintHtml) {
        logger.debug({ imprintSlug, seriesSlug }, 'Found series under imprint');
        return {
          sourceId: `${imprintSlug}/${seriesSlug}`,
          confidence: 0.75,
          matchMethod: 'imprint',
          matchedName: query.seriesName,
        };
      }

      // Try alternate slugs with imprint
      for (const altSlug of alternateSlugs) {
        const altImprintUrl = buildSeriesUrl(imprintSlug, altSlug);
        const altImprintHtml = await fetchValidPage(altImprintUrl);
        if (altImprintHtml) {
          logger.debug({ imprintSlug, altSlug }, 'Found series under imprint with alternate slug');
          return {
            sourceId: `${imprintSlug}/${altSlug}`,
            confidence: 0.65,
            matchMethod: 'imprint',
            matchedName: query.seriesName,
          };
        }
      }
    }
  }

  // Strategy 4: Google search fallback
  logger.debug(
    { seriesName: query.seriesName, publisher: query.publisher },
    'URL construction failed, trying web search'
  );

  const searchResults = await searchForSeriesViaGoogle(query);
  if (searchResults.length > 0) {
    const match = findBestSeriesMatch(query.seriesName, searchResults);
    if (match && match.confidence >= 0.6) {
      // Verify the page actually exists
      const verifyUrl = buildSeriesUrl(
        match.sourceId.split('/')[0]!,
        match.sourceId.split('/')[1]!
      );
      const verifyHtml = await fetchValidPage(verifyUrl);

      if (verifyHtml) {
        logger.info(
          { sourceId: match.sourceId, confidence: match.confidence },
          'Found series via web search'
        );
        return match;
      }
    }
  }

  logger.debug({ seriesName: query.seriesName }, 'No match found');
  return null;
}
