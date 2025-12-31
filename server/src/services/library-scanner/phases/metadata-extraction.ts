/**
 * Metadata Extraction Phase
 *
 * Phase 2 of the library scanner. Extracts ComicInfo.xml from each file
 * and stores seriesNameRaw for later series creation.
 */

import { dirname, basename } from 'path';
import { getDatabase } from '../../database.service.js';
import { refreshMetadataCache } from '../../metadata-cache.service.js';
import { parseSeriesFolderName } from '../../series-metadata.service.js';
import { createServiceLogger } from '../../logger.service.js';
import { parallelMap, getOptimalConcurrency } from '../../parallel.service.js';
import type { MetadataResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-metadata');

const BATCH_SIZE = 100;

/**
 * Extract metadata from all files that need it.
 * Sets seriesNameRaw from ComicInfo.xml or folder name fallback.
 */
export async function extractMetadata(
  libraryId: string,
  options: {
    onProgress?: ProgressCallback;
    shouldCancel?: () => boolean;
    batchSize?: number;
  } = {}
): Promise<MetadataResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const onProgress = options.onProgress ?? (() => {});

  let processed = 0;
  let errors = 0;
  let fromComicInfo = 0;
  let fromFolder = 0;

  // Get files needing metadata extraction (seriesNameRaw is null)
  const totalCount = await db.comicFile.count({
    where: {
      libraryId,
      seriesNameRaw: null,
      status: { in: ['pending', 'indexed'] },
    },
  });

  if (totalCount === 0) {
    return {
      success: true,
      processed: 0,
      errors: 0,
      duration: Date.now() - startTime,
      fromComicInfo: 0,
      fromFolder: 0,
    };
  }

  onProgress({
    phase: 'metadata',
    current: 0,
    total: totalCount,
    message: `Extracting metadata: 0/${totalCount} files`,
  });

  // Process in batches
  const concurrency = getOptimalConcurrency('io');

  while (true) {
    if (options.shouldCancel?.()) break;

    const files = await db.comicFile.findMany({
      where: {
        libraryId,
        seriesNameRaw: null,
        status: { in: ['pending', 'indexed'] },
      },
      select: {
        id: true,
        path: true,
        relativePath: true,
        filename: true,
      },
      take: batchSize,
    });

    if (files.length === 0) break;

    // Process batch in parallel
    const results = await parallelMap(
      files,
      async (file) => {
        try {
          // Extract ComicInfo.xml and cache it
          await refreshMetadataCache(file.id);

          // Get the extracted metadata
          const metadata = await db.fileMetadata.findUnique({
            where: { comicId: file.id },
            select: { series: true },
          });

          let seriesName: string | null = null;
          let source: 'comicinfo' | 'folder' = 'folder';

          if (metadata?.series) {
            // Use ComicInfo.xml series name
            seriesName = metadata.series;
            source = 'comicinfo';
          } else {
            // Fallback to folder name
            const folderPath = dirname(file.relativePath);
            const folderName = basename(folderPath);

            if (folderName && folderName !== '.') {
              const parsed = parseSeriesFolderName(folderName);
              seriesName = parsed.seriesName || folderName;
            } else {
              // Last resort: use filename without extension
              seriesName = file.filename.replace(/\.[^.]+$/, '');
            }
          }

          // Update the file with seriesNameRaw
          if (seriesName) {
            await db.comicFile.update({
              where: { id: file.id },
              data: { seriesNameRaw: seriesName },
            });
          }

          return { success: true, source };
        } catch (err) {
          logger.warn({ fileId: file.id, error: err }, 'Failed to extract metadata');
          return { success: false, source: 'folder' as const };
        }
      },
      {
        concurrency,
        shouldCancel: options.shouldCancel,
      }
    );

    // Count results
    for (const result of results.results) {
      if (result.success && result.result) {
        processed++;
        if (result.result.source === 'comicinfo') {
          fromComicInfo++;
        } else {
          fromFolder++;
        }
      } else {
        errors++;
      }
    }

    onProgress({
      phase: 'metadata',
      current: processed,
      total: totalCount,
      message: `Extracting metadata: ${processed}/${totalCount} files`,
      detail: `${fromComicInfo} from ComicInfo, ${fromFolder} from folder`,
    });
  }

  const duration = Date.now() - startTime;

  logger.info({
    libraryId,
    processed,
    errors,
    fromComicInfo,
    fromFolder,
    duration,
  }, 'Metadata extraction phase complete');

  return {
    success: true,
    processed,
    errors,
    duration,
    fromComicInfo,
    fromFolder,
  };
}
