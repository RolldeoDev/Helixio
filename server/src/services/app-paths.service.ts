/**
 * Application Paths Service
 *
 * Manages the ~/.helixio/ application data directory structure.
 * All application state (database, config, cache) is stored here.
 *
 * In Docker, PostgreSQL data is stored at /config/pgdata and the
 * DATABASE_URL is set by the entrypoint script.
 */

import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { logInfo } from './logger.service.js';

// Application data root directory
const APP_DIR_NAME = '.helixio';

/**
 * Get the application data directory path
 * Default: ~/.helixio/
 */
export function getAppDataDir(): string {
  return join(homedir(), APP_DIR_NAME);
}

/**
 * Get the path to the PostgreSQL data directory (Docker only)
 * Returns null for non-Docker environments
 */
export function getPostgresDataDir(): string | null {
  // In Docker, HOME=/config, so pgdata is at /config/pgdata
  if (process.env.HOME === '/config') {
    return '/config/pgdata';
  }
  return null;
}

/**
 * Get the database URL for Prisma
 *
 * Priority:
 * 1. DATABASE_URL environment variable (Docker sets this)
 * 2. Default PostgreSQL connection for local development
 */
export function getDatabaseUrl(): string {
  // Docker entrypoint sets DATABASE_URL
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Local development: use default PostgreSQL connection
  // Developers should have PostgreSQL running locally or use Docker
  return 'postgresql://helixio:helixio@localhost:5432/helixio';
}

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return join(getAppDataDir(), 'config.json');
}

/**
 * Get the path to the logs directory
 */
export function getLogsDir(): string {
  return join(getAppDataDir(), 'logs');
}

/**
 * Get the path to the cache directory
 */
export function getCacheDir(): string {
  return join(getAppDataDir(), 'cache');
}

/**
 * Get the path to the covers cache directory
 */
export function getCoversDir(): string {
  return join(getCacheDir(), 'covers');
}

/**
 * Get the path to the series covers cache directory
 * These are covers downloaded from external APIs (ComicVine, Metron)
 */
export function getSeriesCoversDir(): string {
  return join(getCacheDir(), 'series-covers');
}

/**
 * Get the path to the collection covers cache directory
 * These are server-generated mosaic covers for collections
 */
export function getCollectionCoversDir(): string {
  return join(getCacheDir(), 'collection-covers');
}

/**
 * Get the path to a cached series cover image
 */
export function getSeriesCoverPath(coverHash: string): string {
  return join(getSeriesCoversDir(), `${coverHash}.jpg`);
}

/**
 * Get the path to the thumbnails cache directory
 */
export function getThumbnailsDir(): string {
  return join(getCacheDir(), 'thumbnails');
}

/**
 * Get the path to the avatars directory
 */
export function getAvatarsDir(): string {
  return join(getAppDataDir(), 'avatars');
}

/**
 * Get the path to a user's avatar
 */
export function getAvatarPath(userId: string): string {
  return join(getAvatarsDir(), `${userId}.jpg`);
}

/**
 * Get the path to a library's cover cache directory
 */
export function getLibraryCoverDir(libraryId: string): string {
  return join(getCoversDir(), libraryId);
}

/**
 * Get the path to a cached cover image
 */
export function getCoverPath(libraryId: string, fileHash: string): string {
  return join(getLibraryCoverDir(libraryId), `${fileHash}.jpg`);
}

/**
 * Get the path to the series cache directory
 */
export function getSeriesCacheDir(): string {
  return join(getCacheDir(), 'series');
}

/** All supported metadata sources for caching */
type CacheableSource = 'comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal';

/** List of all cacheable sources */
const ALL_CACHEABLE_SOURCES: CacheableSource[] = ['comicvine', 'metron', 'gcd', 'anilist', 'mal'];

/**
 * Get the path to a source's series cache directory
 */
export function getSourceSeriesCacheDir(source: CacheableSource): string {
  return join(getSeriesCacheDir(), source);
}

/**
 * Get the path to a cached series JSON file
 */
export function getSeriesFilePath(source: CacheableSource, seriesId: string): string {
  return join(getSourceSeriesCacheDir(source), `${seriesId}.json`);
}

/**
 * Get the path to a cached series issues JSON file
 */
export function getSeriesIssuesFilePath(source: CacheableSource, seriesId: string): string {
  return join(getSourceSeriesCacheDir(source), `${seriesId}_issues.json`);
}

/**
 * Ensure all application directories exist
 * Creates the directory structure if it doesn't exist
 */
export function ensureAppDirectories(): void {
  const directories = [
    getAppDataDir(),
    getLogsDir(),
    getCacheDir(),
    getCoversDir(),
    getSeriesCoversDir(),
    getCollectionCoversDir(),
    getThumbnailsDir(),
    getAvatarsDir(),
    getSeriesCacheDir(),
    ...ALL_CACHEABLE_SOURCES.map(getSourceSeriesCacheDir),
  ];

  for (const dir of directories) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logInfo('app-paths', `Created directory: ${dir}`);
    }
  }
}

/**
 * Check if the app data directory exists
 */
export function appDataExists(): boolean {
  return existsSync(getAppDataDir());
}

/**
 * Get all application paths for debugging/logging
 */
export function getAllPaths(): Record<string, string | null> {
  return {
    appDataDir: getAppDataDir(),
    databaseUrl: getDatabaseUrl(),
    postgresDataDir: getPostgresDataDir(),
    config: getConfigPath(),
    logs: getLogsDir(),
    cache: getCacheDir(),
    covers: getCoversDir(),
    thumbnails: getThumbnailsDir(),
    seriesCache: getSeriesCacheDir(),
  };
}

// Export path constants for direct use
export const paths = {
  get appData() {
    return getAppDataDir();
  },
  get databaseUrl() {
    return getDatabaseUrl();
  },
  get postgresDataDir() {
    return getPostgresDataDir();
  },
  get config() {
    return getConfigPath();
  },
  get logs() {
    return getLogsDir();
  },
  get cache() {
    return getCacheDir();
  },
  get covers() {
    return getCoversDir();
  },
  get thumbnails() {
    return getThumbnailsDir();
  },
  get seriesCache() {
    return getSeriesCacheDir();
  },
} as const;
