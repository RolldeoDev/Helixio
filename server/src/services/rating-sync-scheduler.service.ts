/**
 * Rating Sync Scheduler Service
 *
 * Manages scheduled background sync of external ratings.
 * Runs based on user-configured schedule (daily, weekly, or manual-only).
 */

import { getDatabase } from './database.service.js';
import { createServiceLogger } from './logger.service.js';
import { getExternalRatingsSettings } from './config.service.js';
import {
  createRatingSyncJob,
  cleanupOldJobs,
  recoverInterruptedJobs,
} from './rating-sync-job.service.js';
import { getSeriesWithExpiredRatings } from './rating-sync.service.js';
import type { RatingSource } from './rating-providers/index.js';

const logger = createServiceLogger('rating-sync-scheduler');

// =============================================================================
// Types
// =============================================================================

interface SchedulerStatus {
  isRunning: boolean;
  schedule: 'daily' | 'weekly' | 'manual';
  syncHour: number;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
}

// =============================================================================
// State
// =============================================================================

/** Scheduler interval handle */
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

/** Last time the scheduler checked for work */
let lastCheckTime: Date | null = null;

/** Last time a scheduled sync ran */
let lastRunTime: Date | null = null;

/** Next scheduled run time */
let nextRunTime: Date | null = null;

// =============================================================================
// Scheduler Logic
// =============================================================================

/**
 * Calculate next run time based on schedule settings
 */
function calculateNextRunTime(
  schedule: 'daily' | 'weekly' | 'manual',
  syncHour: number
): Date | null {
  if (schedule === 'manual') {
    return null;
  }

  const now = new Date();
  const next = new Date();

  // Set to sync hour
  next.setHours(syncHour, 0, 0, 0);

  // If we've already passed today's sync time, move to tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  // For weekly, move to the next week's sync day (Sunday)
  if (schedule === 'weekly') {
    const dayOfWeek = next.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    if (daysUntilSunday > 0 || next <= now) {
      next.setDate(next.getDate() + (daysUntilSunday || 7));
    }
  }

  return next;
}

/**
 * Check if it's time to run the scheduled sync
 */
function shouldRunSync(
  schedule: 'daily' | 'weekly' | 'manual',
  syncHour: number
): boolean {
  if (schedule === 'manual') {
    return false;
  }

  const now = new Date();
  const currentHour = now.getHours();

  // Check if we're in the right hour
  if (currentHour !== syncHour) {
    return false;
  }

  // Check if we've already run today/this week
  if (lastRunTime) {
    const timeSinceLastRun = now.getTime() - lastRunTime.getTime();
    const hoursPerPeriod = schedule === 'daily' ? 24 : 24 * 7;
    const msSincePeriod = hoursPerPeriod * 60 * 60 * 1000;

    if (timeSinceLastRun < msSincePeriod - 60 * 60 * 1000) {
      // Ran within the period (with 1 hour buffer)
      return false;
    }
  }

  return true;
}

/**
 * Run the scheduled sync
 */
async function runScheduledSync(): Promise<void> {
  const settings = getExternalRatingsSettings();
  if (!settings || settings.syncSchedule === 'manual') {
    return;
  }

  const enabledSources = settings.enabledSources as RatingSource[];
  if (enabledSources.length === 0) {
    logger.info('No rating sources enabled, skipping scheduled sync');
    return;
  }

  try {
    // Get series with expired ratings
    const expiredSeriesIds = await getSeriesWithExpiredRatings(100);

    if (expiredSeriesIds.length === 0) {
      logger.info('No series with expired ratings, skipping scheduled sync');
      lastRunTime = new Date();
      return;
    }

    logger.info(
      { count: expiredSeriesIds.length },
      'Starting scheduled rating sync'
    );

    // Create a scheduled sync job
    const jobId = await createRatingSyncJob({
      type: 'scheduled',
      sources: enabledSources,
      forceRefresh: false, // Only sync expired ratings
    });

    logger.info({ jobId }, 'Created scheduled rating sync job');
    lastRunTime = new Date();

    // Clean up old jobs
    await cleanupOldJobs(30);
  } catch (error) {
    logger.error({ error }, 'Error running scheduled rating sync');
  }
}

/**
 * Check and run sync if needed
 */
async function checkSchedule(): Promise<void> {
  const settings = getExternalRatingsSettings();
  if (!settings) {
    return;
  }

  lastCheckTime = new Date();
  nextRunTime = calculateNextRunTime(settings.syncSchedule, settings.syncHour);

  if (shouldRunSync(settings.syncSchedule, settings.syncHour)) {
    await runScheduledSync();
    nextRunTime = calculateNextRunTime(settings.syncSchedule, settings.syncHour);
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Start the rating sync scheduler
 */
export function startRatingSyncScheduler(): void {
  if (schedulerInterval) {
    logger.warn('Rating sync scheduler already running');
    return;
  }

  const settings = getExternalRatingsSettings();
  const schedule = settings?.syncSchedule || 'manual';
  const syncHour = settings?.syncHour || 3;

  logger.info({ schedule, syncHour }, 'Starting rating sync scheduler');

  // Recover any interrupted jobs from previous run
  recoverInterruptedJobs().catch((error) => {
    logger.error({ error }, 'Error recovering interrupted jobs on startup');
  });

  // Calculate next run time
  nextRunTime = calculateNextRunTime(schedule, syncHour);

  if (nextRunTime) {
    logger.info({ nextRunAt: nextRunTime }, 'Next scheduled sync');
  }

  // Check every 15 minutes
  schedulerInterval = setInterval(
    () => {
      checkSchedule().catch((error) => {
        logger.error({ error }, 'Error in scheduler check');
      });
    },
    15 * 60 * 1000
  );

  // Also do an immediate check
  checkSchedule().catch((error) => {
    logger.error({ error }, 'Error in initial scheduler check');
  });
}

/**
 * Stop the rating sync scheduler
 */
export function stopRatingSyncScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Stopped rating sync scheduler');
  }
}

/**
 * Get current scheduler status
 */
export function getSchedulerStatus(): SchedulerStatus {
  const settings = getExternalRatingsSettings();

  return {
    isRunning: schedulerInterval !== null,
    schedule: settings?.syncSchedule || 'manual',
    syncHour: settings?.syncHour || 3,
    lastRunAt: lastRunTime,
    nextRunAt: nextRunTime,
  };
}

/**
 * Force a scheduled sync run (for admin/testing)
 */
export async function forceScheduledSync(): Promise<string | null> {
  const settings = getExternalRatingsSettings();
  const enabledSources = (settings?.enabledSources || []) as RatingSource[];

  if (enabledSources.length === 0) {
    logger.warn('No rating sources enabled, cannot force sync');
    return null;
  }

  try {
    const jobId = await createRatingSyncJob({
      type: 'scheduled',
      sources: enabledSources,
      forceRefresh: true,
    });

    lastRunTime = new Date();
    return jobId;
  } catch (error) {
    logger.error({ error }, 'Error forcing scheduled sync');
    throw error;
  }
}

// =============================================================================
// Exports
// =============================================================================

export const RatingSyncScheduler = {
  start: startRatingSyncScheduler,
  stop: stopRatingSyncScheduler,
  getStatus: getSchedulerStatus,
  forceSync: forceScheduledSync,
};

export default RatingSyncScheduler;
