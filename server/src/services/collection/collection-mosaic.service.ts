/**
 * Collection Mosaic Service
 *
 * Handles mosaic cover generation for collections.
 * Includes debounced regeneration and series cover change handlers.
 */

import { getDatabase } from '../database.service.js';
import {
  generateCollectionMosaicCover,
  saveCollectionMosaicCover,
  deleteCollectionCover,
  type SeriesCoverForMosaic,
} from '../cover.service.js';
import { logError, logDebug } from '../logger.service.js';

// =============================================================================
// Module State
// =============================================================================

/**
 * Pending mosaic regeneration jobs, keyed by collectionId.
 * Uses debouncing to avoid regenerating multiple times when items change rapidly.
 */
export const pendingMosaicJobs = new Map<string, NodeJS.Timeout>();

// =============================================================================
// Public Functions
// =============================================================================

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
export async function getFirst4SeriesIds(collectionId: string): Promise<string[]> {
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
