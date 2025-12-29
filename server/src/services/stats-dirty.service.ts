/**
 * Stats Dirty Service
 *
 * Manages dirty flags for incremental stats updates.
 * Marks stats as needing recalculation when metadata or reading progress changes.
 */

import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export type DirtyScope = 'library' | 'entity' | 'user';
export type DirtyReason = 'metadata_change' | 'reading_progress' | 'file_added' | 'file_removed' | 'rating_change';
export type EntityType = 'creator' | 'genre' | 'character' | 'team' | 'publisher';

export interface DirtyFlag {
  id: string;
  scope: DirtyScope;
  scopeId: string | null;
  entityType: string | null;
  entityName: string | null;
  reason: string;
  createdAt: Date;
}

// =============================================================================
// Dirty Flag Management
// =============================================================================

/**
 * Mark stats as needing recalculation
 */
export async function markDirty(params: {
  scope: DirtyScope;
  scopeId?: string;
  entityType?: EntityType;
  entityName?: string;
  reason: DirtyReason;
}): Promise<void> {
  const db = getDatabase();

  await db.statsDirtyFlag.create({
    data: {
      scope: params.scope,
      scopeId: params.scopeId ?? null,
      entityType: params.entityType ?? null,
      entityName: params.entityName ?? null,
      reason: params.reason,
    },
  });
}

/**
 * Mark stats dirty after a metadata change
 * This marks both the library and all related entities as dirty
 */
export async function markDirtyForMetadataChange(fileId: string): Promise<void> {
  const db = getDatabase();

  // Get the file with its metadata and library
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      metadata: true,
    },
  });

  if (!file) return;

  // Mark the library as dirty
  await markDirty({
    scope: 'library',
    scopeId: file.libraryId,
    reason: 'metadata_change',
  });

  // Mark user-level as dirty
  await markDirty({
    scope: 'user',
    reason: 'metadata_change',
  });

  // If there's metadata, mark all related entities as dirty
  if (file.metadata) {
    const meta = file.metadata;

    // Publishers
    if (meta.publisher) {
      await markDirty({
        scope: 'entity',
        scopeId: file.libraryId,
        entityType: 'publisher',
        entityName: meta.publisher,
        reason: 'metadata_change',
      });
    }

    // Genres (comma-separated)
    if (meta.genre) {
      const genres = meta.genre.split(',').map((g) => g.trim()).filter(Boolean);
      for (const genre of genres) {
        await markDirty({
          scope: 'entity',
          scopeId: file.libraryId,
          entityType: 'genre',
          entityName: genre,
          reason: 'metadata_change',
        });
      }
    }

    // Characters (comma-separated)
    if (meta.characters) {
      const characters = meta.characters.split(',').map((c) => c.trim()).filter(Boolean);
      for (const character of characters) {
        await markDirty({
          scope: 'entity',
          scopeId: file.libraryId,
          entityType: 'character',
          entityName: character,
          reason: 'metadata_change',
        });
      }
    }

    // Teams (comma-separated)
    if (meta.teams) {
      const teams = meta.teams.split(',').map((t) => t.trim()).filter(Boolean);
      for (const team of teams) {
        await markDirty({
          scope: 'entity',
          scopeId: file.libraryId,
          entityType: 'team',
          entityName: team,
          reason: 'metadata_change',
        });
      }
    }

    // Creators (multiple fields)
    const creatorRoles: Array<{ role: string; value: string | null }> = [
      { role: 'writer', value: meta.writer },
      { role: 'penciller', value: meta.penciller },
      { role: 'inker', value: meta.inker },
      { role: 'colorist', value: meta.colorist },
      { role: 'letterer', value: meta.letterer },
      { role: 'coverArtist', value: meta.coverArtist },
      { role: 'editor', value: meta.editor },
    ];

    for (const { role, value } of creatorRoles) {
      if (value) {
        const creators = value.split(',').map((c) => c.trim()).filter(Boolean);
        for (const creator of creators) {
          await markDirty({
            scope: 'entity',
            scopeId: file.libraryId,
            entityType: 'creator',
            entityName: `${creator}:${role}`, // Include role in entity name for creators
            reason: 'metadata_change',
          });
        }
      }
    }
  }
}

/**
 * Mark stats dirty after a reading progress change
 * This is more targeted - only marks library and relevant entities
 */
export async function markDirtyForReadingProgress(fileId: string): Promise<void> {
  const db = getDatabase();

  // Get the file with its metadata and library
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      metadata: true,
    },
  });

  if (!file) return;

  // Mark the library as dirty
  await markDirty({
    scope: 'library',
    scopeId: file.libraryId,
    reason: 'reading_progress',
  });

  // Mark user-level as dirty
  await markDirty({
    scope: 'user',
    reason: 'reading_progress',
  });

  // For reading progress, we need to update entity read stats
  // Mark all entities associated with this file as dirty
  if (file.metadata) {
    const meta = file.metadata;

    if (meta.publisher) {
      await markDirty({
        scope: 'entity',
        scopeId: file.libraryId,
        entityType: 'publisher',
        entityName: meta.publisher,
        reason: 'reading_progress',
      });
    }

    if (meta.genre) {
      const genres = meta.genre.split(',').map((g) => g.trim()).filter(Boolean);
      for (const genre of genres) {
        await markDirty({
          scope: 'entity',
          scopeId: file.libraryId,
          entityType: 'genre',
          entityName: genre,
          reason: 'reading_progress',
        });
      }
    }

    if (meta.characters) {
      const characters = meta.characters.split(',').map((c) => c.trim()).filter(Boolean);
      for (const character of characters) {
        await markDirty({
          scope: 'entity',
          scopeId: file.libraryId,
          entityType: 'character',
          entityName: character,
          reason: 'reading_progress',
        });
      }
    }

    if (meta.teams) {
      const teams = meta.teams.split(',').map((t) => t.trim()).filter(Boolean);
      for (const team of teams) {
        await markDirty({
          scope: 'entity',
          scopeId: file.libraryId,
          entityType: 'team',
          entityName: team,
          reason: 'reading_progress',
        });
      }
    }

    // Creators
    const creatorRoles: Array<{ role: string; value: string | null }> = [
      { role: 'writer', value: meta.writer },
      { role: 'penciller', value: meta.penciller },
      { role: 'inker', value: meta.inker },
      { role: 'colorist', value: meta.colorist },
      { role: 'letterer', value: meta.letterer },
      { role: 'coverArtist', value: meta.coverArtist },
      { role: 'editor', value: meta.editor },
    ];

    for (const { role, value } of creatorRoles) {
      if (value) {
        const creators = value.split(',').map((c) => c.trim()).filter(Boolean);
        for (const creator of creators) {
          await markDirty({
            scope: 'entity',
            scopeId: file.libraryId,
            entityType: 'creator',
            entityName: `${creator}:${role}`,
            reason: 'reading_progress',
          });
        }
      }
    }
  }
}

/**
 * Mark stats dirty for file added/removed
 */
export async function markDirtyForFileChange(
  libraryId: string,
  reason: 'file_added' | 'file_removed'
): Promise<void> {
  await markDirty({
    scope: 'library',
    scopeId: libraryId,
    reason,
  });

  await markDirty({
    scope: 'user',
    reason,
  });
}

/**
 * Mark stats dirty for rating/review change
 * Only marks user-level as dirty (rating stats are user-specific)
 */
export async function markDirtyForRatingChange(): Promise<void> {
  await markDirty({
    scope: 'user',
    reason: 'rating_change',
  });
}

// =============================================================================
// Dirty Flag Queries
// =============================================================================

/**
 * Get pending dirty flags for processing
 */
export async function getPendingDirtyFlags(limit: number = 100): Promise<DirtyFlag[]> {
  const db = getDatabase();

  const flags = await db.statsDirtyFlag.findMany({
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  // Map Prisma result to DirtyFlag type
  return flags.map((f) => ({
    id: f.id,
    scope: f.scope as DirtyScope,
    scopeId: f.scopeId,
    entityType: f.entityType,
    entityName: f.entityName,
    reason: f.reason,
    createdAt: f.createdAt,
  }));
}

/**
 * Get unique dirty scopes (deduplicated for efficient processing)
 */
export async function getUniqueDirtyScopes(): Promise<{
  libraries: string[];
  entities: Array<{ entityType: string; entityName: string; libraryId: string | null }>;
  userDirty: boolean;
}> {
  const db = getDatabase();

  const flags = await db.statsDirtyFlag.findMany();

  const libraries = new Set<string>();
  const entities = new Map<string, { entityType: string; entityName: string; libraryId: string | null }>();
  let userDirty = false;

  for (const flag of flags) {
    if (flag.scope === 'library' && flag.scopeId) {
      libraries.add(flag.scopeId);
    } else if (flag.scope === 'entity' && flag.entityType && flag.entityName) {
      const key = `${flag.entityType}:${flag.entityName}:${flag.scopeId ?? 'user'}`;
      entities.set(key, {
        entityType: flag.entityType,
        entityName: flag.entityName,
        libraryId: flag.scopeId,
      });
    } else if (flag.scope === 'user') {
      userDirty = true;
    }
  }

  return {
    libraries: Array.from(libraries),
    entities: Array.from(entities.values()),
    userDirty,
  };
}

/**
 * Clear processed dirty flags by IDs
 */
export async function clearDirtyFlags(ids: string[]): Promise<void> {
  const db = getDatabase();

  await db.statsDirtyFlag.deleteMany({
    where: {
      id: { in: ids },
    },
  });
}

/**
 * Clear all dirty flags (for full rebuild)
 */
export async function clearAllDirtyFlags(): Promise<void> {
  const db = getDatabase();
  await db.statsDirtyFlag.deleteMany();
}

/**
 * Get count of pending dirty flags
 */
export async function getDirtyFlagCount(): Promise<number> {
  const db = getDatabase();
  return db.statsDirtyFlag.count();
}
