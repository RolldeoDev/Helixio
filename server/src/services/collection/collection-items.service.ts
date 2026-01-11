/**
 * Collection Items Service
 *
 * Handles collection item management: add, remove, reorder items,
 * query helpers, and unavailable items management.
 */

import { getDatabase } from '../database.service.js';
import type { PrismaClient } from '@prisma/client';
import { logError } from '../logger.service.js';
import { checkAndScheduleMosaicRegeneration, scheduleMosaicRegeneration } from './collection-mosaic.service.js';
import { recalculateCollectionMetadata } from './collection-metadata.service.js';
import { ensureSystemCollections } from './collection-crud.service.js';
import {
  type Collection,
  type CollectionItem,
  type AddItemInput,
  type RemoveItemInput,
  castCoverType,
} from './collection.types.js';

// =============================================================================
// Item Management
// =============================================================================

/**
 * Add items to a collection (verifies user ownership)
 */
export async function addItemsToCollection(
  userId: string,
  collectionId: string,
  items: AddItemInput[]
): Promise<CollectionItem[]> {
  const db = getDatabase();

  // Verify collection exists and belongs to user
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  // Get the next position
  const lastItem = await db.collectionItem.findFirst({
    where: { collectionId },
    orderBy: { position: 'desc' },
  });
  let nextPosition = (lastItem?.position ?? -1) + 1;

  const addedItems: CollectionItem[] = [];

  for (const item of items) {
    // Validate input - must have either seriesId or fileId, not both
    if ((!item.seriesId && !item.fileId) || (item.seriesId && item.fileId)) {
      continue; // Skip invalid items
    }

    // Check for duplicates
    const existing = await db.collectionItem.findFirst({
      where: {
        collectionId,
        OR: [
          item.seriesId ? { seriesId: item.seriesId } : {},
          item.fileId ? { fileId: item.fileId } : {},
        ].filter((o) => Object.keys(o).length > 0),
      },
    });

    if (existing) {
      continue; // Skip duplicates
    }

    const newItem = await db.collectionItem.create({
      data: {
        collectionId,
        seriesId: item.seriesId,
        fileId: item.fileId,
        notes: item.notes,
        position: nextPosition++,
      },
    });

    addedItems.push({
      id: newItem.id,
      collectionId: newItem.collectionId,
      seriesId: newItem.seriesId,
      fileId: newItem.fileId,
      position: newItem.position,
      addedAt: newItem.addedAt,
      notes: newItem.notes,
      isAvailable: newItem.isAvailable,
    });
  }

  // Schedule mosaic regeneration if any series items were added
  const addedSeriesIds = addedItems
    .filter((item) => item.seriesId)
    .map((item) => item.seriesId!);
  if (addedSeriesIds.length > 0) {
    checkAndScheduleMosaicRegeneration(collectionId, addedSeriesIds);
  }

  // Recalculate derived metadata if items were added
  if (addedItems.length > 0) {
    // Fire and forget - don't block the response
    recalculateCollectionMetadata(collectionId, userId).catch((err) => {
      logError('collection', err, { action: 'recalculate-metadata', collectionId });
    });
  }

  return addedItems;
}

/**
 * Remove items from a collection (verifies user ownership)
 */
export async function removeItemsFromCollection(
  userId: string,
  collectionId: string,
  items: RemoveItemInput[]
): Promise<number> {
  const db = getDatabase();

  // Verify collection exists and belongs to user
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  let removedCount = 0;

  for (const item of items) {
    if (!item.seriesId && !item.fileId) {
      continue;
    }

    const result = await db.collectionItem.deleteMany({
      where: {
        collectionId,
        ...(item.seriesId ? { seriesId: item.seriesId } : {}),
        ...(item.fileId ? { fileId: item.fileId } : {}),
      },
    });

    removedCount += result.count;
  }

  // Renumber positions to close gaps
  const remainingItems = await db.collectionItem.findMany({
    where: { collectionId },
    orderBy: { position: 'asc' },
  });

  await db.$transaction(
    remainingItems.map((item, index) =>
      db.collectionItem.update({
        where: { id: item.id },
        data: { position: index },
      })
    )
  );

  // Schedule mosaic regeneration if any series items were removed
  const removedSeriesIds = items
    .filter((item) => item.seriesId)
    .map((item) => item.seriesId!);
  if (removedSeriesIds.length > 0) {
    checkAndScheduleMosaicRegeneration(collectionId, removedSeriesIds);
  }

  // Recalculate derived metadata if items were removed
  if (removedCount > 0) {
    // Fire and forget - don't block the response
    recalculateCollectionMetadata(collectionId, userId).catch((err) => {
      logError('collection', err, { action: 'recalculate-metadata', collectionId });
    });
  }

  return removedCount;
}

/**
 * Reorder items within a collection (verifies user ownership)
 */
export async function reorderItems(userId: string, collectionId: string, orderedItemIds: string[]): Promise<void> {
  const db = getDatabase();

  // Verify collection exists and belongs to user
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  await db.$transaction(
    orderedItemIds.map((itemId, index) =>
      db.collectionItem.update({
        where: { id: itemId },
        data: { position: index },
      })
    )
  );

  // Schedule mosaic regeneration (reorder always potentially affects the mosaic)
  scheduleMosaicRegeneration(collectionId);
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Get all collections containing a specific series or file for a user
 *
 * @param options.includeSeriesFiles - When true and seriesId is provided, also finds
 *   collections containing individual files from that series (not just the series itself)
 */
export async function getCollectionsForItem(
  userId: string,
  seriesId?: string,
  fileId?: string,
  options?: { includeSeriesFiles?: boolean }
): Promise<Collection[]> {
  const db = getDatabase();

  if (!seriesId && !fileId) {
    return [];
  }

  // Build the OR conditions for the query
  const orConditions: Array<{ seriesId?: string; fileId?: string | { in: string[] } }> = [];

  if (seriesId) {
    orConditions.push({ seriesId });

    // If includeSeriesFiles is true, also match collection items where the file belongs to this series
    if (options?.includeSeriesFiles) {
      // First, get all file IDs that belong to this series
      const seriesFiles = await db.comicFile.findMany({
        where: { seriesId },
        select: { id: true },
      });

      if (seriesFiles.length > 0) {
        const fileIds = seriesFiles.map((f) => f.id);
        orConditions.push({ fileId: { in: fileIds } });
      }
    }
  }

  if (fileId) {
    orConditions.push({ fileId });
  }

  // Find all collection items matching the series or file in user's collections
  const collections = await db.collection.findMany({
    where: {
      userId,
      items: {
        some: {
          OR: orConditions,
        },
      },
    },
    orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }],
    include: {
      _count: { select: { items: true } },
    },
  });

  return collections.map((c) => ({
    id: c.id,
    userId: c.userId,
    name: c.name,
    description: c.description,
    deck: c.deck,
    isSystem: c.isSystem,
    systemKey: c.systemKey,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    itemCount: c._count.items,
    isPromoted: c.isPromoted,
    promotedOrder: c.promotedOrder,
    coverType: castCoverType(c.coverType),
    coverSeriesId: c.coverSeriesId,
    coverFileId: c.coverFileId,
    coverHash: c.coverHash,
    // Lock flags
    lockName: c.lockName,
    lockDeck: c.lockDeck,
    lockDescription: c.lockDescription,
    lockPublisher: c.lockPublisher,
    lockStartYear: c.lockStartYear,
    lockEndYear: c.lockEndYear,
    lockGenres: c.lockGenres,
    // New fields
    rating: c.rating,
    notes: c.notes,
    visibility: c.visibility,
    readingMode: c.readingMode,
    readerPresetId: c.readerPresetId,
    tags: c.tags,
  }));
}

/**
 * Check if a series or file is in a specific collection (verifies user ownership)
 */
export async function isInCollection(
  userId: string,
  collectionId: string,
  seriesId?: string,
  fileId?: string
): Promise<boolean> {
  const db = getDatabase();

  if (!seriesId && !fileId) {
    return false;
  }

  // Verify collection belongs to user
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    return false;
  }

  const item = await db.collectionItem.findFirst({
    where: {
      collectionId,
      OR: [
        ...(seriesId ? [{ seriesId }] : []),
        ...(fileId ? [{ fileId }] : []),
      ],
    },
  });

  return item !== null;
}

/**
 * Check if a series or file is in a system collection for a user
 */
export async function isInSystemCollection(
  userId: string,
  systemKey: 'favorites' | 'want-to-read',
  seriesId?: string,
  fileId?: string
): Promise<boolean> {
  const db = getDatabase();

  // Ensure system collections exist
  await ensureSystemCollections(userId);

  const collection = await db.collection.findUnique({
    where: {
      userId_systemKey: { userId, systemKey },
    },
  });

  if (!collection) {
    return false;
  }

  return isInCollection(userId, collection.id, seriesId, fileId);
}

/**
 * Toggle an item in a system collection for a user
 */
export async function toggleSystemCollection(
  userId: string,
  systemKey: 'favorites' | 'want-to-read',
  seriesId?: string,
  fileId?: string
): Promise<{ added: boolean }> {
  const db = getDatabase();

  // Ensure system collections exist
  await ensureSystemCollections(userId);

  const collection = await db.collection.findUnique({
    where: {
      userId_systemKey: { userId, systemKey },
    },
  });

  if (!collection) {
    throw new Error(`System collection not found: ${systemKey}`);
  }

  const isCurrentlyIn = await isInCollection(userId, collection.id, seriesId, fileId);

  if (isCurrentlyIn) {
    await removeItemsFromCollection(userId, collection.id, [{ seriesId, fileId }]);
    return { added: false };
  } else {
    await addItemsToCollection(userId, collection.id, [{ seriesId, fileId }]);
    return { added: true };
  }
}

/**
 * Bulk add or remove multiple series from a system collection.
 * Unlike toggleSystemCollection, this uses a deterministic action ('add' or 'remove')
 * to ensure consistent behavior for bulk operations.
 */
export async function bulkToggleSystemCollection(
  userId: string,
  systemKey: 'favorites' | 'want-to-read',
  seriesIds: string[],
  action: 'add' | 'remove'
): Promise<{ updated: number; results: Array<{ seriesId: string; success: boolean; error?: string }> }> {
  const db = getDatabase();

  // Ensure system collections exist
  await ensureSystemCollections(userId);

  const collection = await db.collection.findUnique({
    where: {
      userId_systemKey: { userId, systemKey },
    },
  });

  if (!collection) {
    throw new Error(`System collection not found: ${systemKey}`);
  }

  const results: Array<{ seriesId: string; success: boolean; error?: string }> = [];
  let updated = 0;

  for (const seriesId of seriesIds) {
    try {
      if (action === 'add') {
        // Check if already in collection to avoid duplicates
        const existing = await db.collectionItem.findUnique({
          where: {
            collectionId_seriesId: { collectionId: collection.id, seriesId },
          },
        });

        if (!existing) {
          await addItemsToCollection(userId, collection.id, [{ seriesId }]);
          updated++;
        }
      } else {
        // Remove from collection
        const removed = await removeItemsFromCollection(userId, collection.id, [{ seriesId }]);
        if (removed > 0) {
          updated++;
        }
      }
      results.push({ seriesId, success: true });
    } catch (error) {
      results.push({
        seriesId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { updated, results };
}

// =============================================================================
// Unavailable Items Management
// =============================================================================

/**
 * Get count of unavailable items for a user
 * Items become unavailable when their referenced file/series is deleted.
 */
export async function getUnavailableItemCount(userId: string): Promise<number> {
  const db = getDatabase();

  return db.collectionItem.count({
    where: {
      isAvailable: false,
      collection: { userId },
    },
  });
}

/**
 * Remove all unavailable items from a user's collections.
 * Call this to clean up orphaned collection references.
 */
export async function removeUnavailableItems(userId: string): Promise<number> {
  const db = getDatabase();

  const result = await db.collectionItem.deleteMany({
    where: {
      isAvailable: false,
      collection: { userId },
    },
  });

  return result.count;
}

/**
 * Mark collection items as unavailable when their referenced file is deleted.
 * This affects all users who have this file in their collections.
 *
 * @param fileId - The file ID whose collection items should be marked unavailable
 * @param database - Optional database client (defaults to read pool for backward compatibility)
 */
export async function markFileItemsUnavailable(
  fileId: string,
  database?: PrismaClient
): Promise<number> {
  const db = database ?? getDatabase();

  const result = await db.collectionItem.updateMany({
    where: { fileId },
    data: { isAvailable: false },
  });

  return result.count;
}

/**
 * Mark collection items as unavailable when their referenced series is soft-deleted.
 * This affects all users who have this series in their collections.
 */
export async function markSeriesItemsUnavailable(seriesId: string): Promise<number> {
  const db = getDatabase();

  const result = await db.collectionItem.updateMany({
    where: { seriesId },
    data: { isAvailable: false },
  });

  return result.count;
}

/**
 * Restore collection items when a series is restored from soft-delete.
 * This affects all users who have this series in their collections.
 */
export async function restoreSeriesItems(seriesId: string): Promise<number> {
  const db = getDatabase();

  const result = await db.collectionItem.updateMany({
    where: { seriesId },
    data: { isAvailable: true },
  });

  return result.count;
}
