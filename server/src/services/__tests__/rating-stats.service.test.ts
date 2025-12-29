/**
 * Rating Stats Service Tests
 *
 * Tests for rating and review statistics computation.
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { computeRatingStats } from '../rating-stats.service.js';

// Mock the database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from '../database.service.js';

describe('Rating Stats Service', () => {
  const mockDb = {
    userSeriesData: {
      findMany: vi.fn(),
    },
    userReadingProgress: {
      findMany: vi.fn(),
    },
    series: {
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getDatabase as Mock).mockReturnValue(mockDb);
  });

  // Helper to set up default empty mocks
  function setupEmptyMocks() {
    mockDb.userSeriesData.findMany.mockResolvedValue([]);
    mockDb.userReadingProgress.findMany.mockResolvedValue([]);
    mockDb.series.findMany.mockResolvedValue([]);
  }

  describe('computeRatingStats', () => {
    it('should return empty stats when no ratings exist', async () => {
      setupEmptyMocks();

      const result = await computeRatingStats('user-1');

      expect(result.totalSeriesRated).toBe(0);
      expect(result.totalIssuesRated).toBe(0);
      expect(result.totalReviewsWritten).toBe(0);
      expect(result.averageRatingGiven).toBeNull();
      // 10 buckets for half-star support (0.5-5.0 in 0.5 increments)
      expect(result.ratingDistribution).toEqual([
        { rating: 0.5, count: 0 },
        { rating: 1.0, count: 0 },
        { rating: 1.5, count: 0 },
        { rating: 2.0, count: 0 },
        { rating: 2.5, count: 0 },
        { rating: 3.0, count: 0 },
        { rating: 3.5, count: 0 },
        { rating: 4.0, count: 0 },
        { rating: 4.5, count: 0 },
        { rating: 5.0, count: 0 },
      ]);
    });

    it('should count series and issue ratings correctly', async () => {
      // Set up mocks to return different data based on the query structure
      mockDb.userSeriesData.findMany.mockImplementation((params: { where: { rating?: unknown }; select: { rating?: boolean } }) => {
        // Check if this is a rating query (has rating in select)
        if (params?.select?.rating) {
          return Promise.resolve([
            { rating: 4, seriesId: 's-1', series: { id: 's-1', name: 'Series 1' } },
            { rating: 5, seriesId: 's-2', series: { id: 's-2', name: 'Series 2' } },
          ]);
        }
        // Otherwise return empty (reviews, dates)
        return Promise.resolve([]);
      });

      mockDb.userReadingProgress.findMany.mockImplementation((params: { where: { rating?: unknown }; select: { rating?: boolean } }) => {
        // Check if this is an issue rating query
        if (params?.select?.rating && params?.where?.rating) {
          return Promise.resolve([
            { rating: 3, fileId: 'f-1', file: { seriesId: 's-1', metadata: { genre: 'Action', publisher: 'Marvel' } } },
            { rating: 4, fileId: 'f-2', file: { seriesId: 's-1', metadata: { genre: 'Action', publisher: 'DC' } } },
            { rating: 5, fileId: 'f-3', file: { seriesId: 's-2', metadata: { genre: 'Comedy', publisher: 'Marvel' } } },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.series.findMany.mockResolvedValue([]);

      const result = await computeRatingStats('user-1');

      expect(result.totalSeriesRated).toBe(2);
      expect(result.totalIssuesRated).toBe(3);
    });

    it('should calculate rating distribution correctly', async () => {
      mockDb.userSeriesData.findMany.mockImplementation((params: { select: { rating?: boolean } }) => {
        if (params?.select?.rating) {
          return Promise.resolve([
            { rating: 5, seriesId: 's-1', series: { id: 's-1', name: 'Series 1' } },
            { rating: 4, seriesId: 's-2', series: { id: 's-2', name: 'Series 2' } },
            { rating: 4, seriesId: 's-3', series: { id: 's-3', name: 'Series 3' } },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.userReadingProgress.findMany.mockImplementation((params: { where: { rating?: unknown }; select: { rating?: boolean } }) => {
        if (params?.select?.rating && params?.where?.rating) {
          return Promise.resolve([
            { rating: 3, fileId: 'f-1', file: { seriesId: 's-1', metadata: null } },
            { rating: 3, fileId: 'f-2', file: { seriesId: 's-1', metadata: null } },
            { rating: 2, fileId: 'f-3', file: { seriesId: 's-2', metadata: null } },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.series.findMany.mockResolvedValue([]);

      const result = await computeRatingStats('user-1');

      // 10 buckets for half-star support (0.5-5.0 in 0.5 increments)
      expect(result.ratingDistribution).toEqual([
        { rating: 0.5, count: 0 },
        { rating: 1.0, count: 0 },
        { rating: 1.5, count: 0 },
        { rating: 2.0, count: 1 },
        { rating: 2.5, count: 0 },
        { rating: 3.0, count: 2 },
        { rating: 3.5, count: 0 },
        { rating: 4.0, count: 2 },
        { rating: 4.5, count: 0 },
        { rating: 5.0, count: 1 },
      ]);
    });

    it('should calculate average rating correctly', async () => {
      mockDb.userSeriesData.findMany.mockImplementation((params: { select: { rating?: boolean } }) => {
        if (params?.select?.rating) {
          return Promise.resolve([
            { rating: 4, seriesId: 's-1', series: { id: 's-1', name: 'Series 1' } },
            { rating: 5, seriesId: 's-2', series: { id: 's-2', name: 'Series 2' } },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.userReadingProgress.findMany.mockImplementation((params: { where: { rating?: unknown }; select: { rating?: boolean } }) => {
        if (params?.select?.rating && params?.where?.rating) {
          return Promise.resolve([
            { rating: 3, fileId: 'f-1', file: { seriesId: 's-1', metadata: null } },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.series.findMany.mockResolvedValue([]);

      const result = await computeRatingStats('user-1');

      // (4 + 5 + 3) / 3 = 4
      expect(result.averageRatingGiven).toBe(4);
    });

    it('should find highest and lowest rated series', async () => {
      mockDb.userSeriesData.findMany.mockImplementation((params: { select: { rating?: boolean } }) => {
        if (params?.select?.rating) {
          return Promise.resolve([
            { rating: 2, seriesId: 's-1', series: { id: 's-1', name: 'Worst Series' } },
            { rating: 5, seriesId: 's-2', series: { id: 's-2', name: 'Best Series' } },
            { rating: 3, seriesId: 's-3', series: { id: 's-3', name: 'Middle Series' } },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.userReadingProgress.findMany.mockResolvedValue([]);
      mockDb.series.findMany.mockResolvedValue([]);

      const result = await computeRatingStats('user-1');

      expect(result.highestRatedSeries).toEqual({
        id: 's-2',
        name: 'Best Series',
        rating: 5,
      });
      expect(result.lowestRatedSeries).toEqual({
        id: 's-1',
        name: 'Worst Series',
        rating: 2,
      });
    });

    it('should count reviews correctly', async () => {
      mockDb.userSeriesData.findMany.mockImplementation((params: { where: { OR?: unknown[] } }) => {
        // Reviews query has OR condition
        if (params?.where?.OR) {
          return Promise.resolve([
            { publicReview: 'Great!', privateNotes: null },
            { publicReview: null, privateNotes: 'My notes' },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.userReadingProgress.findMany.mockImplementation((params: { where: { OR?: unknown[] } }) => {
        if (params?.where?.OR) {
          return Promise.resolve([
            { publicReview: 'Nice issue', privateNotes: null },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.series.findMany.mockResolvedValue([]);

      const result = await computeRatingStats('user-1');

      expect(result.totalReviewsWritten).toBe(3);
    });

    it('should find longest review length', async () => {
      mockDb.userSeriesData.findMany.mockImplementation((params: { where: { OR?: unknown[] } }) => {
        if (params?.where?.OR) {
          return Promise.resolve([
            { publicReview: 'Short', privateNotes: null },
            { publicReview: null, privateNotes: 'A much longer note with more characters' },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.userReadingProgress.findMany.mockImplementation((params: { where: { OR?: unknown[] } }) => {
        if (params?.where?.OR) {
          return Promise.resolve([
            { publicReview: 'Medium length review here', privateNotes: null },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.series.findMany.mockResolvedValue([]);

      const result = await computeRatingStats('user-1');

      expect(result.longestReviewLength).toBe('A much longer note with more characters'.length);
    });

    it('should calculate unique genres and publishers rated', async () => {
      mockDb.userSeriesData.findMany.mockResolvedValue([]);

      mockDb.userReadingProgress.findMany.mockImplementation((params: { where: { rating?: unknown }; select: { rating?: boolean; file?: { select?: { metadata?: unknown } } } }) => {
        // Check if this is the metadata query (has metadata in select)
        if (params?.select?.file?.select?.metadata) {
          return Promise.resolve([
            { rating: 4, file: { metadata: { genre: 'Action, Comedy', publisher: 'Marvel' } } },
            { rating: 5, file: { metadata: { genre: 'Action, Drama', publisher: 'DC' } } },
            { rating: 3, file: { metadata: { genre: 'Horror', publisher: 'Marvel' } } },
          ]);
        }
        // Rating query
        if (params?.select?.rating && params?.where?.rating) {
          return Promise.resolve([
            { rating: 4, fileId: 'f-1', file: { seriesId: 's-1' } },
            { rating: 5, fileId: 'f-2', file: { seriesId: 's-2' } },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.series.findMany.mockResolvedValue([]);

      const result = await computeRatingStats('user-1');

      expect(result.uniqueGenresRated).toBe(4); // Action, Comedy, Drama, Horror
      expect(result.uniquePublishersRated).toBe(2); // Marvel, DC
    });

    it('should find most rated genre and publisher', async () => {
      mockDb.userSeriesData.findMany.mockResolvedValue([]);

      mockDb.userReadingProgress.findMany.mockImplementation((params: { where: { rating?: unknown }; select: { rating?: boolean; file?: { select?: { metadata?: unknown } } } }) => {
        // Check if this is the metadata query
        if (params?.select?.file?.select?.metadata) {
          return Promise.resolve([
            { rating: 4, file: { metadata: { genre: 'Action', publisher: 'Marvel' } } },
            { rating: 5, file: { metadata: { genre: 'Action', publisher: 'Marvel' } } },
            { rating: 3, file: { metadata: { genre: 'Comedy', publisher: 'DC' } } },
          ]);
        }
        if (params?.select?.rating && params?.where?.rating) {
          return Promise.resolve([
            { rating: 4, fileId: 'f-1', file: { seriesId: 's-1' } },
            { rating: 5, fileId: 'f-2', file: { seriesId: 's-2' } },
            { rating: 3, fileId: 'f-3', file: { seriesId: 's-3' } },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.series.findMany.mockResolvedValue([]);

      const result = await computeRatingStats('user-1');

      expect(result.mostRatedGenre).toEqual({ name: 'Action', count: 2 });
      expect(result.mostRatedPublisher).toEqual({ name: 'Marvel', count: 2 });
    });

    it('should calculate rating streaks correctly', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      mockDb.userSeriesData.findMany.mockImplementation((params: { where: { ratedAt?: unknown } }) => {
        // Rating dates query
        if (params?.where?.ratedAt) {
          return Promise.resolve([
            { ratedAt: today },
            { ratedAt: yesterday },
            { ratedAt: twoDaysAgo },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.userReadingProgress.findMany.mockResolvedValue([]);
      mockDb.series.findMany.mockResolvedValue([]);

      const result = await computeRatingStats('user-1');

      expect(result.currentRatingStreak).toBe(3);
      expect(result.longestRatingStreak).toBe(3);
    });

    it('should count series with complete ratings', async () => {
      mockDb.userSeriesData.findMany.mockResolvedValue([]);
      mockDb.series.findMany.mockResolvedValue([
        { id: 's-1', _count: { issues: 2 } },
        { id: 's-2', _count: { issues: 3 } },
      ]);

      // Mock based on query structure - rated files query has file.select.seriesId
      mockDb.userReadingProgress.findMany.mockImplementation((params: { select?: { file?: { select?: { seriesId?: boolean } } } }) => {
        // Check if this is the countSeriesWithCompleteRatings query (selects file.seriesId)
        if (params?.select?.file?.select?.seriesId) {
          return Promise.resolve([
            { file: { seriesId: 's-1' } },
            { file: { seriesId: 's-1' } }, // 2 ratings for s-1 (complete)
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await computeRatingStats('user-1');

      expect(result.seriesWithCompleteRatings).toBe(1); // s-1 has 2/2 rated
    });

    it('should calculate max ratings same day', async () => {
      const today = new Date();

      mockDb.userSeriesData.findMany.mockImplementation((params: { where: { ratedAt?: unknown } }) => {
        if (params?.where?.ratedAt) {
          return Promise.resolve([
            { ratedAt: today },
            { ratedAt: today },
            { ratedAt: today },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.userReadingProgress.findMany.mockImplementation((params: { where: { ratedAt?: unknown } }) => {
        if (params?.where?.ratedAt) {
          return Promise.resolve([
            { ratedAt: today },
            { ratedAt: today },
          ]);
        }
        return Promise.resolve([]);
      });

      mockDb.series.findMany.mockResolvedValue([]);

      const result = await computeRatingStats('user-1');

      expect(result.maxRatingsSameDay).toBe(5); // 3 series + 2 issues on same day
    });
  });
});
