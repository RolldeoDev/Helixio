/**
 * Database Service
 *
 * Manages Prisma client lifecycle and database operations.
 * Handles initialization, connection, and shutdown.
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
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

// =============================================================================
// Schema Sync (for factory reset recovery)
// =============================================================================

/**
 * Check if the database schema has been applied
 * Uses SQLite's sqlite_master table to check for existence of core tables
 */
async function isDatabaseSchemaApplied(): Promise<boolean> {
  if (!prisma) {
    return false;
  }

  try {
    // Check if the Library table exists (a core table that should always exist)
    const result = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='Library'
    `;
    return result.length > 0;
  } catch {
    return false;
  }
}

/**
 * Ensure database schema is applied
 * Runs prisma db push if tables are missing (e.g., after factory reset)
 */
async function ensureDatabaseSchema(): Promise<void> {
  const schemaExists = await isDatabaseSchemaApplied();

  if (schemaExists) {
    logger.debug('Database schema already applied');
    return;
  }

  logger.info('Database schema not found, running prisma db push...');

  try {
    // Run prisma db push to create/sync schema
    // --skip-generate: The client is already generated at build time
    // --accept-data-loss: Required for fresh DBs, safe since there's no data
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: 'pipe',
    });
    logger.info('Database schema applied successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to apply database schema');
    throw new Error('Failed to initialize database schema. Please run "npm run db:push" manually.');
  }
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

  // Ensure schema is applied (handles fresh database after factory reset)
  await ensureDatabaseSchema();

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
