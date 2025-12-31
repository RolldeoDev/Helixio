/**
 * Smart Collection Service Tests
 *
 * Comprehensive tests for smart collection functionality:
 * - Filter evaluation (all comparison types)
 * - Group logic (AND/OR)
 * - Series and file scope evaluation
 * - Whitelist/Blacklist management
 * - Collection conversion
 * - Incremental and full refresh
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrismaClient, createMockCollection, createMockCollectionItem } from './__mocks__/prisma.mock.js';

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
  logWarn: vi.fn(),
  logDebug: vi.fn(),
  createServiceLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock collection service (for recalculateCollectionMetadata)
vi.mock('../collection/index.js', () => ({
  recalculateCollectionMetadata: vi.fn().mockResolvedValue(undefined),
}));

// Import types
import type { FilterField, FilterComparison, SmartFilter } from '../smart-collection.service.js';

// Import service after mocking
const {
  getSmartCollections,
  refreshSmartCollection,
  evaluateChangedItems,
  toggleWhitelist,
  toggleBlacklist,
  updateSmartFilter,
  convertToSmartCollection,
  convertToRegularCollection,
  getSmartCollectionOverrides,
} = await import('../smart-collection.service.js');

// Helper to create a smart collection mock
function createSmartCollection(overrides: Record<string, unknown> = {}) {
  return {
    ...createMockCollection({
      id: 'smart-col-1',
      userId: 'user-1',
      isSmart: true,
      smartScope: 'series',
      filterDefinition: JSON.stringify({
        id: 'root',
        rootOperator: 'AND',
        groups: [],
      }),
      lastEvaluatedAt: new Date(),
    }),
    items: [],
    ...overrides,
  };
}

// Helper to create test filter
function createFilter(groups: Array<{
  operator: 'AND' | 'OR';
  conditions: Array<{
    field: FilterField;
    comparison: FilterComparison;
    value: string;
    value2?: string;
  }>;
}>, rootOperator: 'AND' | 'OR' = 'AND'): SmartFilter {
  return {
    id: 'test-filter',
    rootOperator,
    groups: groups.map((g, i) => ({
      id: `group-${i}`,
      operator: g.operator,
      conditions: g.conditions.map((c, j) => ({
        id: `cond-${i}-${j}`,
        ...c,
      })),
    })),
  };
}

describe('Smart Collection Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // getSmartCollections
  // =============================================================================

  describe('getSmartCollections', () => {
    it('should return all smart collections for a user', async () => {
      const smartCol = createSmartCollection();
      mockPrisma.collection.findMany.mockResolvedValue([smartCol]);

      const result = await getSmartCollections('user-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('smart-col-1');
      expect(result[0]!.smartScope).toBe('series');
    });

    it('should return empty array if no smart collections exist', async () => {
      mockPrisma.collection.findMany.mockResolvedValue([]);

      const result = await getSmartCollections('user-1');

      expect(result).toHaveLength(0);
    });

    it('should filter out collections without filter definition', async () => {
      const invalidCol = createSmartCollection({
        filterDefinition: null,
      });
      mockPrisma.collection.findMany.mockResolvedValue([invalidCol]);

      const result = await getSmartCollections('user-1');

      expect(result).toHaveLength(0);
    });

    it('should parse filter definition from JSON', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'Marvel' }] },
      ]);
      const smartCol = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
      });
      mockPrisma.collection.findMany.mockResolvedValue([smartCol]);

      const result = await getSmartCollections('user-1');

      expect(result[0]!.filterDefinition.groups).toHaveLength(1);
      expect(result[0]!.filterDefinition.groups[0]!.conditions[0]!.value).toBe('Marvel');
    });
  });

  // =============================================================================
  // refreshSmartCollection
  // =============================================================================

  describe('refreshSmartCollection', () => {
    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue(null);

      await expect(refreshSmartCollection('nonexistent', 'user-1')).rejects.toThrow(
        'Smart collection not found'
      );
    });

    it('should throw error if collection belongs to different user', async () => {
      const col = createSmartCollection({ userId: 'other-user' });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      await expect(refreshSmartCollection('smart-col-1', 'user-1')).rejects.toThrow(
        'Smart collection not found'
      );
    });

    it('should throw error if collection is not smart', async () => {
      const col = createMockCollection({ isSmart: false, userId: 'user-1' });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      await expect(refreshSmartCollection('col-1', 'user-1')).rejects.toThrow(
        'Smart collection not found'
      );
    });

    it('should throw error if no filter definition', async () => {
      const col = createSmartCollection({ filterDefinition: null });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      await expect(refreshSmartCollection('smart-col-1', 'user-1')).rejects.toThrow(
        'Smart collection has no filter definition'
      );
    });

    it('should add matching series to collection (series scope)', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
      ]);
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      // Mock series that match
      const matchingSeries = [
        { id: 'series-1', name: 'Spider-Man', publisher: 'Marvel', deletedAt: null, isHidden: false, progress: [], userData: [] },
        { id: 'series-2', name: 'Batman', publisher: 'DC', deletedAt: null, isHidden: false, progress: [], userData: [] },
      ];
      mockPrisma.series.findMany.mockResolvedValue(matchingSeries);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      expect(result.added).toBe(1); // Only Marvel series matches
      expect(mockPrisma.collectionItem.create).toHaveBeenCalledTimes(1);
    });

    it('should remove non-matching series from collection', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
      ]);
      // Collection has DC series that shouldn't match
      const existingItem = createMockCollectionItem({
        id: 'item-1',
        seriesId: 'series-dc',
        isWhitelisted: false,
        isBlacklisted: false,
      });
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [existingItem],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      // No series match
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-dc', name: 'Batman', publisher: 'DC', deletedAt: null, isHidden: false, progress: [], userData: [] },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      expect(result.removed).toBe(1);
    });

    it('should preserve whitelisted items even if they do not match filter', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
      ]);
      // Whitelisted DC series
      const whitelistedItem = createMockCollectionItem({
        id: 'item-1',
        seriesId: 'series-dc',
        isWhitelisted: true,
        isBlacklisted: false,
      });
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [whitelistedItem],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-dc', name: 'Batman', publisher: 'DC', deletedAt: null, isHidden: false, progress: [], userData: [] },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      // Whitelisted item should NOT be removed
      expect(result.removed).toBe(0);
    });

    it('should exclude blacklisted items even if they match filter', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
      ]);
      // Blacklisted Marvel series - should not be added
      const blacklistedItem = createMockCollectionItem({
        id: 'item-1',
        seriesId: 'series-marvel',
        isWhitelisted: false,
        isBlacklisted: true,
      });
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [blacklistedItem],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-marvel', name: 'Spider-Man', publisher: 'Marvel', deletedAt: null, isHidden: false, progress: [], userData: [] },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      // Blacklisted item matches but should not be re-added
      expect(result.added).toBe(0);
    });

    it('should update lastEvaluatedAt timestamp', async () => {
      const filter = createFilter([]);
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collection.update.mockResolvedValue(col);

      await refreshSmartCollection('smart-col-1', 'user-1');

      expect(mockPrisma.collection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'smart-col-1' },
          data: { lastEvaluatedAt: expect.any(Date) },
        })
      );
    });

    it('should handle files scope correctly', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'contains', value: 'marvel' }] },
      ]);
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'files',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      // Mock files with metadata
      const files = [
        { id: 'file-1', status: 'indexed', metadata: { publisher: 'Marvel Comics' }, userReadingProgress: [] },
        { id: 'file-2', status: 'indexed', metadata: { publisher: 'DC Comics' }, userReadingProgress: [] },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      expect(result.added).toBe(1); // Only Marvel file matches
    });
  });

  // =============================================================================
  // Filter Evaluation - Text Comparisons
  // =============================================================================

  describe('Filter Evaluation - Text Comparisons', () => {
    async function testFilter(filter: ReturnType<typeof createFilter>, seriesData: Record<string, unknown>) {
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', deletedAt: null, isHidden: false, progress: [], userData: [], ...seriesData },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      return refreshSmartCollection('smart-col-1', 'user-1');
    }

    it('should match "contains" comparison (case insensitive)', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'series', comparison: 'contains', value: 'spider' }] },
      ]);

      const result = await testFilter(filter, { name: 'Amazing Spider-Man' });
      expect(result.added).toBe(1);
    });

    it('should not match "contains" when value is not present', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'series', comparison: 'contains', value: 'batman' }] },
      ]);

      const result = await testFilter(filter, { name: 'Spider-Man' });
      expect(result.added).toBe(0);
    });

    it('should match "not_contains" comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'series', comparison: 'not_contains', value: 'batman' }] },
      ]);

      const result = await testFilter(filter, { name: 'Spider-Man' });
      expect(result.added).toBe(1);
    });

    it('should match "equals" comparison (case insensitive)', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
      ]);

      const result = await testFilter(filter, { publisher: 'Marvel' });
      expect(result.added).toBe(1);
    });

    it('should not match "equals" when values differ', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
      ]);

      const result = await testFilter(filter, { publisher: 'DC' });
      expect(result.added).toBe(0);
    });

    it('should match "not_equals" comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'not_equals', value: 'dc' }] },
      ]);

      const result = await testFilter(filter, { publisher: 'Marvel' });
      expect(result.added).toBe(1);
    });

    it('should match "starts_with" comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'series', comparison: 'starts_with', value: 'amazing' }] },
      ]);

      const result = await testFilter(filter, { name: 'Amazing Spider-Man' });
      expect(result.added).toBe(1);
    });

    it('should match "ends_with" comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'series', comparison: 'ends_with', value: 'man' }] },
      ]);

      const result = await testFilter(filter, { name: 'Spider-Man' });
      expect(result.added).toBe(1);
    });

    it('should match "is_empty" comparison for null values', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, { publisher: null });
      expect(result.added).toBe(1);
    });

    it('should match "is_empty" comparison for empty strings', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, { publisher: '' });
      expect(result.added).toBe(1);
    });

    it('should match "is_not_empty" comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_not_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, { publisher: 'Marvel' });
      expect(result.added).toBe(1);
    });
  });

  // =============================================================================
  // Filter Evaluation - Numeric Comparisons
  // =============================================================================

  describe('Filter Evaluation - Numeric Comparisons', () => {
    async function testFilter(filter: ReturnType<typeof createFilter>, seriesData: Record<string, unknown>) {
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', deletedAt: null, isHidden: false, progress: [], userData: [], ...seriesData },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      return refreshSmartCollection('smart-col-1', 'user-1');
    }

    it('should match "greater_than" comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'greater_than', value: '2000' }] },
      ]);

      const result = await testFilter(filter, { startYear: 2010 });
      expect(result.added).toBe(1);
    });

    it('should not match "greater_than" when value is less', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'greater_than', value: '2000' }] },
      ]);

      const result = await testFilter(filter, { startYear: 1990 });
      expect(result.added).toBe(0);
    });

    it('should match "less_than" comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'less_than', value: '2000' }] },
      ]);

      const result = await testFilter(filter, { startYear: 1990 });
      expect(result.added).toBe(1);
    });

    it('should match "between" comparison (inclusive)', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'between', value: '2000', value2: '2010' }] },
      ]);

      const result = await testFilter(filter, { startYear: 2005 });
      expect(result.added).toBe(1);
    });

    it('should match "between" at lower boundary', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'between', value: '2000', value2: '2010' }] },
      ]);

      const result = await testFilter(filter, { startYear: 2000 });
      expect(result.added).toBe(1);
    });

    it('should match "between" at upper boundary', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'between', value: '2000', value2: '2010' }] },
      ]);

      const result = await testFilter(filter, { startYear: 2010 });
      expect(result.added).toBe(1);
    });

    it('should not match "between" outside range', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'between', value: '2000', value2: '2010' }] },
      ]);

      const result = await testFilter(filter, { startYear: 2015 });
      expect(result.added).toBe(0);
    });
  });

  // =============================================================================
  // Filter Evaluation - Date Comparisons
  // =============================================================================

  describe('Filter Evaluation - Date Comparisons', () => {
    async function testFilter(filter: ReturnType<typeof createFilter>, seriesData: Record<string, unknown>) {
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', deletedAt: null, isHidden: false, progress: [], userData: [], ...seriesData },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      return refreshSmartCollection('smart-col-1', 'user-1');
    }

    it('should match "within_days" for recent dates', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'dateAdded', comparison: 'within_days', value: '7' }] },
      ]);
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      const result = await testFilter(filter, { createdAt: threeDaysAgo });
      expect(result.added).toBe(1);
    });

    it('should not match "within_days" for old dates', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'dateAdded', comparison: 'within_days', value: '7' }] },
      ]);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const result = await testFilter(filter, { createdAt: thirtyDaysAgo });
      expect(result.added).toBe(0);
    });

    it('should match "before" date comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'dateAdded', comparison: 'before', value: '2024-01-01' }] },
      ]);

      const result = await testFilter(filter, { createdAt: new Date('2023-06-01') });
      expect(result.added).toBe(1);
    });

    it('should match "after" date comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'dateAdded', comparison: 'after', value: '2023-01-01' }] },
      ]);

      const result = await testFilter(filter, { createdAt: new Date('2024-06-01') });
      expect(result.added).toBe(1);
    });

    it('should handle invalid dates gracefully', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'dateAdded', comparison: 'within_days', value: '7' }] },
      ]);

      const result = await testFilter(filter, { createdAt: 'invalid-date' });
      expect(result.added).toBe(0);
    });
  });

  // =============================================================================
  // Filter Evaluation - Group Logic
  // =============================================================================

  describe('Filter Evaluation - Group Logic', () => {
    async function testFilter(filter: ReturnType<typeof createFilter>, seriesData: Record<string, unknown>) {
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', deletedAt: null, isHidden: false, progress: [], userData: [], ...seriesData },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      return refreshSmartCollection('smart-col-1', 'user-1');
    }

    it('should require all conditions in AND group', async () => {
      const filter = createFilter([
        {
          operator: 'AND',
          conditions: [
            { field: 'publisher', comparison: 'equals', value: 'marvel' },
            { field: 'year', comparison: 'greater_than', value: '2000' },
          ],
        },
      ]);

      // Both conditions met
      const result1 = await testFilter(filter, { publisher: 'Marvel', startYear: 2010 });
      expect(result1.added).toBe(1);

      // Only one condition met
      vi.clearAllMocks();
      const result2 = await testFilter(filter, { publisher: 'Marvel', startYear: 1990 });
      expect(result2.added).toBe(0);
    });

    it('should require any condition in OR group', async () => {
      const filter = createFilter([
        {
          operator: 'OR',
          conditions: [
            { field: 'publisher', comparison: 'equals', value: 'marvel' },
            { field: 'publisher', comparison: 'equals', value: 'dc' },
          ],
        },
      ]);

      // First condition met
      const result1 = await testFilter(filter, { publisher: 'Marvel' });
      expect(result1.added).toBe(1);

      // Second condition met
      vi.clearAllMocks();
      const result2 = await testFilter(filter, { publisher: 'DC' });
      expect(result2.added).toBe(1);

      // Neither condition met
      vi.clearAllMocks();
      const result3 = await testFilter(filter, { publisher: 'Image' });
      expect(result3.added).toBe(0);
    });

    it('should require all groups with AND root operator', async () => {
      const filter = createFilter(
        [
          { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
          { operator: 'AND', conditions: [{ field: 'year', comparison: 'greater_than', value: '2000' }] },
        ],
        'AND'
      );

      // Both groups match
      const result1 = await testFilter(filter, { publisher: 'Marvel', startYear: 2010 });
      expect(result1.added).toBe(1);

      // Only first group matches
      vi.clearAllMocks();
      const result2 = await testFilter(filter, { publisher: 'Marvel', startYear: 1990 });
      expect(result2.added).toBe(0);
    });

    it('should require any group with OR root operator', async () => {
      const filter = createFilter(
        [
          { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
          { operator: 'AND', conditions: [{ field: 'year', comparison: 'less_than', value: '1980' }] },
        ],
        'OR'
      );

      // First group matches
      const result1 = await testFilter(filter, { publisher: 'Marvel', startYear: 2010 });
      expect(result1.added).toBe(1);

      // Second group matches
      vi.clearAllMocks();
      const result2 = await testFilter(filter, { publisher: 'DC', startYear: 1970 });
      expect(result2.added).toBe(1);

      // Neither group matches
      vi.clearAllMocks();
      const result3 = await testFilter(filter, { publisher: 'DC', startYear: 2010 });
      expect(result3.added).toBe(0);
    });

    it('should match all with empty filter', async () => {
      const filter = createFilter([]);

      const result = await testFilter(filter, { publisher: 'Any', startYear: 2010 });
      expect(result.added).toBe(1);
    });

    it('should match all with empty group', async () => {
      const filter = createFilter([{ operator: 'AND', conditions: [] }]);

      const result = await testFilter(filter, { publisher: 'Any', startYear: 2010 });
      expect(result.added).toBe(1);
    });
  });

  // =============================================================================
  // toggleWhitelist
  // =============================================================================

  describe('toggleWhitelist', () => {
    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue(null);

      await expect(toggleWhitelist('nonexistent', 'user-1', 'series-1')).rejects.toThrow(
        'Smart collection not found'
      );
    });

    it('should throw error if collection is not smart', async () => {
      const col = createMockCollection({ isSmart: false, userId: 'user-1' });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      await expect(toggleWhitelist('col-1', 'user-1', 'series-1')).rejects.toThrow(
        'Smart collection not found'
      );
    });

    it('should toggle whitelist on existing item', async () => {
      const col = createSmartCollection();
      const existingItem = createMockCollectionItem({
        id: 'item-1',
        seriesId: 'series-1',
        isWhitelisted: false,
        isBlacklisted: false,
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.collectionItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.collectionItem.update.mockResolvedValue({ ...existingItem, isWhitelisted: true });

      const result = await toggleWhitelist('smart-col-1', 'user-1', 'series-1');

      expect(result).toBe(true);
      expect(mockPrisma.collectionItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isWhitelisted: true }),
        })
      );
    });

    it('should clear blacklist when whitelisting', async () => {
      const col = createSmartCollection();
      const blacklistedItem = createMockCollectionItem({
        id: 'item-1',
        seriesId: 'series-1',
        isWhitelisted: false,
        isBlacklisted: true,
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.collectionItem.findUnique.mockResolvedValue(blacklistedItem);
      mockPrisma.collectionItem.update.mockResolvedValue({
        ...blacklistedItem,
        isWhitelisted: true,
        isBlacklisted: false,
      });

      await toggleWhitelist('smart-col-1', 'user-1', 'series-1');

      expect(mockPrisma.collectionItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isWhitelisted: true, isBlacklisted: false }),
        })
      );
    });

    it('should create new whitelisted item if not exists', async () => {
      const col = createSmartCollection();
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.collectionItem.findUnique.mockResolvedValue(null);
      mockPrisma.collectionItem.aggregate.mockResolvedValue({ _max: { position: 5 } });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );

      const result = await toggleWhitelist('smart-col-1', 'user-1', 'series-1');

      expect(result).toBe(true);
      expect(mockPrisma.collectionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            collectionId: 'smart-col-1',
            seriesId: 'series-1',
            isWhitelisted: true,
            position: 6,
          }),
        })
      );
    });
  });

  // =============================================================================
  // toggleBlacklist
  // =============================================================================

  describe('toggleBlacklist', () => {
    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue(null);

      await expect(toggleBlacklist('nonexistent', 'user-1', 'series-1')).rejects.toThrow(
        'Smart collection not found'
      );
    });

    it('should toggle blacklist on existing item', async () => {
      const col = createSmartCollection();
      const existingItem = createMockCollectionItem({
        id: 'item-1',
        seriesId: 'series-1',
        isWhitelisted: false,
        isBlacklisted: false,
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.collectionItem.findUnique.mockResolvedValue(existingItem);
      mockPrisma.collectionItem.update.mockResolvedValue({ ...existingItem, isBlacklisted: true });

      const result = await toggleBlacklist('smart-col-1', 'user-1', 'series-1');

      expect(result).toBe(true);
      expect(mockPrisma.collectionItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isBlacklisted: true }),
        })
      );
    });

    it('should clear whitelist when blacklisting', async () => {
      const col = createSmartCollection();
      const whitelistedItem = createMockCollectionItem({
        id: 'item-1',
        seriesId: 'series-1',
        isWhitelisted: true,
        isBlacklisted: false,
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.collectionItem.findUnique.mockResolvedValue(whitelistedItem);
      mockPrisma.collectionItem.update.mockResolvedValue({
        ...whitelistedItem,
        isWhitelisted: false,
        isBlacklisted: true,
      });

      await toggleBlacklist('smart-col-1', 'user-1', 'series-1');

      expect(mockPrisma.collectionItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isWhitelisted: false, isBlacklisted: true }),
        })
      );
    });

    it('should create new blacklisted item if not exists', async () => {
      const col = createSmartCollection();
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.collectionItem.findUnique.mockResolvedValue(null);
      mockPrisma.collectionItem.aggregate.mockResolvedValue({ _max: { position: 3 } });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );

      const result = await toggleBlacklist('smart-col-1', 'user-1', 'series-1');

      expect(result).toBe(true);
      expect(mockPrisma.collectionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            collectionId: 'smart-col-1',
            seriesId: 'series-1',
            isBlacklisted: true,
            position: 4,
          }),
        })
      );
    });
  });

  // =============================================================================
  // updateSmartFilter
  // =============================================================================

  describe('updateSmartFilter', () => {
    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue(null);

      const filter = createFilter([]);
      await expect(updateSmartFilter('nonexistent', 'user-1', filter, 'series')).rejects.toThrow(
        'Collection not found'
      );
    });

    it('should throw error if collection belongs to different user', async () => {
      const col = createMockCollection({ userId: 'other-user' });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      const filter = createFilter([]);
      await expect(updateSmartFilter('col-1', 'user-1', filter, 'series')).rejects.toThrow(
        'Collection not found'
      );
    });

    it('should update filter definition and scope', async () => {
      const col = createMockCollection({ userId: 'user-1' });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.collection.update.mockResolvedValue(col);

      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'Marvel' }] },
      ]);
      await updateSmartFilter('col-1', 'user-1', filter, 'series');

      expect(mockPrisma.collection.update).toHaveBeenCalledWith({
        where: { id: 'col-1' },
        data: {
          isSmart: true,
          smartScope: 'series',
          filterDefinition: JSON.stringify(filter),
        },
      });
    });

    it('should support files scope', async () => {
      const col = createMockCollection({ userId: 'user-1' });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.collection.update.mockResolvedValue(col);

      const filter = createFilter([]);
      await updateSmartFilter('col-1', 'user-1', filter, 'files');

      expect(mockPrisma.collection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ smartScope: 'files' }),
        })
      );
    });
  });

  // =============================================================================
  // convertToSmartCollection
  // =============================================================================

  describe('convertToSmartCollection', () => {
    it('should update filter and refresh collection', async () => {
      const col = createMockCollection({ userId: 'user-1', isSmart: false });
      mockPrisma.collection.findUnique.mockResolvedValue({
        ...col,
        isSmart: true,
        smartScope: 'series',
        filterDefinition: JSON.stringify(createFilter([])),
        items: [],
      });
      mockPrisma.collection.update.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));

      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'Marvel' }] },
      ]);
      const result = await convertToSmartCollection('col-1', 'user-1', filter, 'series');

      expect(mockPrisma.collection.update).toHaveBeenCalled();
      expect(result).toHaveProperty('added');
      expect(result).toHaveProperty('removed');
    });
  });

  // =============================================================================
  // convertToRegularCollection
  // =============================================================================

  describe('convertToRegularCollection', () => {
    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue(null);

      await expect(convertToRegularCollection('nonexistent', 'user-1')).rejects.toThrow(
        'Collection not found'
      );
    });

    it('should clear smart properties', async () => {
      const col = createSmartCollection();
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.collection.update.mockResolvedValue(col);

      await convertToRegularCollection('smart-col-1', 'user-1');

      expect(mockPrisma.collection.update).toHaveBeenCalledWith({
        where: { id: 'smart-col-1' },
        data: {
          isSmart: false,
          smartScope: null,
          filterDefinition: null,
          lastEvaluatedAt: null,
        },
      });
    });

    it('should clear whitelist/blacklist flags from items', async () => {
      const col = createSmartCollection();
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.collection.update.mockResolvedValue(col);

      await convertToRegularCollection('smart-col-1', 'user-1');

      expect(mockPrisma.collectionItem.updateMany).toHaveBeenCalledWith({
        where: { collectionId: 'smart-col-1' },
        data: {
          isWhitelisted: false,
          isBlacklisted: false,
        },
      });
    });
  });

  // =============================================================================
  // getSmartCollectionOverrides
  // =============================================================================

  describe('getSmartCollectionOverrides', () => {
    it('should throw error if collection not found', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue(null);

      await expect(getSmartCollectionOverrides('nonexistent', 'user-1')).rejects.toThrow(
        'Smart collection not found'
      );
    });

    it('should throw error if collection is not smart', async () => {
      const col = createMockCollection({ isSmart: false, userId: 'user-1' });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      await expect(getSmartCollectionOverrides('col-1', 'user-1')).rejects.toThrow(
        'Smart collection not found'
      );
    });

    it('should return whitelist and blacklist items', async () => {
      const col = createSmartCollection();
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.collectionItem.findMany.mockResolvedValue([
        { seriesId: 'series-1', fileId: null, isWhitelisted: true, isBlacklisted: false },
        { seriesId: 'series-2', fileId: null, isWhitelisted: false, isBlacklisted: true },
        { seriesId: null, fileId: 'file-1', isWhitelisted: true, isBlacklisted: false },
      ]);

      const result = await getSmartCollectionOverrides('smart-col-1', 'user-1');

      expect(result.whitelist).toHaveLength(2);
      expect(result.blacklist).toHaveLength(1);
      expect(result.whitelist).toContainEqual({ seriesId: 'series-1', fileId: undefined });
      expect(result.whitelist).toContainEqual({ seriesId: undefined, fileId: 'file-1' });
      expect(result.blacklist).toContainEqual({ seriesId: 'series-2', fileId: undefined });
    });

    it('should return empty arrays if no overrides', async () => {
      const col = createSmartCollection();
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.collectionItem.findMany.mockResolvedValue([]);

      const result = await getSmartCollectionOverrides('smart-col-1', 'user-1');

      expect(result.whitelist).toHaveLength(0);
      expect(result.blacklist).toHaveLength(0);
    });
  });

  // =============================================================================
  // evaluateChangedItems
  // =============================================================================

  describe('evaluateChangedItems', () => {
    it('should skip if no smart collections exist', async () => {
      mockPrisma.collection.findMany.mockResolvedValue([]);

      await evaluateChangedItems('user-1', ['series-1'], []);

      // Should not query for series or files
      expect(mockPrisma.series.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.comicFile.findMany).not.toHaveBeenCalled();
    });

    it('should evaluate changed series against series-scoped collections', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
      ]);
      const smartCol = {
        id: 'smart-col-1',
        userId: 'user-1',
        smartScope: 'series',
        filterDefinition: JSON.stringify(filter),
      };
      mockPrisma.collection.findMany.mockResolvedValue([smartCol]);

      // Changed series that matches
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', publisher: 'Marvel', progress: [], userData: [] },
      ]);
      mockPrisma.collectionItem.findMany.mockResolvedValue([]);
      mockPrisma.collectionItem.aggregate.mockResolvedValue({ _max: { position: 0 } });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue({});

      await evaluateChangedItems('user-1', ['series-1'], []);

      expect(mockPrisma.collectionItem.create).toHaveBeenCalled();
    });

    it('should evaluate changed files against file-scoped collections', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'contains', value: 'marvel' }] },
      ]);
      const smartCol = {
        id: 'smart-col-1',
        userId: 'user-1',
        smartScope: 'files',
        filterDefinition: JSON.stringify(filter),
      };
      mockPrisma.collection.findMany.mockResolvedValue([smartCol]);

      // Changed file that matches
      mockPrisma.comicFile.findMany.mockResolvedValue([
        { id: 'file-1', metadata: { publisher: 'Marvel Comics' }, userReadingProgress: [] },
      ]);
      mockPrisma.collectionItem.findMany.mockResolvedValue([]);
      mockPrisma.collectionItem.aggregate.mockResolvedValue({ _max: { position: 0 } });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue({});

      await evaluateChangedItems('user-1', [], ['file-1']);

      expect(mockPrisma.collectionItem.create).toHaveBeenCalled();
    });

    it('should remove items that no longer match filter', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
      ]);
      const smartCol = {
        id: 'smart-col-1',
        userId: 'user-1',
        smartScope: 'series',
        filterDefinition: JSON.stringify(filter),
      };
      mockPrisma.collection.findMany.mockResolvedValue([smartCol]);

      // Series that no longer matches (was Marvel, now DC)
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', publisher: 'DC', progress: [], userData: [] },
      ]);
      // Item exists in collection
      const existingItem = createMockCollectionItem({
        id: 'item-1',
        seriesId: 'series-1',
        isWhitelisted: false,
      });
      mockPrisma.collectionItem.findMany.mockResolvedValue([existingItem]);
      mockPrisma.collectionItem.delete.mockResolvedValue(existingItem);
      mockPrisma.collection.update.mockResolvedValue({});

      await evaluateChangedItems('user-1', ['series-1'], []);

      expect(mockPrisma.collectionItem.delete).toHaveBeenCalled();
    });

    it('should not remove whitelisted items even if they no longer match', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'equals', value: 'marvel' }] },
      ]);
      const smartCol = {
        id: 'smart-col-1',
        userId: 'user-1',
        smartScope: 'series',
        filterDefinition: JSON.stringify(filter),
      };
      mockPrisma.collection.findMany.mockResolvedValue([smartCol]);

      // Series that no longer matches but is whitelisted
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', publisher: 'DC', progress: [], userData: [] },
      ]);
      const whitelistedItem = createMockCollectionItem({
        id: 'item-1',
        seriesId: 'series-1',
        isWhitelisted: true,
      });
      mockPrisma.collectionItem.findMany.mockResolvedValue([whitelistedItem]);
      mockPrisma.collection.update.mockResolvedValue({});

      await evaluateChangedItems('user-1', ['series-1'], []);

      expect(mockPrisma.collectionItem.delete).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Read Status Evaluation
  // =============================================================================

  describe('Read Status Evaluation', () => {
    async function testReadStatus(
      filter: ReturnType<typeof createFilter>,
      progress: { totalRead: number; totalOwned: number; lastReadAt?: Date | null }
    ) {
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([
        {
          id: 'series-1',
          name: 'Test',
          deletedAt: null,
          isHidden: false,
          progress: [progress],
          userData: [],
        },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      return refreshSmartCollection('smart-col-1', 'user-1');
    }

    it('should match "unread" status when no progress', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'readStatus', comparison: 'equals', value: 'unread' }] },
      ]);

      const result = await testReadStatus(filter, { totalRead: 0, totalOwned: 10 });
      expect(result.added).toBe(1);
    });

    it('should match "reading" status when partially read', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'readStatus', comparison: 'equals', value: 'reading' }] },
      ]);

      const result = await testReadStatus(filter, { totalRead: 5, totalOwned: 10 });
      expect(result.added).toBe(1);
    });

    it('should match "completed" status when fully read', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'readStatus', comparison: 'equals', value: 'completed' }] },
      ]);

      const result = await testReadStatus(filter, { totalRead: 10, totalOwned: 10 });
      expect(result.added).toBe(1);
    });

    it('should not match wrong read status', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'readStatus', comparison: 'equals', value: 'completed' }] },
      ]);

      const result = await testReadStatus(filter, { totalRead: 5, totalOwned: 10 });
      expect(result.added).toBe(0);
    });
  });

  // =============================================================================
  // NaN Handling in Numeric Comparisons (Bug Fix Tests)
  // =============================================================================

  describe('NaN Handling in Numeric Comparisons', () => {
    async function testFilter(filter: ReturnType<typeof createFilter>, seriesData: Record<string, unknown>) {
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', deletedAt: null, isHidden: false, progress: [], userData: [], externalRatings: [], ...seriesData },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      return refreshSmartCollection('smart-col-1', 'user-1');
    }

    it('should not match "greater_than" when field value is NaN', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'greater_than', value: '2000' }] },
      ]);

      const result = await testFilter(filter, { startYear: 'not-a-number' });
      expect(result.added).toBe(0);
    });

    it('should not match "greater_than" when compare value is NaN', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'greater_than', value: 'invalid' }] },
      ]);

      const result = await testFilter(filter, { startYear: 2010 });
      expect(result.added).toBe(0);
    });

    it('should not match "less_than" when field value is NaN', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'less_than', value: '2000' }] },
      ]);

      const result = await testFilter(filter, { startYear: undefined });
      expect(result.added).toBe(0);
    });

    it('should not match "less_than" when compare value is NaN', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'less_than', value: 'xyz' }] },
      ]);

      const result = await testFilter(filter, { startYear: 1990 });
      expect(result.added).toBe(0);
    });

    it('should not match "between" when field value is NaN', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'between', value: '2000', value2: '2010' }] },
      ]);

      const result = await testFilter(filter, { startYear: null });
      expect(result.added).toBe(0);
    });

    it('should not match "between" when min value is NaN', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'between', value: 'start', value2: '2010' }] },
      ]);

      const result = await testFilter(filter, { startYear: 2005 });
      expect(result.added).toBe(0);
    });

    it('should not match "between" when max value (value2) is NaN', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'between', value: '2000', value2: 'end' }] },
      ]);

      const result = await testFilter(filter, { startYear: 2005 });
      expect(result.added).toBe(0);
    });

    it('should not match "between" when value2 is undefined', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'between', value: '2000' }] },
      ]);

      const result = await testFilter(filter, { startYear: 2005 });
      expect(result.added).toBe(0);
    });

    it('should not match "between" when value2 is empty string', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'year', comparison: 'between', value: '2000', value2: '' }] },
      ]);

      const result = await testFilter(filter, { startYear: 2005 });
      expect(result.added).toBe(0);
    });
  });

  // =============================================================================
  // Date Validation in Comparisons (Bug Fix Tests)
  // =============================================================================

  describe('Date Validation in Comparisons', () => {
    async function testFilter(filter: ReturnType<typeof createFilter>, seriesData: Record<string, unknown>) {
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', deletedAt: null, isHidden: false, progress: [], userData: [], externalRatings: [], ...seriesData },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      return refreshSmartCollection('smart-col-1', 'user-1');
    }

    it('should not match "before" when compare date is invalid', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'dateAdded', comparison: 'before', value: 'not-a-date' }] },
      ]);

      const result = await testFilter(filter, { createdAt: new Date('2023-06-01') });
      expect(result.added).toBe(0);
    });

    it('should not match "after" when compare date is invalid', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'dateAdded', comparison: 'after', value: 'invalid-date' }] },
      ]);

      const result = await testFilter(filter, { createdAt: new Date('2024-06-01') });
      expect(result.added).toBe(0);
    });

    it('should not match "within_days" when days value is invalid', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'dateAdded', comparison: 'within_days', value: 'seven' }] },
      ]);
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      const result = await testFilter(filter, { createdAt: threeDaysAgo });
      expect(result.added).toBe(0);
    });

    it('should handle ISO date strings correctly in "before" comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'dateAdded', comparison: 'before', value: '2024-01-15T00:00:00.000Z' }] },
      ]);

      const result = await testFilter(filter, { createdAt: new Date('2023-12-01') });
      expect(result.added).toBe(1);
    });

    it('should handle ISO date strings correctly in "after" comparison', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'dateAdded', comparison: 'after', value: '2023-01-15T00:00:00.000Z' }] },
      ]);

      const result = await testFilter(filter, { createdAt: new Date('2024-06-01') });
      expect(result.added).toBe(1);
    });
  });

  // =============================================================================
  // is_empty/is_not_empty Null/Undefined Distinction (Bug Fix Tests)
  // =============================================================================

  describe('is_empty/is_not_empty Null/Undefined Distinction', () => {
    async function testFilter(filter: ReturnType<typeof createFilter>, seriesData: Record<string, unknown>) {
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', deletedAt: null, isHidden: false, progress: [], userData: [], externalRatings: [], ...seriesData },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      return refreshSmartCollection('smart-col-1', 'user-1');
    }

    it('should match "is_empty" for null value', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, { publisher: null });
      expect(result.added).toBe(1);
    });

    it('should match "is_empty" for undefined value', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, {}); // publisher is undefined
      expect(result.added).toBe(1);
    });

    it('should match "is_empty" for empty string value', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, { publisher: '' });
      expect(result.added).toBe(1);
    });

    it('should not match "is_empty" for non-empty value', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, { publisher: 'Marvel' });
      expect(result.added).toBe(0);
    });

    it('should not match "is_not_empty" for null value', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_not_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, { publisher: null });
      expect(result.added).toBe(0);
    });

    it('should not match "is_not_empty" for undefined value', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_not_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, {}); // publisher is undefined
      expect(result.added).toBe(0);
    });

    it('should not match "is_not_empty" for empty string value', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_not_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, { publisher: '' });
      expect(result.added).toBe(0);
    });

    it('should match "is_not_empty" for non-empty value', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'publisher', comparison: 'is_not_empty', value: '' }] },
      ]);

      const result = await testFilter(filter, { publisher: 'Marvel' });
      expect(result.added).toBe(1);
    });
  });

  // =============================================================================
  // External Ratings in File-Scope Queries (Bug Fix Tests)
  // =============================================================================

  describe('External Ratings in File-Scope Queries', () => {
    it('should filter files by externalRating field', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'externalRating', comparison: 'greater_than', value: '7' }] },
      ]);
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'files',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      // Mock files with external ratings
      const files = [
        {
          id: 'file-1',
          status: 'indexed',
          metadata: { publisher: 'Marvel' },
          userReadingProgress: [],
          externalRatings: [
            { ratingType: 'community', ratingValue: 8.5 },
            { ratingType: 'critic', ratingValue: 7.0 },
          ],
        },
        {
          id: 'file-2',
          status: 'indexed',
          metadata: { publisher: 'DC' },
          userReadingProgress: [],
          externalRatings: [
            { ratingType: 'community', ratingValue: 6.0 },
          ],
        },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      // Only file-1 has max external rating > 7 (8.5)
      expect(result.added).toBe(1);
    });

    it('should filter files by communityRating field', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'communityRating', comparison: 'greater_than', value: '7' }] },
      ]);
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'files',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      const files = [
        {
          id: 'file-1',
          status: 'indexed',
          metadata: {},
          userReadingProgress: [],
          externalRatings: [
            { ratingType: 'community', ratingValue: 8.0 },
            { ratingType: 'critic', ratingValue: 6.0 },
          ],
        },
        {
          id: 'file-2',
          status: 'indexed',
          metadata: {},
          userReadingProgress: [],
          externalRatings: [
            { ratingType: 'critic', ratingValue: 9.0 }, // High critic, but no community
          ],
        },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      // Only file-1 has community rating > 7
      expect(result.added).toBe(1);
    });

    it('should filter files by criticRating field', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'criticRating', comparison: 'greater_than', value: '8' }] },
      ]);
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'files',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      const files = [
        {
          id: 'file-1',
          status: 'indexed',
          metadata: {},
          userReadingProgress: [],
          externalRatings: [
            { ratingType: 'community', ratingValue: 9.0 },
            { ratingType: 'critic', ratingValue: 7.0 },
          ],
        },
        {
          id: 'file-2',
          status: 'indexed',
          metadata: {},
          userReadingProgress: [],
          externalRatings: [
            { ratingType: 'critic', ratingValue: 8.5 },
          ],
        },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      // Only file-2 has critic rating > 8
      expect(result.added).toBe(1);
    });

    it('should handle files with no external ratings', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'externalRating', comparison: 'is_not_empty', value: '' }] },
      ]);
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'files',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      const files = [
        {
          id: 'file-1',
          status: 'indexed',
          metadata: {},
          userReadingProgress: [],
          externalRatings: [{ ratingType: 'community', ratingValue: 8.0 }],
        },
        {
          id: 'file-2',
          status: 'indexed',
          metadata: {},
          userReadingProgress: [],
          externalRatings: [],
        },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      // Only file-1 has external rating
      expect(result.added).toBe(1);
    });
  });

  // =============================================================================
  // New Metadata Fields Filtering (Bug Fix Tests)
  // =============================================================================

  describe('New Metadata Fields Filtering', () => {
    async function testSeriesFilter(filter: ReturnType<typeof createFilter>, seriesData: Record<string, unknown>) {
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.series.findMany.mockResolvedValue([
        { id: 'series-1', deletedAt: null, isHidden: false, progress: [], userData: [], externalRatings: [], ...seriesData },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      return refreshSmartCollection('smart-col-1', 'user-1');
    }

    async function testFileFilter(filter: ReturnType<typeof createFilter>, fileData: Record<string, unknown>) {
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'files',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);
      mockPrisma.comicFile.findMany.mockResolvedValue([
        { id: 'file-1', status: 'indexed', userReadingProgress: [], externalRatings: [], ...fileData },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      return refreshSmartCollection('smart-col-1', 'user-1');
    }

    it('should filter series by ageRating', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'ageRating', comparison: 'equals', value: 'mature' }] },
      ]);

      const result = await testSeriesFilter(filter, { ageRating: 'Mature' });
      expect(result.added).toBe(1);
    });

    it('should filter series by language (languageISO)', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'language', comparison: 'equals', value: 'en' }] },
      ]);

      const result = await testSeriesFilter(filter, { languageISO: 'en' });
      expect(result.added).toBe(1);
    });

    it('should filter series by inker', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'inker', comparison: 'contains', value: 'smith' }] },
      ]);

      const result = await testSeriesFilter(filter, { inker: 'John Smith' });
      expect(result.added).toBe(1);
    });

    it('should filter series by colorist', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'colorist', comparison: 'contains', value: 'dave' }] },
      ]);

      const result = await testSeriesFilter(filter, { colorist: 'Dave Stewart' });
      expect(result.added).toBe(1);
    });

    it('should filter series by letterer', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'letterer', comparison: 'contains', value: 'comicraft' }] },
      ]);

      const result = await testSeriesFilter(filter, { letterer: 'Comicraft' });
      expect(result.added).toBe(1);
    });

    it('should filter series by editor', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'editor', comparison: 'contains', value: 'tom' }] },
      ]);

      const result = await testSeriesFilter(filter, { editor: 'Tom Brevoort' });
      expect(result.added).toBe(1);
    });

    it('should filter series by count (issueCount)', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'count', comparison: 'greater_than', value: '50' }] },
      ]);

      const result = await testSeriesFilter(filter, { issueCount: 100 });
      expect(result.added).toBe(1);
    });

    it('should filter files by imprint', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'imprint', comparison: 'equals', value: 'vertigo' }] },
      ]);

      const result = await testFileFilter(filter, { metadata: { imprint: 'Vertigo' } });
      expect(result.added).toBe(1);
    });

    it('should filter files by format', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'format', comparison: 'equals', value: 'trade paperback' }] },
      ]);

      const result = await testFileFilter(filter, { metadata: { format: 'Trade Paperback' } });
      expect(result.added).toBe(1);
    });

    it('should filter files by ageRating in metadata', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'ageRating', comparison: 'equals', value: 'teen+' }] },
      ]);

      const result = await testFileFilter(filter, { metadata: { ageRating: 'Teen+' } });
      expect(result.added).toBe(1);
    });

    it('should filter files by language (languageISO) in metadata', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'language', comparison: 'equals', value: 'ja' }] },
      ]);

      const result = await testFileFilter(filter, { metadata: { languageISO: 'ja' } });
      expect(result.added).toBe(1);
    });

    it('should filter files by inker in metadata', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'inker', comparison: 'contains', value: 'jones' }] },
      ]);

      const result = await testFileFilter(filter, { metadata: { inker: 'Mike Jones' } });
      expect(result.added).toBe(1);
    });

    it('should filter files by colorist in metadata', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'colorist', comparison: 'contains', value: 'laura' }] },
      ]);

      const result = await testFileFilter(filter, { metadata: { colorist: 'Laura Martin' } });
      expect(result.added).toBe(1);
    });

    it('should filter files by letterer in metadata', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'letterer', comparison: 'equals', value: 'vc joe caramagna' }] },
      ]);

      const result = await testFileFilter(filter, { metadata: { letterer: 'VC Joe Caramagna' } });
      expect(result.added).toBe(1);
    });

    it('should filter files by editor in metadata', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'editor', comparison: 'contains', value: 'axel' }] },
      ]);

      const result = await testFileFilter(filter, { metadata: { editor: 'Axel Alonso' } });
      expect(result.added).toBe(1);
    });

    it('should filter files by count in metadata', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'count', comparison: 'between', value: '1', value2: '5' }] },
      ]);

      const result = await testFileFilter(filter, { metadata: { count: 3 } });
      expect(result.added).toBe(1);
    });
  });

  // =============================================================================
  // External Ratings in Series-Scope Queries (Bug Fix Tests)
  // =============================================================================

  describe('External Ratings in Series-Scope Queries', () => {
    it('should filter series by externalRating field', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'externalRating', comparison: 'greater_than', value: '8' }] },
      ]);
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      mockPrisma.series.findMany.mockResolvedValue([
        {
          id: 'series-1',
          name: 'High Rated',
          deletedAt: null,
          isHidden: false,
          progress: [],
          userData: [],
          externalRatings: [
            { ratingType: 'community', ratingValue: 8.5 },
            { ratingType: 'critic', ratingValue: 9.0 },
          ],
        },
        {
          id: 'series-2',
          name: 'Low Rated',
          deletedAt: null,
          isHidden: false,
          progress: [],
          userData: [],
          externalRatings: [
            { ratingType: 'community', ratingValue: 6.0 },
          ],
        },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      // Only series-1 has max external rating > 8 (9.0)
      expect(result.added).toBe(1);
    });

    it('should filter series by communityRating field', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'communityRating', comparison: 'greater_than', value: '7' }] },
      ]);
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      mockPrisma.series.findMany.mockResolvedValue([
        {
          id: 'series-1',
          name: 'High Community',
          deletedAt: null,
          isHidden: false,
          progress: [],
          userData: [],
          externalRatings: [
            { ratingType: 'community', ratingValue: 8.0 },
          ],
        },
        {
          id: 'series-2',
          name: 'Low Community',
          deletedAt: null,
          isHidden: false,
          progress: [],
          userData: [],
          externalRatings: [
            { ratingType: 'community', ratingValue: 5.0 },
          ],
        },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      expect(result.added).toBe(1);
    });

    it('should handle series with no external ratings', async () => {
      const filter = createFilter([
        { operator: 'AND', conditions: [{ field: 'externalRating', comparison: 'is_empty', value: '' }] },
      ]);
      const col = createSmartCollection({
        filterDefinition: JSON.stringify(filter),
        smartScope: 'series',
        items: [],
      });
      mockPrisma.collection.findUnique.mockResolvedValue(col);

      mockPrisma.series.findMany.mockResolvedValue([
        {
          id: 'series-1',
          name: 'Rated',
          deletedAt: null,
          isHidden: false,
          progress: [],
          userData: [],
          externalRatings: [{ ratingType: 'community', ratingValue: 8.0 }],
        },
        {
          id: 'series-2',
          name: 'Unrated',
          deletedAt: null,
          isHidden: false,
          progress: [],
          userData: [],
          externalRatings: [],
        },
      ]);
      mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
      mockPrisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionItem.create.mockImplementation((args) =>
        Promise.resolve(createMockCollectionItem({ ...args.data }))
      );
      mockPrisma.collection.update.mockResolvedValue(col);

      const result = await refreshSmartCollection('smart-col-1', 'user-1');

      // Only series-2 has no external rating
      expect(result.added).toBe(1);
    });
  });
});
