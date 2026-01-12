/**
 * Folder CRUD Service
 *
 * Core operations for the materialized folder hierarchy:
 * - Query operations (getRootFolders, getChildren, getByPath, getAncestors)
 * - Mutation operations (ensureFolderPath, deleteFolder, renameFolder)
 * - Count management (incrementFileCount, recalculateFolderCounts)
 *
 * Follows patterns from series-crud.service.ts
 */

import { PrismaClient, Folder } from '@prisma/client';
import { getDatabase, getWriteDatabase } from '../database.service.js';
import { createServiceLogger } from '../logger.service.js';
import { dirname, basename } from 'path';

const logger = createServiceLogger('folder-crud');

// =============================================================================
// Types
// =============================================================================

export interface FolderDTO {
  id: string;
  libraryId: string;
  path: string;
  name: string;
  depth: number;
  parentId: string | null;
  fileCount: number;
  totalFiles: number;
  childCount: number;
  hasChildren: boolean;
  lastModified: Date | null;
}

export interface FolderTreeNode extends FolderDTO {
  children?: FolderTreeNode[];
}

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Calculate folder depth from path (0 = root level)
 */
function calculateDepth(path: string): number {
  if (!path || path === '.') return -1;
  return path.split('/').length - 1;
}

/**
 * Get parent path from a folder path
 */
function getParentPath(path: string): string | null {
  if (!path || path === '.') return null;
  const parts = path.split('/');
  if (parts.length === 1) return null;
  return parts.slice(0, -1).join('/');
}

/**
 * Get all ancestor paths ordered from root to immediate parent
 */
function getAllAncestorPaths(path: string): string[] {
  if (!path || path === '.') return [];
  const parts = path.split('/');
  const ancestors: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join('/'));
  }
  return ancestors;
}

/**
 * Extract folder name from path
 */
function extractName(path: string): string {
  if (!path || path === '.') return '';
  return path.split('/').pop() || path;
}

/**
 * Convert Folder to FolderDTO
 */
function toDTO(folder: Folder): FolderDTO {
  return {
    id: folder.id,
    libraryId: folder.libraryId,
    path: folder.path,
    name: folder.name,
    depth: folder.depth,
    parentId: folder.parentId,
    fileCount: folder.fileCount,
    totalFiles: folder.totalFiles,
    childCount: folder.childCount,
    hasChildren: folder.childCount > 0,
    lastModified: folder.lastModified,
  };
}

// =============================================================================
// Query Operations
// =============================================================================

/**
 * Get root-level folders for a library (depth = 0)
 */
export async function getRootFolders(libraryId: string): Promise<FolderDTO[]> {
  const db = getDatabase();

  const folders = await db.folder.findMany({
    where: {
      libraryId,
      depth: 0,
    },
    orderBy: { name: 'asc' },
  });

  return folders.map(toDTO);
}

/**
 * Get immediate children of a folder
 */
export async function getFolderChildren(folderId: string): Promise<FolderDTO[]> {
  const db = getDatabase();

  const folders = await db.folder.findMany({
    where: { parentId: folderId },
    orderBy: { name: 'asc' },
  });

  return folders.map(toDTO);
}

/**
 * Get folder by ID
 */
export async function getFolderById(folderId: string): Promise<FolderDTO | null> {
  const db = getDatabase();

  const folder = await db.folder.findUnique({
    where: { id: folderId },
  });

  return folder ? toDTO(folder) : null;
}

/**
 * Get folder by path (exact match)
 */
export async function getFolderByPath(
  libraryId: string,
  path: string
): Promise<FolderDTO | null> {
  const db = getDatabase();

  const folder = await db.folder.findUnique({
    where: {
      libraryId_path: { libraryId, path },
    },
  });

  return folder ? toDTO(folder) : null;
}

/**
 * Get ancestors (breadcrumbs) ordered from root to immediate parent
 */
export async function getFolderAncestors(folderId: string): Promise<FolderDTO[]> {
  const db = getDatabase();

  // Start with the current folder to get its path
  const current = await db.folder.findUnique({
    where: { id: folderId },
  });

  if (!current) return [];

  // Get ancestor paths and query them
  const ancestorPaths = getAllAncestorPaths(current.path);
  if (ancestorPaths.length === 0) return [];

  const ancestors = await db.folder.findMany({
    where: {
      libraryId: current.libraryId,
      path: { in: ancestorPaths },
    },
    orderBy: { depth: 'asc' },
  });

  return ancestors.map(toDTO);
}

/**
 * Get folder tree up to specified depth
 */
export async function getFolderTree(
  folderId: string,
  maxDepth: number = 1
): Promise<FolderTreeNode | null> {
  const db = getDatabase();

  const root = await db.folder.findUnique({
    where: { id: folderId },
  });

  if (!root) return null;

  // Fetch descendants up to maxDepth
  const descendants = await db.folder.findMany({
    where: {
      libraryId: root.libraryId,
      path: { startsWith: root.path + '/' },
      depth: { lte: root.depth + maxDepth },
    },
    orderBy: [{ depth: 'asc' }, { name: 'asc' }],
  });

  // Build tree structure
  const nodeMap = new Map<string, FolderTreeNode>();
  const rootNode: FolderTreeNode = { ...toDTO(root), children: [] };
  nodeMap.set(root.id, rootNode);

  for (const folder of descendants) {
    const node: FolderTreeNode = { ...toDTO(folder), children: [] };
    nodeMap.set(folder.id, node);

    // Attach to parent
    if (folder.parentId) {
      const parent = nodeMap.get(folder.parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(node);
      }
    }
  }

  return rootNode;
}

/**
 * Get all folders for a library (flat list)
 */
export async function getAllFolders(
  libraryId: string,
  options?: { includeEmpty?: boolean }
): Promise<FolderDTO[]> {
  const db = getDatabase();

  const where: { libraryId: string; totalFiles?: { gt: number } } = { libraryId };
  if (!options?.includeEmpty) {
    where.totalFiles = { gt: 0 };
  }

  const folders = await db.folder.findMany({
    where,
    orderBy: [{ depth: 'asc' }, { name: 'asc' }],
  });

  return folders.map(toDTO);
}

// =============================================================================
// Mutation Operations
// =============================================================================

/**
 * Ensure folder exists, creating parent chain if needed.
 * Returns existing folder if already present.
 * Idempotent operation.
 */
export async function ensureFolderPath(
  libraryId: string,
  path: string,
  database?: PrismaClient
): Promise<Folder> {
  const db = database || getWriteDatabase();

  // Normalize empty path
  if (!path || path === '.' || path === '') {
    throw new Error('Cannot create folder for root path');
  }

  // Check if folder already exists
  const existing = await db.folder.findUnique({
    where: { libraryId_path: { libraryId, path } },
  });

  if (existing) {
    return existing;
  }

  // Get all ancestor paths that need to exist
  const ancestorPaths = getAllAncestorPaths(path);
  const allPaths = [...ancestorPaths, path];

  // Find which folders already exist
  const existingFolders = await db.folder.findMany({
    where: {
      libraryId,
      path: { in: allPaths },
    },
    select: { id: true, path: true },
  });

  const existingPathMap = new Map(existingFolders.map(f => [f.path, f.id]));

  // Create missing folders in order (parents first)
  let parentId: string | null = null;

  for (const folderPath of allPaths) {
    const existingId = existingPathMap.get(folderPath);
    if (existingId) {
      parentId = existingId;
      continue;
    }

    // Need to create this folder
    const name = extractName(folderPath);
    const depth = calculateDepth(folderPath);

    let created: Folder;
    try {
      created = await db.folder.create({
        data: {
          libraryId,
          path: folderPath,
          name,
          depth,
          parentId,
        },
      });

      // Update parent's childCount (only if we created the folder)
      if (parentId) {
        await db.folder.update({
          where: { id: parentId },
          data: { childCount: { increment: 1 } },
        });
      }
    } catch (error) {
      // Handle race condition: another concurrent request created this folder
      // Check for Prisma unique constraint violation (P2002)
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        // Folder was created by concurrent request - fetch it
        const existing = await db.folder.findUnique({
          where: { libraryId_path: { libraryId, path: folderPath } },
        });
        if (existing) {
          parentId = existing.id;
          existingPathMap.set(folderPath, existing.id);
          continue;
        }
      }
      // Re-throw other errors
      throw error;
    }

    parentId = created.id;

    // Cache for subsequent iterations
    existingPathMap.set(folderPath, created.id);

    logger.debug({ libraryId, path: folderPath, depth }, 'Created folder');
  }

  // Return the target folder
  const result = await db.folder.findUnique({
    where: { libraryId_path: { libraryId, path } },
  });

  if (!result) {
    throw new Error(`Failed to create folder: ${path}`);
  }

  return result;
}

/**
 * Delete a folder and optionally its children
 * Throws if folder has files (unless force=true)
 */
export async function deleteFolder(
  folderId: string,
  options?: { force?: boolean; database?: PrismaClient }
): Promise<void> {
  const db = options?.database || getWriteDatabase();

  const folder = await db.folder.findUnique({
    where: { id: folderId },
    include: { _count: { select: { files: true, children: true } } },
  });

  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`);
  }

  // Check for files
  if (folder._count.files > 0 && !options?.force) {
    throw new Error(
      `Cannot delete folder with files. Use force=true to override.`
    );
  }

  // Delete folder (cascade handles children due to schema)
  await db.folder.delete({ where: { id: folderId } });

  // Update parent's childCount
  if (folder.parentId) {
    await db.folder.update({
      where: { id: folder.parentId },
      data: { childCount: { decrement: 1 } },
    });
  }

  logger.info({ folderId, path: folder.path }, 'Deleted folder');
}

/**
 * Rename a folder and update all descendant paths
 */
export async function renameFolder(
  folderId: string,
  newName: string,
  database?: PrismaClient
): Promise<Folder> {
  const db = database || getWriteDatabase();

  const folder = await db.folder.findUnique({
    where: { id: folderId },
  });

  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`);
  }

  const oldPath = folder.path;
  const parentPath = getParentPath(oldPath);
  const newPath = parentPath ? `${parentPath}/${newName}` : newName;

  // Check if new path already exists
  const existing = await db.folder.findUnique({
    where: { libraryId_path: { libraryId: folder.libraryId, path: newPath } },
  });

  if (existing && existing.id !== folderId) {
    throw new Error(`Folder already exists at path: ${newPath}`);
  }

  // Update this folder
  const updated = await db.folder.update({
    where: { id: folderId },
    data: {
      name: newName,
      path: newPath,
    },
  });

  // Update all descendant paths
  const oldPrefix = oldPath + '/';
  const newPrefix = newPath + '/';

  // Get all descendants
  const descendants = await db.folder.findMany({
    where: {
      libraryId: folder.libraryId,
      path: { startsWith: oldPrefix },
    },
  });

  // Update each descendant's path
  for (const descendant of descendants) {
    const updatedPath = newPrefix + descendant.path.slice(oldPrefix.length);
    await db.folder.update({
      where: { id: descendant.id },
      data: { path: updatedPath },
    });
  }

  logger.info(
    { folderId, oldPath, newPath, descendantsUpdated: descendants.length },
    'Renamed folder'
  );

  return updated;
}

// =============================================================================
// Count Management
// =============================================================================

/**
 * Increment/decrement file count for folder and propagate totalFiles to ancestors.
 * Most common operation - called on file create/delete.
 */
export async function incrementFolderFileCounts(
  folderId: string,
  delta: number,
  database?: PrismaClient
): Promise<void> {
  const db = database || getWriteDatabase();

  // Get the folder and its ancestors
  const folder = await db.folder.findUnique({
    where: { id: folderId },
  });

  if (!folder) {
    logger.warn({ folderId }, 'Cannot increment counts - folder not found');
    return;
  }

  // Update target folder (both fileCount and totalFiles)
  await db.folder.update({
    where: { id: folderId },
    data: {
      fileCount: { increment: delta },
      totalFiles: { increment: delta },
    },
  });

  // Get ancestor paths and update their totalFiles only
  const ancestorPaths = getAllAncestorPaths(folder.path);
  if (ancestorPaths.length > 0) {
    await db.folder.updateMany({
      where: {
        libraryId: folder.libraryId,
        path: { in: ancestorPaths },
      },
      data: {
        totalFiles: { increment: delta },
      },
    });
  }

  logger.debug(
    { folderId, delta, ancestorCount: ancestorPaths.length },
    'Updated folder file counts'
  );
}

/**
 * Recalculate all counts for a single folder from actual data
 */
export async function recalculateFolderCounts(
  folderId: string,
  database?: PrismaClient
): Promise<void> {
  const db = database || getWriteDatabase();

  // Count direct files
  const fileCount = await db.comicFile.count({
    where: { folderId },
  });

  // Count direct children
  const childCount = await db.folder.count({
    where: { parentId: folderId },
  });

  // Sum totalFiles from children
  const children = await db.folder.findMany({
    where: { parentId: folderId },
    select: { totalFiles: true },
  });
  const childTotalFiles = children.reduce((sum, c) => sum + c.totalFiles, 0);

  // Update folder
  await db.folder.update({
    where: { id: folderId },
    data: {
      fileCount,
      childCount,
      totalFiles: fileCount + childTotalFiles,
    },
  });
}

/**
 * Recalculate all counts for an entire library.
 * Processes folders in depth-first order (deepest first) to ensure
 * children are calculated before parents.
 */
export async function recalculateLibraryCounts(
  libraryId: string,
  options?: {
    database?: PrismaClient;
    progressCallback?: (current: number, total: number) => void;
  }
): Promise<void> {
  const db = options?.database || getWriteDatabase();

  // Get all folders ordered by depth DESC (deepest first)
  const folders = await db.folder.findMany({
    where: { libraryId },
    orderBy: { depth: 'desc' },
    select: { id: true, depth: true },
  });

  logger.info({ libraryId, folderCount: folders.length }, 'Recalculating folder counts');

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i]!;
    await recalculateFolderCounts(folder.id, db);
    options?.progressCallback?.(i + 1, folders.length);
  }

  logger.info({ libraryId, folderCount: folders.length }, 'Completed folder count recalculation');
}

/**
 * Remove empty folders (no files, no children with files)
 * Returns the number of folders removed
 */
export async function pruneEmptyFolders(
  libraryId: string,
  database?: PrismaClient
): Promise<number> {
  const db = database || getWriteDatabase();

  // Find folders with totalFiles = 0 (no files in self or descendants)
  // Process in reverse depth order (deepest first)
  const emptyFolders = await db.folder.findMany({
    where: {
      libraryId,
      totalFiles: 0,
      childCount: 0,
    },
    orderBy: { depth: 'desc' },
    select: { id: true, parentId: true },
  });

  let pruned = 0;

  for (const folder of emptyFolders) {
    try {
      await db.folder.delete({ where: { id: folder.id } });

      // Update parent's childCount
      if (folder.parentId) {
        await db.folder.update({
          where: { id: folder.parentId },
          data: { childCount: { decrement: 1 } },
        });
      }

      pruned++;
    } catch (error) {
      // Folder may have been deleted as part of cascade
      logger.debug({ folderId: folder.id }, 'Folder already deleted');
    }
  }

  if (pruned > 0) {
    logger.info({ libraryId, prunedCount: pruned }, 'Pruned empty folders');
  }

  return pruned;
}

// =============================================================================
// Utility Exports
// =============================================================================

export {
  calculateDepth,
  getParentPath,
  getAllAncestorPaths,
  extractName,
};
