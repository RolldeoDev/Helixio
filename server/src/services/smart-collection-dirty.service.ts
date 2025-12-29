/**
 * Smart Collection Dirty Service
 *
 * Manages dirty flags for automatic smart collection updates.
 * When series/file metadata or reading progress changes, this service
 * marks affected smart collections for re-evaluation and processes them
 * with debouncing to batch rapid changes.
 */

import { getDatabase } from './database.service.js';
import { logError, logInfo, logDebug } from './logger.service.js';
import { evaluateChangedItems } from './smart-collection.service.js';

const SERVICE_NAME = 'smart-collection-dirty';

// =============================================================================
// Types
// =============================================================================

export type SmartCollectionDirtyReason =
  | 'series_metadata'
  | 'file_metadata'
  | 'reading_progress'
  | 'user_data'
  | 'item_deleted';

export interface SmartCollectionDirtyFlag {
  id: string;
  userId: string | null;
  seriesId: string | null;
  fileId: string | null;
  reason: string;
  createdAt: Date;
}

export interface MarkDirtyParams {
  userId?: string;        // If provided, only evaluate this user's collections
  seriesIds?: string[];   // Changed series
  fileIds?: string[];     // Changed files
  reason: SmartCollectionDirtyReason;
}

// =============================================================================
// Debounce State
// =============================================================================

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isProcessing = false;
const DEBOUNCE_MS = 1500; // 1.5 second debounce

// =============================================================================
// Dirty Flag Management
// =============================================================================

/**
 * Mark smart collections as needing re-evaluation
 *
 * @param params.userId - If provided, only evaluate this user's collections (for user-specific changes like reading progress)
 * @param params.seriesIds - Changed series IDs
 * @param params.fileIds - Changed file IDs
 * @param params.reason - Why the smart collections need re-evaluation
 */
export async function markSmartCollectionsDirty(params: MarkDirtyParams): Promise<void> {
  const db = getDatabase();
  const { userId, seriesIds, fileIds, reason } = params;

  try {
    // Create dirty flags for each changed item
    const flagsToCreate: Array<{
      userId: string | null;
      seriesId: string | null;
      fileId: string | null;
      reason: string;
    }> = [];

    // Add flags for series changes
    if (seriesIds && seriesIds.length > 0) {
      for (const seriesId of seriesIds) {
        flagsToCreate.push({
          userId: userId ?? null,
          seriesId,
          fileId: null,
          reason,
        });
      }
    }

    // Add flags for file changes
    if (fileIds && fileIds.length > 0) {
      for (const fileId of fileIds) {
        flagsToCreate.push({
          userId: userId ?? null,
          seriesId: null,
          fileId,
          reason,
        });
      }
    }

    // If no specific items, just create a general flag
    if (flagsToCreate.length === 0) {
      flagsToCreate.push({
        userId: userId ?? null,
        seriesId: null,
        fileId: null,
        reason,
      });
    }

    // Batch create flags
    await db.smartCollectionDirtyFlag.createMany({
      data: flagsToCreate,
    });

    logDebug(SERVICE_NAME, 'Marked smart collections dirty', {
      userId,
      seriesCount: seriesIds?.length ?? 0,
      fileCount: fileIds?.length ?? 0,
      reason,
    });

    // Trigger debounced processing
    triggerDebouncedProcessing();
  } catch (error) {
    logError(SERVICE_NAME, error, {
      operation: 'markSmartCollectionsDirty',
      userId,
      seriesIds,
      fileIds,
      reason,
    });
  }
}

/**
 * Get all pending dirty flags
 */
export async function getPendingDirtyFlags(): Promise<SmartCollectionDirtyFlag[]> {
  const db = getDatabase();

  const flags = await db.smartCollectionDirtyFlag.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return flags;
}

/**
 * Clear dirty flags by their IDs
 */
export async function clearDirtyFlags(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const db = getDatabase();

  await db.smartCollectionDirtyFlag.deleteMany({
    where: { id: { in: ids } },
  });
}

/**
 * Clear all dirty flags (used after processing)
 */
export async function clearAllDirtyFlags(): Promise<void> {
  const db = getDatabase();

  await db.smartCollectionDirtyFlag.deleteMany({});
}

// =============================================================================
// Processing
// =============================================================================

/**
 * Process all pending dirty flags
 * Groups flags by user and calls evaluateChangedItems for each
 */
export async function processSmartCollectionDirtyFlags(): Promise<{
  processed: number;
  usersUpdated: number;
}> {
  const db = getDatabase();

  const flags = await getPendingDirtyFlags();
  if (flags.length === 0) {
    return { processed: 0, usersUpdated: 0 };
  }

  logInfo(SERVICE_NAME, `Processing ${flags.length} smart collection dirty flags`);

  // Group flags by userId (null = ALL_USERS)
  const flagsByUser = new Map<string, SmartCollectionDirtyFlag[]>();
  const ALL_USERS_KEY = '__ALL_USERS__';

  for (const flag of flags) {
    const userKey = flag.userId ?? ALL_USERS_KEY;
    const existing = flagsByUser.get(userKey) ?? [];
    existing.push(flag);
    flagsByUser.set(userKey, existing);
  }

  let usersUpdated = 0;

  for (const [userKey, userFlags] of Array.from(flagsByUser.entries())) {
    // Collect unique series and file IDs
    const seriesIds = Array.from(new Set(userFlags.filter((f) => f.seriesId).map((f) => f.seriesId!)));
    const fileIds = Array.from(new Set(userFlags.filter((f) => f.fileId).map((f) => f.fileId!)));

    // Skip if no items to evaluate
    if (seriesIds.length === 0 && fileIds.length === 0) {
      continue;
    }

    try {
      if (userKey === ALL_USERS_KEY) {
        // Global change - evaluate for all users with smart collections
        const usersWithSmartCollections = await db.collection.findMany({
          where: { isSmart: true },
          select: { userId: true },
          distinct: ['userId'],
        });

        logDebug(SERVICE_NAME, `Global change: evaluating for ${usersWithSmartCollections.length} users`, {
          seriesCount: seriesIds.length,
          fileCount: fileIds.length,
        });

        for (const { userId } of usersWithSmartCollections) {
          try {
            await evaluateChangedItems(userId, seriesIds, fileIds);
            usersUpdated++;
          } catch (error) {
            logError(SERVICE_NAME, error, {
              operation: 'evaluateChangedItems',
              userId,
              seriesIds,
              fileIds,
            });
          }
        }
      } else {
        // User-specific change
        logDebug(SERVICE_NAME, `User-specific change: evaluating for user ${userKey}`, {
          seriesCount: seriesIds.length,
          fileCount: fileIds.length,
        });

        await evaluateChangedItems(userKey, seriesIds, fileIds);
        usersUpdated++;
      }
    } catch (error) {
      logError(SERVICE_NAME, error, {
        operation: 'processSmartCollectionDirtyFlags',
        userKey,
        seriesIds,
        fileIds,
      });
    }
  }

  // Clear all processed flags
  await clearDirtyFlags(flags.map((f) => f.id));

  logInfo(SERVICE_NAME, `Processed ${flags.length} dirty flags, updated ${usersUpdated} users`);

  return { processed: flags.length, usersUpdated };
}

// =============================================================================
// Debounced Processing
// =============================================================================

/**
 * Trigger debounced processing of dirty flags
 * Multiple rapid calls will be batched together
 */
export function triggerDebouncedProcessing(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;

    if (isProcessing) {
      // Already processing, schedule another run after current one completes
      logDebug(SERVICE_NAME, 'Processing already in progress, will re-trigger after completion');
      return;
    }

    isProcessing = true;
    try {
      await processSmartCollectionDirtyFlags();
    } catch (error) {
      logError(SERVICE_NAME, error, { operation: 'triggerDebouncedProcessing' });
    } finally {
      isProcessing = false;
    }

    // Check if more flags were added during processing
    const db = getDatabase();
    const remainingCount = await db.smartCollectionDirtyFlag.count();
    if (remainingCount > 0) {
      logDebug(SERVICE_NAME, `${remainingCount} new flags added during processing, triggering another run`);
      triggerDebouncedProcessing();
    }
  }, DEBOUNCE_MS);
}

/**
 * Force immediate processing (bypasses debounce)
 * Useful for testing or when immediate updates are required
 */
export async function processImmediately(): Promise<{
  processed: number;
  usersUpdated: number;
}> {
  // Cancel any pending debounced processing
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // Wait for any current processing to complete
  while (isProcessing) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  isProcessing = true;
  try {
    return await processSmartCollectionDirtyFlags();
  } finally {
    isProcessing = false;
  }
}

// =============================================================================
// Startup / Shutdown
// =============================================================================

let startupInterval: ReturnType<typeof setInterval> | null = null;
const FALLBACK_INTERVAL_MS = 30000; // 30 seconds fallback interval

/**
 * Start the smart collection processor
 * Sets up a fallback interval in case debounced processing misses any flags
 */
export function startSmartCollectionProcessor(): void {
  logInfo(SERVICE_NAME, 'Starting smart collection dirty processor');

  // Process any flags that may have accumulated before startup
  processSmartCollectionDirtyFlags().catch((error) => {
    logError(SERVICE_NAME, error, { operation: 'startupProcessing' });
  });

  // Set up fallback interval processing
  startupInterval = setInterval(async () => {
    // Only process if not already processing from debounce
    if (!isProcessing && !debounceTimer) {
      const db = getDatabase();
      const count = await db.smartCollectionDirtyFlag.count();
      if (count > 0) {
        logDebug(SERVICE_NAME, `Fallback interval: processing ${count} stale flags`);
        processSmartCollectionDirtyFlags().catch((error) => {
          logError(SERVICE_NAME, error, { operation: 'fallbackIntervalProcessing' });
        });
      }
    }
  }, FALLBACK_INTERVAL_MS);
}

/**
 * Stop the smart collection processor
 */
export function stopSmartCollectionProcessor(): void {
  logInfo(SERVICE_NAME, 'Stopping smart collection dirty processor');

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (startupInterval) {
    clearInterval(startupInterval);
    startupInterval = null;
  }
}

// =============================================================================
// Testing Utilities
// =============================================================================

/**
 * Reset internal state (for testing)
 */
export function __resetForTesting(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (startupInterval) {
    clearInterval(startupInterval);
    startupInterval = null;
  }
  isProcessing = false;
}

/**
 * Check if processing is currently active (for testing)
 */
export function __isProcessing(): boolean {
  return isProcessing;
}

/**
 * Check if debounce timer is active (for testing)
 */
export function __hasDebounceTimer(): boolean {
  return debounceTimer !== null;
}
