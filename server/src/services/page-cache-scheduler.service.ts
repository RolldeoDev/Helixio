/**
 * Page Cache Scheduler Service
 *
 * Manages background cleanup of expired page caches.
 * Runs periodic cleanup to remove caches that haven't been accessed
 * within the TTL period (default: 5 minutes).
 */

import { cleanupExpiredCaches, getCacheStats, DEFAULT_TTL_MINUTES, runSizeBasedEviction, getGlobalCacheSize, MAX_CACHE_SIZE } from './page-cache.service.js';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('page-cache-scheduler');

// =============================================================================
// Configuration
// =============================================================================

/** Interval for cleanup checks (5 minutes in ms) */
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// =============================================================================
// State
// =============================================================================

let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let lastCleanupRun: Date | null = null;

// =============================================================================
// Cleanup Job
// =============================================================================

/**
 * Run two-phase cleanup of page caches:
 * Phase 1: TTL-based cleanup (remove inactive files)
 * Phase 2: Size-based eviction (remove pages if over limit)
 */
export async function runCleanupJob(): Promise<{ filesDeleted: number; errors: number; bytesFreed: number }> {
  if (isProcessing) {
    logger.debug('Skipping cleanup - already processing');
    return { filesDeleted: 0, errors: 0, bytesFreed: 0 };
  }

  isProcessing = true;
  lastCleanupRun = new Date();

  try {
    logger.debug('Running two-phase cleanup job...');

    // Phase 1: TTL-based cleanup (delete inactive files)
    const ttlResult = await cleanupExpiredCaches(DEFAULT_TTL_MINUTES);

    if (ttlResult.filesDeleted > 0) {
      logger.info(
        { filesDeleted: ttlResult.filesDeleted, bytesFreedMB: Math.round(ttlResult.bytesFreed / 1024 / 1024), errors: ttlResult.errors },
        `Phase 1 (TTL): ${ttlResult.filesDeleted} cache(s) deleted, ${Math.round(ttlResult.bytesFreed / 1024 / 1024)}MB freed`
      );
    } else {
      logger.debug('Phase 1 (TTL): No expired caches to clean');
    }

    // Phase 2: Size-based eviction (if over limit)
    const cacheSize = getGlobalCacheSize();
    const sizeMB = cacheSize / 1024 / 1024;
    const limitMB = MAX_CACHE_SIZE / 1024 / 1024;

    logger.debug(`Current cache size: ${sizeMB.toFixed(2)}MB / ${limitMB.toFixed(2)}MB`);

    let sizeResult = { filesDeleted: 0, errors: 0, bytesFreed: 0 };

    if (cacheSize > MAX_CACHE_SIZE) {
      logger.info(`Phase 2 (Size): Cache over limit, starting eviction`);
      sizeResult = await runSizeBasedEviction();

      if (sizeResult.bytesFreed > 0) {
        logger.info(
          { filesDeleted: sizeResult.filesDeleted, bytesFreedMB: Math.round(sizeResult.bytesFreed / 1024 / 1024), errors: sizeResult.errors },
          `Phase 2 (Size): ${sizeResult.filesDeleted} cache(s) deleted, ${Math.round(sizeResult.bytesFreed / 1024 / 1024)}MB freed`
        );
      }
    } else {
      logger.debug('Phase 2 (Size): Cache within limit, no eviction needed');
    }

    // Combined results
    const combinedResult = {
      filesDeleted: ttlResult.filesDeleted + sizeResult.filesDeleted,
      errors: ttlResult.errors + sizeResult.errors,
      bytesFreed: ttlResult.bytesFreed + sizeResult.bytesFreed,
    };

    if (combinedResult.filesDeleted > 0 || combinedResult.bytesFreed > 0) {
      logger.info(
        { filesDeleted: combinedResult.filesDeleted, bytesFreedMB: Math.round(combinedResult.bytesFreed / 1024 / 1024), errors: combinedResult.errors },
        `Cleanup completed: ${combinedResult.filesDeleted} total cache(s) deleted, ${Math.round(combinedResult.bytesFreed / 1024 / 1024)}MB freed`
      );
    }

    return combinedResult;
  } catch (error) {
    logger.error({ error, action: 'cleanup-job' }, 'Error running cleanup job');
    return { filesDeleted: 0, errors: 1, bytesFreed: 0 };
  } finally {
    isProcessing = false;
  }
}

// =============================================================================
// Scheduler Control
// =============================================================================

/**
 * Start the page cache cleanup scheduler
 */
export function startPageCacheScheduler(): void {
  if (cleanupIntervalId) {
    logger.debug('Already running');
    return;
  }

  logger.info('Starting scheduler...');

  // Run initial cleanup after a short delay (1 minute)
  // This allows other startup tasks to complete first
  setTimeout(() => {
    runCleanupJob().catch((err) => {
      logger.error({ error: err, action: 'initial-cleanup' }, 'Error running initial cleanup');
    });
  }, 60 * 1000);

  // Set up interval for regular cleanup
  cleanupIntervalId = setInterval(() => {
    runCleanupJob().catch((err) => {
      logger.error({ error: err, action: 'scheduled-cleanup' }, 'Error running scheduled cleanup');
    });
  }, CLEANUP_INTERVAL);

  logger.info({
    cleanupIntervalMinutes: CLEANUP_INTERVAL / 1000 / 60,
    ttlMinutes: DEFAULT_TTL_MINUTES,
  }, 'Scheduler started');
}

/**
 * Stop the page cache cleanup scheduler
 */
export function stopPageCacheScheduler(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }

  logger.info('Scheduler stopped');
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  isProcessing: boolean;
  lastCleanupRun: Date | null;
} {
  return {
    isRunning: cleanupIntervalId !== null,
    isProcessing,
    lastCleanupRun,
  };
}

/**
 * Force immediate cleanup (for API/testing)
 */
export async function triggerCleanup(): Promise<{ filesDeleted: number; errors: number; bytesFreed: number }> {
  return runCleanupJob();
}

/**
 * Get current cache statistics (for API/monitoring)
 */
export async function getStats(): Promise<{
  totalCaches: number;
  totalSizeBytes: number;
  oldestCacheAge: number | null;
  newestCacheAge: number | null;
}> {
  return getCacheStats();
}
