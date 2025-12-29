/**
 * Rating Sync Service Tests
 *
 * Tests for the core rating sync orchestration:
 * - syncSeriesRatings() with provider matching
 * - getExternalRatings() database retrieval
 * - Cache/expiry behavior
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockPrismaClient,
  createMockSeries,
  createMockExternalRating,
} from './__mocks__/prisma.mock.js';

// Create mock prisma client
const mockPrisma = createMockPrismaClient();

// Mock database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockPrisma),
}));

// Mock config service
vi.mock('../config.service.js', () => ({
  getExternalRatingsSettings: vi.fn(() => ({
    enabledSources: ['comicbookroundup'],
    ratingTTLDays: 7,
  })),
}));

// Mock logger
vi.mock('../logger.service.js', () => ({
  createServiceLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Use vi.hoisted to create mock provider that can be accessed by both mock and tests
const { mockProvider } = vi.hoisted(() => ({
  mockProvider: {
    name: 'comicbookroundup' as const,
    displayName: 'Comic Book Roundup',
    supportsIssueRatings: true,
    ratingTypes: ['community', 'critic'] as ('community' | 'critic')[],
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
    searchSeries: vi.fn(),
    getSeriesRatings: vi.fn(),
  },
}));

vi.mock('../rating-providers/index.js', () => ({
  RatingProviderRegistry: {
    getEnabledByPriority: vi.fn(() => [mockProvider]),
    getAll: vi.fn(() => [mockProvider]),
    getAllSources: vi.fn(() => ['comicbookroundup']),
    get: vi.fn((source: string) => source === 'comicbookroundup' ? mockProvider : undefined),
    checkAllAvailability: vi.fn().mockResolvedValue(
      new Map([['comicbookroundup', { available: true }]])
    ),
  },
  calculateExpirationDate: vi.fn((ttl: number) => new Date(Date.now() + (ttl || 604800000))),
  getSourceDisplayName: vi.fn((source: string) => {
    const names: Record<string, string> = {
      comicbookroundup: 'Comic Book Roundup',
    };
    return names[source] || source;
  }),
  formatRatingDisplay: vi.fn((value: number, scale: number) => `${value}/${scale}`),
  RATING_TTL_MS: 604800000,
}));

// Import service after mocking
const {
  syncSeriesRatings,
  getExternalRatings,
  getIssueExternalRatings,
  deleteSeriesRatings,
  getExpiredRatingsCount,
  getSeriesWithExpiredRatings,
  getSeriesAverageExternalRating,
  getRatingSourcesStatus,
} = await import('../rating-sync.service.js');

// =============================================================================
// Tests
// =============================================================================

describe('Rating Sync Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset all mock functions to clear queued return values
    mockProvider.searchSeries.mockReset();
    mockProvider.getSeriesRatings.mockReset();
    mockPrisma.series.findUnique.mockReset();
    mockPrisma.externalRating.findMany.mockReset();
    mockPrisma.externalRating.findFirst.mockReset();
    mockPrisma.externalRating.findUnique.mockReset();
    mockPrisma.externalRating.upsert.mockReset();
    mockPrisma.externalRating.deleteMany.mockReset();
    mockPrisma.externalRating.count.mockReset();

    // Set default return values after reset
    mockPrisma.externalRating.findMany.mockResolvedValue([]);
    mockPrisma.externalRating.findFirst.mockResolvedValue(null);
    mockPrisma.externalRating.findUnique.mockResolvedValue(null);
    mockPrisma.externalRating.upsert.mockResolvedValue({});
    mockPrisma.externalRating.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.externalRating.count.mockResolvedValue(0);
    mockPrisma.series.findUnique.mockResolvedValue(null);
  });

  // ===========================================================================
  // syncSeriesRatings
  // ===========================================================================

  describe('syncSeriesRatings', () => {
    it('should throw error when series not found', async () => {
      mockPrisma.series.findUnique.mockResolvedValue(null);

      await expect(syncSeriesRatings('nonexistent')).rejects.toThrow(
        'Series not found'
      );
    });

    it('should return early when no providers enabled', async () => {
      const series = createMockSeries({ id: 'series-1', name: 'Batman' });
      mockPrisma.series.findUnique.mockResolvedValue(series);

      // Mock registry to return empty array
      const { RatingProviderRegistry } = await import('../rating-providers/index.js');
      (RatingProviderRegistry.getEnabledByPriority as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce([]);

      const result = await syncSeriesRatings('series-1');

      expect(result.success).toBe(false);
      expect(result.ratings).toEqual([]);
    });

    it('should skip sync when cache is valid', async () => {
      const series = createMockSeries({ id: 'series-1', name: 'Batman' });
      mockPrisma.series.findUnique.mockResolvedValue(series);

      // Return non-expired rating
      const futureDate = new Date(Date.now() + 86400000);
      mockPrisma.externalRating.findMany.mockResolvedValue([
        createMockExternalRating({
          seriesId: 'series-1',
          source: 'comicbookroundup',
          expiresAt: futureDate,
        }),
      ]);

      const result = await syncSeriesRatings('series-1');

      expect(result.success).toBe(true);
      expect(result.ratings).toHaveLength(1);
      // Provider should not have been called
      expect(mockProvider.searchSeries).not.toHaveBeenCalled();
    });

    it('should force refresh when forceRefresh is true', async () => {
      const series = createMockSeries({ id: 'series-1', name: 'Batman', publisher: 'DC Comics' });
      mockPrisma.series.findUnique.mockResolvedValue(series);

      // Even with valid cache
      const futureDate = new Date(Date.now() + 86400000);
      mockPrisma.externalRating.findMany.mockResolvedValue([
        createMockExternalRating({ expiresAt: futureDate }),
      ]);

      // Mock provider to find and return rating
      mockPrisma.externalRating.findFirst.mockResolvedValue(null);
      mockProvider.searchSeries.mockResolvedValue({
        sourceId: 'dc-comics/batman',
        confidence: 0.9,
        matchMethod: 'name_year',
      });
      mockProvider.getSeriesRatings.mockResolvedValue([
        {
          source: 'comicbookroundup',
          sourceId: 'dc-comics/batman',
          ratingType: 'community',
          value: 8.5,
          originalValue: 8.5,
          scale: 10,
          voteCount: 100,
        },
      ]);

      const result = await syncSeriesRatings('series-1', { forceRefresh: true });

      expect(mockProvider.searchSeries).toHaveBeenCalled();
      expect(result.matchedSources).toContain('comicbookroundup');
    });

    it('should search for series and fetch ratings', async () => {
      const series = createMockSeries({ id: 'series-1', name: 'Batman', publisher: 'DC Comics' });
      mockPrisma.series.findUnique.mockResolvedValue(series);
      mockPrisma.externalRating.findMany.mockResolvedValue([]);
      mockPrisma.externalRating.findFirst.mockResolvedValue(null);

      mockProvider.searchSeries.mockResolvedValue({
        sourceId: 'dc-comics/batman',
        confidence: 0.9,
        matchMethod: 'name_year',
      });

      mockProvider.getSeriesRatings.mockResolvedValue([
        {
          source: 'comicbookroundup',
          sourceId: 'dc-comics/batman',
          ratingType: 'critic',
          value: 7.8,
          originalValue: 7.8,
          scale: 10,
          voteCount: 50,
        },
        {
          source: 'comicbookroundup',
          sourceId: 'dc-comics/batman',
          ratingType: 'community',
          value: 8.5,
          originalValue: 8.5,
          scale: 10,
          voteCount: 200,
        },
      ]);

      const result = await syncSeriesRatings('series-1');

      expect(result.success).toBe(true);
      expect(result.ratings).toHaveLength(2);
      expect(result.matchedSources).toContain('comicbookroundup');
      expect(mockPrisma.externalRating.upsert).toHaveBeenCalledTimes(2);
    });

    it('should add to unmatchedSources when no match found', async () => {
      const series = createMockSeries({ id: 'series-1', name: 'Unknown Comic' });
      mockPrisma.series.findUnique.mockResolvedValue(series);
      mockPrisma.externalRating.findMany.mockResolvedValue([]);
      mockPrisma.externalRating.findFirst.mockResolvedValue(null);

      mockProvider.searchSeries.mockResolvedValue(null);

      const result = await syncSeriesRatings('series-1');

      expect(result.success).toBe(false);
      expect(result.unmatchedSources).toContain('comicbookroundup');
    });

    it('should add to unmatchedSources when no ratings returned', async () => {
      const series = createMockSeries({ id: 'series-1', name: 'Batman' });
      mockPrisma.series.findUnique.mockResolvedValue(series);
      mockPrisma.externalRating.findMany.mockResolvedValue([]);
      mockPrisma.externalRating.findFirst.mockResolvedValue(null);

      mockProvider.searchSeries.mockResolvedValue({
        sourceId: 'dc-comics/batman',
        confidence: 0.9,
        matchMethod: 'name_year',
      });
      mockProvider.getSeriesRatings.mockResolvedValue([]);

      const result = await syncSeriesRatings('series-1');

      expect(result.unmatchedSources).toContain('comicbookroundup');
    });

    it('should handle provider errors gracefully', async () => {
      const series = createMockSeries({ id: 'series-1', name: 'Batman' });
      mockPrisma.series.findUnique.mockResolvedValue(series);
      mockPrisma.externalRating.findMany.mockResolvedValue([]);
      mockPrisma.externalRating.findFirst.mockResolvedValue(null);

      mockProvider.searchSeries.mockRejectedValue(new Error('Provider error'));

      const result = await syncSeriesRatings('series-1');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0]!.source).toBe('comicbookroundup');
      expect(result.errors![0]!.error).toBe('Provider error');
    });

    it('should use existing sourceId for re-sync', async () => {
      const series = createMockSeries({ id: 'series-1', name: 'Batman' });
      mockPrisma.series.findUnique.mockResolvedValue(series);
      mockPrisma.externalRating.findMany.mockResolvedValue([]);
      mockPrisma.externalRating.findFirst.mockResolvedValue({
        sourceId: 'dc-comics/batman',
      });

      mockProvider.getSeriesRatings.mockResolvedValue([
        {
          source: 'comicbookroundup',
          sourceId: 'dc-comics/batman',
          ratingType: 'community',
          value: 8.0,
          originalValue: 8.0,
          scale: 10,
        },
      ]);

      await syncSeriesRatings('series-1', { forceRefresh: true });

      // Should NOT have called searchSeries since we have sourceId
      expect(mockProvider.searchSeries).not.toHaveBeenCalled();
      expect(mockProvider.getSeriesRatings).toHaveBeenCalledWith('dc-comics/batman');
    });
  });

  // ===========================================================================
  // getExternalRatings
  // ===========================================================================

  describe('getExternalRatings', () => {
    it('should return formatted ratings from database', async () => {
      const now = new Date();
      const future = new Date(Date.now() + 86400000);

      mockPrisma.externalRating.findMany.mockResolvedValue([
        createMockExternalRating({
          seriesId: 'series-1',
          source: 'comicbookroundup',
          ratingType: 'community',
          ratingValue: 8.5,
          originalValue: 8.5,
          ratingScale: 10,
          voteCount: 100,
          lastSyncedAt: now,
          expiresAt: future,
          confidence: 0.95,
        }),
      ]);

      const ratings = await getExternalRatings('series-1');

      expect(ratings).toHaveLength(1);
      expect(ratings[0]!.source).toBe('comicbookroundup');
      expect(ratings[0]!.value).toBe(8.5);
      expect(ratings[0]!.isStale).toBe(false);
    });

    it('should mark stale ratings correctly', async () => {
      const past = new Date(Date.now() - 86400000);

      mockPrisma.externalRating.findMany.mockResolvedValue([
        createMockExternalRating({
          expiresAt: past,
        }),
      ]);

      const ratings = await getExternalRatings('series-1');

      expect(ratings[0]!.isStale).toBe(true);
    });

    it('should return empty array when no ratings exist', async () => {
      mockPrisma.externalRating.findMany.mockResolvedValue([]);

      const ratings = await getExternalRatings('series-1');

      expect(ratings).toEqual([]);
    });
  });

  // ===========================================================================
  // getIssueExternalRatings
  // ===========================================================================

  describe('getIssueExternalRatings', () => {
    it('should return ratings for a file', async () => {
      mockPrisma.externalRating.findMany.mockResolvedValue([
        createMockExternalRating({
          fileId: 'file-1',
          seriesId: null,
          ratingValue: 9.0,
        }),
      ]);

      const ratings = await getIssueExternalRatings('file-1');

      expect(ratings).toHaveLength(1);
      expect(ratings[0]!.value).toBe(9.0);
    });
  });

  // ===========================================================================
  // deleteSeriesRatings
  // ===========================================================================

  describe('deleteSeriesRatings', () => {
    it('should delete all ratings for a series', async () => {
      await deleteSeriesRatings('series-1');

      expect(mockPrisma.externalRating.deleteMany).toHaveBeenCalledWith({
        where: { seriesId: 'series-1' },
      });
    });
  });

  // ===========================================================================
  // getExpiredRatingsCount
  // ===========================================================================

  describe('getExpiredRatingsCount', () => {
    it('should count expired ratings', async () => {
      mockPrisma.externalRating.count.mockResolvedValue(5);

      const count = await getExpiredRatingsCount();

      expect(count).toBe(5);
      expect(mockPrisma.externalRating.count).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });

  // ===========================================================================
  // getSeriesWithExpiredRatings
  // ===========================================================================

  describe('getSeriesWithExpiredRatings', () => {
    it('should return series IDs with expired ratings', async () => {
      mockPrisma.externalRating.findMany.mockResolvedValue([
        { seriesId: 'series-1' },
        { seriesId: 'series-2' },
      ]);

      const seriesIds = await getSeriesWithExpiredRatings();

      expect(seriesIds).toEqual(['series-1', 'series-2']);
    });

    it('should respect limit parameter', async () => {
      mockPrisma.externalRating.findMany.mockResolvedValue([
        { seriesId: 'series-1' },
      ]);

      await getSeriesWithExpiredRatings(50);

      expect(mockPrisma.externalRating.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      );
    });
  });

  // ===========================================================================
  // getSeriesAverageExternalRating
  // ===========================================================================

  describe('getSeriesAverageExternalRating', () => {
    it('should calculate average across ratings', async () => {
      mockPrisma.externalRating.findMany.mockResolvedValue([
        { ratingValue: 8.0 },
        { ratingValue: 9.0 },
        { ratingValue: 7.0 },
      ]);

      const result = await getSeriesAverageExternalRating('series-1');

      expect(result.average).toBe(8.0);
      expect(result.count).toBe(3);
    });

    it('should filter by rating type when provided', async () => {
      mockPrisma.externalRating.findMany.mockResolvedValue([
        { ratingValue: 7.5 },
      ]);

      await getSeriesAverageExternalRating('series-1', 'critic');

      expect(mockPrisma.externalRating.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { seriesId: 'series-1', ratingType: 'critic' },
        })
      );
    });

    it('should return null average when no ratings exist', async () => {
      mockPrisma.externalRating.findMany.mockResolvedValue([]);

      const result = await getSeriesAverageExternalRating('series-1');

      expect(result.average).toBeNull();
      expect(result.count).toBe(0);
    });
  });

  // ===========================================================================
  // getRatingSourcesStatus
  // ===========================================================================

  describe('getRatingSourcesStatus', () => {
    it('should return status for all providers', async () => {
      const status = await getRatingSourcesStatus();

      expect(status).toHaveLength(1);
      expect(status[0]!.source).toBe('comicbookroundup');
      expect(status[0]!.displayName).toBe('Comic Book Roundup');
      expect(status[0]!.available).toBe(true);
    });
  });
});
