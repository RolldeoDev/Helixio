/**
 * Page Cache Scheduler Service
 *
 * Manages background cleanup of expired page caches.
 * Runs periodic cleanup to remove caches that haven't been accessed
 * within the TTL period (default: 5 minutes).
 */

import { cleanupExpiredCaches, getCacheStats, DEFAULT_TTL_MINUTES } from './page-cache.service.js';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('page-cache-scheduler');

// =============================================================================
// Configuration
// =============================================================================

/** Interval for cleanup checks (15 minutes in ms) */
const CLEANUP_INTERVAL = 15 * 60 * 1000;

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
 * Run cleanup of expired page caches
 */
export async function runCleanupJob(): Promise<{ filesDeleted: number; errors: number; bytesFreed: number }> {
  if (isProcessing) {
    logger.debug('Skipping cleanup - already processing');
    return { filesDeleted: 0, errors: 0, bytesFreed: 0 };
  }

  isProcessing = true;
  lastCleanupRun = new Date();

  try {
    logger.debug('Running cleanup job...');
    const result = await cleanupExpiredCaches(DEFAULT_TTL_MINUTES);

    if (result.filesDeleted > 0) {
      logger.info(
        { filesDeleted: result.filesDeleted, bytesFreedMB: Math.round(result.bytesFreed / 1024 / 1024), errors: result.errors },
        `Cleanup completed: ${result.filesDeleted} cache(s) cleaned, ${Math.round(result.bytesFreed / 1024 / 1024)}MB freed`
      );
    } else {
      logger.debug('No expired caches to clean');
    }

    return result;
  } catch (error) {
    logger.error({ error, action: 'cleanup-expired-caches' }, 'Error running cleanup job');
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
