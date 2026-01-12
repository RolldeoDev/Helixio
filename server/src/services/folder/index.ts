/**
 * Folder Services
 *
 * Materialized folder hierarchy for optimized folder queries.
 * Replaces the derived folder cache with pre-computed database records.
 */

// CRUD Operations
export {
  // Query
  getRootFolders,
  getFolderChildren,
  getFolderById,
  getFolderByPath,
  getFolderAncestors,
  getFolderTree,
  getAllFolders,

  // Mutation
  ensureFolderPath,
  deleteFolder,
  renameFolder,

  // Count Management
  incrementFolderFileCounts,
  recalculateFolderCounts,
  recalculateLibraryCounts,
  pruneEmptyFolders,

  // Utilities
  calculateDepth,
  getParentPath,
  getAllAncestorPaths,
  extractName,

  // Types
  type FolderDTO,
  type FolderTreeNode,
} from './folder-crud.service.js';

// Migration
export {
  ensureFoldersBackfilled,
  backfillLibraryFolders,
} from './folder-migration.service.js';
