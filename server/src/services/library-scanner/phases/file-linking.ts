/**
 * File Linking Phase
 *
 * Phase 4 of the library scanner. Links files to their series.
 * Safe to parallelize since all series already exist.
 */

import { getDatabase } from '../../database.service.js';
import { updateSeriesProgress } from '../../series/index.js';
import { createServiceLogger } from '../../logger.service.js';
import { parallelMap, getOptimalConcurrency } from '../../parallel.service.js';
import type { LinkingResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-linking');

const BATCH_SIZE = 100;

/**
 * Normalize a series key for lookup.
 * Uses lowercase name + publisher (or empty string if no publisher).
 */
function normalizeSeriesKey(name: string, publisher: string | null): string {
  return `${name.toLowerCase()}|${(publisher ?? '').toLowerCase()}`;
}

/**
 * Link all unlinked files to their corresponding series.
 */
export async function linkFilesToSeries(
  libraryId: string,
  options: {
    onProgress?: ProgressCallback;
    shouldCancel?: () => boolean;
    batchSize?: number;
  } = {}
): Promise<LinkingResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const onProgress = options.onProgress ?? (() => {});

  let linked = 0;
  let errors = 0;
  const affectedSeriesIds = new Set<string>();

  // Build series lookup map (all non-deleted series)
  const allSeries = await db.series.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, publisher: true },
  });

  const seriesMap = new Map<string, string>();
  for (const series of allSeries) {
    const key = normalizeSeriesKey(series.name, series.publisher);
    seriesMap.set(key, series.id);

    // Also add key without publisher for fallback matching
    const keyNoPublisher = normalizeSeriesKey(series.name, null);
    if (!seriesMap.has(keyNoPublisher)) {
      seriesMap.set(keyNoPublisher, series.id);
    }
  }

  // Count files to link
  const totalCount = await db.comicFile.count({
    where: {
      libraryId,
      seriesId: null,
      seriesNameRaw: { not: null },
    },
  });

  if (totalCount === 0) {
    return {
      success: true,
      processed: 0,
      errors: 0,
      duration: Date.now() - startTime,
      linked: 0,
    };
  }

  onProgress({
    phase: 'linking',
    current: 0,
    total: totalCount,
    message: `Linking files: 0/${totalCount}`,
  });

  // Process in batches with parallelism
  const concurrency = Math.min(getOptimalConcurrency('io'), 8);
  let processed = 0;

  while (true) {
    if (options.shouldCancel?.()) break;

    const files = await db.comicFile.findMany({
      where: {
        libraryId,
        seriesId: null,
        seriesNameRaw: { not: null },
      },
      select: {
        id: true,
        seriesNameRaw: true,
        metadata: {
          select: { publisher: true },
        },
      },
      take: batchSize,
    });

    if (files.length === 0) break;

    // Process batch in parallel
    const results = await parallelMap(
      files,
      async (file) => {
        if (!file.seriesNameRaw) return { success: false };

        try {
          // Look up series by name + publisher
          const publisher = file.metadata?.publisher ?? null;
          let seriesId = seriesMap.get(normalizeSeriesKey(file.seriesNameRaw, publisher));

          // Fallback to name-only lookup
          if (!seriesId) {
            seriesId = seriesMap.get(normalizeSeriesKey(file.seriesNameRaw, null));
          }

          if (!seriesId) {
            logger.warn({ fileId: file.id, seriesNameRaw: file.seriesNameRaw }, 'No matching series found');
            return { success: false };
          }

          // Link file to series
          await db.comicFile.update({
            where: { id: file.id },
            data: {
              seriesId,
              status: 'indexed',
            },
          });

          return { success: true, seriesId };
        } catch (err) {
          logger.warn({ fileId: file.id, error: err }, 'Failed to link file');
          return { success: false };
        }
      },
      {
        concurrency,
        shouldCancel: options.shouldCancel,
      }
    );

    // Count results
    for (const result of results.results) {
      if (result.success && result.result?.success) {
        linked++;
        if (result.result.seriesId) {
          affectedSeriesIds.add(result.result.seriesId);
        }
      } else {
        errors++;
      }
    }

    processed += files.length;

    onProgress({
      phase: 'linking',
      current: processed,
      total: totalCount,
      message: `Linking files: ${processed}/${totalCount}`,
      detail: `${linked} linked`,
    });
  }

  // Update progress for all affected series
  onProgress({
    phase: 'linking',
    current: totalCount,
    total: totalCount,
    message: 'Updating series progress...',
  });

  for (const seriesId of affectedSeriesIds) {
    try {
      await updateSeriesProgress(seriesId);
    } catch (err) {
      logger.warn({ seriesId, error: err }, 'Failed to update series progress');
    }
  }

  const duration = Date.now() - startTime;

  logger.info({
    libraryId,
    linked,
    errors,
    affectedSeries: affectedSeriesIds.size,
    duration,
  }, 'File linking phase complete');

  return {
    success: true,
    processed,
    errors,
    duration,
    linked,
  };
}
