/**
 * Cover Extraction Phase
 *
 * Phase 5 of the library scanner. Extracts and caches cover images.
 * Mostly reuses existing cover.service.ts logic.
 */

import { getDatabase } from '../../database.service.js';
import { batchExtractCovers, recalculateSeriesCover } from '../../cover.service.js';
import { createServiceLogger } from '../../logger.service.js';
import type { CoverResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-covers');

const BATCH_SIZE = 20;

/**
 * Extract covers for all files that need them.
 */
export async function extractCovers(
  libraryId: string,
  options: {
    onProgress?: ProgressCallback;
    shouldCancel?: () => boolean;
    batchSize?: number;
  } = {}
): Promise<CoverResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const onProgress = options.onProgress ?? (() => {});

  let extracted = 0;
  let cached = 0;
  let errors = 0;
  const affectedSeriesIds = new Set<string>();

  // Get files needing covers
  const files = await db.comicFile.findMany({
    where: {
      libraryId,
      status: 'indexed',
      coverHash: null,
    },
    select: { id: true, seriesId: true },
  });

  const total = files.length;

  if (total === 0) {
    return {
      success: true,
      processed: 0,
      errors: 0,
      duration: Date.now() - startTime,
      extracted: 0,
      cached: 0,
    };
  }

  onProgress({
    phase: 'covers',
    current: 0,
    total,
    message: `Extracting covers: 0/${total}`,
  });

  // Collect affected series
  for (const file of files) {
    if (file.seriesId) {
      affectedSeriesIds.add(file.seriesId);
    }
  }

  // Process in batches
  const fileIds = files.map(f => f.id);

  for (let i = 0; i < fileIds.length; i += batchSize) {
    if (options.shouldCancel?.()) break;

    const batch = fileIds.slice(i, i + batchSize);

    try {
      const result = await batchExtractCovers(batch);
      extracted += result.success;
      cached += result.cached;
      errors += result.failed;
    } catch (err) {
      errors += batch.length;
      logger.warn({ batchStart: i, error: err }, 'Failed to extract batch of covers');
    }

    const processed = Math.min(i + batchSize, total);
    onProgress({
      phase: 'covers',
      current: processed,
      total,
      message: `Extracting covers: ${processed}/${total}`,
      detail: `${extracted} extracted, ${cached} cached`,
    });
  }

  // Update series covers
  onProgress({
    phase: 'covers',
    current: total,
    total,
    message: 'Updating series covers...',
  });

  for (const seriesId of affectedSeriesIds) {
    try {
      await recalculateSeriesCover(seriesId);
    } catch (err) {
      logger.warn({ seriesId, error: err }, 'Failed to recalculate series cover');
    }
  }

  const duration = Date.now() - startTime;

  logger.info({
    libraryId,
    extracted,
    cached,
    errors,
    affectedSeries: affectedSeriesIds.size,
    duration,
  }, 'Cover extraction phase complete');

  return {
    success: true,
    processed: total,
    errors,
    duration,
    extracted,
    cached,
  };
}
