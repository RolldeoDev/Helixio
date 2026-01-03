/**
 * ComicBookRoundup Provider Tests
 *
 * Tests for the ComicBookRoundup rating provider:
 * - URL slug generation
 * - Series search/matching
 * - Rating parsing from HTML
 * - Rate limiting behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing provider
vi.mock('../api-cache.service.js', () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../config.service.js', () => ({
  getExternalRatingsSettings: vi.fn(() => ({
    scrapingRateLimit: 60, // High rate for tests
    ratingTTLDays: 7,
  })),
}));

vi.mock('../logger.service.js', () => ({
  createServiceLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock registry to prevent auto-registration
vi.mock('./registry.js', () => ({
  register: vi.fn(),
}));

// Mock sitemap index to return null by default (so URL construction tests work)
// Individual tests can override this if they want to test sitemap behavior
vi.mock('../comicbookroundup/sitemap-index.js', () => ({
  searchViaSitemapIndex: vi.fn().mockResolvedValue(null),
  getSeriesIndex: vi.fn().mockResolvedValue([]),
  getSitemapIndexStatus: vi.fn().mockResolvedValue({ cached: false, seriesCount: 0 }),
  refreshSitemapIndex: vi.fn().mockResolvedValue({ success: true, seriesCount: 0 }),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import provider after mocks
const { ComicBookRoundupProvider, resetRateLimiter } = await import(
  '../rating-providers/comicbookroundup.provider.js'
);

// =============================================================================
// Test HTML Templates
// =============================================================================

function createMockHtml(options: {
  title?: string;
  criticRating?: number;
  criticCount?: number;
  userRating?: number;
  userCount?: number;
  jsonLd?: boolean;
}): string {
  const {
    title = 'Batman',
    criticRating,
    criticCount = 0,
    userRating,
    userCount = 0,
    jsonLd = false,
  } = options;

  const jsonLdScript = jsonLd && criticRating
    ? `<script type="application/ld+json">
        {
          "@type": "Product",
          "aggregateRating": {
            "ratingValue": "${criticRating}",
            "ratingCount": "${criticCount}"
          }
        }
       </script>`
    : '';

  const criticText = criticRating
    ? `<div>${criticRating} Avg. Critic Rating</div><div>${criticCount} Critic Reviews</div>`
    : '';

  const userText = userRating
    ? `<div>${userRating} Avg. User Rating</div><div>${userCount} User Reviews</div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      ${jsonLdScript}
    </head>
    <body>
      <h1>${title}</h1>
      ${criticText}
      ${userText}
    </body>
    </html>
  `;
}

// =============================================================================
// Tests
// =============================================================================

describe('ComicBookRoundup Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    resetRateLimiter(); // Reset rate limiter state between tests
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Provider Properties
  // ===========================================================================

  describe('Provider Properties', () => {
    it('should have correct name', () => {
      expect(ComicBookRoundupProvider.name).toBe('comicbookroundup');
    });

    it('should have correct display name', () => {
      expect(ComicBookRoundupProvider.displayName).toBe('Comic Book Roundup');
    });

    it('should support issue ratings', () => {
      expect(ComicBookRoundupProvider.supportsIssueRatings).toBe(true);
    });

    it('should support both community and critic ratings', () => {
      expect(ComicBookRoundupProvider.ratingTypes).toContain('community');
      expect(ComicBookRoundupProvider.ratingTypes).toContain('critic');
    });
  });

  // ===========================================================================
  // checkAvailability
  // ===========================================================================

  describe('checkAvailability', () => {
    it('should return available when site responds with 200', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await ComicBookRoundupProvider.checkAvailability();

      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return unavailable when site responds with error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const result = await ComicBookRoundupProvider.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.error).toBe('HTTP 503');
    });

    it('should return unavailable when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await ComicBookRoundupProvider.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  // ===========================================================================
  // searchSeries
  // ===========================================================================

  describe('searchSeries', () => {
    it('should return null when publisher is not provided', async () => {
      const result = await ComicBookRoundupProvider.searchSeries({
        seriesName: 'Batman',
      });

      expect(result).toBeNull();
    });

    it('should construct correct URL for known publisher', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({ title: 'Batman' }),
      });

      await ComicBookRoundupProvider.searchSeries({
        seriesName: 'Batman',
        publisher: 'DC Comics',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/dc-comics/batman'),
        expect.any(Object)
      );
    });

    it('should return match result when page exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({ title: 'Batman' }),
      });

      const result = await ComicBookRoundupProvider.searchSeries({
        seriesName: 'Batman',
        publisher: 'DC Comics',
      });

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('dc-comics/batman');
      expect(result!.confidence).toBeGreaterThan(0.5);
    });

    it('should try alternate slugs when primary URL fails', async () => {
      // First call (primary URL) returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
      // Second call (alternate without "The") succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({ title: 'Amazing Spider-Man' }),
      });

      const result = await ComicBookRoundupProvider.searchSeries({
        seriesName: 'The Amazing Spider-Man',
        publisher: 'Marvel',
      });

      // Should find with fuzzy match
      expect(result).not.toBeNull();
      expect(result!.matchMethod).toBe('fuzzy');
      expect(result!.confidence).toBe(0.7);
    });

    it('should return null when page does not exist', async () => {
      vi.useFakeTimers();

      // Return 404 for all attempts (including imprint fallbacks and search)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const searchPromise = ComicBookRoundupProvider.searchSeries({
        seriesName: 'NonexistentSeries12345',
        publisher: 'DC Comics',
      });

      await vi.runAllTimersAsync();
      const result = await searchPromise;

      expect(result).toBeNull();
      vi.useRealTimers();
    }, 60000); // Increased timeout: now tries imprints (8 for DC) with 6 slug variants each + search

    it('should find series under publisher imprint (e.g., DC -> Vertigo)', async () => {
      // Use fake timers to speed up rate limiting
      vi.useFakeTimers();

      // Mock homepage response (soft redirect instead of 404)
      const homepageHtml = '<html><body><h1>New Comics - Compare What The Critics Say</h1></body></html>';

      // dc-comics/american-vampire and the-american-vampire return homepage (soft redirect)
      // vertigo/american-vampire returns the actual series page
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () => homepageHtml,
        }) // dc-comics/american-vampire -> homepage
        .mockResolvedValueOnce({
          ok: true,
          text: async () => homepageHtml,
        }) // dc-comics/the-american-vampire -> homepage
        .mockResolvedValueOnce({
          ok: true,
          text: async () => createMockHtml({ title: 'American Vampire' }),
        }); // vertigo/american-vampire succeeds!

      const searchPromise = ComicBookRoundupProvider.searchSeries({
        seriesName: 'American Vampire',
        publisher: 'DC Comics',
      });

      // Advance timers to bypass rate limiting
      await vi.runAllTimersAsync();

      const result = await searchPromise;

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('vertigo/american-vampire');
      expect(result!.confidence).toBe(0.75); // Imprint fallback confidence

      vi.useRealTimers();
    }, 30000);

    it('should handle series name slug conversion correctly', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({ title: 'Batman: The Dark Knight' }),
      });

      const searchPromise = ComicBookRoundupProvider.searchSeries({
        seriesName: "Batman: The Dark Knight",
        publisher: 'DC Comics',
      });

      await vi.runAllTimersAsync();
      await searchPromise;

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/dc-comics/batman-the-dark-knight'),
        expect.any(Object)
      );

      vi.useRealTimers();
    });
  });

  // ===========================================================================
  // getSeriesRatings
  // ===========================================================================

  describe('getSeriesRatings', () => {
    it('should parse critic rating from page text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({
          criticRating: 7.8,
          criticCount: 45,
        }),
      });

      const ratings = await ComicBookRoundupProvider.getSeriesRatings('dc-comics/batman');

      expect(ratings).toHaveLength(1);
      expect(ratings[0]!.ratingType).toBe('critic');
      expect(ratings[0]!.value).toBe(7.8);
      expect(ratings[0]!.originalValue).toBe(7.8);
      expect(ratings[0]!.scale).toBe(10);
      expect(ratings[0]!.voteCount).toBe(45);
    });

    it('should parse user rating from page text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({
          userRating: 8.5,
          userCount: 120,
        }),
      });

      const ratings = await ComicBookRoundupProvider.getSeriesRatings('dc-comics/batman');

      expect(ratings).toHaveLength(1);
      expect(ratings[0]!.ratingType).toBe('community');
      expect(ratings[0]!.value).toBe(8.5);
      expect(ratings[0]!.voteCount).toBe(120);
    });

    it('should parse both ratings when present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({
          criticRating: 7.2,
          criticCount: 30,
          userRating: 8.0,
          userCount: 200,
        }),
      });

      const ratings = await ComicBookRoundupProvider.getSeriesRatings('dc-comics/batman');

      expect(ratings).toHaveLength(2);
      expect(ratings.find((r) => r.ratingType === 'critic')).toBeDefined();
      expect(ratings.find((r) => r.ratingType === 'community')).toBeDefined();
    });

    it('should parse ratings from JSON-LD when available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({
          criticRating: 8.5,
          criticCount: 50,
          jsonLd: true,
        }),
      });

      const ratings = await ComicBookRoundupProvider.getSeriesRatings('dc-comics/batman');

      expect(ratings).toHaveLength(1);
      expect(ratings[0]!.value).toBe(8.5);
      expect(ratings[0]!.voteCount).toBe(50);
    });

    it('should return empty array when page not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const ratings = await ComicBookRoundupProvider.getSeriesRatings('dc-comics/nonexistent');

      expect(ratings).toEqual([]);
    });

    it('should return empty array when no ratings found on page', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><body><h1>Batman</h1></body></html>',
      });

      const ratings = await ComicBookRoundupProvider.getSeriesRatings('dc-comics/batman');

      expect(ratings).toEqual([]);
    });

    it('should skip zero ratings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({
          criticRating: 0,
          userRating: 8.0,
          userCount: 50,
        }),
      });

      const ratings = await ComicBookRoundupProvider.getSeriesRatings('dc-comics/batman');

      expect(ratings).toHaveLength(1);
      expect(ratings[0]!.ratingType).toBe('community');
    });

    it('should include source in rating data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({
          userRating: 7.5,
        }),
      });

      const ratings = await ComicBookRoundupProvider.getSeriesRatings('dc-comics/batman');

      expect(ratings[0]!.source).toBe('comicbookroundup');
      expect(ratings[0]!.sourceId).toBe('dc-comics/batman');
    });
  });

  // ===========================================================================
  // getIssueRatings
  // ===========================================================================

  describe('getIssueRatings', () => {
    it('should fetch issue-specific page', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({
          title: 'Batman #1',
          criticRating: 9.0,
          criticCount: 10,
        }),
      });

      const ratings = await ComicBookRoundupProvider.getIssueRatings!('dc-comics/batman', '1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/dc-comics/batman/1'),
        expect.any(Object)
      );
      expect(ratings).toHaveLength(1);
    });

    it('should try alternate URL format if primary fails', async () => {
      // Primary URL fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
      // Alternate URL succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHtml({
          criticRating: 8.5,
        }),
      });

      const ratings = await ComicBookRoundupProvider.getIssueRatings!('dc-comics/batman', '1');

      expect(ratings).toHaveLength(1);
    });

    it('should return empty array when issue not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const ratings = await ComicBookRoundupProvider.getIssueRatings!('dc-comics/batman', '999');

      expect(ratings).toEqual([]);
    });
  });

  // ===========================================================================
  // URL Slug Generation (via searchSeries)
  // ===========================================================================

  describe('URL Slug Generation', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => createMockHtml({ title: 'Test' }),
      });
    });

    it('should convert Marvel Comics to marvel-comics', async () => {
      await ComicBookRoundupProvider.searchSeries({
        seriesName: 'X-Men',
        publisher: 'Marvel Comics',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/marvel-comics/x-men'),
        expect.any(Object)
      );
    });

    it('should convert Image Comics to image-comics', async () => {
      await ComicBookRoundupProvider.searchSeries({
        seriesName: 'Saga',
        publisher: 'Image Comics',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/image-comics/saga'),
        expect.any(Object)
      );
    });

    it('should handle BOOM! Studios correctly', async () => {
      await ComicBookRoundupProvider.searchSeries({
        seriesName: 'Power Rangers',
        publisher: 'BOOM! Studios',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/boom-studios/power-rangers'),
        expect.any(Object)
      );
    });

    it('should generate slug for unknown publishers', async () => {
      await ComicBookRoundupProvider.searchSeries({
        seriesName: 'Test Comic',
        publisher: 'Unknown Publisher',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/unknown-publisher/test-comic'),
        expect.any(Object)
      );
    });

    it('should handle series names with special characters', async () => {
      await ComicBookRoundupProvider.searchSeries({
        seriesName: "Batman: Gargoyle of Gotham",
        publisher: 'DC Comics',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/dc-comics/batman-gargoyle-of-gotham'),
        expect.any(Object)
      );
    });

    it('should handle series names with apostrophes', async () => {
      await ComicBookRoundupProvider.searchSeries({
        seriesName: "Harley Quinn's Little Black Book",
        publisher: 'DC Comics',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/dc-comics/harley-quinns-little-black-book'),
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // Sitemap Index Fallback
  // ===========================================================================

  // Note: Sitemap index fallback tests are now in sitemap-index.test.ts
  // The old Google search tests have been removed since that functionality
  // has been replaced by sitemap-based searching.
});
