/**
 * File Operations Service Tests
 *
 * Tests for file system operations with database synchronization:
 * - Move, rename, delete operations
 * - Quarantine and restore functionality
 * - Folder rename operations
 * - File verification
 * - Orphaned record cleanup
 * - Operation logging for rollback support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockPrismaClient,
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

// Mock logger service
vi.mock('../logger.service.js', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  createServiceLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock fs/promises
const mockRename = vi.fn().mockResolvedValue(undefined);
const mockUnlink = vi.fn().mockResolvedValue(undefined);
const mockCopyFile = vi.fn().mockResolvedValue(undefined);
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockAccess = vi.fn().mockResolvedValue(undefined);
const mockStat = vi.fn().mockResolvedValue({ size: 50000000 });
vi.mock('fs/promises', () => ({
  rename: mockRename,
  unlink: mockUnlink,
  copyFile: mockCopyFile,
  mkdir: mockMkdir,
  access: mockAccess,
  stat: mockStat,
}));

// Mock hash service
const mockGeneratePartialHash = vi.fn().mockResolvedValue('abc123');
vi.mock('../hash.service.js', () => ({
  generatePartialHash: mockGeneratePartialHash,
}));

// Mock series service
const mockCheckAndSoftDeleteEmptySeries = vi.fn().mockResolvedValue(false);
vi.mock('../series/index.js', () => ({
  checkAndSoftDeleteEmptySeries: mockCheckAndSoftDeleteEmptySeries,
}));

// Mock collection service
const mockMarkFileItemsUnavailable = vi.fn().mockResolvedValue(undefined);
vi.mock('../collection/index.js', () => ({
  markFileItemsUnavailable: mockMarkFileItemsUnavailable,
}));

// Mock cover service
const mockRecalculateSeriesCover = vi.fn().mockResolvedValue(undefined);
const mockOnCoverSourceChanged = vi.fn().mockResolvedValue(undefined);
vi.mock('../cover.service.js', () => ({
  recalculateSeriesCover: mockRecalculateSeriesCover,
  onCoverSourceChanged: mockOnCoverSourceChanged,
}));

// Mock config service - file renaming enabled by default for most tests
const mockIsFileRenamingEnabled = vi.fn().mockReturnValue(true);
vi.mock('../config.service.js', () => ({
  isFileRenamingEnabled: mockIsFileRenamingEnabled,
}));

// Import service after mocking
const {
  moveFile,
  renameFile,
  deleteFile,
  quarantineFile,
  restoreFromQuarantine,
  removeOrphanedRecords,
  renameFolder,
  verifyFile,
} = await import('../file-operations.service.js');

describe('File Operations Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // moveFile
  // =============================================================================

  describe('moveFile', () => {
    it('should move a file successfully', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/Batman/Batman 001.cbz',
        relativePath: 'Batman/Batman 001.cbz',
        filename: 'Batman 001.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      // Source exists, destination doesn't
      mockAccess
        .mockResolvedValueOnce(undefined) // source exists
        .mockRejectedValueOnce(new Error('ENOENT')); // destination doesn't exist

      const result = await moveFile('file-1', '/comics/DC/Batman 001.cbz');

      expect(result.success).toBe(true);
      expect(result.operation).toBe('move');
      expect(result.source).toBe('/comics/Batman/Batman 001.cbz');
      expect(result.destination).toBe('/comics/DC/Batman 001.cbz');
      expect(result.logId).toBe('log-1');
      expect(mockRename).toHaveBeenCalledWith(
        '/comics/Batman/Batman 001.cbz',
        '/comics/DC/Batman 001.cbz'
      );
    });

    it('should return error when file not found', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await moveFile('nonexistent', '/comics/dest.cbz');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('should return error when source does not exist', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/missing.cbz',
        library: createMockLibrary(),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await moveFile('file-1', '/comics/dest.cbz');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Source file does not exist');
    });

    it('should return error when destination exists without overwrite', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/source.cbz',
        library: createMockLibrary(),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      // Both source and destination exist
      mockAccess.mockResolvedValue(undefined);

      const result = await moveFile('file-1', '/comics/existing.cbz');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Destination file already exists');
    });

    it('should overwrite destination when overwrite option is set', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/source.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });

      const result = await moveFile('file-1', '/comics/existing.cbz', { overwrite: true });

      expect(result.success).toBe(true);
      expect(mockRename).toHaveBeenCalled();
    });

    it('should create directories when createDirs option is set', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/source.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      // Source exists, destination doesn't
      mockAccess
        .mockResolvedValueOnce(undefined) // source exists
        .mockRejectedValueOnce(new Error('ENOENT')); // destination doesn't exist

      const result = await moveFile('file-1', '/comics/new/folder/file.cbz', { createDirs: true });

      expect(result.success).toBe(true);
      expect(mockMkdir).toHaveBeenCalledWith('/comics/new/folder', { recursive: true });
    });

    it('should update database with new path and filename', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/old.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockAccess
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'));

      await moveFile('file-1', '/comics/subdir/new.cbz');

      expect(mockPrisma.comicFile.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: {
          path: '/comics/subdir/new.cbz',
          relativePath: 'subdir/new.cbz',
          filename: 'new.cbz',
          folderId: null, // No folder materialization in test mocks
        },
      });
    });

    it('should log operation with metadata', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/old.cbz',
        filename: 'old.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockAccess
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'));

      await moveFile('file-1', '/comics/new.cbz', { batchId: 'batch-1' });

      expect(mockPrisma.operationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operation: 'move',
          source: '/comics/old.cbz',
          destination: '/comics/new.cbz',
          status: 'success',
          reversible: true,
          batchId: 'batch-1',
        }),
      });
    });

    it('should handle rename error and log failure', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/source.cbz',
        library: createMockLibrary(),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockAccess
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'));
      mockRename.mockRejectedValueOnce(new Error('Permission denied'));

      const result = await moveFile('file-1', '/comics/dest.cbz');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
      expect(mockPrisma.operationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'failed',
          reversible: false,
        }),
      });
    });
  });

  // =============================================================================
  // renameFile
  // =============================================================================

  describe('renameFile', () => {
    it('should rename a file within the same directory', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/Batman/Batman 001.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockAccess
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'));

      const result = await renameFile('file-1', 'Batman Issue 1.cbz');

      expect(result.success).toBe(true);
      expect(mockRename).toHaveBeenCalledWith(
        '/comics/Batman/Batman 001.cbz',
        '/comics/Batman/Batman Issue 1.cbz'
      );
    });

    it('should return error when file not found', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await renameFile('nonexistent', 'new.cbz');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('should pass batchId to moveFile', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/old.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockAccess
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'));

      await renameFile('file-1', 'new.cbz', { batchId: 'batch-1' });

      expect(mockPrisma.operationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ batchId: 'batch-1' }),
      });
    });
  });

  // =============================================================================
  // deleteFile
  // =============================================================================

  describe('deleteFile', () => {
    it('should delete a file and remove from database', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/Batman 001.cbz',
        filename: 'Batman 001.cbz',
        size: 50000,
        hash: 'abc123',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.delete.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });

      const result = await deleteFile('file-1');

      expect(result.success).toBe(true);
      expect(result.operation).toBe('delete');
      expect(mockUnlink).toHaveBeenCalledWith('/comics/Batman 001.cbz');
      expect(mockPrisma.comicFile.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
    });

    it('should return error when file not found', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await deleteFile('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('should still delete from database if file does not exist on disk', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/missing.cbz',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.delete.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await deleteFile('file-1');

      expect(result.success).toBe(true);
      expect(mockUnlink).not.toHaveBeenCalled();
      expect(mockPrisma.comicFile.delete).toHaveBeenCalled();
    });

    it('should log operation as not reversible', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/test.cbz',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.delete.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });

      await deleteFile('file-1', { batchId: 'batch-1' });

      expect(mockPrisma.operationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operation: 'delete',
          reversible: false,
          batchId: 'batch-1',
        }),
      });
    });

    it('should handle deletion error', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/protected.cbz',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockUnlink.mockRejectedValueOnce(new Error('Permission denied'));

      const result = await deleteFile('file-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('should recalculate series cover after deletion if file belonged to series', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        seriesId: 'series-1',
        path: '/comics/Batman 001.cbz',
        filename: 'Batman 001.cbz',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.delete.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockRecalculateSeriesCover.mockClear();
      mockOnCoverSourceChanged.mockClear();

      await deleteFile('file-1');

      // Should call onCoverSourceChanged to update any series using this file as cover
      expect(mockOnCoverSourceChanged).toHaveBeenCalledWith('file', 'file-1');
      // Should recalculate the file's own series cover
      expect(mockRecalculateSeriesCover).toHaveBeenCalledWith('series-1');
    });

    it('should not recalculate cover if file had no series', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        seriesId: null,
        path: '/comics/standalone.cbz',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.delete.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockRecalculateSeriesCover.mockClear();
      mockOnCoverSourceChanged.mockClear();

      await deleteFile('file-1');

      // Should still call onCoverSourceChanged (in case file was used as cover for other series)
      expect(mockOnCoverSourceChanged).toHaveBeenCalledWith('file', 'file-1');
      // Should not call recalculateSeriesCover since file had no series
      expect(mockRecalculateSeriesCover).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // quarantineFile
  // =============================================================================

  describe('quarantineFile', () => {
    it('should move file to quarantine directory', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/Batman/Batman 001.cbz',
        relativePath: 'Batman/Batman 001.cbz',
        filename: 'Batman 001.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });

      const result = await quarantineFile('file-1', 'Corrupted archive');

      expect(result.success).toBe(true);
      expect(result.operation).toBe('quarantine');
      expect(result.destination).toBe('/comics/CorruptedData/Batman/Batman 001.cbz');
      expect(mockMkdir).toHaveBeenCalledWith('/comics/CorruptedData/Batman', { recursive: true });
      expect(mockRename).toHaveBeenCalled();
    });

    it('should return error when file not found', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await quarantineFile('nonexistent', 'reason');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('should update file status to quarantined', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/Batman/test.cbz',
        relativePath: 'Batman/test.cbz',
        filename: 'test.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });

      await quarantineFile('file-1', 'reason');

      expect(mockPrisma.comicFile.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: {
          status: 'quarantined',
          path: '/comics/CorruptedData/Batman/test.cbz',
          relativePath: 'CorruptedData/Batman/test.cbz',
        },
      });
    });

    it('should handle already missing source file gracefully', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/missing.cbz',
        relativePath: 'missing.cbz',
        filename: 'missing.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await quarantineFile('file-1', 'Already gone');

      expect(result.success).toBe(true);
      expect(mockRename).not.toHaveBeenCalled();
    });

    it('should log quarantine reason in metadata', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/test.cbz',
        relativePath: 'test.cbz',
        filename: 'test.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });

      await quarantineFile('file-1', 'Invalid format');

      expect(mockPrisma.operationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operation: 'quarantine',
          metadata: expect.stringContaining('Invalid format'),
        }),
      });
    });

    it('should handle quarantine error', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/test.cbz',
        relativePath: 'test.cbz',
        filename: 'test.cbz',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockRename.mockRejectedValueOnce(new Error('Disk full'));

      const result = await quarantineFile('file-1', 'reason');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Disk full');
    });
  });

  // =============================================================================
  // restoreFromQuarantine
  // =============================================================================

  describe('restoreFromQuarantine', () => {
    it('should restore file to original location', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/CorruptedData/Batman/test.cbz',
        status: 'quarantined',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      const log = {
        ...createMockOperationLog(),
        source: '/comics/Batman/test.cbz',
        destination: '/comics/CorruptedData/Batman/test.cbz',
        operation: 'quarantine',
        status: 'success',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.operationLog.findMany.mockResolvedValue([log]);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-2' });

      const result = await restoreFromQuarantine('file-1');

      expect(result.success).toBe(true);
      expect(result.operation).toBe('restore');
      expect(mockRename).toHaveBeenCalledWith(
        '/comics/CorruptedData/Batman/test.cbz',
        '/comics/Batman/test.cbz'
      );
    });

    it('should return error when file not found', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await restoreFromQuarantine('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('should return error when file is not quarantined', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/test.cbz',
        status: 'indexed',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      const result = await restoreFromQuarantine('file-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File is not quarantined');
    });

    it('should return error when original location not found in logs', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/CorruptedData/test.cbz',
        status: 'quarantined',
        library: createMockLibrary(),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.operationLog.findMany.mockResolvedValue([]);

      const result = await restoreFromQuarantine('file-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Could not find original location in operation logs');
    });

    it('should return error when quarantined file is missing', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/CorruptedData/missing.cbz',
        status: 'quarantined',
        library: createMockLibrary(),
      };
      const log = {
        ...createMockOperationLog(),
        source: '/comics/test.cbz',
        destination: '/comics/CorruptedData/missing.cbz',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.operationLog.findMany.mockResolvedValue([log]);
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await restoreFromQuarantine('file-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Quarantined file not found');
    });

    it('should update file status to pending after restore', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/CorruptedData/test.cbz',
        status: 'quarantined',
        library: createMockLibrary({ rootPath: '/comics' }),
      };
      const log = {
        ...createMockOperationLog(),
        source: '/comics/original.cbz',
        destination: '/comics/CorruptedData/test.cbz',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.operationLog.findMany.mockResolvedValue([log]);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-2' });

      await restoreFromQuarantine('file-1');

      expect(mockPrisma.comicFile.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: expect.objectContaining({
          status: 'pending',
          path: '/comics/original.cbz',
        }),
      });
    });
  });

  // =============================================================================
  // removeOrphanedRecords
  // =============================================================================

  describe('removeOrphanedRecords', () => {
    it('should delete orphaned file records', async () => {
      const orphanedFiles = [
        { id: 'file-1', seriesId: 'series-1' },
        { id: 'file-2', seriesId: 'series-1' },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(orphanedFiles);
      mockPrisma.comicFile.deleteMany.mockResolvedValue({ count: 2 });

      const result = await removeOrphanedRecords('lib-1');

      expect(result).toBe(2);
      expect(mockPrisma.comicFile.deleteMany).toHaveBeenCalledWith({
        where: { libraryId: 'lib-1', status: 'orphaned' },
      });
    });

    it('should return 0 when no orphaned files exist', async () => {
      mockPrisma.comicFile.findMany.mockResolvedValue([]);

      const result = await removeOrphanedRecords('lib-1');

      expect(result).toBe(0);
      expect(mockPrisma.comicFile.deleteMany).not.toHaveBeenCalled();
    });

    it('should mark collection items as unavailable', async () => {
      const orphanedFiles = [
        { id: 'file-1', seriesId: null },
        { id: 'file-2', seriesId: null },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(orphanedFiles);
      mockPrisma.comicFile.deleteMany.mockResolvedValue({ count: 2 });

      await removeOrphanedRecords('lib-1');

      expect(mockMarkFileItemsUnavailable).toHaveBeenCalledWith('file-1');
      expect(mockMarkFileItemsUnavailable).toHaveBeenCalledWith('file-2');
    });

    it('should check for empty series after deletion', async () => {
      const orphanedFiles = [
        { id: 'file-1', seriesId: 'series-1' },
        { id: 'file-2', seriesId: 'series-2' },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(orphanedFiles);
      mockPrisma.comicFile.deleteMany.mockResolvedValue({ count: 2 });

      await removeOrphanedRecords('lib-1');

      expect(mockCheckAndSoftDeleteEmptySeries).toHaveBeenCalledWith('series-1');
      expect(mockCheckAndSoftDeleteEmptySeries).toHaveBeenCalledWith('series-2');
    });
  });

  // =============================================================================
  // renameFolder
  // =============================================================================

  describe('renameFolder', () => {
    it('should rename a folder and update file paths', async () => {
      const library = createMockLibrary({ id: 'lib-1', rootPath: '/comics' });
      const files = [
        { id: 'file-1', relativePath: 'Marvel/Spider-Man 001.cbz', filename: 'Spider-Man 001.cbz' },
        { id: 'file-2', relativePath: 'Marvel/Spider-Man 002.cbz', filename: 'Spider-Man 002.cbz' },
      ];
      mockPrisma.library.findUnique.mockResolvedValue(library);
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockAccess
        .mockResolvedValueOnce(undefined) // source exists
        .mockRejectedValueOnce(new Error('ENOENT')); // destination doesn't exist

      const result = await renameFolder('lib-1', 'Marvel', 'Marvel Comics');

      expect(result.success).toBe(true);
      expect(result.filesUpdated).toBe(2);
      expect(mockRename).toHaveBeenCalledWith('/comics/Marvel', '/comics/Marvel Comics');
    });

    it('should return error when library not found', async () => {
      mockPrisma.library.findUnique.mockResolvedValue(null);

      const result = await renameFolder('nonexistent', 'folder', 'new');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Library not found');
    });

    it('should reject folder names with path separators', async () => {
      const library = createMockLibrary({ id: 'lib-1' });
      mockPrisma.library.findUnique.mockResolvedValue(library);

      const result = await renameFolder('lib-1', 'Marvel', 'Marvel/Comics');

      expect(result.success).toBe(false);
      expect(result.error).toBe('New folder name cannot contain path separators');
    });

    it('should return error when source folder does not exist', async () => {
      const library = createMockLibrary({ id: 'lib-1', rootPath: '/comics' });
      mockPrisma.library.findUnique.mockResolvedValue(library);
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await renameFolder('lib-1', 'Missing', 'NewName');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Source folder does not exist');
    });

    it('should return error when destination folder exists', async () => {
      const library = createMockLibrary({ id: 'lib-1', rootPath: '/comics' });
      mockPrisma.library.findUnique.mockResolvedValue(library);
      // Both exist
      mockAccess.mockResolvedValue(undefined);

      const result = await renameFolder('lib-1', 'Marvel', 'DC');

      expect(result.success).toBe(false);
      expect(result.error).toBe('A folder with that name already exists');
    });

    it('should handle nested folder paths', async () => {
      const library = createMockLibrary({ id: 'lib-1', rootPath: '/comics' });
      const files = [
        { id: 'file-1', relativePath: 'Publisher/Marvel/Spider-Man 001.cbz', filename: 'Spider-Man 001.cbz' },
      ];
      mockPrisma.library.findUnique.mockResolvedValue(library);
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockAccess
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'));

      const result = await renameFolder('lib-1', 'Publisher/Marvel', 'Marvel Comics');

      expect(result.success).toBe(true);
      expect(result.newPath).toBe('Publisher/Marvel Comics');
    });

    it('should rollback on database error', async () => {
      const library = createMockLibrary({ id: 'lib-1', rootPath: '/comics' });
      const files = [
        { id: 'file-1', relativePath: 'Marvel/test.cbz', filename: 'test.cbz' },
      ];
      mockPrisma.library.findUnique.mockResolvedValue(library);
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.comicFile.update.mockRejectedValue(new Error('DB error'));
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'log-1' });
      mockAccess
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(undefined); // new folder exists for rollback

      const result = await renameFolder('lib-1', 'Marvel', 'NewName');

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB error');
      // Should attempt rollback
      expect(mockRename).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================================================
  // verifyFile
  // =============================================================================

  describe('verifyFile', () => {
    it('should verify file exists with matching size and hash', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/test.cbz',
        size: 50000000,
        hash: 'abc123',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockStat.mockResolvedValue({ size: 50000000 });
      mockGeneratePartialHash.mockResolvedValue('abc123');

      const result = await verifyFile('file-1');

      expect(result.exists).toBe(true);
      expect(result.sizeMatch).toBe(true);
      expect(result.hashMatch).toBe(true);
    });

    it('should return exists false when file not in database', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await verifyFile('nonexistent');

      expect(result.exists).toBe(false);
      expect(result.hashMatch).toBeNull();
      expect(result.sizeMatch).toBeNull();
    });

    it('should return exists false when file not on disk', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/missing.cbz',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockStat.mockRejectedValue(new Error('ENOENT'));

      const result = await verifyFile('file-1');

      expect(result.exists).toBe(false);
    });

    it('should detect size mismatch', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/test.cbz',
        size: 50000000,
        hash: null,
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockStat.mockResolvedValue({ size: 40000000 });

      const result = await verifyFile('file-1');

      expect(result.exists).toBe(true);
      expect(result.sizeMatch).toBe(false);
      expect(result.hashMatch).toBeNull(); // No hash to compare
    });

    it('should detect hash mismatch', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/test.cbz',
        size: 50000000,
        hash: 'abc123',
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockStat.mockResolvedValue({ size: 50000000 });
      mockGeneratePartialHash.mockResolvedValue('different_hash');

      const result = await verifyFile('file-1');

      expect(result.exists).toBe(true);
      expect(result.sizeMatch).toBe(true);
      expect(result.hashMatch).toBe(false);
    });

    it('should skip hash comparison when file has no hash', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        path: '/comics/test.cbz',
        size: 50000000,
        hash: null,
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockStat.mockResolvedValue({ size: 50000000 });

      const result = await verifyFile('file-1');

      expect(result.hashMatch).toBeNull();
      expect(mockGeneratePartialHash).not.toHaveBeenCalled();
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

    describe('moveFile', () => {
      it('should return error when renaming is disabled', async () => {
        const result = await moveFile('file-1', '/comics/dest.cbz');

        expect(result.success).toBe(false);
        expect(result.error).toBe('File renaming is disabled. Enable it in Settings to use this feature.');
        expect(mockPrisma.comicFile.findUnique).not.toHaveBeenCalled();
        expect(mockRename).not.toHaveBeenCalled();
      });
    });

    describe('renameFile', () => {
      it('should return error when renaming is disabled', async () => {
        const result = await renameFile('file-1', 'new.cbz');

        expect(result.success).toBe(false);
        expect(result.error).toBe('File renaming is disabled. Enable it in Settings to use this feature.');
        expect(mockRename).not.toHaveBeenCalled();
      });
    });

    describe('renameFolder', () => {
      it('should return error when renaming is disabled', async () => {
        const result = await renameFolder('lib-1', 'Marvel', 'Marvel Comics');

        expect(result.success).toBe(false);
        expect(result.error).toBe('File renaming is disabled. Enable it in Settings to use this feature.');
        expect(mockPrisma.library.findUnique).not.toHaveBeenCalled();
        expect(mockRename).not.toHaveBeenCalled();
      });
    });
  });
});
