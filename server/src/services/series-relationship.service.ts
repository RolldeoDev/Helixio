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

/** Basic series info without relationship metadata */
export interface BasicSeriesInfo {
  id: string;
  name: string;
  publisher: string | null;
  startYear: number | null;
  coverHash: string | null;
  coverUrl: string | null;
  coverFileId: string | null;
  coverSource: string;
  /** First issue ID for cover fallback (optional - only in relationship queries) */
  firstIssueId?: string | null;
  /** First issue coverHash for cache-busting when issue cover changes */
  firstIssueCoverHash?: string | null;
  _count?: {
    issues: number;
  };
}

/** Series info with relationship metadata (for getChildSeries/getParentSeries) */
export interface SeriesWithCounts extends BasicSeriesInfo {
  relationshipType: RelationshipType;
  sortOrder: number;
}

export interface SeriesRelationshipWithSeries extends SeriesRelationship {
  parentSeries?: BasicSeriesInfo;
  childSeries?: BasicSeriesInfo;
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
          issues: {
            take: 1,
            // Order by numeric sort key to get actual Issue #1, not just first file added
            orderBy: [
              { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
              { filename: 'asc' },
            ],
            select: { id: true, coverHash: true },
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
    firstIssueId: r.childSeries.issues[0]?.id ?? null,
    firstIssueCoverHash: r.childSeries.issues[0]?.coverHash ?? null,
    relationshipType: r.relationshipType as RelationshipType,
    sortOrder: r.sortOrder,
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
          issues: {
            take: 1,
            // Order by numeric sort key to get actual Issue #1, not just first file added
            orderBy: [
              { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
              { filename: 'asc' },
            ],
            select: { id: true, coverHash: true },
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
    firstIssueId: r.parentSeries.issues[0]?.id ?? null,
    firstIssueCoverHash: r.parentSeries.issues[0]?.coverHash ?? null,
    relationshipType: r.relationshipType as RelationshipType,
    sortOrder: r.sortOrder,
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

// =============================================================================
// Bulk Operations
// =============================================================================

export interface BulkAddChildInput {
  parentSeriesId: string;
  children: Array<{
    childSeriesId: string;
    relationshipType: RelationshipType;
  }>;
}

export interface BulkOperationResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    seriesId: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Add multiple child series to a parent series in bulk.
 * Continues processing on individual failures.
 *
 * @param input - The parent series ID and array of children to add
 * @returns Aggregated results with per-item success/failure info
 */
export async function bulkAddChildSeries(
  input: BulkAddChildInput
): Promise<BulkOperationResult> {
  const db = getDatabase();
  const { parentSeriesId, children } = input;

  const results: BulkOperationResult['results'] = [];
  let successful = 0;

  // Validate parent series exists
  const parent = await db.series.findUnique({ where: { id: parentSeriesId } });
  if (!parent) {
    // If parent doesn't exist, fail all
    return {
      total: children.length,
      successful: 0,
      failed: children.length,
      results: children.map((c) => ({
        seriesId: c.childSeriesId,
        success: false,
        error: `Parent series ${parentSeriesId} not found`,
      })),
    };
  }

  // Get current max sort order for this parent
  const maxSortOrder = await db.seriesRelationship.findFirst({
    where: { parentSeriesId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  let nextSortOrder = (maxSortOrder?.sortOrder ?? -1) + 1;

  // Process each child
  for (const child of children) {
    const { childSeriesId, relationshipType } = child;

    try {
      // Check child exists
      const childSeries = await db.series.findUnique({
        where: { id: childSeriesId },
      });

      if (!childSeries) {
        results.push({
          seriesId: childSeriesId,
          success: false,
          error: 'Series not found',
        });
        continue;
      }

      // Check not self-referential
      if (parentSeriesId === childSeriesId) {
        results.push({
          seriesId: childSeriesId,
          success: false,
          error: 'Cannot link series to itself',
        });
        continue;
      }

      // Check for circular relationship
      const wouldBeCircular = await db.seriesRelationship.findFirst({
        where: {
          parentSeriesId: childSeriesId,
          childSeriesId: parentSeriesId,
        },
      });

      if (wouldBeCircular) {
        results.push({
          seriesId: childSeriesId,
          success: false,
          error: 'Would create circular relationship',
        });
        continue;
      }

      // Check for existing relationship (skip if already linked)
      const existingRelationship = await db.seriesRelationship.findUnique({
        where: {
          parentSeriesId_childSeriesId: {
            parentSeriesId,
            childSeriesId,
          },
        },
      });

      if (existingRelationship) {
        results.push({
          seriesId: childSeriesId,
          success: false,
          error: 'Already linked to this parent',
        });
        continue;
      }

      // Create the relationship
      await db.seriesRelationship.create({
        data: {
          parentSeriesId,
          childSeriesId,
          relationshipType,
          sortOrder: nextSortOrder,
        },
      });

      nextSortOrder++;
      successful++;
      results.push({
        seriesId: childSeriesId,
        success: true,
      });
    } catch (error) {
      results.push({
        seriesId: childSeriesId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    total: children.length,
    successful,
    failed: children.length - successful,
    results,
  };
}
