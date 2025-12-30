/**
 * Cover Service Tests
 *
 * Tests for cover extraction, caching, and management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrismaClient, createMockComicFile, createMockLibrary } from './__mocks__/prisma.mock.js';

// =============================================================================
// Mocks
// =============================================================================

const mockPrisma = createMockPrismaClient();

vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockPrisma),
}));

// Mock fs sync functions
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock('fs', () => ({
  existsSync: (path: string) => mockExistsSync(path),
  readFileSync: (path: string) => mockReadFileSync(path),
}));

// Mock fs/promises
const mockFsPromises = {
  mkdir: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  copyFile: vi.fn(),
  rename: vi.fn(),
};

vi.mock('fs/promises', () => mockFsPromises);

// Mock sharp
const mockSharpInstance = {
  metadata: vi.fn(),
  resize: vi.fn(),
  clone: vi.fn(),
  webp: vi.fn(),
  jpeg: vi.fn(),
  blur: vi.fn(),
  toFile: vi.fn(),
  toBuffer: vi.fn(),
};

// Chain methods return the same instance
mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
mockSharpInstance.clone.mockReturnValue(mockSharpInstance);
mockSharpInstance.webp.mockReturnValue(mockSharpInstance);
mockSharpInstance.jpeg.mockReturnValue(mockSharpInstance);
mockSharpInstance.blur.mockReturnValue(mockSharpInstance);

const mockSharp = vi.fn(() => mockSharpInstance);

vi.mock('sharp', () => ({
  default: mockSharp,
}));

// Mock archive service
const mockArchive = {
  listArchiveContents: vi.fn(),
  extractSingleFile: vi.fn(),
  createTempDir: vi.fn(),
  cleanupTempDir: vi.fn(),
};

vi.mock('../archive.service.js', () => mockArchive);

// Mock app-paths service
const mockAppPaths = {
  getCoverPath: vi.fn(),
  getLibraryCoverDir: vi.fn(),
  getCoversDir: vi.fn(),
  getSeriesCoversDir: vi.fn(),
  getSeriesCoverPath: vi.fn(),
  getCollectionCoversDir: vi.fn(),
};

vi.mock('../app-paths.service.js', () => mockAppPaths);

// Import AFTER mocks
const {
  extractCover,
  getCoverForFile,
  getCoverInfo,
  getCoverData,
  clearMemoryCache,
  getMemoryCacheStats,
  deleteCachedCover,
  deleteLibraryCovers,
  getCacheSummary,
  cleanupOrphanedCovers,
} = await import('../cover.service.js');

// =============================================================================
// Tests
// =============================================================================

describe('Cover Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMemoryCache();

    // Default mock implementations
    mockAppPaths.getCoverPath.mockImplementation((libraryId: string, hash: string) =>
      `/cache/covers/${libraryId}/${hash}.jpg`
    );
    mockAppPaths.getLibraryCoverDir.mockImplementation((libraryId: string) =>
      `/cache/covers/${libraryId}`
    );
    mockAppPaths.getCoversDir.mockReturnValue('/cache/covers');

    mockExistsSync.mockReturnValue(false);
    mockFsPromises.mkdir.mockResolvedValue(undefined);
    mockFsPromises.stat.mockResolvedValue({ size: 50000, mtime: new Date() });
    mockFsPromises.readdir.mockResolvedValue([]);
    mockFsPromises.unlink.mockResolvedValue(undefined);
    mockFsPromises.rm.mockResolvedValue(undefined);

    mockArchive.createTempDir.mockResolvedValue('/tmp/cover-123');
    mockArchive.cleanupTempDir.mockResolvedValue(undefined);
  });

  // ===========================================================================
  // extractCover
  // ===========================================================================

  describe('extractCover', () => {
    it('should return cached cover if exists', async () => {
      // WebP cover exists
      mockExistsSync.mockImplementation((path: string) => path.endsWith('.webp'));

      const result = await extractCover('/comics/test.cbz', 'lib-1', 'hash123');

      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(result.webpPath).toContain('hash123.webp');
    });

    it('should extract cover from archive when not cached', async () => {
      mockExistsSync.mockReturnValue(false);

      mockArchive.listArchiveContents.mockResolvedValue({
        entries: [
          { path: 'page001.jpg', isDirectory: false },
          { path: 'page002.jpg', isDirectory: false },
        ],
        fileCount: 2,
      });

      mockArchive.extractSingleFile.mockResolvedValue({
        success: true,
      });

      mockSharpInstance.metadata.mockResolvedValue({ width: 800, height: 1200 });
      mockSharpInstance.toFile.mockResolvedValue({});
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('blur'));

      const result = await extractCover('/comics/test.cbz', 'lib-1', 'hash123');

      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(false);
      expect(mockArchive.extractSingleFile).toHaveBeenCalled();
      expect(mockArchive.cleanupTempDir).toHaveBeenCalled();
    });

    it('should prioritize cover.jpg file', async () => {
      mockExistsSync.mockReturnValue(false);

      mockArchive.listArchiveContents.mockResolvedValue({
        entries: [
          { path: 'page001.jpg', isDirectory: false },
          { path: 'cover.jpg', isDirectory: false },
          { path: 'page002.jpg', isDirectory: false },
        ],
        fileCount: 3,
      });

      mockArchive.extractSingleFile.mockResolvedValue({ success: true });
      mockSharpInstance.metadata.mockResolvedValue({ width: 800 });
      mockSharpInstance.toFile.mockResolvedValue({});
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('blur'));

      await extractCover('/comics/test.cbz', 'lib-1', 'hash123');

      // Should extract cover.jpg, not page001.jpg
      expect(mockArchive.extractSingleFile).toHaveBeenCalledWith(
        '/comics/test.cbz',
        'cover.jpg',
        expect.any(String)
      );
    });

    it('should return error when no images in archive', async () => {
      mockExistsSync.mockReturnValue(false);

      mockArchive.listArchiveContents.mockResolvedValue({
        entries: [
          { path: 'readme.txt', isDirectory: false },
        ],
        fileCount: 1,
      });

      const result = await extractCover('/comics/test.cbz', 'lib-1', 'hash123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No cover image found');
    });

    it('should handle extraction failure', async () => {
      mockExistsSync.mockReturnValue(false);

      mockArchive.listArchiveContents.mockResolvedValue({
        entries: [{ path: 'page001.jpg', isDirectory: false }],
        fileCount: 1,
      });

      mockArchive.extractSingleFile.mockResolvedValue({
        success: false,
        error: 'Extraction failed',
      });

      const result = await extractCover('/comics/test.cbz', 'lib-1', 'hash123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Extraction failed');
    });
  });

  // ===========================================================================
  // getCoverForFile
  // ===========================================================================

  describe('getCoverForFile', () => {
    it('should get cover for file by ID', async () => {
      const file = createMockComicFile({
        id: 'file-1',
        path: '/comics/test.cbz',
        hash: 'abc123',
        libraryId: 'lib-1',
      });
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      // Cover is cached
      mockExistsSync.mockImplementation((path: string) => path.endsWith('.webp'));

      const result = await getCoverForFile('file-1');

      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);
    });

    it('should return error when file not found', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await getCoverForFile('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('should return error when file has no hash', async () => {
      const file = createMockComicFile({
        id: 'file-1',
        hash: null,
      });
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      const result = await getCoverForFile('file-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File hash not available');
    });
  });

  // ===========================================================================
  // getCoverInfo
  // ===========================================================================

  describe('getCoverInfo', () => {
    it('should return info for existing cover', async () => {
      mockExistsSync.mockImplementation((path: string) =>
        path.endsWith('.webp') || path.endsWith('.jpg')
      );
      mockFsPromises.stat.mockResolvedValue({
        size: 50000,
        mtime: new Date('2024-01-01'),
      });

      const result = await getCoverInfo('lib-1', 'hash123');

      expect(result.exists).toBe(true);
      expect(result.size).toBe(50000);
      expect(result.webpPath).toBeDefined();
    });

    it('should return exists false for missing cover', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await getCoverInfo('lib-1', 'nonexistent');

      expect(result.exists).toBe(false);
    });

    it('should load blur placeholder if available', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromises.stat.mockResolvedValue({ size: 50000, mtime: new Date() });
      mockFsPromises.readFile.mockResolvedValue('data:image/jpeg;base64,abc123');

      const result = await getCoverInfo('lib-1', 'hash123');

      expect(result.exists).toBe(true);
      expect(result.blurPlaceholder).toBe('data:image/jpeg;base64,abc123');
    });
  });

  // ===========================================================================
  // getCoverData
  // ===========================================================================

  describe('getCoverData', () => {
    it('should return WebP data when available', async () => {
      mockExistsSync.mockImplementation((path: string) => path.endsWith('.webp'));
      mockFsPromises.readFile.mockResolvedValue(Buffer.from('webp-data'));

      const result = await getCoverData('lib-1', 'hash123', true);

      expect(result).not.toBeNull();
      expect(result?.contentType).toBe('image/webp');
    });

    it('should fallback to JPEG when WebP not available', async () => {
      mockExistsSync.mockImplementation((path: string) => path.endsWith('.jpg'));
      mockFsPromises.readFile.mockResolvedValue(Buffer.from('jpeg-data'));

      const result = await getCoverData('lib-1', 'hash123', false);

      expect(result).not.toBeNull();
      expect(result?.contentType).toBe('image/jpeg');
    });

    it('should return null when no cover exists', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await getCoverData('lib-1', 'nonexistent', true);

      expect(result).toBeNull();
    });

    it('should use memory cache on second request', async () => {
      mockExistsSync.mockImplementation((path: string) => path.endsWith('.webp'));
      mockFsPromises.readFile.mockResolvedValue(Buffer.from('webp-data'));

      // First request
      await getCoverData('lib-1', 'hash123', true);

      // Reset readFile mock to verify cache hit
      mockFsPromises.readFile.mockClear();

      // Second request should use cache
      const result = await getCoverData('lib-1', 'hash123', true);

      expect(result).not.toBeNull();
      // readFile should not be called again
      expect(mockFsPromises.readFile).not.toHaveBeenCalledWith(
        expect.stringContaining('hash123.webp')
      );
    });
  });

  // ===========================================================================
  // Memory Cache
  // ===========================================================================

  describe('Memory Cache', () => {
    it('should clear memory cache', async () => {
      // Add something to cache first
      mockExistsSync.mockImplementation((path: string) => path.endsWith('.webp'));
      mockFsPromises.readFile.mockResolvedValue(Buffer.from('data'));

      await getCoverData('lib-1', 'hash123', true);

      const statsBefore = getMemoryCacheStats();
      expect(statsBefore.size).toBe(1);

      clearMemoryCache();

      const statsAfter = getMemoryCacheStats();
      expect(statsAfter.size).toBe(0);
      expect(statsAfter.bytes).toBe(0);
    });

    it('should report memory cache stats', () => {
      const stats = getMemoryCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('bytes');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('maxBytes');
    });
  });

  // ===========================================================================
  // deleteCachedCover
  // ===========================================================================

  describe('deleteCachedCover', () => {
    it('should delete all cover formats', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromises.unlink.mockResolvedValue(undefined);

      const result = await deleteCachedCover('lib-1', 'hash123');

      expect(result).toBe(true);
      // Should attempt to delete webp, jpeg, blur, and legacy formats
      expect(mockFsPromises.unlink).toHaveBeenCalled();
    });

    it('should return true when cover does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await deleteCachedCover('lib-1', 'nonexistent');

      expect(result).toBe(true);
    });

    it('should return false on delete error', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromises.unlink.mockRejectedValue(new Error('Permission denied'));

      const result = await deleteCachedCover('lib-1', 'hash123');

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // deleteLibraryCovers
  // ===========================================================================

  describe('deleteLibraryCovers', () => {
    it('should delete all covers for a library', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromises.readdir.mockResolvedValue(['hash1.webp', 'hash2.webp']);
      mockFsPromises.unlink.mockResolvedValue(undefined);
      mockFsPromises.rm.mockResolvedValue(undefined);

      const result = await deleteLibraryCovers('lib-1');

      expect(result.deleted).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('should return zero counts for nonexistent library', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await deleteLibraryCovers('nonexistent');

      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(0);
    });
  });

  // ===========================================================================
  // getCacheSummary
  // ===========================================================================

  describe('getCacheSummary', () => {
    it('should return summary of all cached covers', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromises.readdir
        .mockResolvedValueOnce(['lib-1', 'lib-2']) // Library dirs
        .mockResolvedValueOnce(['cover1.webp', 'cover2.webp']) // lib-1 files
        .mockResolvedValueOnce(['cover3.webp']); // lib-2 files

      mockFsPromises.stat.mockImplementation((path: string) => {
        // Library directories
        if (path === '/cache/covers/lib-1' || path === '/cache/covers/lib-2') {
          return Promise.resolve({
            isDirectory: () => true,
            isFile: () => false,
            size: 0,
          });
        }
        // Cover files
        return Promise.resolve({
          isDirectory: () => false,
          isFile: () => true,
          size: 10000,
        });
      });

      const result = await getCacheSummary();

      expect(result.libraries).toHaveLength(2);
      expect(result.totalFiles).toBe(3);
    });

    it('should return empty summary when no cache exists', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await getCacheSummary();

      expect(result.totalFiles).toBe(0);
      expect(result.totalSize).toBe(0);
      expect(result.libraries).toHaveLength(0);
    });
  });

  // ===========================================================================
  // cleanupOrphanedCovers
  // ===========================================================================

  describe('cleanupOrphanedCovers', () => {
    it('should delete covers for deleted libraries', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromises.readdir
        .mockResolvedValueOnce(['lib-deleted'])
        .mockResolvedValueOnce(['cover1.webp']);

      mockFsPromises.stat.mockResolvedValue({
        isDirectory: () => true,
        isFile: () => true,
        size: 10000,
      });

      // Library doesn't exist in DB
      mockPrisma.library.findUnique.mockResolvedValue(null);
      mockFsPromises.unlink.mockResolvedValue(undefined);
      mockFsPromises.rm.mockResolvedValue(undefined);

      const result = await cleanupOrphanedCovers();

      expect(result.deleted).toBeGreaterThanOrEqual(0);
    });

    it('should return zero when no cache exists', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await cleanupOrphanedCovers();

      expect(result.checked).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should keep covers for existing files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromises.readdir
        .mockResolvedValueOnce(['lib-1'])
        .mockResolvedValueOnce(['hash123.webp']);

      mockFsPromises.stat.mockResolvedValue({
        isDirectory: () => true,
        isFile: () => true,
        size: 10000,
      });

      // Library exists
      mockPrisma.library.findUnique.mockResolvedValue(createMockLibrary({ id: 'lib-1' }));

      // File exists with this hash
      mockPrisma.comicFile.findFirst.mockResolvedValue(
        createMockComicFile({ hash: 'hash123' })
      );

      const result = await cleanupOrphanedCovers();

      // Should check but not delete
      expect(result.checked).toBeGreaterThanOrEqual(0);
      expect(mockFsPromises.unlink).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Series Cover Resolution (Pre-computed)
  // ===========================================================================

  describe('getFileCoverHash', () => {
    it('should return coverHash for custom cover', async () => {
      const { getFileCoverHash } = await import('../cover.service.js');

      mockPrisma.comicFile.findUnique.mockResolvedValue({
        ...createMockComicFile(),
        coverSource: 'custom',
        coverHash: 'customhash123',
        hash: 'filehash456',
      });

      const result = await getFileCoverHash('file-1');

      expect(result).toBe('customhash123');
    });

    it('should return hash for auto cover', async () => {
      const { getFileCoverHash } = await import('../cover.service.js');

      mockPrisma.comicFile.findUnique.mockResolvedValue({
        ...createMockComicFile(),
        coverSource: 'auto',
        coverHash: null,
        hash: 'filehash456',
      });

      const result = await getFileCoverHash('file-1');

      expect(result).toBe('filehash456');
    });

    it('should return null when file not found', async () => {
      const { getFileCoverHash } = await import('../cover.service.js');

      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await getFileCoverHash('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('recalculateSeriesCover', () => {
    it('should set api cover when coverSource=api and coverHash exists', async () => {
      const { recalculateSeriesCover } = await import('../cover.service.js');

      mockPrisma.series.findUnique.mockResolvedValue({
        id: 'series-1',
        coverSource: 'api',
        coverHash: 'apihash123',
        coverFileId: null,
      });
      mockPrisma.comicFile.findFirst.mockResolvedValue(null);

      await recalculateSeriesCover('series-1');

      expect(mockPrisma.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: expect.objectContaining({
          resolvedCoverHash: 'apihash123',
          resolvedCoverSource: 'api',
          resolvedCoverFileId: null,
        }),
      });
    });

    it('should set user cover when coverSource=user and coverFileId exists', async () => {
      const { recalculateSeriesCover } = await import('../cover.service.js');

      mockPrisma.series.findUnique.mockResolvedValue({
        id: 'series-1',
        coverSource: 'user',
        coverHash: null,
        coverFileId: 'file-1',
      });
      mockPrisma.comicFile.findFirst.mockResolvedValue(null);

      // Mock getFileCoverHash call
      mockPrisma.comicFile.findUnique.mockResolvedValue({
        ...createMockComicFile(),
        coverSource: 'auto',
        hash: 'userhash456',
      });

      await recalculateSeriesCover('series-1');

      expect(mockPrisma.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: expect.objectContaining({
          resolvedCoverHash: 'userhash456',
          resolvedCoverSource: 'user',
          resolvedCoverFileId: 'file-1',
        }),
      });
    });

    it('should fallback to first issue when coverSource=auto and no other covers', async () => {
      const { recalculateSeriesCover } = await import('../cover.service.js');

      mockPrisma.series.findUnique.mockResolvedValue({
        id: 'series-1',
        coverSource: 'auto',
        coverHash: null,
        coverFileId: null,
      });
      mockPrisma.comicFile.findFirst.mockResolvedValue({
        id: 'issue-1',
        coverHash: null,
        hash: 'issuehash789',
        libraryId: 'lib-1',
      });

      await recalculateSeriesCover('series-1');

      expect(mockPrisma.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: expect.objectContaining({
          resolvedCoverHash: 'issuehash789',
          resolvedCoverSource: 'firstIssue',
          resolvedCoverFileId: 'issue-1',
        }),
      });
    });

    it('should set none when no cover sources available', async () => {
      const { recalculateSeriesCover } = await import('../cover.service.js');

      mockPrisma.series.findUnique.mockResolvedValue({
        id: 'series-1',
        coverSource: 'auto',
        coverHash: null,
        coverFileId: null,
      });
      mockPrisma.comicFile.findFirst.mockResolvedValue(null);

      await recalculateSeriesCover('series-1');

      expect(mockPrisma.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: expect.objectContaining({
          resolvedCoverHash: null,
          resolvedCoverSource: 'none',
          resolvedCoverFileId: null,
        }),
      });
    });

    it('should not update when series not found', async () => {
      const { recalculateSeriesCover } = await import('../cover.service.js');

      mockPrisma.series.findUnique.mockResolvedValue(null);

      await recalculateSeriesCover('nonexistent');

      expect(mockPrisma.series.update).not.toHaveBeenCalled();
    });
  });

  describe('onCoverSourceChanged', () => {
    it('should recalculate when series cover changes', async () => {
      const { onCoverSourceChanged } = await import('../cover.service.js');

      mockPrisma.series.findUnique.mockResolvedValue({
        id: 'series-1',
        coverSource: 'api',
        coverHash: 'hash123',
        coverFileId: null,
      });
      mockPrisma.comicFile.findFirst.mockResolvedValue(null);

      await onCoverSourceChanged('series', 'series-1');

      expect(mockPrisma.series.update).toHaveBeenCalled();
    });

    it('should recalculate affected series when file cover changes', async () => {
      const { onCoverSourceChanged } = await import('../cover.service.js');

      // Mock finding affected series
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1' },
        { id: 'series-2' },
      ]);

      // Mock series lookups for recalculation
      mockPrisma.series.findUnique.mockResolvedValue({
        id: 'series-1',
        coverSource: 'auto',
        coverHash: null,
        coverFileId: null,
      });
      mockPrisma.comicFile.findFirst.mockResolvedValue(null);

      await onCoverSourceChanged('file', 'file-1');

      // Should find affected series
      expect(mockPrisma.series.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { coverFileId: 'file-1' },
            { resolvedCoverFileId: 'file-1' },
          ],
        },
        select: { id: true },
      });

      // Should recalculate each affected series
      expect(mockPrisma.series.update).toHaveBeenCalled();
    });
  });

  describe('recalculateAllSeriesCovers', () => {
    it('should recalculate covers for all series', async () => {
      const { recalculateAllSeriesCovers } = await import('../cover.service.js');

      mockPrisma.series.findMany
        .mockResolvedValueOnce([{ id: 'series-1' }, { id: 'series-2' }]);

      // Mock series lookups
      mockPrisma.series.findUnique.mockResolvedValue({
        id: 'series-1',
        coverSource: 'auto',
        coverHash: null,
        coverFileId: null,
      });
      mockPrisma.comicFile.findFirst.mockResolvedValue(null);

      const result = await recalculateAllSeriesCovers();

      expect(result.processed).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('should count errors but continue processing', async () => {
      const { recalculateAllSeriesCovers } = await import('../cover.service.js');

      mockPrisma.series.findMany
        .mockResolvedValueOnce([{ id: 'series-1' }, { id: 'series-2' }]);

      // First series throws error
      mockPrisma.series.findUnique
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({
          id: 'series-2',
          coverSource: 'auto',
          coverHash: null,
          coverFileId: null,
        });
      mockPrisma.comicFile.findFirst.mockResolvedValue(null);

      const result = await recalculateAllSeriesCovers();

      expect(result.processed).toBe(1);
      expect(result.errors).toBe(1);
    });
  });
});
