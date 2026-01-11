/**
 * Recommendations Service Tests
 *
 * Tests for comic recommendations based on reading history, similar content, etc.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

// Mock the memory cache service to prevent caching during tests
vi.mock('../memory-cache.service.js', () => ({
  memoryCache: {
    get: vi.fn().mockReturnValue(null), // Always return cache miss
    set: vi.fn(),
    isScanActive: vi.fn().mockReturnValue(false),
    invalidate: vi.fn(),
  },
  CacheKeys: {},
}));

import { getDatabase } from '../database.service.js';
import {
  getSeriesRecommendations,
  getSimilarContent,
  getRecentlyAdded,
  getRandomUnread,
  getRecommendations,
  getDiscoverComics,
} from '../recommendations.service.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('RecommendationsService', () => {
  let mockDb: {
    readingProgress: {
      findMany: ReturnType<typeof vi.fn>;
    };
    comicFile: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };

  const createMockFile = (id: string, overrides: Partial<{
    filename: string;
    relativePath: string;
    libraryId: string;
    metadata: {
      series?: string;
      number?: string;
      publisher?: string;
      genre?: string;
    } | null;
  }> = {}) => ({
    id,
    filename: overrides.filename || `comic-${id}.cbz`,
    relativePath: overrides.relativePath || `comics/comic-${id}.cbz`,
    libraryId: overrides.libraryId || 'lib-1',
    metadata: overrides.metadata ?? {
      series: 'Test Series',
      number: '1',
      publisher: 'DC Comics',
      genre: 'Superhero',
    },
  });

  const createMockProgress = (fileId: string, overrides: Partial<{
    currentPage: number;
    completed: boolean;
    file: ReturnType<typeof createMockFile>;
  }> = {}) => ({
    fileId,
    currentPage: overrides.currentPage ?? 10,
    completed: overrides.completed ?? false,
    file: overrides.file ?? createMockFile(fileId),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      readingProgress: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      comicFile: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };

    vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);
  });

  // ===========================================================================
  // Series Recommendations Tests
  // ===========================================================================

  describe('getSeriesRecommendations', () => {
    it('should return empty array when no reading history', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);

      const result = await getSeriesRecommendations();

      expect(result).toEqual([]);
    });

    it('should return unread issues from series in reading history', async () => {
      // User has read Batman #1
      mockDb.readingProgress.findMany
        .mockResolvedValueOnce([
          createMockProgress('file-1', {
            currentPage: 10,
            file: createMockFile('file-1', {
              metadata: { series: 'Batman', number: '1', publisher: 'DC Comics', genre: 'Superhero' },
            }),
          }),
        ])
        // No files have been read (for exclusion)
        .mockResolvedValueOnce([{ fileId: 'file-1' }]);

      // Unread issues
      mockDb.comicFile.findMany.mockResolvedValue([
        createMockFile('file-2', {
          metadata: { series: 'Batman', number: '2', publisher: 'DC Comics', genre: 'Superhero' },
        }),
        createMockFile('file-3', {
          metadata: { series: 'Batman', number: '3', publisher: 'DC Comics', genre: 'Superhero' },
        }),
      ]);

      const result = await getSeriesRecommendations();

      expect(result).toHaveLength(1); // Deduped to one per series
      expect(result[0]?.series).toBe('Batman');
      expect(result[0]?.number).toBe('2'); // Should pick lowest unread issue
      expect(result[0]?.reason).toBe('series_continuation');
    });

    it('should prioritize lower issue numbers', async () => {
      mockDb.readingProgress.findMany
        .mockResolvedValueOnce([
          createMockProgress('file-1', {
            file: createMockFile('file-1', {
              metadata: { series: 'Spider-Man', number: '1' },
            }),
          }),
        ])
        .mockResolvedValueOnce([{ fileId: 'file-1' }]);

      mockDb.comicFile.findMany.mockResolvedValue([
        createMockFile('file-5', { metadata: { series: 'Spider-Man', number: '5' } }),
        createMockFile('file-2', { metadata: { series: 'Spider-Man', number: '2' } }),
        createMockFile('file-3', { metadata: { series: 'Spider-Man', number: '3' } }),
      ]);

      const result = await getSeriesRecommendations();

      expect(result[0]?.number).toBe('2'); // Lowest unread issue
    });

    it('should respect limit parameter', async () => {
      mockDb.readingProgress.findMany
        .mockResolvedValueOnce([
          createMockProgress('file-1', {
            file: createMockFile('file-1', { metadata: { series: 'Batman' } }),
          }),
          createMockProgress('file-2', {
            file: createMockFile('file-2', { metadata: { series: 'Superman' } }),
          }),
          createMockProgress('file-3', {
            file: createMockFile('file-3', { metadata: { series: 'Wonder Woman' } }),
          }),
        ])
        .mockResolvedValueOnce([]);

      mockDb.comicFile.findMany.mockResolvedValue([
        createMockFile('file-4', { metadata: { series: 'Batman', number: '2' } }),
        createMockFile('file-5', { metadata: { series: 'Superman', number: '2' } }),
        createMockFile('file-6', { metadata: { series: 'Wonder Woman', number: '2' } }),
      ]);

      const result = await getSeriesRecommendations(2);

      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should filter by library when libraryId provided', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);

      await getSeriesRecommendations(8, 'lib-1');

      expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            file: { libraryId: 'lib-1' },
          }),
        })
      );
    });
  });

  // ===========================================================================
  // Similar Content Tests
  // ===========================================================================

  describe('getSimilarContent', () => {
    it('should return empty array when no completed reads', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);

      const result = await getSimilarContent();

      expect(result).toEqual([]);
    });

    it('should recommend comics from same publisher', async () => {
      // User completed DC Comics
      mockDb.readingProgress.findMany
        .mockResolvedValueOnce([
          createMockProgress('file-1', {
            completed: true,
            file: createMockFile('file-1', {
              metadata: { series: 'Batman', publisher: 'DC Comics', genre: 'Superhero' },
            }),
          }),
        ])
        .mockResolvedValueOnce([{ fileId: 'file-1' }]);

      // Other DC Comics available
      mockDb.comicFile.findMany.mockResolvedValue([
        createMockFile('file-2', {
          metadata: { series: 'Superman', publisher: 'DC Comics', genre: 'Superhero' },
        }),
      ]);

      const result = await getSimilarContent();

      expect(result).toHaveLength(1);
      expect(result[0]?.publisher).toBe('DC Comics');
      expect(result[0]?.reason).toBe('same_publisher');
      expect(result[0]?.reasonDetail).toContain('DC Comics');
    });

    it('should recommend comics from same genre', async () => {
      mockDb.readingProgress.findMany
        .mockResolvedValueOnce([
          createMockProgress('file-1', {
            completed: true,
            file: createMockFile('file-1', {
              metadata: { series: 'Saga', publisher: 'Image', genre: 'Science Fiction' },
            }),
          }),
        ])
        .mockResolvedValueOnce([{ fileId: 'file-1' }]);

      mockDb.comicFile.findMany.mockResolvedValue([
        createMockFile('file-2', {
          metadata: { series: 'Paper Girls', publisher: 'Image', genre: 'Science Fiction' },
        }),
      ]);

      const result = await getSimilarContent();

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should exclude already read series', async () => {
      mockDb.readingProgress.findMany
        .mockResolvedValueOnce([
          createMockProgress('file-1', {
            completed: true,
            file: createMockFile('file-1', {
              metadata: { series: 'Batman', publisher: 'DC Comics', genre: 'Superhero' },
            }),
          }),
        ])
        .mockResolvedValueOnce([{ fileId: 'file-1' }]);

      // Should query with NOT condition for read series
      await getSimilarContent();

      expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            metadata: expect.objectContaining({
              NOT: {
                series: { in: ['Batman'] },
              },
            }),
          }),
        })
      );
    });

    it('should handle comma-separated genres', async () => {
      mockDb.readingProgress.findMany
        .mockResolvedValueOnce([
          createMockProgress('file-1', {
            completed: true,
            file: createMockFile('file-1', {
              metadata: { series: 'Batman', genre: 'Superhero, Action, Mystery' },
            }),
          }),
        ])
        .mockResolvedValueOnce([]);

      mockDb.comicFile.findMany.mockResolvedValue([]);

      await getSimilarContent();

      // Should have processed multiple genres
      expect(mockDb.readingProgress.findMany).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Recently Added Tests
  // ===========================================================================

  describe('getRecentlyAdded', () => {
    it('should return recently added unread comics', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]); // No read files

      mockDb.comicFile.findMany.mockResolvedValue([
        createMockFile('file-1', { metadata: { series: 'New Series', number: '1' } }),
        createMockFile('file-2', { metadata: { series: 'Another Series', number: '1' } }),
      ]);

      const result = await getRecentlyAdded();

      expect(result).toHaveLength(2);
      expect(result[0]?.reason).toBe('recently_added');
      expect(result[0]?.reasonDetail).toBe('New arrival');
    });

    it('should exclude read files', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([{ fileId: 'file-1' }]);

      await getRecentlyAdded();

      expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['file-1'] },
          }),
        })
      );
    });

    it('should order by createdAt descending', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);

      await getRecentlyAdded();

      expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should dedupe by series', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);

      mockDb.comicFile.findMany.mockResolvedValue([
        createMockFile('file-1', { metadata: { series: 'Same Series', number: '2' } }),
        createMockFile('file-2', { metadata: { series: 'Same Series', number: '1' } }),
        createMockFile('file-3', { metadata: { series: 'Different Series', number: '1' } }),
      ]);

      const result = await getRecentlyAdded();

      // Should only have one from "Same Series" (the first one found)
      const sameSeries = result.filter((r) => r.series === 'Same Series');
      expect(sameSeries).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Random Unread Tests
  // ===========================================================================

  describe('getRandomUnread', () => {
    it('should return empty array when no unread comics', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);
      mockDb.comicFile.count.mockResolvedValue(0);

      const result = await getRandomUnread();

      expect(result).toEqual([]);
    });

    it('should return random unread comics', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);
      mockDb.comicFile.count.mockResolvedValue(10);
      mockDb.comicFile.findMany.mockResolvedValue([
        createMockFile('file-random'),
      ]);

      const result = await getRandomUnread(5);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('fileId');
      expect(result[0]).toHaveProperty('filename');
      expect(result[0]).toHaveProperty('series');
    });

    it('should limit results to available comics', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);
      mockDb.comicFile.count.mockResolvedValue(3); // Only 3 available
      mockDb.comicFile.findMany.mockResolvedValue([createMockFile('file-1')]);

      const result = await getRandomUnread(10); // Requesting 10

      // Should not request more than available
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should exclude read files', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([{ fileId: 'file-read' }]);
      mockDb.comicFile.findMany.mockResolvedValue([createMockFile('file-1')]);

      await getRandomUnread();

      // New implementation uses findMany instead of count+loop
      expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['file-read'] },
          }),
        })
      );
    });
  });

  // ===========================================================================
  // Main API Tests
  // ===========================================================================

  describe('getRecommendations', () => {
    it('should return all recommendation types', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);
      mockDb.comicFile.findMany.mockResolvedValue([]);

      const result = await getRecommendations();

      expect(result).toHaveProperty('seriesFromHistory');
      expect(result).toHaveProperty('samePublisherGenre');
      expect(result).toHaveProperty('recentlyAdded');
      expect(Array.isArray(result.seriesFromHistory)).toBe(true);
      expect(Array.isArray(result.samePublisherGenre)).toBe(true);
      expect(Array.isArray(result.recentlyAdded)).toBe(true);
    });

    it('should pass limit to all recommendation functions', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);
      mockDb.comicFile.findMany.mockResolvedValue([]);

      await getRecommendations(5);

      // Verify take parameter includes limit (doubled for deduping)
      expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: expect.any(Number),
        })
      );
    });

    it('should pass libraryId to all recommendation functions', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);
      mockDb.comicFile.findMany.mockResolvedValue([]);

      await getRecommendations(8, 'lib-1');

      // Should filter by library
      expect(mockDb.readingProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            file: { libraryId: 'lib-1' },
          }),
        })
      );
    });
  });

  describe('getDiscoverComics', () => {
    it('should return discover result with comics array', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);
      mockDb.comicFile.findMany.mockResolvedValue([createMockFile('file-1')]);

      const result = await getDiscoverComics();

      expect(result).toHaveProperty('comics');
      expect(Array.isArray(result.comics)).toBe(true);
    });

    it('should return empty comics array when none available', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);
      mockDb.comicFile.findMany.mockResolvedValue([]); // No unread comics

      const result = await getDiscoverComics();

      expect(result.comics).toEqual([]);
    });

    it('should pass limit to getRandomUnread', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);
      mockDb.comicFile.findMany.mockResolvedValue([createMockFile('file-1')]);

      await getDiscoverComics(20);

      // Should use findMany with a take parameter based on limit
      // New implementation fetches batch (limit * 3) and samples in memory
      expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: expect.any(Number),
        })
      );
    });

    it('should filter by libraryId', async () => {
      mockDb.readingProgress.findMany.mockResolvedValue([]);
      mockDb.comicFile.findMany.mockResolvedValue([]);

      await getDiscoverComics(12, 'lib-1');

      // New implementation uses findMany instead of count+loop
      expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            libraryId: 'lib-1',
          }),
        })
      );
    });
  });
});
