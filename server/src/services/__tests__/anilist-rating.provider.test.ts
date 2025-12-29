/**
 * AniList Rating Provider Tests
 *
 * Tests for the AniList rating provider:
 * - API availability checking
 * - Series search with existing ID (direct lookup)
 * - Series search by name/year
 * - Rating data extraction and normalization
 * - Caching behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing provider
vi.mock('../anilist.service.js', () => ({
  searchManga: vi.fn(),
  getMangaById: vi.fn(),
  checkApiAvailability: vi.fn(),
  getPreferredTitle: vi.fn((manga) => manga.title.english || manga.title.romaji),
  getAllTitles: vi.fn((manga) => [
    manga.title.english,
    manga.title.romaji,
    manga.title.native,
    ...(manga.synonyms || []),
  ].filter(Boolean)),
  fuzzyDateToYear: vi.fn((date) => date?.year || undefined),
}));

vi.mock('../config.service.js', () => ({
  getExternalRatingsSettings: vi.fn(() => ({
    minMatchConfidence: 0.6,
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
vi.mock('../rating-providers/registry.js', () => ({
  register: vi.fn(),
}));

// Import provider and mocks after setup
const {
  searchManga,
  getMangaById,
  checkApiAvailability,
} = await import('../anilist.service.js');

const { AniListRatingProvider, clearCache } = await import(
  '../rating-providers/anilist.provider.js'
);

// =============================================================================
// Test Data
// =============================================================================

interface MockMangaOverrides {
  id?: number;
  titleEnglish?: string;
  titleRomaji?: string;
  titleNative?: string;
  synonyms?: string[];
  year?: number;
  averageScore?: number | null;
  favourites?: number | null;
}

function createMockManga(overrides: MockMangaOverrides = {}) {
  const averageScore: number | null =
    'averageScore' in overrides
      ? (overrides.averageScore as number | null)
      : 85;
  const favourites: number | null =
    'favourites' in overrides ? (overrides.favourites as number | null) : 50000;

  return {
    id: overrides.id ?? 12345,
    idMal: null,
    title: {
      english: overrides.titleEnglish ?? 'One Piece',
      romaji: overrides.titleRomaji ?? 'One Piece',
      native: overrides.titleNative ?? 'ワンピース',
    },
    synonyms: overrides.synonyms ?? [],
    format: 'MANGA' as const,
    status: 'RELEASING' as const,
    description: 'A manga about pirates',
    startDate:
      overrides.year !== undefined
        ? { year: overrides.year, month: null, day: null }
        : { year: 1997, month: null, day: null },
    endDate: null,
    chapters: null,
    volumes: null,
    countryOfOrigin: 'JP',
    coverImage: {
      extraLarge: 'https://example.com/cover.jpg',
      large: 'https://example.com/cover.jpg',
      medium: 'https://example.com/cover.jpg',
      color: null,
    },
    bannerImage: null,
    genres: ['Action', 'Adventure'],
    averageScore,
    meanScore: 84,
    popularity: 100000,
    favourites,
    tags: [],
    staff: { edges: [] },
    characters: { edges: [] },
    siteUrl: 'https://anilist.co/manga/12345',
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('AniListRatingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  afterEach(() => {
    clearCache();
  });

  describe('provider properties', () => {
    it('should have correct name', () => {
      expect(AniListRatingProvider.name).toBe('anilist');
    });

    it('should have correct display name', () => {
      expect(AniListRatingProvider.displayName).toBe('AniList');
    });

    it('should not support issue ratings', () => {
      expect(AniListRatingProvider.supportsIssueRatings).toBe(false);
    });

    it('should only support community ratings', () => {
      expect(AniListRatingProvider.ratingTypes).toEqual(['community']);
    });
  });

  describe('checkAvailability', () => {
    it('should return available when API is accessible', async () => {
      vi.mocked(checkApiAvailability).mockResolvedValue({
        available: true,
        configured: true,
      });

      const result = await AniListRatingProvider.checkAvailability();

      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return unavailable with error when API fails', async () => {
      vi.mocked(checkApiAvailability).mockResolvedValue({
        available: false,
        configured: true,
        error: 'HTTP 503',
      });

      const result = await AniListRatingProvider.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.error).toBe('HTTP 503');
    });

    it('should handle thrown errors', async () => {
      vi.mocked(checkApiAvailability).mockRejectedValue(
        new Error('Network error')
      );

      const result = await AniListRatingProvider.checkAvailability();

      expect(result.available).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('searchSeries', () => {
    describe('with existing ID', () => {
      it('should do direct lookup when existingId is provided', async () => {
        const mockManga = createMockManga({ id: 99999 });
        vi.mocked(getMangaById).mockResolvedValue(mockManga);

        const result = await AniListRatingProvider.searchSeries({
          seriesName: 'One Piece',
          existingId: '99999',
        });

        expect(getMangaById).toHaveBeenCalledWith(99999);
        expect(searchManga).not.toHaveBeenCalled();
        expect(result).toEqual({
          sourceId: '99999',
          confidence: 1.0,
          matchMethod: 'id',
          matchedName: 'One Piece',
          matchedYear: 1997,
        });
      });

      it('should fall back to search if ID not found', async () => {
        vi.mocked(getMangaById).mockResolvedValue(null);
        vi.mocked(searchManga).mockResolvedValue({
          results: [createMockManga()],
          total: 1,
          page: 1,
          hasMore: false,
        });

        const result = await AniListRatingProvider.searchSeries({
          seriesName: 'One Piece',
          existingId: '99999',
        });

        expect(getMangaById).toHaveBeenCalledWith(99999);
        expect(searchManga).toHaveBeenCalledWith('One Piece', { limit: 10 });
        expect(result).not.toBeNull();
        expect(result?.matchMethod).not.toBe('id');
      });

      it('should ignore invalid ID and search instead', async () => {
        vi.mocked(searchManga).mockResolvedValue({
          results: [createMockManga()],
          total: 1,
          page: 1,
          hasMore: false,
        });

        const result = await AniListRatingProvider.searchSeries({
          seriesName: 'One Piece',
          existingId: 'not-a-number',
        });

        expect(getMangaById).not.toHaveBeenCalled();
        expect(searchManga).toHaveBeenCalled();
        expect(result).not.toBeNull();
      });
    });

    describe('search by name', () => {
      it('should search and match by exact title', async () => {
        const mockManga = createMockManga({
          titleEnglish: 'One Piece',
          year: 1997,
        });
        vi.mocked(searchManga).mockResolvedValue({
          results: [mockManga],
          total: 1,
          page: 1,
          hasMore: false,
        });

        const result = await AniListRatingProvider.searchSeries({
          seriesName: 'One Piece',
          year: 1997,
        });

        expect(result).toEqual({
          sourceId: '12345',
          confidence: 0.95,
          matchMethod: 'name_year',
          matchedName: 'One Piece',
          matchedYear: 1997,
        });
      });

      it('should return null when no results', async () => {
        vi.mocked(searchManga).mockResolvedValue({
          results: [],
          total: 0,
          page: 1,
          hasMore: false,
        });

        const result = await AniListRatingProvider.searchSeries({
          seriesName: 'Nonexistent Manga',
        });

        expect(result).toBeNull();
      });

      it('should pick best match from multiple results', async () => {
        const exactMatch = createMockManga({
          id: 111,
          titleEnglish: 'Attack on Titan',
          year: 2009,
        });
        const partialMatch = createMockManga({
          id: 222,
          titleEnglish: 'Attack on Titan: Before the Fall',
          year: 2013,
        });
        vi.mocked(searchManga).mockResolvedValue({
          results: [partialMatch, exactMatch], // API might return in different order
          total: 2,
          page: 1,
          hasMore: false,
        });

        const result = await AniListRatingProvider.searchSeries({
          seriesName: 'Attack on Titan',
          year: 2009,
        });

        expect(result?.sourceId).toBe('111');
        expect(result?.confidence).toBeGreaterThan(0.9);
      });

      it('should return null when confidence is below minimum', async () => {
        const poorMatch = createMockManga({
          titleEnglish: 'Completely Different Manga',
          year: 2020,
        });
        vi.mocked(searchManga).mockResolvedValue({
          results: [poorMatch],
          total: 1,
          page: 1,
          hasMore: false,
        });

        // Mock config with high minimum confidence
        const { getExternalRatingsSettings } = await import(
          '../config.service.js'
        );
        vi.mocked(getExternalRatingsSettings).mockReturnValue({
          minMatchConfidence: 0.99, // Very high threshold
          ratingTTLDays: 7,
          issueRatingTTLDays: 14,
          enabledSources: ['anilist'],
          syncSchedule: 'manual',
          syncHour: 3,
          scrapingRateLimit: 10,
        });

        const result = await AniListRatingProvider.searchSeries({
          seriesName: 'My Specific Manga',
        });

        expect(result).toBeNull();
      });
    });

    describe('caching behavior', () => {
      it('should cache rating data during ID lookup', async () => {
        const mockManga = createMockManga({
          id: 55555,
          averageScore: 92,
          favourites: 10000,
        });
        vi.mocked(getMangaById).mockResolvedValue(mockManga);

        // Search with existing ID (triggers direct lookup)
        await AniListRatingProvider.searchSeries({
          seriesName: 'One Piece',
          existingId: '55555',
        });

        // Clear the mock call count
        vi.mocked(getMangaById).mockClear();

        // Get ratings should use cache
        const ratings = await AniListRatingProvider.getSeriesRatings('55555');

        // Should not call API again
        expect(getMangaById).not.toHaveBeenCalled();
        expect(ratings).toHaveLength(1);
        expect(ratings[0]!.value).toBeCloseTo(9.2, 1); // 92/10
      });
    });
  });

  describe('getSeriesRatings', () => {
    it('should fetch and normalize rating data', async () => {
      const mockManga = createMockManga({
        id: 12345,
        averageScore: 85,
        favourites: 50000,
      });
      vi.mocked(getMangaById).mockResolvedValue(mockManga);

      const ratings = await AniListRatingProvider.getSeriesRatings('12345');

      expect(ratings).toHaveLength(1);
      expect(ratings[0]).toEqual({
        source: 'anilist',
        sourceId: '12345',
        ratingType: 'community',
        value: 8.5, // 85/100 * 10
        originalValue: 85,
        scale: 100,
        voteCount: 50000,
      });
    });

    it('should return empty array for null averageScore', async () => {
      const mockManga = createMockManga({
        id: 12345,
        averageScore: null,
      });
      vi.mocked(getMangaById).mockResolvedValue(mockManga);

      const ratings = await AniListRatingProvider.getSeriesRatings('12345');

      expect(ratings).toEqual([]);
    });

    it('should return empty array for not found manga', async () => {
      vi.mocked(getMangaById).mockResolvedValue(null);

      const ratings = await AniListRatingProvider.getSeriesRatings('99999');

      expect(ratings).toEqual([]);
    });

    it('should return empty array for invalid source ID', async () => {
      const ratings =
        await AniListRatingProvider.getSeriesRatings('not-a-number');

      expect(getMangaById).not.toHaveBeenCalled();
      expect(ratings).toEqual([]);
    });

    it('should handle undefined favourites gracefully', async () => {
      const mockManga = createMockManga({
        id: 12345,
        averageScore: 75,
        favourites: null,
      });
      vi.mocked(getMangaById).mockResolvedValue(mockManga);

      const ratings = await AniListRatingProvider.getSeriesRatings('12345');

      expect(ratings).toHaveLength(1);
      expect(ratings[0]!.voteCount).toBeUndefined();
    });

    it('should use cache from previous search', async () => {
      const mockManga = createMockManga({
        id: 77777,
        averageScore: 90,
        favourites: 25000,
      });

      // First, do a search with ID lookup
      vi.mocked(getMangaById).mockResolvedValue(mockManga);
      await AniListRatingProvider.searchSeries({
        seriesName: 'Naruto',
        existingId: '77777',
      });

      // Clear the mock call count
      vi.mocked(getMangaById).mockClear();

      // Get ratings - should use cache
      const ratings = await AniListRatingProvider.getSeriesRatings('77777');

      expect(getMangaById).not.toHaveBeenCalled();
      expect(ratings).toHaveLength(1);
      expect(ratings[0]!.value).toBe(9.0); // 90/100 * 10
    });
  });

  describe('rating normalization', () => {
    it('should correctly normalize AniList 0-100 scale to 0-10', async () => {
      const testCases = [
        { score: 100, expected: 10 },
        { score: 85, expected: 8.5 },
        { score: 50, expected: 5 },
        { score: 0, expected: 0 },
      ];

      for (const { score, expected } of testCases) {
        clearCache();
        const mockManga = createMockManga({ averageScore: score });
        vi.mocked(getMangaById).mockResolvedValue(mockManga);

        const ratings = await AniListRatingProvider.getSeriesRatings('12345');

        expect(ratings).toHaveLength(1);
        expect(ratings[0]!.value).toBe(expected);
        expect(ratings[0]!.originalValue).toBe(score);
        expect(ratings[0]!.scale).toBe(100);
      }
    });
  });

  describe('error handling', () => {
    it('should throw on search API error', async () => {
      vi.mocked(searchManga).mockRejectedValue(new Error('API error'));

      await expect(
        AniListRatingProvider.searchSeries({ seriesName: 'Test' })
      ).rejects.toThrow('API error');
    });

    it('should throw on ratings API error', async () => {
      vi.mocked(getMangaById).mockRejectedValue(new Error('API error'));

      await expect(
        AniListRatingProvider.getSeriesRatings('12345')
      ).rejects.toThrow('API error');
    });
  });
});
