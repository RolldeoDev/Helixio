/**
 * Template Manager Service Tests
 *
 * Comprehensive tests for template CRUD operations, inheritance resolution,
 * and default template provisioning.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTemplates,
  getTemplateById,
  getActiveTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setActiveTemplate,
  ensureDefaultTemplate,
  resetToGlobalDefault,
  getTemplatesForLibrary,
  duplicateTemplate,
  DEFAULT_TEMPLATE,
} from '../template-manager.service.js';
import { createMockPrismaClient, createMockFilenameTemplate } from './__mocks__/prisma.mock.js';
import { SAMPLE_CHAR_RULES, createMockGlobalTemplate, createMockLibraryTemplate } from './template.fixtures.js';

// Mock the database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

// Import the mocked function
import { getDatabase } from '../database.service.js';

describe('Template Manager Service', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    vi.mocked(getDatabase).mockReturnValue(mockPrisma as any);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // getTemplates Tests
  // ==========================================================================

  describe('getTemplates', () => {
    it('returns all templates when no filter provided', async () => {
      const mockTemplates = [
        createMockGlobalTemplate({ id: 'global-1', name: 'Global 1' }),
        createMockGlobalTemplate({ id: 'global-2', name: 'Global 2' }),
      ];
      mockPrisma.filenameTemplate.findMany.mockResolvedValue(mockTemplates);

      const result = await getTemplates();

      expect(mockPrisma.filenameTemplate.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('filters by libraryId when provided', async () => {
      const libraryId = 'lib-1';
      mockPrisma.filenameTemplate.findMany.mockResolvedValue([
        createMockLibraryTemplate(libraryId),
      ]);

      await getTemplates(libraryId);

      expect(mockPrisma.filenameTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { libraryId },
        })
      );
    });

    it('filters for global templates when null provided', async () => {
      mockPrisma.filenameTemplate.findMany.mockResolvedValue([
        createMockGlobalTemplate(),
      ]);

      await getTemplates(null);

      expect(mockPrisma.filenameTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { libraryId: null },
        })
      );
    });

    it('returns empty array when no templates exist', async () => {
      mockPrisma.filenameTemplate.findMany.mockResolvedValue([]);

      const result = await getTemplates();

      expect(result).toEqual([]);
    });

    it('parses JSON fields correctly', async () => {
      const template = createMockGlobalTemplate({
        folderSegments: JSON.stringify(['{Publisher}']),
        characterRules: JSON.stringify({ colon: 'dash' }),
      });
      mockPrisma.filenameTemplate.findMany.mockResolvedValue([template]);

      const result = await getTemplates();

      expect(result[0]!.folderSegments).toEqual(['{Publisher}']);
      expect(result[0]!.characterRules.colon).toBe('dash');
    });

    it('orders by sortOrder', async () => {
      const templates = [
        createMockGlobalTemplate({ id: 't1', sortOrder: 1 }),
        createMockGlobalTemplate({ id: 't2', sortOrder: 0 }),
      ];
      mockPrisma.filenameTemplate.findMany.mockResolvedValue(templates);

      await getTemplates();

      expect(mockPrisma.filenameTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: expect.arrayContaining([
            expect.objectContaining({ sortOrder: 'asc' }),
          ]),
        })
      );
    });
  });

  // ==========================================================================
  // getTemplateById Tests
  // ==========================================================================

  describe('getTemplateById', () => {
    it('returns template when found', async () => {
      const mockTemplate = createMockGlobalTemplate({ id: 'test-id' });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(mockTemplate);

      const result = await getTemplateById('test-id');

      expect(result).toBeDefined();
      expect(result!.id).toBe('test-id');
    });

    it('returns null when template not found', async () => {
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(null);

      const result = await getTemplateById('non-existent');

      expect(result).toBeNull();
    });

    it('parses JSON fields correctly', async () => {
      const template = createMockGlobalTemplate({
        folderSegments: JSON.stringify(['{Publisher}', '{Series}']),
      });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(template);

      const result = await getTemplateById('test-id');

      expect(Array.isArray(result!.folderSegments)).toBe(true);
      expect(result!.folderSegments).toEqual(['{Publisher}', '{Series}']);
    });

    it('uses default character rules when null', async () => {
      const template = createMockGlobalTemplate({
        characterRules: null,
      });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(template);

      const result = await getTemplateById('test-id');

      expect(result!.characterRules).toBeDefined();
      expect(result!.characterRules.colon).toBeDefined();
    });
  });

  // ==========================================================================
  // getActiveTemplate Tests
  // ==========================================================================

  describe('getActiveTemplate', () => {
    it('returns library template when it exists', async () => {
      const libraryId = 'lib-1';
      const libraryTemplate = createMockLibraryTemplate(libraryId, { isActive: true });

      mockPrisma.filenameTemplate.findFirst
        .mockResolvedValueOnce(libraryTemplate) // First call for library template
        .mockResolvedValueOnce(null); // Not called since library template exists

      const result = await getActiveTemplate(libraryId);

      expect(result).toBeDefined();
      expect(result!.libraryId).toBe(libraryId);
    });

    it('falls back to global template when no library template', async () => {
      const globalTemplate = createMockGlobalTemplate({ isActive: true });

      mockPrisma.filenameTemplate.findFirst
        .mockResolvedValueOnce(null) // No library template
        .mockResolvedValueOnce(globalTemplate); // Global template

      const result = await getActiveTemplate('lib-1');

      expect(result).toBeDefined();
      expect(result!.libraryId).toBeNull();
    });

    it('returns global template when no libraryId provided', async () => {
      const globalTemplate = createMockGlobalTemplate({ isActive: true });
      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(globalTemplate);

      const result = await getActiveTemplate();

      expect(result).toBeDefined();
      expect(result!.libraryId).toBeNull();
    });

    it('creates default template when none exist', async () => {
      mockPrisma.filenameTemplate.findFirst
        .mockResolvedValueOnce(null) // No active global
        .mockResolvedValueOnce(null); // No global at all

      const createdTemplate = createMockGlobalTemplate({
        id: 'global-default-template',
        name: 'Default',
      });
      mockPrisma.filenameTemplate.create.mockResolvedValue(createdTemplate);

      const result = await getActiveTemplate();

      expect(mockPrisma.filenameTemplate.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('returns default template when no active template found', async () => {
      // No active global template found
      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);

      const result = await getActiveTemplate();

      // Should return a template (the default)
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Default');
      expect(result?.isActive).toBe(true);
    });
  });

  // ==========================================================================
  // createTemplate Tests
  // ==========================================================================

  describe('createTemplate', () => {
    it('creates template with valid data', async () => {
      const input = {
        name: 'New Template',
        filePattern: '{Series} - {Number}.{Extension}',
      };

      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue(
        createMockFilenameTemplate({ ...input })
      );

      const result = await createTemplate(input);

      expect(result.name).toBe('New Template');
      expect(mockPrisma.filenameTemplate.create).toHaveBeenCalled();
    });

    it('creates global template when libraryId is null', async () => {
      const input = {
        libraryId: null,
        name: 'Global Template',
        filePattern: '{Series}.{Extension}',
      };

      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue(
        createMockFilenameTemplate({ ...input })
      );

      await createTemplate(input);

      expect(mockPrisma.filenameTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            libraryId: null,
          }),
        })
      );
    });

    it('creates library-specific template', async () => {
      const input = {
        libraryId: 'lib-1',
        name: 'Library Template',
        filePattern: '{Series}.{Extension}',
      };

      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue(
        createMockFilenameTemplate({ ...input, libraryId: 'lib-1' })
      );

      const result = await createTemplate(input);

      expect(result.libraryId).toBe('lib-1');
    });

    it('throws error for invalid file pattern', async () => {
      const input = {
        name: 'Bad Template',
        filePattern: '{Unknown}.{Extension}',
      };

      await expect(createTemplate(input)).rejects.toThrow(/Invalid template pattern/);
    });

    it('throws error for duplicate name in same scope', async () => {
      const input = {
        name: 'Existing',
        filePattern: '{Series}.{Extension}',
      };

      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(
        createMockFilenameTemplate({ name: 'Existing' })
      );

      await expect(createTemplate(input)).rejects.toThrow(/already exists/);
    });

    it('allows same name in different scopes', async () => {
      const input = {
        libraryId: 'lib-1',
        name: 'Template',
        filePattern: '{Series}.{Extension}',
      };

      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue(
        createMockFilenameTemplate({ ...input, libraryId: 'lib-1' })
      );

      await expect(createTemplate(input)).resolves.toBeDefined();
    });

    it('stringifies folder segments', async () => {
      const input = {
        name: 'Template',
        filePattern: '{Series}.{Extension}',
        folderSegments: ['{Publisher}', '{Series}'],
      };

      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue(
        createMockFilenameTemplate()
      );

      await createTemplate(input);

      expect(mockPrisma.filenameTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            folderSegments: JSON.stringify(['{Publisher}', '{Series}']),
          }),
        })
      );
    });

    it('stringifies character rules', async () => {
      const input = {
        name: 'Template',
        filePattern: '{Series}.{Extension}',
        characterRules: SAMPLE_CHAR_RULES.removeAll,
      };

      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue(
        createMockFilenameTemplate()
      );

      await createTemplate(input);

      expect(mockPrisma.filenameTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            characterRules: JSON.stringify(SAMPLE_CHAR_RULES.removeAll),
          }),
        })
      );
    });
  });

  // ==========================================================================
  // updateTemplate Tests
  // ==========================================================================

  describe('updateTemplate', () => {
    it('updates template with valid data', async () => {
      const existing = createMockFilenameTemplate({ id: 'test-id' });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(existing);
      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.update.mockResolvedValue({
        ...existing,
        name: 'Updated Name',
      });

      const result = await updateTemplate('test-id', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('throws error for non-existent template', async () => {
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(null);

      await expect(updateTemplate('non-existent', { name: 'New' }))
        .rejects.toThrow(/not found/);
    });

    it('validates file pattern when updating', async () => {
      const existing = createMockFilenameTemplate({ id: 'test-id' });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(existing);

      await expect(updateTemplate('test-id', { filePattern: '{Unknown}' }))
        .rejects.toThrow(/Invalid template pattern/);
    });

    it('prevents duplicate name in same scope', async () => {
      const existing = createMockFilenameTemplate({ id: 'test-id', name: 'Original' });
      const duplicate = createMockFilenameTemplate({ id: 'other-id', name: 'Duplicate' });

      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(existing);
      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(duplicate);

      await expect(updateTemplate('test-id', { name: 'Duplicate' }))
        .rejects.toThrow(/already exists/);
    });

    it('allows same name if not changed', async () => {
      const existing = createMockFilenameTemplate({ id: 'test-id', name: 'Same' });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(existing);
      mockPrisma.filenameTemplate.update.mockResolvedValue(existing);

      await expect(updateTemplate('test-id', { description: 'New desc' }))
        .resolves.toBeDefined();
    });

    it('handles partial updates', async () => {
      const existing = createMockFilenameTemplate({ id: 'test-id' });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(existing);
      mockPrisma.filenameTemplate.update.mockResolvedValue({
        ...existing,
        description: 'Updated',
      });

      await updateTemplate('test-id', { description: 'Updated' });

      expect(mockPrisma.filenameTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Updated',
          }),
        })
      );
    });
  });

  // ==========================================================================
  // deleteTemplate Tests
  // ==========================================================================

  describe('deleteTemplate', () => {
    it('deletes template by id', async () => {
      const existing = createMockFilenameTemplate({ id: 'test-id' });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(existing);
      mockPrisma.filenameTemplate.delete.mockResolvedValue(existing);

      await expect(deleteTemplate('test-id')).resolves.not.toThrow();

      expect(mockPrisma.filenameTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'test-id' },
      });
    });

    it('throws error for non-existent template', async () => {
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(null);

      await expect(deleteTemplate('non-existent')).rejects.toThrow(/not found/);
    });

    it('prevents deleting global default template', async () => {
      await expect(deleteTemplate('global-default-template'))
        .rejects.toThrow(/Cannot delete the global default/);
    });
  });

  // ==========================================================================
  // setActiveTemplate Tests
  // ==========================================================================

  describe('setActiveTemplate', () => {
    it('sets template as active', async () => {
      const template = createMockFilenameTemplate({ id: 'test-id', isActive: false });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(template);
      mockPrisma.filenameTemplate.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.filenameTemplate.update.mockResolvedValue({
        ...template,
        isActive: true,
      });

      const result = await setActiveTemplate('test-id');

      expect(result.isActive).toBe(true);
    });

    it('deactivates other templates in same scope', async () => {
      const template = createMockFilenameTemplate({
        id: 'test-id',
        libraryId: 'lib-1',
      });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(template);
      mockPrisma.filenameTemplate.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.filenameTemplate.update.mockResolvedValue({
        ...template,
        isActive: true,
      });

      await setActiveTemplate('test-id');

      expect(mockPrisma.filenameTemplate.updateMany).toHaveBeenCalledWith({
        where: { libraryId: 'lib-1' },
        data: { isActive: false },
      });
    });

    it('throws error for non-existent template', async () => {
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(null);

      await expect(setActiveTemplate('non-existent')).rejects.toThrow(/not found/);
    });
  });

  // ==========================================================================
  // ensureDefaultTemplate Tests
  // ==========================================================================

  describe('ensureDefaultTemplate', () => {
    it('returns existing active global template', async () => {
      const existing = createMockGlobalTemplate({ isActive: true });
      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(existing);

      const result = await ensureDefaultTemplate();

      expect(result).toBeDefined();
      expect(mockPrisma.filenameTemplate.create).not.toHaveBeenCalled();
    });

    it('creates default template if none exist', async () => {
      mockPrisma.filenameTemplate.findFirst
        .mockResolvedValueOnce(null) // No active
        .mockResolvedValueOnce(null); // No global at all

      const created = createMockGlobalTemplate({
        id: 'global-default-template',
        name: 'Default',
      });
      mockPrisma.filenameTemplate.create.mockResolvedValue(created);

      const result = await ensureDefaultTemplate();

      expect(mockPrisma.filenameTemplate.create).toHaveBeenCalled();
      expect(result.name).toBe('Default');
    });

    it('activates existing global if inactive', async () => {
      const inactive = createMockGlobalTemplate({ isActive: false });
      mockPrisma.filenameTemplate.findFirst
        .mockResolvedValueOnce(null) // No active
        .mockResolvedValueOnce(inactive); // Inactive exists

      mockPrisma.filenameTemplate.update.mockResolvedValue({
        ...inactive,
        isActive: true,
      });

      await ensureDefaultTemplate();

      expect(mockPrisma.filenameTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: true },
        })
      );
    });

    it('default template matches documented pattern', async () => {
      mockPrisma.filenameTemplate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      mockPrisma.filenameTemplate.create.mockImplementation(async (args) => ({
        id: 'global-default-template',
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await ensureDefaultTemplate();

      expect(mockPrisma.filenameTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            filePattern: DEFAULT_TEMPLATE.filePattern,
          }),
        })
      );
    });
  });

  // ==========================================================================
  // resetToGlobalDefault Tests
  // ==========================================================================

  describe('resetToGlobalDefault', () => {
    it('deletes all library-specific templates', async () => {
      mockPrisma.filenameTemplate.deleteMany.mockResolvedValue({ count: 3 });

      await resetToGlobalDefault('lib-1');

      expect(mockPrisma.filenameTemplate.deleteMany).toHaveBeenCalledWith({
        where: { libraryId: 'lib-1' },
      });
    });
  });

  // ==========================================================================
  // getTemplatesForLibrary Tests
  // ==========================================================================

  describe('getTemplatesForLibrary', () => {
    it('returns library and global templates', async () => {
      const libraryTemplates = [createMockLibraryTemplate('lib-1')];
      const globalTemplates = [createMockGlobalTemplate()];

      mockPrisma.filenameTemplate.findMany
        .mockResolvedValueOnce(libraryTemplates)
        .mockResolvedValueOnce(globalTemplates);

      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(libraryTemplates[0]);

      const result = await getTemplatesForLibrary('lib-1');

      expect(result.libraryTemplates).toHaveLength(1);
      expect(result.globalTemplates).toHaveLength(1);
      expect(result.activeTemplate).toBeDefined();
    });

    it('returns only global when no library templates', async () => {
      const globalTemplates = [createMockGlobalTemplate()];

      mockPrisma.filenameTemplate.findMany
        .mockResolvedValueOnce([]) // No library templates
        .mockResolvedValueOnce(globalTemplates);

      mockPrisma.filenameTemplate.findFirst
        .mockResolvedValueOnce(null) // No library active
        .mockResolvedValueOnce(globalTemplates[0]); // Global active

      const result = await getTemplatesForLibrary('lib-1');

      expect(result.libraryTemplates).toHaveLength(0);
      expect(result.globalTemplates).toHaveLength(1);
    });
  });

  // ==========================================================================
  // duplicateTemplate Tests
  // ==========================================================================

  describe('duplicateTemplate', () => {
    it('duplicates template with new id', async () => {
      const source = createMockGlobalTemplate({
        id: 'source-id',
        name: 'Source Template',
      });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(source);
      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue({
        ...source,
        id: 'new-id',
        name: 'Source Template (Copy)',
      });

      const result = await duplicateTemplate('source-id', null);

      expect(result.id).not.toBe('source-id');
      expect(result.name).toContain('Copy');
    });

    it('appends "(Copy)" to name', async () => {
      const source = createMockGlobalTemplate({ name: 'Original' });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(source);
      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue({
        ...source,
        name: 'Original (Copy)',
      });

      const result = await duplicateTemplate('source-id', null);

      expect(result.name).toBe('Original (Copy)');
    });

    it('can duplicate to different scope', async () => {
      const source = createMockGlobalTemplate({ libraryId: null });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(source);
      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue({
        ...source,
        libraryId: 'lib-1',
      });

      await duplicateTemplate('source-id', 'lib-1');

      expect(mockPrisma.filenameTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            libraryId: 'lib-1',
          }),
        })
      );
    });

    it('creates duplicate as inactive', async () => {
      const source = createMockGlobalTemplate({ isActive: true });
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(source);
      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue({
        ...source,
        isActive: false,
      });

      await duplicateTemplate('source-id', null);

      expect(mockPrisma.filenameTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
          }),
        })
      );
    });

    it('allows custom name for duplicate', async () => {
      const source = createMockGlobalTemplate();
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(source);
      mockPrisma.filenameTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.filenameTemplate.create.mockResolvedValue({
        ...source,
        name: 'Custom Name',
      });

      const result = await duplicateTemplate('source-id', null, 'Custom Name');

      expect(result.name).toBe('Custom Name');
    });

    it('throws error for non-existent source', async () => {
      mockPrisma.filenameTemplate.findUnique.mockResolvedValue(null);

      await expect(duplicateTemplate('non-existent', null))
        .rejects.toThrow(/not found/);
    });
  });

  // ==========================================================================
  // DEFAULT_TEMPLATE Tests
  // ==========================================================================

  describe('DEFAULT_TEMPLATE', () => {
    it('has expected default values', () => {
      expect(DEFAULT_TEMPLATE.name).toBe('Default');
      expect(DEFAULT_TEMPLATE.filePattern).toContain('{Series}');
      // Pattern uses {Number:000} with padding modifier
      expect(DEFAULT_TEMPLATE.filePattern).toMatch(/\{Number/);
      expect(DEFAULT_TEMPLATE.filePattern).toContain('{Extension}');
      expect(DEFAULT_TEMPLATE.folderSegments).toEqual([]);
      expect(DEFAULT_TEMPLATE.isActive).toBe(true);
    });
  });
});
