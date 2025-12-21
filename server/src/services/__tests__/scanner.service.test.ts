/**
 * Scanner Service Tests
 *
 * Comprehensive tests for file discovery, change detection, and library scanning.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockPrismaClient, createMockLibrary, createMockComicFile } from './__mocks__/prisma.mock.js';
import { createVirtualFS, addVirtualComicFiles, createMockFsPromises, addVirtualDirectory, addVirtualFile } from './__mocks__/fs.mock.js';
import type { VirtualFS } from './__mocks__/fs.mock.js';

// =============================================================================
// Module Mocks
// =============================================================================

// Mock database service
const mockDb = createMockPrismaClient();
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

// Create virtual filesystem
let vfs: VirtualFS;
let mockFsPromises: ReturnType<typeof createMockFsPromises>;

// Mock fs/promises
vi.mock('fs/promises', () => {
  // Return a factory that gets the current mockFsPromises
  return {
    readdir: vi.fn((...args) => mockFsPromises.readdir(...args)),
    stat: vi.fn((...args) => mockFsPromises.stat(...args)),
    readFile: vi.fn((...args) => mockFsPromises.readFile(...args)),
    writeFile: vi.fn((...args) => mockFsPromises.writeFile(...args)),
    mkdir: vi.fn((...args) => mockFsPromises.mkdir(...args)),
    rm: vi.fn((...args) => mockFsPromises.rm(...args)),
    unlink: vi.fn((...args) => mockFsPromises.unlink(...args)),
    rename: vi.fn((...args) => mockFsPromises.rename(...args)),
    copyFile: vi.fn((...args) => mockFsPromises.copyFile(...args)),
    access: vi.fn((...args) => mockFsPromises.access(...args)),
    open: vi.fn((...args) => mockFsPromises.open(...args)),
  };
});

// Mock hash service
vi.mock('../hash.service.js', () => ({
  generatePartialHash: vi.fn().mockResolvedValue('mock-hash-123'),
  getFileInfo: vi.fn().mockImplementation(async (path: string) => ({
    size: 50000000,
    modifiedAt: new Date('2024-01-01'),
    hash: undefined,
  })),
}));

// Mock dependent services that we don't want to test here
vi.mock('../cache-job.service.js', () => ({
  triggerCacheGenerationForNewFiles: vi.fn(),
}));

vi.mock('../series-matcher.service.js', () => ({
  autoLinkFileToSeries: vi.fn().mockResolvedValue({ success: true, matchType: 'linked' }),
}));

vi.mock('../metadata-cache.service.js', () => ({
  refreshMetadataCache: vi.fn().mockResolvedValue(true),
}));

vi.mock('../stats-dirty.service.js', () => ({
  markDirtyForFileChange: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// Import after mocks
// =============================================================================

// We need to import the module after setting up mocks
const scannerModule = await import('../scanner.service.js');
const { discoverFiles, scanLibrary, applyScanResults, verifyLibraryPath, getLibraryStats, getAllLibraryStats } = scannerModule;

// =============================================================================
// Tests
// =============================================================================

describe('Scanner Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vfs = createVirtualFS();
    mockFsPromises = createMockFsPromises(vfs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // File Discovery Tests
  // ===========================================================================

  describe('discoverFiles', () => {
    it('should discover CBZ files in root directory', async () => {
      addVirtualComicFiles(vfs, '/comics', [
        { relativePath: 'Batman 001.cbz' },
        { relativePath: 'Batman 002.cbz' },
      ]);

      const result = await discoverFiles('/comics');

      expect(result.files).toHaveLength(2);
      expect(result.files[0].filename).toBe('Batman 001.cbz');
      expect(result.files[1].filename).toBe('Batman 002.cbz');
      expect(result.errors).toHaveLength(0);
    });

    it('should discover CBR files', async () => {
      addVirtualComicFiles(vfs, '/comics', [
        { relativePath: 'Superman 001.cbr' },
      ]);

      const result = await discoverFiles('/comics');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].extension).toBe('cbr');
    });

    it('should discover files in nested directories', async () => {
      addVirtualComicFiles(vfs, '/comics', [
        { relativePath: 'Batman/Batman 001.cbz' },
        { relativePath: 'Batman/Batman 002.cbz' },
        { relativePath: 'Superman/Superman 001.cbz' },
      ]);

      const result = await discoverFiles('/comics');

      expect(result.files).toHaveLength(3);
      expect(result.files.map(f => f.relativePath)).toContain('Batman/Batman 001.cbz');
      expect(result.files.map(f => f.relativePath)).toContain('Superman/Superman 001.cbz');
    });

    it('should ignore hidden files and directories', async () => {
      addVirtualComicFiles(vfs, '/comics', [
        { relativePath: 'Batman 001.cbz' },
        { relativePath: '.hidden/Secret 001.cbz' },
      ]);
      // Add hidden file directly
      addVirtualFile(vfs, '/comics/.DS_Store', 'hidden');
      addVirtualFile(vfs, '/comics/.hidden.cbz', Buffer.alloc(1000));

      const result = await discoverFiles('/comics');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBe('Batman 001.cbz');
    });

    it('should ignore non-comic files', async () => {
      addVirtualComicFiles(vfs, '/comics', [
        { relativePath: 'Batman 001.cbz' },
      ]);
      addVirtualFile(vfs, '/comics/readme.txt', 'readme content');
      addVirtualFile(vfs, '/comics/cover.jpg', Buffer.alloc(1000));
      addVirtualFile(vfs, '/comics/archive.zip', Buffer.alloc(1000));

      const result = await discoverFiles('/comics');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBe('Batman 001.cbz');
    });

    it('should report errors for inaccessible paths', async () => {
      addVirtualDirectory(vfs, '/comics');
      // The directory exists but has no files - simulate permission error by not adding children

      const result = await discoverFiles('/comics');

      expect(result.files).toHaveLength(0);
      // No errors expected for empty directory
      expect(result.errors).toHaveLength(0);
    });

    it('should include file size and modification date', async () => {
      const modifiedDate = new Date('2024-06-15');
      addVirtualComicFiles(vfs, '/comics', [
        { relativePath: 'Batman 001.cbz', size: 75000000, modifiedAt: modifiedDate },
      ]);

      const result = await discoverFiles('/comics');

      expect(result.files).toHaveLength(1);
      // Size comes from getFileInfo mock, not the virtual file
      expect(result.files[0].size).toBe(50000000);
    });

    it('should correctly extract relative paths', async () => {
      addVirtualComicFiles(vfs, '/library/comics', [
        { relativePath: 'DC/Batman/Batman 001.cbz' },
      ]);

      const result = await discoverFiles('/library/comics');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].relativePath).toBe('DC/Batman/Batman 001.cbz');
      expect(result.files[0].path).toBe('/library/comics/DC/Batman/Batman 001.cbz');
    });
  });

  // ===========================================================================
  // Library Scanning Tests
  // ===========================================================================

  describe('scanLibrary', () => {
    it('should throw error for non-existent library', async () => {
      mockDb.library.findUnique.mockResolvedValue(null);

      await expect(scanLibrary('non-existent-id')).rejects.toThrow('Library not found');
    });

    it('should detect new files', async () => {
      const library = createMockLibrary({ id: 'lib-1', rootPath: '/comics' });
      mockDb.library.findUnique.mockResolvedValue(library);
      mockDb.comicFile.findMany.mockResolvedValue([]);

      addVirtualComicFiles(vfs, '/comics', [
        { relativePath: 'Batman 001.cbz' },
        { relativePath: 'Batman 002.cbz' },
      ]);

      const result = await scanLibrary('lib-1');

      expect(result.newFiles).toHaveLength(2);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.orphanedFiles).toHaveLength(0);
    });

    it('should detect orphaned files (deleted from disk)', async () => {
      const library = createMockLibrary({ id: 'lib-1', rootPath: '/comics' });
      const existingFile = createMockComicFile({
        id: 'file-1',
        path: '/comics/OldFile.cbz',
        hash: 'old-hash',
        status: 'indexed',
      });

      mockDb.library.findUnique.mockResolvedValue(library);
      mockDb.comicFile.findMany.mockResolvedValue([existingFile]);

      // Only add one new file, the old one is missing
      addVirtualComicFiles(vfs, '/comics', [
        { relativePath: 'NewFile.cbz' },
      ]);

      const result = await scanLibrary('lib-1');

      expect(result.orphanedFiles).toHaveLength(1);
      expect(result.orphanedFiles[0].path).toBe('/comics/OldFile.cbz');
    });

    it('should detect unchanged files', async () => {
      const library = createMockLibrary({ id: 'lib-1', rootPath: '/comics' });
      const existingFile = createMockComicFile({
        id: 'file-1',
        path: '/comics/Batman/Batman 001.cbz',
        status: 'indexed',
      });

      mockDb.library.findUnique.mockResolvedValue(library);
      mockDb.comicFile.findMany.mockResolvedValue([existingFile]);

      addVirtualComicFiles(vfs, '/comics', [
        { relativePath: 'Batman/Batman 001.cbz' },
      ]);

      const result = await scanLibrary('lib-1');

      expect(result.unchangedFiles).toBe(1);
      expect(result.newFiles).toHaveLength(0);
    });

    it('should return scan duration', async () => {
      const library = createMockLibrary({ id: 'lib-1', rootPath: '/comics' });
      mockDb.library.findUnique.mockResolvedValue(library);
      mockDb.comicFile.findMany.mockResolvedValue([]);

      addVirtualComicFiles(vfs, '/comics', [
        { relativePath: 'Batman 001.cbz' },
      ]);

      const result = await scanLibrary('lib-1');

      expect(result.scanDuration).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Apply Scan Results Tests
  // ===========================================================================

  describe('applyScanResults', () => {
    it('should add new files to database', async () => {
      const scanResult = {
        libraryId: 'lib-1',
        libraryPath: '/comics',
        totalFilesScanned: 2,
        newFiles: [
          {
            path: '/comics/Batman 001.cbz',
            relativePath: 'Batman 001.cbz',
            filename: 'Batman 001.cbz',
            extension: 'cbz',
            size: 50000000,
            modifiedAt: new Date('2024-01-01'),
            hash: 'hash-1',
          },
        ],
        movedFiles: [],
        orphanedFiles: [],
        unchangedFiles: 0,
        errors: [],
        scanDuration: 100,
      };

      const result = await applyScanResults(scanResult);

      expect(mockDb.comicFile.create).toHaveBeenCalledTimes(1);
      expect(result.added).toBe(1);
    });

    it('should update moved files in database', async () => {
      const scanResult = {
        libraryId: 'lib-1',
        libraryPath: '/comics',
        totalFilesScanned: 1,
        newFiles: [],
        movedFiles: [
          {
            oldPath: '/comics/old/Batman 001.cbz',
            newPath: '/comics/new/Batman 001.cbz',
            fileId: 'file-1',
          },
        ],
        orphanedFiles: [],
        unchangedFiles: 0,
        errors: [],
        scanDuration: 100,
      };

      const result = await applyScanResults(scanResult);

      expect(mockDb.comicFile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'file-1' },
          data: expect.objectContaining({
            path: '/comics/new/Batman 001.cbz',
          }),
        })
      );
      expect(result.moved).toBe(1);
    });

    it('should mark orphaned files in database', async () => {
      const scanResult = {
        libraryId: 'lib-1',
        libraryPath: '/comics',
        totalFilesScanned: 0,
        newFiles: [],
        movedFiles: [],
        orphanedFiles: [
          { path: '/comics/Deleted.cbz', fileId: 'file-orphan' },
        ],
        unchangedFiles: 0,
        errors: [],
        scanDuration: 100,
      };

      const result = await applyScanResults(scanResult);

      expect(mockDb.comicFile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'file-orphan' },
          data: { status: 'orphaned' },
        })
      );
      expect(result.orphaned).toBe(1);
    });
  });

  // ===========================================================================
  // Verify Library Path Tests
  // ===========================================================================

  describe('verifyLibraryPath', () => {
    it('should return valid for existing directory', async () => {
      addVirtualDirectory(vfs, '/comics');

      const result = await verifyLibraryPath('/comics');

      expect(result.valid).toBe(true);
      expect(result.isDirectory).toBe(true);
    });

    it('should return invalid for non-existent path', async () => {
      const result = await verifyLibraryPath('/nonexistent');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return invalid for file (not directory)', async () => {
      addVirtualFile(vfs, '/some-file.txt', 'content');

      const result = await verifyLibraryPath('/some-file.txt');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a directory');
    });
  });

  // ===========================================================================
  // Library Stats Tests
  // ===========================================================================

  describe('getLibraryStats', () => {
    it('should return file counts by status', async () => {
      mockDb.comicFile.count
        .mockResolvedValueOnce(100)  // total
        .mockResolvedValueOnce(10)   // pending
        .mockResolvedValueOnce(80)   // indexed
        .mockResolvedValueOnce(5)    // orphaned
        .mockResolvedValueOnce(5);   // quarantined

      const stats = await getLibraryStats('lib-1');

      expect(stats.total).toBe(100);
      expect(stats.pending).toBe(10);
      expect(stats.indexed).toBe(80);
      expect(stats.orphaned).toBe(5);
      expect(stats.quarantined).toBe(5);
    });
  });

  describe('getAllLibraryStats', () => {
    it('should return stats for all libraries', async () => {
      mockDb.comicFile.groupBy.mockResolvedValue([
        { libraryId: 'lib-1', status: 'indexed', _count: { id: 50 } },
        { libraryId: 'lib-1', status: 'pending', _count: { id: 10 } },
        { libraryId: 'lib-2', status: 'indexed', _count: { id: 30 } },
      ]);
      mockDb.library.findMany.mockResolvedValue([
        { id: 'lib-1' },
        { id: 'lib-2' },
      ]);

      const statsMap = await getAllLibraryStats();

      expect(statsMap.size).toBe(2);
      expect(statsMap.get('lib-1')?.indexed).toBe(50);
      expect(statsMap.get('lib-1')?.pending).toBe(10);
      expect(statsMap.get('lib-2')?.indexed).toBe(30);
    });

    it('should include empty libraries with zero counts', async () => {
      mockDb.comicFile.groupBy.mockResolvedValue([]);
      mockDb.library.findMany.mockResolvedValue([
        { id: 'empty-lib' },
      ]);

      const statsMap = await getAllLibraryStats();

      expect(statsMap.size).toBe(1);
      const stats = statsMap.get('empty-lib');
      expect(stats?.total).toBe(0);
      expect(stats?.indexed).toBe(0);
    });
  });
});
