/**
 * Series Relationship Service
 *
 * Manages parent/child relationships between series.
 * Supports many-to-many relationships (a series can have multiple parents and multiple children).
 *
 * Use cases:
 * - "Solo Leveling: Side Stories" attached to "Solo Leveling" as bonus content
 * - Spinoff series linked to main series
 * - Prequel/sequel relationships
 */

import { getDatabase } from './database.service.js';
import type { Series, SeriesRelationship, Prisma } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export type RelationshipType = 'related' | 'spinoff' | 'prequel' | 'sequel' | 'bonus';

export interface SeriesWithCounts {
  id: string;
  name: string;
  publisher: string | null;
  startYear: number | null;
  coverHash: string | null;
  coverUrl: string | null;
  coverFileId: string | null;
  coverSource: string;
  _count?: {
    issues: number;
  };
}

export interface SeriesRelationshipWithSeries extends SeriesRelationship {
  parentSeries?: SeriesWithCounts;
  childSeries?: SeriesWithCounts;
}

export interface SeriesRelationshipsResult {
  parents: SeriesWithCounts[];
  children: SeriesWithCounts[];
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Add a child series to a parent series.
 * Creates a parent/child relationship.
 *
 * @param parentSeriesId - The ID of the parent series
 * @param childSeriesId - The ID of the child series
 * @param relationshipType - The type of relationship (default: 'related')
 * @returns The created relationship
 */
export async function addChildSeries(
  parentSeriesId: string,
  childSeriesId: string,
  relationshipType: RelationshipType = 'related'
): Promise<SeriesRelationship> {
  const db = getDatabase();

  // Validate both series exist
  const [parent, child] = await Promise.all([
    db.series.findUnique({ where: { id: parentSeriesId } }),
    db.series.findUnique({ where: { id: childSeriesId } }),
  ]);

  if (!parent) {
    throw new Error(`Parent series ${parentSeriesId} not found`);
  }

  if (!child) {
    throw new Error(`Child series ${childSeriesId} not found`);
  }

  // Prevent self-relationship
  if (parentSeriesId === childSeriesId) {
    throw new Error('A series cannot be related to itself');
  }

  // Check for circular relationship (child is already a parent of parent)
  const wouldBeCircular = await db.seriesRelationship.findFirst({
    where: {
      parentSeriesId: childSeriesId,
      childSeriesId: parentSeriesId,
    },
  });

  if (wouldBeCircular) {
    throw new Error('Cannot create circular relationship');
  }

  // Get the next sort order for this parent
  const maxSortOrder = await db.seriesRelationship.findFirst({
    where: { parentSeriesId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const nextSortOrder = (maxSortOrder?.sortOrder ?? -1) + 1;

  // Create the relationship
  return db.seriesRelationship.create({
    data: {
      parentSeriesId,
      childSeriesId,
      relationshipType,
      sortOrder: nextSortOrder,
    },
  });
}

/**
 * Remove a child series from a parent series.
 *
 * @param parentSeriesId - The ID of the parent series
 * @param childSeriesId - The ID of the child series
 */
export async function removeChildSeries(
  parentSeriesId: string,
  childSeriesId: string
): Promise<void> {
  const db = getDatabase();

  await db.seriesRelationship.delete({
    where: {
      parentSeriesId_childSeriesId: {
        parentSeriesId,
        childSeriesId,
      },
    },
  });
}

/**
 * Get all child series for a parent series.
 *
 * @param parentSeriesId - The ID of the parent series
 * @returns Array of child series with issue counts
 */
export async function getChildSeries(
  parentSeriesId: string
): Promise<SeriesWithCounts[]> {
  const db = getDatabase();

  const relationships = await db.seriesRelationship.findMany({
    where: { parentSeriesId },
    orderBy: { sortOrder: 'asc' },
    include: {
      childSeries: {
        include: {
          _count: {
            select: { issues: true },
          },
        },
      },
    },
  });

  return relationships.map((r) => ({
    id: r.childSeries.id,
    name: r.childSeries.name,
    publisher: r.childSeries.publisher,
    startYear: r.childSeries.startYear,
    coverHash: r.childSeries.coverHash,
    coverUrl: r.childSeries.coverUrl,
    coverFileId: r.childSeries.coverFileId,
    coverSource: r.childSeries.coverSource,
    _count: r.childSeries._count,
  }));
}

/**
 * Get all parent series for a child series.
 *
 * @param childSeriesId - The ID of the child series
 * @returns Array of parent series with issue counts
 */
export async function getParentSeries(
  childSeriesId: string
): Promise<SeriesWithCounts[]> {
  const db = getDatabase();

  const relationships = await db.seriesRelationship.findMany({
    where: { childSeriesId },
    include: {
      parentSeries: {
        include: {
          _count: {
            select: { issues: true },
          },
        },
      },
    },
  });

  return relationships.map((r) => ({
    id: r.parentSeries.id,
    name: r.parentSeries.name,
    publisher: r.parentSeries.publisher,
    startYear: r.parentSeries.startYear,
    coverHash: r.parentSeries.coverHash,
    coverUrl: r.parentSeries.coverUrl,
    coverFileId: r.parentSeries.coverFileId,
    coverSource: r.parentSeries.coverSource,
    _count: r.parentSeries._count,
  }));
}

/**
 * Get all relationships for a series (both parents and children).
 *
 * @param seriesId - The ID of the series
 * @returns Object containing arrays of parent and child series
 */
export async function getSeriesRelationships(
  seriesId: string
): Promise<SeriesRelationshipsResult> {
  const [parents, children] = await Promise.all([
    getParentSeries(seriesId),
    getChildSeries(seriesId),
  ]);

  return { parents, children };
}

/**
 * Reorder child series within a parent.
 *
 * @param parentSeriesId - The ID of the parent series
 * @param orderedChildIds - Array of child series IDs in the desired order
 */
export async function reorderChildSeries(
  parentSeriesId: string,
  orderedChildIds: string[]
): Promise<void> {
  const db = getDatabase();

  // Update each relationship with the new sort order
  await Promise.all(
    orderedChildIds.map((childSeriesId, index) =>
      db.seriesRelationship.updateMany({
        where: {
          parentSeriesId,
          childSeriesId,
        },
        data: {
          sortOrder: index,
        },
      })
    )
  );
}

/**
 * Update the relationship type between a parent and child series.
 *
 * @param parentSeriesId - The ID of the parent series
 * @param childSeriesId - The ID of the child series
 * @param relationshipType - The new relationship type
 */
export async function updateRelationshipType(
  parentSeriesId: string,
  childSeriesId: string,
  relationshipType: RelationshipType
): Promise<SeriesRelationship> {
  const db = getDatabase();

  return db.seriesRelationship.update({
    where: {
      parentSeriesId_childSeriesId: {
        parentSeriesId,
        childSeriesId,
      },
    },
    data: {
      relationshipType,
    },
  });
}

/**
 * Get a specific relationship.
 *
 * @param parentSeriesId - The ID of the parent series
 * @param childSeriesId - The ID of the child series
 * @returns The relationship or null if not found
 */
export async function getRelationship(
  parentSeriesId: string,
  childSeriesId: string
): Promise<SeriesRelationship | null> {
  const db = getDatabase();

  return db.seriesRelationship.findUnique({
    where: {
      parentSeriesId_childSeriesId: {
        parentSeriesId,
        childSeriesId,
      },
    },
  });
}

/**
 * Check if a relationship exists between two series.
 *
 * @param parentSeriesId - The ID of the parent series
 * @param childSeriesId - The ID of the child series
 * @returns True if the relationship exists
 */
export async function hasRelationship(
  parentSeriesId: string,
  childSeriesId: string
): Promise<boolean> {
  const relationship = await getRelationship(parentSeriesId, childSeriesId);
  return relationship !== null;
}

/**
 * Get all relationships (for debugging/admin purposes).
 *
 * @returns All relationships with series data
 */
export async function getAllRelationships(): Promise<SeriesRelationshipWithSeries[]> {
  const db = getDatabase();

  return db.seriesRelationship.findMany({
    include: {
      parentSeries: {
        include: {
          _count: {
            select: { issues: true },
          },
        },
      },
      childSeries: {
        include: {
          _count: {
            select: { issues: true },
          },
        },
      },
    },
    orderBy: [{ parentSeriesId: 'asc' }, { sortOrder: 'asc' }],
  });
}
