/**
 * Batch Preview Service
 *
 * Generates previews for batch operations before execution.
 * Users can review, approve, modify, or reject individual items.
 */

import { basename, dirname, join } from 'path';
import { getDatabase } from './database.service.js';
import { parseFilename, generateSuggestedFilename } from './filename-parser.service.js';
import { readComicInfo, type ComicInfo } from './comicinfo.service.js';
import { existsSync, statSync } from 'fs';

// =============================================================================
// Types
// =============================================================================

export interface BatchPreviewItem {
  id: string;
  fileId: string;
  filename: string;
  sourcePath: string;
  destinationPath?: string;
  newFilename?: string;
  action: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  approved?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
  changes?: Record<string, { from: unknown; to: unknown }>;
  confidence?: number;
  warnings?: string[];
}

export interface BatchPreviewResult {
  type: string;
  totalItems: number;
  validItems: number;
  warningItems: number;
  errorItems: number;
  items: BatchPreviewItem[];
  summary: {
    totalSize?: number;
    affectedFolders?: number;
    estimatedTime?: string;
  };
}

// =============================================================================
// Rename Preview
// =============================================================================

/**
 * Generate rename preview for files.
 * Parses filenames and suggests standardized names.
 */
export async function generateRenamePreview(fileIds: string[]): Promise<BatchPreviewResult> {
  const db = getDatabase();

  const files = await db.comicFile.findMany({
    where: { id: { in: fileIds } },
    select: {
      id: true,
      path: true,
      filename: true,
      size: true,
    },
  });

  const items: BatchPreviewItem[] = [];
  const affectedFolders = new Set<string>();
  let totalSize = 0;

  for (const file of files) {
    const folderPath = dirname(file.path);
    affectedFolders.add(folderPath);
    totalSize += Number(file.size);

    const warnings: string[] = [];

    try {
      // Parse the filename to get suggested rename
      const parsed = await parseFilename(file.filename, folderPath);
      const suggestedFilename = generateSuggestedFilename(parsed);

      if (!suggestedFilename) {
        items.push({
          id: `rename_${file.id}`,
          fileId: file.id,
          filename: file.filename,
          sourcePath: file.path,
          action: 'rename',
          status: 'pending',
          approved: false,
          error: 'Unable to generate suggested filename',
          confidence: parsed.confidence,
        });
        continue;
      }

      // Check if filename would actually change
      if (suggestedFilename === file.filename) {
        items.push({
          id: `rename_${file.id}`,
          fileId: file.id,
          filename: file.filename,
          sourcePath: file.path,
          newFilename: suggestedFilename,
          destinationPath: file.path,
          action: 'rename',
          status: 'pending',
          approved: false,
          warnings: ['Filename already matches suggested format'],
          confidence: parsed.confidence,
        });
        continue;
      }

      // Check for conflicts
      const newPath = join(folderPath, suggestedFilename);
      if (existsSync(newPath) && newPath !== file.path) {
        warnings.push('File with suggested name already exists');
      }

      // Low confidence warning
      if (parsed.confidence !== undefined && parsed.confidence < 0.5) {
        warnings.push('Low confidence in parsed metadata');
      }

      items.push({
        id: `rename_${file.id}`,
        fileId: file.id,
        filename: file.filename,
        sourcePath: file.path,
        newFilename: suggestedFilename,
        destinationPath: newPath,
        action: 'rename',
        status: 'pending',
        approved: true, // Pre-approve if looks good
        warnings: warnings.length > 0 ? warnings : undefined,
        confidence: parsed.confidence,
        changes: {
          filename: { from: file.filename, to: suggestedFilename },
        },
      });
    } catch (err) {
      items.push({
        id: `rename_${file.id}`,
        fileId: file.id,
        filename: file.filename,
        sourcePath: file.path,
        action: 'rename',
        status: 'pending',
        approved: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return {
    type: 'rename',
    totalItems: items.length,
    validItems: items.filter((i) => !i.error).length,
    warningItems: items.filter((i) => i.warnings && i.warnings.length > 0).length,
    errorItems: items.filter((i) => i.error).length,
    items,
    summary: {
      totalSize,
      affectedFolders: affectedFolders.size,
      estimatedTime: estimateTime(items.length, 'rename'),
    },
  };
}

// =============================================================================
// Move Preview
// =============================================================================

/**
 * Generate move preview for files.
 */
export async function generateMovePreview(
  fileIds: string[],
  destinationFolder: string
): Promise<BatchPreviewResult> {
  const db = getDatabase();

  const files = await db.comicFile.findMany({
    where: { id: { in: fileIds } },
    select: {
      id: true,
      path: true,
      filename: true,
      size: true,
    },
  });

  const items: BatchPreviewItem[] = [];
  const sourceFolders = new Set<string>();
  let totalSize = 0;

  // Check if destination exists
  const destExists = existsSync(destinationFolder);
  const destWarning = destExists ? undefined : 'Destination folder will be created';

  for (const file of files) {
    const sourceFolder = dirname(file.path);
    sourceFolders.add(sourceFolder);
    totalSize += Number(file.size);

    const warnings: string[] = [];
    if (destWarning) {
      warnings.push(destWarning);
    }

    const newPath = join(destinationFolder, file.filename);

    // Check if already in destination
    if (sourceFolder === destinationFolder) {
      items.push({
        id: `move_${file.id}`,
        fileId: file.id,
        filename: file.filename,
        sourcePath: file.path,
        destinationPath: newPath,
        action: 'move',
        status: 'pending',
        approved: false,
        warnings: ['File is already in destination folder'],
      });
      continue;
    }

    // Check for conflicts
    if (existsSync(newPath)) {
      warnings.push('File with same name exists in destination');
    }

    items.push({
      id: `move_${file.id}`,
      fileId: file.id,
      filename: file.filename,
      sourcePath: file.path,
      destinationPath: newPath,
      action: 'move',
      status: 'pending',
      approved: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      changes: {
        folder: { from: sourceFolder, to: destinationFolder },
      },
    });
  }

  return {
    type: 'move',
    totalItems: items.length,
    validItems: items.filter((i) => !i.error && i.approved).length,
    warningItems: items.filter((i) => i.warnings && i.warnings.length > 0).length,
    errorItems: items.filter((i) => i.error).length,
    items,
    summary: {
      totalSize,
      affectedFolders: sourceFolders.size + 1,
      estimatedTime: estimateTime(items.length, 'move'),
    },
  };
}

// =============================================================================
// Metadata Update Preview
// =============================================================================

/**
 * Generate metadata update preview for files.
 */
export async function generateMetadataUpdatePreview(
  fileIds: string[],
  metadata: Record<string, unknown>
): Promise<BatchPreviewResult> {
  const db = getDatabase();

  const files = await db.comicFile.findMany({
    where: { id: { in: fileIds } },
    select: {
      id: true,
      path: true,
      filename: true,
      size: true,
    },
  });

  const items: BatchPreviewItem[] = [];
  const affectedFolders = new Set<string>();
  let totalSize = 0;

  for (const file of files) {
    affectedFolders.add(dirname(file.path));
    totalSize += Number(file.size);

    try {
      // Read current metadata
      let currentMetadata: ComicInfo = {};
      try {
        const result = await readComicInfo(file.path);
        if (result.success && result.comicInfo) {
          currentMetadata = result.comicInfo;
        }
      } catch {
        // File might not have ComicInfo.xml
      }

      // Calculate changes
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, value] of Object.entries(metadata)) {
        const currentValue = currentMetadata[key as keyof ComicInfo];
        if (currentValue !== value) {
          changes[key] = { from: currentValue, to: value };
        }
      }

      if (Object.keys(changes).length === 0) {
        items.push({
          id: `metadata_${file.id}`,
          fileId: file.id,
          filename: file.filename,
          sourcePath: file.path,
          action: 'metadata_update',
          status: 'pending',
          approved: false,
          warnings: ['No changes needed - values already match'],
          metadata,
        });
        continue;
      }

      items.push({
        id: `metadata_${file.id}`,
        fileId: file.id,
        filename: file.filename,
        sourcePath: file.path,
        action: 'metadata_update',
        status: 'pending',
        approved: true,
        metadata,
        changes,
      });
    } catch (err) {
      items.push({
        id: `metadata_${file.id}`,
        fileId: file.id,
        filename: file.filename,
        sourcePath: file.path,
        action: 'metadata_update',
        status: 'pending',
        approved: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        metadata,
      });
    }
  }

  return {
    type: 'metadata_update',
    totalItems: items.length,
    validItems: items.filter((i) => !i.error && i.approved).length,
    warningItems: items.filter((i) => i.warnings && i.warnings.length > 0).length,
    errorItems: items.filter((i) => i.error).length,
    items,
    summary: {
      totalSize,
      affectedFolders: affectedFolders.size,
      estimatedTime: estimateTime(items.length, 'metadata_update'),
    },
  };
}

// =============================================================================
// Delete Preview
// =============================================================================

/**
 * Generate delete preview for files.
 */
export async function generateDeletePreview(fileIds: string[]): Promise<BatchPreviewResult> {
  const db = getDatabase();

  const files = await db.comicFile.findMany({
    where: { id: { in: fileIds } },
    select: {
      id: true,
      path: true,
      filename: true,
      size: true,
    },
  });

  const items: BatchPreviewItem[] = [];
  const affectedFolders = new Set<string>();
  let totalSize = 0;

  for (const file of files) {
    affectedFolders.add(dirname(file.path));

    // Check if file exists
    const exists = existsSync(file.path);
    let fileSize = Number(file.size);

    if (exists) {
      try {
        const stat = statSync(file.path);
        fileSize = stat.size;
      } catch {
        // Use database size
      }
    }

    totalSize += fileSize;

    if (!exists) {
      items.push({
        id: `delete_${file.id}`,
        fileId: file.id,
        filename: file.filename,
        sourcePath: file.path,
        action: 'delete',
        status: 'pending',
        approved: true,
        warnings: ['File not found on disk - will remove from database only'],
      });
      continue;
    }

    items.push({
      id: `delete_${file.id}`,
      fileId: file.id,
      filename: file.filename,
      sourcePath: file.path,
      action: 'delete',
      status: 'pending',
      approved: true,
      changes: {
        size: { from: formatBytes(fileSize), to: 'deleted' },
      },
    });
  }

  return {
    type: 'delete',
    totalItems: items.length,
    validItems: items.filter((i) => !i.error).length,
    warningItems: items.filter((i) => i.warnings && i.warnings.length > 0).length,
    errorItems: items.filter((i) => i.error).length,
    items,
    summary: {
      totalSize,
      affectedFolders: affectedFolders.size,
      estimatedTime: estimateTime(items.length, 'delete'),
    },
  };
}

// =============================================================================
// Conversion Preview
// =============================================================================

/**
 * Generate conversion preview for CBR files in a library.
 */
export async function generateConversionPreview(libraryId: string): Promise<BatchPreviewResult> {
  const db = getDatabase();

  const files = await db.comicFile.findMany({
    where: {
      libraryId,
      filename: { endsWith: '.cbr' },
      status: { not: 'quarantined' },
    },
    select: {
      id: true,
      path: true,
      filename: true,
      size: true,
    },
    orderBy: { path: 'asc' },
  });

  const items: BatchPreviewItem[] = [];
  const affectedFolders = new Set<string>();
  let totalSize = 0;

  for (const file of files) {
    affectedFolders.add(dirname(file.path));
    totalSize += Number(file.size);

    const newFilename = file.filename.replace(/\.cbr$/i, '.cbz');
    const newPath = join(dirname(file.path), newFilename);

    const warnings: string[] = [];

    // Check if CBZ already exists
    if (existsSync(newPath)) {
      warnings.push('CBZ file already exists - will be overwritten');
    }

    // Check if file exists
    if (!existsSync(file.path)) {
      items.push({
        id: `convert_${file.id}`,
        fileId: file.id,
        filename: file.filename,
        sourcePath: file.path,
        newFilename,
        destinationPath: newPath,
        action: 'convert',
        status: 'pending',
        approved: false,
        error: 'Source file not found on disk',
      });
      continue;
    }

    items.push({
      id: `convert_${file.id}`,
      fileId: file.id,
      filename: file.filename,
      sourcePath: file.path,
      newFilename,
      destinationPath: newPath,
      action: 'convert',
      status: 'pending',
      approved: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      changes: {
        format: { from: 'CBR', to: 'CBZ' },
        filename: { from: file.filename, to: newFilename },
      },
    });
  }

  return {
    type: 'convert',
    totalItems: items.length,
    validItems: items.filter((i) => !i.error).length,
    warningItems: items.filter((i) => i.warnings && i.warnings.length > 0).length,
    errorItems: items.filter((i) => i.error).length,
    items,
    summary: {
      totalSize,
      affectedFolders: affectedFolders.size,
      estimatedTime: estimateTime(items.length, 'convert'),
    },
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Estimate time for batch operation.
 */
function estimateTime(itemCount: number, operation: string): string {
  // Rough estimates per operation type
  const secondsPerItem: Record<string, number> = {
    rename: 0.1,
    move: 0.5,
    delete: 0.1,
    metadata_update: 1,
    convert: 10, // Conversion is slow
  };

  const seconds = itemCount * (secondsPerItem[operation] || 1);

  if (seconds < 60) {
    return `~${Math.ceil(seconds)} seconds`;
  } else if (seconds < 3600) {
    return `~${Math.ceil(seconds / 60)} minutes`;
  } else {
    return `~${(seconds / 3600).toFixed(1)} hours`;
  }
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
