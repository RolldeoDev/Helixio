/**
 * Reading Queue Service Tests
 *
 * Tests for reading queue management: add/remove, reorder, navigation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from '../database.service.js';
import {
  getQueue,
  addToQueue,
  addManyToQueue,
  removeFromQueue,
  clearQueue,
  isInQueue,
  getQueuePosition,
  moveInQueue,
  reorderQueue,
  moveToFront,
  moveToEnd,
  getNextInQueue,
  popFromQueue,
  getNextAfter,
} from '../reading-queue.service.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('ReadingQueueService', () => {
  let mockDb: {
    readingQueue: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    comicFile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    $executeRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
  };

  const createMockFile = (id: string, filename: string) => ({
    id,
    filename,
    relativePath: `comics/${filename}`,
    libraryId: 'lib-1',
    readingProgress: {
      currentPage: 5,
      totalPages: 25,
    },
  });

  const createMockQueueItem = (fileId: string, position: number, filename: string = 'comic.cbz') => ({
    id: `queue-${fileId}`,
    fileId,
    position,
    addedAt: new Date('2024-01-01'),
    file: createMockFile(fileId, filename),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      readingQueue: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      comicFile: {
        findUnique: vi.fn(),
      },
      $executeRaw: vi.fn().mockResolvedValue(0),
      $transaction: vi.fn().mockImplementation((promises) => Promise.all(promises)),
    };

    vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>);
  });

  // ===========================================================================
  // Queue CRUD Tests
  // ===========================================================================

  describe('getQueue', () => {
    it('should return empty queue when no items', async () => {
      mockDb.readingQueue.findMany.mockResolvedValue([]);

      const result = await getQueue();

      expect(result).toEqual({
        items: [],
        totalCount: 0,
        nextUp: null,
      });
    });

    it('should return queue with items', async () => {
      const mockItems = [
        createMockQueueItem('file-1', 0, 'comic1.cbz'),
        createMockQueueItem('file-2', 1, 'comic2.cbz'),
        createMockQueueItem('file-3', 2, 'comic3.cbz'),
      ];

      mockDb.readingQueue.findMany.mockResolvedValue(mockItems);

      const result = await getQueue();

      expect(result.items).toHaveLength(3);
      expect(result.totalCount).toBe(3);
      expect(result.nextUp).toBeDefined();
      expect(result.nextUp?.fileId).toBe('file-1');
    });

    it('should calculate progress percentage', async () => {
      const mockItem = createMockQueueItem('file-1', 0, 'comic.cbz');
      mockDb.readingQueue.findMany.mockResolvedValue([mockItem]);

      const result = await getQueue();

      expect(result.items[0]?.progress).toBe(24); // (5+1)/25 * 100 = 24% (0-indexed pages)
    });

    it('should order items by position', async () => {
      mockDb.readingQueue.findMany.mockResolvedValue([]);

      await getQueue();

      expect(mockDb.readingQueue.findMany).toHaveBeenCalledWith({
        orderBy: { position: 'asc' },
        include: expect.any(Object),
      });
    });
  });

  describe('addToQueue', () => {
    it('should add file to end of queue by default', async () => {
      const fileId = 'file-1';
      const mockFile = createMockFile(fileId, 'comic.cbz');

      mockDb.comicFile.findUnique.mockResolvedValue(mockFile);
      mockDb.readingQueue.findUnique.mockResolvedValue(null); // Not in queue
      mockDb.readingQueue.findFirst.mockResolvedValue({ position: 2 }); // Last position is 2
      mockDb.readingQueue.create.mockResolvedValue({
        id: 'queue-1',
        fileId,
        position: 3,
        addedAt: new Date(),
      });

      const result = await addToQueue(fileId);

      expect(result.fileId).toBe(fileId);
      expect(result.position).toBe(3);
      expect(mockDb.readingQueue.create).toHaveBeenCalledWith({
        data: { fileId, position: 3 },
      });
    });

    it('should add file at specific position', async () => {
      const fileId = 'file-1';
      const mockFile = createMockFile(fileId, 'comic.cbz');

      mockDb.comicFile.findUnique.mockResolvedValue(mockFile);
      mockDb.readingQueue.findUnique.mockResolvedValue(null);
      mockDb.readingQueue.updateMany.mockResolvedValue({ count: 2 });
      mockDb.readingQueue.create.mockResolvedValue({
        id: 'queue-1',
        fileId,
        position: 1,
        addedAt: new Date(),
      });

      const result = await addToQueue(fileId, 1);

      expect(result.position).toBe(1);
      // Should shift existing items
      expect(mockDb.readingQueue.updateMany).toHaveBeenCalledWith({
        where: { position: { gte: 1 } },
        data: { position: { increment: 1 } },
      });
    });

    it('should throw error if file not found', async () => {
      mockDb.comicFile.findUnique.mockResolvedValue(null);

      await expect(addToQueue('nonexistent')).rejects.toThrow('File not found');
    });

    it('should throw error if file already in queue', async () => {
      const fileId = 'file-1';
      mockDb.comicFile.findUnique.mockResolvedValue(createMockFile(fileId, 'comic.cbz'));
      mockDb.readingQueue.findUnique.mockResolvedValue({ id: 'queue-1', fileId });

      await expect(addToQueue(fileId)).rejects.toThrow('already in the reading queue');
    });

    it('should add to position 0 when queue is empty', async () => {
      const fileId = 'file-1';
      mockDb.comicFile.findUnique.mockResolvedValue(createMockFile(fileId, 'comic.cbz'));
      mockDb.readingQueue.findUnique.mockResolvedValue(null);
      mockDb.readingQueue.findFirst.mockResolvedValue(null); // Empty queue
      mockDb.readingQueue.create.mockResolvedValue({
        id: 'queue-1',
        fileId,
        position: 0,
        addedAt: new Date(),
      });

      const result = await addToQueue(fileId);

      expect(result.position).toBe(0);
    });
  });

  describe('addManyToQueue', () => {
    it('should add multiple files to queue', async () => {
      const fileIds = ['file-1', 'file-2'];

      // Setup for each file
      for (let i = 0; i < fileIds.length; i++) {
        mockDb.comicFile.findUnique.mockResolvedValueOnce(createMockFile(fileIds[i]!, `comic${i}.cbz`));
        mockDb.readingQueue.findUnique.mockResolvedValueOnce(null);
        mockDb.readingQueue.findFirst.mockResolvedValueOnce(i === 0 ? null : { position: i - 1 });
        mockDb.readingQueue.create.mockResolvedValueOnce({
          id: `queue-${i}`,
          fileId: fileIds[i],
          position: i,
          addedAt: new Date(),
        });
      }

      const result = await addManyToQueue(fileIds);

      expect(result).toHaveLength(2);
    });

    it('should skip files that are already in queue', async () => {
      mockDb.comicFile.findUnique.mockResolvedValue(createMockFile('file-1', 'comic.cbz'));
      mockDb.readingQueue.findUnique.mockResolvedValue({ id: 'queue-1', fileId: 'file-1' }); // Already in queue

      const result = await addManyToQueue(['file-1']);

      expect(result).toHaveLength(0);
    });
  });

  describe('removeFromQueue', () => {
    it('should remove file from queue and renumber', async () => {
      const fileId = 'file-2';
      mockDb.readingQueue.findUnique.mockResolvedValue({
        id: 'queue-2',
        fileId,
        position: 1,
      });
      mockDb.readingQueue.delete.mockResolvedValue({});

      await removeFromQueue(fileId);

      expect(mockDb.readingQueue.delete).toHaveBeenCalledWith({
        where: { fileId },
      });
      expect(mockDb.$executeRaw).toHaveBeenCalled();
    });

    it('should do nothing if file not in queue', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue(null);

      await removeFromQueue('nonexistent');

      expect(mockDb.readingQueue.delete).not.toHaveBeenCalled();
    });
  });

  describe('clearQueue', () => {
    it('should delete all queue items', async () => {
      mockDb.readingQueue.deleteMany.mockResolvedValue({ count: 5 });

      await clearQueue();

      expect(mockDb.readingQueue.deleteMany).toHaveBeenCalledWith({});
    });
  });

  describe('isInQueue', () => {
    it('should return true if file is in queue', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue({ id: 'queue-1', fileId: 'file-1' });

      const result = await isInQueue('file-1');

      expect(result).toBe(true);
    });

    it('should return false if file is not in queue', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue(null);

      const result = await isInQueue('file-1');

      expect(result).toBe(false);
    });
  });

  describe('getQueuePosition', () => {
    it('should return position when file is in queue', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue({ position: 5 });

      const result = await getQueuePosition('file-1');

      expect(result).toBe(5);
    });

    it('should return null when file is not in queue', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue(null);

      const result = await getQueuePosition('file-1');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Queue Reordering Tests
  // ===========================================================================

  describe('moveInQueue', () => {
    it('should move item to new position', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue({
        id: 'queue-1',
        fileId: 'file-1',
        position: 0,
      });

      await moveInQueue('file-1', 2);

      expect(mockDb.$executeRaw).toHaveBeenCalled();
      expect(mockDb.readingQueue.update).toHaveBeenCalledWith({
        where: { fileId: 'file-1' },
        data: { position: 2 },
      });
    });

    it('should do nothing when moving to same position', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue({
        id: 'queue-1',
        fileId: 'file-1',
        position: 2,
      });

      await moveInQueue('file-1', 2);

      expect(mockDb.$executeRaw).not.toHaveBeenCalled();
      expect(mockDb.readingQueue.update).not.toHaveBeenCalled();
    });

    it('should throw error if file not in queue', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue(null);

      await expect(moveInQueue('nonexistent', 0)).rejects.toThrow('not in the reading queue');
    });

    it('should shift items down when moving up', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue({
        id: 'queue-1',
        fileId: 'file-1',
        position: 5,
      });

      await moveInQueue('file-1', 2);

      // Moving from 5 to 2 (moving up)
      expect(mockDb.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('reorderQueue', () => {
    it('should update positions for all files in transaction', async () => {
      const fileIds = ['file-3', 'file-1', 'file-2'];

      await reorderQueue(fileIds);

      expect(mockDb.$transaction).toHaveBeenCalled();
    });
  });

  describe('moveToFront', () => {
    it('should move item to position 0', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue({
        id: 'queue-1',
        fileId: 'file-3',
        position: 2,
      });

      await moveToFront('file-3');

      expect(mockDb.readingQueue.update).toHaveBeenCalledWith({
        where: { fileId: 'file-3' },
        data: { position: 0 },
      });
    });
  });

  describe('moveToEnd', () => {
    it('should move item to last position', async () => {
      mockDb.readingQueue.findFirst.mockResolvedValue({ position: 5 });
      mockDb.readingQueue.findUnique.mockResolvedValue({
        id: 'queue-1',
        fileId: 'file-1',
        position: 0,
      });

      await moveToEnd('file-1');

      expect(mockDb.readingQueue.update).toHaveBeenCalledWith({
        where: { fileId: 'file-1' },
        data: { position: 5 },
      });
    });

    it('should do nothing if no last item exists', async () => {
      mockDb.readingQueue.findFirst.mockResolvedValue(null);

      await moveToEnd('file-1');

      expect(mockDb.readingQueue.update).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Queue Navigation Tests
  // ===========================================================================

  describe('getNextInQueue', () => {
    it('should return first item in queue', async () => {
      const mockItem = createMockQueueItem('file-1', 0, 'comic.cbz');
      mockDb.readingQueue.findFirst.mockResolvedValue(mockItem);

      const result = await getNextInQueue();

      expect(result).toBeDefined();
      expect(result?.fileId).toBe('file-1');
      expect(result?.position).toBe(0);
    });

    it('should return null when queue is empty', async () => {
      mockDb.readingQueue.findFirst.mockResolvedValue(null);

      const result = await getNextInQueue();

      expect(result).toBeNull();
    });

    it('should calculate progress', async () => {
      const mockItem = createMockQueueItem('file-1', 0, 'comic.cbz');
      mockDb.readingQueue.findFirst.mockResolvedValue(mockItem);

      const result = await getNextInQueue();

      expect(result?.progress).toBe(24); // (5+1)/25 * 100 (0-indexed pages)
    });
  });

  describe('popFromQueue', () => {
    it('should remove and return first item fileId', async () => {
      mockDb.readingQueue.findFirst.mockResolvedValueOnce({
        id: 'queue-1',
        fileId: 'file-1',
        position: 0,
      });
      mockDb.readingQueue.findUnique.mockResolvedValue({
        id: 'queue-1',
        fileId: 'file-1',
        position: 0,
      });
      mockDb.readingQueue.delete.mockResolvedValue({});

      const result = await popFromQueue();

      expect(result).toBe('file-1');
      expect(mockDb.readingQueue.delete).toHaveBeenCalled();
    });

    it('should return null when queue is empty', async () => {
      mockDb.readingQueue.findFirst.mockResolvedValue(null);

      const result = await popFromQueue();

      expect(result).toBeNull();
    });
  });

  describe('getNextAfter', () => {
    it('should return next item after current', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue({
        id: 'queue-1',
        fileId: 'file-1',
        position: 1,
      });

      const nextItem = createMockQueueItem('file-2', 2, 'comic2.cbz');
      mockDb.readingQueue.findFirst.mockResolvedValue(nextItem);

      const result = await getNextAfter('file-1');

      expect(result?.fileId).toBe('file-2');
      expect(result?.position).toBe(2);
      expect(mockDb.readingQueue.findFirst).toHaveBeenCalledWith({
        where: { position: 2 },
        include: expect.any(Object),
      });
    });

    it('should return null when current file not in queue', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue(null);

      const result = await getNextAfter('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when no next item exists', async () => {
      mockDb.readingQueue.findUnique.mockResolvedValue({
        id: 'queue-1',
        fileId: 'file-1',
        position: 5,
      });
      mockDb.readingQueue.findFirst.mockResolvedValue(null);

      const result = await getNextAfter('file-1');

      expect(result).toBeNull();
    });
  });
});
