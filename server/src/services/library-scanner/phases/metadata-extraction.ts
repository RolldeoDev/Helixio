/**
 * Metadata Extraction Phase
 *
 * Phase 2 of the library scanner. Extracts ComicInfo.xml from each file
 * and stores seriesNameRaw for later series creation.
 *
 * Performance optimized with batched database writes to reduce transaction overhead.
 */

import { dirname, basename } from 'path';
import { getDatabase } from '../../database.service.js';
import { batchUpsertFileMetadata } from '../../metadata-cache.service.js';
import { readComicInfo, type ComicInfo } from '../../comicinfo.service.js';
import { parseSeriesFolderName } from '../../series-metadata.service.js';
import { createServiceLogger } from '../../logger.service.js';
import { parallelMap, getOptimalConcurrency } from '../../parallel.service.js';
import type { MetadataResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-metadata');

const BATCH_SIZE = 100;
const DB_FLUSH_SIZE = 100; // Flush database writes every N files

/** Accumulated file update for batching */
interface FileUpdate {
  id: string;
  seriesNameRaw: string;
}

/** Accumulated metadata item for batching */
interface MetadataItem {
  fileId: string;
  comicInfo: ComicInfo;
  filename: string;
  archivePath: string;
}

/** Result from processing a single file */
interface FileProcessResult {
  success: boolean;
  source: 'comicinfo' | 'folder';
  fileUpdate?: FileUpdate;
  metadataItem?: MetadataItem;
}

/**
 * Extract metadata from all files that need it.
 * Sets seriesNameRaw from ComicInfo.xml or folder name fallback.
 *
 * Uses batched database writes to significantly reduce transaction overhead
 * for large libraries (10K-50K files).
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

  // Batch accumulators for database writes
  let batchedFileUpdates: FileUpdate[] = [];
  let batchedMetadataItems: MetadataItem[] = [];

  /**
   * Flush accumulated batches to database in transactions.
   * Returns the number of items that failed to flush.
   */
  async function flushBatches(): Promise<number> {
    if (batchedFileUpdates.length === 0 && batchedMetadataItems.length === 0) {
      return 0;
    }

    const itemCount = batchedFileUpdates.length;

    try {
      // Update ComicFile records in a single transaction
      if (batchedFileUpdates.length > 0) {
        await db.$transaction(
          batchedFileUpdates.map(({ id, seriesNameRaw }) =>
            db.comicFile.update({
              where: { id },
              data: { seriesNameRaw },
            })
          )
        );
      }

      // Batch upsert metadata if we have items
      if (batchedMetadataItems.length > 0) {
        const metadataResult = await batchUpsertFileMetadata(batchedMetadataItems);
        if (!metadataResult.success) {
          // Metadata upsert failed - log but don't throw since file updates succeeded
          // This is acceptable because:
          // 1. The file's seriesNameRaw is set, enabling series grouping
          // 2. Metadata can be regenerated on next scan or manually
          logger.warn(
            { error: metadataResult.error, count: batchedMetadataItems.length },
            'Batch metadata upsert failed (file updates succeeded)'
          );
        }
      }

      logger.debug(
        { fileUpdates: batchedFileUpdates.length, metadataItems: batchedMetadataItems.length },
        'Flushed database batches'
      );

      // Clear batches after successful flush
      batchedFileUpdates = [];
      batchedMetadataItems = [];
      return 0;
    } catch (err) {
      logger.error(
        { error: err, fileUpdates: batchedFileUpdates.length, metadataItems: batchedMetadataItems.length },
        'Failed to flush batch'
      );
      // Clear batches to avoid infinite retry
      batchedFileUpdates = [];
      batchedMetadataItems = [];
      return itemCount;
    }
  }

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

    // Process batch in parallel - extract metadata and return results
    // Each parallel worker returns its data rather than mutating shared state
    const results = await parallelMap(
      files,
      async (file): Promise<FileProcessResult> => {
        try {
          // Read ComicInfo.xml from archive
          const comicInfoResult = await readComicInfo(file.path);
          let comicInfo = comicInfoResult.comicInfo;

          // Get the series name
          let seriesName: string | null = null;
          let source: 'comicinfo' | 'folder' = 'folder';

          if (comicInfo?.Series) {
            // Use ComicInfo.xml series name
            seriesName = comicInfo.Series;
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

            // Create minimal ComicInfo for files without metadata
            if (!comicInfo) {
              comicInfo = { Series: seriesName };
            }
          }

          // Return the data to be accumulated after parallelMap completes
          return {
            success: true,
            source,
            fileUpdate: seriesName ? { id: file.id, seriesNameRaw: seriesName } : undefined,
            metadataItem: comicInfo ? {
              fileId: file.id,
              comicInfo,
              filename: file.filename,
              archivePath: file.path,
            } : undefined,
          };
        } catch (err) {
          logger.warn({ fileId: file.id, error: err }, 'Failed to extract metadata');
          return { success: false, source: 'folder' };
        }
      },
      {
        concurrency,
        shouldCancel: options.shouldCancel,
      }
    );

    // Accumulate results after parallelMap completes (sequential, no race condition)
    for (const result of results.results) {
      if (result.success && result.result) {
        processed++;
        if (result.result.source === 'comicinfo') {
          fromComicInfo++;
        } else {
          fromFolder++;
        }

        // Accumulate for batched DB write
        if (result.result.fileUpdate) {
          batchedFileUpdates.push(result.result.fileUpdate);
        }
        if (result.result.metadataItem) {
          batchedMetadataItems.push(result.result.metadataItem);
        }
      } else {
        errors++;
      }
    }

    // Flush batches periodically to avoid unbounded memory growth
    if (batchedFileUpdates.length >= DB_FLUSH_SIZE) {
      const failedCount = await flushBatches();
      if (failedCount > 0) {
        errors += failedCount;
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

  // Flush any remaining batched updates
  if (batchedFileUpdates.length > 0 || batchedMetadataItems.length > 0) {
    const failedCount = await flushBatches();
    if (failedCount > 0) {
      errors += failedCount;
    }
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
