/**
 * Similarity Scheduler Service
 *
 * Manages background jobs for similarity computation:
 * - Nightly: Incremental update of similarities (for changed series)
 * - On-demand: Full rebuild via API trigger
 * - Startup: Initial build if no similarities exist
 */

import {
  runSimilarityJob,
  hasSimilarityData,
  getSimilarityStats,
  getLastCompletedJob,
} from './similarity-job.service.js';
import { logError, logInfo, logDebug, createServiceLogger } from '../logger.service.js';

const logger = createServiceLogger('similarity-scheduler');

// =============================================================================
// Configuration
// =============================================================================

/** Hour of day for nightly incremental update (2am local time) */
const NIGHTLY_HOUR = 2;

/** Interval for checking if it's time for nightly job (1 hour in ms) */
const HOURLY_INTERVAL = 60 * 60 * 1000;

/** Delay before initial startup job (60 seconds) */
const STARTUP_DELAY = 60 * 1000;

// =============================================================================
// State
// =============================================================================

let hourlyCheckIntervalId: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let lastNightlyRun: Date | null = null;

// =============================================================================
// Nightly Job: Incremental Update
// =============================================================================

/**
 * Check if it's time for the nightly incremental update
 */
function isNightlyUpdateTime(): boolean {
  const now = new Date();
  const isCorrectHour = now.getHours() === NIGHTLY_HOUR;

  // Check if we already ran today
  if (lastNightlyRun) {
    const hoursSinceLastRun = Math.floor(
      (now.getTime() - lastNightlyRun.getTime()) / (60 * 60 * 1000)
    );
    if (hoursSinceLastRun < 20) {
      // Don't run again for at least 20 hours
      return false;
    }
  }

  return isCorrectHour;
}

/**
 * Run incremental similarity update
 */
export async function runNightlyJob(): Promise<{
  pairsProcessed: number;
  pairsStored: number;
}> {
  if (isProcessing) {
    logDebug('similarity-scheduler', 'Skipping nightly job - already processing');
    return { pairsProcessed: 0, pairsStored: 0 };
  }

  isProcessing = true;
  lastNightlyRun = new Date();

  try {
    logInfo('similarity-scheduler', 'Starting nightly incremental update...');
    const result = await runSimilarityJob('incremental');

    if (result.status === 'completed') {
      logInfo('similarity-scheduler', 'Nightly update complete', {
        pairsProcessed: result.pairsProcessed,
        pairsStored: result.pairsStored,
        durationMs: result.duration,
      });
      return {
        pairsProcessed: result.pairsProcessed,
        pairsStored: result.pairsStored,
      };
    } else {
      logError('similarity-scheduler', new Error(result.error || 'Unknown error'), {
        action: 'nightly-update',
      });
      return { pairsProcessed: 0, pairsStored: 0 };
    }
  } catch (error) {
    logError('similarity-scheduler', error, { action: 'nightly-update' });
    return { pairsProcessed: 0, pairsStored: 0 };
  } finally {
    isProcessing = false;
  }
}

// =============================================================================
// Full Rebuild (On-Demand)
// =============================================================================

/**
 * Run full similarity rebuild (triggered via API or startup)
 */
export async function runFullRebuild(): Promise<{
  pairsProcessed: number;
  pairsStored: number;
}> {
  if (isProcessing) {
    logDebug('similarity-scheduler', 'Skipping full rebuild - already processing');
    return { pairsProcessed: 0, pairsStored: 0 };
  }

  isProcessing = true;

  try {
    logInfo('similarity-scheduler', 'Starting full similarity rebuild...');
    const result = await runSimilarityJob('full');

    if (result.status === 'completed') {
      logInfo('similarity-scheduler', 'Full rebuild complete', {
        pairsProcessed: result.pairsProcessed,
        pairsStored: result.pairsStored,
        durationMs: result.duration,
      });
      return {
        pairsProcessed: result.pairsProcessed,
        pairsStored: result.pairsStored,
      };
    } else {
      logError('similarity-scheduler', new Error(result.error || 'Unknown error'), {
        action: 'full-rebuild',
      });
      return { pairsProcessed: 0, pairsStored: 0 };
    }
  } catch (error) {
    logError('similarity-scheduler', error, { action: 'full-rebuild' });
    return { pairsProcessed: 0, pairsStored: 0 };
  } finally {
    isProcessing = false;
  }
}

// =============================================================================
// Startup Job
// =============================================================================

/**
 * Check and run initial similarity computation if needed
 */
async function runStartupJob(): Promise<void> {
  try {
    const hasData = await hasSimilarityData();

    if (!hasData) {
      logInfo(
        'similarity-scheduler',
        'No similarity data found, running initial full rebuild...'
      );
      await runFullRebuild();
    } else {
      const lastJob = await getLastCompletedJob();
      if (lastJob) {
        const hoursSinceLastJob = Math.floor(
          (Date.now() - lastJob.completedAt.getTime()) / (60 * 60 * 1000)
        );
        logInfo('similarity-scheduler', 'Similarity data exists', {
          pairsCount: lastJob.processedPairs,
          lastComputedHoursAgo: hoursSinceLastJob,
        });

        // If it's been more than 24 hours, run an incremental update
        if (hoursSinceLastJob > 24) {
          logInfo(
            'similarity-scheduler',
            'Data is stale, running incremental update...'
          );
          await runNightlyJob();
        }
      }
    }
  } catch (error) {
    logError('similarity-scheduler', error, { action: 'startup-job' });
  }
}

// =============================================================================
// Scheduler Control
// =============================================================================

/**
 * Start the similarity scheduler
 */
export function startSimilarityScheduler(): void {
  if (hourlyCheckIntervalId) {
    logDebug('similarity-scheduler', 'Already running');
    return;
  }

  logInfo('similarity-scheduler', 'Starting scheduler...');

  // Run startup check after a delay (allow other services to initialize)
  setTimeout(() => {
    runStartupJob().catch((err) => {
      logError('similarity-scheduler', err, { action: 'startup-job' });
    });
  }, STARTUP_DELAY);

  // Check hourly for nightly update time
  hourlyCheckIntervalId = setInterval(() => {
    if (isNightlyUpdateTime()) {
      runNightlyJob().catch((err) => {
        logError('similarity-scheduler', err, { action: 'nightly-check' });
      });
    }
  }, HOURLY_INTERVAL);

  logInfo('similarity-scheduler', 'Scheduler started', {
    nightlyHour: NIGHTLY_HOUR,
    checkIntervalMinutes: HOURLY_INTERVAL / 1000 / 60,
  });
}

/**
 * Stop the similarity scheduler
 */
export function stopSimilarityScheduler(): void {
  if (hourlyCheckIntervalId) {
    clearInterval(hourlyCheckIntervalId);
    hourlyCheckIntervalId = null;
  }

  logInfo('similarity-scheduler', 'Scheduler stopped');
}

/**
 * Get scheduler status
 */
export function getSimilaritySchedulerStatus(): {
  isRunning: boolean;
  isProcessing: boolean;
  lastNightlyRun: Date | null;
} {
  return {
    isRunning: hourlyCheckIntervalId !== null,
    isProcessing,
    lastNightlyRun,
  };
}

/**
 * Trigger immediate incremental update (for API/testing)
 */
export async function triggerIncrementalUpdate(): Promise<{
  pairsProcessed: number;
  pairsStored: number;
}> {
  return runNightlyJob();
}

/**
 * Trigger full rebuild (for API/admin)
 */
export async function triggerFullRebuildJob(): Promise<{
  pairsProcessed: number;
  pairsStored: number;
}> {
  return runFullRebuild();
}
