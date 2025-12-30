/**
 * Filter Preset Service Tests
 *
 * Tests for filter preset management:
 * - CRUD operations (create, read, update, delete)
 * - Global vs user-specific presets
 * - Usage tracking and delete protection
 * - Preset duplication
 * - Local storage migration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockPrismaClient,
  createMockFilterPreset,
  createMockCollection,
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
  getFilterPresets,
  getFilterPreset,
  createFilterPreset,
  updateFilterPreset,
  deleteFilterPreset,
  getPresetUsage,
  canDeletePreset,
  duplicatePreset,
  migrateLocalPresets,
  getEffectiveFilter,
} = await import('../filter-preset.service.js');

describe('Filter Preset Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // getFilterPresets
  // =============================================================================

  describe('getFilterPresets', () => {
    it('should return user presets and global presets', async () => {
      const userPreset = createMockFilterPreset({ id: 'preset-1', userId: 'user-1' });
      const globalPreset = createMockFilterPreset({ id: 'preset-2', userId: null, isGlobal: true, name: 'Global Preset' });

      mockPrisma.filterPreset.findMany.mockResolvedValue([globalPreset, userPreset]);

      const presets = await getFilterPresets('user-1');

      expect(presets).toHaveLength(2);
      expect(mockPrisma.filterPreset.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ userId: 'user-1' }, { isGlobal: true }],
        },
        orderBy: [{ isGlobal: 'desc' }, { name: 'asc' }],
      });
    });

    it('should exclude global presets when includeGlobal is false', async () => {
      mockPrisma.filterPreset.findMany.mockResolvedValue([]);

      await getFilterPresets('user-1', { includeGlobal: false });

      expect(mockPrisma.filterPreset.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ userId: 'user-1' }],
        },
        orderBy: [{ isGlobal: 'desc' }, { name: 'asc' }],
      });
    });
  });

  // =============================================================================
  // getFilterPreset
  // =============================================================================

  describe('getFilterPreset', () => {
    it('should return a preset by ID if owned by user', async () => {
      const preset = createMockFilterPreset({ id: 'preset-1', userId: 'user-1' });
      mockPrisma.filterPreset.findFirst.mockResolvedValue(preset);

      const result = await getFilterPreset('preset-1', 'user-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('preset-1');
      expect(result?.filterDefinition).toEqual(expect.objectContaining({
        rootOperator: 'AND',
      }));
    });

    it('should return a global preset for any user', async () => {
      const preset = createMockFilterPreset({ id: 'preset-1', userId: null, isGlobal: true });
      mockPrisma.filterPreset.findFirst.mockResolvedValue(preset);

      const result = await getFilterPreset('preset-1', 'user-2');

      expect(result).not.toBeNull();
      expect(mockPrisma.filterPreset.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'preset-1',
          OR: [{ userId: 'user-2' }, { isGlobal: true }],
        },
      });
    });

    it('should return null if preset not found', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null);

      const result = await getFilterPreset('nonexistent', 'user-1');

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // createFilterPreset
  // =============================================================================

  describe('createFilterPreset', () => {
    it('should create a user preset', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null); // No duplicate
      mockPrisma.filterPreset.create.mockResolvedValue(
        createMockFilterPreset({ id: 'new-preset', name: 'My Filter' })
      );

      const result = await createFilterPreset('user-1', {
        name: 'My Filter',
        filterDefinition: {
          id: 'filter-1',
          rootOperator: 'AND',
          groups: [],
        },
      });

      expect(result.id).toBe('new-preset');
      expect(result.name).toBe('My Filter');
      expect(mockPrisma.filterPreset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          isGlobal: false,
          name: 'My Filter',
        }),
      });
    });

    it('should create a global preset when admin', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null);
      mockPrisma.filterPreset.create.mockResolvedValue(
        createMockFilterPreset({ id: 'global-preset', userId: null, isGlobal: true })
      );

      await createFilterPreset(
        'admin-1',
        {
          name: 'Global Filter',
          filterDefinition: { id: 'f1', rootOperator: 'AND', groups: [] },
          isGlobal: true,
        },
        true // isAdmin
      );

      expect(mockPrisma.filterPreset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null,
          isGlobal: true,
        }),
      });
    });

    it('should not create global preset for non-admin', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null);
      mockPrisma.filterPreset.create.mockResolvedValue(
        createMockFilterPreset({ id: 'user-preset', userId: 'user-1' })
      );

      await createFilterPreset(
        'user-1',
        {
          name: 'My Filter',
          filterDefinition: { id: 'f1', rootOperator: 'AND', groups: [] },
          isGlobal: true, // Ignored for non-admin
        },
        false // isAdmin
      );

      expect(mockPrisma.filterPreset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          isGlobal: false,
        }),
      });
    });

    it('should throw error if preset name already exists', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(
        createMockFilterPreset({ name: 'Duplicate' })
      );

      await expect(
        createFilterPreset('user-1', {
          name: 'Duplicate',
          filterDefinition: { id: 'f1', rootOperator: 'AND', groups: [] },
        })
      ).rejects.toThrow('A preset named "Duplicate" already exists');
    });
  });

  // =============================================================================
  // updateFilterPreset
  // =============================================================================

  describe('updateFilterPreset', () => {
    it('should update a user preset', async () => {
      const existing = createMockFilterPreset({
        id: 'preset-1',
        userId: 'user-1',
        linkedCollections: [],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(existing);
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null); // No duplicate
      mockPrisma.filterPreset.update.mockResolvedValue({
        ...existing,
        name: 'Updated Name',
      });

      const result = await updateFilterPreset('preset-1', 'user-1', { name: 'Updated Name' });

      expect(result.preset.name).toBe('Updated Name');
      expect(result.affectedCollections).toBe(0);
    });

    it('should return affected collection count', async () => {
      const existing = createMockFilterPreset({
        id: 'preset-1',
        userId: 'user-1',
        linkedCollections: [
          { id: 'col-1', name: 'Collection 1', userId: 'user-1', _count: { items: 5 } },
          { id: 'col-2', name: 'Collection 2', userId: 'user-1', _count: { items: 3 } },
        ],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(existing);
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null); // No duplicate
      mockPrisma.filterPreset.update.mockResolvedValue(existing);

      const result = await updateFilterPreset('preset-1', 'user-1', { name: 'Updated' });

      expect(result.affectedCollections).toBe(2);
    });

    it('should throw error if not owner', async () => {
      const existing = createMockFilterPreset({
        id: 'preset-1',
        userId: 'other-user',
        linkedCollections: [],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(existing);

      await expect(
        updateFilterPreset('preset-1', 'user-1', { name: 'Hacked' })
      ).rejects.toThrow('Not authorized to edit this preset');
    });

    it('should allow admin to edit global preset', async () => {
      const existing = createMockFilterPreset({
        id: 'preset-1',
        userId: null,
        isGlobal: true,
        linkedCollections: [],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(existing);
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null); // No duplicate
      mockPrisma.filterPreset.update.mockResolvedValue({ ...existing, name: 'Admin Edit' });

      const result = await updateFilterPreset(
        'preset-1',
        'admin-1',
        { name: 'Admin Edit' },
        true // isAdmin
      );

      expect(result.preset.name).toBe('Admin Edit');
    });

    it('should prevent duplicate name on update', async () => {
      const existing = createMockFilterPreset({
        id: 'preset-1',
        userId: 'user-1',
        name: 'Original',
        linkedCollections: [],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(existing);
      mockPrisma.filterPreset.findFirst.mockResolvedValue(
        createMockFilterPreset({ id: 'preset-2', name: 'Already Taken' })
      );

      await expect(
        updateFilterPreset('preset-1', 'user-1', { name: 'Already Taken' })
      ).rejects.toThrow('A preset named "Already Taken" already exists');
    });
  });

  // =============================================================================
  // deleteFilterPreset
  // =============================================================================

  describe('deleteFilterPreset', () => {
    it('should delete a preset with no linked collections', async () => {
      const existing = createMockFilterPreset({
        id: 'preset-1',
        userId: 'user-1',
        linkedCollections: [],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(existing);
      mockPrisma.filterPreset.delete.mockResolvedValue(existing);

      await deleteFilterPreset('preset-1', 'user-1');

      expect(mockPrisma.filterPreset.delete).toHaveBeenCalledWith({
        where: { id: 'preset-1' },
      });
    });

    it('should throw error if preset is in use', async () => {
      const existing = createMockFilterPreset({
        id: 'preset-1',
        userId: 'user-1',
        linkedCollections: [
          { id: 'col-1', name: 'My Collection', userId: 'user-1', _count: { items: 5 } },
        ],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(existing);

      await expect(deleteFilterPreset('preset-1', 'user-1')).rejects.toThrow(
        'Cannot delete preset: it is used by 1 collection(s)'
      );
    });

    it('should throw error if not owner', async () => {
      const existing = createMockFilterPreset({
        id: 'preset-1',
        userId: 'other-user',
        linkedCollections: [],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(existing);

      await expect(deleteFilterPreset('preset-1', 'user-1')).rejects.toThrow(
        'Not authorized to delete this preset'
      );
    });
  });

  // =============================================================================
  // getPresetUsage
  // =============================================================================

  describe('getPresetUsage', () => {
    it('should return usage information', async () => {
      const preset = createMockFilterPreset({
        id: 'preset-1',
        userId: 'user-1',
        linkedCollections: [
          { id: 'col-1', name: 'Collection 1', userId: 'user-1', _count: { items: 5 } },
          { id: 'col-2', name: 'Collection 2', userId: 'user-1', _count: { items: 10 } },
        ],
      });
      mockPrisma.filterPreset.findFirst.mockResolvedValue(preset);

      const usage = await getPresetUsage('preset-1', 'user-1');

      expect(usage.totalCollections).toBe(2);
      expect(usage.collections).toHaveLength(2);
      expect(usage.collections[0]).toEqual({
        id: 'col-1',
        name: 'Collection 1',
        userId: 'user-1',
        itemCount: 5,
      });
    });

    it('should throw error if preset not found', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null);

      await expect(getPresetUsage('nonexistent', 'user-1')).rejects.toThrow('Preset not found');
    });
  });

  // =============================================================================
  // canDeletePreset
  // =============================================================================

  describe('canDeletePreset', () => {
    it('should return true if preset has no linked collections', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(
        createMockFilterPreset({ id: 'preset-1', userId: 'user-1', linkedCollections: [] })
      );

      const result = await canDeletePreset('preset-1', 'user-1');

      expect(result.canDelete).toBe(true);
      expect(result.blockedBy).toHaveLength(0);
    });

    it('should return false with blockedBy if preset is in use', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(
        createMockFilterPreset({
          id: 'preset-1',
          userId: 'user-1',
          linkedCollections: [
            { id: 'col-1', name: 'Blocking Collection', userId: 'user-1', _count: { items: 1 } },
          ],
        })
      );

      const result = await canDeletePreset('preset-1', 'user-1');

      expect(result.canDelete).toBe(false);
      expect(result.blockedBy).toContain('Blocking Collection');
    });

    it('should allow checking global presets for any user', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(
        createMockFilterPreset({
          id: 'preset-1',
          userId: null,
          isGlobal: true,
          linkedCollections: [],
        })
      );

      const result = await canDeletePreset('preset-1', 'user-1');

      expect(result.canDelete).toBe(true);
      expect(mockPrisma.filterPreset.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'preset-1',
          OR: [{ userId: 'user-1' }, { isGlobal: true }],
        },
        include: {
          linkedCollections: {
            select: { name: true },
          },
        },
      });
    });

    it('should throw error if preset not found or not accessible', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null);

      await expect(canDeletePreset('preset-1', 'user-1')).rejects.toThrow(
        'Preset not found or not accessible'
      );
    });

    it('should not allow checking another user\'s preset', async () => {
      // Preset belongs to other-user, user-1 cannot access it
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null);

      await expect(canDeletePreset('preset-1', 'user-1')).rejects.toThrow(
        'Preset not found or not accessible'
      );
    });
  });

  // =============================================================================
  // duplicatePreset
  // =============================================================================

  describe('duplicatePreset', () => {
    it('should duplicate a preset with new name', async () => {
      const source = createMockFilterPreset({ id: 'source', name: 'Original' });
      mockPrisma.filterPreset.findFirst
        .mockResolvedValueOnce(source) // Find source
        .mockResolvedValueOnce(null); // Check duplicate name
      mockPrisma.filterPreset.create.mockResolvedValue(
        createMockFilterPreset({ id: 'copy', name: 'Copy of Original' })
      );

      const result = await duplicatePreset('source', 'user-1', 'Copy of Original');

      expect(result.name).toBe('Copy of Original');
      expect(mockPrisma.filterPreset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          isGlobal: false,
          name: 'Copy of Original',
        }),
      });
    });

    it('should allow duplicating global presets', async () => {
      const source = createMockFilterPreset({
        id: 'global',
        userId: null,
        isGlobal: true,
        name: 'Global Filter',
      });
      mockPrisma.filterPreset.findFirst
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(null);
      mockPrisma.filterPreset.create.mockResolvedValue(
        createMockFilterPreset({ id: 'copy', name: 'My Global Copy' })
      );

      const result = await duplicatePreset('global', 'user-1', 'My Global Copy');

      expect(result.name).toBe('My Global Copy');
    });

    it('should throw error if name already exists', async () => {
      const source = createMockFilterPreset({ id: 'source' });
      mockPrisma.filterPreset.findFirst
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(createMockFilterPreset({ name: 'Duplicate Name' }));

      await expect(
        duplicatePreset('source', 'user-1', 'Duplicate Name')
      ).rejects.toThrow('A preset named "Duplicate Name" already exists');
    });
  });

  // =============================================================================
  // migrateLocalPresets
  // =============================================================================

  describe('migrateLocalPresets', () => {
    it('should migrate local presets to database', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null); // No duplicates
      mockPrisma.filterPreset.create.mockResolvedValue(createMockFilterPreset());

      const localPresets = [
        { id: '1', name: 'Filter 1', rootOperator: 'AND' as const, groups: [] },
        { id: '2', name: 'Filter 2', rootOperator: 'OR' as const, groups: [] },
      ];

      const result = await migrateLocalPresets('user-1', localPresets);

      expect(result.migrated).toBe(2);
      expect(result.skipped).toBe(0);
      expect(mockPrisma.filterPreset.create).toHaveBeenCalledTimes(2);
    });

    it('should skip presets with duplicate names', async () => {
      mockPrisma.filterPreset.findFirst
        .mockResolvedValueOnce(createMockFilterPreset({ name: 'Existing' })) // First is duplicate
        .mockResolvedValueOnce(null); // Second is new
      mockPrisma.filterPreset.create.mockResolvedValue(createMockFilterPreset());

      const localPresets = [
        { id: '1', name: 'Existing', rootOperator: 'AND' as const, groups: [] },
        { id: '2', name: 'New Filter', rootOperator: 'AND' as const, groups: [] },
      ];

      const result = await migrateLocalPresets('user-1', localPresets);

      expect(result.migrated).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should use default name for unnamed filters', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null);
      mockPrisma.filterPreset.create.mockResolvedValue(createMockFilterPreset());

      const localPresets = [
        { id: '1', rootOperator: 'AND' as const, groups: [] }, // No name
      ];

      await migrateLocalPresets('user-1', localPresets);

      expect(mockPrisma.filterPreset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Unnamed Filter',
        }),
      });
    });
  });

  // =============================================================================
  // getEffectiveFilter
  // =============================================================================

  describe('getEffectiveFilter', () => {
    it('should return filter from linked preset', async () => {
      const collection = createMockCollection({
        id: 'col-1',
        filterPresetId: 'preset-1',
        filterDefinition: null,
      });
      const preset = createMockFilterPreset();
      mockPrisma.collection.findUnique.mockResolvedValue({
        ...collection,
        filterPreset: preset,
      });

      const filter = await getEffectiveFilter('col-1');

      expect(filter).not.toBeNull();
      expect(filter?.rootOperator).toBe('AND');
    });

    it('should return embedded filter when no preset linked', async () => {
      const collection = createMockCollection({
        id: 'col-1',
        filterPresetId: null,
        filterDefinition: JSON.stringify({
          id: 'embedded',
          rootOperator: 'OR',
          groups: [],
        }),
      });
      mockPrisma.collection.findUnique.mockResolvedValue({
        ...collection,
        filterPreset: null,
      });

      const filter = await getEffectiveFilter('col-1');

      expect(filter).not.toBeNull();
      expect(filter?.rootOperator).toBe('OR');
    });

    it('should return null if no filter defined', async () => {
      const collection = createMockCollection({
        id: 'col-1',
        filterPresetId: null,
        filterDefinition: null,
      });
      mockPrisma.collection.findUnique.mockResolvedValue({
        ...collection,
        filterPreset: null,
      });

      const filter = await getEffectiveFilter('col-1');

      expect(filter).toBeNull();
    });

    it('should return null if collection not found', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue(null);

      const filter = await getEffectiveFilter('nonexistent');

      expect(filter).toBeNull();
    });

    it('should return null if preset linked but filterDefinition is empty', async () => {
      const collection = createMockCollection({
        id: 'col-1',
        filterPresetId: 'preset-1',
        filterDefinition: null,
      });
      mockPrisma.collection.findUnique.mockResolvedValue({
        ...collection,
        filterPreset: {
          id: 'preset-1',
          filterDefinition: '', // Empty string - should be handled safely
        },
      });

      const filter = await getEffectiveFilter('col-1');

      // Should return null due to empty filterDefinition being falsy
      expect(filter).toBeNull();
    });
  });

  // =============================================================================
  // Additional Authorization Tests
  // =============================================================================

  describe('Authorization Edge Cases', () => {
    it('should prevent non-admin from editing global preset', async () => {
      const globalPreset = createMockFilterPreset({
        id: 'preset-1',
        userId: null,
        isGlobal: true,
        linkedCollections: [],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(globalPreset);

      await expect(
        updateFilterPreset('preset-1', 'user-1', { name: 'Hacked' }, false)
      ).rejects.toThrow('Not authorized to edit this preset');
    });

    it('should prevent non-admin from deleting global preset', async () => {
      const globalPreset = createMockFilterPreset({
        id: 'preset-1',
        userId: null,
        isGlobal: true,
        linkedCollections: [],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(globalPreset);

      await expect(
        deleteFilterPreset('preset-1', 'user-1', false)
      ).rejects.toThrow('Not authorized to delete this preset');
    });

    it('should allow admin to delete global preset with no collections', async () => {
      const globalPreset = createMockFilterPreset({
        id: 'preset-1',
        userId: null,
        isGlobal: true,
        linkedCollections: [],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(globalPreset);
      mockPrisma.filterPreset.delete.mockResolvedValue(globalPreset);

      await deleteFilterPreset('preset-1', 'admin-1', true);

      expect(mockPrisma.filterPreset.delete).toHaveBeenCalledWith({
        where: { id: 'preset-1' },
      });
    });
  });

  // =============================================================================
  // Migration Edge Cases
  // =============================================================================

  describe('migrateLocalPresets Edge Cases', () => {
    it('should handle empty presets array', async () => {
      const result = await migrateLocalPresets('user-1', []);

      expect(result.migrated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockPrisma.filterPreset.create).not.toHaveBeenCalled();
    });

    it('should handle preset with sortBy and sortOrder', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null);
      mockPrisma.filterPreset.create.mockResolvedValue(createMockFilterPreset());

      const localPresets = [
        {
          id: '1',
          name: 'Sorted Filter',
          rootOperator: 'AND' as const,
          groups: [],
          sortBy: 'name' as const,
          sortOrder: 'asc' as const,
        },
      ];

      await migrateLocalPresets('user-1', localPresets);

      expect(mockPrisma.filterPreset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sortBy: 'name',
          sortOrder: 'asc',
        }),
      });
    });

    it('should record errors for failed migrations without stopping', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null);
      mockPrisma.filterPreset.create
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(createMockFilterPreset());

      const localPresets = [
        { id: '1', name: 'Fail Filter', rootOperator: 'AND' as const, groups: [] },
        { id: '2', name: 'Success Filter', rootOperator: 'AND' as const, groups: [] },
      ];

      const result = await migrateLocalPresets('user-1', localPresets);

      expect(result.migrated).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Fail Filter');
      expect(result.errors[0]).toContain('DB error');
    });
  });

  // =============================================================================
  // Null/Undefined Edge Cases
  // =============================================================================

  describe('Null/Undefined Edge Cases', () => {
    it('should handle preset not found in updateFilterPreset', async () => {
      mockPrisma.filterPreset.findUnique.mockResolvedValue(null);

      await expect(
        updateFilterPreset('nonexistent', 'user-1', { name: 'New Name' })
      ).rejects.toThrow('Preset not found');
    });

    it('should handle preset not found in deleteFilterPreset', async () => {
      mockPrisma.filterPreset.findUnique.mockResolvedValue(null);

      await expect(
        deleteFilterPreset('nonexistent', 'user-1')
      ).rejects.toThrow('Preset not found');
    });

    it('should handle preset not found in duplicatePreset', async () => {
      mockPrisma.filterPreset.findFirst.mockResolvedValue(null);

      await expect(
        duplicatePreset('nonexistent', 'user-1', 'Copy Name')
      ).rejects.toThrow('Preset not found');
    });

    it('should handle update with optional description and icon', async () => {
      const existing = createMockFilterPreset({
        id: 'preset-1',
        userId: 'user-1',
        linkedCollections: [],
      });
      mockPrisma.filterPreset.findUnique.mockResolvedValue(existing);
      mockPrisma.filterPreset.update.mockResolvedValue({
        ...existing,
        description: 'New description',
        icon: 'star',
      });

      const result = await updateFilterPreset('preset-1', 'user-1', {
        description: 'New description',
        icon: 'star',
      });

      expect(mockPrisma.filterPreset.update).toHaveBeenCalledWith({
        where: { id: 'preset-1' },
        data: expect.objectContaining({
          description: 'New description',
          icon: 'star',
        }),
      });
    });
  });
});
