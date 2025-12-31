/**
 * Library Scanner
 *
 * Main orchestrator for the 5-phase library scan.
 * Processes one library at a time to eliminate race conditions.
 */

import { getDatabase } from '../database.service.js';
import { createServiceLogger } from '../logger.service.js';
import { discoverFiles } from './phases/discovery.js';
import { extractMetadata } from './phases/metadata-extraction.js';
import { createSeriesFromFiles } from './phases/series-creation.js';
import { linkFilesToSeries } from './phases/file-linking.js';
import { extractCovers } from './phases/cover-extraction.js';
import type { ScanResult, ScanOptions } from './types.js';

const logger = createServiceLogger('library-scanner');

// Re-export types
export * from './types.js';

/**
 * Run a full library scan with all 5 phases.
 */
export async function scanLibrary(
  libraryId: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const onProgress = options.onProgress ?? (() => {});

  const result: ScanResult = {
    libraryId,
    success: false,
    phases: {},
    totalDuration: 0,
  };

  try {
    // Verify library exists
    const library = await db.library.findUnique({
      where: { id: libraryId },
    });

    if (!library) {
      throw new Error(`Library not found: ${libraryId}`);
    }

    logger.info({ libraryId, rootPath: library.rootPath }, 'Starting library scan');

    // Phase 1: Discovery
    result.phases.discovery = await discoverFiles(libraryId, library.rootPath, {
      onProgress,
      shouldCancel: options.shouldCancel,
      batchSize: options.batchSize,
    });

    if (options.shouldCancel?.()) {
      result.error = 'Scan cancelled';
      result.totalDuration = Date.now() - startTime;
      return result;
    }

    // Phase 2: Metadata Extraction
    result.phases.metadata = await extractMetadata(libraryId, {
      onProgress,
      shouldCancel: options.shouldCancel,
      batchSize: options.batchSize,
    });

    if (options.shouldCancel?.()) {
      result.error = 'Scan cancelled';
      result.totalDuration = Date.now() - startTime;
      return result;
    }

    // Phase 3: Series Creation (SEQUENTIAL - critical for correctness)
    result.phases.series = await createSeriesFromFiles(libraryId, {
      onProgress,
      shouldCancel: options.shouldCancel,
    });

    if (options.shouldCancel?.()) {
      result.error = 'Scan cancelled';
      result.totalDuration = Date.now() - startTime;
      return result;
    }

    // Phase 4: File Linking
    result.phases.linking = await linkFilesToSeries(libraryId, {
      onProgress,
      shouldCancel: options.shouldCancel,
      batchSize: options.batchSize,
    });

    if (options.shouldCancel?.()) {
      result.error = 'Scan cancelled';
      result.totalDuration = Date.now() - startTime;
      return result;
    }

    // Phase 5: Cover Extraction
    result.phases.covers = await extractCovers(libraryId, {
      onProgress,
      shouldCancel: options.shouldCancel,
      batchSize: 20, // Smaller batches for cover extraction
    });

    // Final progress update
    onProgress({
      phase: 'complete',
      current: 1,
      total: 1,
      message: 'Scan complete',
    });

    result.success = true;
    result.totalDuration = Date.now() - startTime;

    logger.info({
      libraryId,
      duration: result.totalDuration,
      phases: result.phases,
    }, 'Library scan complete');

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.totalDuration = Date.now() - startTime;

    logger.error({ libraryId, error }, 'Library scan failed');

    return result;
  }
}
