/**
 * Parallel Processing Service
 *
 * Provides controlled parallel execution for batch operations.
 * Uses p-limit to manage concurrency.
 */

import pLimit, { LimitFunction } from 'p-limit';
import os from 'os';
import { batchLogger } from './logger.service.js';

// =============================================================================
// Concurrency Auto-Detection
// =============================================================================

/** Cached concurrency values by type */
const concurrencyCache = new Map<'io' | 'cpu', number>();

/**
 * Get optimal concurrency based on CPU cores and operation type.
 *
 * @param type - 'io' for I/O-bound operations (archive extraction, file reads)
 *               'cpu' for CPU-bound operations (Sharp image processing)
 * @returns Optimal concurrency value
 *
 * For I/O-bound operations: Higher concurrency (2x CPU cores, max 16)
 * For CPU-bound operations: Match CPU cores minus 1 (leave headroom)
 */
export function getOptimalConcurrency(type: 'io' | 'cpu' = 'io'): number {
  // Check cache first
  const cached = concurrencyCache.get(type);
  if (cached !== undefined) return cached;

  const cpuCount = os.cpus().length;
  let concurrency: number;

  if (type === 'io') {
    // I/O-bound operations can handle higher concurrency
    // because they spend most time waiting for disk/network
    // Modern SSDs benefit from higher parallelism (cap at 16)
    concurrency = Math.min(cpuCount * 2, 16);
  } else {
    // CPU-bound operations should not exceed available cores
    // Leave 1 core free for OS and other processes
    concurrency = Math.max(cpuCount - 1, 2);
  }

  // Cache the result
  concurrencyCache.set(type, concurrency);

  batchLogger.info({
    type,
    cpuCount,
    concurrency,
  }, `Auto-detected optimal concurrency: ${concurrency} for ${type}-bound operations`);

  return concurrency;
}

/**
 * Override the auto-detected concurrency for a specific type.
 * Useful for testing or manual tuning.
 */
export function setCustomConcurrency(type: 'io' | 'cpu', value: number): void {
  if (value < 1) {
    throw new Error('Concurrency must be at least 1');
  }
  concurrencyCache.set(type, value);
  batchLogger.info({ type, value }, `Custom concurrency set: ${value} for ${type}-bound operations`);
}

/**
 * Clear cached concurrency values (for testing).
 */
export function clearConcurrencyCache(): void {
  concurrencyCache.clear();
}

/**
 * Get current concurrency settings for diagnostics.
 */
export function getConcurrencyStats(): {
  cpuCount: number;
  ioConcurrency: number;
  cpuConcurrency: number;
} {
  return {
    cpuCount: os.cpus().length,
    ioConcurrency: getOptimalConcurrency('io'),
    cpuConcurrency: getOptimalConcurrency('cpu'),
  };
}

// =============================================================================
// Types
// =============================================================================

export interface ParallelResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  index: number;
}

export interface ParallelBatchResult<T> {
  total: number;
  successful: number;
  failed: number;
  results: ParallelResult<T>[];
  duration: number;
}

export interface ParallelOptions {
  /** Maximum concurrent operations (default: 3) */
  concurrency?: number;
  /** Whether to stop on first error (default: false) */
  stopOnError?: boolean;
  /** Progress callback called after each item */
  onProgress?: (completed: number, total: number, result: ParallelResult<unknown>) => void;
  /** Whether operation should be cancelled */
  shouldCancel?: () => boolean;
}

// =============================================================================
// Default Limiters
// =============================================================================

// Pre-configured limiters for common use cases
const limiters: Map<number, LimitFunction> = new Map();

function getLimiter(concurrency: number): LimitFunction {
  if (!limiters.has(concurrency)) {
    limiters.set(concurrency, pLimit(concurrency));
  }
  return limiters.get(concurrency)!;
}

// =============================================================================
// Parallel Execution Functions
// =============================================================================

/**
 * Execute operations in parallel with controlled concurrency
 */
export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: ParallelOptions = {}
): Promise<ParallelBatchResult<R>> {
  const {
    concurrency = 3,
    stopOnError = false,
    onProgress,
    shouldCancel,
  } = options;

  const startTime = Date.now();
  const limit = getLimiter(concurrency);
  const results: ParallelResult<R>[] = [];
  let successful = 0;
  let failed = 0;
  let cancelled = false;

  batchLogger.info({
    total: items.length,
    concurrency,
  }, `Starting parallel processing of ${items.length} items with concurrency ${concurrency}`);

  const promises = items.map((item, index) =>
    limit(async () => {
      // Check for cancellation
      if (cancelled || (shouldCancel && shouldCancel())) {
        cancelled = true;
        const result: ParallelResult<R> = {
          success: false,
          error: 'Operation cancelled',
          index,
        };
        results[index] = result;
        return result;
      }

      try {
        const result = await fn(item, index);
        successful++;
        const parallelResult: ParallelResult<R> = {
          success: true,
          result,
          index,
        };
        results[index] = parallelResult;

        if (onProgress) {
          onProgress(successful + failed, items.length, parallelResult);
        }

        return parallelResult;
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const parallelResult: ParallelResult<R> = {
          success: false,
          error: errorMessage,
          index,
        };
        results[index] = parallelResult;

        batchLogger.warn({
          index,
          error: errorMessage,
        }, `Item ${index} failed: ${errorMessage}`);

        if (onProgress) {
          onProgress(successful + failed, items.length, parallelResult);
        }

        if (stopOnError) {
          cancelled = true;
          throw error;
        }

        return parallelResult;
      }
    })
  );

  try {
    await Promise.all(promises);
  } catch (error) {
    // If stopOnError is true, we may have thrown
    batchLogger.error({ error }, 'Parallel processing stopped due to error');
  }

  const duration = Date.now() - startTime;

  batchLogger.info({
    total: items.length,
    successful,
    failed,
    cancelled,
    duration,
  }, `Parallel processing complete: ${successful} succeeded, ${failed} failed in ${duration}ms`);

  return {
    total: items.length,
    successful,
    failed,
    results,
    duration,
  };
}

/**
 * Execute operations in parallel and collect only successful results
 */
export async function parallelFilter<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: ParallelOptions = {}
): Promise<R[]> {
  const result = await parallelMap(items, fn, options);
  return result.results
    .filter((r): r is ParallelResult<R> & { success: true; result: R } => r.success && r.result !== undefined)
    .map((r) => r.result);
}

/**
 * Execute operations sequentially but with async/await pattern
 * Useful when operations must be strictly ordered
 */
export async function sequentialMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: Omit<ParallelOptions, 'concurrency'> = {}
): Promise<ParallelBatchResult<R>> {
  return parallelMap(items, fn, { ...options, concurrency: 1 });
}

// =============================================================================
// Batch Processing Utilities
// =============================================================================

/**
 * Split items into batches
 */
export function createBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Process items in batches with parallel execution within each batch
 */
export async function processBatches<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: ParallelOptions & { batchSize?: number } = {}
): Promise<ParallelBatchResult<R>> {
  const { batchSize = 10, ...parallelOptions } = options;
  const batches = createBatches(items, batchSize);

  batchLogger.info({
    total: items.length,
    batchCount: batches.length,
    batchSize,
  }, `Processing ${items.length} items in ${batches.length} batches`);

  const allResults: ParallelResult<R>[] = [];
  let globalSuccessful = 0;
  let globalFailed = 0;
  const startTime = Date.now();

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!;
    const batchStartIndex = batchIndex * batchSize;

    batchLogger.debug({
      batchIndex,
      batchSize: batch.length,
    }, `Processing batch ${batchIndex + 1}/${batches.length}`);

    const batchResult = await parallelMap(
      batch,
      async (item, localIndex) => fn(item, batchStartIndex + localIndex),
      {
        ...parallelOptions,
        onProgress: (completed, total, result) => {
          if (parallelOptions.onProgress) {
            const globalCompleted = batchStartIndex + completed;
            parallelOptions.onProgress(globalCompleted, items.length, result);
          }
        },
      }
    );

    // Adjust indices in results
    for (const result of batchResult.results) {
      allResults.push({
        ...result,
        index: batchStartIndex + result.index,
      });
    }

    globalSuccessful += batchResult.successful;
    globalFailed += batchResult.failed;

    // Check for cancellation between batches
    if (parallelOptions.shouldCancel && parallelOptions.shouldCancel()) {
      batchLogger.info('Batch processing cancelled');
      break;
    }
  }

  const duration = Date.now() - startTime;

  return {
    total: items.length,
    successful: globalSuccessful,
    failed: globalFailed,
    results: allResults,
    duration,
  };
}

// =============================================================================
// Export
// =============================================================================

export const Parallel = {
  map: parallelMap,
  filter: parallelFilter,
  sequential: sequentialMap,
  batches: processBatches,
  createBatches,
  getOptimalConcurrency,
  setCustomConcurrency,
  clearConcurrencyCache,
  getConcurrencyStats,
};

export default Parallel;
