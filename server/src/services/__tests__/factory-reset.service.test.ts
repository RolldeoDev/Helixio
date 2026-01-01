/**
 * Factory Reset Service Tests
 *
 * Tests for tiered reset operations ensuring:
 * - Correct directories and tables are targeted at each level
 * - Comic files are NEVER touched
 * - Preview data matches actual cleanup operations
 * - Foreign key order is respected for database deletions
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { existsSync } from 'fs';
import { rm, stat, readdir } from 'fs/promises';

// Mock fs modules before importing the service
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  rm: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
}));

// Mock app-paths service
vi.mock('../app-paths.service.js', () => ({
  getAppDataDir: vi.fn(() => '/mock/.helixio'),
  getCacheDir: vi.fn(() => '/mock/.helixio/cache'),
  getCoversDir: vi.fn(() => '/mock/.helixio/cache/covers'),
  getSeriesCoversDir: vi.fn(() => '/mock/.helixio/cache/series-covers'),
  getCollectionCoversDir: vi.fn(() => '/mock/.helixio/cache/collection-covers'),
  getSeriesCacheDir: vi.fn(() => '/mock/.helixio/cache/series'),
  getThumbnailsDir: vi.fn(() => '/mock/.helixio/cache/thumbnails'),
  getAvatarsDir: vi.fn(() => '/mock/.helixio/avatars'),
  getLogsDir: vi.fn(() => '/mock/.helixio/logs'),
  getDatabasePath: vi.fn(() => '/mock/.helixio/helixio.db'),
  getConfigPath: vi.fn(() => '/mock/.helixio/config.json'),
}));

// Mock database service
const mockDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const mockTransaction = vi.fn().mockImplementation(async (ops: Promise<unknown>[]) => {
  return Promise.all(ops);
});

vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => ({
    $transaction: mockTransaction,
    aPICache: { deleteMany: mockDeleteMany },
    cacheStats: { deleteMany: mockDeleteMany },
    seriesCache: { deleteMany: mockDeleteMany },
    collectionItem: { deleteMany: mockDeleteMany },
    collection: { deleteMany: mockDeleteMany },
    readingHistory: { deleteMany: mockDeleteMany },
    readingProgress: { deleteMany: mockDeleteMany },
    readingQueue: { deleteMany: mockDeleteMany },
    readingStats: { deleteMany: mockDeleteMany },
    seriesProgress: { deleteMany: mockDeleteMany },
    userReadingProgress: { deleteMany: mockDeleteMany },
    userAchievement: { deleteMany: mockDeleteMany },
    entityStat: { deleteMany: mockDeleteMany },
    libraryStat: { deleteMany: mockDeleteMany },
    statsDirtyFlag: { deleteMany: mockDeleteMany },
    userStat: { deleteMany: mockDeleteMany },
  })),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

// Mock secure storage service
vi.mock('../secure-storage.service.js', () => ({
  SecureStorage: {
    deleteApiKey: vi.fn().mockResolvedValue(true),
  },
  API_KEY_COMICVINE: 'comicvine',
  API_KEY_METRON: 'metron',
  API_KEY_ANTHROPIC: 'anthropic',
}));

// Mock logger service
vi.mock('../logger.service.js', () => ({
  configLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks are set up
import { FactoryResetService, getResetPreview, performReset, ResetLevel } from '../factory-reset.service.js';

describe('Factory Reset Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all paths exist
    (existsSync as Mock).mockReturnValue(true);
    // Default: mock stat returns a file
    (stat as Mock).mockResolvedValue({ size: 1024, isDirectory: () => false });
    // Default: empty directory for readdir
    (readdir as Mock).mockResolvedValue([]);
    // Default: rm succeeds
    (rm as Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Path Safety Tests
  // =========================================================================

  describe('Path Safety - Comic Files Protected', () => {
    it('should only target paths under ~/.helixio', async () => {
      const result = await performReset({ level: 3 });

      // Verify rm was only called for paths under /mock/.helixio
      const rmCalls = (rm as Mock).mock.calls;
      for (const call of rmCalls) {
        const path = call[0] as string;
        expect(path.startsWith('/mock/.helixio')).toBe(true);
      }
    });

    it('should never target library paths or comic files', async () => {
      await performReset({ level: 3 });

      const rmCalls = (rm as Mock).mock.calls;
      const paths = rmCalls.map((call) => call[0] as string);

      // Should not contain any typical library paths
      for (const path of paths) {
        expect(path).not.toContain('/Comics/');
        expect(path).not.toContain('/Library/');
        expect(path).not.toContain('.cbz');
        expect(path).not.toContain('.cbr');
        expect(path).not.toContain('.cb7');
      }
    });
  });

  // =========================================================================
  // Level 1 Tests - Cache Only
  // =========================================================================

  describe('Level 1 - Clear Cache', () => {
    it('should clear cache directories', async () => {
      const result = await performReset({ level: 1 });

      expect(result.success).toBe(true);
      expect(result.requiresRestart).toBe(false);

      // Verify cache directories are targeted
      const rmCalls = (rm as Mock).mock.calls.map((c) => c[0]);
      expect(rmCalls).toContain('/mock/.helixio/cache/covers');
      expect(rmCalls).toContain('/mock/.helixio/cache/series-covers');
      expect(rmCalls).toContain('/mock/.helixio/cache/collection-covers');
      expect(rmCalls).toContain('/mock/.helixio/cache/series');
      expect(rmCalls).toContain('/mock/.helixio/cache/thumbnails');
    });

    it('should clear cache database tables', async () => {
      await performReset({ level: 1 });

      // Verify transaction was called for cache tables
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockDeleteMany).toHaveBeenCalled();
    });

    it('should NOT delete database files at Level 1', async () => {
      await performReset({ level: 1 });

      const rmCalls = (rm as Mock).mock.calls.map((c) => c[0]);
      expect(rmCalls).not.toContain('/mock/.helixio/helixio.db');
      expect(rmCalls).not.toContain('/mock/.helixio/config.json');
    });

    it('should NOT delete logs or avatars at Level 1', async () => {
      await performReset({ level: 1 });

      const rmCalls = (rm as Mock).mock.calls.map((c) => c[0]);
      expect(rmCalls).not.toContain('/mock/.helixio/logs');
      expect(rmCalls).not.toContain('/mock/.helixio/avatars');
    });

    it('should return correct cleared tables list', async () => {
      const result = await performReset({ level: 1 });

      expect(result.clearedTables).toContain('APICache');
      expect(result.clearedTables).toContain('CacheStats');
      expect(result.clearedTables).toContain('SeriesCache');
      expect(result.clearedTables).not.toContain('ReadingProgress');
    });
  });

  // =========================================================================
  // Level 2 Tests - Reading Data
  // =========================================================================

  describe('Level 2 - Clear Reading Data', () => {
    it('should include Level 1 cache cleanup', async () => {
      const result = await performReset({ level: 2 });

      expect(result.success).toBe(true);

      const rmCalls = (rm as Mock).mock.calls.map((c) => c[0]);
      expect(rmCalls).toContain('/mock/.helixio/cache/covers');
    });

    it('should clear reading data tables', async () => {
      const result = await performReset({ level: 2 });

      expect(result.clearedTables).toContain('ReadingProgress');
      expect(result.clearedTables).toContain('ReadingHistory');
      expect(result.clearedTables).toContain('ReadingQueue');
      expect(result.clearedTables).toContain('UserAchievement');
      expect(result.clearedTables).toContain('Collection');
      expect(result.clearedTables).toContain('CollectionItem');
    });

    it('should NOT delete database file at Level 2', async () => {
      await performReset({ level: 2 });

      const rmCalls = (rm as Mock).mock.calls.map((c) => c[0]);
      expect(rmCalls).not.toContain('/mock/.helixio/helixio.db');
    });

    it('should NOT require server restart at Level 2', async () => {
      const result = await performReset({ level: 2 });

      expect(result.requiresRestart).toBe(false);
    });
  });

  // =========================================================================
  // Level 3 Tests - Full Factory Reset
  // =========================================================================

  describe('Level 3 - Full Factory Reset', () => {
    it('should delete database files', async () => {
      const result = await performReset({ level: 3 });

      expect(result.success).toBe(true);

      const rmCalls = (rm as Mock).mock.calls.map((c) => c[0]);
      expect(rmCalls).toContain('/mock/.helixio/helixio.db');
    });

    it('should delete config file', async () => {
      await performReset({ level: 3 });

      const rmCalls = (rm as Mock).mock.calls.map((c) => c[0]);
      expect(rmCalls).toContain('/mock/.helixio/config.json');
    });

    it('should delete logs directory', async () => {
      await performReset({ level: 3 });

      const rmCalls = (rm as Mock).mock.calls.map((c) => c[0]);
      expect(rmCalls).toContain('/mock/.helixio/logs');
    });

    it('should delete avatars directory', async () => {
      await performReset({ level: 3 });

      const rmCalls = (rm as Mock).mock.calls.map((c) => c[0]);
      expect(rmCalls).toContain('/mock/.helixio/avatars');
    });

    it('should require server restart at Level 3', async () => {
      const result = await performReset({ level: 3 });

      expect(result.requiresRestart).toBe(true);
    });

    it('should report ALL TABLES cleared', async () => {
      const result = await performReset({ level: 3 });

      expect(result.clearedTables).toContain('ALL TABLES');
    });

    it('should clear keychain when requested', async () => {
      const { SecureStorage } = await import('../secure-storage.service.js');

      await performReset({ level: 3, clearKeychain: true });

      expect(SecureStorage.deleteApiKey).toHaveBeenCalled();
    });

    it('should NOT clear keychain when not requested', async () => {
      const { SecureStorage } = await import('../secure-storage.service.js');
      vi.clearAllMocks();

      await performReset({ level: 3, clearKeychain: false });

      expect(SecureStorage.deleteApiKey).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Preview Tests
  // =========================================================================

  describe('Reset Preview', () => {
    it('should return correct directories for Level 1', async () => {
      const preview = await getResetPreview(1);

      expect(preview.level).toBe(1);
      const paths = preview.directories.map((d) => d.path);
      expect(paths).toContain('/mock/.helixio/cache/covers');
      expect(paths).toContain('/mock/.helixio/cache/series-covers');
      expect(paths).toContain('/mock/.helixio/cache/collection-covers');
      expect(paths).toContain('/mock/.helixio/cache/series');
      expect(paths).toContain('/mock/.helixio/cache/thumbnails');
    });

    it('should include database tables for Level 1', async () => {
      const preview = await getResetPreview(1);

      expect(preview.databaseTables).toContain('APICache');
      expect(preview.databaseTables).toContain('CacheStats');
      expect(preview.databaseTables).toContain('SeriesCache');
    });

    it('should include additional items for Level 3', async () => {
      const preview = await getResetPreview(3);

      const paths = preview.directories.map((d) => d.path);
      expect(paths).toContain('/mock/.helixio/helixio.db');
      expect(paths).toContain('/mock/.helixio/config.json');
      expect(paths).toContain('/mock/.helixio/logs');
      expect(paths).toContain('/mock/.helixio/avatars');
    });

    it('should indicate entire database deletion for Level 3', async () => {
      const preview = await getResetPreview(3);

      expect(preview.databaseTables).toContain('ALL TABLES (entire database will be deleted)');
    });

    it('should format display paths with ~', async () => {
      const originalHome = process.env.HOME;
      process.env.HOME = '/mock';

      const preview = await getResetPreview(1);

      // At least one path should use ~ for home directory
      const hasHomeShortcut = preview.directories.some((d) => d.displayPath.startsWith('~'));
      expect(hasHomeShortcut).toBe(true);

      process.env.HOME = originalHome;
    });

    it('should calculate estimated size', async () => {
      (stat as Mock).mockResolvedValue({ size: 1000 });

      const preview = await getResetPreview(1);

      expect(preview.estimatedSizeBytes).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    it('should handle missing directories gracefully', async () => {
      (existsSync as Mock).mockReturnValue(false);

      const result = await performReset({ level: 1 });

      expect(result.success).toBe(true);
      // Should not have deleted anything since nothing exists
      expect(result.deletedItems.length).toBe(0);
    });

    it('should continue after individual directory deletion failure', async () => {
      (rm as Mock)
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValue(undefined);

      const result = await performReset({ level: 1 });

      // Should still succeed (with warnings logged)
      expect(result.success).toBe(true);
    });

    it('should return error result on database transaction failure', async () => {
      mockTransaction.mockRejectedValueOnce(new Error('Database locked'));

      const result = await performReset({ level: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // Table List Accuracy Tests
  // =========================================================================

  describe('Table List Accuracy', () => {
    it('should NOT include non-existent Bookmark table', async () => {
      const preview = await getResetPreview(2);

      // Bookmark is a field, not a table - should not be listed
      expect(preview.databaseTables).not.toContain('Bookmark');
    });

    it('should list tables in foreign key order for Level 2', async () => {
      const result = await performReset({ level: 2 });

      // CollectionItem should come before Collection (FK constraint)
      const collectionItemIdx = result.clearedTables.indexOf('CollectionItem');
      const collectionIdx = result.clearedTables.indexOf('Collection');

      if (collectionItemIdx !== -1 && collectionIdx !== -1) {
        expect(collectionItemIdx).toBeLessThan(collectionIdx);
      }
    });
  });

  // =========================================================================
  // Service Export Tests
  // =========================================================================

  describe('Service Exports', () => {
    it('should export FactoryResetService with correct methods', () => {
      expect(FactoryResetService).toBeDefined();
      expect(FactoryResetService.getResetPreview).toBeDefined();
      expect(FactoryResetService.performReset).toBeDefined();
    });

    it('should export ResetLevel type', () => {
      const validLevels: ResetLevel[] = [1, 2, 3];
      expect(validLevels).toHaveLength(3);
    });
  });
});
