/**
 * Filter Preset Service
 *
 * Manages saved filter presets that can be reused across smart collections.
 * Supports user-specific and global (admin-created) presets.
 */

import { getDatabase } from './database.service.js';
import { createServiceLogger } from './logger.service.js';
import type {
  SmartFilter,
  FilterOperator,
  FilterGroup,
  FilterCondition,
  SortField,
  SortOrder,
} from './smart-collection.service.js';

const logger = createServiceLogger('filter-preset');

// =============================================================================
// Types
// =============================================================================

export type FilterPresetType = 'file' | 'series';

export interface FilterPreset {
  id: string;
  userId: string | null;
  isGlobal: boolean;
  type: FilterPresetType;
  name: string;
  description: string | null;
  icon: string | null;
  filterDefinition: SmartFilter;
  schemaVersion: number;
  sortBy: string | null;
  sortOrder: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePresetInput {
  name: string;
  type: FilterPresetType;
  description?: string;
  icon?: string;
  filterDefinition: SmartFilter;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  isGlobal?: boolean;
}

export interface UpdatePresetInput {
  name?: string;
  description?: string;
  icon?: string;
  filterDefinition?: SmartFilter;
  sortBy?: SortField;
  sortOrder?: SortOrder;
}

export interface PresetUsageInfo {
  collections: Array<{
    id: string;
    name: string;
    userId: string;
    itemCount: number;
  }>;
  totalCollections: number;
}

export interface MigrateResult {
  migrated: number;
  skipped: number;
  errors: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse filter definition from JSON string
 */
function parseFilterDefinition(json: string): SmartFilter {
  try {
    return JSON.parse(json) as SmartFilter;
  } catch (error) {
    throw new Error('Invalid filter definition JSON');
  }
}

/**
 * Serialize filter definition to JSON string
 */
function serializeFilterDefinition(filter: SmartFilter): string {
  return JSON.stringify(filter);
}

/**
 * Transform database record to FilterPreset
 */
function toFilterPreset(record: {
  id: string;
  userId: string | null;
  isGlobal: boolean;
  type: string;
  name: string;
  description: string | null;
  icon: string | null;
  filterDefinition: string;
  schemaVersion: number;
  sortBy: string | null;
  sortOrder: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FilterPreset {
  return {
    ...record,
    type: record.type as FilterPresetType,
    filterDefinition: parseFilterDefinition(record.filterDefinition),
  };
}

// =============================================================================
// Core CRUD Operations
// =============================================================================

/**
 * Get all filter presets accessible to a user (their own + global)
 */
export async function getFilterPresets(
  userId: string,
  options?: { includeGlobal?: boolean; type?: FilterPresetType }
): Promise<FilterPreset[]> {
  const db = getDatabase();
  const includeGlobal = options?.includeGlobal ?? true;

  const presets = await db.filterPreset.findMany({
    where: {
      ...(options?.type && { type: options.type }),
      OR: [
        { userId }, // User's own presets
        ...(includeGlobal ? [{ isGlobal: true }] : []), // Global presets
      ],
    },
    orderBy: [{ isGlobal: 'desc' }, { name: 'asc' }],
  });

  return presets.map(toFilterPreset);
}

/**
 * Get a single filter preset by ID
 */
export async function getFilterPreset(
  id: string,
  userId: string
): Promise<FilterPreset | null> {
  const db = getDatabase();

  const preset = await db.filterPreset.findFirst({
    where: {
      id,
      OR: [{ userId }, { isGlobal: true }],
    },
  });

  return preset ? toFilterPreset(preset) : null;
}

/**
 * Create a new filter preset
 */
export async function createFilterPreset(
  userId: string,
  input: CreatePresetInput,
  isAdmin: boolean = false
): Promise<FilterPreset> {
  const db = getDatabase();

  // Only admins can create global presets
  const isGlobal = Boolean(input.isGlobal && isAdmin);

  // Check for duplicate name within same type
  const existing = await db.filterPreset.findFirst({
    where: {
      name: input.name,
      type: input.type,
      ...(isGlobal ? { isGlobal: true } : { userId }),
    },
  });

  if (existing) {
    throw new Error(`A ${input.type} preset named "${input.name}" already exists`);
  }

  const preset = await db.filterPreset.create({
    data: {
      userId: isGlobal ? null : userId,
      isGlobal,
      type: input.type,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      filterDefinition: serializeFilterDefinition(input.filterDefinition),
      sortBy: input.sortBy ?? null,
      sortOrder: input.sortOrder ?? null,
      schemaVersion: 1,
    },
  });

  logger.info(
    `Created ${input.type} filter preset: ${preset.name} (${preset.id}) by user ${userId}${isGlobal ? ' [GLOBAL]' : ''}`
  );

  return toFilterPreset(preset);
}

/**
 * Update an existing filter preset
 * Returns the updated preset and count of affected collections
 */
export async function updateFilterPreset(
  id: string,
  userId: string,
  input: UpdatePresetInput,
  isAdmin: boolean = false
): Promise<{ preset: FilterPreset; affectedCollections: number }> {
  const db = getDatabase();

  // Find the preset and verify ownership
  const existing = await db.filterPreset.findUnique({
    where: { id },
    include: {
      linkedCollections: {
        select: { id: true },
      },
    },
  });

  if (!existing) {
    throw new Error('Preset not found');
  }

  // Check permissions: owner or admin for global
  const canEdit = existing.userId === userId || (existing.isGlobal && isAdmin);
  if (!canEdit) {
    throw new Error('Not authorized to edit this preset');
  }

  // Check for duplicate name if changing name (within same type)
  if (input.name && input.name !== existing.name) {
    const duplicate = await db.filterPreset.findFirst({
      where: {
        name: input.name,
        type: existing.type,
        id: { not: id },
        ...(existing.isGlobal ? { isGlobal: true } : { userId }),
      },
    });

    if (duplicate) {
      throw new Error(`A ${existing.type} preset named "${input.name}" already exists`);
    }
  }

  const updatedPreset = await db.filterPreset.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.filterDefinition !== undefined && {
        filterDefinition: serializeFilterDefinition(input.filterDefinition),
      }),
      ...(input.sortBy !== undefined && { sortBy: input.sortBy }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
  });

  logger.info(
    `Updated filter preset: ${updatedPreset.name} (${id}), affects ${existing.linkedCollections.length} collections`
  );

  return {
    preset: toFilterPreset(updatedPreset),
    affectedCollections: existing.linkedCollections.length,
  };
}

/**
 * Delete a filter preset
 * Throws if preset is in use by any collections
 */
export async function deleteFilterPreset(
  id: string,
  userId: string,
  isAdmin: boolean = false
): Promise<void> {
  const db = getDatabase();

  // Find the preset and verify ownership
  const existing = await db.filterPreset.findUnique({
    where: { id },
    include: {
      linkedCollections: {
        select: { id: true, name: true },
      },
    },
  });

  if (!existing) {
    throw new Error('Preset not found');
  }

  // Check permissions: owner or admin for global
  const canDelete = existing.userId === userId || (existing.isGlobal && isAdmin);
  if (!canDelete) {
    throw new Error('Not authorized to delete this preset');
  }

  // Block deletion if in use
  if (existing.linkedCollections.length > 0) {
    const names = existing.linkedCollections
      .slice(0, 3)
      .map((c) => c.name)
      .join(', ');
    const more =
      existing.linkedCollections.length > 3
        ? ` and ${existing.linkedCollections.length - 3} more`
        : '';
    throw new Error(
      `Cannot delete preset: it is used by ${existing.linkedCollections.length} collection(s) (${names}${more}). Unlink collections first.`
    );
  }

  await db.filterPreset.delete({ where: { id } });

  logger.info(`Deleted filter preset: ${existing.name} (${id})`);
}

// =============================================================================
// Usage Tracking
// =============================================================================

/**
 * Get usage information for a preset
 */
export async function getPresetUsage(
  id: string,
  userId: string
): Promise<PresetUsageInfo> {
  const db = getDatabase();

  // Verify preset exists and is accessible
  const preset = await db.filterPreset.findFirst({
    where: {
      id,
      OR: [{ userId }, { isGlobal: true }],
    },
    include: {
      linkedCollections: {
        select: {
          id: true,
          name: true,
          userId: true,
          _count: {
            select: { items: true },
          },
        },
      },
    },
  });

  if (!preset) {
    throw new Error('Preset not found');
  }

  return {
    collections: preset.linkedCollections.map((c) => ({
      id: c.id,
      name: c.name,
      userId: c.userId,
      itemCount: c._count.items,
    })),
    totalCollections: preset.linkedCollections.length,
  };
}

/**
 * Check if a preset can be deleted
 * Verifies user has access to the preset before returning deletion status
 */
export async function canDeletePreset(
  id: string,
  userId: string
): Promise<{
  canDelete: boolean;
  blockedBy: string[];
}> {
  const db = getDatabase();

  // Only return info for presets the user can access
  const preset = await db.filterPreset.findFirst({
    where: {
      id,
      OR: [{ userId }, { isGlobal: true }],
    },
    include: {
      linkedCollections: {
        select: { name: true },
      },
    },
  });

  if (!preset) {
    throw new Error('Preset not found or not accessible');
  }

  const blockedBy = preset.linkedCollections.map((c) => c.name);

  return {
    canDelete: blockedBy.length === 0,
    blockedBy,
  };
}

// =============================================================================
// Preset Actions
// =============================================================================

/**
 * Duplicate a preset (for customizing global presets)
 */
export async function duplicatePreset(
  id: string,
  userId: string,
  newName: string
): Promise<FilterPreset> {
  const db = getDatabase();

  // Get the source preset
  const source = await db.filterPreset.findFirst({
    where: {
      id,
      OR: [{ userId }, { isGlobal: true }],
    },
  });

  if (!source) {
    throw new Error('Preset not found');
  }

  // Check for duplicate name within same type
  const existing = await db.filterPreset.findFirst({
    where: { userId, name: newName, type: source.type },
  });

  if (existing) {
    throw new Error(`A ${source.type} preset named "${newName}" already exists`);
  }

  const duplicate = await db.filterPreset.create({
    data: {
      userId,
      isGlobal: false,
      type: source.type,
      name: newName,
      description: source.description,
      icon: source.icon,
      filterDefinition: source.filterDefinition,
      sortBy: source.sortBy,
      sortOrder: source.sortOrder,
      schemaVersion: source.schemaVersion,
    },
  });

  logger.info(
    `Duplicated preset "${source.name}" (${id}) to "${newName}" (${duplicate.id}) for user ${userId}`
  );

  return toFilterPreset(duplicate);
}

/**
 * Migrate local storage presets to database
 */
export async function migrateLocalPresets(
  userId: string,
  localPresets: SmartFilter[],
  type: FilterPresetType = 'file'
): Promise<MigrateResult> {
  const db = getDatabase();
  const result: MigrateResult = { migrated: 0, skipped: 0, errors: [] };

  for (const preset of localPresets) {
    try {
      // Check for existing preset with same name and type
      const existing = await db.filterPreset.findFirst({
        where: { userId, name: preset.name || 'Unnamed Filter', type },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      await db.filterPreset.create({
        data: {
          userId,
          isGlobal: false,
          type,
          name: preset.name || 'Unnamed Filter',
          filterDefinition: serializeFilterDefinition(preset),
          sortBy: preset.sortBy ?? null,
          sortOrder: preset.sortOrder ?? null,
          schemaVersion: 1,
        },
      });

      result.migrated++;
    } catch (error) {
      result.errors.push(
        `Failed to migrate "${preset.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  logger.info(
    `Migrated ${result.migrated} ${type} presets for user ${userId}, skipped ${result.skipped}, ${result.errors.length} errors`
  );

  return result;
}

// =============================================================================
// Helper for Smart Collections
// =============================================================================

/**
 * Get the effective filter for a collection
 * Resolves either from linked preset or embedded definition
 */
export async function getEffectiveFilter(
  collectionId: string
): Promise<SmartFilter | null> {
  const db = getDatabase();

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    include: { filterPreset: true },
  });

  if (!collection) {
    return null;
  }

  // Prefer preset if linked (with null safety for filterDefinition)
  if (
    collection.filterPresetId &&
    collection.filterPreset?.filterDefinition
  ) {
    return parseFilterDefinition(collection.filterPreset.filterDefinition);
  }

  // Fall back to embedded definition (with null safety)
  if (collection.filterDefinition) {
    return parseFilterDefinition(collection.filterDefinition);
  }

  return null;
}

// Re-export types from smart-collection for convenience
export type {
  SmartFilter,
  FilterOperator,
  FilterGroup,
  FilterCondition,
  SortField,
  SortOrder,
};
