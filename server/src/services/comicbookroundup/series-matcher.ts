/**
 * ComicBookRoundup Series Matcher
 *
 * Handles searching and matching series on CBR.
 * Uses URL construction with fallbacks and sitemap index as last resort.
 */

import * as cheerio from 'cheerio';
import { createServiceLogger } from '../logger.service.js';
import { PUBLISHER_IMPRINTS } from './constants.js';
import { fetchValidPage } from './page-fetcher.js';
import { searchViaSitemapIndex } from './sitemap-index.js';
import {
  toSlug,
  getPublisherSlug,
  buildSeriesUrl,
  getAlternateSlugs,
} from './url-builder.js';
import type { CBRSearchQuery, CBRSeriesMatch } from './types.js';

const logger = createServiceLogger('cbr-matcher');

// =============================================================================
// Main Search Function
// =============================================================================

/**
 * Search for a series on CBR.
 *
 * Strategy (optimized for speed):
 * 1. Search sitemap index first (local, instant) - avoids unnecessary HTTP requests
 * 2. If sitemap match found, verify page exists with one HTTP request
 * 3. If no sitemap match, fall back to URL construction strategies
 */
export async function searchSeries(
  query: CBRSearchQuery
): Promise<CBRSeriesMatch | null> {
  // ==========================================================================
  // Strategy 1: Sitemap index search (fastest - no HTTP requests)
  // ==========================================================================
  logger.debug(
    { seriesName: query.seriesName, publisher: query.publisher },
    'Searching sitemap index first'
  );

  const sitemapMatch = await searchViaSitemapIndex(query);
  if (sitemapMatch && sitemapMatch.confidence >= 0.6) {
    // Validate sourceId format before using
    const parts = sitemapMatch.sourceId.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      // Verify the page actually exists with a single HTTP request
      const verifyUrl = buildSeriesUrl(parts[0], parts[1]);
      const verifyHtml = await fetchValidPage(verifyUrl);

      if (verifyHtml) {
        logger.info(
          { sourceId: sitemapMatch.sourceId, confidence: sitemapMatch.confidence },
          'Found series via sitemap index'
        );
        return sitemapMatch;
      } else {
        logger.debug(
          { sourceId: sitemapMatch.sourceId },
          'Sitemap match failed verification, trying URL construction'
        );
      }
    } else {
      logger.warn({ sourceId: sitemapMatch.sourceId }, 'Invalid sourceId format from sitemap');
    }
  }

  // ==========================================================================
  // Strategy 2-4: URL construction fallbacks (only if sitemap didn't find it)
  // ==========================================================================
  const publisherSlug = query.publisher ? getPublisherSlug(query.publisher) : null;
  const seriesSlug = toSlug(query.seriesName);

  if (!publisherSlug) {
    logger.debug(
      { seriesName: query.seriesName },
      'No publisher provided, cannot try URL construction'
    );
    return null;
  }

  const primaryUrl = buildSeriesUrl(publisherSlug, seriesSlug);
  logger.debug({ url: primaryUrl, seriesName: query.seriesName }, 'Trying URL construction');

  // Strategy 2: Try primary URL
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

  // Strategy 3: Try alternate slug variations
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

  // Strategy 4: Try publisher imprints
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

  logger.debug({ seriesName: query.seriesName }, 'No match found');
  return null;
}
