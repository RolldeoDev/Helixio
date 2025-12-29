/**
 * Smart Collection Dirty Service Tests
 *
 * Comprehensive tests for automatic smart collection updates:
 * - Dirty flag creation and management
 * - Processing logic (grouping by user, deduplication)
 * - Debouncing behavior
 * - Integration with evaluateChangedItems
 * - Multi-user handling
 * - Edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockPrismaClient, createMockCollection, createMockSeries, createMockComicFile } from './__mocks__/prisma.mock.js';

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

// Mock smart collection service - we want to verify evaluateChangedItems is called
const mockEvaluateChangedItems = vi.fn().mockResolvedValue(undefined);
vi.mock('../smart-collection.service.js', () => ({
  evaluateChangedItems: mockEvaluateChangedItems,
}));

// Import service after mocking
const {
  markSmartCollectionsDirty,
  getPendingDirtyFlags,
  clearDirtyFlags,
  clearAllDirtyFlags,
  processSmartCollectionDirtyFlags,
  triggerDebouncedProcessing,
  processImmediately,
  startSmartCollectionProcessor,
  stopSmartCollectionProcessor,
  __resetForTesting,
  __isProcessing,
  __hasDebounceTimer,
} = await import('../smart-collection-dirty.service.js');

// Helper to create a mock dirty flag
function createMockDirtyFlag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flag-1',
    userId: null,
    seriesId: null,
    fileId: null,
    reason: 'series_metadata',
    createdAt: new Date(),
    ...overrides,
  };
}

// Helper to create a mock smart collection
function createSmartCollectionMock(userId: string, id: string = 'smart-col-1') {
  return createMockCollection({
    id,
    userId,
    isSmart: true,
    smartScope: 'series',
    filterDefinition: JSON.stringify({
      id: 'root',
      rootOperator: 'AND',
      groups: [
        {
          id: 'group-1',
          operator: 'AND',
          conditions: [
            { id: 'cond-1', field: 'writer', comparison: 'contains', value: 'Brian K. Vaughan' },
          ],
        },
      ],
    }),
  });
}

describe('Smart Collection Dirty Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetForTesting();

    // Default mock implementations
    mockPrisma.smartCollectionDirtyFlag.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue([]);
    mockPrisma.smartCollectionDirtyFlag.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.smartCollectionDirtyFlag.count.mockResolvedValue(0);
    mockPrisma.collection.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    __resetForTesting();
  });

  // =============================================================================
  // markSmartCollectionsDirty
  // =============================================================================

  describe('markSmartCollectionsDirty', () => {
    it('should create dirty flags for series changes', async () => {
      await markSmartCollectionsDirty({
        seriesIds: ['series-1', 'series-2'],
        reason: 'series_metadata',
      });

      expect(mockPrisma.smartCollectionDirtyFlag.createMany).toHaveBeenCalledWith({
        data: [
          { userId: null, seriesId: 'series-1', fileId: null, reason: 'series_metadata' },
          { userId: null, seriesId: 'series-2', fileId: null, reason: 'series_metadata' },
        ],
      });
    });

    it('should create dirty flags for file changes', async () => {
      await markSmartCollectionsDirty({
        fileIds: ['file-1', 'file-2'],
        reason: 'file_metadata',
      });

      expect(mockPrisma.smartCollectionDirtyFlag.createMany).toHaveBeenCalledWith({
        data: [
          { userId: null, seriesId: null, fileId: 'file-1', reason: 'file_metadata' },
          { userId: null, seriesId: null, fileId: 'file-2', reason: 'file_metadata' },
        ],
      });
    });

    it('should include userId when provided (user-specific change)', async () => {
      await markSmartCollectionsDirty({
        userId: 'user-1',
        seriesIds: ['series-1'],
        reason: 'reading_progress',
      });

      expect(mockPrisma.smartCollectionDirtyFlag.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', seriesId: 'series-1', fileId: null, reason: 'reading_progress' },
        ],
      });
    });

    it('should handle mixed series and file changes', async () => {
      await markSmartCollectionsDirty({
        seriesIds: ['series-1'],
        fileIds: ['file-1'],
        reason: 'user_data',
      });

      expect(mockPrisma.smartCollectionDirtyFlag.createMany).toHaveBeenCalledWith({
        data: [
          { userId: null, seriesId: 'series-1', fileId: null, reason: 'user_data' },
          { userId: null, seriesId: null, fileId: 'file-1', reason: 'user_data' },
        ],
      });
    });

    it('should create a general flag when no specific items provided', async () => {
      await markSmartCollectionsDirty({
        reason: 'item_deleted',
      });

      expect(mockPrisma.smartCollectionDirtyFlag.createMany).toHaveBeenCalledWith({
        data: [
          { userId: null, seriesId: null, fileId: null, reason: 'item_deleted' },
        ],
      });
    });

    it('should trigger debounced processing after marking dirty', async () => {
      await markSmartCollectionsDirty({
        seriesIds: ['series-1'],
        reason: 'series_metadata',
      });

      // Debounce timer should be set
      expect(__hasDebounceTimer()).toBe(true);
    });
  });

  // =============================================================================
  // getPendingDirtyFlags
  // =============================================================================

  describe('getPendingDirtyFlags', () => {
    it('should return all pending flags ordered by creation time', async () => {
      const flags = [
        createMockDirtyFlag({ id: 'flag-1', createdAt: new Date('2024-01-01') }),
        createMockDirtyFlag({ id: 'flag-2', createdAt: new Date('2024-01-02') }),
      ];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      const result = await getPendingDirtyFlags();

      expect(result).toHaveLength(2);
      expect(mockPrisma.smartCollectionDirtyFlag.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should return empty array when no flags exist', async () => {
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue([]);

      const result = await getPendingDirtyFlags();

      expect(result).toHaveLength(0);
    });
  });

  // =============================================================================
  // clearDirtyFlags
  // =============================================================================

  describe('clearDirtyFlags', () => {
    it('should delete flags by their IDs', async () => {
      await clearDirtyFlags(['flag-1', 'flag-2']);

      expect(mockPrisma.smartCollectionDirtyFlag.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['flag-1', 'flag-2'] } },
      });
    });

    it('should not call deleteMany when given empty array', async () => {
      await clearDirtyFlags([]);

      expect(mockPrisma.smartCollectionDirtyFlag.deleteMany).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // processSmartCollectionDirtyFlags
  // =============================================================================

  describe('processSmartCollectionDirtyFlags', () => {
    it('should return early when no flags exist', async () => {
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue([]);

      const result = await processSmartCollectionDirtyFlags();

      expect(result).toEqual({ processed: 0, usersUpdated: 0 });
      expect(mockEvaluateChangedItems).not.toHaveBeenCalled();
    });

    it('should group flags by userId and call evaluateChangedItems for each', async () => {
      const flags = [
        createMockDirtyFlag({ id: 'flag-1', userId: 'user-1', seriesId: 'series-1' }),
        createMockDirtyFlag({ id: 'flag-2', userId: 'user-1', seriesId: 'series-2' }),
        createMockDirtyFlag({ id: 'flag-3', userId: 'user-2', seriesId: 'series-3' }),
      ];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      const result = await processSmartCollectionDirtyFlags();

      expect(mockEvaluateChangedItems).toHaveBeenCalledTimes(2);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-1', ['series-1', 'series-2'], []);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-2', ['series-3'], []);
      expect(result.processed).toBe(3);
      expect(result.usersUpdated).toBe(2);
    });

    it('should evaluate for all users with smart collections when userId is null', async () => {
      const flags = [
        createMockDirtyFlag({ id: 'flag-1', userId: null, seriesId: 'series-1' }),
      ];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);
      mockPrisma.collection.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
        { userId: 'user-3' },
      ]);

      const result = await processSmartCollectionDirtyFlags();

      expect(mockEvaluateChangedItems).toHaveBeenCalledTimes(3);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-1', ['series-1'], []);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-2', ['series-1'], []);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-3', ['series-1'], []);
      expect(result.usersUpdated).toBe(3);
    });

    it('should deduplicate series and file IDs', async () => {
      const flags = [
        createMockDirtyFlag({ id: 'flag-1', userId: 'user-1', seriesId: 'series-1' }),
        createMockDirtyFlag({ id: 'flag-2', userId: 'user-1', seriesId: 'series-1' }), // duplicate
        createMockDirtyFlag({ id: 'flag-3', userId: 'user-1', fileId: 'file-1' }),
        createMockDirtyFlag({ id: 'flag-4', userId: 'user-1', fileId: 'file-1' }), // duplicate
      ];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      await processSmartCollectionDirtyFlags();

      // Should only call once with deduplicated IDs
      expect(mockEvaluateChangedItems).toHaveBeenCalledTimes(1);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-1', ['series-1'], ['file-1']);
    });

    it('should clear all processed flags after completion', async () => {
      const flags = [
        createMockDirtyFlag({ id: 'flag-1', userId: 'user-1', seriesId: 'series-1' }),
        createMockDirtyFlag({ id: 'flag-2', userId: 'user-1', seriesId: 'series-2' }),
      ];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      await processSmartCollectionDirtyFlags();

      expect(mockPrisma.smartCollectionDirtyFlag.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['flag-1', 'flag-2'] } },
      });
    });

    it('should skip processing if no series or file IDs in flags', async () => {
      const flags = [
        createMockDirtyFlag({ id: 'flag-1', userId: 'user-1', seriesId: null, fileId: null }),
      ];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      const result = await processSmartCollectionDirtyFlags();

      expect(mockEvaluateChangedItems).not.toHaveBeenCalled();
      expect(result.usersUpdated).toBe(0);
    });

    it('should handle mixed user-specific and global flags', async () => {
      const flags = [
        createMockDirtyFlag({ id: 'flag-1', userId: null, seriesId: 'series-global' }),
        createMockDirtyFlag({ id: 'flag-2', userId: 'user-1', seriesId: 'series-user1' }),
      ];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);
      mockPrisma.collection.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);

      await processSmartCollectionDirtyFlags();

      // Global flag should trigger for user-1 and user-2
      // User-specific flag should trigger only for user-1
      expect(mockEvaluateChangedItems).toHaveBeenCalledTimes(3);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-1', ['series-global'], []);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-2', ['series-global'], []);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-1', ['series-user1'], []);
    });

    it('should continue processing other users if one fails', async () => {
      const flags = [
        createMockDirtyFlag({ id: 'flag-1', userId: 'user-1', seriesId: 'series-1' }),
        createMockDirtyFlag({ id: 'flag-2', userId: 'user-2', seriesId: 'series-2' }),
      ];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      // First call fails, second succeeds
      mockEvaluateChangedItems
        .mockRejectedValueOnce(new Error('User 1 failed'))
        .mockResolvedValueOnce(undefined);

      const result = await processSmartCollectionDirtyFlags();

      expect(mockEvaluateChangedItems).toHaveBeenCalledTimes(2);
      expect(result.usersUpdated).toBe(1); // Only user-2 succeeded
    });
  });

  // =============================================================================
  // Debouncing
  // =============================================================================

  describe('debouncing', () => {
    it('should batch multiple rapid markDirty calls', async () => {
      // Call mark dirty multiple times rapidly
      await markSmartCollectionsDirty({ seriesIds: ['series-1'], reason: 'series_metadata' });
      await markSmartCollectionsDirty({ seriesIds: ['series-2'], reason: 'series_metadata' });
      await markSmartCollectionsDirty({ seriesIds: ['series-3'], reason: 'series_metadata' });

      // All should create flags
      expect(mockPrisma.smartCollectionDirtyFlag.createMany).toHaveBeenCalledTimes(3);

      // But only one debounce timer should be active
      expect(__hasDebounceTimer()).toBe(true);
    });

    it('should process flags after debounce period', async () => {
      vi.useFakeTimers();

      const flags = [createMockDirtyFlag({ id: 'flag-1', userId: 'user-1', seriesId: 'series-1' })];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      await markSmartCollectionsDirty({ seriesIds: ['series-1'], reason: 'series_metadata' });

      // Not processed yet
      expect(mockEvaluateChangedItems).not.toHaveBeenCalled();

      // Advance past debounce period
      await vi.advanceTimersByTimeAsync(2000);

      // Now should be processed
      expect(mockEvaluateChangedItems).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('processImmediately should bypass debounce', async () => {
      const flags = [createMockDirtyFlag({ id: 'flag-1', userId: 'user-1', seriesId: 'series-1' })];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      await markSmartCollectionsDirty({ seriesIds: ['series-1'], reason: 'series_metadata' });

      // Debounce timer is set
      expect(__hasDebounceTimer()).toBe(true);

      // Process immediately
      const result = await processImmediately();

      // Timer should be cancelled
      expect(__hasDebounceTimer()).toBe(false);

      // Should have processed
      expect(result.processed).toBe(1);
      expect(mockEvaluateChangedItems).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Startup / Shutdown
  // =============================================================================

  describe('startup and shutdown', () => {
    it('should process existing flags on startup', async () => {
      const flags = [createMockDirtyFlag({ id: 'flag-1', userId: 'user-1', seriesId: 'series-1' })];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      startSmartCollectionProcessor();

      // Give time for async startup processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockEvaluateChangedItems).toHaveBeenCalled();

      stopSmartCollectionProcessor();
    });

    it('should clean up timers on shutdown', () => {
      startSmartCollectionProcessor();
      expect(() => stopSmartCollectionProcessor()).not.toThrow();
    });
  });

  // =============================================================================
  // Integration Scenarios
  // =============================================================================

  describe('integration scenarios', () => {
    it('series metadata change should trigger evaluation for all users', async () => {
      // Setup: series-1 metadata changed, 3 users have smart collections
      mockPrisma.collection.findMany.mockResolvedValue([
        { userId: 'user-a' },
        { userId: 'user-b' },
        { userId: 'user-c' },
      ]);

      // Simulate series update marking dirty
      await markSmartCollectionsDirty({
        seriesIds: ['series-1'],
        reason: 'series_metadata',
      });

      // Get flags and process
      const flags = [createMockDirtyFlag({ id: 'flag-1', userId: null, seriesId: 'series-1' })];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      await processImmediately();

      // All 3 users should have been evaluated
      expect(mockEvaluateChangedItems).toHaveBeenCalledTimes(3);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-a', ['series-1'], []);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-b', ['series-1'], []);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-c', ['series-1'], []);
    });

    it('reading progress change should only trigger for that user', async () => {
      // Simulate reading progress update (user-specific)
      await markSmartCollectionsDirty({
        userId: 'user-1',
        seriesIds: ['series-1'],
        fileIds: ['file-1'],
        reason: 'reading_progress',
      });

      // Get flags and process
      const flags = [
        createMockDirtyFlag({ id: 'flag-1', userId: 'user-1', seriesId: 'series-1', fileId: null }),
        createMockDirtyFlag({ id: 'flag-2', userId: 'user-1', seriesId: null, fileId: 'file-1' }),
      ];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);

      await processImmediately();

      // Only user-1 should have been evaluated
      expect(mockEvaluateChangedItems).toHaveBeenCalledTimes(1);
      expect(mockEvaluateChangedItems).toHaveBeenCalledWith('user-1', ['series-1'], ['file-1']);
    });

    it('bulk update should batch all changes efficiently', async () => {
      // Simulate bulk update of 10 series
      await markSmartCollectionsDirty({
        seriesIds: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'],
        reason: 'series_metadata',
      });

      // All should be in a single createMany call
      expect(mockPrisma.smartCollectionDirtyFlag.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.smartCollectionDirtyFlag.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ seriesId: 's1' }),
          expect.objectContaining({ seriesId: 's10' }),
        ]),
      });
    });
  });

  // =============================================================================
  // Error Handling
  // =============================================================================

  describe('error handling', () => {
    it('should not throw when markSmartCollectionsDirty fails', async () => {
      mockPrisma.smartCollectionDirtyFlag.createMany.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(
        markSmartCollectionsDirty({ seriesIds: ['series-1'], reason: 'series_metadata' })
      ).resolves.not.toThrow();
    });

    it('should handle database errors during processing gracefully', async () => {
      const flags = [createMockDirtyFlag({ id: 'flag-1', userId: 'user-1', seriesId: 'series-1' })];
      mockPrisma.smartCollectionDirtyFlag.findMany.mockResolvedValue(flags);
      mockEvaluateChangedItems.mockRejectedValue(new Error('Evaluation failed'));

      // Should not throw
      const result = await processSmartCollectionDirtyFlags();

      // Should still clear flags
      expect(mockPrisma.smartCollectionDirtyFlag.deleteMany).toHaveBeenCalled();
      expect(result.processed).toBe(1);
      expect(result.usersUpdated).toBe(0);
    });
  });
});
