/**
 * Series Creation Phase
 *
 * Phase 3 of the library scanner. Creates series records SEQUENTIALLY
 * to eliminate race conditions. This is the critical phase.
 *
 * Enhanced to use series.json metadata when available, falling back to
 * ComicInfo.xml metadata for fields not in series.json.
 */

import { dirname, join } from 'path';
import { getDatabase } from '../../database.service.js';
import { createSeries, getSeriesByIdentity, syncSeriesFromSeriesJson } from '../../series/index.js';
import { readSeriesJson, getSeriesDefinitions } from '../../series-metadata.service.js';
import { createServiceLogger } from '../../logger.service.js';
import type { SeriesResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-series');

/**
 * Create series from all unique seriesNameRaw values.
 * IMPORTANT: This runs SEQUENTIALLY to prevent race conditions.
 *
 * Uses series.json metadata when available for richer series data,
 * falling back to ComicInfo.xml metadata when series.json is not present.
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
  let fromSeriesJson = 0;

  // Get library root path for resolving full folder paths
  const library = await db.library.findUnique({
    where: { id: libraryId },
    select: { rootPath: true },
  });

  if (!library) {
    return {
      success: false,
      processed: 0,
      errors: 1,
      duration: Date.now() - startTime,
      created: 0,
      existing: 0,
    };
  }

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

  // Track folders where we've already processed series.json to avoid duplicates
  const processedSeriesJsonFolders = new Set<string>();

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

      // Compute the full folder path for this file
      const folderPath = dirname(firstFile.path);

      // Try to use series.json if we haven't processed this folder yet
      let seriesCreatedFromJson = false;
      if (!processedSeriesJsonFolders.has(folderPath)) {
        processedSeriesJsonFolders.add(folderPath);

        // Check for series.json in this folder
        const seriesJsonResult = await readSeriesJson(folderPath);
        if (seriesJsonResult.success && seriesJsonResult.metadata) {
          const definitions = getSeriesDefinitions(seriesJsonResult.metadata);

          if (definitions.length > 0) {
            // Use syncSeriesFromSeriesJson which handles all metadata properly
            try {
              const series = await syncSeriesFromSeriesJson(folderPath);
              if (series) {
                seriesCreatedFromJson = true;
                fromSeriesJson++;

                // Check if this was a new series or existing
                // If the series name matches our target, count it
                if (series.name.toLowerCase() === seriesName.toLowerCase()) {
                  created++;
                  logger.debug({
                    seriesName,
                    seriesId: series.id,
                    folder: folderPath,
                  }, 'Created series from series.json');
                }
              }
            } catch (err) {
              // If series.json sync fails, fall back to ComicInfo.xml
              logger.warn({
                folder: folderPath,
                error: err
              }, 'Failed to sync from series.json, falling back to ComicInfo.xml');
            }
          }
        }
      }

      // If we already created from series.json, check if series exists now
      if (seriesCreatedFromJson) {
        const existingSeries = await getSeriesByIdentity(
          seriesName,
          null,
          metadata?.publisher ?? null
        );
        if (existingSeries) {
          // Already counted in created above or was existing
          continue;
        }
      }

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
        // Create new series with first file's metadata (fallback when no series.json)
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
            primaryFolder: folderPath,
          });
          created++;
          logger.debug({ seriesName }, 'Created new series from ComicInfo.xml');
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
      detail: `${created} new, ${existing} existing${fromSeriesJson > 0 ? `, ${fromSeriesJson} from series.json` : ''}`,
    });
  }

  const duration = Date.now() - startTime;

  logger.info({
    libraryId,
    total: uniqueNames.length,
    created,
    existing,
    fromSeriesJson,
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
