/**
 * Collection Service
 *
 * Manages user collections including:
 * - System collections (Favorites, Want to Read) - per user
 * - User-created collections
 * - Hybrid items (series and files)
 *
 * All collections are now user-scoped.
 */

import { getDatabase } from './database.service.js';
import {
  generateCollectionMosaicCover,
  saveCollectionMosaicCover,
  deleteCollectionCover,
  type SeriesCoverForMosaic,
} from './cover.service.js';
import { logError, logInfo, logDebug, createServiceLogger } from './logger.service.js';
import {
  type SmartFilter,
  type SortField,
  type SortOrder,
} from './smart-collection.service.js';

const logger = createServiceLogger('collection');

// =============================================================================
// Types
// =============================================================================

export interface Collection {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  deck: string | null;
  isSystem: boolean;
  systemKey: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  itemCount?: number;
  // Lock flags
  lockName: boolean;
  lockDeck: boolean;
  lockDescription: boolean;
  lockPublisher: boolean;
  lockStartYear: boolean;
  lockEndYear: boolean;
  lockGenres: boolean;
  // User metadata
  rating: number | null;
  notes: string | null;
  visibility: string;
  readingMode: string | null;
  tags: string | null;
  // Promotion fields
  isPromoted?: boolean;
  promotedOrder?: number | null;
  // Cover customization
  coverType?: 'auto' | 'series' | 'issue' | 'custom';
  coverSeriesId?: string | null;
  coverFileId?: string | null;
  coverHash?: string | null;
  // Derived metadata
  derivedPublisher?: string | null;
  derivedStartYear?: number | null;
  derivedEndYear?: number | null;
  derivedGenres?: string | null;
  derivedTags?: string | null;
  derivedIssueCount?: number | null;
  derivedReadCount?: number | null;
  // Override metadata
  overridePublisher?: string | null;
  overrideStartYear?: number | null;
  overrideEndYear?: number | null;
  overrideGenres?: string | null;
  // Smart collection fields
  isSmart?: boolean;
  smartScope?: string | null;
  filterDefinition?: string | null;
  lastEvaluatedAt?: Date | null;
}

// Type alias for cover type
type CoverType = 'auto' | 'series' | 'issue' | 'custom';

// Helper to cast cover type from database string
function castCoverType(coverType: string | null): CoverType | undefined {
  if (!coverType) return undefined;
  if (['auto', 'series', 'issue', 'custom'].includes(coverType)) {
    return coverType as CoverType;
  }
  return undefined;
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
    coverFileId: string | null;
    firstIssueId: string | null;
    /** First issue's coverHash for cache-busting when issue cover changes */
    firstIssueCoverHash?: string | null;
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
  deck?: string;
  rating?: number;
  notes?: string;
  visibility?: string;
  readingMode?: string;
  tags?: string;
}

export interface UpdateCollectionInput {
  name?: string;
  description?: string;
  deck?: string;
  sortOrder?: number;
  // Override metadata
  overridePublisher?: string | null;
  overrideStartYear?: number | null;
  overrideEndYear?: number | null;
  overrideGenres?: string | null;
  // Lock toggles
  lockName?: boolean;
  lockDeck?: boolean;
  lockDescription?: boolean;
  lockPublisher?: boolean;
  lockStartYear?: boolean;
  lockEndYear?: boolean;
  lockGenres?: boolean;
  // New fields
  rating?: number | null;
  notes?: string | null;
  visibility?: string;
  readingMode?: string | null;
  tags?: string | null;
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
    sortOrder: 0,
  },
  {
    systemKey: 'want-to-read',
    name: 'Want to Read',
    sortOrder: 1,
  },
];

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
// Mosaic Cover Regeneration
// =============================================================================

/**
 * Pending mosaic regeneration jobs, keyed by collectionId.
 * Uses debouncing to avoid regenerating multiple times when items change rapidly.
 */
const pendingMosaicJobs = new Map<string, NodeJS.Timeout>();

/**
 * Schedule mosaic regeneration for a collection.
 * Debounced to avoid multiple regenerations when items change rapidly.
 */
export function scheduleMosaicRegeneration(collectionId: string): void {
  // Cancel any existing scheduled job
  const existing = pendingMosaicJobs.get(collectionId);
  if (existing) {
    clearTimeout(existing);
  }

  // Schedule new job with 1 second debounce
  const timeout = setTimeout(async () => {
    pendingMosaicJobs.delete(collectionId);
    try {
      await regenerateCollectionMosaic(collectionId);
    } catch (err) {
      logError('collection', err, { action: 'mosaic-regeneration', collectionId });
    }
  }, 1000);

  pendingMosaicJobs.set(collectionId, timeout);
}

/**
 * Regenerate the mosaic cover for a collection.
 * Only regenerates if the collection is using 'auto' cover type.
 */
export async function regenerateCollectionMosaic(collectionId: string): Promise<void> {
  const db = getDatabase();

  // Get collection with cover settings
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: {
      id: true,
      coverType: true,
      coverHash: true,
    },
  });

  if (!collection) {
    logDebug('collection', `Collection ${collectionId} not found`, { collectionId });
    return;
  }

  // Only regenerate for 'auto' cover type
  if (collection.coverType !== 'auto') {
    return;
  }

  logDebug('collection', `Regenerating mosaic for collection ${collectionId}`, { collectionId });

  // Get first 4 series items in the collection
  const seriesItems = await db.collectionItem.findMany({
    where: {
      collectionId,
      seriesId: { not: null },
      isAvailable: true,
    },
    orderBy: { position: 'asc' },
    take: 4,
    select: {
      seriesId: true,
    },
  });

  // Get series data for the items
  const seriesIds = seriesItems
    .map((item) => item.seriesId)
    .filter((id): id is string => id !== null);

  // Map to SeriesCoverForMosaic format, including firstIssueId
  const seriesCovers: SeriesCoverForMosaic[] = [];
  for (const seriesId of seriesIds) {
    const series = await db.series.findUnique({
      where: { id: seriesId },
      select: {
        id: true,
        coverHash: true,
        coverFileId: true,
      },
    });

    if (series) {
      // Get first issue for fallback
      const firstIssue = await db.comicFile.findFirst({
        where: { seriesId: series.id },
        orderBy: [{ filename: 'asc' }],
        select: { id: true },
      });

      seriesCovers.push({
        id: series.id,
        coverHash: series.coverHash,
        coverFileId: series.coverFileId,
        firstIssueId: firstIssue?.id ?? null,
      });
    }
  }

  // Delete old mosaic if it exists
  if (collection.coverHash) {
    await deleteCollectionCover(collection.coverHash);
  }

  // Generate new mosaic
  if (seriesCovers.length === 0) {
    // Empty collection - set coverHash to null
    await db.collection.update({
      where: { id: collectionId },
      data: { coverHash: null },
    });
    logDebug('collection', `Collection ${collectionId} is empty, cleared coverHash`, { collectionId });
    return;
  }

  const result = await generateCollectionMosaicCover(seriesCovers);
  if (!result) {
    await db.collection.update({
      where: { id: collectionId },
      data: { coverHash: null },
    });
    logDebug('collection', `Failed to generate mosaic for collection ${collectionId}`, { collectionId });
    return;
  }

  // Save the mosaic to disk
  const saveResult = await saveCollectionMosaicCover(result.buffer, result.coverHash);
  if (!saveResult.success) {
    logError('collection', new Error(saveResult.error || 'Unknown error'), { action: 'save-mosaic', collectionId });
    return;
  }

  // Update the collection with the new coverHash
  await db.collection.update({
    where: { id: collectionId },
    data: { coverHash: result.coverHash },
  });

  logDebug('collection', `Successfully regenerated mosaic for collection ${collectionId}`, { collectionId, coverHash: result.coverHash });
}

/**
 * Regenerate mosaic cover synchronously (waits for completion).
 * Use this when the caller needs the updated coverHash immediately.
 * Cancels any pending debounced regeneration.
 */
export async function regenerateMosaicSync(collectionId: string): Promise<string | null> {
  // Cancel any pending debounced regeneration
  const pending = pendingMosaicJobs.get(collectionId);
  if (pending) {
    clearTimeout(pending);
    pendingMosaicJobs.delete(collectionId);
  }

  // Regenerate immediately
  await regenerateCollectionMosaic(collectionId);

  // Fetch and return the new coverHash
  const db = getDatabase();
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { coverHash: true },
  });

  return collection?.coverHash ?? null;
}

/**
 * Get the first 4 series IDs in a collection (for mosaic comparison).
 */
async function getFirst4SeriesIds(collectionId: string): Promise<string[]> {
  const db = getDatabase();

  const items = await db.collectionItem.findMany({
    where: {
      collectionId,
      seriesId: { not: null },
      isAvailable: true,
    },
    orderBy: { position: 'asc' },
    take: 4,
    select: { seriesId: true },
  });

  return items
    .map((item) => item.seriesId)
    .filter((id): id is string => id !== null);
}

/**
 * Check if changes to collection items affect the first 4 series.
 * If so, schedule mosaic regeneration.
 */
export async function checkAndScheduleMosaicRegeneration(
  collectionId: string,
  changedSeriesIds: string[]
): Promise<void> {
  const db = getDatabase();

  // Get collection to check coverType
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { coverType: true },
  });

  if (!collection || collection.coverType !== 'auto') {
    return;
  }

  // Get current first 4 series
  const first4 = await getFirst4SeriesIds(collectionId);

  // Check if any changed series is in the first 4
  const affectsFirst4 = changedSeriesIds.some((id) => first4.includes(id));

  // Also regenerate if the first 4 has fewer items than before (item removed)
  // or if items were added that might be in the first 4
  if (affectsFirst4 || changedSeriesIds.length > 0) {
    scheduleMosaicRegeneration(collectionId);
  }
}

/**
 * Regenerate mosaics for all collections containing a series.
 * Called when a series cover changes.
 */
export async function onSeriesCoverChanged(seriesId: string): Promise<void> {
  const db = getDatabase();

  // Find all collections with coverType='auto' containing this series in first 4
  const collections = await db.collection.findMany({
    where: {
      coverType: 'auto',
      items: {
        some: {
          seriesId,
          isAvailable: true,
        },
      },
    },
    select: { id: true },
  });

  for (const collection of collections) {
    // Check if this series is in the first 4
    const first4 = await getFirst4SeriesIds(collection.id);
    if (first4.includes(seriesId)) {
      scheduleMosaicRegeneration(collection.id);
    }
  }
}

/**
 * Recalculate derived metadata for all collections containing a series.
 * Called when a series' metadata (tags, genres, publisher, etc.) changes.
 * This ensures collections that don't have overridden fields get updated values.
 */
export async function onSeriesMetadataChanged(seriesId: string): Promise<void> {
  const db = getDatabase();

  // Find all collections containing this series (via CollectionItem)
  const collectionItems = await db.collectionItem.findMany({
    where: {
      seriesId,
      isAvailable: true,
    },
    select: {
      collectionId: true,
      collection: {
        select: {
          userId: true,
        },
      },
    },
    distinct: ['collectionId'],
  });

  // Recalculate metadata for each affected collection (fire-and-forget)
  for (const item of collectionItems) {
    recalculateCollectionMetadata(item.collectionId, item.collection.userId).catch((err) => {
      logError('collection', err, {
        action: 'recalculate-metadata-on-series-change',
        collectionId: item.collectionId,
        seriesId,
      });
    });
  }

  logDebug('collection', `Triggered metadata recalculation for ${collectionItems.length} collections after series ${seriesId} metadata changed`, {
    seriesId,
    collectionCount: collectionItems.length,
  });
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

// =============================================================================
// Collection Items
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

// =============================================================================
// Promoted Collections (Show in Series View)
// =============================================================================

export interface PromotedCollectionWithMeta {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isPromoted: boolean;
  promotedOrder: number | null;
  // Cover info
  coverType: string;
  coverSeriesId: string | null;
  coverFileId: string | null;
  coverHash: string | null;
  // Derived/override metadata
  publisher: string | null;
  startYear: number | null;
  endYear: number | null;
  genres: string | null;
  // Aggregate reading progress
  totalIssues: number;
  readIssues: number;
  // Series info for mosaic cover
  seriesCovers: Array<{
    id: string;
    coverHash: string | null;
    coverUrl: string | null;
    coverFileId: string | null;
    name: string;
    firstIssueId: string | null;
    firstIssueCoverHash: string | null;
  }>;
  seriesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get all promoted collections for a user with aggregated data.
 */
export async function getPromotedCollections(
  userId: string
): Promise<PromotedCollectionWithMeta[]> {
  const db = getDatabase();

  // Get promoted collections with their series items
  const collections = await db.collection.findMany({
    where: {
      userId,
      isPromoted: true,
    },
    orderBy: [{ promotedOrder: 'asc' }, { name: 'asc' }],
    include: {
      items: {
        where: {
          seriesId: { not: null },
          isAvailable: true,
        },
        select: {
          seriesId: true,
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  // Transform to include aggregated data
  return Promise.all(
    collections.map(async (collection) => {
      // Get series IDs from collection items
      const seriesIds = collection.items
        .map((item) => item.seriesId)
        .filter((id): id is string => id !== null);

      // Fetch full series data for these IDs (with first issue for cover fallback)
      const seriesRecords = seriesIds.length > 0
        ? await db.series.findMany({
            where: { id: { in: seriesIds } },
            select: {
              id: true,
              name: true,
              coverHash: true,
              coverUrl: true,
              coverFileId: true,
              publisher: true,
              startYear: true,
              endYear: true,
              genres: true,
              _count: {
                select: { issues: true },
              },
              // Include first issue for cover fallback (with coverHash for cache-busting)
              issues: {
                take: 1,
                orderBy: [
                  { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
                  { filename: 'asc' },
                ],
                select: { id: true, coverHash: true },
              },
            },
          })
        : [];

      // Map for quick lookup while preserving order
      const seriesMap = new Map(seriesRecords.map(s => [s.id, s]));
      const seriesItems = seriesIds
        .map(id => seriesMap.get(id))
        .filter((s): s is typeof seriesRecords[0] => s !== undefined);

      // Calculate aggregate issue count
      const totalIssues = seriesItems.reduce(
        (sum, s) => sum + (s._count?.issues || 0),
        0
      );

      // Calculate read count for this user
      let readIssues = 0;

      if (seriesIds.length > 0) {
        const progressRecords = await db.seriesProgress.findMany({
          where: {
            userId,
            seriesId: { in: seriesIds },
          },
          select: { totalRead: true },
        });
        readIssues = progressRecords.reduce((sum, p) => sum + p.totalRead, 0);
      }

      // Derive metadata from series
      const publishers = seriesItems
        .map((s) => s.publisher)
        .filter((p): p is string => !!p);
      const mostCommonPublisher =
        publishers.length > 0
          ? publishers.sort(
              (a: string, b: string) =>
                publishers.filter((v: string) => v === b).length -
                publishers.filter((v: string) => v === a).length
            )[0]
          : null;

      const years = seriesItems
        .map((s) => s.startYear)
        .filter((y): y is number => y !== null);
      const minYear = years.length > 0 ? Math.min(...years) : null;

      const endYears = seriesItems
        .map((s) => s.endYear)
        .filter((y): y is number => y !== null);
      const maxYear = endYears.length > 0 ? Math.max(...endYears) : null;

      const allGenres = seriesItems
        .flatMap((s) => (s.genres || '').split(',').map((g: string) => g.trim()))
        .filter((g: string) => g.length > 0);
      const uniqueGenres = [...new Set(allGenres)].slice(0, 5).join(', ');

      // Get cover series info for mosaic
      const seriesCovers = seriesItems.slice(0, 6).map((s) => ({
        id: s.id,
        coverHash: s.coverHash,
        coverUrl: s.coverUrl,
        coverFileId: s.coverFileId,
        name: s.name,
        firstIssueId: s.issues[0]?.id ?? null,
        firstIssueCoverHash: s.issues[0]?.coverHash ?? null,
      }));

      return {
        id: collection.id,
        userId: collection.userId,
        name: collection.name,
        description: collection.description,
        isPromoted: collection.isPromoted,
        promotedOrder: collection.promotedOrder,
        coverType: collection.coverType,
        coverSeriesId: collection.coverSeriesId,
        coverFileId: collection.coverFileId,
        coverHash: collection.coverHash,
        // Use override if set, otherwise use derived
        publisher: collection.overridePublisher ?? mostCommonPublisher ?? null,
        startYear: collection.overrideStartYear ?? minYear ?? null,
        endYear: collection.overrideEndYear ?? maxYear ?? null,
        genres: collection.overrideGenres ?? (uniqueGenres || null),
        totalIssues,
        readIssues,
        seriesCovers,
        seriesCount: seriesItems.length,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      };
    })
  );
}

/**
 * Filter options for promoted collections in grid view.
 */
export interface PromotedCollectionGridFilters {
  search?: string;
  publisher?: string;
  type?: 'western' | 'manga';
  genres?: string[];
  hasUnread?: boolean;
  libraryId?: string;
}

/**
 * Collection data for grid display.
 * Extended version with library info and content timestamps.
 */
export interface PromotedCollectionForGrid {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isPromoted: boolean;
  promotedOrder: number | null;
  coverType: string;
  coverSeriesId: string | null;
  coverFileId: string | null;
  coverHash: string | null;
  // Effective metadata (override ?? derived ?? default)
  publisher: string | null;
  startYear: number | null;
  endYear: number | null;
  genres: string | null;
  // Aggregated counts
  totalIssues: number;
  readIssues: number;
  seriesCount: number;
  // For mosaic cover
  seriesCovers: Array<{
    id: string;
    coverHash: string | null;
    coverUrl: string | null;
    coverFileId: string | null;
    name: string;
    firstIssueId: string | null;
    firstIssueCoverHash: string | null;
  }>;
  // For library filtering
  libraryIds: string[];
  // For "Recently Updated" sort
  contentUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get promoted collections for grid display with filtering support.
 * Filters are applied based on derived/override metadata.
 * Collections are returned with library IDs for library filtering.
 */
export async function getPromotedCollectionsForGrid(
  userId: string,
  filters: PromotedCollectionGridFilters = {}
): Promise<PromotedCollectionForGrid[]> {
  const db = getDatabase();

  // Get promoted collections with their items
  const collections = await db.collection.findMany({
    where: {
      userId,
      isPromoted: true,
    },
    orderBy: [{ promotedOrder: 'asc' }, { name: 'asc' }],
    include: {
      items: {
        where: { isAvailable: true },
        orderBy: { position: 'asc' },
      },
    },
  });

  // Transform and filter collections
  const result: PromotedCollectionForGrid[] = [];

  for (const collection of collections) {
    // Get series IDs and file IDs from collection items
    const seriesIds = collection.items
      .filter((item) => item.seriesId !== null)
      .map((item) => item.seriesId!);

    const fileIds = collection.items
      .filter((item) => item.fileId !== null)
      .map((item) => item.fileId!);

    // Fetch series data
    const seriesItems = seriesIds.length > 0
      ? await db.series.findMany({
          where: { id: { in: seriesIds } },
          select: {
            id: true,
            name: true,
            publisher: true,
            startYear: true,
            endYear: true,
            genres: true,
            coverHash: true,
            coverUrl: true,
            coverFileId: true,
            updatedAt: true,
            _count: { select: { issues: true } },
            // Include first issue for library filtering and cover fallback
            issues: {
              select: { id: true, libraryId: true, coverHash: true },
              take: 1,
              orderBy: [
                { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
                { filename: 'asc' },
              ],
            },
          },
        })
      : [];

    // Fetch file data
    const fileItems = fileIds.length > 0
      ? await db.comicFile.findMany({
          where: { id: { in: fileIds } },
          select: {
            id: true,
            libraryId: true,
            updatedAt: true,
            metadata: {
              select: {
                publisher: true,
                year: true,
                genre: true,
              },
            },
          },
        })
      : [];

    // Calculate derived metadata from series
    const publishers = seriesItems
      .map(s => s.publisher)
      .filter((p): p is string => !!p);
    const mostCommonPublisher = publishers.length > 0
      ? getMostCommon(publishers)
      : null;

    const years = seriesItems
      .map(s => s.startYear)
      .filter((y): y is number => y !== null);
    const minYear = years.length > 0 ? Math.min(...years) : null;

    const endYears = seriesItems
      .map(s => s.endYear)
      .filter((y): y is number => y !== null);
    const maxYear = endYears.length > 0 ? Math.max(...endYears) : null;

    const allGenres = seriesItems
      .flatMap(s => (s.genres || '').split(',').map(g => g.trim()))
      .filter(g => g.length > 0);
    const uniqueGenres = [...new Set(allGenres)].slice(0, 5).join(', ');

    // Effective metadata (override takes precedence)
    // Default publisher to "Collections" if not derived or overridden
    const effectivePublisher = collection.overridePublisher ?? mostCommonPublisher ?? 'Collections';
    const effectiveStartYear = collection.overrideStartYear ?? minYear;
    const effectiveEndYear = collection.overrideEndYear ?? maxYear;
    const effectiveGenres = collection.overrideGenres ?? (uniqueGenres || null);

    // Calculate aggregate issue count
    const totalIssues = seriesItems.reduce(
      (sum, s) => sum + (s._count?.issues || 0),
      0
    ) + fileItems.length; // Each file counts as 1 issue

    // Calculate read count for this user
    let readIssues = 0;
    const seriesIdsForProgress = seriesItems.map(s => s.id);
    if (seriesIdsForProgress.length > 0) {
      const progressRecords = await db.seriesProgress.findMany({
        where: {
          userId,
          seriesId: { in: seriesIdsForProgress },
        },
        select: { totalRead: true },
      });
      readIssues = progressRecords.reduce((sum, p) => sum + p.totalRead, 0);
    }

    // Count read files
    if (fileItems.length > 0) {
      const readFileIds = fileItems.map(f => f.id);
      const readFiles = await db.userReadingProgress.count({
        where: {
          userId,
          fileId: { in: readFileIds },
          completed: true,
        },
      });
      readIssues += readFiles;
    }

    // Collect library IDs from series and files
    const libraryIds = new Set<string>();
    for (const series of seriesItems) {
      if (series.issues?.[0]?.libraryId) {
        libraryIds.add(series.issues[0].libraryId);
      }
    }
    for (const file of fileItems) {
      libraryIds.add(file.libraryId);
    }

    // Find the most recent update time
    let contentUpdatedAt: Date | null = null;
    for (const series of seriesItems) {
      if (!contentUpdatedAt || series.updatedAt > contentUpdatedAt) {
        contentUpdatedAt = series.updatedAt;
      }
    }
    for (const file of fileItems) {
      if (!contentUpdatedAt || file.updatedAt > contentUpdatedAt) {
        contentUpdatedAt = file.updatedAt;
      }
    }

    // Apply filters
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!collection.name.toLowerCase().includes(searchLower)) {
        continue; // Skip this collection
      }
    }

    // Publisher filter
    if (filters.publisher && effectivePublisher !== filters.publisher) {
      continue;
    }

    // Type filter (only applies if collection has series - file-only collections pass)
    // Note: Collections don't have a type field, so we skip this filter
    // or could check if majority of series match the type

    // Genres filter (must match ALL selected genres)
    if (filters.genres && filters.genres.length > 0) {
      const collectionGenres = (effectiveGenres || '')
        .split(',')
        .map(g => g.trim().toLowerCase())
        .filter(g => g.length > 0);

      const hasAllGenres = filters.genres.every(g =>
        collectionGenres.some(cg => cg.includes(g.toLowerCase()))
      );
      if (!hasAllGenres) {
        continue;
      }
    }

    // Has unread filter (any unread content)
    if (filters.hasUnread !== undefined) {
      const hasUnreadContent = readIssues < totalIssues;
      if (filters.hasUnread !== hasUnreadContent) {
        continue;
      }
    }

    // Library filter (any content from selected library)
    if (filters.libraryId && !libraryIds.has(filters.libraryId)) {
      continue;
    }

    // Get cover series info for mosaic
    const seriesCovers = seriesItems.slice(0, 6).map(s => ({
      id: s.id,
      coverHash: s.coverHash,
      coverUrl: s.coverUrl,
      coverFileId: s.coverFileId,
      name: s.name,
      firstIssueId: s.issues[0]?.id ?? null,
      firstIssueCoverHash: s.issues[0]?.coverHash ?? null,
    }));

    result.push({
      id: collection.id,
      userId: collection.userId,
      name: collection.name,
      description: collection.description,
      isPromoted: collection.isPromoted,
      promotedOrder: collection.promotedOrder,
      coverType: collection.coverType,
      coverSeriesId: collection.coverSeriesId,
      coverFileId: collection.coverFileId,
      coverHash: collection.coverHash,
      publisher: effectivePublisher,
      startYear: effectiveStartYear,
      endYear: effectiveEndYear,
      genres: effectiveGenres,
      totalIssues,
      readIssues,
      seriesCount: seriesItems.length,
      seriesCovers,
      libraryIds: Array.from(libraryIds),
      contentUpdatedAt,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    });
  }

  return result;
}

/**
 * Helper to get the most common value in an array.
 */
function getMostCommon<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;

  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  let maxCount = 0;
  let mostCommon: T | null = null;
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = item;
    }
  }

  return mostCommon;
}

/**
 * Recalculate derived metadata for a collection.
 * Call this when items are added/removed from the collection.
 * Updates: derivedPublisher, derivedStartYear, derivedEndYear, derivedGenres,
 *          derivedIssueCount, derivedReadCount, contentUpdatedAt, metadataUpdatedAt
 */
export async function recalculateCollectionMetadata(
  collectionId: string,
  userId: string
): Promise<void> {
  const db = getDatabase();

  // Get all items in the collection
  const items = await db.collectionItem.findMany({
    where: {
      collectionId,
      isAvailable: true,
    },
  });

  // Get series IDs and file IDs
  const seriesIds = items
    .filter((item) => item.seriesId !== null)
    .map((item) => item.seriesId!);

  const fileIds = items
    .filter((item) => item.fileId !== null)
    .map((item) => item.fileId!);

  // Fetch series data
  const seriesItems = seriesIds.length > 0
    ? await db.series.findMany({
        where: { id: { in: seriesIds } },
        select: {
          id: true,
          publisher: true,
          startYear: true,
          endYear: true,
          genres: true,
          tags: true,
          updatedAt: true,
          _count: { select: { issues: true } },
        },
      })
    : [];

  // Fetch file data
  const fileItems = fileIds.length > 0
    ? await db.comicFile.findMany({
        where: { id: { in: fileIds } },
        select: {
          id: true,
          updatedAt: true,
          metadata: {
            select: {
              publisher: true,
              year: true,
              genre: true,
            },
          },
        },
      })
    : [];

  // Calculate derived publisher
  const publishers = seriesItems
    .map(s => s.publisher)
    .filter((p): p is string => !!p);

  // Also include file publishers
  for (const f of fileItems) {
    if (f.metadata?.publisher) {
      publishers.push(f.metadata.publisher);
    }
  }

  const derivedPublisher = getMostCommon(publishers);

  // Calculate derived years
  const startYears = seriesItems
    .map(s => s.startYear)
    .filter((y): y is number => y !== null);

  // Also include file years
  for (const f of fileItems) {
    if (f.metadata?.year) {
      startYears.push(f.metadata.year);
    }
  }

  const derivedStartYear = startYears.length > 0 ? Math.min(...startYears) : null;

  const endYears = seriesItems
    .map(s => s.endYear)
    .filter((y): y is number => y !== null);
  const derivedEndYear = endYears.length > 0 ? Math.max(...endYears) : null;

  // Calculate derived genres
  const allGenres = seriesItems
    .flatMap(s => (s.genres || '').split(',').map(g => g.trim()))
    .filter(g => g.length > 0);

  // Also include file genres
  for (const f of fileItems) {
    if (f.metadata?.genre) {
      allGenres.push(...f.metadata.genre.split(',').map(g => g.trim()).filter(g => g.length > 0));
    }
  }

  const uniqueGenres = [...new Set(allGenres)];
  const derivedGenres = uniqueGenres.length > 0 ? uniqueGenres.join(', ') : null;

  // Calculate derived tags from child series
  const allTags = seriesItems
    .flatMap(s => (s.tags || '').split(',').map(t => t.trim()))
    .filter(t => t.length > 0);

  const uniqueTags = [...new Set(allTags)];
  const derivedTags = uniqueTags.length > 0 ? uniqueTags.join(', ') : null;

  // Calculate issue counts
  const derivedIssueCount = seriesItems.reduce(
    (sum, s) => sum + (s._count?.issues || 0),
    0
  ) + fileItems.length;

  // Calculate read count
  let derivedReadCount = 0;

  // Use existing seriesIds from earlier query
  if (seriesIds.length > 0) {
    const progressRecords = await db.seriesProgress.findMany({
      where: {
        userId,
        seriesId: { in: seriesIds },
      },
      select: { totalRead: true },
    });
    derivedReadCount = progressRecords.reduce((sum, p) => sum + p.totalRead, 0);
  }

  if (fileIds.length > 0) {
    const readFiles = await db.userReadingProgress.count({
      where: {
        userId,
        fileId: { in: fileIds },
        completed: true,
      },
    });
    derivedReadCount += readFiles;
  }

  // Find most recent content update
  let contentUpdatedAt: Date | null = null;
  for (const s of seriesItems) {
    if (!contentUpdatedAt || s.updatedAt > contentUpdatedAt) {
      contentUpdatedAt = s.updatedAt;
    }
  }
  for (const f of fileItems) {
    if (!contentUpdatedAt || f.updatedAt > contentUpdatedAt) {
      contentUpdatedAt = f.updatedAt;
    }
  }

  // Update the collection
  await db.collection.update({
    where: { id: collectionId },
    data: {
      derivedPublisher,
      derivedStartYear,
      derivedEndYear,
      derivedGenres,
      derivedTags,
      derivedIssueCount,
      derivedReadCount,
      contentUpdatedAt,
      metadataUpdatedAt: new Date(),
    },
  });
}

/**
 * Toggle collection promotion status.
 */
export async function toggleCollectionPromotion(
  userId: string,
  collectionId: string
): Promise<Collection> {
  const db = getDatabase();

  // Verify ownership
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  // If promoting, get the next order
  let promotedOrder: number | null = null;
  if (!collection.isPromoted) {
    const maxOrder = await db.collection.findFirst({
      where: { userId, isPromoted: true },
      orderBy: { promotedOrder: 'desc' },
      select: { promotedOrder: true },
    });
    promotedOrder = (maxOrder?.promotedOrder ?? -1) + 1;
  }

  const updated = await db.collection.update({
    where: { id: collectionId },
    data: {
      isPromoted: !collection.isPromoted,
      promotedOrder: !collection.isPromoted ? promotedOrder : null,
    },
  });

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    description: updated.description,
    deck: updated.deck,
    isSystem: updated.isSystem,
    systemKey: updated.systemKey,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    isPromoted: updated.isPromoted,
    promotedOrder: updated.promotedOrder,
    coverType: updated.coverType as 'auto' | 'series' | 'issue' | 'custom' | undefined,
    coverSeriesId: updated.coverSeriesId,
    coverFileId: updated.coverFileId,
    coverHash: updated.coverHash,
    derivedPublisher: updated.derivedPublisher,
    derivedStartYear: updated.derivedStartYear,
    derivedEndYear: updated.derivedEndYear,
    derivedGenres: updated.derivedGenres,
    derivedTags: updated.derivedTags,
    derivedIssueCount: updated.derivedIssueCount,
    derivedReadCount: updated.derivedReadCount,
    overridePublisher: updated.overridePublisher,
    overrideStartYear: updated.overrideStartYear,
    overrideEndYear: updated.overrideEndYear,
    overrideGenres: updated.overrideGenres,
    // Lock flags
    lockName: updated.lockName,
    lockDeck: updated.lockDeck,
    lockDescription: updated.lockDescription,
    lockPublisher: updated.lockPublisher,
    lockStartYear: updated.lockStartYear,
    lockEndYear: updated.lockEndYear,
    lockGenres: updated.lockGenres,
    // New fields
    rating: updated.rating,
    notes: updated.notes,
    visibility: updated.visibility,
    readingMode: updated.readingMode,
    tags: updated.tags,
  };
}

/**
 * Update collection cover source.
 */
export async function updateCollectionCover(
  userId: string,
  collectionId: string,
  coverType: 'auto' | 'series' | 'issue' | 'custom',
  sourceId?: string
): Promise<Collection> {
  const db = getDatabase();

  // Verify ownership
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  const updateData: any = {
    coverType,
    coverSeriesId: null,
    coverFileId: null,
    coverHash: null,
  };

  if (coverType === 'series' && sourceId) {
    updateData.coverSeriesId = sourceId;
  } else if (coverType === 'issue' && sourceId) {
    updateData.coverFileId = sourceId;
  }

  const updated = await db.collection.update({
    where: { id: collectionId },
    data: updateData,
  });

  // If switching to 'auto' mode, regenerate the mosaic
  if (coverType === 'auto') {
    scheduleMosaicRegeneration(collectionId);
  }

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    description: updated.description,
    deck: updated.deck,
    isSystem: updated.isSystem,
    systemKey: updated.systemKey,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    // Lock flags
    lockName: updated.lockName,
    lockDeck: updated.lockDeck,
    lockDescription: updated.lockDescription,
    lockPublisher: updated.lockPublisher,
    lockStartYear: updated.lockStartYear,
    lockEndYear: updated.lockEndYear,
    lockGenres: updated.lockGenres,
    // New fields
    rating: updated.rating,
    notes: updated.notes,
    visibility: updated.visibility,
    readingMode: updated.readingMode,
    tags: updated.tags,
  };
}

/**
 * Set custom cover hash for a collection.
 */
export async function setCollectionCoverHash(
  userId: string,
  collectionId: string,
  coverHash: string
): Promise<Collection> {
  const db = getDatabase();

  // Verify ownership
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  const updated = await db.collection.update({
    where: { id: collectionId },
    data: {
      coverType: 'custom',
      coverHash,
      coverSeriesId: null,
      coverFileId: null,
    },
  });

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    description: updated.description,
    deck: updated.deck,
    isSystem: updated.isSystem,
    systemKey: updated.systemKey,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    // Lock flags
    lockName: updated.lockName,
    lockDeck: updated.lockDeck,
    lockDescription: updated.lockDescription,
    lockPublisher: updated.lockPublisher,
    lockStartYear: updated.lockStartYear,
    lockEndYear: updated.lockEndYear,
    lockGenres: updated.lockGenres,
    // New fields
    rating: updated.rating,
    notes: updated.notes,
    visibility: updated.visibility,
    readingMode: updated.readingMode,
    tags: updated.tags,
  };
}

/**
 * Update collection metadata overrides.
 */
export async function updateCollectionMetadata(
  userId: string,
  collectionId: string,
  metadata: {
    overridePublisher?: string | null;
    overrideStartYear?: number | null;
    overrideEndYear?: number | null;
    overrideGenres?: string | null;
  }
): Promise<Collection> {
  const db = getDatabase();

  // Verify ownership
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  const updated = await db.collection.update({
    where: { id: collectionId },
    data: {
      overridePublisher: metadata.overridePublisher,
      overrideStartYear: metadata.overrideStartYear,
      overrideEndYear: metadata.overrideEndYear,
      overrideGenres: metadata.overrideGenres,
      metadataUpdatedAt: new Date(),
    },
  });

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    description: updated.description,
    deck: updated.deck,
    isSystem: updated.isSystem,
    systemKey: updated.systemKey,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    // Lock flags
    lockName: updated.lockName,
    lockDeck: updated.lockDeck,
    lockDescription: updated.lockDescription,
    lockPublisher: updated.lockPublisher,
    lockStartYear: updated.lockStartYear,
    lockEndYear: updated.lockEndYear,
    lockGenres: updated.lockGenres,
    // New fields
    rating: updated.rating,
    notes: updated.notes,
    visibility: updated.visibility,
    readingMode: updated.readingMode,
    tags: updated.tags,
  };
}

/**
 * Get aggregate reading progress for a collection.
 */
export async function getCollectionReadingProgress(
  userId: string,
  collectionId: string
): Promise<{ totalIssues: number; readIssues: number }> {
  const db = getDatabase();

  // Verify ownership and get series items
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
    include: {
      items: {
        where: {
          seriesId: { not: null },
          isAvailable: true,
        },
        select: {
          seriesId: true,
        },
      },
    },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  const seriesIds = collection.items
    .map((item) => item.seriesId)
    .filter((id): id is string => id !== null);

  if (seriesIds.length === 0) {
    return { totalIssues: 0, readIssues: 0 };
  }

  // Get issue counts for all series
  const issueCountResult = await db.comicFile.count({
    where: { seriesId: { in: seriesIds } },
  });

  // Get read counts from series progress
  const progressRecords = await db.seriesProgress.findMany({
    where: {
      userId,
      seriesId: { in: seriesIds },
    },
    select: { totalRead: true },
  });

  const readIssues = progressRecords.reduce((sum, p) => sum + p.totalRead, 0);

  return {
    totalIssues: issueCountResult,
    readIssues,
  };
}

// =============================================================================
// Collection Detail Expanded Data
// =============================================================================

/**
 * Issue data for collection detail page
 */
export interface ExpandedIssue {
  id: string;
  filename: string;
  relativePath: string;
  size: number;
  seriesId: string;
  seriesName: string;
  collectionPosition: number;
  createdAt: string;
  metadata: {
    number: string | null;
    title: string | null;
    writer: string | null;
    year: number | null;
    publisher: string | null;
  } | null;
  readingProgress: {
    currentPage: number;
    totalPages: number;
    completed: boolean;
    lastReadAt: string | null;
    rating: number | null;
  } | null;
  externalRating: number | null;
}

/**
 * Aggregate stats for collection
 */
export interface CollectionAggregateStats {
  totalIssues: number;
  readIssues: number;
  inProgressIssues: number;
  totalPages: number;
  pagesRead: number;
  seriesCount: number;
}

/**
 * Next issue info for continue reading
 */
export interface CollectionNextIssue {
  fileId: string;
  filename: string;
  seriesId: string;
  seriesName: string;
}

/**
 * Full expanded collection response
 */
export interface CollectionExpandedData {
  collection: CollectionWithItems;
  expandedIssues: ExpandedIssue[];
  aggregateStats: CollectionAggregateStats;
  nextIssue: CollectionNextIssue | null;
}

/**
 * Get expanded collection data with all issues, stats, and next issue.
 * This fetches all data in one request for better performance.
 */
export async function getCollectionExpanded(
  userId: string,
  collectionId: string,
  sortOptions?: { sortBy?: SortField; sortOrder?: SortOrder }
): Promise<CollectionExpandedData | null> {
  const db = getDatabase();

  // Get collection with items (need full collection data for smart filter)
  const fullCollection = await db.collection.findFirst({
    where: { id: collectionId, userId },
    include: {
      items: {
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!fullCollection) {
    return null;
  }

  // Get the formatted collection for the response
  const collection = await getCollection(userId, collectionId);
  if (!collection) {
    return null;
  }

  // Determine effective sort options
  let effectiveSortBy = sortOptions?.sortBy;
  let effectiveSortOrder: SortOrder = sortOptions?.sortOrder ?? 'asc';

  // If collection is smart, parse filter definition for sort options
  if (fullCollection.isSmart && fullCollection.filterDefinition && !sortOptions?.sortBy) {
    try {
      const filter = JSON.parse(fullCollection.filterDefinition) as SmartFilter;
      if (filter.sortBy) {
        effectiveSortBy = filter.sortBy;
        effectiveSortOrder = filter.sortOrder ?? 'asc';
      }
    } catch {
      // Ignore parse errors, use default sorting
    }
  }

  // Collect series IDs and individual file IDs
  const seriesIds: string[] = [];
  const fileIds: string[] = [];

  for (const item of collection.items) {
    if (item.seriesId) {
      seriesIds.push(item.seriesId);
    }
    if (item.fileId) {
      fileIds.push(item.fileId);
    }
  }

  // Fetch all issues for all series in one query
  const [allSeriesIssues, individualFiles] = await Promise.all([
    seriesIds.length > 0
      ? db.comicFile.findMany({
          where: { seriesId: { in: seriesIds } },
          include: {
            metadata: {
              select: {
                number: true,
                title: true,
                writer: true,
                year: true,
                publisher: true,
              },
            },
            userReadingProgress: {
              where: { userId },
              select: {
                currentPage: true,
                totalPages: true,
                completed: true,
                lastReadAt: true,
                rating: true,
              },
            },
            series: {
              select: {
                name: true,
              },
            },
            externalRatings: {
              select: {
                ratingValue: true,
              },
              take: 1,
              orderBy: { ratingValue: 'desc' },
            },
          },
          orderBy: [
            { seriesId: 'asc' },
            { filename: 'asc' },
          ],
        })
      : [],
    fileIds.length > 0
      ? db.comicFile.findMany({
          where: { id: { in: fileIds } },
          include: {
            metadata: {
              select: {
                number: true,
                title: true,
                writer: true,
                year: true,
                publisher: true,
              },
            },
            userReadingProgress: {
              where: { userId },
              select: {
                currentPage: true,
                totalPages: true,
                completed: true,
                lastReadAt: true,
                rating: true,
              },
            },
            series: {
              select: {
                name: true,
              },
            },
            externalRatings: {
              select: {
                ratingValue: true,
              },
              take: 1,
              orderBy: { ratingValue: 'desc' },
            },
          },
        })
      : [],
  ]);

  // Create a map of seriesId -> position for sorting
  const seriesPositionMap = new Map<string, number>();
  for (const item of collection.items) {
    if (item.seriesId && !seriesPositionMap.has(item.seriesId)) {
      seriesPositionMap.set(item.seriesId, item.position);
    }
  }

  // Create a map of fileId -> position for individual files
  const filePositionMap = new Map<string, number>();
  for (const item of collection.items) {
    if (item.fileId) {
      filePositionMap.set(item.fileId, item.position);
    }
  }

  // Parse issue number for sorting
  const parseIssueNum = (num: string | null | undefined): number => {
    if (!num) return Infinity;
    const parsed = parseFloat(num);
    return isNaN(parsed) ? Infinity : parsed;
  };

  // Transform and combine issues
  const expandedIssues: ExpandedIssue[] = [];

  // Add series issues
  for (const issue of allSeriesIssues) {
    const progress = issue.userReadingProgress[0] ?? null;
    const topRating = issue.externalRatings?.[0]?.ratingValue ?? null;
    expandedIssues.push({
      id: issue.id,
      filename: issue.filename,
      relativePath: issue.relativePath,
      size: Number(issue.size),
      seriesId: issue.seriesId!,
      seriesName: issue.series?.name ?? 'Unknown Series',
      collectionPosition: seriesPositionMap.get(issue.seriesId!) ?? 999,
      createdAt: issue.createdAt.toISOString(),
      metadata: issue.metadata ? {
        number: issue.metadata.number,
        title: issue.metadata.title,
        writer: issue.metadata.writer,
        year: issue.metadata.year,
        publisher: issue.metadata.publisher,
      } : null,
      readingProgress: progress ? {
        currentPage: progress.currentPage,
        totalPages: progress.totalPages,
        completed: progress.completed,
        lastReadAt: progress.lastReadAt?.toISOString() ?? null,
        rating: progress.rating,
      } : null,
      externalRating: topRating,
    });
  }

  // Add individual files
  for (const file of individualFiles) {
    const progress = file.userReadingProgress[0] ?? null;
    const topRating = file.externalRatings?.[0]?.ratingValue ?? null;
    expandedIssues.push({
      id: file.id,
      filename: file.filename,
      relativePath: file.relativePath,
      size: Number(file.size),
      seriesId: file.seriesId ?? '',
      seriesName: file.series?.name ?? 'Unknown Series',
      collectionPosition: filePositionMap.get(file.id) ?? 999,
      createdAt: file.createdAt.toISOString(),
      metadata: file.metadata ? {
        number: file.metadata.number,
        title: file.metadata.title,
        writer: file.metadata.writer,
        year: file.metadata.year,
        publisher: file.metadata.publisher,
      } : null,
      readingProgress: progress ? {
        currentPage: progress.currentPage,
        totalPages: progress.totalPages,
        completed: progress.completed,
        lastReadAt: progress.lastReadAt?.toISOString() ?? null,
        rating: progress.rating,
      } : null,
      externalRating: topRating,
    });
  }

  // Apply sorting
  if (effectiveSortBy) {
    // Custom sorting based on sortBy field
    expandedIssues.sort((a, b) => {
      let valueA: string | number | null;
      let valueB: string | number | null;

      switch (effectiveSortBy) {
        case 'name':
        case 'title':
          valueA = a.metadata?.title ?? a.filename;
          valueB = b.metadata?.title ?? b.filename;
          break;
        case 'year':
          valueA = a.metadata?.year ?? null;
          valueB = b.metadata?.year ?? null;
          break;
        case 'dateAdded':
          valueA = a.createdAt;
          valueB = b.createdAt;
          break;
        case 'lastReadAt':
          valueA = a.readingProgress?.lastReadAt ?? null;
          valueB = b.readingProgress?.lastReadAt ?? null;
          break;
        case 'number':
          valueA = parseIssueNum(a.metadata?.number);
          valueB = parseIssueNum(b.metadata?.number);
          break;
        case 'publisher':
          valueA = a.metadata?.publisher ?? '';
          valueB = b.metadata?.publisher ?? '';
          break;
        case 'rating':
          valueA = a.readingProgress?.rating ?? null;
          valueB = b.readingProgress?.rating ?? null;
          break;
        case 'externalRating':
          valueA = a.externalRating;
          valueB = b.externalRating;
          break;
        default:
          return 0;
      }

      // Handle null values (push to end)
      if (valueA === null && valueB === null) return 0;
      if (valueA === null) return 1;
      if (valueB === null) return -1;

      // Compare values
      let comparison = 0;
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        comparison = valueA.localeCompare(valueB);
      } else {
        comparison = (valueA as number) - (valueB as number);
      }

      return effectiveSortOrder === 'desc' ? -comparison : comparison;
    });
  } else {
    // Default: Sort by collection position, then by issue number
    expandedIssues.sort((a, b) => {
      if (a.collectionPosition !== b.collectionPosition) {
        return a.collectionPosition - b.collectionPosition;
      }
      // Within same series, sort by issue number
      const numA = parseIssueNum(a.metadata?.number);
      const numB = parseIssueNum(b.metadata?.number);
      if (numA !== numB) {
        return numA - numB;
      }
      // Fallback to filename
      return a.filename.localeCompare(b.filename);
    });
  }

  // Calculate aggregate stats
  let totalPages = 0;
  let pagesRead = 0;
  let readIssues = 0;
  let inProgressIssues = 0;

  for (const issue of expandedIssues) {
    const progress = issue.readingProgress;
    if (progress) {
      totalPages += progress.totalPages;
      if (progress.completed) {
        readIssues++;
        pagesRead += progress.totalPages;
      } else if (progress.currentPage > 0) {
        inProgressIssues++;
        pagesRead += progress.currentPage;
      }
    }
  }

  const aggregateStats: CollectionAggregateStats = {
    totalIssues: expandedIssues.length,
    readIssues,
    inProgressIssues,
    totalPages,
    pagesRead,
    seriesCount: new Set(expandedIssues.map((i) => i.seriesId).filter(Boolean)).size,
  };

  // Find next unread issue (following collection order)
  let nextIssue: CollectionNextIssue | null = null;
  for (const issue of expandedIssues) {
    const progress = issue.readingProgress;
    if (!progress?.completed) {
      nextIssue = {
        fileId: issue.id,
        filename: issue.filename,
        seriesId: issue.seriesId,
        seriesName: issue.seriesName,
      };
      break;
    }
  }

  return {
    collection,
    expandedIssues,
    aggregateStats,
    nextIssue,
  };
}

// =============================================================================
// Filter Preset Linking
// =============================================================================

/**
 * Link a collection to a filter preset
 * The collection will use the preset's filter instead of an embedded filter
 */
export async function linkCollectionToPreset(
  collectionId: string,
  userId: string,
  presetId: string
): Promise<Collection> {
  const db = getDatabase();

  // Verify collection exists and belongs to user
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  // Verify preset exists and is accessible (user's own or global)
  const preset = await db.filterPreset.findFirst({
    where: {
      id: presetId,
      OR: [{ userId }, { isGlobal: true }],
    },
  });

  if (!preset) {
    throw new Error('Preset not found or not accessible');
  }

  // Update collection to use preset
  const updated = await db.collection.update({
    where: { id: collectionId },
    data: {
      filterPresetId: presetId,
      filterDefinition: null, // Clear embedded filter
      isSmart: true,
    },
  });

  logger.info(`Linked collection ${collectionId} to preset ${presetId}`);

  return updated as unknown as Collection;
}

/**
 * Unlink a collection from its filter preset
 * Copies the preset's filter definition to the collection as an embedded filter
 */
export async function unlinkCollectionFromPreset(
  collectionId: string,
  userId: string
): Promise<Collection> {
  const db = getDatabase();

  // Get collection with its preset
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
    include: { filterPreset: true },
  });

  if (!collection) {
    throw new Error('Collection not found');
  }

  if (!collection.filterPresetId || !collection.filterPreset) {
    throw new Error('Collection is not linked to a preset');
  }

  // Copy preset's filter to embedded filter
  const updated = await db.collection.update({
    where: { id: collectionId },
    data: {
      filterPresetId: null,
      filterDefinition: collection.filterPreset.filterDefinition, // Copy filter
    },
  });

  logger.info(`Unlinked collection ${collectionId} from preset ${collection.filterPresetId}`);

  return updated as unknown as Collection;
}
