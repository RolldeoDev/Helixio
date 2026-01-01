/**
 * ComicBookRoundup URL Builder
 *
 * Utilities for constructing and parsing CBR URLs.
 */

import { BASE_URL, REVIEWS_PATH, PUBLISHER_SLUGS } from './constants.js';

// =============================================================================
// Slug Generation
// =============================================================================

/**
 * Convert a name to a URL slug.
 * @example toSlug("Batman") -> "batman"
 * @example toSlug("The Amazing Spider-Man") -> "the-amazing-spider-man"
 * @example toSlug("Doom's IV") -> "dooms-iv"
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '') // Remove apostrophes
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Get the publisher slug for a publisher name.
 * Uses the known mapping, falls back to slugifying the publisher name.
 */
export function getPublisherSlug(publisher: string): string | null {
  const normalized = publisher.toLowerCase().trim();
  return PUBLISHER_SLUGS[normalized] || toSlug(publisher);
}

// =============================================================================
// URL Construction
// =============================================================================

/**
 * Build the full URL for a series page on CBR.
 * @param publisherSlug - The publisher slug (e.g., "dc-comics")
 * @param seriesSlug - The series slug (e.g., "batman")
 */
export function buildSeriesUrl(
  publisherSlug: string,
  seriesSlug: string
): string {
  return `${BASE_URL}${REVIEWS_PATH}/${publisherSlug}/${seriesSlug}`;
}

/**
 * Build the full URL for an issue page on CBR.
 * @param publisherSlug - The publisher slug (e.g., "dc-comics")
 * @param seriesSlug - The series slug (e.g., "batman")
 * @param issueNumber - The issue number (e.g., "1", "annual-1")
 */
export function buildIssueUrl(
  publisherSlug: string,
  seriesSlug: string,
  issueNumber: string
): string {
  const issueSlug = issueNumber.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return `${BASE_URL}${REVIEWS_PATH}/${publisherSlug}/${seriesSlug}/${issueSlug}`;
}

/**
 * Build the URL from a sourceId.
 * @param sourceId - The source ID (e.g., "dc-comics/batman" or "dc-comics/batman/1")
 */
export function buildUrlFromSourceId(sourceId: string): string {
  return `${BASE_URL}${REVIEWS_PATH}/${sourceId}`;
}

// =============================================================================
// URL Parsing
// =============================================================================

/**
 * Extract sourceId from a full CBR URL.
 * @example "https://comicbookroundup.com/comic-books/reviews/dc-comics/batman" -> "dc-comics/batman"
 * @example "https://comicbookroundup.com/comic-books/reviews/dc-comics/batman/1" -> "dc-comics/batman"
 */
export function parseSourceIdFromUrl(url: string): string | null {
  const match = url.match(
    /comicbookroundup\.com\/comic-books\/reviews\/([^/]+\/[^/]+?)(?:\/\d+)?(?:[?#]|$)/
  );
  return match?.[1] ?? null;
}

/**
 * Extract cache key from a URL (path after base URL).
 */
export function getCacheKeyFromUrl(url: string): string {
  return url.replace(BASE_URL, '');
}

// =============================================================================
// Alternate Slug Generation
// =============================================================================

/**
 * Generate alternate slug variations to try when the primary slug fails.
 * Handles common variations like "The" prefix, year suffix, volume suffix.
 */
export function getAlternateSlugs(seriesName: string): string[] {
  const primarySlug = toSlug(seriesName);
  const alternates = new Set<string>();

  // Remove "The" prefix
  alternates.add(toSlug(seriesName.replace(/^the\s+/i, '')));

  // Add "The" prefix
  alternates.add(toSlug(`the-${seriesName}`));

  // Remove year suffix like "(2024)"
  alternates.add(toSlug(seriesName.replace(/\s*\(\d{4}\)\s*$/, '')));

  // Remove volume suffix like "v1" or "Vol. 2"
  alternates.add(toSlug(seriesName.replace(/\s*v\d+\s*$/i, '')));
  alternates.add(toSlug(seriesName.replace(/\s*vol\.?\s*\d+\s*$/i, '')));

  // Remove primary slug and empty strings
  alternates.delete(primarySlug);
  alternates.delete('');

  return Array.from(alternates);
}
