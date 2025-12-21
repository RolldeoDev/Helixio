/**
 * Stats Scheduler Service
 *
 * Manages background jobs for stats processing:
 * - Hourly: Process dirty stats (incremental updates)
 * - Weekly: Full rebuild of all stats
 */

import { processDirtyStats, fullRebuild } from './stats-aggregation.service.js';
import { getDirtyFlagCount } from './stats-dirty.service.js';

// =============================================================================
// Configuration
// =============================================================================

/** Interval for processing dirty stats (1 hour in ms) */
const HOURLY_INTERVAL = 60 * 60 * 1000;

/** Day of week for full rebuild (0 = Sunday) */
const WEEKLY_REBUILD_DAY = 0;

/** Hour of day for full rebuild (3am local time) */
const WEEKLY_REBUILD_HOUR = 3;

// =============================================================================
// State
// =============================================================================

let hourlyIntervalId: ReturnType<typeof setInterval> | null = null;
let weeklyCheckIntervalId: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let lastHourlyRun: Date | null = null;
let lastWeeklyRun: Date | null = null;

// =============================================================================
// Hourly Job: Process Dirty Stats
// =============================================================================

/**
 * Process dirty stats incrementally
 */
export async function runHourlyJob(): Promise<{ processed: number }> {
  if (isProcessing) {
    console.log('[Stats Scheduler] Skipping hourly job - already processing');
    return { processed: 0 };
  }

  isProcessing = true;
  lastHourlyRun = new Date();

  try {
    const dirtyCount = await getDirtyFlagCount();
    if (dirtyCount === 0) {
      console.log('[Stats Scheduler] No dirty stats to process');
      return { processed: 0 };
    }

    console.log(`[Stats Scheduler] Processing ${dirtyCount} dirty stat(s)...`);
    const result = await processDirtyStats();
    console.log(`[Stats Scheduler] Processed ${result.processed} dirty stat scope(s)`);
    return result;
  } catch (error) {
    console.error('[Stats Scheduler] Error processing dirty stats:', error);
    return { processed: 0 };
  } finally {
    isProcessing = false;
  }
}

// =============================================================================
// Weekly Job: Full Rebuild
// =============================================================================

/**
 * Check if it's time for weekly rebuild
 */
function isWeeklyRebuildTime(): boolean {
  const now = new Date();
  const isCorrectDay = now.getDay() === WEEKLY_REBUILD_DAY;
  const isCorrectHour = now.getHours() === WEEKLY_REBUILD_HOUR;

  // Check if we already ran this week
  if (lastWeeklyRun) {
    const daysSinceLastRun = Math.floor(
      (now.getTime() - lastWeeklyRun.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (daysSinceLastRun < 6) {
      return false;
    }
  }

  return isCorrectDay && isCorrectHour;
}

/**
 * Run full stats rebuild
 */
export async function runWeeklyRebuild(): Promise<void> {
  if (isProcessing) {
    console.log('[Stats Scheduler] Skipping weekly rebuild - already processing');
    return;
  }

  isProcessing = true;
  lastWeeklyRun = new Date();

  try {
    console.log('[Stats Scheduler] Starting weekly full rebuild...');
    await fullRebuild();
    console.log('[Stats Scheduler] Weekly rebuild complete');
  } catch (error) {
    console.error('[Stats Scheduler] Error during weekly rebuild:', error);
  } finally {
    isProcessing = false;
  }
}

// =============================================================================
// Scheduler Control
// =============================================================================

/**
 * Start the stats scheduler
 */
export function startStatsScheduler(): void {
  if (hourlyIntervalId) {
    console.log('[Stats Scheduler] Already running');
    return;
  }

  console.log('[Stats Scheduler] Starting scheduler...');

  // Run initial dirty stats processing after a short delay (30 seconds)
  // This allows other startup tasks to complete first
  setTimeout(() => {
    runHourlyJob().catch((err) => {
      console.error('[Stats Scheduler] Initial job failed:', err);
    });
  }, 30 * 1000);

  // Set up hourly interval
  hourlyIntervalId = setInterval(() => {
    runHourlyJob().catch((err) => {
      console.error('[Stats Scheduler] Hourly job failed:', err);
    });
  }, HOURLY_INTERVAL);

  // Check for weekly rebuild every hour
  weeklyCheckIntervalId = setInterval(() => {
    if (isWeeklyRebuildTime()) {
      runWeeklyRebuild().catch((err) => {
        console.error('[Stats Scheduler] Weekly rebuild failed:', err);
      });
    }
  }, HOURLY_INTERVAL);

  console.log('[Stats Scheduler] Scheduler started');
  console.log(`[Stats Scheduler] Hourly processing every ${HOURLY_INTERVAL / 1000 / 60} minutes`);
  console.log(`[Stats Scheduler] Weekly rebuild on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][WEEKLY_REBUILD_DAY]} at ${WEEKLY_REBUILD_HOUR}:00`);
}

/**
 * Stop the stats scheduler
 */
export function stopStatsScheduler(): void {
  if (hourlyIntervalId) {
    clearInterval(hourlyIntervalId);
    hourlyIntervalId = null;
  }

  if (weeklyCheckIntervalId) {
    clearInterval(weeklyCheckIntervalId);
    weeklyCheckIntervalId = null;
  }

  console.log('[Stats Scheduler] Scheduler stopped');
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  isProcessing: boolean;
  lastHourlyRun: Date | null;
  lastWeeklyRun: Date | null;
} {
  return {
    isRunning: hourlyIntervalId !== null,
    isProcessing,
    lastHourlyRun,
    lastWeeklyRun,
  };
}

/**
 * Force immediate processing of dirty stats (for API/testing)
 */
export async function triggerDirtyStatsProcessing(): Promise<{ processed: number }> {
  return runHourlyJob();
}

/**
 * Force full rebuild (for API/admin)
 */
export async function triggerFullRebuild(): Promise<void> {
  return runWeeklyRebuild();
}
