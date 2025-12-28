/**
 * Template Manager Service
 *
 * Manages filename templates: CRUD operations, inheritance resolution,
 * and default template provisioning.
 */

import { getDatabase } from './database.service.js';
import type { FilenameTemplate } from '@prisma/client';
import { validateTemplate } from './template-parser.service.js';
import { DEFAULT_CHARACTER_RULES, type CharacterReplacementRules } from './template-resolver.service.js';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('template-manager');

// =============================================================================
// Types
// =============================================================================

export interface CreateTemplateInput {
  /** Library ID (null for global template) */
  libraryId?: string | null;
  /** Template name */
  name: string;
  /** Optional description */
  description?: string;
  /** Filename pattern template */
  filePattern: string;
  /** Folder segment templates (JSON array) */
  folderSegments?: string[];
  /** Character replacement rules */
  characterRules?: CharacterReplacementRules;
  /** Whether template is active */
  isActive?: boolean;
  /** Sort order */
  sortOrder?: number;
}

export interface UpdateTemplateInput {
  /** Template name */
  name?: string;
  /** Optional description */
  description?: string;
  /** Filename pattern template */
  filePattern?: string;
  /** Folder segment templates (JSON array) */
  folderSegments?: string[];
  /** Character replacement rules */
  characterRules?: CharacterReplacementRules;
  /** Whether template is active */
  isActive?: boolean;
  /** Sort order */
  sortOrder?: number;
}

export interface TemplateWithParsedFields extends Omit<FilenameTemplate, 'folderSegments' | 'characterRules'> {
  folderSegments: string[];
  characterRules: CharacterReplacementRules;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default template that matches the current hardcoded naming convention.
 */
export const DEFAULT_TEMPLATE: Omit<CreateTemplateInput, 'libraryId'> = {
  name: 'Default',
  description: 'Standard naming convention: Series - Type Number - Title (Year)',
  filePattern: '{Series} - {Type} {Number:000} - {Title} ({Year|}).{Extension}',
  folderSegments: [],
  characterRules: DEFAULT_CHARACTER_RULES,
  isActive: true,
  sortOrder: 0,
};

/**
 * ID for the global default template.
 */
const GLOBAL_DEFAULT_TEMPLATE_ID = 'global-default-template';

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get all templates, optionally filtered by library.
 */
export async function getTemplates(libraryId?: string | null): Promise<TemplateWithParsedFields[]> {
  const prisma = getDatabase();
  const where = libraryId !== undefined
    ? { libraryId: libraryId }
    : {};

  const templates = await prisma.filenameTemplate.findMany({
    where,
    orderBy: [
      { libraryId: 'asc' }, // Global first (null)
      { sortOrder: 'asc' },
      { name: 'asc' },
    ],
  });

  return templates.map(parseTemplateFields);
}

/**
 * Get a template by ID.
 */
export async function getTemplateById(id: string): Promise<TemplateWithParsedFields | null> {
  const prisma = getDatabase();
  const template = await prisma.filenameTemplate.findUnique({
    where: { id },
  });

  return template ? parseTemplateFields(template) : null;
}

/**
 * Get the active template for a scope (library or global).
 * Falls back to global if no library-specific template exists.
 */
export async function getActiveTemplate(libraryId?: string | null): Promise<TemplateWithParsedFields | null> {
  const prisma = getDatabase();
  // First, try to find a library-specific active template
  if (libraryId) {
    const libraryTemplate = await prisma.filenameTemplate.findFirst({
      where: {
        libraryId,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    if (libraryTemplate) {
      return parseTemplateFields(libraryTemplate);
    }
  }

  // Fall back to global active template
  const globalTemplate = await prisma.filenameTemplate.findFirst({
    where: {
      libraryId: null,
      isActive: true,
    },
    orderBy: { sortOrder: 'asc' },
  });

  if (globalTemplate) {
    return parseTemplateFields(globalTemplate);
  }

  // No template found - ensure default exists and return it
  return ensureDefaultTemplate();
}

/**
 * Create a new template.
 */
export async function createTemplate(input: CreateTemplateInput): Promise<TemplateWithParsedFields> {
  const prisma = getDatabase();
  // Validate the file pattern
  const validation = validateTemplate(input.filePattern);
  if (!validation.valid) {
    throw new Error(`Invalid template pattern: ${validation.errors.join(', ')}`);
  }

  // Check for duplicate name in same scope
  const existing = await prisma.filenameTemplate.findFirst({
    where: {
      libraryId: input.libraryId ?? null,
      name: input.name,
    },
  });

  if (existing) {
    throw new Error(`Template with name "${input.name}" already exists in this scope`);
  }

  const template = await prisma.filenameTemplate.create({
    data: {
      libraryId: input.libraryId ?? null,
      name: input.name,
      description: input.description,
      filePattern: input.filePattern,
      folderSegments: input.folderSegments ? JSON.stringify(input.folderSegments) : '[]',
      characterRules: input.characterRules ? JSON.stringify(input.characterRules) : '{}',
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  logger.info({ templateId: template.id, name: template.name }, 'Created filename template');

  return parseTemplateFields(template);
}

/**
 * Update an existing template.
 */
export async function updateTemplate(id: string, input: UpdateTemplateInput): Promise<TemplateWithParsedFields> {
  const prisma = getDatabase();
  // Validate the file pattern if provided
  if (input.filePattern) {
    const validation = validateTemplate(input.filePattern);
    if (!validation.valid) {
      throw new Error(`Invalid template pattern: ${validation.errors.join(', ')}`);
    }
  }

  // Get existing template
  const existing = await prisma.filenameTemplate.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error(`Template not found: ${id}`);
  }

  // Check for duplicate name if name is being changed
  if (input.name && input.name !== existing.name) {
    const duplicate = await prisma.filenameTemplate.findFirst({
      where: {
        libraryId: existing.libraryId,
        name: input.name,
        id: { not: id },
      },
    });

    if (duplicate) {
      throw new Error(`Template with name "${input.name}" already exists in this scope`);
    }
  }

  const template = await prisma.filenameTemplate.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      filePattern: input.filePattern,
      folderSegments: input.folderSegments !== undefined
        ? JSON.stringify(input.folderSegments)
        : undefined,
      characterRules: input.characterRules !== undefined
        ? JSON.stringify(input.characterRules)
        : undefined,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    },
  });

  logger.info({ templateId: template.id, name: template.name }, 'Updated filename template');

  return parseTemplateFields(template);
}

/**
 * Delete a template.
 */
export async function deleteTemplate(id: string): Promise<void> {
  const prisma = getDatabase();
  // Prevent deleting the global default template
  if (id === GLOBAL_DEFAULT_TEMPLATE_ID) {
    throw new Error('Cannot delete the global default template');
  }

  const template = await prisma.filenameTemplate.findUnique({
    where: { id },
  });

  if (!template) {
    throw new Error(`Template not found: ${id}`);
  }

  await prisma.filenameTemplate.delete({
    where: { id },
  });

  logger.info({ templateId: id, name: template.name }, 'Deleted filename template');
}

/**
 * Set a template as the active template for its scope.
 * Deactivates other templates in the same scope.
 */
export async function setActiveTemplate(id: string): Promise<TemplateWithParsedFields> {
  const prisma = getDatabase();
  const template = await prisma.filenameTemplate.findUnique({
    where: { id },
  });

  if (!template) {
    throw new Error(`Template not found: ${id}`);
  }

  // Deactivate all templates in the same scope
  await prisma.filenameTemplate.updateMany({
    where: { libraryId: template.libraryId },
    data: { isActive: false },
  });

  // Activate the selected template
  const updated = await prisma.filenameTemplate.update({
    where: { id },
    data: { isActive: true },
  });

  logger.info(
    { templateId: id, libraryId: template.libraryId },
    'Set active filename template'
  );

  return parseTemplateFields(updated);
}

// =============================================================================
// Default Template Management
// =============================================================================

/**
 * Ensure the global default template exists.
 * Creates it if it doesn't exist.
 */
export async function ensureDefaultTemplate(): Promise<TemplateWithParsedFields> {
  const prisma = getDatabase();
  // Check if global default exists
  let template = await prisma.filenameTemplate.findFirst({
    where: {
      libraryId: null,
      isActive: true,
    },
    orderBy: { sortOrder: 'asc' },
  });

  if (template) {
    return parseTemplateFields(template);
  }

  // Check if any global template exists
  template = await prisma.filenameTemplate.findFirst({
    where: { libraryId: null },
    orderBy: { sortOrder: 'asc' },
  });

  if (template) {
    // Activate the first global template
    template = await prisma.filenameTemplate.update({
      where: { id: template.id },
      data: { isActive: true },
    });
    return parseTemplateFields(template);
  }

  // Create the default template
  logger.info('Creating global default filename template');

  template = await prisma.filenameTemplate.create({
    data: {
      id: GLOBAL_DEFAULT_TEMPLATE_ID,
      libraryId: null,
      name: DEFAULT_TEMPLATE.name,
      description: DEFAULT_TEMPLATE.description,
      filePattern: DEFAULT_TEMPLATE.filePattern,
      folderSegments: JSON.stringify(DEFAULT_TEMPLATE.folderSegments),
      characterRules: JSON.stringify(DEFAULT_TEMPLATE.characterRules),
      isActive: true,
      sortOrder: 0,
    },
  });

  return parseTemplateFields(template);
}

/**
 * Reset a library's template to use the global default.
 */
export async function resetToGlobalDefault(libraryId: string): Promise<void> {
  const prisma = getDatabase();
  // Delete all library-specific templates
  const deleted = await prisma.filenameTemplate.deleteMany({
    where: { libraryId },
  });

  logger.info(
    { libraryId, deletedCount: deleted.count },
    'Reset library to global template'
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse JSON fields from a database template.
 */
function parseTemplateFields(template: FilenameTemplate): TemplateWithParsedFields {
  let folderSegments: string[] = [];
  let characterRules: CharacterReplacementRules = DEFAULT_CHARACTER_RULES;

  if (template.folderSegments) {
    try {
      folderSegments = JSON.parse(template.folderSegments);
    } catch (e) {
      logger.warn({ templateId: template.id }, 'Failed to parse folderSegments');
    }
  }

  if (template.characterRules) {
    try {
      characterRules = { ...DEFAULT_CHARACTER_RULES, ...JSON.parse(template.characterRules) };
    } catch (e) {
      logger.warn({ templateId: template.id }, 'Failed to parse characterRules');
    }
  }

  return {
    ...template,
    folderSegments,
    characterRules,
  };
}

/**
 * Get templates for a specific library, including inherited global templates.
 */
export async function getTemplatesForLibrary(libraryId: string): Promise<{
  libraryTemplates: TemplateWithParsedFields[];
  globalTemplates: TemplateWithParsedFields[];
  activeTemplate: TemplateWithParsedFields | null;
}> {
  const [libraryTemplates, globalTemplates, activeTemplate] = await Promise.all([
    getTemplates(libraryId),
    getTemplates(null),
    getActiveTemplate(libraryId),
  ]);

  return {
    libraryTemplates,
    globalTemplates,
    activeTemplate,
  };
}

/**
 * Duplicate a template (useful for creating library overrides from global).
 */
export async function duplicateTemplate(
  sourceId: string,
  targetLibraryId: string | null,
  newName?: string
): Promise<TemplateWithParsedFields> {
  const source = await getTemplateById(sourceId);

  if (!source) {
    throw new Error(`Source template not found: ${sourceId}`);
  }

  const name = newName || `${source.name} (Copy)`;

  return createTemplate({
    libraryId: targetLibraryId,
    name,
    description: source.description || undefined,
    filePattern: source.filePattern,
    folderSegments: source.folderSegments,
    characterRules: source.characterRules,
    isActive: false, // Don't activate duplicates by default
    sortOrder: source.sortOrder + 1,
  });
}
