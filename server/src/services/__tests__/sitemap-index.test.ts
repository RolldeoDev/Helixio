/**
 * Sitemap Index Tests
 *
 * Tests for the CBR sitemap index module:
 * - XML parsing from sitemaps
 * - URL extraction and series parsing
 * - Search algorithm and confidence scoring
 * - Cache integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing module
vi.mock('../api-cache.service.js', () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../logger.service.js', () => ({
  createServiceLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock rate limiter
vi.mock('../comicbookroundup/rate-limiter.js', () => ({
  waitForRateLimit: vi.fn().mockResolvedValue(undefined),
  updateRateLimitState: vi.fn(),
}));

// Import after mocks are set up
const {
  parseSitemapUrls,
  extractSeriesFromUrls,
  searchSeriesIndex,
} = await import('../comicbookroundup/sitemap-index.js');

// =============================================================================
// Test Data
// =============================================================================

const SAMPLE_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://comicbookroundup.com/comic-books/reviews/dc-comics/batman</loc>
    <lastmod>2024-01-15</lastmod>
  </url>
  <url>
    <loc>https://comicbookroundup.com/comic-books/reviews/dc-comics/batman/1</loc>
    <lastmod>2024-01-14</lastmod>
  </url>
  <url>
    <loc>https://comicbookroundup.com/comic-books/reviews/dc-comics/batman/2</loc>
    <lastmod>2024-01-13</lastmod>
  </url>
  <url>
    <loc>https://comicbookroundup.com/comic-books/reviews/marvel-comics/x-men</loc>
    <lastmod>2024-01-12</lastmod>
  </url>
  <url>
    <loc>https://comicbookroundup.com/comic-books/reviews/dark-horse-comics/helen-of-wyndhorn-(2024)</loc>
    <lastmod>2024-01-11</lastmod>
  </url>
  <url>
    <loc>https://comicbookroundup.com/comic-books/reviews/image-comics/saga</loc>
    <lastmod>2024-01-10</lastmod>
  </url>
  <url>
    <loc>https://comicbookroundup.com/some-other-page</loc>
    <lastmod>2024-01-09</lastmod>
  </url>
</urlset>`;

const SAMPLE_URLS = [
  'https://comicbookroundup.com/comic-books/reviews/dc-comics/batman',
  'https://comicbookroundup.com/comic-books/reviews/dc-comics/batman/1',
  'https://comicbookroundup.com/comic-books/reviews/dc-comics/batman/2',
  'https://comicbookroundup.com/comic-books/reviews/marvel-comics/x-men',
  'https://comicbookroundup.com/comic-books/reviews/dark-horse-comics/helen-of-wyndhorn-(2024)',
  'https://comicbookroundup.com/comic-books/reviews/image-comics/saga',
  'https://comicbookroundup.com/some-other-page',
];

// =============================================================================
// Tests
// =============================================================================

describe('Sitemap Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // parseSitemapUrls
  // ===========================================================================

  describe('parseSitemapUrls', () => {
    it('should extract all URLs from sitemap XML', () => {
      const urls = parseSitemapUrls(SAMPLE_SITEMAP_XML);

      expect(urls).toHaveLength(7);
      expect(urls).toContain('https://comicbookroundup.com/comic-books/reviews/dc-comics/batman');
      expect(urls).toContain('https://comicbookroundup.com/comic-books/reviews/dc-comics/batman/1');
      expect(urls).toContain('https://comicbookroundup.com/some-other-page');
    });

    it('should handle empty sitemap', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        </urlset>`;

      const urls = parseSitemapUrls(xml);

      expect(urls).toHaveLength(0);
    });

    it('should handle malformed XML gracefully', () => {
      const urls = parseSitemapUrls('not valid xml');

      expect(urls).toHaveLength(0);
    });

    it('should trim whitespace from URLs', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>  https://comicbookroundup.com/test  </loc>
          </url>
        </urlset>`;

      const urls = parseSitemapUrls(xml);

      expect(urls[0]).toBe('https://comicbookroundup.com/test');
    });
  });

  // ===========================================================================
  // extractSeriesFromUrls
  // ===========================================================================

  describe('extractSeriesFromUrls', () => {
    it('should extract unique series from URLs', () => {
      const series = extractSeriesFromUrls(SAMPLE_URLS);

      // Should extract 4 unique series (Batman, X-Men, Helen of Wyndhorn, Saga)
      // Batman issues should be deduplicated
      expect(series).toHaveLength(4);
    });

    it('should correctly parse publisher and series slug', () => {
      const series = extractSeriesFromUrls([
        'https://comicbookroundup.com/comic-books/reviews/dc-comics/batman',
      ]);

      expect(series[0]).toEqual({
        sourceId: 'dc-comics/batman',
        publisher: 'dc-comics',
        seriesSlug: 'batman',
        seriesName: 'Batman',
      });
    });

    it('should handle series with year in parentheses', () => {
      const series = extractSeriesFromUrls([
        'https://comicbookroundup.com/comic-books/reviews/dark-horse-comics/helen-of-wyndhorn-(2024)',
      ]);

      expect(series[0]).toEqual({
        sourceId: 'dark-horse-comics/helen-of-wyndhorn-(2024)',
        publisher: 'dark-horse-comics',
        seriesSlug: 'helen-of-wyndhorn-(2024)',
        seriesName: 'Helen Of Wyndhorn (2024)', // Every word capitalized
      });
    });

    it('should convert slug to proper name with capitalization', () => {
      const series = extractSeriesFromUrls([
        'https://comicbookroundup.com/comic-books/reviews/image-comics/the-walking-dead',
      ]);

      expect(series[0]!.seriesName).toBe('The Walking Dead');
    });

    it('should skip non-review URLs', () => {
      const series = extractSeriesFromUrls([
        'https://comicbookroundup.com/some-other-page',
        'https://comicbookroundup.com/about',
      ]);

      expect(series).toHaveLength(0);
    });

    it('should deduplicate series from issue URLs', () => {
      const series = extractSeriesFromUrls([
        'https://comicbookroundup.com/comic-books/reviews/dc-comics/batman',
        'https://comicbookroundup.com/comic-books/reviews/dc-comics/batman/1',
        'https://comicbookroundup.com/comic-books/reviews/dc-comics/batman/2',
        'https://comicbookroundup.com/comic-books/reviews/dc-comics/batman/3',
      ]);

      expect(series).toHaveLength(1);
      expect(series[0]!.sourceId).toBe('dc-comics/batman');
    });

    it('should handle empty URL array', () => {
      const series = extractSeriesFromUrls([]);

      expect(series).toHaveLength(0);
    });
  });

  // ===========================================================================
  // searchSeriesIndex
  // ===========================================================================

  describe('searchSeriesIndex', () => {
    const testIndex = [
      {
        sourceId: 'dc-comics/batman',
        publisher: 'dc-comics',
        seriesSlug: 'batman',
        seriesName: 'Batman',
      },
      {
        sourceId: 'marvel-comics/x-men',
        publisher: 'marvel-comics',
        seriesSlug: 'x-men',
        seriesName: 'X Men',
      },
      {
        sourceId: 'dark-horse-comics/helen-of-wyndhorn-(2024)',
        publisher: 'dark-horse-comics',
        seriesSlug: 'helen-of-wyndhorn-(2024)',
        seriesName: 'Helen of Wyndhorn (2024)',
      },
      {
        sourceId: 'image-comics/saga',
        publisher: 'image-comics',
        seriesSlug: 'saga',
        seriesName: 'Saga',
      },
      {
        sourceId: 'dc-comics/batman-the-dark-knight',
        publisher: 'dc-comics',
        seriesSlug: 'batman-the-dark-knight',
        seriesName: 'Batman The Dark Knight',
      },
    ];

    it('should find exact match with high confidence', () => {
      const result = searchSeriesIndex(
        { seriesName: 'Batman' },
        testIndex
      );

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('dc-comics/batman');
      // Name score: 1.0 * 0.95 = 0.95 (no publisher provided, so no bonus)
      expect(result!.confidence).toBe(0.95);
      expect(result!.matchMethod).toBe('sitemap');
    });

    it('should find substring match', () => {
      const result = searchSeriesIndex(
        { seriesName: 'Helen of Wyndhorn' },
        testIndex
      );

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('dark-horse-comics/helen-of-wyndhorn-(2024)');
      // Name score: 0.85 * 0.95 = 0.8075 (no publisher provided, so no bonus)
      expect(result!.confidence).toBeCloseTo(0.8075, 4);
    });

    it('should find series even with publisher mismatch (weighted scoring)', () => {
      const result = searchSeriesIndex(
        { seriesName: 'Batman', publisher: 'Marvel' },
        testIndex
      );

      // With weighted scoring, we still find Batman but without publisher bonus
      // Name score: 1.0 * 0.95 = 0.95, publisher bonus: 0 * 0.05 = 0
      // Total: 0.95 (above 0.6 threshold)
      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('dc-comics/batman');
      expect(result!.confidence).toBe(0.95); // No publisher bonus
    });

    it('should give higher confidence when publisher matches', () => {
      const result = searchSeriesIndex(
        { seriesName: 'Batman', publisher: 'DC Comics' },
        testIndex
      );

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('dc-comics/batman');
      // Name score: 1.0 * 0.95 = 0.95, publisher bonus: 1.0 * 0.05 = 0.05
      // Total: 1.0
      expect(result!.confidence).toBe(1.0);
    });

    it('should handle word overlap scoring', () => {
      const result = searchSeriesIndex(
        { seriesName: 'Dark Knight' },
        testIndex
      );

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('dc-comics/batman-the-dark-knight');
      // "Dark Knight" is a substring of "Batman The Dark Knight"
      // Name score: 0.85 * 0.95 = 0.8075 (no publisher provided, so no bonus)
      expect(result!.confidence).toBeCloseTo(0.8075, 4);
    });

    it('should return null for no matches', () => {
      const result = searchSeriesIndex(
        { seriesName: 'Completely Nonexistent Series 12345' },
        testIndex
      );

      expect(result).toBeNull();
    });

    it('should return null for low confidence matches', () => {
      const result = searchSeriesIndex(
        { seriesName: 'Random' },
        testIndex
      );

      expect(result).toBeNull();
    });

    it('should return null for empty query', () => {
      const result = searchSeriesIndex(
        { seriesName: '' },
        testIndex
      );

      expect(result).toBeNull();
    });

    it('should return null for empty index', () => {
      const result = searchSeriesIndex(
        { seriesName: 'Batman' },
        []
      );

      expect(result).toBeNull();
    });

    it('should handle case-insensitive matching', () => {
      const result = searchSeriesIndex(
        { seriesName: 'BATMAN' },
        testIndex
      );

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('dc-comics/batman');
    });

    it('should handle special characters in query', () => {
      const result = searchSeriesIndex(
        { seriesName: 'X-Men' },
        testIndex
      );

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('marvel-comics/x-men');
    });

    it('should include matched name in result', () => {
      const result = searchSeriesIndex(
        { seriesName: 'Saga' },
        testIndex
      );

      expect(result).not.toBeNull();
      expect(result!.matchedName).toBe('Saga');
    });

    it('should prefer exact match over substring match', () => {
      const indexWithOverlap = [
        {
          sourceId: 'dc-comics/batman',
          publisher: 'dc-comics',
          seriesSlug: 'batman',
          seriesName: 'Batman',
        },
        {
          sourceId: 'dc-comics/batman-adventures',
          publisher: 'dc-comics',
          seriesSlug: 'batman-adventures',
          seriesName: 'Batman Adventures',
        },
      ];

      const result = searchSeriesIndex(
        { seriesName: 'Batman' },
        indexWithOverlap
      );

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('dc-comics/batman');
      // Name score: 1.0 * 0.95 = 0.95 (no publisher provided, so no bonus)
      expect(result!.confidence).toBe(0.95);
    });

    it('should match DC imprint (Vertigo) when searching with DC publisher', () => {
      const indexWithImprint = [
        {
          sourceId: 'vertigo/fables-the-wolf-among-us',
          publisher: 'vertigo',
          seriesSlug: 'fables-the-wolf-among-us',
          seriesName: 'Fables The Wolf Among Us',
        },
        {
          sourceId: 'dc-comics/injustice-gods-among-us',
          publisher: 'dc-comics',
          seriesSlug: 'injustice-gods-among-us',
          seriesName: 'Injustice Gods Among Us',
        },
      ];

      const result = searchSeriesIndex(
        { seriesName: 'Fables: The Wolf Among Us', publisher: 'DC Comics' },
        indexWithImprint
      );

      expect(result).not.toBeNull();
      // Should match Vertigo version due to exact name match (0.95 * 0.95 + 0.8 * 0.05 = 0.9425)
      // NOT the DC version which only has word overlap "among us" (2/5 words = 0.4 * 0.95 + 1.0 * 0.05 = 0.43)
      expect(result!.sourceId).toBe('vertigo/fables-the-wolf-among-us');
      // Name: exact match (1.0) * 0.95 = 0.95, Imprint bonus: 0.8 * 0.05 = 0.04
      expect(result!.confidence).toBeCloseTo(0.99, 2);
    });

    it('should use publisher as tie-breaker for equally named series', () => {
      const indexWithSameName = [
        {
          sourceId: 'marvel-comics/spider-man',
          publisher: 'marvel-comics',
          seriesSlug: 'spider-man',
          seriesName: 'Spider Man',
        },
        {
          sourceId: 'dc-comics/spider-man',
          publisher: 'dc-comics',
          seriesSlug: 'spider-man',
          seriesName: 'Spider Man',
        },
      ];

      // With Marvel publisher, should prefer Marvel version
      const result = searchSeriesIndex(
        { seriesName: 'Spider-Man', publisher: 'Marvel' },
        indexWithSameName
      );

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('marvel-comics/spider-man');
      // Name: 1.0 * 0.95 = 0.95, Publisher: 1.0 * 0.05 = 0.05
      expect(result!.confidence).toBe(1.0);
    });

    it('should prioritize name match over publisher match', () => {
      const indexWithMixedScores = [
        {
          sourceId: 'dc-comics/batman-adventures',
          publisher: 'dc-comics',
          seriesSlug: 'batman-adventures',
          seriesName: 'Batman Adventures',
        },
        {
          sourceId: 'marvel-comics/batman',
          publisher: 'marvel-comics',
          seriesSlug: 'batman',
          seriesName: 'Batman',
        },
      ];

      // Even with DC publisher, exact match "Batman" should beat substring "Batman Adventures"
      const result = searchSeriesIndex(
        { seriesName: 'Batman', publisher: 'DC Comics' },
        indexWithMixedScores
      );

      expect(result).not.toBeNull();
      // Exact name match (1.0 * 0.95 = 0.95) beats substring (0.85 * 0.95 = 0.8075 + 0.05 = 0.8575)
      expect(result!.sourceId).toBe('marvel-comics/batman');
      expect(result!.confidence).toBe(0.95);
    });
  });
});
