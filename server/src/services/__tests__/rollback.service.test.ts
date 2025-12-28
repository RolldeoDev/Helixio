/**
 * Rollback Service Tests
 *
 * Tests for reversing file operations:
 * - Operation history queries
 * - Individual operation rollback
 * - Batch rollback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockPrismaClient,
  createMockOperationLog,
  createMockComicFile,
} from './__mocks__/prisma.mock.js';

// Create mock prisma client
const mockPrisma = createMockPrismaClient();

// Mock database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockPrisma),
}));

// Mock config service
vi.mock('../config.service.js', () => ({
  loadConfig: vi.fn(() => ({ logRetentionDays: 10 })),
}));

// Mock issue-number-utils
vi.mock('../issue-number-utils.js', () => ({
  computeIssueNumberSort: vi.fn().mockReturnValue('001.00'),
}));

// Mock fs/promises
const mockRename = vi.fn().mockResolvedValue(undefined);
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockAccess = vi.fn();
vi.mock('fs/promises', () => ({
  rename: mockRename,
  mkdir: mockMkdir,
  access: mockAccess,
}));

// Import service after mocking
const {
  getOperationHistory,
  rollbackOperation,
  rollbackBatch,
} = await import('../rollback.service.js');

describe('Rollback Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all file access checks pass (file exists)
    mockAccess.mockResolvedValue(undefined);
  });

  // =============================================================================
  // getOperationHistory
  // =============================================================================

  describe('getOperationHistory', () => {
    it('should return operation history with rollback status', async () => {
      const operations = [
        {
          ...createMockOperationLog(),
          id: 'op-1',
          operation: 'move',
          source: '/old.cbz',
          destination: '/new.cbz',
          status: 'success',
          reversible: true,
          timestamp: new Date(),
          batch: null,
        },
      ];
      mockPrisma.operationLog.findMany
        .mockResolvedValueOnce(operations)
        .mockResolvedValueOnce([]); // No rolled back operations
      mockPrisma.operationLog.count.mockResolvedValue(1);

      const result = await getOperationHistory({});

      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.id).toBe('op-1');
      expect(result.operations[0]!.canRollback).toBe(true);
      expect(result.operations[0]!.alreadyRolledBack).toBe(false);
    });

    it('should mark already rolled back operations', async () => {
      const operations = [
        {
          ...createMockOperationLog(),
          id: 'op-1',
          operation: 'move',
          status: 'success',
          reversible: true,
          timestamp: new Date(),
          batch: null,
        },
      ];
      const rollbackLogs = [
        {
          metadata: JSON.stringify({ originalOperationId: 'op-1' }),
        },
      ];
      mockPrisma.operationLog.findMany
        .mockResolvedValueOnce(operations)
        .mockResolvedValueOnce(rollbackLogs);
      mockPrisma.operationLog.count.mockResolvedValue(1);

      const result = await getOperationHistory({});

      expect(result.operations[0]!.alreadyRolledBack).toBe(true);
      expect(result.operations[0]!.canRollback).toBe(false);
    });

    it('should filter by operation type', async () => {
      mockPrisma.operationLog.findMany.mockResolvedValue([]);
      mockPrisma.operationLog.count.mockResolvedValue(0);

      await getOperationHistory({ operation: 'move' });

      expect(mockPrisma.operationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            operation: 'move',
          }),
        })
      );
    });

    it('should filter by status', async () => {
      mockPrisma.operationLog.findMany.mockResolvedValue([]);
      mockPrisma.operationLog.count.mockResolvedValue(0);

      await getOperationHistory({ status: 'success' });

      expect(mockPrisma.operationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'success',
          }),
        })
      );
    });

    it('should respect limit and offset', async () => {
      mockPrisma.operationLog.findMany.mockResolvedValue([]);
      mockPrisma.operationLog.count.mockResolvedValue(0);

      await getOperationHistory({ limit: 50, offset: 10 });

      expect(mockPrisma.operationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 10,
        })
      );
    });

    it('should filter by library ID via batch', async () => {
      const operations = [
        {
          ...createMockOperationLog(),
          id: 'op-1',
          batch: { id: 'batch-1', type: 'convert', libraryId: 'lib-1' },
          timestamp: new Date(),
        },
        {
          ...createMockOperationLog(),
          id: 'op-2',
          batch: { id: 'batch-2', type: 'convert', libraryId: 'lib-2' },
          timestamp: new Date(),
        },
      ];
      mockPrisma.operationLog.findMany
        .mockResolvedValueOnce(operations)
        .mockResolvedValueOnce([]);
      mockPrisma.operationLog.count.mockResolvedValue(2);

      const result = await getOperationHistory({ libraryId: 'lib-1' });

      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.id).toBe('op-1');
    });

    it('should parse metadata correctly', async () => {
      const operations = [
        {
          ...createMockOperationLog(),
          id: 'op-1',
          metadata: JSON.stringify({ fileId: 'file-1', reason: 'test' }),
          timestamp: new Date(),
          batch: null,
        },
      ];
      mockPrisma.operationLog.findMany
        .mockResolvedValueOnce(operations)
        .mockResolvedValueOnce([]);
      mockPrisma.operationLog.count.mockResolvedValue(1);

      const result = await getOperationHistory({});

      expect(result.operations[0]!.metadata).toEqual({ fileId: 'file-1', reason: 'test' });
    });

    it('should handle invalid metadata JSON', async () => {
      const operations = [
        {
          ...createMockOperationLog(),
          id: 'op-1',
          metadata: 'invalid json',
          timestamp: new Date(),
          batch: null,
        },
      ];
      mockPrisma.operationLog.findMany
        .mockResolvedValueOnce(operations)
        .mockResolvedValueOnce([]);
      mockPrisma.operationLog.count.mockResolvedValue(1);

      const result = await getOperationHistory({});

      expect(result.operations[0]!.metadata).toBeUndefined();
    });
  });

  // =============================================================================
  // rollbackOperation
  // =============================================================================

  describe('rollbackOperation', () => {
    it('should rollback a move operation', async () => {
      const operation = {
        ...createMockOperationLog(),
        id: 'op-1',
        operation: 'move',
        source: '/old/path.cbz',
        destination: '/new/path.cbz',
        status: 'success',
        reversible: true,
        metadata: JSON.stringify({ fileId: 'file-1' }),
      };
      mockPrisma.operationLog.findUnique.mockResolvedValue(operation);
      mockPrisma.operationLog.findFirst.mockResolvedValue(null); // No existing rollback

      // Destination exists, source doesn't
      mockAccess
        .mockResolvedValueOnce(undefined) // destination exists
        .mockRejectedValueOnce(new Error('ENOENT')); // source doesn't exist

      mockPrisma.comicFile.findUnique.mockResolvedValue({
        ...createMockComicFile({ id: 'file-1' }),
        library: { rootPath: '/comics' },
      });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'rollback-1' });

      const result = await rollbackOperation('op-1');

      expect(result.success).toBe(true);
      expect(mockRename).toHaveBeenCalledWith('/new/path.cbz', '/old/path.cbz');
    });

    it('should return error when operation not found', async () => {
      mockPrisma.operationLog.findUnique.mockResolvedValue(null);

      const result = await rollbackOperation('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for non-reversible operations', async () => {
      mockPrisma.operationLog.findUnique.mockResolvedValue({
        ...createMockOperationLog(),
        id: 'op-1',
        operation: 'delete',
        reversible: false,
      });

      const result = await rollbackOperation('op-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not reversible');
    });

    it('should return error when already rolled back', async () => {
      mockPrisma.operationLog.findUnique.mockResolvedValue({
        ...createMockOperationLog(),
        id: 'op-1',
        operation: 'move',
        reversible: true,
      });
      mockPrisma.operationLog.findFirst.mockResolvedValue({
        metadata: JSON.stringify({ originalOperationId: 'op-1' }),
      });

      const result = await rollbackOperation('op-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already been rolled back');
    });

    it('should handle file not existing at destination', async () => {
      const operation = {
        ...createMockOperationLog(),
        id: 'op-1',
        operation: 'move',
        source: '/old.cbz',
        destination: '/new.cbz',
        reversible: true,
        status: 'success',
        metadata: JSON.stringify({ fileId: 'file-1' }),
      };
      mockPrisma.operationLog.findUnique.mockResolvedValue(operation);
      mockPrisma.operationLog.findFirst.mockResolvedValue(null);
      // Destination doesn't exist
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await rollbackOperation('op-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found at destination');
    });

    it('should handle original location being occupied', async () => {
      const operation = {
        ...createMockOperationLog(),
        id: 'op-1',
        operation: 'move',
        source: '/old.cbz',
        destination: '/new.cbz',
        reversible: true,
        status: 'success',
        metadata: JSON.stringify({ fileId: 'file-1' }),
      };
      mockPrisma.operationLog.findUnique.mockResolvedValue(operation);
      mockPrisma.operationLog.findFirst.mockResolvedValue(null);
      // Both locations exist
      mockAccess.mockResolvedValue(undefined);

      const result = await rollbackOperation('op-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Original location is occupied');
    });

    it('should rollback a rename operation', async () => {
      const operation = {
        ...createMockOperationLog(),
        id: 'op-1',
        operation: 'rename',
        source: '/comics/old-name.cbz',
        destination: '/comics/new-name.cbz',
        status: 'success',
        reversible: true,
        metadata: JSON.stringify({ fileId: 'file-1' }),
      };
      mockPrisma.operationLog.findUnique.mockResolvedValue(operation);
      mockPrisma.operationLog.findFirst.mockResolvedValue(null);

      // Destination exists, source doesn't
      mockAccess
        .mockResolvedValueOnce(undefined) // destination exists
        .mockRejectedValueOnce(new Error('ENOENT')); // source doesn't exist

      mockPrisma.comicFile.findUnique.mockResolvedValue({
        ...createMockComicFile({ id: 'file-1' }),
        library: { rootPath: '/comics' },
      });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'rollback-1' });

      const result = await rollbackOperation('op-1');

      expect(result.success).toBe(true);
      expect(mockRename).toHaveBeenCalledWith('/comics/new-name.cbz', '/comics/old-name.cbz');
    });

    it('should update database record on successful rollback', async () => {
      const operation = {
        ...createMockOperationLog(),
        id: 'op-1',
        operation: 'move',
        source: '/old/file.cbz',
        destination: '/new/file.cbz',
        status: 'success',
        reversible: true,
        metadata: JSON.stringify({ fileId: 'file-1' }),
      };
      mockPrisma.operationLog.findUnique.mockResolvedValue(operation);
      mockPrisma.operationLog.findFirst.mockResolvedValue(null);

      // Destination exists, source doesn't
      mockAccess
        .mockResolvedValueOnce(undefined) // destination exists
        .mockRejectedValueOnce(new Error('ENOENT')); // source doesn't exist

      mockPrisma.comicFile.findUnique.mockResolvedValue({
        ...createMockComicFile({ id: 'file-1' }),
        library: { rootPath: '/comics' },
      });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'rollback-1' });

      await rollbackOperation('op-1');

      expect(mockPrisma.comicFile.update).toHaveBeenCalled();
    });

    it('should create rollback log entry', async () => {
      const operation = {
        ...createMockOperationLog(),
        id: 'op-1',
        operation: 'move',
        source: '/old/file.cbz',
        destination: '/new/file.cbz',
        status: 'success',
        reversible: true,
        metadata: JSON.stringify({ fileId: 'file-1' }),
      };
      mockPrisma.operationLog.findUnique.mockResolvedValue(operation);
      mockPrisma.operationLog.findFirst.mockResolvedValue(null);

      // Destination exists, source doesn't
      mockAccess
        .mockResolvedValueOnce(undefined) // destination exists
        .mockRejectedValueOnce(new Error('ENOENT')); // source doesn't exist

      mockPrisma.comicFile.findUnique.mockResolvedValue({
        ...createMockComicFile({ id: 'file-1' }),
        library: { rootPath: '/comics' },
      });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'rollback-1' });

      await rollbackOperation('op-1');

      expect(mockPrisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operation: 'rollback',
          }),
        })
      );
    });

    it('should return error for failed original operation', async () => {
      mockPrisma.operationLog.findUnique.mockResolvedValue({
        ...createMockOperationLog(),
        id: 'op-1',
        operation: 'move',
        reversible: true,
        status: 'failed',
      });
      mockPrisma.operationLog.findFirst.mockResolvedValue(null);

      const result = await rollbackOperation('op-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot rollback operation with status: failed');
    });

    it('should return error for unsupported operation type', async () => {
      mockPrisma.operationLog.findUnique.mockResolvedValue({
        ...createMockOperationLog(),
        id: 'op-1',
        operation: 'unknown_op',
        reversible: true,
        status: 'success',
      });
      mockPrisma.operationLog.findFirst.mockResolvedValue(null);

      const result = await rollbackOperation('op-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rollback not supported for operation type');
    });
  });

  // =============================================================================
  // rollbackBatch
  // =============================================================================

  describe('rollbackBatch', () => {
    it('should rollback all operations in a batch', async () => {
      const operations = [
        {
          ...createMockOperationLog(),
          id: 'op-1',
          operation: 'move',
          source: '/old1.cbz',
          destination: '/new1.cbz',
          reversible: true,
          status: 'success',
          metadata: JSON.stringify({ fileId: 'file-1' }),
        },
        {
          ...createMockOperationLog(),
          id: 'op-2',
          operation: 'move',
          source: '/old2.cbz',
          destination: '/new2.cbz',
          reversible: true,
          status: 'success',
          metadata: JSON.stringify({ fileId: 'file-2' }),
        },
      ];
      mockPrisma.operationLog.findMany.mockResolvedValue(operations);
      mockPrisma.operationLog.findUnique
        .mockResolvedValueOnce(operations[0])
        .mockResolvedValueOnce(operations[1]);
      mockPrisma.operationLog.findFirst.mockResolvedValue(null);

      // For each operation: destination exists, source doesn't
      mockAccess
        .mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('ENOENT'));

      mockPrisma.comicFile.findUnique.mockResolvedValue({
        ...createMockComicFile(),
        library: { rootPath: '/comics' },
      });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'rollback-1' });

      const result = await rollbackBatch('batch-1');

      expect(result.batchId).toBe('batch-1');
      expect(result.totalOperations).toBe(2);
      expect(result.rolledBack).toBe(2);
    });

    it('should only include successful reversible operations (non-reversible filtered by query)', async () => {
      // The query filters for status: 'success' and reversible: true
      // So non-reversible operations won't be returned at all
      mockPrisma.operationLog.findMany.mockResolvedValue([]);

      const result = await rollbackBatch('batch-1');

      expect(result.totalOperations).toBe(0);
      expect(result.rolledBack).toBe(0);
    });

    it('should handle empty batch', async () => {
      mockPrisma.operationLog.findMany.mockResolvedValue([]);

      const result = await rollbackBatch('empty-batch');

      expect(result.totalOperations).toBe(0);
      expect(result.results).toEqual([]);
    });

    it('should report partial failures', async () => {
      const operations = [
        {
          ...createMockOperationLog(),
          id: 'op-1',
          operation: 'move',
          source: '/old1.cbz',
          destination: '/new1.cbz',
          reversible: true,
          status: 'success',
          metadata: JSON.stringify({ fileId: 'file-1' }),
        },
        {
          ...createMockOperationLog(),
          id: 'op-2',
          operation: 'move',
          source: '/old2.cbz',
          destination: '/new2.cbz',
          reversible: true,
          status: 'success',
          metadata: JSON.stringify({ fileId: 'file-2' }),
        },
      ];
      mockPrisma.operationLog.findMany.mockResolvedValue(operations);
      mockPrisma.operationLog.findUnique
        .mockResolvedValueOnce(operations[0])
        .mockResolvedValueOnce(operations[1]);
      mockPrisma.operationLog.findFirst.mockResolvedValue(null);

      // First operation: destination exists, source doesn't - succeeds
      // Second operation: destination doesn't exist - fails
      mockAccess
        .mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT')); // second op fails: dest not found

      mockPrisma.comicFile.findUnique.mockResolvedValue({
        ...createMockComicFile(),
        library: { rootPath: '/comics' },
      });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockPrisma.operationLog.create.mockResolvedValue({ id: 'rollback-1' });

      const result = await rollbackBatch('batch-1');

      expect(result.totalOperations).toBe(2);
      expect(result.rolledBack).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should skip already rolled back operations', async () => {
      const operations = [
        {
          ...createMockOperationLog(),
          id: 'op-1',
          operation: 'move',
          source: '/old.cbz',
          destination: '/new.cbz',
          reversible: true,
          status: 'success',
          metadata: JSON.stringify({ fileId: 'file-1' }),
        },
      ];
      mockPrisma.operationLog.findMany.mockResolvedValue(operations);
      mockPrisma.operationLog.findUnique.mockResolvedValue(operations[0]);
      // Already rolled back
      mockPrisma.operationLog.findFirst.mockResolvedValue({
        metadata: JSON.stringify({ originalOperationId: 'op-1' }),
      });

      const result = await rollbackBatch('batch-1');

      expect(result.skipped).toBe(1);
      expect(result.rolledBack).toBe(0);
    });

    it('should process operations in reverse order', async () => {
      mockPrisma.operationLog.findMany.mockResolvedValue([]);

      await rollbackBatch('batch-1');

      expect(mockPrisma.operationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { timestamp: 'desc' },
        })
      );
    });
  });
});
