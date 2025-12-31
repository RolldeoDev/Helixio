/**
 * Series Creation Phase
 *
 * Phase 3 of the library scanner. Creates series records SEQUENTIALLY
 * to eliminate race conditions. This is the critical phase.
 */

import { getDatabase } from '../../database.service.js';
import { createSeries, getSeriesByIdentity } from '../../series/index.js';
import { createServiceLogger } from '../../logger.service.js';
import type { SeriesResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-series');

/**
 * Create series from all unique seriesNameRaw values.
 * IMPORTANT: This runs SEQUENTIALLY to prevent race conditions.
 */
export async function createSeriesFromFiles(
  libraryId: string,
  options: {
    onProgress?: ProgressCallback;
    shouldCancel?: () => boolean;
  } = {}
): Promise<SeriesResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const onProgress = options.onProgress ?? (() => {});

  let created = 0;
  let existing = 0;
  let errors = 0;

  // Get distinct series names that need processing
  // Only files without a seriesId but with seriesNameRaw
  const distinctSeriesNames = await db.comicFile.findMany({
    where: {
      libraryId,
      seriesId: null,
      seriesNameRaw: { not: null },
    },
    select: {
      seriesNameRaw: true,
    },
    distinct: ['seriesNameRaw'],
    orderBy: { seriesNameRaw: 'asc' },
  });

  const uniqueNames = distinctSeriesNames
    .map(f => f.seriesNameRaw)
    .filter((name): name is string => name !== null);

  const total = uniqueNames.length;

  if (total === 0) {
    return {
      success: true,
      processed: 0,
      errors: 0,
      duration: Date.now() - startTime,
      created: 0,
      existing: 0,
    };
  }

  onProgress({
    phase: 'series',
    current: 0,
    total,
    message: `Creating series: 0/${total}`,
  });

  // Process each series name SEQUENTIALLY - no parallelism here!
  for (let i = 0; i < uniqueNames.length; i++) {
    if (options.shouldCancel?.()) break;

    const seriesName = uniqueNames[i]!;

    try {
      // Get first file's metadata for this series (alphabetically by path)
      const firstFile = await db.comicFile.findFirst({
        where: {
          libraryId,
          seriesNameRaw: seriesName,
        },
        include: {
          metadata: true,
        },
        orderBy: { relativePath: 'asc' },
      });

      if (!firstFile) continue;

      const metadata = firstFile.metadata;

      // Check if series already exists (case-insensitive)
      const existingSeries = await getSeriesByIdentity(
        seriesName,
        null, // Don't match on year for identity
        metadata?.publisher ?? null
      );

      if (existingSeries) {
        existing++;
        logger.debug({ seriesName, seriesId: existingSeries.id }, 'Series already exists');
      } else {
        // Create new series with first file's metadata
        try {
          await createSeries({
            name: seriesName,
            startYear: metadata?.year ?? null,
            publisher: metadata?.publisher ?? null,
            genres: metadata?.genre ?? null,
            tags: metadata?.tags ?? null,
            languageISO: metadata?.languageISO ?? null,
            ageRating: metadata?.ageRating ?? null,
            comicVineId: metadata?.comicVineId ?? null,
            metronId: metadata?.metronId ?? null,
            primaryFolder: firstFile.relativePath.includes('/')
              ? firstFile.relativePath.substring(0, firstFile.relativePath.lastIndexOf('/'))
              : null,
          });
          created++;
          logger.debug({ seriesName }, 'Created new series');
        } catch (err) {
          // Handle race condition where series was created between check and create
          if (err instanceof Error && err.message.includes('already exists')) {
            existing++;
            logger.debug({ seriesName }, 'Series created by concurrent process');
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      errors++;
      logger.warn({ seriesName, error: err }, 'Failed to create series');
    }

    onProgress({
      phase: 'series',
      current: i + 1,
      total,
      message: `Creating series: ${i + 1}/${total}`,
      detail: `${created} new, ${existing} existing`,
    });
  }

  const duration = Date.now() - startTime;

  logger.info({
    libraryId,
    total: uniqueNames.length,
    created,
    existing,
    errors,
    duration,
  }, 'Series creation phase complete');

  return {
    success: true,
    processed: uniqueNames.length,
    errors,
    duration,
    created,
    existing,
  };
}
