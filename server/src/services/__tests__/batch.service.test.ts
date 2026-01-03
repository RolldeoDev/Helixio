/**
 * Batch Service Tests
 *
 * Tests for batch operations with state machine:
 * - Batch creation and configuration
 * - Execution with progress tracking
 * - Cancellation and resume capability
 * - State transitions (PENDING → IN_PROGRESS → COMPLETED/FAILED/PAUSED)
 * - Error handling and partial failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockPrismaClient,
  createMockBatchOperation,
  createMockComicFile,
  createMockLibrary,
  createMockOperationLog,
} from './__mocks__/prisma.mock.js';

// Create mock prisma client
const mockPrisma = createMockPrismaClient();

// Mock database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockPrisma),
}));

// Mock conversion service
const mockConvertCbrToCbz = vi.fn().mockResolvedValue({ success: true, outputPath: '/test.cbz' });
const mockFindConvertibleFiles = vi.fn().mockResolvedValue({ total: 5, totalSize: 500000000 });
vi.mock('../conversion.service.js', () => ({
  convertCbrToCbz: mockConvertCbrToCbz,
  findConvertibleFiles: mockFindConvertibleFiles,
}));

// Mock file operations service
const mockMoveFile = vi.fn().mockResolvedValue({ success: true });
const mockRenameFile = vi.fn().mockResolvedValue({ success: true });
const mockDeleteFileOp = vi.fn().mockResolvedValue({ success: true });
vi.mock('../file-operations.service.js', () => ({
  moveFile: mockMoveFile,
  renameFile: mockRenameFile,
  deleteFile: mockDeleteFileOp,
}));

// Mock comicinfo service
const mockUpdateComicInfo = vi.fn().mockResolvedValue(undefined);
const mockReadComicInfo = vi.fn().mockResolvedValue({});
vi.mock('../comicinfo.service.js', () => ({
  updateComicInfo: mockUpdateComicInfo,
  readComicInfo: mockReadComicInfo,
}));

// Mock config service - file renaming enabled by default for most tests
const mockIsFileRenamingEnabled = vi.fn().mockReturnValue(true);
vi.mock('../config.service.js', () => ({
  isFileRenamingEnabled: mockIsFileRenamingEnabled,
}));

// Mock filename generator service
const mockGenerateUniqueFilenameFromTemplate = vi.fn().mockResolvedValue({
  finalPath: '/comics/renamed.cbz',
  finalFilename: 'renamed.cbz',
  hadCollision: false,
});
vi.mock('../filename-generator.service.js', () => ({
  generateUniqueFilenameFromTemplate: mockGenerateUniqueFilenameFromTemplate,
}));

// Import service after mocking
const {
  createBatch,
  createConversionBatch,
  executeBatch,
  requestCancellation,
  abandonBatch,
  getBatch,
  hasActiveBatch,
  getActiveBatchId,
  createTemplateRenameBatch,
  createRestoreOriginalBatch,
} = await import('../batch.service.js');

describe('Batch Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // createBatch
  // =============================================================================

  describe('createBatch', () => {
    it('should create a batch with pending status', async () => {
      mockPrisma.batchOperation.create.mockResolvedValue({
        id: 'batch-1',
        type: 'rename',
        status: 'pending',
        totalItems: 3,
        completedItems: 0,
        failedItems: 0,
      });

      const result = await createBatch({
        type: 'rename',
        libraryId: 'lib-1',
        items: [
          { fileId: 'file-1', newFilename: 'new1.cbz' },
          { fileId: 'file-2', newFilename: 'new2.cbz' },
          { fileId: 'file-3', newFilename: 'new3.cbz' },
        ],
      });

      expect(result.id).toBe('batch-1');
      expect(result.itemCount).toBe(3);
      expect(mockPrisma.batchOperation.create).toHaveBeenCalledWith({
        data: {
          type: 'rename',
          libraryId: 'lib-1',
          status: 'pending',
          totalItems: 3,
          completedItems: 0,
          failedItems: 0,
        },
      });
    });

    it('should create batch for delete operations', async () => {
      mockPrisma.batchOperation.create.mockResolvedValue({
        id: 'batch-1',
        type: 'delete',
        status: 'pending',
        totalItems: 2,
      });

      const result = await createBatch({
        type: 'delete',
        items: [{ fileId: 'file-1' }, { fileId: 'file-2' }],
      });

      expect(result.id).toBe('batch-1');
      expect(result.itemCount).toBe(2);
    });

    it('should create batch for metadata update', async () => {
      mockPrisma.batchOperation.create.mockResolvedValue({
        id: 'batch-1',
        type: 'metadata_update',
        status: 'pending',
        totalItems: 1,
      });

      const result = await createBatch({
        type: 'metadata_update',
        items: [{ fileId: 'file-1', metadata: { Series: 'Batman', Number: '1' } }],
      });

      expect(result.itemCount).toBe(1);
    });

    it('should create batch without libraryId', async () => {
      mockPrisma.batchOperation.create.mockResolvedValue({
        id: 'batch-1',
        type: 'move',
        status: 'pending',
        totalItems: 1,
      });

      await createBatch({
        type: 'move',
        items: [{ fileId: 'file-1', destination: '/new/path.cbz' }],
      });

      expect(mockPrisma.batchOperation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          libraryId: undefined,
        }),
      });
    });
  });

  // =============================================================================
  // createConversionBatch
  // =============================================================================

  describe('createConversionBatch', () => {
    it('should create a conversion batch for CBR files', async () => {
      mockFindConvertibleFiles.mockResolvedValue({
        total: 10,
        totalSize: 1000000000,
        files: [],
      });
      mockPrisma.batchOperation.create.mockResolvedValue({
        id: 'batch-1',
        type: 'convert',
        status: 'pending',
        totalItems: 10,
      });

      const result = await createConversionBatch('lib-1');

      expect(result.id).toBe('batch-1');
      expect(result.itemCount).toBe(10);
      expect(result.totalSize).toBe(1000000000);
    });

    it('should throw error when no convertible files found', async () => {
      mockFindConvertibleFiles.mockResolvedValue({ total: 0, totalSize: 0 });

      await expect(createConversionBatch('lib-1')).rejects.toThrow(
        'No convertible files found in library'
      );
    });
  });

  // =============================================================================
  // executeBatch
  // =============================================================================

  describe('executeBatch', () => {
    it('should throw error when batch not found', async () => {
      mockPrisma.batchOperation.findUnique.mockResolvedValue(null);

      await expect(executeBatch('nonexistent')).rejects.toThrow('Batch not found');
    });

    it('should throw error when batch status is not pending or paused', async () => {
      mockPrisma.batchOperation.findUnique.mockResolvedValue({
        ...createMockBatchOperation(),
        id: 'batch-1',
        status: 'completed',
      });

      await expect(executeBatch('batch-1')).rejects.toThrow('Cannot execute batch in status');
    });

    it('should execute conversion batch and track progress', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'convert',
        status: 'pending',
        libraryId: 'lib-1',
        totalItems: 2,
        completedItems: 0,
        failedItems: 0,
        lastProcessedId: null,
        startedAt: null,
        library: createMockLibrary(),
      };
      const files = [
        { id: 'file-1', path: '/comics/test1.cbr', filename: 'test1.cbr' },
        { id: 'file-2', path: '/comics/test2.cbr', filename: 'test2.cbr' },
      ];
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.batchOperation.update.mockResolvedValue({});

      const progressUpdates: any[] = [];
      const result = await executeBatch('batch-1', (progress) => {
        progressUpdates.push(progress);
      });

      expect(result.status).toBe('completed');
      expect(result.completedItems).toBe(2);
      expect(result.failedItems).toBe(0);
      expect(mockConvertCbrToCbz).toHaveBeenCalledTimes(2);
    });

    it('should handle conversion failures', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'convert',
        status: 'pending',
        libraryId: 'lib-1',
        totalItems: 2,
        completedItems: 0,
        failedItems: 0,
        lastProcessedId: null,
        startedAt: null,
        library: createMockLibrary(),
      };
      const files = [
        { id: 'file-1', path: '/comics/test1.cbr', filename: 'test1.cbr' },
        { id: 'file-2', path: '/comics/test2.cbr', filename: 'test2.cbr' },
      ];
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.batchOperation.update.mockResolvedValue({});
      mockConvertCbrToCbz
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Corrupt archive' });

      const result = await executeBatch('batch-1');

      expect(result.completedItems).toBe(1);
      expect(result.failedItems).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toBe('Corrupt archive');
    });

    it('should mark batch as failed when all items fail', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'convert',
        status: 'pending',
        libraryId: 'lib-1',
        totalItems: 1,
        completedItems: 0,
        failedItems: 0,
        lastProcessedId: null,
        startedAt: null,
        library: createMockLibrary(),
      };
      const files = [{ id: 'file-1', path: '/comics/test1.cbr', filename: 'test1.cbr' }];
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.batchOperation.update.mockResolvedValue({});
      mockConvertCbrToCbz.mockResolvedValue({ success: false, error: 'Failed' });

      const result = await executeBatch('batch-1');

      expect(result.status).toBe('failed');
    });

    it('should execute file operation batch', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'rename',
        status: 'pending',
        totalItems: 2,
        completedItems: 0,
        failedItems: 0,
        lastProcessedId: null,
        startedAt: null,
        library: null,
        libraryId: null,
      };
      const operations = [
        { ...createMockOperationLog(), id: 'op-1', source: '/test1.cbz', status: 'pending' },
        { ...createMockOperationLog(), id: 'op-2', source: '/test2.cbz', status: 'pending' },
      ];
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.operationLog.findMany.mockResolvedValue(operations);
      mockPrisma.operationLog.update.mockResolvedValue({});
      mockPrisma.batchOperation.update.mockResolvedValue({});

      const result = await executeBatch('batch-1');

      expect(result.status).toBe('completed');
      expect(result.completedItems).toBe(2);
    });

    it('should update status to in_progress when starting', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'convert',
        status: 'pending',
        libraryId: 'lib-1',
        totalItems: 0,
        completedItems: 0,
        failedItems: 0,
        lastProcessedId: null,
        startedAt: null,
        library: createMockLibrary(),
      };
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.comicFile.findMany.mockResolvedValue([]);
      mockPrisma.batchOperation.update.mockResolvedValue({});

      await executeBatch('batch-1');

      expect(mockPrisma.batchOperation.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: expect.objectContaining({
          status: 'in_progress',
        }),
      });
    });

    it('should throw error when library ID required but missing', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'convert',
        status: 'pending',
        libraryId: null,
        library: null,
      };
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.batchOperation.update.mockResolvedValue({});

      await expect(executeBatch('batch-1')).rejects.toThrow(
        'Library ID required for conversion batch'
      );
    });

    it('should throw error for unknown batch type', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'unknown_type',
        status: 'pending',
        libraryId: 'lib-1',
        library: createMockLibrary(),
      };
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.batchOperation.update.mockResolvedValue({});

      await expect(executeBatch('batch-1')).rejects.toThrow('Unknown batch type');
    });
  });

  // =============================================================================
  // requestCancellation
  // =============================================================================

  describe('requestCancellation', () => {
    it('should return false when no active batch', () => {
      const result = requestCancellation();

      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // abandonBatch
  // =============================================================================

  describe('abandonBatch', () => {
    it('should abandon a paused batch', async () => {
      mockPrisma.batchOperation.findUnique.mockResolvedValue({
        ...createMockBatchOperation(),
        id: 'batch-1',
        status: 'paused',
      });
      mockPrisma.batchOperation.update.mockResolvedValue({});

      await abandonBatch('batch-1');

      expect(mockPrisma.batchOperation.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: {
          status: 'cancelled',
          completedAt: expect.any(Date),
        },
      });
    });

    it('should throw error when batch not found', async () => {
      mockPrisma.batchOperation.findUnique.mockResolvedValue(null);

      await expect(abandonBatch('nonexistent')).rejects.toThrow('Batch not found');
    });

    it('should throw error when batch is not paused', async () => {
      mockPrisma.batchOperation.findUnique.mockResolvedValue({
        ...createMockBatchOperation(),
        id: 'batch-1',
        status: 'in_progress',
      });

      await expect(abandonBatch('batch-1')).rejects.toThrow(
        'Can only abandon paused batches'
      );
    });

    it('should not allow abandoning completed batch', async () => {
      mockPrisma.batchOperation.findUnique.mockResolvedValue({
        ...createMockBatchOperation(),
        id: 'batch-1',
        status: 'completed',
      });

      await expect(abandonBatch('batch-1')).rejects.toThrow(
        'Can only abandon paused batches'
      );
    });
  });

  // =============================================================================
  // getBatch
  // =============================================================================

  describe('getBatch', () => {
    it('should return batch progress information', async () => {
      mockPrisma.batchOperation.findUnique.mockResolvedValue({
        id: 'batch-1',
        type: 'convert',
        status: 'in_progress',
        totalItems: 10,
        completedItems: 5,
        failedItems: 1,
        startedAt: new Date('2024-01-01'),
        completedAt: null,
        lastProcessedPath: '/comics/test.cbz',
        errorSummary: JSON.stringify([{ filename: 'bad.cbr', error: 'Corrupt' }]),
      });

      const result = await getBatch('batch-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('batch-1');
      expect(result!.type).toBe('convert');
      expect(result!.status).toBe('in_progress');
      expect(result!.totalItems).toBe(10);
      expect(result!.completedItems).toBe(5);
      expect(result!.failedItems).toBe(1);
      expect(result!.errors).toHaveLength(1);
    });

    it('should return null when batch not found', async () => {
      mockPrisma.batchOperation.findUnique.mockResolvedValue(null);

      const result = await getBatch('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle batch with no errors', async () => {
      mockPrisma.batchOperation.findUnique.mockResolvedValue({
        id: 'batch-1',
        type: 'convert',
        status: 'completed',
        totalItems: 5,
        completedItems: 5,
        failedItems: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        lastProcessedPath: null,
        errorSummary: null,
      });

      const result = await getBatch('batch-1');

      expect(result!.errors).toEqual([]);
    });

    it('should calculate progress percentage', async () => {
      mockPrisma.batchOperation.findUnique.mockResolvedValue({
        id: 'batch-1',
        type: 'convert',
        status: 'in_progress',
        totalItems: 100,
        completedItems: 50,
        failedItems: 10,
        startedAt: new Date(),
        completedAt: null,
        lastProcessedPath: null,
        errorSummary: null,
      });

      const result = await getBatch('batch-1');

      expect(result!.progress).toBe(60); // (50 + 10) / 100 * 100
    });
  });

  // =============================================================================
  // hasActiveBatch / getActiveBatchId
  // =============================================================================

  describe('hasActiveBatch', () => {
    it('should return false when no batch is running', () => {
      expect(hasActiveBatch()).toBe(false);
    });
  });

  describe('getActiveBatchId', () => {
    it('should return null when no batch is running', () => {
      expect(getActiveBatchId()).toBeNull();
    });
  });

  // =============================================================================
  // Resume functionality
  // =============================================================================

  describe('resume functionality', () => {
    it('should only process remaining files when resuming', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'convert',
        status: 'paused',
        libraryId: 'lib-1',
        totalItems: 5,
        completedItems: 2,
        failedItems: 0,
        lastProcessedId: 'file-2',
        startedAt: new Date(),
        library: createMockLibrary(),
      };
      // Only remaining files are returned (files after file-2)
      const remainingFiles = [
        { id: 'file-3', path: '/comics/test3.cbr', filename: 'test3.cbr' },
        { id: 'file-4', path: '/comics/test4.cbr', filename: 'test4.cbr' },
        { id: 'file-5', path: '/comics/test5.cbr', filename: 'test5.cbr' },
      ];
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.comicFile.findMany.mockResolvedValue(remainingFiles);
      mockPrisma.batchOperation.update.mockResolvedValue({});

      await executeBatch('batch-1');

      // Should only convert the 3 remaining files
      expect(mockConvertCbrToCbz).toHaveBeenCalledTimes(3);
    });

    it('should use lastProcessedId to filter files', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'convert',
        status: 'paused',
        libraryId: 'lib-1',
        totalItems: 3,
        completedItems: 1,
        failedItems: 0,
        lastProcessedId: 'file-1',
        startedAt: new Date(),
        library: createMockLibrary(),
      };
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.comicFile.findMany.mockResolvedValue([]);
      mockPrisma.batchOperation.update.mockResolvedValue({});

      await executeBatch('batch-1');

      // Check that findMany was called with gt filter
      expect(mockPrisma.comicFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { gt: 'file-1' },
          }),
        })
      );
    });
  });

  // =============================================================================
  // Error recovery
  // =============================================================================

  describe('error recovery', () => {
    it('should mark batch as failed on unexpected error', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'convert',
        status: 'pending',
        libraryId: 'lib-1',
        totalItems: 1,
        completedItems: 0,
        failedItems: 0,
        lastProcessedId: null,
        startedAt: null,
        library: createMockLibrary(),
      };
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.batchOperation.update.mockResolvedValue({});
      mockPrisma.comicFile.findMany.mockRejectedValue(new Error('Database connection lost'));

      await expect(executeBatch('batch-1')).rejects.toThrow('Database connection lost');

      // Should update status to failed
      expect(mockPrisma.batchOperation.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: expect.objectContaining({
          status: 'failed',
        }),
      });
    });

    it('should store error summary in failed batch', async () => {
      const batch = {
        ...createMockBatchOperation(),
        id: 'batch-1',
        type: 'convert',
        status: 'pending',
        libraryId: 'lib-1',
        totalItems: 2,
        completedItems: 0,
        failedItems: 0,
        lastProcessedId: null,
        startedAt: null,
        library: createMockLibrary(),
      };
      const files = [
        { id: 'file-1', path: '/test1.cbr', filename: 'test1.cbr' },
        { id: 'file-2', path: '/test2.cbr', filename: 'test2.cbr' },
      ];
      mockPrisma.batchOperation.findUnique.mockResolvedValue(batch);
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.batchOperation.update.mockResolvedValue({});
      mockConvertCbrToCbz
        .mockResolvedValueOnce({ success: false, error: 'Error 1' })
        .mockResolvedValueOnce({ success: false, error: 'Error 2' });

      const result = await executeBatch('batch-1');

      expect(result.errors).toHaveLength(2);
      expect(mockPrisma.batchOperation.update).toHaveBeenLastCalledWith({
        where: { id: 'batch-1' },
        data: expect.objectContaining({
          errorSummary: expect.any(String),
        }),
      });
    });
  });

  // =============================================================================
  // File Renaming Disabled
  // =============================================================================

  describe('when file renaming is disabled', () => {
    beforeEach(() => {
      mockIsFileRenamingEnabled.mockReturnValue(false);
    });

    afterEach(() => {
      mockIsFileRenamingEnabled.mockReturnValue(true);
    });

    describe('createTemplateRenameBatch', () => {
      it('should throw error when renaming is disabled', async () => {
        await expect(createTemplateRenameBatch(['file-1', 'file-2'])).rejects.toThrow(
          'File renaming is disabled. Enable it in Settings to use this feature.'
        );
        expect(mockPrisma.batchOperation.create).not.toHaveBeenCalled();
      });
    });

    describe('createRestoreOriginalBatch', () => {
      it('should throw error when renaming is disabled', async () => {
        await expect(createRestoreOriginalBatch(['file-1', 'file-2'])).rejects.toThrow(
          'File renaming is disabled. Enable it in Settings to use this feature.'
        );
        expect(mockPrisma.batchOperation.create).not.toHaveBeenCalled();
      });
    });
  });
});
