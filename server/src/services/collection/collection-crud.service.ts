/**
 * Collection CRUD Service
 *
 * Handles core CRUD operations for collections and system collections.
 */

import { getDatabase } from '../database.service.js';
import {
  type Collection,
  type CollectionItem,
  type CollectionWithItems,
  type CreateCollectionInput,
  type UpdateCollectionInput,
  SYSTEM_COLLECTIONS,
  castCoverType,
} from './collection.types.js';

// =============================================================================
// System Collections
// =============================================================================

/**
 * Ensure system collections exist for a user
 * Called when user first accesses collections
 */
export async function ensureSystemCollections(userId: string): Promise<void> {
  const db = getDatabase();

  for (const systemCollection of SYSTEM_COLLECTIONS) {
    const existing = await db.collection.findUnique({
      where: {
        userId_systemKey: { userId, systemKey: systemCollection.systemKey },
      },
    });

    if (!existing) {
      await db.collection.create({
        data: {
          userId,
          name: systemCollection.name,
          isSystem: true,
          systemKey: systemCollection.systemKey,
          sortOrder: systemCollection.sortOrder,
        },
      });
    }
  }
}

/**
 * Get system collection by key for a user
 */
export async function getSystemCollection(
  userId: string,
  systemKey: 'favorites' | 'want-to-read'
): Promise<Collection | null> {
  const db = getDatabase();

  // Ensure system collections exist for this user
  await ensureSystemCollections(userId);

  const collection = await db.collection.findUnique({
    where: {
      userId_systemKey: { userId, systemKey },
    },
    include: {
      _count: { select: { items: true } },
    },
  });

  if (!collection) return null;

  return {
    ...collection,
    itemCount: collection._count.items,
    coverType: castCoverType(collection.coverType),
  };
}

// =============================================================================
// Collection CRUD
// =============================================================================

/**
 * Get all collections for a user with item counts
 */
export async function getCollections(userId: string): Promise<Collection[]> {
  const db = getDatabase();

  // Ensure system collections exist for this user
  await ensureSystemCollections(userId);

  const collections = await db.collection.findMany({
    where: { userId },
    orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
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
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    itemCount: c._count.items,
    isPromoted: c.isPromoted,
    promotedOrder: c.promotedOrder,
    coverType: castCoverType(c.coverType),
    coverSeriesId: c.coverSeriesId,
    coverFileId: c.coverFileId,
    coverHash: c.coverHash,
    overridePublisher: c.overridePublisher,
    overrideStartYear: c.overrideStartYear,
    overrideEndYear: c.overrideEndYear,
    overrideGenres: c.overrideGenres,
    derivedPublisher: c.derivedPublisher,
    derivedStartYear: c.derivedStartYear,
    derivedEndYear: c.derivedEndYear,
    derivedGenres: c.derivedGenres,
    derivedTags: c.derivedTags,
    // Smart collection fields
    isSmart: c.isSmart,
    smartScope: c.smartScope,
    filterDefinition: c.filterDefinition,
    lastEvaluatedAt: c.lastEvaluatedAt,
  }));
}

/**
 * Get a single collection with all items (verifies user ownership)
 */
export async function getCollection(userId: string, id: string): Promise<CollectionWithItems | null> {
  const db = getDatabase();

  const collection = await db.collection.findFirst({
    where: { id, userId },
    include: {
      items: {
        orderBy: { position: 'asc' },
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
            coverFileId: true,
            startYear: true,
            publisher: true,
            // Include first issue for cover fallback (with coverHash for cache-busting)
            issues: {
              take: 1,
              orderBy: [
                { metadata: { number: 'asc' } },
                { filename: 'asc' },
              ],
              select: { id: true, coverHash: true },
            },
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

  const items: CollectionItem[] = collection.items.map((item) => {
    const seriesRaw = item.seriesId ? seriesMap.get(item.seriesId) : undefined;
    // Transform series data to include firstIssueId and firstIssueCoverHash from the issues array
    const firstIssue = seriesRaw?.issues[0];
    const series = seriesRaw
      ? {
          id: seriesRaw.id,
          name: seriesRaw.name,
          coverHash: seriesRaw.coverHash,
          coverFileId: seriesRaw.coverFileId,
          firstIssueId: firstIssue?.id ?? null,
          firstIssueCoverHash: firstIssue?.coverHash ?? null,
          startYear: seriesRaw.startYear,
          publisher: seriesRaw.publisher,
        }
      : undefined;

    return {
      id: item.id,
      collectionId: item.collectionId,
      seriesId: item.seriesId,
      fileId: item.fileId,
      position: item.position,
      addedAt: item.addedAt,
      notes: item.notes,
      isAvailable: item.isAvailable,
      series,
      file: item.fileId ? fileMap.get(item.fileId) ?? undefined : undefined,
    };
  });

  return {
    id: collection.id,
    userId: collection.userId,
    name: collection.name,
    description: collection.description,
    deck: collection.deck,
    isSystem: collection.isSystem,
    systemKey: collection.systemKey,
    sortOrder: collection.sortOrder,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    itemCount: collection._count.items,
    isPromoted: collection.isPromoted,
    promotedOrder: collection.promotedOrder,
    coverType: castCoverType(collection.coverType),
    coverSeriesId: collection.coverSeriesId,
    coverFileId: collection.coverFileId,
    coverHash: collection.coverHash,
    derivedPublisher: collection.derivedPublisher,
    derivedStartYear: collection.derivedStartYear,
    derivedEndYear: collection.derivedEndYear,
    derivedGenres: collection.derivedGenres,
    derivedTags: collection.derivedTags,
    derivedIssueCount: collection.derivedIssueCount,
    derivedReadCount: collection.derivedReadCount,
    overridePublisher: collection.overridePublisher,
    overrideStartYear: collection.overrideStartYear,
    overrideEndYear: collection.overrideEndYear,
    overrideGenres: collection.overrideGenres,
    // Lock flags
    lockName: collection.lockName,
    lockDeck: collection.lockDeck,
    lockDescription: collection.lockDescription,
    lockPublisher: collection.lockPublisher,
    lockStartYear: collection.lockStartYear,
    lockEndYear: collection.lockEndYear,
    lockGenres: collection.lockGenres,
    // New fields
    rating: collection.rating,
    notes: collection.notes,
    visibility: collection.visibility,
    readingMode: collection.readingMode,
    readerPresetId: collection.readerPresetId,
    tags: collection.tags,
    // Smart collection fields
    isSmart: collection.isSmart,
    smartScope: collection.smartScope,
    filterDefinition: collection.filterDefinition,
    lastEvaluatedAt: collection.lastEvaluatedAt,
    items,
  };
}

/**
 * Create a new user collection
 */
export async function createCollection(userId: string, input: CreateCollectionInput): Promise<Collection> {
  const db = getDatabase();

  // Get the next sort order for user collections
  const lastCollection = await db.collection.findFirst({
    where: { userId, isSystem: false },
    orderBy: { sortOrder: 'desc' },
  });
  const nextSortOrder = (lastCollection?.sortOrder ?? SYSTEM_COLLECTIONS.length - 1) + 1;

  const collection = await db.collection.create({
    data: {
      userId,
      name: input.name,
      description: input.description,
      deck: input.deck,
      sortOrder: nextSortOrder,
      isSystem: false,
      // New fields
      rating: input.rating,
      notes: input.notes,
      visibility: input.visibility ?? 'private',
      readingMode: input.readingMode,
      tags: input.tags,
    },
  });

  return {
    ...collection,
    itemCount: 0,
    coverType: castCoverType(collection.coverType),
  };
}

/**
 * Update a collection (verifies user ownership)
 */
export async function updateCollection(
  userId: string,
  id: string,
  input: UpdateCollectionInput
): Promise<Collection> {
  const db = getDatabase();

  // Verify ownership
  const existing = await db.collection.findFirst({
    where: { id, userId },
  });

  if (!existing) {
    throw new Error('Collection not found');
  }

  // Check for locked fields (unless explicitly unlocking)
  const lockedFields: string[] = [];
  if (existing.lockName && input.name !== undefined && input.lockName !== false) {
    lockedFields.push('name');
  }
  if (existing.lockDeck && input.deck !== undefined && input.lockDeck !== false) {
    lockedFields.push('deck');
  }
  if (existing.lockDescription && input.description !== undefined && input.lockDescription !== false) {
    lockedFields.push('description');
  }
  if (existing.lockPublisher && input.overridePublisher !== undefined && input.lockPublisher !== false) {
    lockedFields.push('publisher');
  }
  if (existing.lockStartYear && input.overrideStartYear !== undefined && input.lockStartYear !== false) {
    lockedFields.push('startYear');
  }
  if (existing.lockEndYear && input.overrideEndYear !== undefined && input.lockEndYear !== false) {
    lockedFields.push('endYear');
  }
  if (existing.lockGenres && input.overrideGenres !== undefined && input.lockGenres !== false) {
    lockedFields.push('genres');
  }

  if (lockedFields.length > 0) {
    throw new Error(`Cannot update locked fields: ${lockedFields.join(', ')}. Unlock them first.`);
  }

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
    coverType: castCoverType(collection.coverType),
  };
}

/**
 * Delete a collection (fails for system collections, verifies user ownership)
 */
export async function deleteCollection(userId: string, id: string): Promise<void> {
  const db = getDatabase();

  const collection = await db.collection.findFirst({
    where: { id, userId },
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
