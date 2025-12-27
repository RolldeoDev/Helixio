/**
 * Reading Progress Service Tests
 *
 * Tests for user reading progress tracking:
 * - Progress CRUD operations
 * - Bookmark management
 * - Continue reading functionality
 * - Library progress statistics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockPrismaClient,
  createMockUserReadingProgress,
  createMockComicFile,
} from './__mocks__/prisma.mock.js';

// Create mock prisma client
const mockPrisma = createMockPrismaClient();

// Mock database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockPrisma),
}));

// Mock stats-dirty service
vi.mock('../stats-dirty.service.js', () => ({
  markDirtyForReadingProgress: vi.fn().mockResolvedValue(undefined),
}));

// Mock fs/promises for cache cleanup
vi.mock('fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

// Import service after mocking
const {
  getProgress,
  updateProgress,
  markCompleted,
  markIncomplete,
  deleteProgress,
  addBookmark,
  removeBookmark,
  getBookmarks,
  getContinueReading,
  getLibraryProgress,
  getLibraryReadingStats,
} = await import('../reading-progress.service.js');

describe('Reading Progress Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // getProgress
  // =============================================================================

  describe('getProgress', () => {
    it('should return progress when it exists', async () => {
      const progress = createMockUserReadingProgress({
        userId: 'user-1',
        fileId: 'file-1',
        currentPage: 10,
        totalPages: 20,
        bookmarks: '[5, 15]',
      });
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(progress);

      const result = await getProgress('user-1', 'file-1');

      expect(result).toBeDefined();
      expect(result!.currentPage).toBe(10);
      expect(result!.totalPages).toBe(20);
      expect(result!.bookmarks).toEqual([5, 15]);
    });

    it('should return null when no progress exists', async () => {
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(null);

      const result = await getProgress('user-1', 'file-1');

      expect(result).toBeNull();
    });

    it('should parse empty bookmarks correctly', async () => {
      const progress = createMockUserReadingProgress({
        bookmarks: '[]',
      });
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(progress);

      const result = await getProgress('user-1', 'file-1');

      expect(result!.bookmarks).toEqual([]);
    });
  });

  // =============================================================================
  // updateProgress
  // =============================================================================

  describe('updateProgress', () => {
    it('should create progress when none exists', async () => {
      const file = createMockComicFile({ id: 'file-1' });
      const newProgress = createMockUserReadingProgress({
        currentPage: 5,
        totalPages: 20,
        completed: false,
      });
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.userReadingProgress.upsert.mockResolvedValue(newProgress);
      mockPrisma.comicFile.findUnique.mockResolvedValue({ ...file, seriesId: null });

      const result = await updateProgress('user-1', 'file-1', {
        currentPage: 5,
        totalPages: 20,
      });

      expect(result.currentPage).toBe(5);
      expect(mockPrisma.userReadingProgress.upsert).toHaveBeenCalled();
    });

    it('should throw error when file not found', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      await expect(updateProgress('user-1', 'nonexistent', {
        currentPage: 5,
      })).rejects.toThrow('File not found');
    });

    it('should auto-complete when on last page', async () => {
      const file = createMockComicFile({ id: 'file-1' });
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.userReadingProgress.upsert.mockImplementation((args) =>
        Promise.resolve({
          ...createMockUserReadingProgress(),
          ...args.create,
          ...args.update,
        })
      );

      await updateProgress('user-1', 'file-1', {
        currentPage: 19,
        totalPages: 20,
      });

      const upsertCall = mockPrisma.userReadingProgress.upsert.mock.calls[0]![0];
      expect(upsertCall.create.completed).toBe(true);
    });

    it('should respect explicit completed flag', async () => {
      const file = createMockComicFile({ id: 'file-1' });
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.userReadingProgress.upsert.mockImplementation((args) =>
        Promise.resolve({
          ...createMockUserReadingProgress(),
          ...args.create,
        })
      );

      await updateProgress('user-1', 'file-1', {
        currentPage: 5,
        totalPages: 20,
        completed: true,
      });

      const upsertCall = mockPrisma.userReadingProgress.upsert.mock.calls[0]![0];
      expect(upsertCall.create.completed).toBe(true);
    });
  });

  // =============================================================================
  // markCompleted
  // =============================================================================

  describe('markCompleted', () => {
    it('should mark existing progress as completed', async () => {
      const existing = createMockUserReadingProgress({
        completed: false,
      });
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(existing);
      mockPrisma.userReadingProgress.update.mockResolvedValue({
        ...existing,
        completed: true,
      });
      mockPrisma.comicFile.findUnique.mockResolvedValue({ seriesId: null });

      const result = await markCompleted('user-1', 'file-1');

      expect(result.completed).toBe(true);
      expect(mockPrisma.userReadingProgress.update).toHaveBeenCalledWith({
        where: { userId_fileId: { userId: 'user-1', fileId: 'file-1' } },
        data: { completed: true },
      });
    });

    it('should create new progress entry if none exists', async () => {
      const file = createMockComicFile({ id: 'file-1' });
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(null);
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.userReadingProgress.create.mockResolvedValue(
        createMockUserReadingProgress({ completed: true })
      );

      const result = await markCompleted('user-1', 'file-1');

      expect(result.completed).toBe(true);
      expect(mockPrisma.userReadingProgress.create).toHaveBeenCalled();
    });

    it('should throw error if file not found when creating new entry', async () => {
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(null);
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      await expect(markCompleted('user-1', 'nonexistent')).rejects.toThrow('File not found');
    });
  });

  // =============================================================================
  // markIncomplete
  // =============================================================================

  describe('markIncomplete', () => {
    it('should reset progress to incomplete', async () => {
      const existing = createMockUserReadingProgress({
        completed: true,
        currentPage: 20,
      });
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(existing);
      mockPrisma.userReadingProgress.update.mockResolvedValue({
        ...existing,
        completed: false,
        currentPage: 0,
      });
      mockPrisma.comicFile.findUnique.mockResolvedValue({ seriesId: null });

      const result = await markIncomplete('user-1', 'file-1');

      expect(result.completed).toBe(false);
      expect(result.currentPage).toBe(0);
    });

    it('should throw error if no progress exists', async () => {
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(null);

      await expect(markIncomplete('user-1', 'file-1')).rejects.toThrow(
        'No reading progress found'
      );
    });
  });

  // =============================================================================
  // deleteProgress
  // =============================================================================

  describe('deleteProgress', () => {
    it('should delete progress when it exists', async () => {
      mockPrisma.userReadingProgress.delete.mockResolvedValue({});

      await expect(deleteProgress('user-1', 'file-1')).resolves.toBeUndefined();

      expect(mockPrisma.userReadingProgress.delete).toHaveBeenCalledWith({
        where: { userId_fileId: { userId: 'user-1', fileId: 'file-1' } },
      });
    });

    it('should not throw when progress does not exist', async () => {
      mockPrisma.userReadingProgress.delete.mockRejectedValue(new Error('Not found'));

      await expect(deleteProgress('user-1', 'file-1')).resolves.toBeUndefined();
    });
  });

  // =============================================================================
  // Bookmarks
  // =============================================================================

  describe('addBookmark', () => {
    it('should add bookmark to existing progress', async () => {
      const existing = createMockUserReadingProgress({
        bookmarks: '[5]',
      });
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(existing);
      mockPrisma.userReadingProgress.update.mockResolvedValue({
        ...existing,
        bookmarks: '[5, 10]',
      });

      const result = await addBookmark('user-1', 'file-1', 10);

      expect(result.bookmarks).toEqual([5, 10]);
    });

    it('should create progress with bookmark if none exists', async () => {
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(null);
      mockPrisma.userReadingProgress.create.mockResolvedValue(
        createMockUserReadingProgress({ bookmarks: '[10]' })
      );

      const result = await addBookmark('user-1', 'file-1', 10);

      expect(result.bookmarks).toEqual([10]);
    });

    it('should not duplicate existing bookmark', async () => {
      const existing = createMockUserReadingProgress({
        bookmarks: '[5, 10]',
      });
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(existing);
      mockPrisma.userReadingProgress.update.mockResolvedValue(existing);

      const result = await addBookmark('user-1', 'file-1', 10);

      expect(result.bookmarks).toEqual([5, 10]);
    });

    it('should sort bookmarks after adding', async () => {
      const existing = createMockUserReadingProgress({
        bookmarks: '[10, 20]',
      });
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(existing);
      mockPrisma.userReadingProgress.update.mockImplementation((args) =>
        Promise.resolve({ ...existing, bookmarks: args.data.bookmarks })
      );

      const result = await addBookmark('user-1', 'file-1', 15);

      expect(result.bookmarks).toEqual([10, 15, 20]);
    });
  });

  describe('removeBookmark', () => {
    it('should remove bookmark from progress', async () => {
      const existing = createMockUserReadingProgress({
        bookmarks: '[5, 10, 15]',
      });
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(existing);
      mockPrisma.userReadingProgress.update.mockResolvedValue({
        ...existing,
        bookmarks: '[5, 15]',
      });

      const result = await removeBookmark('user-1', 'file-1', 10);

      expect(result.bookmarks).toEqual([5, 15]);
    });

    it('should throw error if no progress exists', async () => {
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(null);

      await expect(removeBookmark('user-1', 'file-1', 10)).rejects.toThrow(
        'No reading progress found'
      );
    });
  });

  describe('getBookmarks', () => {
    it('should return bookmarks for file', async () => {
      const progress = createMockUserReadingProgress({
        bookmarks: '[5, 10, 15]',
      });
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(progress);

      const result = await getBookmarks('user-1', 'file-1');

      expect(result).toEqual([5, 10, 15]);
    });

    it('should return empty array if no progress exists', async () => {
      mockPrisma.userReadingProgress.findUnique.mockResolvedValue(null);

      const result = await getBookmarks('user-1', 'file-1');

      expect(result).toEqual([]);
    });
  });

  // =============================================================================
  // Continue Reading
  // =============================================================================

  describe('getContinueReading', () => {
    it('should return in-progress files', async () => {
      const progressItems = [
        {
          ...createMockUserReadingProgress({
            currentPage: 10,
            totalPages: 20,
          }),
          file: {
            id: 'file-1',
            filename: 'Batman 001.cbz',
            relativePath: 'Batman/Batman 001.cbz',
            libraryId: 'lib-1',
            metadata: { series: 'Batman', number: '1', title: 'Court of Owls' },
            series: { issueCount: 52 },
          },
        },
      ];
      mockPrisma.userReadingProgress.findMany.mockResolvedValue(progressItems);

      const result = await getContinueReading('user-1', 3);

      expect(result).toHaveLength(1);
      expect(result[0]!.fileId).toBe('file-1');
      expect(result[0]!.progress).toBe(50);
      expect(result[0]!.series).toBe('Batman');
    });

    it('should filter by library when provided', async () => {
      mockPrisma.userReadingProgress.findMany.mockResolvedValue([]);

      await getContinueReading('user-1', 3, 'lib-1');

      const findManyCall = mockPrisma.userReadingProgress.findMany.mock.calls[0]![0];
      expect(findManyCall.where.file).toEqual({ libraryId: 'lib-1' });
    });

    it('should respect limit parameter', async () => {
      mockPrisma.userReadingProgress.findMany.mockResolvedValue([]);

      await getContinueReading('user-1', 5);

      const findManyCall = mockPrisma.userReadingProgress.findMany.mock.calls[0]![0];
      expect(findManyCall.take).toBe(5);
    });

    it('should calculate progress percentage correctly', async () => {
      const progressItems = [
        {
          ...createMockUserReadingProgress({
            currentPage: 15,
            totalPages: 30,
          }),
          file: {
            id: 'file-1',
            filename: 'test.cbz',
            relativePath: 'test.cbz',
            libraryId: 'lib-1',
            metadata: null,
            series: null,
          },
        },
      ];
      mockPrisma.userReadingProgress.findMany.mockResolvedValue(progressItems);

      const result = await getContinueReading('user-1', 3);

      expect(result[0]!.progress).toBe(50);
    });

    it('should handle zero total pages', async () => {
      const progressItems = [
        {
          ...createMockUserReadingProgress({
            currentPage: 5,
            totalPages: 0,
          }),
          file: {
            id: 'file-1',
            filename: 'test.cbz',
            relativePath: 'test.cbz',
            libraryId: 'lib-1',
            metadata: null,
            series: null,
          },
        },
      ];
      mockPrisma.userReadingProgress.findMany.mockResolvedValue(progressItems);

      const result = await getContinueReading('user-1', 3);

      expect(result[0]!.progress).toBe(0);
    });
  });

  // =============================================================================
  // Library Progress
  // =============================================================================

  describe('getLibraryProgress', () => {
    it('should return progress map for library', async () => {
      const progressItems = [
        { fileId: 'file-1', currentPage: 10, totalPages: 20, completed: false },
        { fileId: 'file-2', currentPage: 30, totalPages: 30, completed: true },
      ];
      mockPrisma.userReadingProgress.findMany.mockResolvedValue(progressItems);

      const result = await getLibraryProgress('user-1', 'lib-1');

      expect(result.size).toBe(2);
      expect(result.get('file-1')).toEqual({
        currentPage: 10,
        totalPages: 20,
        completed: false,
      });
      expect(result.get('file-2')).toEqual({
        currentPage: 30,
        totalPages: 30,
        completed: true,
      });
    });

    it('should return empty map if no progress', async () => {
      mockPrisma.userReadingProgress.findMany.mockResolvedValue([]);

      const result = await getLibraryProgress('user-1', 'lib-1');

      expect(result.size).toBe(0);
    });
  });

  describe('getLibraryReadingStats', () => {
    it('should return reading statistics for library', async () => {
      mockPrisma.comicFile.count.mockResolvedValue(100);
      mockPrisma.userReadingProgress.count
        .mockResolvedValueOnce(10) // in progress
        .mockResolvedValueOnce(30); // completed

      const result = await getLibraryReadingStats('user-1', 'lib-1');

      expect(result).toEqual({
        totalFiles: 100,
        inProgress: 10,
        completed: 30,
        unread: 60,
      });
    });

    it('should handle all files read', async () => {
      mockPrisma.comicFile.count.mockResolvedValue(50);
      mockPrisma.userReadingProgress.count
        .mockResolvedValueOnce(0) // in progress
        .mockResolvedValueOnce(50); // completed

      const result = await getLibraryReadingStats('user-1', 'lib-1');

      expect(result.unread).toBe(0);
    });

    it('should handle empty library', async () => {
      mockPrisma.comicFile.count.mockResolvedValue(0);
      mockPrisma.userReadingProgress.count.mockResolvedValue(0);

      const result = await getLibraryReadingStats('user-1', 'lib-1');

      expect(result).toEqual({
        totalFiles: 0,
        inProgress: 0,
        completed: 0,
        unread: 0,
      });
    });
  });
});
