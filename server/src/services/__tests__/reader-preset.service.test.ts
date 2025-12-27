/**
 * Reader Preset Service Tests
 *
 * Tests for managing reader presets:
 * - Bundled presets (Western, Manga, Webtoon)
 * - System presets (admin-only)
 * - User presets (private per-user)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrismaClient, createMockReaderPreset } from './__mocks__/prisma.mock.js';

// Create mock prisma client
const mockPrisma = createMockPrismaClient();

// Mock database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockPrisma),
}));

// Import service after mocking
const {
  ensureBundledPresets,
  getAllPresets,
  getPresetById,
  createPreset,
  updatePreset,
  deletePreset,
  canUserManagePreset,
  getPresetsGrouped,
  extractSettingsFromPreset,
} = await import('../reader-preset.service.js');

describe('Reader Preset Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // ensureBundledPresets
  // =============================================================================

  describe('ensureBundledPresets', () => {
    it('should create bundled presets if they do not exist', async () => {
      mockPrisma.readerPreset.findFirst.mockResolvedValue(null);
      mockPrisma.readerPreset.create.mockImplementation((args) =>
        Promise.resolve({ id: 'new-preset', ...args.data })
      );

      await ensureBundledPresets();

      // Should have tried to find each bundled preset
      expect(mockPrisma.readerPreset.findFirst).toHaveBeenCalledTimes(3);
      // Should have created 3 bundled presets
      expect(mockPrisma.readerPreset.create).toHaveBeenCalledTimes(3);
    });

    it('should update existing bundled presets', async () => {
      const existingPreset = createMockReaderPreset({
        id: 'existing-1',
        name: 'Western Comics',
        isBundled: true,
        isSystem: true,
      });
      mockPrisma.readerPreset.findFirst.mockResolvedValue(existingPreset);

      await ensureBundledPresets();

      // Should have updated all 3 presets
      expect(mockPrisma.readerPreset.update).toHaveBeenCalledTimes(3);
      // Should not have created any
      expect(mockPrisma.readerPreset.create).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // getAllPresets
  // =============================================================================

  describe('getAllPresets', () => {
    it('should return all presets visible to a user', async () => {
      const bundled = createMockReaderPreset({
        id: 'bundled-1',
        name: 'Western Comics',
        isBundled: true,
        isSystem: true,
      });
      const system = createMockReaderPreset({
        id: 'system-1',
        name: 'Custom System',
        isBundled: false,
        isSystem: true,
      });
      const user = createMockReaderPreset({
        id: 'user-1',
        name: 'My Preset',
        isBundled: false,
        isSystem: false,
        userId: 'user-1',
      });

      mockPrisma.readerPreset.findMany.mockResolvedValue([bundled, system, user]);

      const result = await getAllPresets('user-1');

      expect(result).toHaveLength(3);
      expect(mockPrisma.readerPreset.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { isBundled: true },
            { isSystem: true },
            { userId: 'user-1' },
          ],
        },
        orderBy: [
          { isBundled: 'desc' },
          { isSystem: 'desc' },
          { name: 'asc' },
        ],
      });
    });

    it('should return only bundled and system presets when no userId', async () => {
      const bundled = createMockReaderPreset({ isBundled: true, isSystem: true });
      mockPrisma.readerPreset.findMany.mockResolvedValue([bundled]);

      await getAllPresets();

      expect(mockPrisma.readerPreset.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { isBundled: true },
            { isSystem: true },
          ],
        },
        orderBy: expect.any(Array),
      });
    });
  });

  // =============================================================================
  // getPresetById
  // =============================================================================

  describe('getPresetById', () => {
    it('should return preset if found', async () => {
      const preset = createMockReaderPreset({ id: 'preset-1' });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(preset);

      const result = await getPresetById('preset-1');

      expect(result).toEqual(preset);
      expect(mockPrisma.readerPreset.findUnique).toHaveBeenCalledWith({
        where: { id: 'preset-1' },
      });
    });

    it('should return null if preset not found', async () => {
      mockPrisma.readerPreset.findUnique.mockResolvedValue(null);

      const result = await getPresetById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // createPreset
  // =============================================================================

  describe('createPreset', () => {
    it('should create a user preset with defaults', async () => {
      mockPrisma.readerPreset.findFirst.mockResolvedValue(null);
      mockPrisma.readerPreset.create.mockImplementation((args) =>
        Promise.resolve({ id: 'new-preset', ...args.data })
      );

      const result = await createPreset({ name: 'My Preset' }, 'user-1');

      expect(result.name).toBe('My Preset');
      expect(result.userId).toBe('user-1');
      expect(result.isSystem).toBe(false);
      expect(result.mode).toBe('single');
      expect(result.direction).toBe('ltr');
    });

    it('should create a system preset when isSystem is true', async () => {
      mockPrisma.readerPreset.findFirst.mockResolvedValue(null);
      mockPrisma.readerPreset.create.mockImplementation((args) =>
        Promise.resolve({ id: 'new-preset', ...args.data })
      );

      const result = await createPreset({ name: 'System Preset', isSystem: true });

      expect(result.isSystem).toBe(true);
      expect(result.userId).toBeNull();
    });

    it('should throw error if name is empty', async () => {
      await expect(createPreset({ name: '' })).rejects.toThrow('Preset name is required');
      await expect(createPreset({ name: '   ' })).rejects.toThrow('Preset name is required');
    });

    it('should throw error if preset name already exists', async () => {
      const existing = createMockReaderPreset({ name: 'Existing' });
      mockPrisma.readerPreset.findFirst.mockResolvedValue(existing);

      await expect(createPreset({ name: 'Existing' }, 'user-1')).rejects.toThrow(
        'A preset with name "Existing" already exists'
      );
    });

    it('should use custom settings when provided', async () => {
      mockPrisma.readerPreset.findFirst.mockResolvedValue(null);
      mockPrisma.readerPreset.create.mockImplementation((args) =>
        Promise.resolve({ id: 'new-preset', ...args.data })
      );

      const result = await createPreset({
        name: 'Manga Preset',
        mode: 'double',
        direction: 'rtl',
        scaling: 'fitWidth',
        brightness: 90,
        webtoonGap: 16,
      }, 'user-1');

      expect(result.mode).toBe('double');
      expect(result.direction).toBe('rtl');
      expect(result.scaling).toBe('fitWidth');
      expect(result.brightness).toBe(90);
      expect(result.webtoonGap).toBe(16);
    });
  });

  // =============================================================================
  // updatePreset
  // =============================================================================

  describe('updatePreset', () => {
    it('should update a user preset', async () => {
      const existing = createMockReaderPreset({
        id: 'preset-1',
        userId: 'user-1',
        isSystem: false,
        isBundled: false,
      });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(existing);
      mockPrisma.readerPreset.findFirst.mockResolvedValue(null);
      mockPrisma.readerPreset.update.mockImplementation((args) =>
        Promise.resolve({ ...existing, ...args.data })
      );

      const result = await updatePreset('preset-1', { name: 'Updated Name' }, 'user-1');

      expect(result.name).toBe('Updated Name');
    });

    it('should throw error if preset not found', async () => {
      mockPrisma.readerPreset.findUnique.mockResolvedValue(null);

      await expect(updatePreset('nonexistent', { name: 'New' })).rejects.toThrow('Preset not found');
    });

    it('should throw error if trying to modify bundled preset', async () => {
      const bundled = createMockReaderPreset({ isBundled: true });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(bundled);

      await expect(updatePreset('preset-1', { name: 'New' })).rejects.toThrow(
        'Bundled presets cannot be modified'
      );
    });

    it('should throw error if non-admin tries to modify system preset', async () => {
      const system = createMockReaderPreset({ isSystem: true, isBundled: false });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(system);

      await expect(updatePreset('preset-1', { name: 'New' }, 'user-1', false)).rejects.toThrow(
        'Only admins can modify system presets'
      );
    });

    it('should allow admin to modify system preset', async () => {
      const system = createMockReaderPreset({ isSystem: true, isBundled: false });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(system);
      mockPrisma.readerPreset.findFirst.mockResolvedValue(null);
      mockPrisma.readerPreset.update.mockResolvedValue({ ...system, name: 'Updated' });

      const result = await updatePreset('preset-1', { name: 'Updated' }, 'admin-1', true);

      expect(result.name).toBe('Updated');
    });

    it('should throw error if user tries to modify another user preset', async () => {
      const otherUser = createMockReaderPreset({
        userId: 'other-user',
        isSystem: false,
        isBundled: false,
      });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(otherUser);

      await expect(updatePreset('preset-1', { name: 'New' }, 'user-1')).rejects.toThrow(
        'You can only modify your own presets'
      );
    });

    it('should throw error if new name already exists', async () => {
      const existing = createMockReaderPreset({
        id: 'preset-1',
        name: 'Original',
        userId: 'user-1',
        isSystem: false,
        isBundled: false,
      });
      const duplicate = createMockReaderPreset({ id: 'preset-2', name: 'Existing' });

      mockPrisma.readerPreset.findUnique.mockResolvedValue(existing);
      mockPrisma.readerPreset.findFirst.mockResolvedValue(duplicate);

      await expect(updatePreset('preset-1', { name: 'Existing' }, 'user-1')).rejects.toThrow(
        'A preset with name "Existing" already exists'
      );
    });
  });

  // =============================================================================
  // deletePreset
  // =============================================================================

  describe('deletePreset', () => {
    it('should delete a user preset', async () => {
      const preset = createMockReaderPreset({
        id: 'preset-1',
        userId: 'user-1',
        isSystem: false,
        isBundled: false,
      });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(preset);

      await deletePreset('preset-1', 'user-1');

      expect(mockPrisma.readerPreset.delete).toHaveBeenCalledWith({
        where: { id: 'preset-1' },
      });
    });

    it('should throw error if preset not found', async () => {
      mockPrisma.readerPreset.findUnique.mockResolvedValue(null);

      await expect(deletePreset('nonexistent')).rejects.toThrow('Preset not found');
    });

    it('should throw error if trying to delete bundled preset', async () => {
      const bundled = createMockReaderPreset({ isBundled: true });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(bundled);

      await expect(deletePreset('preset-1')).rejects.toThrow('Bundled presets cannot be deleted');
    });

    it('should throw error if non-admin tries to delete system preset', async () => {
      const system = createMockReaderPreset({ isSystem: true, isBundled: false });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(system);

      await expect(deletePreset('preset-1', 'user-1', false)).rejects.toThrow(
        'Only admins can delete system presets'
      );
    });

    it('should allow admin to delete system preset', async () => {
      const system = createMockReaderPreset({ isSystem: true, isBundled: false });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(system);

      await deletePreset('preset-1', 'admin-1', true);

      expect(mockPrisma.readerPreset.delete).toHaveBeenCalled();
    });

    it('should throw error if user tries to delete another user preset', async () => {
      const otherUser = createMockReaderPreset({
        userId: 'other-user',
        isSystem: false,
        isBundled: false,
      });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(otherUser);

      await expect(deletePreset('preset-1', 'user-1')).rejects.toThrow(
        'You can only delete your own presets'
      );
    });
  });

  // =============================================================================
  // canUserManagePreset
  // =============================================================================

  describe('canUserManagePreset', () => {
    it('should return false if preset not found', async () => {
      mockPrisma.readerPreset.findUnique.mockResolvedValue(null);

      const result = await canUserManagePreset('preset-1', 'user-1', false);

      expect(result).toBe(false);
    });

    it('should return false for bundled presets', async () => {
      const bundled = createMockReaderPreset({ isBundled: true });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(bundled);

      const result = await canUserManagePreset('preset-1', 'user-1', true);

      expect(result).toBe(false);
    });

    it('should return true for system presets if user is admin', async () => {
      const system = createMockReaderPreset({ isSystem: true, isBundled: false });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(system);

      const result = await canUserManagePreset('preset-1', 'admin-1', true);

      expect(result).toBe(true);
    });

    it('should return false for system presets if user is not admin', async () => {
      const system = createMockReaderPreset({ isSystem: true, isBundled: false });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(system);

      const result = await canUserManagePreset('preset-1', 'user-1', false);

      expect(result).toBe(false);
    });

    it('should return true for user presets if owner', async () => {
      const userPreset = createMockReaderPreset({
        userId: 'user-1',
        isSystem: false,
        isBundled: false,
      });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(userPreset);

      const result = await canUserManagePreset('preset-1', 'user-1', false);

      expect(result).toBe(true);
    });

    it('should return false for user presets if not owner', async () => {
      const userPreset = createMockReaderPreset({
        userId: 'other-user',
        isSystem: false,
        isBundled: false,
      });
      mockPrisma.readerPreset.findUnique.mockResolvedValue(userPreset);

      const result = await canUserManagePreset('preset-1', 'user-1', false);

      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // getPresetsGrouped
  // =============================================================================

  describe('getPresetsGrouped', () => {
    it('should group presets by type', async () => {
      const bundled = createMockReaderPreset({ isBundled: true, isSystem: true });
      const system = createMockReaderPreset({ isSystem: true, isBundled: false });
      const user = createMockReaderPreset({ isSystem: false, isBundled: false, userId: 'user-1' });

      mockPrisma.readerPreset.findMany.mockResolvedValue([bundled, system, user]);

      const result = await getPresetsGrouped('user-1');

      expect(result.bundled).toHaveLength(1);
      expect(result.system).toHaveLength(1);
      expect(result.user).toHaveLength(1);
      expect(result.bundled[0]).toEqual(bundled);
      expect(result.system[0]).toEqual(system);
      expect(result.user[0]).toEqual(user);
    });

    it('should return empty arrays if no presets', async () => {
      mockPrisma.readerPreset.findMany.mockResolvedValue([]);

      const result = await getPresetsGrouped();

      expect(result.bundled).toHaveLength(0);
      expect(result.system).toHaveLength(0);
      expect(result.user).toHaveLength(0);
    });
  });

  // =============================================================================
  // extractSettingsFromPreset
  // =============================================================================

  describe('extractSettingsFromPreset', () => {
    it('should extract all settings from a preset', () => {
      const preset = createMockReaderPreset({
        mode: 'double',
        direction: 'rtl',
        scaling: 'fitWidth',
        customWidth: 1000,
        splitting: 'auto',
        background: 'white',
        brightness: 80,
        colorCorrection: 'sepia-correct',
        showPageShadow: false,
        autoHideUI: false,
        preloadCount: 5,
        webtoonGap: 16,
        webtoonMaxWidth: 1200,
      });

      const result = extractSettingsFromPreset(preset as any);

      expect(result).toEqual({
        mode: 'double',
        direction: 'rtl',
        scaling: 'fitWidth',
        customWidth: 1000,
        splitting: 'auto',
        background: 'white',
        brightness: 80,
        colorCorrection: 'sepia-correct',
        showPageShadow: false,
        autoHideUI: false,
        preloadCount: 5,
        webtoonGap: 16,
        webtoonMaxWidth: 1200,
      });
    });

    it('should not include non-setting fields', () => {
      const preset = createMockReaderPreset({
        id: 'preset-1',
        name: 'Test',
        description: 'Description',
        userId: 'user-1',
      });

      const result = extractSettingsFromPreset(preset as any);

      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('name');
      expect(result).not.toHaveProperty('description');
      expect(result).not.toHaveProperty('userId');
    });
  });
});
