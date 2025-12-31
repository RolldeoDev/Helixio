/**
 * Discovery Phase
 *
 * Phase 1 of the library scanner. Finds all comic files and creates
 * database records. Idempotent - skips files already in DB.
 */

import { readdir, stat } from 'fs/promises';
import { join, relative, extname, basename } from 'path';
import { getDatabase } from '../../database.service.js';
import { generatePartialHash } from '../../hash.service.js';
import { createServiceLogger } from '../../logger.service.js';
import type { DiscoveryResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-discovery');

const COMIC_EXTENSIONS = new Set(['.cbz', '.cbr', '.cb7']);
const BATCH_SIZE = 100;

interface DiscoveredFile {
  path: string;
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  modifiedAt: Date;
}

/**
 * Discover all comic files in a library directory.
 * Creates ComicFile records for new files, marks missing files as orphaned.
 */
export async function discoverFiles(
  libraryId: string,
  rootPath: string,
  options: {
    onProgress?: ProgressCallback;
    shouldCancel?: () => boolean;
    batchSize?: number;
  } = {}
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const onProgress = options.onProgress ?? (() => {});

  // Get existing file paths for this library
  const existingFiles = await db.comicFile.findMany({
    where: { libraryId },
    select: { id: true, path: true, status: true },
  });
  const existingPathMap = new Map(existingFiles.map(f => [f.path, f]));

  // Discover files on disk
  const discoveredFiles: DiscoveredFile[] = [];
  const discoveredPaths = new Set<string>();
  let scanErrors = 0;

  async function scanDirectory(dirPath: string): Promise<void> {
    if (options.shouldCancel?.()) return;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (options.shouldCancel?.()) return;
        if (entry.name.startsWith('.')) continue;

        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (COMIC_EXTENSIONS.has(ext)) {
            try {
              const stats = await stat(fullPath);
              discoveredFiles.push({
                path: fullPath,
                relativePath: relative(rootPath, fullPath),
                filename: basename(fullPath),
                extension: ext.slice(1),
                size: stats.size,
                modifiedAt: stats.mtime,
              });
              discoveredPaths.add(fullPath);

              if (discoveredFiles.length % 100 === 0) {
                onProgress({
                  phase: 'discovery',
                  current: discoveredFiles.length,
                  total: 0, // Unknown until complete
                  message: `Discovering files: ${discoveredFiles.length} found`,
                });
              }
            } catch (err) {
              scanErrors++;
              logger.warn({ path: fullPath, error: err }, 'Failed to stat file');
            }
          }
        }
      }
    } catch (err) {
      scanErrors++;
      logger.warn({ path: dirPath, error: err }, 'Failed to read directory');
    }
  }

  await scanDirectory(rootPath);

  if (options.shouldCancel?.()) {
    return {
      success: false,
      processed: 0,
      errors: 0,
      duration: Date.now() - startTime,
      newFiles: 0,
      existingFiles: 0,
      orphanedFiles: 0,
    };
  }

  // Process discovered files in batches
  let newFiles = 0;
  let existingCount = 0;
  const filesToCreate: DiscoveredFile[] = [];

  for (const file of discoveredFiles) {
    const existing = existingPathMap.get(file.path);
    if (existing) {
      existingCount++;
      // If it was orphaned, restore it
      if (existing.status === 'orphaned') {
        await db.comicFile.update({
          where: { id: existing.id },
          data: { status: 'pending' },
        });
      }
    } else {
      filesToCreate.push(file);
    }
  }

  // Batch create new files
  for (let i = 0; i < filesToCreate.length; i += batchSize) {
    if (options.shouldCancel?.()) break;

    const batch = filesToCreate.slice(i, i + batchSize);

    for (const file of batch) {
      try {
        const hash = await generatePartialHash(file.path);
        await db.comicFile.create({
          data: {
            libraryId,
            path: file.path,
            relativePath: file.relativePath,
            filename: file.filename,
            extension: file.extension,
            size: file.size,
            modifiedAt: file.modifiedAt,
            hash,
            status: 'pending',
          },
        });
        newFiles++;
      } catch (err) {
        scanErrors++;
        logger.warn({ path: file.path, error: err }, 'Failed to create file record');
      }
    }

    onProgress({
      phase: 'discovery',
      current: i + batch.length,
      total: filesToCreate.length,
      message: `Creating file records: ${i + batch.length}/${filesToCreate.length}`,
    });
  }

  // Mark orphaned files (in DB but not on disk)
  let orphanedCount = 0;
  for (const [path, file] of existingPathMap) {
    if (!discoveredPaths.has(path) && file.status !== 'orphaned') {
      await db.comicFile.update({
        where: { id: file.id },
        data: { status: 'orphaned' },
      });
      orphanedCount++;
    }
  }

  const duration = Date.now() - startTime;

  onProgress({
    phase: 'discovery',
    current: discoveredFiles.length,
    total: discoveredFiles.length,
    message: `Discovery complete: ${newFiles} new, ${existingCount} existing, ${orphanedCount} orphaned`,
  });

  logger.info({
    libraryId,
    newFiles,
    existingFiles: existingCount,
    orphanedFiles: orphanedCount,
    errors: scanErrors,
    duration,
  }, 'Discovery phase complete');

  return {
    success: true,
    processed: discoveredFiles.length,
    errors: scanErrors,
    duration,
    newFiles,
    existingFiles: existingCount,
    orphanedFiles: orphanedCount,
  };
}
