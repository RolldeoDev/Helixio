/**
 * BullMQ Configuration
 *
 * Shared configuration for all BullMQ queues and workers.
 * Uses existing Redis connection from cache adapter.
 */

import type { ConnectionOptions, DefaultJobOptions } from 'bullmq';

/**
 * Redis connection configuration for BullMQ
 */
export const REDIS_CONFIG: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false, // Required for BullMQ
};

/**
 * Queue naming conventions
 * Note: BullMQ doesn't allow colons in queue names
 */
export const QUEUE_NAMES = {
  COVER: 'helixio-cover-extraction',
  SCAN: 'helixio-library-scan',
} as const;

/**
 * Default job options for all queues
 */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    age: 86400, // 24 hours
    count: 100, // Keep last 100 completed jobs
  },
  removeOnFail: {
    age: 604800, // 7 days
    count: 500, // Keep last 500 failed jobs
  },
};

/**
 * Cover queue specific configuration
 */
export const COVER_QUEUE_CONFIG = {
  concurrency: 8, // Match existing MAX_CONCURRENT_WORKERS
  lowPriorityConcurrency: 2, // Match existing LOW_PRIORITY_CONCURRENT_WORKERS
  rateLimiter: {
    max: 8, // 8 jobs per second max
    duration: 1000,
  },
} as const;

/**
 * Scan queue specific configuration
 */
export const SCAN_QUEUE_CONFIG = {
  concurrency: 1, // Match existing MAX_CONCURRENT_SCANS (sequential)
  batchSize: 100, // Folders per batch
} as const;
