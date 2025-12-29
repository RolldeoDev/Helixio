/**
 * User Data Service Tests
 *
 * Tests for user ratings, reviews, and notes functionality.
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  getSeriesUserData,
  updateSeriesUserData,
  deleteSeriesUserData,
  getIssueUserData,
  updateIssueUserData,
  deleteIssueUserData,
  getSeriesAverageRating,
  getSeriesUserDataBatch,
  getIssuesUserDataBatch,
  migrateLocalStorageNotes,
  getSeriesPublicReviews,
  getIssuePublicReviews,
} from '../user-data.service.js';

// Mock the database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from '../database.service.js';

describe('User Data Service', () => {
  const mockDb = {
    userSeriesData: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    userReadingProgress: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    series: {
      findUnique: vi.fn(),
    },
    comicFile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getDatabase as Mock).mockReturnValue(mockDb);
  });

  // =============================================================================
  // Series User Data Tests
  // =============================================================================

  describe('getSeriesUserData', () => {
    it('should return null when no data exists', async () => {
      mockDb.userSeriesData.findUnique.mockResolvedValue(null);

      const result = await getSeriesUserData('user-1', 'series-1');

      expect(result).toBeNull();
      expect(mockDb.userSeriesData.findUnique).toHaveBeenCalledWith({
        where: { userId_seriesId: { userId: 'user-1', seriesId: 'series-1' } },
      });
    });

    it('should return user data when it exists', async () => {
      const mockData = {
        id: 'usd-1',
        userId: 'user-1',
        seriesId: 'series-1',
        rating: 4,
        privateNotes: 'My notes',
        publicReview: 'Great series!',
        reviewVisibility: 'public',
        ratedAt: new Date(),
        reviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.userSeriesData.findUnique.mockResolvedValue(mockData);

      const result = await getSeriesUserData('user-1', 'series-1');

      expect(result).toEqual({
        ...mockData,
        reviewVisibility: 'public',
      });
    });
  });

  describe('updateSeriesUserData', () => {
    it('should throw error if series not found', async () => {
      mockDb.series.findUnique.mockResolvedValue(null);

      await expect(
        updateSeriesUserData('user-1', 'series-1', { rating: 5 })
      ).rejects.toThrow('Series not found: series-1');
    });

    it('should throw error for rating out of range', async () => {
      mockDb.series.findUnique.mockResolvedValue({ id: 'series-1' });

      await expect(
        updateSeriesUserData('user-1', 'series-1', { rating: 5.5 })
      ).rejects.toThrow('Rating must be between 0.5 and 5');

      await expect(
        updateSeriesUserData('user-1', 'series-1', { rating: 0 })
      ).rejects.toThrow('Rating must be between 0.5 and 5');
    });

    it('should throw error for invalid rating increment', async () => {
      mockDb.series.findUnique.mockResolvedValue({ id: 'series-1' });

      await expect(
        updateSeriesUserData('user-1', 'series-1', { rating: 3.3 })
      ).rejects.toThrow('Rating must be in 0.5 increments');

      await expect(
        updateSeriesUserData('user-1', 'series-1', { rating: 4.2 })
      ).rejects.toThrow('Rating must be in 0.5 increments');
    });

    it.each([0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0])(
      'should accept valid half-star rating %s',
      async (rating) => {
        mockDb.series.findUnique.mockResolvedValue({ id: 'series-1' });
        mockDb.userSeriesData.upsert.mockResolvedValue({
          id: 'usd-1',
          userId: 'user-1',
          seriesId: 'series-1',
          rating,
          privateNotes: null,
          publicReview: null,
          reviewVisibility: 'private',
          ratedAt: expect.any(Date),
          reviewedAt: null,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });

        const result = await updateSeriesUserData('user-1', 'series-1', { rating });

        expect(result.rating).toBe(rating);
      }
    );

    it('should create new user data when none exists', async () => {
      mockDb.series.findUnique.mockResolvedValue({ id: 'series-1' });
      mockDb.userSeriesData.upsert.mockResolvedValue({
        id: 'usd-1',
        userId: 'user-1',
        seriesId: 'series-1',
        rating: 5,
        privateNotes: null,
        publicReview: null,
        reviewVisibility: 'private',
        ratedAt: expect.any(Date),
        reviewedAt: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      const result = await updateSeriesUserData('user-1', 'series-1', { rating: 5 });

      expect(result.rating).toBe(5);
      expect(mockDb.userSeriesData.upsert).toHaveBeenCalled();
    });

    it('should allow setting rating to null to clear it', async () => {
      mockDb.series.findUnique.mockResolvedValue({ id: 'series-1' });
      mockDb.userSeriesData.upsert.mockResolvedValue({
        id: 'usd-1',
        userId: 'user-1',
        seriesId: 'series-1',
        rating: null,
        privateNotes: null,
        publicReview: null,
        reviewVisibility: 'private',
        ratedAt: null,
        reviewedAt: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      const result = await updateSeriesUserData('user-1', 'series-1', { rating: null });

      expect(result.rating).toBeNull();
    });

    it('should update private notes', async () => {
      mockDb.series.findUnique.mockResolvedValue({ id: 'series-1' });
      mockDb.userSeriesData.upsert.mockResolvedValue({
        id: 'usd-1',
        userId: 'user-1',
        seriesId: 'series-1',
        rating: null,
        privateNotes: 'Updated notes',
        publicReview: null,
        reviewVisibility: 'private',
        ratedAt: null,
        reviewedAt: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      const result = await updateSeriesUserData('user-1', 'series-1', {
        privateNotes: 'Updated notes',
      });

      expect(result.privateNotes).toBe('Updated notes');
    });
  });

  describe('deleteSeriesUserData', () => {
    it('should delete user data without throwing if not found', async () => {
      mockDb.userSeriesData.delete.mockRejectedValue(new Error('Not found'));

      // Should not throw
      await expect(deleteSeriesUserData('user-1', 'series-1')).resolves.toBeUndefined();
    });

    it('should delete user data successfully', async () => {
      mockDb.userSeriesData.delete.mockResolvedValue({});

      await deleteSeriesUserData('user-1', 'series-1');

      expect(mockDb.userSeriesData.delete).toHaveBeenCalledWith({
        where: { userId_seriesId: { userId: 'user-1', seriesId: 'series-1' } },
      });
    });
  });

  // =============================================================================
  // Issue User Data Tests
  // =============================================================================

  describe('getIssueUserData', () => {
    it('should return null when no progress exists', async () => {
      mockDb.userReadingProgress.findUnique.mockResolvedValue(null);

      const result = await getIssueUserData('user-1', 'file-1');

      expect(result).toBeNull();
    });

    it('should return user data from reading progress', async () => {
      const mockProgress = {
        id: 'urp-1',
        userId: 'user-1',
        fileId: 'file-1',
        rating: 3,
        privateNotes: 'Issue notes',
        publicReview: null,
        reviewVisibility: 'private',
        ratedAt: new Date(),
        reviewedAt: new Date(),
        currentPage: 10,
        totalPages: 20,
        completed: false,
        lastReadAt: new Date(),
      };
      mockDb.userReadingProgress.findUnique.mockResolvedValue(mockProgress);

      const result = await getIssueUserData('user-1', 'file-1');

      expect(result?.rating).toBe(3);
      expect(result?.currentPage).toBe(10);
      expect(result?.completed).toBe(false);
    });
  });

  describe('updateIssueUserData', () => {
    it('should throw error if file not found', async () => {
      mockDb.comicFile.findUnique.mockResolvedValue(null);

      await expect(
        updateIssueUserData('user-1', 'file-1', { rating: 5 })
      ).rejects.toThrow('File not found: file-1');
    });

    it('should create reading progress if none exists', async () => {
      mockDb.comicFile.findUnique.mockResolvedValue({ id: 'file-1' });
      mockDb.userReadingProgress.upsert.mockResolvedValue({
        id: 'urp-1',
        userId: 'user-1',
        fileId: 'file-1',
        rating: 4,
        privateNotes: null,
        publicReview: null,
        reviewVisibility: 'private',
        ratedAt: expect.any(Date),
        reviewedAt: null,
        currentPage: 0,
        totalPages: 0,
        completed: false,
        lastReadAt: expect.any(Date),
      });

      const result = await updateIssueUserData('user-1', 'file-1', { rating: 4 });

      expect(result.rating).toBe(4);
      expect(result.currentPage).toBe(0);
    });
  });

  describe('deleteIssueUserData', () => {
    it('should clear rating and review fields but keep progress', async () => {
      mockDb.userReadingProgress.update.mockResolvedValue({});

      await deleteIssueUserData('user-1', 'file-1');

      expect(mockDb.userReadingProgress.update).toHaveBeenCalledWith({
        where: { userId_fileId: { userId: 'user-1', fileId: 'file-1' } },
        data: {
          rating: null,
          privateNotes: null,
          publicReview: null,
          reviewVisibility: 'private',
          ratedAt: null,
          reviewedAt: null,
        },
      });
    });
  });

  // =============================================================================
  // Rating Aggregation Tests
  // =============================================================================

  describe('getSeriesAverageRating', () => {
    it('should return null average when no files in series', async () => {
      mockDb.comicFile.findMany.mockResolvedValue([]);

      const result = await getSeriesAverageRating('user-1', 'series-1');

      expect(result).toEqual({ average: null, count: 0, totalIssues: 0 });
    });

    it('should return null average when no ratings exist', async () => {
      mockDb.comicFile.findMany.mockResolvedValue([{ id: 'file-1' }, { id: 'file-2' }]);
      mockDb.userReadingProgress.findMany.mockResolvedValue([]);

      const result = await getSeriesAverageRating('user-1', 'series-1');

      expect(result).toEqual({ average: null, count: 0, totalIssues: 2 });
    });

    it('should calculate average correctly', async () => {
      mockDb.comicFile.findMany.mockResolvedValue([
        { id: 'file-1' },
        { id: 'file-2' },
        { id: 'file-3' },
      ]);
      mockDb.userReadingProgress.findMany.mockResolvedValue([
        { rating: 4 },
        { rating: 5 },
      ]);

      const result = await getSeriesAverageRating('user-1', 'series-1');

      expect(result).toEqual({ average: 4.5, count: 2, totalIssues: 3 });
    });

    it('should round average to one decimal place', async () => {
      mockDb.comicFile.findMany.mockResolvedValue([
        { id: 'file-1' },
        { id: 'file-2' },
        { id: 'file-3' },
      ]);
      mockDb.userReadingProgress.findMany.mockResolvedValue([
        { rating: 4 },
        { rating: 4 },
        { rating: 5 },
      ]);

      const result = await getSeriesAverageRating('user-1', 'series-1');

      expect(result.average).toBe(4.3); // (4+4+5)/3 = 4.333... → 4.3
    });
  });

  // =============================================================================
  // Batch Operations Tests
  // =============================================================================

  describe('getSeriesUserDataBatch', () => {
    it('should return empty map for empty input', async () => {
      mockDb.userSeriesData.findMany.mockResolvedValue([]);

      const result = await getSeriesUserDataBatch('user-1', []);

      expect(result.size).toBe(0);
    });

    it('should return map of series data', async () => {
      mockDb.userSeriesData.findMany.mockResolvedValue([
        { seriesId: 'series-1', rating: 4, reviewVisibility: 'private' },
        { seriesId: 'series-2', rating: 5, reviewVisibility: 'public' },
      ]);

      const result = await getSeriesUserDataBatch('user-1', ['series-1', 'series-2']);

      expect(result.size).toBe(2);
      expect(result.get('series-1')?.rating).toBe(4);
      expect(result.get('series-2')?.rating).toBe(5);
    });
  });

  describe('getIssuesUserDataBatch', () => {
    it('should return map of issue data', async () => {
      mockDb.userReadingProgress.findMany.mockResolvedValue([
        {
          fileId: 'file-1',
          rating: 3,
          reviewVisibility: 'private',
          currentPage: 5,
          totalPages: 20,
          completed: false,
          lastReadAt: new Date(),
        },
      ]);

      const result = await getIssuesUserDataBatch('user-1', ['file-1', 'file-2']);

      expect(result.size).toBe(1);
      expect(result.get('file-1')?.rating).toBe(3);
      expect(result.has('file-2')).toBe(false);
    });
  });

  // =============================================================================
  // Migration Tests
  // =============================================================================

  describe('migrateLocalStorageNotes', () => {
    it('should skip notes for non-existent files', async () => {
      mockDb.comicFile.findUnique.mockResolvedValue(null);

      const result = await migrateLocalStorageNotes('user-1', [
        { fileId: 'file-1', content: 'Test note' },
      ]);

      expect(result.migrated).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toContain('File not found: file-1');
    });

    it('should migrate notes successfully', async () => {
      mockDb.comicFile.findUnique.mockResolvedValue({ id: 'file-1' });
      mockDb.userReadingProgress.upsert.mockResolvedValue({});

      const result = await migrateLocalStorageNotes('user-1', [
        { fileId: 'file-1', title: 'Title', content: 'Content', rating: 4, tags: ['tag1'] },
      ]);

      expect(result.migrated).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('should combine title, content, and tags into privateNotes', async () => {
      mockDb.comicFile.findUnique.mockResolvedValue({ id: 'file-1' });
      mockDb.userReadingProgress.upsert.mockResolvedValue({});

      await migrateLocalStorageNotes('user-1', [
        { fileId: 'file-1', title: 'My Title', content: 'My content', tags: ['tag1', 'tag2'] },
      ]);

      expect(mockDb.userReadingProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            privateNotes: '# My Title\n\nMy content\n\n---\nTags: tag1, tag2',
          }),
        })
      );
    });
  });

  // =============================================================================
  // Public Reviews Tests
  // =============================================================================

  describe('getSeriesPublicReviews', () => {
    it('should return public reviews with user info', async () => {
      mockDb.userSeriesData.findMany.mockResolvedValue([
        {
          rating: 5,
          publicReview: 'Amazing!',
          reviewedAt: new Date(),
          user: { id: 'user-1', username: 'testuser', displayName: 'Test User' },
        },
      ]);

      const result = await getSeriesPublicReviews('series-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.username).toBe('testuser');
      expect(result[0]!.rating).toBe(5);
    });
  });

  describe('getIssuePublicReviews', () => {
    it('should return public reviews for an issue', async () => {
      mockDb.userReadingProgress.findMany.mockResolvedValue([
        {
          rating: 4,
          publicReview: 'Good issue',
          reviewedAt: new Date(),
          user: { id: 'user-1', username: 'reviewer', displayName: null },
        },
      ]);

      const result = await getIssuePublicReviews('file-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.username).toBe('reviewer');
      expect(result[0]!.displayName).toBeNull();
    });
  });
});
