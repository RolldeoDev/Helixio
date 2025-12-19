/**
 * Reading Queue Service
 *
 * Manages a reading queue for sequential comic reading:
 * - Add/remove comics to queue
 * - Reorder queue items
 * - Auto-advance to next item
 * - Get queue status
 */

import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export interface QueueItem {
  id: string;
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  position: number;
  addedAt: Date;
  // Optional progress info
  currentPage?: number;
  totalPages?: number;
  progress?: number;
}

export interface QueueStatus {
  items: QueueItem[];
  totalCount: number;
  nextUp: QueueItem | null;
}

// =============================================================================
// Queue CRUD
// =============================================================================

/**
 * Get all items in the reading queue
 */
export async function getQueue(): Promise<QueueStatus> {
  const db = getDatabase();

  const items = await db.readingQueue.findMany({
    orderBy: { position: 'asc' },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          relativePath: true,
          libraryId: true,
          readingProgress: {
            select: {
              currentPage: true,
              totalPages: true,
            },
          },
        },
      },
    },
  });

  const queueItems: QueueItem[] = items.map((item) => ({
    id: item.id,
    fileId: item.file.id,
    filename: item.file.filename,
    relativePath: item.file.relativePath,
    libraryId: item.file.libraryId,
    position: item.position,
    addedAt: item.addedAt,
    currentPage: item.file.readingProgress?.currentPage,
    totalPages: item.file.readingProgress?.totalPages,
    progress: item.file.readingProgress?.totalPages
      ? Math.round((item.file.readingProgress.currentPage / item.file.readingProgress.totalPages) * 100)
      : undefined,
  }));

  return {
    items: queueItems,
    totalCount: queueItems.length,
    nextUp: queueItems.length > 0 ? queueItems[0]! : null,
  };
}

/**
 * Add a file to the reading queue
 * By default, adds to the end of the queue
 */
export async function addToQueue(fileId: string, position?: number): Promise<QueueItem> {
  const db = getDatabase();

  // Verify file exists
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      readingProgress: {
        select: {
          currentPage: true,
          totalPages: true,
        },
      },
    },
  });

  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  // Check if already in queue
  const existing = await db.readingQueue.findUnique({
    where: { fileId },
  });

  if (existing) {
    throw new Error('File is already in the reading queue');
  }

  // Get the next position if not specified
  let targetPosition = position;
  if (targetPosition === undefined) {
    const lastItem = await db.readingQueue.findFirst({
      orderBy: { position: 'desc' },
    });
    targetPosition = (lastItem?.position ?? -1) + 1;
  } else {
    // Shift existing items to make room
    await db.readingQueue.updateMany({
      where: { position: { gte: targetPosition } },
      data: { position: { increment: 1 } },
    });
  }

  const queueItem = await db.readingQueue.create({
    data: {
      fileId,
      position: targetPosition,
    },
  });

  return {
    id: queueItem.id,
    fileId: file.id,
    filename: file.filename,
    relativePath: file.relativePath,
    libraryId: file.libraryId,
    position: queueItem.position,
    addedAt: queueItem.addedAt,
    currentPage: file.readingProgress?.currentPage,
    totalPages: file.readingProgress?.totalPages,
    progress: file.readingProgress?.totalPages
      ? Math.round((file.readingProgress.currentPage / file.readingProgress.totalPages) * 100)
      : undefined,
  };
}

/**
 * Add multiple files to the queue
 */
export async function addManyToQueue(fileIds: string[]): Promise<QueueItem[]> {
  const results: QueueItem[] = [];

  for (const fileId of fileIds) {
    try {
      const item = await addToQueue(fileId);
      results.push(item);
    } catch {
      // Skip files that are already in queue or don't exist
    }
  }

  return results;
}

/**
 * Remove a file from the reading queue
 */
export async function removeFromQueue(fileId: string): Promise<void> {
  const db = getDatabase();

  const item = await db.readingQueue.findUnique({
    where: { fileId },
  });

  if (!item) {
    return; // Not in queue, nothing to do
  }

  await db.readingQueue.delete({
    where: { fileId },
  });

  // Renumber remaining items to close the gap
  await db.$executeRaw`
    UPDATE ReadingQueue
    SET position = position - 1
    WHERE position > ${item.position}
  `;
}

/**
 * Clear the entire reading queue
 */
export async function clearQueue(): Promise<void> {
  const db = getDatabase();
  await db.readingQueue.deleteMany({});
}

/**
 * Check if a file is in the queue
 */
export async function isInQueue(fileId: string): Promise<boolean> {
  const db = getDatabase();

  const item = await db.readingQueue.findUnique({
    where: { fileId },
  });

  return item !== null;
}

/**
 * Get the position of a file in the queue (null if not in queue)
 */
export async function getQueuePosition(fileId: string): Promise<number | null> {
  const db = getDatabase();

  const item = await db.readingQueue.findUnique({
    where: { fileId },
  });

  return item?.position ?? null;
}

// =============================================================================
// Queue Reordering
// =============================================================================

/**
 * Move an item to a new position in the queue
 */
export async function moveInQueue(fileId: string, newPosition: number): Promise<void> {
  const db = getDatabase();

  const item = await db.readingQueue.findUnique({
    where: { fileId },
  });

  if (!item) {
    throw new Error('File is not in the reading queue');
  }

  const oldPosition = item.position;

  if (oldPosition === newPosition) {
    return; // Nothing to do
  }

  // Shift items between old and new positions
  if (newPosition < oldPosition) {
    // Moving up - shift items down
    await db.$executeRaw`
      UPDATE ReadingQueue
      SET position = position + 1
      WHERE position >= ${newPosition} AND position < ${oldPosition}
    `;
  } else {
    // Moving down - shift items up
    await db.$executeRaw`
      UPDATE ReadingQueue
      SET position = position - 1
      WHERE position > ${oldPosition} AND position <= ${newPosition}
    `;
  }

  // Update the moved item
  await db.readingQueue.update({
    where: { fileId },
    data: { position: newPosition },
  });
}

/**
 * Reorder the entire queue by providing an ordered list of file IDs
 */
export async function reorderQueue(fileIds: string[]): Promise<void> {
  const db = getDatabase();

  // Update each item's position
  await db.$transaction(
    fileIds.map((fileId, index) =>
      db.readingQueue.update({
        where: { fileId },
        data: { position: index },
      })
    )
  );
}

/**
 * Move an item to the front of the queue (position 0)
 */
export async function moveToFront(fileId: string): Promise<void> {
  await moveInQueue(fileId, 0);
}

/**
 * Move an item to the end of the queue
 */
export async function moveToEnd(fileId: string): Promise<void> {
  const db = getDatabase();

  const lastItem = await db.readingQueue.findFirst({
    orderBy: { position: 'desc' },
  });

  if (lastItem) {
    await moveInQueue(fileId, lastItem.position);
  }
}

// =============================================================================
// Queue Navigation
// =============================================================================

/**
 * Get the next item in the queue (position 0)
 */
export async function getNextInQueue(): Promise<QueueItem | null> {
  const db = getDatabase();

  const item = await db.readingQueue.findFirst({
    where: { position: 0 },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          relativePath: true,
          libraryId: true,
          readingProgress: {
            select: {
              currentPage: true,
              totalPages: true,
            },
          },
        },
      },
    },
  });

  if (!item) return null;

  return {
    id: item.id,
    fileId: item.file.id,
    filename: item.file.filename,
    relativePath: item.file.relativePath,
    libraryId: item.file.libraryId,
    position: item.position,
    addedAt: item.addedAt,
    currentPage: item.file.readingProgress?.currentPage,
    totalPages: item.file.readingProgress?.totalPages,
    progress: item.file.readingProgress?.totalPages
      ? Math.round((item.file.readingProgress.currentPage / item.file.readingProgress.totalPages) * 100)
      : undefined,
  };
}

/**
 * Pop the first item from the queue (removes it and returns the file ID)
 * Used when auto-advancing to the next comic
 */
export async function popFromQueue(): Promise<string | null> {
  const db = getDatabase();

  const item = await db.readingQueue.findFirst({
    where: { position: 0 },
  });

  if (!item) return null;

  await removeFromQueue(item.fileId);
  return item.fileId;
}

/**
 * Get the item after a specific file in the queue
 */
export async function getNextAfter(fileId: string): Promise<QueueItem | null> {
  const db = getDatabase();

  const currentItem = await db.readingQueue.findUnique({
    where: { fileId },
  });

  if (!currentItem) return null;

  const nextItem = await db.readingQueue.findFirst({
    where: { position: currentItem.position + 1 },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          relativePath: true,
          libraryId: true,
          readingProgress: {
            select: {
              currentPage: true,
              totalPages: true,
            },
          },
        },
      },
    },
  });

  if (!nextItem) return null;

  return {
    id: nextItem.id,
    fileId: nextItem.file.id,
    filename: nextItem.file.filename,
    relativePath: nextItem.file.relativePath,
    libraryId: nextItem.file.libraryId,
    position: nextItem.position,
    addedAt: nextItem.addedAt,
    currentPage: nextItem.file.readingProgress?.currentPage,
    totalPages: nextItem.file.readingProgress?.totalPages,
    progress: nextItem.file.readingProgress?.totalPages
      ? Math.round((nextItem.file.readingProgress.currentPage / nextItem.file.readingProgress.totalPages) * 100)
      : undefined,
  };
}
