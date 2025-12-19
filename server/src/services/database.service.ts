/**
 * Database Service
 *
 * Manages Prisma client lifecycle and database operations.
 * Handles initialization, connection, and shutdown.
 */

import { PrismaClient } from '@prisma/client';
import { getDatabaseUrl, ensureAppDirectories } from './app-paths.service.js';
import { databaseLogger as logger } from './logger.service.js';

// =============================================================================
// Prisma Client Instance
// =============================================================================

let prisma: PrismaClient | null = null;

/**
 * Get the Prisma client instance
 * Creates a new instance if one doesn't exist
 */
export function getDatabase(): PrismaClient {
  if (!prisma) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return prisma;
}

/**
 * Initialize the database connection
 * Must be called before any database operations
 */
export async function initializeDatabase(): Promise<PrismaClient> {
  if (prisma) {
    return prisma;
  }

  // Ensure app directories exist
  ensureAppDirectories();

  // Set DATABASE_URL for Prisma
  const databaseUrl = getDatabaseUrl();
  process.env.DATABASE_URL = databaseUrl;

  logger.info({ url: databaseUrl }, 'Initializing database');

  // Create Prisma client
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  // Test connection
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to database');
    throw error;
  }

  return prisma;
}

/**
 * Close the database connection
 * Should be called during graceful shutdown
 */
export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('Database connection closed');
  }
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return prisma !== null;
}

// =============================================================================
// Database Helpers
// =============================================================================

/**
 * Execute a transaction with automatic retry on lock errors
 */
export async function withTransaction<T>(
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  const db = getDatabase();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await db.$transaction(fn);
    } catch (error) {
      lastError = error;

      // Check if it's a SQLite lock error
      if (
        error instanceof Error &&
        error.message.includes('database is locked') &&
        attempt < maxRetries
      ) {
        logger.warn({ attempt, maxRetries }, 'Database locked, retrying');
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Clean up old operation logs based on retention period
 */
export async function cleanupOldLogs(retentionDays: number): Promise<number> {
  const db = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await db.operationLog.deleteMany({
    where: {
      timestamp: {
        lt: cutoffDate,
      },
    },
  });

  if (result.count > 0) {
    logger.info({ count: result.count }, 'Cleaned up old operation logs');
  }

  return result.count;
}

// =============================================================================
// Database Statistics
// =============================================================================

export interface DatabaseStats {
  libraries: number;
  files: number;
  pendingFiles: number;
  indexedFiles: number;
  orphanedFiles: number;
  quarantinedFiles: number;
  operationLogs: number;
  activeBatches: number;
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<DatabaseStats> {
  const db = getDatabase();

  const [
    libraries,
    files,
    pendingFiles,
    indexedFiles,
    orphanedFiles,
    quarantinedFiles,
    operationLogs,
    activeBatches,
  ] = await Promise.all([
    db.library.count(),
    db.comicFile.count(),
    db.comicFile.count({ where: { status: 'pending' } }),
    db.comicFile.count({ where: { status: 'indexed' } }),
    db.comicFile.count({ where: { status: 'orphaned' } }),
    db.comicFile.count({ where: { status: 'quarantined' } }),
    db.operationLog.count(),
    db.batchOperation.count({
      where: {
        status: { in: ['pending', 'in_progress', 'paused'] },
      },
    }),
  ]);

  return {
    libraries,
    files,
    pendingFiles,
    indexedFiles,
    orphanedFiles,
    quarantinedFiles,
    operationLogs,
    activeBatches,
  };
}

// =============================================================================
// Export Prisma Types for convenience
// =============================================================================

export type {
  Library,
  ComicFile,
  FileMetadata,
  OperationLog,
  BatchOperation,
  DuplicateGroup,
  Series,
  SeriesProgress,
  SeriesReaderSettingsNew,
} from '@prisma/client';
