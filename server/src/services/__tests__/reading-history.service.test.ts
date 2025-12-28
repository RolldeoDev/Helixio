/**
 * Reading History Service Tests
 *
 * Tests for reading session tracking, history queries, and statistics.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from '../database.service.js';
import {
  startSession,
  updateSession,
  endSession,
  getRecentHistory,
  getFileHistory,
  clearFileHistory,
  clearAllHistory,
  getStats,
  getAllTimeStats,
} from '../reading-history.service.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('ReadingHistoryService', () => {
  let mockDb: {
    readingHistory: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    readingStats: {
      findMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Use fake timers for consistent date/time testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));

    mockDb = {
      readingHistory: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
        groupBy: vi.fn(),
      },
      readingStats: {
        findMany: vi.fn(),
        upsert: vi.fn(),
        aggregate: vi.fn(),
      },
    };

    vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Session Tracking Tests
  // ===========================================================================

  describe('startSession', () => {
    it('should create a new reading session', async () => {
      const sessionId = 'session-123';
      const fileId = 'file-1';
      const startPage = 5;

      mockDb.readingHistory.create.mockResolvedValue({
        id: sessionId,
        fileId,
        startPage,
        endPage: startPage,
        pagesRead: 0,
        duration: 0,
        completed: false,
        startedAt: new Date(),
        endedAt: null,
      });
      mockDb.readingStats.upsert.mockResolvedValue({});

      const result = await startSession(fileId, startPage);

      expect(result).toBe(sessionId);
      expect(mockDb.readingHistory.create).toHaveBeenCalledWith({
        data: {
          fileId,
          startPage,
          endPage: startPage,
        },
      });
    });

    it('should default startPage to 0 if not provided', async () => {
      mockDb.readingHistory.create.mockResolvedValue({
        id: 'session-1',
        fileId: 'file-1',
        startPage: 0,
        endPage: 0,
      });
      mockDb.readingStats.upsert.mockResolvedValue({});

      await startSession('file-1');

      expect(mockDb.readingHistory.create).toHaveBeenCalledWith({
        data: {
          fileId: 'file-1',
          startPage: 0,
          endPage: 0,
        },
      });
    });

    it('should increment daily session count and comics started', async () => {
      mockDb.readingHistory.create.mockResolvedValue({
        id: 'session-1',
        fileId: 'file-1',
        startPage: 0,
      });
      mockDb.readingStats.upsert.mockResolvedValue({});

      await startSession('file-1');

      // Should have called upsert twice: once for sessionsCount, once for comicsStarted
      expect(mockDb.readingStats.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateSession', () => {
    it('should update session progress', async () => {
      const sessionId = 'session-123';
      // Session started 1 hour ago (fake time is 2024-06-15T12:00:00.000Z)
      const startedAt = new Date('2024-06-15T11:00:00.000Z');
      const currentPage = 10;

      mockDb.readingHistory.findUnique.mockResolvedValue({
        id: sessionId,
        fileId: 'file-1',
        startPage: 0,
        startedAt,
      });
      mockDb.readingHistory.update.mockResolvedValue({});

      await updateSession(sessionId, currentPage);

      expect(mockDb.readingHistory.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          endPage: currentPage,
          pagesRead: 11, // currentPage - startPage + 1 = 10 - 0 + 1
          duration: 3600, // 1 hour in seconds
        },
      });
    });

    it('should use confirmed pages read when provided', async () => {
      const sessionId = 'session-123';
      // Session started 30 minutes ago (fake time is 2024-06-15T12:00:00.000Z)
      const startedAt = new Date('2024-06-15T11:30:00.000Z');
      const confirmedPagesRead = 5;

      mockDb.readingHistory.findUnique.mockResolvedValue({
        id: sessionId,
        startPage: 0,
        startedAt,
      });
      mockDb.readingHistory.update.mockResolvedValue({});

      await updateSession(sessionId, 10, confirmedPagesRead);

      expect(mockDb.readingHistory.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          endPage: 10,
          pagesRead: confirmedPagesRead,
          duration: 1800, // 30 minutes in seconds
        },
      });
    });

    it('should do nothing if session not found', async () => {
      mockDb.readingHistory.findUnique.mockResolvedValue(null);

      await updateSession('nonexistent', 10);

      expect(mockDb.readingHistory.update).not.toHaveBeenCalled();
    });

    it('should handle pages read calculation from middle of comic', async () => {
      // Session started 1 hour ago
      mockDb.readingHistory.findUnique.mockResolvedValue({
        id: 'session-1',
        startPage: 20,
        startedAt: new Date('2024-06-15T11:00:00.000Z'),
      });
      mockDb.readingHistory.update.mockResolvedValue({});

      await updateSession('session-1', 30);

      expect(mockDb.readingHistory.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: {
          endPage: 30,
          pagesRead: 11, // 30 - 20 + 1
          duration: 3600, // 1 hour
        },
      });
    });
  });

  describe('endSession', () => {
    it('should end a reading session', async () => {
      const sessionId = 'session-123';
      // Session started 1 hour ago
      const startedAt = new Date('2024-06-15T11:00:00.000Z');

      mockDb.readingHistory.findUnique.mockResolvedValue({
        id: sessionId,
        fileId: 'file-1',
        startPage: 0,
        startedAt,
      });
      mockDb.readingHistory.update.mockResolvedValue({
        id: sessionId,
        fileId: 'file-1',
        startedAt,
        endedAt: new Date(),
        startPage: 0,
        endPage: 15,
        pagesRead: 16,
        duration: 3600,
        completed: false,
      });
      mockDb.readingStats.upsert.mockResolvedValue({});

      const result = await endSession(sessionId, 15);

      expect(result).toEqual({
        id: sessionId,
        fileId: 'file-1',
        startedAt,
        endedAt: expect.any(Date),
        startPage: 0,
        endPage: 15,
        pagesRead: 16,
        duration: 3600,
        completed: false,
      });
    });

    it('should mark session as completed when flag is true', async () => {
      const sessionId = 'session-123';
      // Session started 30 minutes ago
      const startedAt = new Date('2024-06-15T11:30:00.000Z');

      mockDb.readingHistory.findUnique.mockResolvedValue({
        id: sessionId,
        fileId: 'file-1',
        startPage: 0,
        startedAt,
      });
      mockDb.readingHistory.update.mockResolvedValue({
        id: sessionId,
        fileId: 'file-1',
        startedAt,
        endedAt: new Date(),
        startPage: 0,
        endPage: 24,
        pagesRead: 25,
        duration: 1800,
        completed: true,
      });
      mockDb.readingStats.upsert.mockResolvedValue({});

      const result = await endSession(sessionId, 24, true);

      expect(result?.completed).toBe(true);
      // Should increment comicsCompleted stat
      expect(mockDb.readingStats.upsert).toHaveBeenCalledTimes(3); // pagesRead, duration, comicsCompleted
    });

    it('should return null if session not found', async () => {
      mockDb.readingHistory.findUnique.mockResolvedValue(null);

      const result = await endSession('nonexistent', 10);

      expect(result).toBeNull();
    });

    it('should use confirmed pages read when provided', async () => {
      const sessionId = 'session-123';
      // Session started 30 minutes ago
      const startedAt = new Date('2024-06-15T11:30:00.000Z');

      mockDb.readingHistory.findUnique.mockResolvedValue({
        id: sessionId,
        fileId: 'file-1',
        startPage: 0,
        startedAt,
      });
      mockDb.readingHistory.update.mockResolvedValue({
        id: sessionId,
        fileId: 'file-1',
        startedAt,
        endedAt: new Date(),
        startPage: 0,
        endPage: 20,
        pagesRead: 8, // Only 8 pages actually confirmed read
        duration: 1800,
        completed: false,
      });
      mockDb.readingStats.upsert.mockResolvedValue({});

      const result = await endSession(sessionId, 20, false, 8);

      expect(result?.pagesRead).toBe(8);
    });

    it('should update daily stats for pages read and duration', async () => {
      const sessionId = 'session-123';
      // Session started 1 hour ago
      const startedAt = new Date('2024-06-15T11:00:00.000Z');

      mockDb.readingHistory.findUnique.mockResolvedValue({
        id: sessionId,
        fileId: 'file-1',
        startPage: 0,
        startedAt,
      });
      mockDb.readingHistory.update.mockResolvedValue({
        id: sessionId,
        fileId: 'file-1',
        startedAt,
        endedAt: new Date(),
        startPage: 0,
        endPage: 10,
        pagesRead: 11,
        duration: 3600,
        completed: false,
      });
      mockDb.readingStats.upsert.mockResolvedValue({});

      await endSession(sessionId, 10);

      // Should update pagesRead and totalDuration
      expect(mockDb.readingStats.upsert).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // History Queries Tests
  // ===========================================================================

  describe('getRecentHistory', () => {
    it('should return recent reading history', async () => {
      const mockHistory = [
        {
          id: 'history-1',
          fileId: 'file-1',
          startedAt: new Date('2024-01-15T10:00:00.000Z'),
          endedAt: new Date('2024-01-15T10:30:00.000Z'),
          pagesRead: 15,
          duration: 1800,
          completed: false,
          file: {
            filename: 'comic1.cbz',
            relativePath: 'comics/comic1.cbz',
            libraryId: 'lib-1',
          },
        },
        {
          id: 'history-2',
          fileId: 'file-2',
          startedAt: new Date('2024-01-14T10:00:00.000Z'),
          endedAt: new Date('2024-01-14T11:00:00.000Z'),
          pagesRead: 30,
          duration: 3600,
          completed: true,
          file: {
            filename: 'comic2.cbz',
            relativePath: 'comics/comic2.cbz',
            libraryId: 'lib-1',
          },
        },
      ];

      mockDb.readingHistory.findMany.mockResolvedValue(mockHistory);

      const result = await getRecentHistory(20);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'history-1',
        fileId: 'file-1',
        filename: 'comic1.cbz',
        relativePath: 'comics/comic1.cbz',
        libraryId: 'lib-1',
        startedAt: expect.any(Date),
        endedAt: expect.any(Date),
        pagesRead: 15,
        duration: 1800,
        completed: false,
      });
    });

    it('should filter by library when provided', async () => {
      mockDb.readingHistory.findMany.mockResolvedValue([]);

      await getRecentHistory(10, 'lib-1');

      expect(mockDb.readingHistory.findMany).toHaveBeenCalledWith({
        where: { file: { libraryId: 'lib-1' } },
        orderBy: { startedAt: 'desc' },
        take: 10,
        include: {
          file: {
            select: {
              filename: true,
              relativePath: true,
              libraryId: true,
            },
          },
        },
      });
    });

    it('should use default limit of 20', async () => {
      mockDb.readingHistory.findMany.mockResolvedValue([]);

      await getRecentHistory();

      expect(mockDb.readingHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 })
      );
    });

    it('should return empty array when no history exists', async () => {
      mockDb.readingHistory.findMany.mockResolvedValue([]);

      const result = await getRecentHistory();

      expect(result).toEqual([]);
    });
  });

  describe('getFileHistory', () => {
    it('should return history for a specific file', async () => {
      const fileId = 'file-1';
      const mockSessions = [
        {
          id: 'session-1',
          fileId,
          startedAt: new Date('2024-01-15T10:00:00.000Z'),
          endedAt: new Date('2024-01-15T10:30:00.000Z'),
          startPage: 0,
          endPage: 15,
          pagesRead: 16,
          duration: 1800,
          completed: false,
        },
        {
          id: 'session-2',
          fileId,
          startedAt: new Date('2024-01-14T10:00:00.000Z'),
          endedAt: new Date('2024-01-14T10:45:00.000Z'),
          startPage: 16,
          endPage: 30,
          pagesRead: 15,
          duration: 2700,
          completed: true,
        },
      ];

      mockDb.readingHistory.findMany.mockResolvedValue(mockSessions);

      const result = await getFileHistory(fileId);

      expect(result).toHaveLength(2);
      expect(mockDb.readingHistory.findMany).toHaveBeenCalledWith({
        where: { fileId },
        orderBy: { startedAt: 'desc' },
      });
    });

    it('should return empty array for file with no history', async () => {
      mockDb.readingHistory.findMany.mockResolvedValue([]);

      const result = await getFileHistory('file-with-no-history');

      expect(result).toEqual([]);
    });
  });

  describe('clearFileHistory', () => {
    it('should delete all history for a file', async () => {
      mockDb.readingHistory.deleteMany.mockResolvedValue({ count: 5 });

      await clearFileHistory('file-1');

      expect(mockDb.readingHistory.deleteMany).toHaveBeenCalledWith({
        where: { fileId: 'file-1' },
      });
    });
  });

  describe('clearAllHistory', () => {
    it('should delete all reading history', async () => {
      mockDb.readingHistory.deleteMany.mockResolvedValue({ count: 100 });

      await clearAllHistory();

      expect(mockDb.readingHistory.deleteMany).toHaveBeenCalledWith();
    });
  });

  // ===========================================================================
  // Statistics Tests
  // ===========================================================================

  describe('getStats', () => {
    it('should return daily stats for a date range', async () => {
      const mockStats = [
        {
          date: new Date('2024-01-15T00:00:00.000Z'),
          comicsStarted: 5,
          comicsCompleted: 3,
          pagesRead: 150,
          totalDuration: 7200,
          sessionsCount: 5,
        },
        {
          date: new Date('2024-01-14T00:00:00.000Z'),
          comicsStarted: 3,
          comicsCompleted: 2,
          pagesRead: 100,
          totalDuration: 5400,
          sessionsCount: 3,
        },
      ];

      mockDb.readingStats.findMany.mockResolvedValue(mockStats);

      const result = await getStats(
        new Date('2024-01-14'),
        new Date('2024-01-15')
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2024-01-15',
        comicsStarted: 5,
        comicsCompleted: 3,
        pagesRead: 150,
        totalDuration: 7200,
        sessionsCount: 5,
      });
    });

    it('should return all stats when no date range provided', async () => {
      mockDb.readingStats.findMany.mockResolvedValue([]);

      await getStats();

      expect(mockDb.readingStats.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { date: 'desc' },
      });
    });

    it('should handle only start date provided', async () => {
      mockDb.readingStats.findMany.mockResolvedValue([]);

      const startDate = new Date('2024-01-10');
      await getStats(startDate);

      expect(mockDb.readingStats.findMany).toHaveBeenCalledWith({
        where: { date: { gte: startDate } },
        orderBy: { date: 'desc' },
      });
    });

    it('should handle only end date provided', async () => {
      mockDb.readingStats.findMany.mockResolvedValue([]);

      const endDate = new Date('2024-01-15');
      await getStats(undefined, endDate);

      expect(mockDb.readingStats.findMany).toHaveBeenCalledWith({
        where: { date: { lte: endDate } },
        orderBy: { date: 'desc' },
      });
    });
  });

  describe('getAllTimeStats', () => {
    it('should return comprehensive all-time statistics', async () => {
      // Use dates in the past for streak calculation
      const day1 = new Date('2024-01-15T00:00:00.000Z');
      const day2 = new Date('2024-01-14T00:00:00.000Z');
      const day3 = new Date('2024-01-13T00:00:00.000Z');
      const day4 = new Date('2024-01-12T00:00:00.000Z');
      const day6 = new Date('2024-01-10T00:00:00.000Z'); // Gap on day 5

      mockDb.readingStats.aggregate.mockResolvedValue({
        _sum: {
          comicsCompleted: 50,
          pagesRead: 2500,
          totalDuration: 180000,
          sessionsCount: 100,
        },
      });
      mockDb.readingHistory.groupBy.mockResolvedValue([
        { fileId: 'file-1' },
        { fileId: 'file-2' },
        { fileId: 'file-3' },
      ]);
      mockDb.readingHistory.findFirst.mockResolvedValue({
        duration: 7200,
      });
      // Mock consecutive days for streak calculation (4 consecutive days, then gap, then another day)
      mockDb.readingStats.findMany.mockResolvedValue([
        { date: day1, sessionsCount: 2 },
        { date: day2, sessionsCount: 3 },
        { date: day3, sessionsCount: 1 },
        { date: day4, sessionsCount: 2 },
        // Gap (day 5 has no activity)
        { date: day6, sessionsCount: 1 },
      ]);

      const result = await getAllTimeStats();

      expect(result.totalComicsRead).toBe(3);
      expect(result.totalPagesRead).toBe(2500);
      expect(result.totalReadingTime).toBe(180000);
      expect(result.averageSessionDuration).toBe(1800); // 180000 / 100
      expect(result.longestSession).toBe(7200);
      // Note: currentStreak depends on real "today" vs mock dates
      // longestStreak should be 4 (day1-day4 consecutive)
      expect(result.longestStreak).toBe(4);
      // currentStreak will be 0 since these dates are in the past
      expect(result.currentStreak).toBe(0);
    });

    it('should handle no reading history', async () => {
      mockDb.readingStats.aggregate.mockResolvedValue({
        _sum: {
          comicsCompleted: null,
          pagesRead: null,
          totalDuration: null,
          sessionsCount: null,
        },
      });
      mockDb.readingHistory.groupBy.mockResolvedValue([]);
      mockDb.readingHistory.findFirst.mockResolvedValue(null);
      mockDb.readingStats.findMany.mockResolvedValue([]);

      const result = await getAllTimeStats();

      expect(result).toEqual({
        totalComicsRead: 0,
        totalPagesRead: 0,
        totalReadingTime: 0,
        averageSessionDuration: 0,
        longestSession: 0,
        currentStreak: 0,
        longestStreak: 0,
      });
    });

    it('should calculate current streak as 0 when last activity was more than 1 day ago', async () => {
      // Fake time is 2024-06-15, last activity was 5-7 days ago
      const fiveDaysAgo = new Date('2024-06-10T00:00:00.000Z');
      const sixDaysAgo = new Date('2024-06-09T00:00:00.000Z');
      const sevenDaysAgo = new Date('2024-06-08T00:00:00.000Z');

      mockDb.readingStats.aggregate.mockResolvedValue({
        _sum: {
          comicsCompleted: 10,
          pagesRead: 500,
          totalDuration: 36000,
          sessionsCount: 20,
        },
      });
      mockDb.readingHistory.groupBy.mockResolvedValue([{ fileId: 'file-1' }]);
      mockDb.readingHistory.findFirst.mockResolvedValue({ duration: 3600 });
      // Last activity was 5-7 days ago (no activity in last 1 day)
      mockDb.readingStats.findMany.mockResolvedValue([
        { date: fiveDaysAgo, sessionsCount: 2 },
        { date: sixDaysAgo, sessionsCount: 3 },
        { date: sevenDaysAgo, sessionsCount: 1 },
      ]);

      const result = await getAllTimeStats();

      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(3);
    });

    it('should correctly identify longest streak separate from current streak', async () => {
      // Use past dates - test that longest streak is correctly identified
      const day1 = new Date('2024-01-20T00:00:00.000Z');
      const day2 = new Date('2024-01-19T00:00:00.000Z');
      // Gap at day 3-4
      const day5 = new Date('2024-01-15T00:00:00.000Z');
      const day6 = new Date('2024-01-14T00:00:00.000Z');
      const day7 = new Date('2024-01-13T00:00:00.000Z');
      const day8 = new Date('2024-01-12T00:00:00.000Z');
      const day9 = new Date('2024-01-11T00:00:00.000Z');
      const day10 = new Date('2024-01-10T00:00:00.000Z');

      mockDb.readingStats.aggregate.mockResolvedValue({
        _sum: {
          comicsCompleted: 20,
          pagesRead: 1000,
          totalDuration: 72000,
          sessionsCount: 40,
        },
      });
      mockDb.readingHistory.groupBy.mockResolvedValue([{ fileId: 'file-1' }]);
      mockDb.readingHistory.findFirst.mockResolvedValue({ duration: 3600 });
      // 2 consecutive days, then gap, then 6 consecutive days
      mockDb.readingStats.findMany.mockResolvedValue([
        { date: day1, sessionsCount: 1 },
        { date: day2, sessionsCount: 1 },
        // Gap (days 3-4 have no activity)
        { date: day5, sessionsCount: 2 },
        { date: day6, sessionsCount: 2 },
        { date: day7, sessionsCount: 2 },
        { date: day8, sessionsCount: 2 },
        { date: day9, sessionsCount: 2 },
        { date: day10, sessionsCount: 2 },
      ]);

      const result = await getAllTimeStats();

      // currentStreak is 0 since these dates are all in the past
      expect(result.currentStreak).toBe(0);
      // longestStreak should be 6 (day5-day10 are 6 consecutive days)
      expect(result.longestStreak).toBe(6);
    });

    it('should handle activity only today for streak', async () => {
      // Fake time is 2024-06-15
      const today = new Date('2024-06-15T00:00:00.000Z');

      mockDb.readingStats.aggregate.mockResolvedValue({
        _sum: {
          comicsCompleted: 1,
          pagesRead: 25,
          totalDuration: 1800,
          sessionsCount: 1,
        },
      });
      mockDb.readingHistory.groupBy.mockResolvedValue([{ fileId: 'file-1' }]);
      mockDb.readingHistory.findFirst.mockResolvedValue({ duration: 1800 });
      mockDb.readingStats.findMany.mockResolvedValue([
        { date: today, sessionsCount: 1 },
      ]);

      const result = await getAllTimeStats();

      expect(result.currentStreak).toBe(1);
      expect(result.longestStreak).toBe(1);
    });
  });
});
