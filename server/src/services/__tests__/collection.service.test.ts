/**
 * Collection Service Tests
 *
 * Tests for user collection management:
 * - System collections (Favorites, Want to Read)
 * - User collections CRUD
 * - Collection items management
 * - Unavailable items handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockPrismaClient,
  createMockCollection,
  createMockCollectionItem,
  createMockSeriesRecord,
} from './__mocks__/prisma.mock.js';

// Create mock prisma client
const mockPrisma = createMockPrismaClient();

// Mock database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockPrisma),
}));

// Mock cover service (we don't want to test cover generation here)
vi.mock('../cover.service.js', () => ({
  generateCollectionMosaicCover: vi.fn().mockResolvedValue(null),
  saveCollectionMosaicCover: vi.fn().mockResolvedValue({ success: true }),
  deleteCollectionCover: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger service
vi.mock('../logger.service.js', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
  createServiceLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Import service after mocking
const {
  ensureSystemCollections,
  getSystemCollection,
  getCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  addItemsToCollection,
  removeItemsFromCollection,
  reorderItems,
  getCollectionsForItem,
  isInCollection,
  isInSystemCollection,
  toggleSystemCollection,
  getUnavailableItemCount,
  removeUnavailableItems,
  markFileItemsUnavailable,
  markSeriesItemsUnavailable,
  restoreSeriesItems,
  toggleCollectionPromotion,
} = await import('../collection.service.js');

describe('Collection Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // ensureSystemCollections
  // =============================================================================

  describe('ensureSystemCollections', () => {
    it('should create system collections if they do not exist', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue(null);
      mockPrisma.collection.create.mockImplementation((args) =>
        Promise.resolve(createMockCollection({ ...args.data }))
      );

      await ensureSystemCollections('user-1');

      // Should have checked for both system collections
      expect(mockPrisma.collection.findUnique).toHaveBeenCalledTimes(2);
      // Should have created both
      expect(mockPrisma.collection.create).toHaveBeenCalledTimes(2);
    });

    it('should not create system collections if they exist', async () => {
      const existing = createMockCollection({ isSystem: true, systemKey: 'favorites' });
      mockPrisma.collection.findUnique.mockResolvedValue(existing);

      await ensureSystemCollections('user-1');

      expect(mockPrisma.collection.create).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // getSystemCollection
  // =============================================================================

  describe('getSystemCollection', () => {
    it('should return system collection with item count', async () => {
      const favorites = createMockCollection({
        isSystem: true,
        systemKey: 'favorites',
        name: 'Favorites',
        _count: { items: 5 },
      });
      mockPrisma.collection.findUnique.mockResolvedValue(favorites);

      const result = await getSystemCollection('user-1', 'favorites');

      expect(result).toBeDefined();
      expect(result?.name).toBe('Favorites');
      expect(result?.itemCount).toBe(5);
    });

    it('should return null if system collection not found', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue(null);

      const result = await getSystemCollection('user-1', 'favorites');

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // getCollections
  // =============================================================================

  describe('getCollections', () => {
    it('should return all collections for a user', async () => {
      const collections = [
        createMockCollection({ id: 'col-1', name: 'Favorites', isSystem: true, _count: { items: 3 } }),
        createMockCollection({ id: 'col-2', name: 'My List', isSystem: false, _count: { items: 10 } }),
      ];
      mockPrisma.collection.findMany.mockResolvedValue(collections);
      mockPrisma.collection.findUnique.mockResolvedValue(collections[0]); // For ensureSystemCollections

      const result = await getCollections('user-1');

      expect(result).toHaveLength(2);
      expect(result[0]!.itemCount).toBe(3);
      expect(result[1]!.itemCount).toBe(10);
    });
  });

  // =============================================================================
  // createCollection
  // =============================================================================

  describe('createCollection', () => {
    it('should create a new collection with defaults', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      mockPrisma.collection.create.mockImplementation((args) =>
        Promise.resolve(createMockCollection({ id: 'new-col', ...args.data }))
      );

      const result = await createCollection('user-1', { name: 'My Comics' });

      expect(result.name).toBe('My Comics');
      expect(result.userId).toBe('user-1');
      expect(result.isSystem).toBe(false);
      expect(mockPrisma.collection.create).toHaveBeenCalled();
    });

    it('should create collection with custom properties', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      mockPrisma.collection.create.mockImplementation((args) =>
        Promise.resolve(createMockCollection({ ...args.data }))
      );

      const result = await createCollection('user-1', {
        name: 'Reading Now',
        description: 'Currently reading',
        rating: 5,
        visibility: 'public',
      });

      expect(result.name).toBe('Reading Now');
      expect(result.description).toBe('Currently reading');
      expect(result.rating).toBe(5);
      expect(result.visibility).toBe('public');
    });
  });

  // =============================================================================
  // updateCollection
  // =============================================================================

  describe('updateCollection', () => {
    it('should update a collection', async () => {
      const existing = createMockCollection({ id: 'col-1', userId: 'user-1' });
      mockPrisma.collection.findFirst.mockResolvedValue(existing);
      mockPrisma.collection.update.mockResolvedValue({
        ...existing,
        name: 'Updated Name',
        _count: { items: 0 },
      });

      const result = await updateCollection('user-1', 'col-1', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);

      await expect(updateCollection('user-1', 'nonexistent', { name: 'New' })).rejects.toThrow(
        'Collection not found'
      );
    });

    it('should throw error if trying to update locked field', async () => {
      const existing = createMockCollection({
        id: 'col-1',
        userId: 'user-1',
        lockName: true,
      });
      mockPrisma.collection.findFirst.mockResolvedValue(existing);

      await expect(updateCollection('user-1', 'col-1', { name: 'New Name' })).rejects.toThrow(
        'Cannot update locked fields: name'
      );
    });

    it('should allow updating locked field if unlocking at the same time', async () => {
      const existing = createMockCollection({
        id: 'col-1',
        userId: 'user-1',
        lockName: true,
      });
      mockPrisma.collection.findFirst.mockResolvedValue(existing);
      mockPrisma.collection.update.mockResolvedValue({
        ...existing,
        name: 'New Name',
        lockName: false,
        _count: { items: 0 },
      });

      const result = await updateCollection('user-1', 'col-1', {
        name: 'New Name',
        lockName: false,
      });

      expect(result.name).toBe('New Name');
    });
  });

  // =============================================================================
  // deleteCollection
  // =============================================================================

  describe('deleteCollection', () => {
    it('should delete a user collection', async () => {
      const collection = createMockCollection({ id: 'col-1', userId: 'user-1', isSystem: false });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);

      await deleteCollection('user-1', 'col-1');

      expect(mockPrisma.collection.delete).toHaveBeenCalledWith({
        where: { id: 'col-1' },
      });
    });

    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);

      await expect(deleteCollection('user-1', 'nonexistent')).rejects.toThrow('Collection not found');
    });

    it('should throw error if trying to delete system collection', async () => {
      const system = createMockCollection({ isSystem: true, systemKey: 'favorites' });
      mockPrisma.collection.findFirst.mockResolvedValue(system);

      await expect(deleteCollection('user-1', 'col-1')).rejects.toThrow(
        'Cannot delete system collections'
      );
    });
  });

  // =============================================================================
  // addItemsToCollection
  // =============================================================================

  describe('addItemsToCollection', () => {
    it('should add series to collection', async () => {
      const collection = createMockCollection({ id: 'col-1', userId: 'user-1' });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collectionItem.findFirst.mockResolvedValue(null); // No existing item
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );

      const result = await addItemsToCollection('user-1', 'col-1', [{ seriesId: 'series-1' }]);

      expect(result).toHaveLength(1);
      expect(result[0]!.seriesId).toBe('series-1');
    });

    it('should add file to collection', async () => {
      const collection = createMockCollection({ id: 'col-1', userId: 'user-1' });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collectionItem.findFirst.mockResolvedValue(null);
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );

      const result = await addItemsToCollection('user-1', 'col-1', [{ fileId: 'file-1' }]);

      expect(result).toHaveLength(1);
      expect(result[0]!.fileId).toBe('file-1');
    });

    it('should skip duplicate items', async () => {
      const collection = createMockCollection({ id: 'col-1', userId: 'user-1' });
      const existingItem = createMockCollectionItem({ seriesId: 'series-1' });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collectionItem.findFirst.mockResolvedValue(existingItem);

      const result = await addItemsToCollection('user-1', 'col-1', [{ seriesId: 'series-1' }]);

      expect(result).toHaveLength(0);
      expect(mockPrisma.collectionItem.create).not.toHaveBeenCalled();
    });

    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);

      await expect(addItemsToCollection('user-1', 'nonexistent', [{ seriesId: 'series-1' }])).rejects.toThrow(
        'Collection not found'
      );
    });

    it('should skip items with both seriesId and fileId', async () => {
      const collection = createMockCollection({ id: 'col-1', userId: 'user-1' });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);

      const result = await addItemsToCollection('user-1', 'col-1', [
        { seriesId: 'series-1', fileId: 'file-1' },
      ]);

      expect(result).toHaveLength(0);
    });
  });

  // =============================================================================
  // removeItemsFromCollection
  // =============================================================================

  describe('removeItemsFromCollection', () => {
    it('should remove series from collection', async () => {
      const collection = createMockCollection({ id: 'col-1', userId: 'user-1' });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.collectionItem.findMany.mockResolvedValue([]);

      const result = await removeItemsFromCollection('user-1', 'col-1', [{ seriesId: 'series-1' }]);

      expect(result).toBe(1);
    });

    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);

      await expect(removeItemsFromCollection('user-1', 'nonexistent', [{ seriesId: 'series-1' }])).rejects.toThrow(
        'Collection not found'
      );
    });
  });

  // =============================================================================
  // reorderItems
  // =============================================================================

  describe('reorderItems', () => {
    it('should reorder items in collection', async () => {
      const collection = createMockCollection({ id: 'col-1', userId: 'user-1' });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.$transaction.mockResolvedValue([]);

      await reorderItems('user-1', 'col-1', ['item-1', 'item-2', 'item-3']);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);

      await expect(reorderItems('user-1', 'nonexistent', ['item-1'])).rejects.toThrow(
        'Collection not found'
      );
    });
  });

  // =============================================================================
  // getCollectionsForItem
  // =============================================================================

  describe('getCollectionsForItem', () => {
    it('should return collections containing a series', async () => {
      const collections = [
        createMockCollection({ id: 'col-1', name: 'Favorites', _count: { items: 1 } }),
      ];
      mockPrisma.collection.findMany.mockResolvedValue(collections);

      const result = await getCollectionsForItem('user-1', 'series-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Favorites');
    });

    it('should return empty array if no seriesId or fileId', async () => {
      const result = await getCollectionsForItem('user-1');

      expect(result).toHaveLength(0);
    });
  });

  // =============================================================================
  // isInCollection
  // =============================================================================

  describe('isInCollection', () => {
    it('should return true if item is in collection', async () => {
      const collection = createMockCollection({ id: 'col-1', userId: 'user-1' });
      const item = createMockCollectionItem({ seriesId: 'series-1' });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collectionItem.findFirst.mockResolvedValue(item);

      const result = await isInCollection('user-1', 'col-1', 'series-1');

      expect(result).toBe(true);
    });

    it('should return false if item is not in collection', async () => {
      const collection = createMockCollection({ id: 'col-1', userId: 'user-1' });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collectionItem.findFirst.mockResolvedValue(null);

      const result = await isInCollection('user-1', 'col-1', 'series-1');

      expect(result).toBe(false);
    });

    it('should return false if collection does not belong to user', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);

      const result = await isInCollection('user-1', 'col-1', 'series-1');

      expect(result).toBe(false);
    });

    it('should return false if no seriesId or fileId provided', async () => {
      const result = await isInCollection('user-1', 'col-1');

      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // isInSystemCollection
  // =============================================================================

  describe('isInSystemCollection', () => {
    it('should check if item is in system collection', async () => {
      const favorites = createMockCollection({
        id: 'col-1',
        isSystem: true,
        systemKey: 'favorites',
        userId: 'user-1',
      });
      mockPrisma.collection.findUnique.mockResolvedValue(favorites);
      mockPrisma.collection.findFirst.mockResolvedValue(favorites);
      mockPrisma.collectionItem.findFirst.mockResolvedValue(
        createMockCollectionItem({ seriesId: 'series-1' })
      );

      const result = await isInSystemCollection('user-1', 'favorites', 'series-1');

      expect(result).toBe(true);
    });
  });

  // =============================================================================
  // toggleSystemCollection
  // =============================================================================

  describe('toggleSystemCollection', () => {
    it('should add item to system collection if not present', async () => {
      const favorites = createMockCollection({
        id: 'col-1',
        isSystem: true,
        systemKey: 'favorites',
        userId: 'user-1',
      });
      mockPrisma.collection.findUnique.mockResolvedValue(favorites);
      mockPrisma.collection.findFirst.mockResolvedValue(favorites);
      mockPrisma.collectionItem.findFirst.mockResolvedValue(null);
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );

      const result = await toggleSystemCollection('user-1', 'favorites', 'series-1');

      expect(result.added).toBe(true);
    });

    it('should remove item from system collection if present', async () => {
      const favorites = createMockCollection({
        id: 'col-1',
        isSystem: true,
        systemKey: 'favorites',
        userId: 'user-1',
      });
      const existingItem = createMockCollectionItem({ seriesId: 'series-1' });
      mockPrisma.collection.findUnique.mockResolvedValue(favorites);
      mockPrisma.collection.findFirst.mockResolvedValue(favorites);
      mockPrisma.collectionItem.findFirst.mockResolvedValue(existingItem);
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.collectionItem.findMany.mockResolvedValue([]);

      const result = await toggleSystemCollection('user-1', 'favorites', 'series-1');

      expect(result.added).toBe(false);
    });
  });

  // =============================================================================
  // Unavailable Items
  // =============================================================================

  describe('Unavailable Items', () => {
    describe('getUnavailableItemCount', () => {
      it('should return count of unavailable items', async () => {
        mockPrisma.collectionItem.count.mockResolvedValue(5);

        const result = await getUnavailableItemCount('user-1');

        expect(result).toBe(5);
        expect(mockPrisma.collectionItem.count).toHaveBeenCalledWith({
          where: {
            isAvailable: false,
            collection: { userId: 'user-1' },
          },
        });
      });
    });

    describe('removeUnavailableItems', () => {
      it('should remove all unavailable items', async () => {
        mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 3 });

        const result = await removeUnavailableItems('user-1');

        expect(result).toBe(3);
      });
    });

    describe('markFileItemsUnavailable', () => {
      it('should mark items unavailable when file is deleted', async () => {
        mockPrisma.collectionItem.updateMany.mockResolvedValue({ count: 2 });

        const result = await markFileItemsUnavailable('file-1');

        expect(result).toBe(2);
        expect(mockPrisma.collectionItem.updateMany).toHaveBeenCalledWith({
          where: { fileId: 'file-1' },
          data: { isAvailable: false },
        });
      });
    });

    describe('markSeriesItemsUnavailable', () => {
      it('should mark items unavailable when series is deleted', async () => {
        mockPrisma.collectionItem.updateMany.mockResolvedValue({ count: 4 });

        const result = await markSeriesItemsUnavailable('series-1');

        expect(result).toBe(4);
      });
    });

    describe('restoreSeriesItems', () => {
      it('should restore items when series is restored', async () => {
        mockPrisma.collectionItem.updateMany.mockResolvedValue({ count: 4 });

        const result = await restoreSeriesItems('series-1');

        expect(result).toBe(4);
        expect(mockPrisma.collectionItem.updateMany).toHaveBeenCalledWith({
          where: { seriesId: 'series-1' },
          data: { isAvailable: true },
        });
      });
    });
  });

  // =============================================================================
  // toggleCollectionPromotion
  // =============================================================================

  describe('toggleCollectionPromotion', () => {
    it('should promote a collection', async () => {
      const collection = createMockCollection({
        id: 'col-1',
        userId: 'user-1',
        isPromoted: false,
      });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collection.update.mockResolvedValue({
        ...collection,
        isPromoted: true,
        promotedOrder: 0,
      });

      const result = await toggleCollectionPromotion('user-1', 'col-1');

      expect(result.isPromoted).toBe(true);
    });

    it('should demote a promoted collection', async () => {
      const collection = createMockCollection({
        id: 'col-1',
        userId: 'user-1',
        isPromoted: true,
        promotedOrder: 0,
      });
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collection.update.mockResolvedValue({
        ...collection,
        isPromoted: false,
        promotedOrder: null,
      });

      const result = await toggleCollectionPromotion('user-1', 'col-1');

      expect(result.isPromoted).toBe(false);
      expect(result.promotedOrder).toBeNull();
    });

    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);

      await expect(toggleCollectionPromotion('user-1', 'nonexistent')).rejects.toThrow(
        'Collection not found'
      );
    });
  });
});
