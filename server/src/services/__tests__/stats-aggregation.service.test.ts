/**
 * Stats Aggregation Service Tests
 *
 * Tests for computing and caching library, user, and entity stats.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

vi.mock('../stats-dirty.service.js', () => ({
  getUniqueDirtyScopes: vi.fn().mockResolvedValue({
    libraries: [],
    entities: [],
    userDirty: false,
  }),
  clearAllDirtyFlags: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../logger.service.js', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logDebug: vi.fn(),
  createServiceLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

import { getDatabase } from '../database.service.js';
import { getUniqueDirtyScopes, clearAllDirtyFlags } from '../stats-dirty.service.js';
import {
  computeLibraryStats,
  computeUserStats,
  computeEntityStats,
  fullRebuild,
  processDirtyStats,
} from '../stats-aggregation.service.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('StatsAggregationService', () => {
  let mockDb: {
    comicFile: {
      findMany: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    readingHistory: {
      aggregate: ReturnType<typeof vi.fn>;
    };
    readingStats: {
      findMany: ReturnType<typeof vi.fn>;
    };
    libraryStat: {
      upsert: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    userStat: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    entityStat: {
      deleteMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
    library: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  const createMockFile = (overrides: Partial<{
    id: string;
    seriesId: string;
    metadata: {
      pageCount: number;
      publisher?: string;
      genre?: string;
      characters?: string;
      teams?: string;
      writer?: string;
      penciller?: string;
    } | null;
    readingProgress: {
      completed: boolean;
      currentPage: number;
      totalPages: number;
    } | null;
    readingHistory: Array<{ duration: number }>;
  }> = {}) => ({
    id: 'file-1',
    seriesId: 'series-1',
    metadata: {
      pageCount: 25,
      publisher: 'DC Comics',
      genre: 'Superhero, Action',
      characters: 'Batman, Robin',
      teams: 'Justice League',
      writer: 'Grant Morrison',
      penciller: 'Frank Quitely',
    },
    readingProgress: null,
    readingHistory: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      comicFile: {
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      readingHistory: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { duration: 0 } }),
      },
      readingStats: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      libraryStat: {
        upsert: vi.fn().mockResolvedValue({}),
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            totalFiles: 0,
            totalSeries: 0,
            totalPages: 0,
            filesRead: 0,
            filesInProgress: 0,
            pagesRead: 0,
            readingTime: 0,
          },
        }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      userStat: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      entityStat: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      library: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);
  });

  // ===========================================================================
  // Library Stats Tests
  // ===========================================================================

  describe('computeLibraryStats', () => {
    it('should compute stats for empty library', async () => {
      mockDb.comicFile.findMany.mockResolvedValue([]);
      mockDb.comicFile.groupBy.mockResolvedValue([]);

      await computeLibraryStats('lib-1');

      expect(mockDb.libraryStat.upsert).toHaveBeenCalledWith({
        where: { libraryId: 'lib-1' },
        create: expect.objectContaining({
          libraryId: 'lib-1',
          totalFiles: 0,
          totalSeries: 0,
          totalPages: 0,
          filesRead: 0,
          filesInProgress: 0,
          filesUnread: 0,
        }),
        update: expect.any(Object),
      });
    });

    it('should count total files and pages', async () => {
      const files = [
        createMockFile({ id: 'file-1', metadata: { pageCount: 25 } }),
        createMockFile({ id: 'file-2', metadata: { pageCount: 30 } }),
        createMockFile({ id: 'file-3', metadata: { pageCount: 20 } }),
      ];

      mockDb.comicFile.findMany.mockResolvedValue(files);
      mockDb.comicFile.groupBy.mockResolvedValue([{ seriesId: 'series-1' }]);

      await computeLibraryStats('lib-1');

      expect(mockDb.libraryStat.upsert).toHaveBeenCalledWith({
        where: { libraryId: 'lib-1' },
        create: expect.objectContaining({
          totalFiles: 3,
          totalPages: 75, // 25 + 30 + 20
          totalSeries: 1,
          filesWithMetadata: 3,
        }),
        update: expect.any(Object),
      });
    });

    it('should count read and in-progress files', async () => {
      const files = [
        createMockFile({
          id: 'file-1',
          metadata: { pageCount: 25 },
          readingProgress: { completed: true, currentPage: 25, totalPages: 25 },
        }),
        createMockFile({
          id: 'file-2',
          metadata: { pageCount: 30 },
          readingProgress: { completed: false, currentPage: 15, totalPages: 30 },
        }),
        createMockFile({
          id: 'file-3',
          metadata: { pageCount: 20 },
          readingProgress: null,
        }),
      ];

      mockDb.comicFile.findMany.mockResolvedValue(files);
      mockDb.comicFile.groupBy.mockResolvedValue([]);

      await computeLibraryStats('lib-1');

      expect(mockDb.libraryStat.upsert).toHaveBeenCalledWith({
        where: { libraryId: 'lib-1' },
        create: expect.objectContaining({
          filesRead: 1,
          filesInProgress: 1,
          filesUnread: 1,
          pagesRead: 40, // 25 (completed) + 15 (in progress)
        }),
        update: expect.any(Object),
      });
    });

    it('should include reading time from history', async () => {
      mockDb.comicFile.findMany.mockResolvedValue([createMockFile()]);
      mockDb.readingHistory.aggregate.mockResolvedValue({
        _sum: { duration: 3600 },
      });

      await computeLibraryStats('lib-1');

      expect(mockDb.libraryStat.upsert).toHaveBeenCalledWith({
        where: { libraryId: 'lib-1' },
        create: expect.objectContaining({
          readingTime: 3600,
        }),
        update: expect.any(Object),
      });
    });

    it('should count unique series', async () => {
      mockDb.comicFile.findMany.mockResolvedValue([]);
      mockDb.comicFile.groupBy.mockResolvedValue([
        { seriesId: 'series-1' },
        { seriesId: 'series-2' },
        { seriesId: 'series-3' },
      ]);

      await computeLibraryStats('lib-1');

      expect(mockDb.libraryStat.upsert).toHaveBeenCalledWith({
        where: { libraryId: 'lib-1' },
        create: expect.objectContaining({
          totalSeries: 3,
        }),
        update: expect.any(Object),
      });
    });
  });

  // ===========================================================================
  // User Stats Tests
  // ===========================================================================

  describe('computeUserStats', () => {
    it('should create new user stats if none exist', async () => {
      mockDb.libraryStat.aggregate.mockResolvedValue({
        _sum: {
          totalFiles: 100,
          totalSeries: 10,
          totalPages: 2500,
          filesRead: 50,
          filesInProgress: 10,
          pagesRead: 1500,
          readingTime: 36000,
        },
      });
      mockDb.userStat.findFirst.mockResolvedValue(null);

      await computeUserStats();

      expect(mockDb.userStat.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          totalFiles: 100,
          totalSeries: 10,
          totalPages: 2500,
          filesRead: 50,
          filesInProgress: 10,
          pagesRead: 1500,
          readingTime: 36000,
        }),
      });
    });

    it('should update existing user stats', async () => {
      mockDb.libraryStat.aggregate.mockResolvedValue({
        _sum: {
          totalFiles: 200,
          totalSeries: 20,
          totalPages: 5000,
          filesRead: 100,
          filesInProgress: 20,
          pagesRead: 3000,
          readingTime: 72000,
        },
      });
      mockDb.userStat.findFirst.mockResolvedValue({ id: 'user-stat-1' });

      await computeUserStats();

      expect(mockDb.userStat.update).toHaveBeenCalledWith({
        where: { id: 'user-stat-1' },
        data: expect.objectContaining({
          totalFiles: 200,
          totalSeries: 20,
        }),
      });
      expect(mockDb.userStat.create).not.toHaveBeenCalled();
    });

    it('should include streak calculations', async () => {
      // Set up reading stats for streak calculation
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      mockDb.readingStats.findMany.mockResolvedValue([
        { date: today, sessionsCount: 2 },
        { date: yesterday, sessionsCount: 1 },
      ]);
      mockDb.userStat.findFirst.mockResolvedValue(null);

      await computeUserStats();

      expect(mockDb.userStat.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          currentStreak: expect.any(Number),
          longestStreak: expect.any(Number),
        }),
      });
    });
  });

  // ===========================================================================
  // Entity Stats Tests
  // ===========================================================================

  describe('computeEntityStats', () => {
    it('should compute publisher stats', async () => {
      const files = [
        createMockFile({
          id: 'file-1',
          metadata: { pageCount: 25, publisher: 'DC Comics' },
        }),
        createMockFile({
          id: 'file-2',
          metadata: { pageCount: 30, publisher: 'DC Comics' },
        }),
        createMockFile({
          id: 'file-3',
          metadata: { pageCount: 20, publisher: 'Marvel' },
        }),
      ];

      mockDb.comicFile.findMany.mockResolvedValue(files);

      await computeEntityStats('publisher', 'lib-1');

      expect(mockDb.entityStat.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            entityType: 'publisher',
            entityName: 'DC Comics',
            ownedComics: 2,
          }),
          expect.objectContaining({
            entityType: 'publisher',
            entityName: 'Marvel',
            ownedComics: 1,
          }),
        ]),
      });
    });

    it('should compute genre stats with comma-separated values', async () => {
      const files = [
        createMockFile({
          id: 'file-1',
          metadata: { pageCount: 25, genre: 'Superhero, Action' },
        }),
        createMockFile({
          id: 'file-2',
          metadata: { pageCount: 30, genre: 'Action, Comedy' },
        }),
      ];

      mockDb.comicFile.findMany.mockResolvedValue(files);

      await computeEntityStats('genre', 'lib-1');

      expect(mockDb.entityStat.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ entityName: 'Superhero', ownedComics: 1 }),
          expect.objectContaining({ entityName: 'Action', ownedComics: 2 }),
          expect.objectContaining({ entityName: 'Comedy', ownedComics: 1 }),
        ]),
      });
    });

    it('should compute character stats', async () => {
      const files = [
        createMockFile({
          id: 'file-1',
          metadata: { pageCount: 25, characters: 'Batman, Robin' },
        }),
      ];

      mockDb.comicFile.findMany.mockResolvedValue(files);

      await computeEntityStats('character', 'lib-1');

      expect(mockDb.entityStat.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ entityName: 'Batman' }),
          expect.objectContaining({ entityName: 'Robin' }),
        ]),
      });
    });

    it('should compute team stats', async () => {
      const files = [
        createMockFile({
          id: 'file-1',
          metadata: { pageCount: 25, teams: 'Justice League' },
        }),
        createMockFile({
          id: 'file-2',
          metadata: { pageCount: 30, teams: 'Justice League, Teen Titans' },
        }),
      ];

      mockDb.comicFile.findMany.mockResolvedValue(files);

      await computeEntityStats('team', 'lib-1');

      expect(mockDb.entityStat.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ entityName: 'Justice League', ownedComics: 2 }),
          expect.objectContaining({ entityName: 'Teen Titans', ownedComics: 1 }),
        ]),
      });
    });

    it('should compute creator stats with roles', async () => {
      const files = [
        createMockFile({
          id: 'file-1',
          metadata: {
            pageCount: 25,
            writer: 'Grant Morrison',
            penciller: 'Frank Quitely',
          },
        }),
      ];

      mockDb.comicFile.findMany.mockResolvedValue(files);

      await computeEntityStats('creator', 'lib-1');

      expect(mockDb.entityStat.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            entityName: 'Grant Morrison',
            entityRole: 'writer',
          }),
          expect.objectContaining({
            entityName: 'Frank Quitely',
            entityRole: 'penciller',
          }),
        ]),
      });
    });

    it('should track read comics and pages', async () => {
      const files = [
        createMockFile({
          id: 'file-1',
          metadata: { pageCount: 25, publisher: 'DC Comics' },
          readingProgress: { completed: true, currentPage: 25, totalPages: 25 },
          readingHistory: [{ duration: 1800 }],
        }),
        createMockFile({
          id: 'file-2',
          metadata: { pageCount: 30, publisher: 'DC Comics' },
          readingProgress: null,
        }),
      ];

      mockDb.comicFile.findMany.mockResolvedValue(files);

      await computeEntityStats('publisher', 'lib-1');

      expect(mockDb.entityStat.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            entityName: 'DC Comics',
            ownedComics: 2,
            readComics: 1,
            readPages: 25,
            readTime: 1800,
          }),
        ]),
      });
    });

    it('should delete existing stats before creating new ones', async () => {
      mockDb.comicFile.findMany.mockResolvedValue([]);

      await computeEntityStats('publisher', 'lib-1');

      expect(mockDb.entityStat.deleteMany).toHaveBeenCalledWith({
        where: {
          entityType: 'publisher',
          libraryId: 'lib-1',
        },
      });
    });

    it('should not create stats for empty entities', async () => {
      mockDb.comicFile.findMany.mockResolvedValue([
        createMockFile({ metadata: null }),
      ]);

      await computeEntityStats('publisher', 'lib-1');

      expect(mockDb.entityStat.createMany).not.toHaveBeenCalled();
    });

    it('should compute user-level stats when libraryId is undefined', async () => {
      mockDb.comicFile.findMany.mockResolvedValue([
        createMockFile({ metadata: { pageCount: 25, publisher: 'DC Comics' } }),
      ]);

      await computeEntityStats('publisher');

      expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'indexed' },
        })
      );
      expect(mockDb.entityStat.deleteMany).toHaveBeenCalledWith({
        where: {
          entityType: 'publisher',
          libraryId: null,
        },
      });
    });
  });

  // ===========================================================================
  // Full Rebuild Tests
  // ===========================================================================

  describe('fullRebuild', () => {
    it('should clear existing stats', async () => {
      mockDb.library.findMany.mockResolvedValue([]);

      await fullRebuild();

      expect(mockDb.entityStat.deleteMany).toHaveBeenCalled();
      expect(mockDb.libraryStat.deleteMany).toHaveBeenCalled();
      expect(clearAllDirtyFlags).toHaveBeenCalled();
    });

    it('should rebuild stats for all libraries', async () => {
      mockDb.library.findMany.mockResolvedValue([
        { id: 'lib-1', name: 'Library 1' },
        { id: 'lib-2', name: 'Library 2' },
      ]);
      mockDb.comicFile.findMany.mockResolvedValue([]);
      mockDb.comicFile.groupBy.mockResolvedValue([]);

      await fullRebuild();

      // Should compute library stats for each library
      expect(mockDb.libraryStat.upsert).toHaveBeenCalledTimes(2);
    });

    it('should compute user-level stats after library stats', async () => {
      mockDb.library.findMany.mockResolvedValue([
        { id: 'lib-1', name: 'Library 1' },
      ]);
      mockDb.comicFile.findMany.mockResolvedValue([]);
      mockDb.comicFile.groupBy.mockResolvedValue([]);
      mockDb.userStat.findFirst.mockResolvedValue(null);

      await fullRebuild();

      expect(mockDb.userStat.create).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Incremental Update Tests
  // ===========================================================================

  describe('processDirtyStats', () => {
    it('should return 0 processed when nothing is dirty', async () => {
      vi.mocked(getUniqueDirtyScopes).mockResolvedValue({
        libraries: [],
        entities: [],
        userDirty: false,
      });

      const result = await processDirtyStats();

      expect(result.processed).toBe(0);
    });

    it('should process dirty libraries', async () => {
      vi.mocked(getUniqueDirtyScopes).mockResolvedValue({
        libraries: ['lib-1', 'lib-2'],
        entities: [],
        userDirty: false,
      });
      mockDb.comicFile.findMany.mockResolvedValue([]);
      mockDb.comicFile.groupBy.mockResolvedValue([]);
      mockDb.userStat.findFirst.mockResolvedValue(null);

      const result = await processDirtyStats();

      expect(result.processed).toBeGreaterThan(0);
      expect(mockDb.libraryStat.upsert).toHaveBeenCalledTimes(2);
    });

    it('should process dirty entities', async () => {
      vi.mocked(getUniqueDirtyScopes).mockResolvedValue({
        libraries: [],
        entities: [{ entityType: 'publisher', entityName: 'DC Comics', libraryId: null }],
        userDirty: false,
      });
      mockDb.comicFile.findMany.mockResolvedValue([]);

      const result = await processDirtyStats();

      expect(result.processed).toBeGreaterThan(0);
      expect(mockDb.entityStat.deleteMany).toHaveBeenCalled();
    });

    it('should process user dirty flag', async () => {
      vi.mocked(getUniqueDirtyScopes).mockResolvedValue({
        libraries: [],
        entities: [],
        userDirty: true,
      });
      mockDb.userStat.findFirst.mockResolvedValue(null);

      const result = await processDirtyStats();

      expect(result.processed).toBeGreaterThan(0);
      expect(mockDb.userStat.create).toHaveBeenCalled();
    });

    it('should clear dirty flags after processing', async () => {
      vi.mocked(getUniqueDirtyScopes).mockResolvedValue({
        libraries: ['lib-1'],
        entities: [],
        userDirty: false,
      });
      mockDb.comicFile.findMany.mockResolvedValue([]);
      mockDb.comicFile.groupBy.mockResolvedValue([]);
      mockDb.userStat.findFirst.mockResolvedValue(null);

      await processDirtyStats();

      expect(clearAllDirtyFlags).toHaveBeenCalled();
    });

    it('should recompute user stats when libraries are dirty', async () => {
      vi.mocked(getUniqueDirtyScopes).mockResolvedValue({
        libraries: ['lib-1'],
        entities: [],
        userDirty: false,
      });
      mockDb.comicFile.findMany.mockResolvedValue([]);
      mockDb.comicFile.groupBy.mockResolvedValue([]);
      mockDb.userStat.findFirst.mockResolvedValue({ id: 'user-stat-1' });

      await processDirtyStats();

      // Should update user stats because library changed
      expect(mockDb.userStat.update).toHaveBeenCalled();
    });
  });
});
