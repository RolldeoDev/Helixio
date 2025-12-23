/**
 * Collection Service
 *
 * Manages user collections including:
 * - System collections (Favorites, Want to Read)
 * - User-created collections
 * - Hybrid items (series and files)
 */

import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  systemKey: string | null;
  iconName: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  itemCount?: number;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  seriesId: string | null;
  fileId: string | null;
  position: number;
  addedAt: Date;
  notes: string | null;
  isAvailable: boolean; // False if referenced file/series has been deleted
  // Populated fields when fetching with relations
  series?: {
    id: string;
    name: string;
    coverHash: string | null;
    startYear: number | null;
    publisher: string | null;
  };
  file?: {
    id: string;
    filename: string;
    relativePath: string;
    coverHash: string | null;
    seriesId: string | null;
  };
}

export interface CollectionWithItems extends Collection {
  items: CollectionItem[];
}

export interface CreateCollectionInput {
  name: string;
  description?: string;
  iconName?: string;
  color?: string;
}

export interface UpdateCollectionInput {
  name?: string;
  description?: string;
  iconName?: string;
  color?: string;
  sortOrder?: number;
}

export interface AddItemInput {
  seriesId?: string;
  fileId?: string;
  notes?: string;
}

export interface RemoveItemInput {
  seriesId?: string;
  fileId?: string;
}

// =============================================================================
// System Collections
// =============================================================================

const SYSTEM_COLLECTIONS = [
  {
    systemKey: 'favorites',
    name: 'Favorites',
    iconName: 'heart',
    sortOrder: 0,
  },
  {
    systemKey: 'want-to-read',
    name: 'Want to Read',
    iconName: 'bookmark',
    sortOrder: 1,
  },
];

/**
 * Ensure system collections exist (called at server startup)
 */
export async function ensureSystemCollections(): Promise<void> {
  const db = getDatabase();

  for (const systemCollection of SYSTEM_COLLECTIONS) {
    const existing = await db.collection.findUnique({
      where: { systemKey: systemCollection.systemKey },
    });

    if (!existing) {
      await db.collection.create({
        data: {
          name: systemCollection.name,
          isSystem: true,
          systemKey: systemCollection.systemKey,
          iconName: systemCollection.iconName,
          sortOrder: systemCollection.sortOrder,
        },
      });
      console.log(`Created system collection: ${systemCollection.name}`);
    }
  }
}

/**
 * Get system collection by key
 */
export async function getSystemCollection(
  systemKey: 'favorites' | 'want-to-read'
): Promise<Collection | null> {
  const db = getDatabase();

  const collection = await db.collection.findUnique({
    where: { systemKey },
    include: {
      _count: { select: { items: true } },
    },
  });

  if (!collection) return null;

  return {
    ...collection,
    itemCount: collection._count.items,
  };
}

// =============================================================================
// Collection CRUD
// =============================================================================

/**
 * Get all collections with item counts
 */
export async function getCollections(): Promise<Collection[]> {
  const db = getDatabase();

  const collections = await db.collection.findMany({
    orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { items: true } },
    },
  });

  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    isSystem: c.isSystem,
    systemKey: c.systemKey,
    iconName: c.iconName,
    color: c.color,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    itemCount: c._count.items,
  }));
}

/**
 * Get a single collection with all items
 */
export async function getCollection(id: string): Promise<CollectionWithItems | null> {
  const db = getDatabase();

  const collection = await db.collection.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { position: 'asc' },
        include: {
          // Note: These are not real relations in Prisma since seriesId/fileId are just strings
          // We'll need to fetch them separately
        },
      },
      _count: { select: { items: true } },
    },
  });

  if (!collection) return null;

  // Fetch series and file data for items
  const seriesIds = collection.items.filter((i) => i.seriesId).map((i) => i.seriesId!);
  const fileIds = collection.items.filter((i) => i.fileId).map((i) => i.fileId!);

  const [seriesData, fileData] = await Promise.all([
    seriesIds.length > 0
      ? db.series.findMany({
          where: { id: { in: seriesIds } },
          select: {
            id: true,
            name: true,
            coverHash: true,
            startYear: true,
            publisher: true,
          },
        })
      : [],
    fileIds.length > 0
      ? db.comicFile.findMany({
          where: { id: { in: fileIds } },
          select: {
            id: true,
            filename: true,
            relativePath: true,
            coverHash: true,
            seriesId: true,
          },
        })
      : [],
  ]);

  const seriesMap = new Map<string, typeof seriesData[number]>();
  for (const s of seriesData) {
    seriesMap.set(s.id, s);
  }

  const fileMap = new Map<string, typeof fileData[number]>();
  for (const f of fileData) {
    fileMap.set(f.id, f);
  }

  const items: CollectionItem[] = collection.items.map((item) => ({
    id: item.id,
    collectionId: item.collectionId,
    seriesId: item.seriesId,
    fileId: item.fileId,
    position: item.position,
    addedAt: item.addedAt,
    notes: item.notes,
    isAvailable: item.isAvailable,
    series: item.seriesId ? seriesMap.get(item.seriesId) ?? undefined : undefined,
    file: item.fileId ? fileMap.get(item.fileId) ?? undefined : undefined,
  }));

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    isSystem: collection.isSystem,
    systemKey: collection.systemKey,
    iconName: collection.iconName,
    color: collection.color,
    sortOrder: collection.sortOrder,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    itemCount: collection._count.items,
    items,
  };
}

/**
 * Create a new user collection
 */
export async function createCollection(input: CreateCollectionInput): Promise<Collection> {
  const db = getDatabase();

  // Get the next sort order for user collections
  const lastCollection = await db.collection.findFirst({
    where: { isSystem: false },
    orderBy: { sortOrder: 'desc' },
  });
  const nextSortOrder = (lastCollection?.sortOrder ?? SYSTEM_COLLECTIONS.length - 1) + 1;

  const collection = await db.collection.create({
    data: {
      name: input.name,
      description: input.description,
      iconName: input.iconName,
      color: input.color,
      sortOrder: nextSortOrder,
      isSystem: false,
    },
  });

  return {
    ...collection,
    itemCount: 0,
  };
}

/**
 * Update a collection
 */
export async function updateCollection(
  id: string,
  input: UpdateCollectionInput
): Promise<Collection> {
  const db = getDatabase();

  const collection = await db.collection.update({
    where: { id },
    data: input,
    include: {
      _count: { select: { items: true } },
    },
  });

  return {
    ...collection,
    itemCount: collection._count.items,
  };
}

/**
 * Delete a collection (fails for system collections)
 */
export async function deleteCollection(id: string): Promise<void> {
  const db = getDatabase();

  const collection = await db.collection.findUnique({
    where: { id },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  if (collection.isSystem) {
    throw new Error('Cannot delete system collections');
  }

  await db.collection.delete({
    where: { id },
  });
}

// =============================================================================
// Collection Items
// =============================================================================

/**
 * Add items to a collection
 */
export async function addItemsToCollection(
  collectionId: string,
  items: AddItemInput[]
): Promise<CollectionItem[]> {
  const db = getDatabase();

  // Verify collection exists
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
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

  return addedItems;
}

/**
 * Remove items from a collection
 */
export async function removeItemsFromCollection(
  collectionId: string,
  items: RemoveItemInput[]
): Promise<number> {
  const db = getDatabase();

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

  return removedCount;
}

/**
 * Reorder items within a collection
 */
export async function reorderItems(collectionId: string, orderedItemIds: string[]): Promise<void> {
  const db = getDatabase();

  await db.$transaction(
    orderedItemIds.map((itemId, index) =>
      db.collectionItem.update({
        where: { id: itemId },
        data: { position: index },
      })
    )
  );
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Get all collections containing a specific series or file
 */
export async function getCollectionsForItem(
  seriesId?: string,
  fileId?: string
): Promise<Collection[]> {
  const db = getDatabase();

  if (!seriesId && !fileId) {
    return [];
  }

  // Find all collection items matching the series or file
  const items = await db.collectionItem.findMany({
    where: {
      OR: [
        ...(seriesId ? [{ seriesId }] : []),
        ...(fileId ? [{ fileId }] : []),
      ],
    },
    select: { collectionId: true },
  });

  if (items.length === 0) {
    return [];
  }

  const collectionIds = Array.from(new Set(items.map((i) => i.collectionId)));

  const collections = await db.collection.findMany({
    where: { id: { in: collectionIds } },
    orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }],
    include: {
      _count: { select: { items: true } },
    },
  });

  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    isSystem: c.isSystem,
    systemKey: c.systemKey,
    iconName: c.iconName,
    color: c.color,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    itemCount: c._count.items,
  }));
}

/**
 * Check if a series or file is in a specific collection
 */
export async function isInCollection(
  collectionId: string,
  seriesId?: string,
  fileId?: string
): Promise<boolean> {
  const db = getDatabase();

  if (!seriesId && !fileId) {
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
 * Check if a series or file is in a system collection
 */
export async function isInSystemCollection(
  systemKey: 'favorites' | 'want-to-read',
  seriesId?: string,
  fileId?: string
): Promise<boolean> {
  const db = getDatabase();

  const collection = await db.collection.findUnique({
    where: { systemKey },
  });

  if (!collection) {
    return false;
  }

  return isInCollection(collection.id, seriesId, fileId);
}

/**
 * Toggle an item in a system collection
 */
export async function toggleSystemCollection(
  systemKey: 'favorites' | 'want-to-read',
  seriesId?: string,
  fileId?: string
): Promise<{ added: boolean }> {
  const db = getDatabase();

  const collection = await db.collection.findUnique({
    where: { systemKey },
  });

  if (!collection) {
    throw new Error(`System collection not found: ${systemKey}`);
  }

  const isCurrentlyIn = await isInCollection(collection.id, seriesId, fileId);

  if (isCurrentlyIn) {
    await removeItemsFromCollection(collection.id, [{ seriesId, fileId }]);
    return { added: false };
  } else {
    await addItemsToCollection(collection.id, [{ seriesId, fileId }]);
    return { added: true };
  }
}

// =============================================================================
// Unavailable Items Management
// =============================================================================

/**
 * Get count of unavailable items across all collections.
 * Items become unavailable when their referenced file/series is deleted.
 */
export async function getUnavailableItemCount(): Promise<number> {
  const db = getDatabase();

  return db.collectionItem.count({
    where: { isAvailable: false },
  });
}

/**
 * Remove all unavailable items from all collections.
 * Call this to clean up orphaned collection references.
 */
export async function removeUnavailableItems(): Promise<number> {
  const db = getDatabase();

  const result = await db.collectionItem.deleteMany({
    where: { isAvailable: false },
  });

  return result.count;
}

/**
 * Mark collection items as unavailable when their referenced file is deleted.
 */
export async function markFileItemsUnavailable(fileId: string): Promise<number> {
  const db = getDatabase();

  const result = await db.collectionItem.updateMany({
    where: { fileId },
    data: { isAvailable: false },
  });

  return result.count;
}

/**
 * Mark collection items as unavailable when their referenced series is soft-deleted.
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
 */
export async function restoreSeriesItems(seriesId: string): Promise<number> {
  const db = getDatabase();

  const result = await db.collectionItem.updateMany({
    where: { seriesId },
    data: { isAvailable: true },
  });

  return result.count;
}
