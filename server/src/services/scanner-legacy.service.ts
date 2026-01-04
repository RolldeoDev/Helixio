/**
 * Scanner Legacy Service
 *
 * Contains legacy functions from the original scanner that are still needed
 * for backward compatibility but don't fit in the new folder-first architecture.
 */

import { getDatabase } from './database.service.js';
import { autoLinkFileToSeries } from './series-matcher.service.js';
import { refreshMetadataCache } from './metadata-cache.service.js';
import { refreshTagsFromFile } from './tag-autocomplete.service.js';
import { scannerLogger } from './logger.service.js';

/**
 * Process existing files that haven't been linked to series yet.
 * This extracts metadata and creates/links to series for all unprocessed files.
 */
export async function processExistingFiles(libraryId?: string): Promise<{
  processed: number;
  linked: number;
  created: number;
  failed: number;
}> {
  const db = getDatabase();

  // Find files that either:
  // 1. Don't have metadata cached yet, or
  // 2. Don't have a seriesId (not linked to series)
  const whereClause = libraryId
    ? {
        libraryId,
        OR: [
          { metadata: null },
          { seriesId: null },
        ],
      }
    : {
        OR: [
          { metadata: null },
          { seriesId: null },
        ],
      };

  const files = await db.comicFile.findMany({
    where: whereClause,
    select: { id: true },
  });

  if (files.length === 0) {
    return { processed: 0, linked: 0, created: 0, failed: 0 };
  }

  const fileIds = files.map((f) => f.id);
  let metadataCached = 0;
  let linked = 0;
  let created = 0;
  let failed = 0;

  for (const fileId of fileIds) {
    try {
      // Step 1: Extract and cache metadata from ComicInfo.xml
      const metadataSuccess = await refreshMetadataCache(fileId);
      if (metadataSuccess) {
        metadataCached++;
        // Extract tags for autocomplete after metadata is cached
        await refreshTagsFromFile(fileId);
      }

      // Step 2: Try to link to series using the extracted metadata
      const result = await autoLinkFileToSeries(fileId);
      if (result.success) {
        if (result.matchType === 'created') {
          created++;
        }
        linked++;

        // Update file status to 'indexed'
        await db.comicFile.update({
          where: { id: fileId },
          data: { status: 'indexed' },
        });
      }
    } catch {
      failed++;
    }
  }

  scannerLogger.info(
    {
      totalFiles: fileIds.length,
      metadataCached,
      linked,
      newSeries: created,
      failed,
    },
    `Processed ${fileIds.length} existing files`
  );

  return { processed: fileIds.length, linked, created, failed };
}
