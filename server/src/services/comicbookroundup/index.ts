/**
 * ComicBookRoundup Unified Module
 *
 * Single entry point for all CBR scraping operations.
 * Fetches ratings and reviews together from a single page scrape.
 */

import { BASE_URL } from './constants.js';
import { fetchPage, isValidSeriesPage } from './page-fetcher.js';
import { resetRateLimiter } from './rate-limiter.js';
import { parsePage } from './parsers/combined.js';
import { searchSeries } from './series-matcher.js';
import { buildUrlFromSourceId, buildIssueUrl } from './url-builder.js';
import type { CBRPageData, CBRSearchQuery, CBRSeriesMatch } from './types.js';

// =============================================================================
// Re-exports
// =============================================================================

export * from './types.js';
export { resetRateLimiter } from './rate-limiter.js';
export { generateSummary } from './parsers/reviews.js';

// =============================================================================
// High-Level API
// =============================================================================

/**
 * Fetch all data (ratings + reviews) for a series.
 *
 * @param sourceId - The source ID (publisher-slug/series-slug)
 * @param reviewLimit - Maximum reviews per type (default 15)
 * @returns Page data with ratings and reviews, or empty data if fetch failed
 */
export async function fetchSeriesData(
  sourceId: string,
  reviewLimit: number = 15
): Promise<CBRPageData> {
  const url = buildUrlFromSourceId(sourceId);
  const result = await fetchPage(url);

  if (!result.html || !isValidSeriesPage(result.html)) {
    // Return empty data structure
    return {
      criticReviews: [],
      userReviews: [],
      fetchedAt: new Date(),
      sourceUrl: url,
    };
  }

  return parsePage(result.html, url, reviewLimit);
}

/**
 * Fetch all data (ratings + reviews) for an issue.
 *
 * @param seriesSourceId - The series source ID (publisher-slug/series-slug)
 * @param issueNumber - The issue number
 * @param reviewLimit - Maximum reviews per type (default 15)
 * @returns Page data with ratings and reviews, or empty data if fetch failed
 */
export async function fetchIssueData(
  seriesSourceId: string,
  issueNumber: string,
  reviewLimit: number = 15
): Promise<CBRPageData> {
  // Extract publisher and series from sourceId
  const parts = seriesSourceId.split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return {
      criticReviews: [],
      userReviews: [],
      fetchedAt: new Date(),
      sourceUrl: '',
    };
  }

  const publisherSlug = parts[0];
  const seriesSlug = parts[1];

  // Try slugified issue number first
  const issueSlug = issueNumber.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  let url = buildIssueUrl(publisherSlug, seriesSlug, issueSlug);
  let result = await fetchPage(url);

  // If that fails, try with just the number
  if (!result.html || !isValidSeriesPage(result.html)) {
    url = buildIssueUrl(publisherSlug, seriesSlug, issueNumber);
    result = await fetchPage(url);
  }

  if (!result.html || !isValidSeriesPage(result.html)) {
    return {
      criticReviews: [],
      userReviews: [],
      issueNumber,
      fetchedAt: new Date(),
      sourceUrl: url,
    };
  }

  const pageData = parsePage(result.html, url, reviewLimit);
  pageData.issueNumber = issueNumber;
  return pageData;
}

/**
 * Search for a series on CBR.
 * Re-exported from series-matcher for convenience.
 */
export { searchSeries };

/**
 * Check if CBR is available.
 */
export async function checkAvailability(): Promise<{
  available: boolean;
  error?: string;
}> {
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
}
