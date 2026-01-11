/**
 * Library Cleanup Service Tests
 *
 * Tests for comprehensive library deletion cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

// Create mock for the transaction client (same shape as regular client)
const createMockTxClient = () => ({
  library: {
    findUnique: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue({}),
  },
  comicFile: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  series: {
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
  },
  batchOperation: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  userLibraryAccess: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  apiKey: {
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
  },
  smartCollectionDirtyFlag: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  collectionItem: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  seriesSimilarity: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
});

const mockTxClient = createMockTxClient();

const mockPrisma = {
  ...mockTxClient,
  $transaction: vi.fn().mockImplementation(async (fn) => {
    return fn(mockTxClient);
  }),
};

vi.mock('../../database.service.js', () => ({
  getDatabase: vi.fn(() => mockPrisma),
}));

// Mock cover service
const mockDeleteLibraryCovers = vi.fn().mockResolvedValue({ deleted: 10, errors: 0 });
vi.mock('../../cover.service.js', () => ({
  deleteLibraryCovers: (libraryId: string) => mockDeleteLibraryCovers(libraryId),
}));

// Mock thumbnail service
const mockDeleteLibraryThumbnails = vi.fn().mockResolvedValue({ deleted: 50, errors: 0 });
vi.mock('../../thumbnail.service.js', () => ({
  deleteLibraryThumbnails: (libraryId: string) => mockDeleteLibraryThumbnails(libraryId),
}));

// Mock logger service
vi.mock('../../logger.service.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

// Mock cache invalidation service
const mockInvalidateAfterScan = vi.fn().mockResolvedValue(undefined);
vi.mock('../../cache/cache-invalidation.service.js', () => ({
  invalidateAfterScan: (libraryId: string) => mockInvalidateAfterScan(libraryId),
}));

// Import after mocks
import { deleteLibraryWithCleanup } from '../library-cleanup.service.js';

// =============================================================================
// Tests
// =============================================================================

describe('Library Cleanup Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock implementations
    mockPrisma.library.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockTxClient));
    mockTxClient.library.findUnique.mockResolvedValue(null);
    mockTxClient.comicFile.findMany.mockResolvedValue([]);
    mockTxClient.series.findMany.mockResolvedValue([]);
    mockTxClient.batchOperation.deleteMany.mockResolvedValue({ count: 0 });
    mockTxClient.userLibraryAccess.deleteMany.mockResolvedValue({ count: 0 });
    mockTxClient.apiKey.findMany.mockResolvedValue([]);
    mockTxClient.smartCollectionDirtyFlag.deleteMany.mockResolvedValue({ count: 0 });
    mockTxClient.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
    mockTxClient.collectionItem.updateMany.mockResolvedValue({ count: 0 });
    mockTxClient.seriesSimilarity.deleteMany.mockResolvedValue({ count: 0 });
    mockDeleteLibraryCovers.mockResolvedValue({ deleted: 10, errors: 0 });
    mockDeleteLibraryThumbnails.mockResolvedValue({ deleted: 50, errors: 0 });
    mockInvalidateAfterScan.mockResolvedValue(undefined);
  });

  describe('deleteLibraryWithCleanup', () => {
    it('should throw error if library not found', async () => {
      mockPrisma.library.findUnique.mockResolvedValue(null);

      await expect(deleteLibraryWithCleanup({ libraryId: 'non-existent' })).rejects.toThrow(
        'Library not found: non-existent'
      );
    });

    it('should delete library and return success result', async () => {
      // Mock library exists
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      // Mock files in library
      mockTxClient.comicFile.findMany.mockResolvedValue([{ id: 'file-1' }, { id: 'file-2' }]);

      // Mock series that may become orphaned
      mockTxClient.series.findMany
        .mockResolvedValueOnce([{ id: 'series-1' }]) // First call: potential orphans
        .mockResolvedValueOnce([{ id: 'series-1', name: 'Orphan Series' }]) // Second call: actual orphans
        .mockResolvedValueOnce([]); // Third call: deleted series for similarity cleanup

      const result = await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      expect(result.success).toBe(true);
      expect(result.libraryId).toBe('lib-1');
      expect(result.libraryName).toBe('Test Library');
      expect(result.steps).toHaveLength(8); // All cleanup steps (1 file system + 7 database)

      // Verify file system cleanup was called
      expect(mockDeleteLibraryCovers).toHaveBeenCalledWith('lib-1');
      expect(mockDeleteLibraryThumbnails).toHaveBeenCalledWith('lib-1');

      // Verify transaction was called
      expect(mockPrisma.$transaction).toHaveBeenCalled();

      // Verify library was deleted
      expect(mockTxClient.library.delete).toHaveBeenCalledWith({
        where: { id: 'lib-1' },
      });
    });

    it('should skip file system cleanup when skipFileSystemCleanup is true', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      await deleteLibraryWithCleanup({
        libraryId: 'lib-1',
        skipFileSystemCleanup: true,
      });

      expect(mockDeleteLibraryCovers).not.toHaveBeenCalled();
      expect(mockDeleteLibraryThumbnails).not.toHaveBeenCalled();
    });

    it('should clean up batch operations', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });
      mockTxClient.batchOperation.deleteMany.mockResolvedValue({ count: 3 });

      const result = await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      expect(mockTxClient.batchOperation.deleteMany).toHaveBeenCalledWith({
        where: { libraryId: 'lib-1' },
      });

      const batchStep = result.steps.find((s) => s.stepName === 'Batch Operations');
      expect(batchStep?.itemsProcessed).toBe(3);
      expect(batchStep?.success).toBe(true);
    });

    it('should clean up user library access', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });
      mockTxClient.userLibraryAccess.deleteMany.mockResolvedValue({ count: 2 });

      const result = await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      expect(mockTxClient.userLibraryAccess.deleteMany).toHaveBeenCalledWith({
        where: { libraryId: 'lib-1' },
      });

      const accessStep = result.steps.find((s) => s.stepName === 'User Library Access');
      expect(accessStep?.itemsProcessed).toBe(2);
      expect(accessStep?.success).toBe(true);
    });

    it('should clean up API key scopes', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      // Mock API keys with library restrictions
      mockTxClient.apiKey.findMany.mockResolvedValue([
        { id: 'key-1', libraryIds: '["lib-1", "lib-2"]' },
        { id: 'key-2', libraryIds: '["lib-1"]' }, // Should become null after filtering
        { id: 'key-3', libraryIds: '["lib-3"]' }, // Should not be updated
      ]);

      const result = await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      // Should update keys that contained lib-1
      expect(mockTxClient.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { libraryIds: '["lib-2"]' },
      });
      expect(mockTxClient.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-2' },
        data: { libraryIds: null },
      });

      const apiKeyStep = result.steps.find((s) => s.stepName === 'API Key Scopes');
      expect(apiKeyStep?.itemsProcessed).toBe(2);
      expect(apiKeyStep?.success).toBe(true);
    });

    it('should soft delete orphaned series and mark collection items unavailable', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      // Mock potential orphan series
      mockTxClient.series.findMany
        .mockResolvedValueOnce([{ id: 'series-1' }]) // Initial: potential orphans
        .mockResolvedValueOnce([{ id: 'series-1', name: 'Orphan Series' }]) // Actual orphans (no files)
        .mockResolvedValueOnce([{ id: 'series-1' }]); // Deleted series for similarity cleanup

      const result = await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      // Verify series was soft-deleted
      expect(mockTxClient.series.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'series-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        })
      );

      // Verify collection items were marked unavailable
      expect(mockTxClient.collectionItem.updateMany).toHaveBeenCalledWith({
        where: { seriesId: 'series-1' },
        data: { isAvailable: false },
      });

      const orphanStep = result.steps.find((s) => s.stepName === 'Orphaned Series');
      expect(orphanStep?.itemsProcessed).toBe(1);
    });

    it('should clean up collection items for files', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      mockTxClient.comicFile.findMany.mockResolvedValue([{ id: 'file-1' }, { id: 'file-2' }]);
      mockTxClient.collectionItem.deleteMany.mockResolvedValue({ count: 5 });

      const result = await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      expect(mockTxClient.collectionItem.deleteMany).toHaveBeenCalledWith({
        where: { fileId: { in: ['file-1', 'file-2'] } },
      });

      const collectionStep = result.steps.find((s) => s.stepName === 'Collection Items (Files)');
      expect(collectionStep?.itemsProcessed).toBe(5);
    });

    it('should clean up series similarity for orphaned series', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      // Mock series that will become orphaned
      mockTxClient.series.findMany
        .mockResolvedValueOnce([{ id: 'series-1' }]) // Initial: potential orphans
        .mockResolvedValueOnce([{ id: 'series-1', name: 'Orphan Series' }]); // Actual orphans (no files left)

      mockTxClient.seriesSimilarity.deleteMany.mockResolvedValue({ count: 10 });

      const result = await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      // Series similarity should be cleaned up for the orphaned series
      expect(mockTxClient.seriesSimilarity.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ sourceSeriesId: { in: ['series-1'] } }, { targetSeriesId: { in: ['series-1'] } }],
        },
      });

      const similarityStep = result.steps.find((s) => s.stepName === 'Series Similarity');
      expect(similarityStep?.itemsProcessed).toBe(10);
    });

    it('should not clean up series similarity if no series were orphaned', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      // Mock series that will NOT become orphaned (they have files in other libraries)
      mockTxClient.series.findMany
        .mockResolvedValueOnce([{ id: 'series-1' }]) // Initial: potential orphans
        .mockResolvedValueOnce([]); // No actual orphans (all series still have files)

      const result = await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      // Series similarity should NOT be called since no series were orphaned
      expect(mockTxClient.seriesSimilarity.deleteMany).not.toHaveBeenCalled();

      const similarityStep = result.steps.find((s) => s.stepName === 'Series Similarity');
      expect(similarityStep?.itemsProcessed).toBe(0);
    });

    it('should continue on error and collect failures', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      // Make cover cleanup fail
      mockDeleteLibraryCovers.mockRejectedValue(new Error('Cover cleanup failed'));

      const result = await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      // Should still complete with errors
      expect(result.success).toBe(false);
      expect(result.summary.totalErrors).toBeGreaterThan(0);

      const cacheStep = result.steps.find((s) => s.stepName === 'File System Caches');
      expect(cacheStep?.success).toBe(false);
      expect(cacheStep?.errors).toContain('Cover cleanup failed: Cover cleanup failed');
    });

    it('should report correct summary statistics', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      mockDeleteLibraryCovers.mockResolvedValue({ deleted: 10, errors: 0 });
      mockDeleteLibraryThumbnails.mockResolvedValue({ deleted: 50, errors: 0 });
      mockTxClient.batchOperation.deleteMany.mockResolvedValue({ count: 3 });
      mockTxClient.userLibraryAccess.deleteMany.mockResolvedValue({ count: 2 });

      const result = await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      expect(result.summary.totalItemsProcessed).toBeGreaterThanOrEqual(60 + 3 + 2);
      expect(result.summary.totalErrors).toBe(0);
      expect(result.summary.failedSteps).toEqual([]);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should invalidate library caches after successful deletion', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      // Should call cache invalidation with library ID
      expect(mockInvalidateAfterScan).toHaveBeenCalledWith('lib-1');
    });

    it('should not invalidate caches if transaction fails', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      // Make transaction fail
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      // Should NOT call cache invalidation
      expect(mockInvalidateAfterScan).not.toHaveBeenCalled();
    });

    it('should invalidate caches even if filesystem cleanup fails', async () => {
      mockPrisma.library.findUnique.mockResolvedValue({
        id: 'lib-1',
        name: 'Test Library',
      });

      // Make filesystem cleanup fail
      mockDeleteLibraryCovers.mockRejectedValue(new Error('Filesystem error'));

      await deleteLibraryWithCleanup({ libraryId: 'lib-1' });

      // Should still call cache invalidation since transaction succeeded
      expect(mockInvalidateAfterScan).toHaveBeenCalledWith('lib-1');
    });
  });
});
