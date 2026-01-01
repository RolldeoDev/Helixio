/**
 * Factory Reset Service
 *
 * Handles tiered reset operations for Helixio:
 * - Level 1: Clear cache (covers, thumbnails, series cache, API cache)
 * - Level 2: Clear reading data (progress, history, achievements, collections)
 * - Level 3: Full factory reset (database, config, all cache, logs)
 *
 * CRITICAL: Comic files and library folder structure are NEVER touched.
 */

import { rm, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  getAppDataDir,
  getCacheDir,
  getCoversDir,
  getSeriesCoversDir,
  getSeriesCacheDir,
  getCollectionCoversDir,
  getThumbnailsDir,
  getAvatarsDir,
  getLogsDir,
  getDatabasePath,
  getConfigPath,
} from './app-paths.service.js';
import {
  SecureStorage,
  API_KEY_COMICVINE,
  API_KEY_METRON,
  API_KEY_ANTHROPIC,
} from './secure-storage.service.js';
import { getDatabase, closeDatabase } from './database.service.js';
import { configLogger } from './logger.service.js';

// =============================================================================
// Types
// =============================================================================

export type ResetLevel = 1 | 2 | 3;

export interface ResetOptions {
  level: ResetLevel;
  clearKeychain?: boolean;
}

export interface ResetResult {
  success: boolean;
  error?: string;
  deletedItems: string[];
  clearedTables: string[];
  freedBytes: number;
  requiresRestart: boolean;
}

export interface DirectoryPreview {
  path: string;
  displayPath: string;
  sizeBytes: number;
  exists: boolean;
}

export interface ResetPreview {
  level: ResetLevel;
  directories: DirectoryPreview[];
  databaseTables: string[];
  estimatedSizeBytes: number;
  description: string;
}

// =============================================================================
// Level Descriptions
// =============================================================================

const LEVEL_DESCRIPTIONS: Record<ResetLevel, string> = {
  1: 'Clear cache only - removes cover images, thumbnails, and cached metadata. Your reading progress and settings are preserved.',
  2: 'Clear reading data - removes cache plus all reading progress, history, achievements, and collections. Library structure is preserved.',
  3: 'Full factory reset - removes all Helixio data including database, settings, and cache. You will need to reconfigure everything.',
};

// =============================================================================
// Database Tables by Level
// =============================================================================

// Tables cleared at Level 1 (cache tables only)
const LEVEL_1_TABLES = ['APICache', 'CacheStats', 'SeriesCache'];

// Tables cleared at Level 2 (reading data + level 1)
// Note: Bookmarks are stored as JSON fields within ReadingProgress/UserReadingProgress,
// not as a separate table, so they're cleared when those tables are deleted.
const LEVEL_2_TABLES = [
  ...LEVEL_1_TABLES,
  'ReadingProgress',
  'ReadingHistory',
  'ReadingQueue',
  'ReadingStats',
  'SeriesProgress',
  'UserReadingProgress',
  'UserAchievement',
  'Collection',
  'CollectionItem',
  'EntityStat',
  'LibraryStat',
  'StatsDirtyFlag',
  'UserStat',
];

// Level 3 deletes the entire database file

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Recursively calculate directory size in bytes
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  if (!existsSync(dirPath)) {
    return 0;
  }

  let size = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += await getDirectorySize(fullPath);
      } else {
        try {
          const stats = await stat(fullPath);
          size += stats.size;
        } catch {
          // Ignore files we can't stat
        }
      }
    }
  } catch {
    // Ignore directories we can't read
  }
  return size;
}

/**
 * Format path for display (replace home dir with ~)
 */
function formatPathForDisplay(fullPath: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDir && fullPath.startsWith(homeDir)) {
    return fullPath.replace(homeDir, '~');
  }
  return fullPath;
}

/**
 * Safely delete a directory with logging
 */
async function deleteDirectory(
  dirPath: string,
  name: string
): Promise<{ deleted: boolean; freedBytes: number }> {
  if (!existsSync(dirPath)) {
    configLogger.debug({ path: dirPath }, `Directory does not exist: ${name}`);
    return { deleted: false, freedBytes: 0 };
  }

  try {
    const size = await getDirectorySize(dirPath);
    await rm(dirPath, { recursive: true, force: true });
    configLogger.info({ path: dirPath, size }, `Deleted directory: ${name}`);
    return { deleted: true, freedBytes: size };
  } catch (error) {
    configLogger.error({ error, path: dirPath }, `Failed to delete directory: ${name}`);
    throw error;
  }
}

/**
 * Safely delete a file with logging
 */
async function deleteFile(
  filePath: string,
  name: string
): Promise<{ deleted: boolean; freedBytes: number }> {
  if (!existsSync(filePath)) {
    configLogger.debug({ path: filePath }, `File does not exist: ${name}`);
    return { deleted: false, freedBytes: 0 };
  }

  try {
    const stats = await stat(filePath);
    const size = stats.size;
    await rm(filePath, { force: true });
    configLogger.info({ path: filePath, size }, `Deleted file: ${name}`);
    return { deleted: true, freedBytes: size };
  } catch (error) {
    configLogger.error({ error, path: filePath }, `Failed to delete file: ${name}`);
    throw error;
  }
}

// =============================================================================
// Cache Operations (Level 1)
// =============================================================================

/**
 * Clear all cache directories
 */
async function clearCacheDirectories(): Promise<{ deleted: string[]; freedBytes: number }> {
  const deleted: string[] = [];
  let freedBytes = 0;

  const cacheDirectories = [
    { name: 'Cover cache', path: getCoversDir() },
    { name: 'Series covers cache', path: getSeriesCoversDir() },
    { name: 'Collection covers cache', path: getCollectionCoversDir() },
    { name: 'Series metadata cache', path: getSeriesCacheDir() },
    { name: 'Thumbnails cache', path: getThumbnailsDir() },
  ];

  for (const dir of cacheDirectories) {
    try {
      const result = await deleteDirectory(dir.path, dir.name);
      if (result.deleted) {
        deleted.push(dir.name);
        freedBytes += result.freedBytes;
      }
    } catch (error) {
      configLogger.warn({ error, path: dir.path }, `Failed to delete ${dir.name}, continuing...`);
    }
  }

  return { deleted, freedBytes };
}

/**
 * Clear cache-related database tables
 */
async function clearCacheTables(): Promise<string[]> {
  const clearedTables: string[] = [];
  const db = getDatabase();

  try {
    await db.$transaction([
      db.aPICache.deleteMany(),
      db.cacheStats.deleteMany(),
      db.seriesCache.deleteMany(),
    ]);
    clearedTables.push('APICache', 'CacheStats', 'SeriesCache');
  } catch (error) {
    configLogger.error({ error }, 'Failed to clear cache tables');
    throw error;
  }

  return clearedTables;
}

// =============================================================================
// Reading Data Operations (Level 2)
// =============================================================================

/**
 * Clear all reading-related database tables
 * Order matters for foreign key constraints!
 */
async function clearReadingDataTables(): Promise<string[]> {
  const clearedTables: string[] = [];
  const db = getDatabase();

  try {
    // Delete in order to respect foreign key constraints
    await db.$transaction([
      // Collections first (depends on nothing in this list)
      db.collectionItem.deleteMany(),
      db.collection.deleteMany(),

      // Reading data
      db.readingHistory.deleteMany(),
      db.readingProgress.deleteMany(),
      db.readingQueue.deleteMany(),
      db.readingStats.deleteMany(),
      db.seriesProgress.deleteMany(),
      db.userReadingProgress.deleteMany(),

      // Achievements
      db.userAchievement.deleteMany(),

      // Stats
      db.entityStat.deleteMany(),
      db.libraryStat.deleteMany(),
      db.statsDirtyFlag.deleteMany(),
      db.userStat.deleteMany(),
    ]);

    clearedTables.push(
      'CollectionItem',
      'Collection',
      'ReadingHistory',
      'ReadingProgress',
      'ReadingQueue',
      'ReadingStats',
      'SeriesProgress',
      'UserReadingProgress',
      'UserAchievement',
      'EntityStat',
      'LibraryStat',
      'StatsDirtyFlag',
      'UserStat'
    );
  } catch (error) {
    configLogger.error({ error }, 'Failed to clear reading data tables');
    throw error;
  }

  return clearedTables;
}

// =============================================================================
// Full Reset Operations (Level 3)
// =============================================================================

/**
 * Clear all API keys from OS Keychain
 */
async function clearKeychain(): Promise<boolean> {
  const keysToDelete = [API_KEY_COMICVINE, API_KEY_METRON, API_KEY_ANTHROPIC];
  let anyDeleted = false;

  for (const keyId of keysToDelete) {
    try {
      const deleted = await SecureStorage.deleteApiKey(keyId);
      if (deleted) {
        anyDeleted = true;
        configLogger.info({ keyId }, 'Deleted API key from keychain');
      }
    } catch (error) {
      configLogger.warn({ error, keyId }, 'Failed to delete API key from keychain');
    }
  }

  return anyDeleted;
}

/**
 * Delete all database files (main DB + WAL + SHM)
 */
async function deleteDatabaseFiles(): Promise<{ deleted: string[]; freedBytes: number }> {
  const deleted: string[] = [];
  let freedBytes = 0;

  const dbPath = getDatabasePath();
  const dbFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

  // Disconnect from database first
  try {
    await closeDatabase();
    configLogger.info('Disconnected from database');
    // Wait for connections to fully close
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    configLogger.warn({ error }, 'Error disconnecting from database');
  }

  for (const file of dbFiles) {
    try {
      const result = await deleteFile(file, `Database: ${file.split('/').pop()}`);
      if (result.deleted) {
        deleted.push(file.split('/').pop() || file);
        freedBytes += result.freedBytes;
      }
    } catch (error) {
      configLogger.warn({ error, file }, 'Failed to delete database file');
    }
  }

  return { deleted, freedBytes };
}

/**
 * Delete configuration file
 */
async function deleteConfigFile(): Promise<{ deleted: boolean; freedBytes: number }> {
  const configPath = getConfigPath();
  return deleteFile(configPath, 'config.json');
}

/**
 * Delete logs directory
 */
async function deleteLogsDirectory(): Promise<{ deleted: boolean; freedBytes: number }> {
  const logsDir = getLogsDir();
  return deleteDirectory(logsDir, 'Logs directory');
}

/**
 * Delete avatars directory (user profile images)
 */
async function deleteAvatarsDirectory(): Promise<{ deleted: boolean; freedBytes: number }> {
  const avatarsDir = getAvatarsDir();
  return deleteDirectory(avatarsDir, 'Avatars directory');
}

// =============================================================================
// Main Service Functions
// =============================================================================

/**
 * Get a preview of what will be deleted at each level
 */
export async function getResetPreview(level: ResetLevel): Promise<ResetPreview> {
  const directories: DirectoryPreview[] = [];
  let estimatedSizeBytes = 0;

  // Level 1+: Cache directories
  const cacheDirectories = [
    { name: 'Cover cache', path: getCoversDir() },
    { name: 'Series covers', path: getSeriesCoversDir() },
    { name: 'Collection covers', path: getCollectionCoversDir() },
    { name: 'Series metadata', path: getSeriesCacheDir() },
    { name: 'Thumbnails', path: getThumbnailsDir() },
  ];

  for (const dir of cacheDirectories) {
    const exists = existsSync(dir.path);
    const size = exists ? await getDirectorySize(dir.path) : 0;
    directories.push({
      path: dir.path,
      displayPath: formatPathForDisplay(dir.path),
      sizeBytes: size,
      exists,
    });
    estimatedSizeBytes += size;
  }

  // Level 3: Additional files
  if (level >= 3) {
    // Database
    const dbPath = getDatabasePath();
    const dbExists = existsSync(dbPath);
    const dbSize = dbExists ? (await stat(dbPath)).size : 0;
    directories.push({
      path: dbPath,
      displayPath: formatPathForDisplay(dbPath),
      sizeBytes: dbSize,
      exists: dbExists,
    });
    estimatedSizeBytes += dbSize;

    // Config
    const configPath = getConfigPath();
    const configExists = existsSync(configPath);
    const configSize = configExists ? (await stat(configPath)).size : 0;
    directories.push({
      path: configPath,
      displayPath: formatPathForDisplay(configPath),
      sizeBytes: configSize,
      exists: configExists,
    });
    estimatedSizeBytes += configSize;

    // Logs
    const logsDir = getLogsDir();
    const logsExists = existsSync(logsDir);
    const logsSize = logsExists ? await getDirectorySize(logsDir) : 0;
    directories.push({
      path: logsDir,
      displayPath: formatPathForDisplay(logsDir),
      sizeBytes: logsSize,
      exists: logsExists,
    });
    estimatedSizeBytes += logsSize;

    // Avatars
    const avatarsDir = getAvatarsDir();
    const avatarsExists = existsSync(avatarsDir);
    const avatarsSize = avatarsExists ? await getDirectorySize(avatarsDir) : 0;
    directories.push({
      path: avatarsDir,
      displayPath: formatPathForDisplay(avatarsDir),
      sizeBytes: avatarsSize,
      exists: avatarsExists,
    });
    estimatedSizeBytes += avatarsSize;
  }

  // Determine which tables are affected
  let databaseTables: string[] = [];
  if (level === 1) {
    databaseTables = LEVEL_1_TABLES;
  } else if (level === 2) {
    databaseTables = LEVEL_2_TABLES;
  } else {
    databaseTables = ['ALL TABLES (entire database will be deleted)'];
  }

  return {
    level,
    directories,
    databaseTables,
    estimatedSizeBytes,
    description: LEVEL_DESCRIPTIONS[level],
  };
}

/**
 * Perform factory reset at the specified level
 */
export async function performReset(options: ResetOptions): Promise<ResetResult> {
  const { level, clearKeychain: shouldClearKeychain = false } = options;

  configLogger.warn({ level, clearKeychain: shouldClearKeychain }, 'Starting factory reset');

  const deletedItems: string[] = [];
  const clearedTables: string[] = [];
  let freedBytes = 0;

  try {
    // Level 1: Clear cache
    if (level >= 1) {
      // Clear cache directories
      const cacheResult = await clearCacheDirectories();
      deletedItems.push(...cacheResult.deleted);
      freedBytes += cacheResult.freedBytes;

      // Clear cache tables (only if not doing full reset which deletes DB)
      if (level < 3) {
        const cacheTables = await clearCacheTables();
        clearedTables.push(...cacheTables);
      }
    }

    // Level 2: Clear reading data
    if (level >= 2 && level < 3) {
      const readingTables = await clearReadingDataTables();
      clearedTables.push(...readingTables);
    }

    // Level 3: Full reset
    if (level >= 3) {
      // Clear keychain if requested
      if (shouldClearKeychain) {
        const keychainCleared = await clearKeychain();
        if (keychainCleared) {
          deletedItems.push('OS Keychain API keys');
        }
      }

      // Delete avatars (user profile images)
      const avatarsResult = await deleteAvatarsDirectory();
      if (avatarsResult.deleted) {
        deletedItems.push('Avatars directory');
        freedBytes += avatarsResult.freedBytes;
      }

      // Delete logs (while we can still log)
      const logsResult = await deleteLogsDirectory();
      if (logsResult.deleted) {
        deletedItems.push('Logs directory');
        freedBytes += logsResult.freedBytes;
      }

      // Delete config
      const configResult = await deleteConfigFile();
      if (configResult.deleted) {
        deletedItems.push('config.json');
        freedBytes += configResult.freedBytes;
      }

      // Delete database (this must be last!)
      const dbResult = await deleteDatabaseFiles();
      deletedItems.push(...dbResult.deleted.map((f) => `Database file: ${f}`));
      freedBytes += dbResult.freedBytes;
      clearedTables.push('ALL TABLES');
    }

    configLogger.info(
      { level, deletedItems, clearedTables, freedBytes },
      'Factory reset completed successfully'
    );

    return {
      success: true,
      deletedItems,
      clearedTables,
      freedBytes,
      requiresRestart: level >= 3,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    configLogger.error({ error, level }, 'Factory reset failed');

    return {
      success: false,
      error: errorMessage,
      deletedItems,
      clearedTables,
      freedBytes,
      requiresRestart: false,
    };
  }
}

// =============================================================================
// Export
// =============================================================================

export const FactoryResetService = {
  getResetPreview,
  performReset,
};

export default FactoryResetService;
