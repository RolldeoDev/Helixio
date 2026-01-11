/**
 * Unified Jobs Broadcaster Service
 *
 * Background polling service that monitors job state changes and broadcasts
 * updates to connected SSE clients. Pauses automatically when no clients connected.
 */

import { getAggregatedJobs } from './job-aggregator.service.js';
import type { AggregatedJobsResponse, UnifiedJob } from './job-aggregator.types.js';
import {
  sendUnifiedJobsState,
  sendUnifiedJobCount,
  getUnifiedJobsClientCount,
} from './sse.service.js';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('unified-jobs-broadcaster');

// =============================================================================
// Configuration
// =============================================================================

/**
 * Polling interval for checking job state changes (1500ms / 1.5 seconds)
 */
const POLL_INTERVAL_MS = 1500;

// =============================================================================
// State
// =============================================================================

/**
 * Previous state for change detection
 */
let previousState: AggregatedJobsResponse | null = null;

/**
 * Polling timer reference
 */
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Broadcaster running state
 */
let isRunning = false;

// =============================================================================
// Change Detection
// =============================================================================

/**
 * Detect if jobs state has meaningfully changed.
 * Compares job IDs, statuses, progress values, and counts.
 * Ignores timestamp-only changes to avoid unnecessary broadcasts.
 */
function detectChanges(
  prev: AggregatedJobsResponse | null,
  current: AggregatedJobsResponse
): boolean {
  // First poll - always broadcast initial state
  if (!prev) {
    return true;
  }

  // Check if counts changed
  if (
    prev.counts.active !== current.counts.active ||
    prev.counts.queued !== current.counts.queued ||
    prev.counts.running !== current.counts.running
  ) {
    return true;
  }

  // Check if number of active jobs changed
  if (prev.active.length !== current.active.length) {
    return true;
  }

  // Check if number of history jobs changed
  if (prev.history.length !== current.history.length) {
    return true;
  }

  // Build map of previous active jobs by ID
  const prevActiveMap = new Map(prev.active.map((j: UnifiedJob) => [j.id, j]));

  // Check each current active job
  for (const currentJob of current.active) {
    const prevJob = prevActiveMap.get(currentJob.id);

    // New job appeared
    if (!prevJob) {
      return true;
    }

    // Status changed
    if (prevJob.status !== currentJob.status) {
      return true;
    }

    // Progress changed (rounded to nearest 1% to avoid tiny fluctuations)
    const prevProgress = Math.round(prevJob.progress ?? 0);
    const currentProgress = Math.round(currentJob.progress ?? 0);
    if (prevProgress !== currentProgress) {
      return true;
    }

    // Subtitle changed (often contains progress details)
    if (prevJob.subtitle !== currentJob.subtitle) {
      return true;
    }
  }

  // Build map of previous history jobs by ID
  const prevHistoryMap = new Map(prev.history.map((j: UnifiedJob) => [j.id, j]));

  // Check if any history job IDs changed (new completed jobs)
  for (const currentHistoryJob of current.history) {
    if (!prevHistoryMap.has(currentHistoryJob.id)) {
      return true;
    }
  }

  // No meaningful changes detected
  return false;
}

// =============================================================================
// Background Polling
// =============================================================================

/**
 * Poll for job state changes and broadcast if detected.
 * Automatically skips polling if no clients connected (optimization).
 */
async function pollAndBroadcast(): Promise<void> {
  try {
    // Optimization: Skip if no clients connected
    const clientCount = getUnifiedJobsClientCount();
    if (clientCount === 0) {
      // Reset previous state when no clients (fresh start on reconnect)
      if (previousState !== null) {
        previousState = null;
        logger.debug('No clients connected, pausing broadcasts');
      }
      return;
    }

    // Fetch current aggregated jobs state
    const currentState = await getAggregatedJobs({ status: 'all' });

    // Detect changes
    const hasChanges = detectChanges(previousState, currentState);

    if (hasChanges) {
      // Broadcast full state to all clients
      const sentCount = sendUnifiedJobsState({
        active: currentState.active,
        history: currentState.history,
        counts: currentState.counts,
      });

      logger.debug(
        {
          active: currentState.counts.active,
          clients: sentCount,
        },
        'Broadcasted jobs state update'
      );

      // Also broadcast count if it changed
      if (!previousState || previousState.counts.active !== currentState.counts.active) {
        sendUnifiedJobCount(currentState.counts.active);
      }
    }

    // Update previous state for next comparison
    previousState = currentState;
  } catch (error) {
    // Log error but continue polling (recommendation from Phase 3: Q3)
    // Client fallback polling will catch up if broadcaster fails
    logger.error({ error }, 'Failed to poll and broadcast jobs state');
  }
}

// =============================================================================
// Lifecycle Management
// =============================================================================

/**
 * Start the unified jobs broadcaster.
 * Begins background polling loop at configured interval.
 */
export function startUnifiedJobsBroadcaster(): void {
  if (isRunning) {
    logger.warn('Unified jobs broadcaster already running');
    return;
  }

  logger.info('Starting unified jobs broadcaster');

  // Immediately fetch and broadcast initial state if clients connected
  // (Phase 3: Q4 - Option A: fetch immediately on start)
  pollAndBroadcast().catch((error) => {
    logger.error({ error }, 'Failed initial poll on broadcaster start');
  });

  // Start polling interval
  pollTimer = setInterval(() => {
    pollAndBroadcast().catch((error) => {
      logger.error({ error }, 'Failed to poll in interval');
    });
  }, POLL_INTERVAL_MS);

  isRunning = true;
  logger.info({ intervalMs: POLL_INTERVAL_MS }, 'Unified jobs broadcaster started');
}

/**
 * Stop the unified jobs broadcaster.
 * Clears polling interval and resets state.
 */
export function stopUnifiedJobsBroadcaster(): void {
  if (!isRunning) {
    return;
  }

  logger.info('Stopping unified jobs broadcaster');

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  previousState = null;
  isRunning = false;

  logger.info('Unified jobs broadcaster stopped');
}

/**
 * Get broadcaster status (for debugging)
 */
export function getUnifiedJobsBroadcasterStatus(): {
  isRunning: boolean;
  pollIntervalMs: number;
  clientCount: number;
  hasState: boolean;
} {
  return {
    isRunning,
    pollIntervalMs: POLL_INTERVAL_MS,
    clientCount: getUnifiedJobsClientCount(),
    hasState: previousState !== null,
  };
}

// =============================================================================
// Exports
// =============================================================================

export const UnifiedJobsBroadcasterService = {
  start: startUnifiedJobsBroadcaster,
  stop: stopUnifiedJobsBroadcaster,
  getStatus: getUnifiedJobsBroadcasterStatus,
};

export default UnifiedJobsBroadcasterService;
