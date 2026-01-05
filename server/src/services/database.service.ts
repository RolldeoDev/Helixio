/**
 * Database Service
 *
 * Manages Prisma client lifecycle and database operations.
 * Handles initialization, connection, and shutdown.
 *
 * PostgreSQL is embedded in the Docker container with data stored at /config/pgdata.
 * The database uses CITEXT extension for case-insensitive text columns.
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { Client } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { getDatabaseUrl, ensureAppDirectories } from './app-paths.service.js';
import { databaseLogger as logger } from './logger.service.js';

// Get the absolute path to the prisma schema
// Works from both src/ (dev) and dist/ (production) since prisma/ is at the same level
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PRISMA_SCHEMA_PATH = resolve(__dirname, '../../prisma/schema.prisma');

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
 * Uses PostgreSQL's information_schema to check for existence of core tables
 */
async function isDatabaseSchemaApplied(): Promise<boolean> {
  if (!prisma) {
    return false;
  }

  try {
    // Check if the Library table exists (a core table that should always exist)
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'Library'
      ) as exists
    `;
    return result[0]?.exists ?? false;
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
    // --schema: Use absolute path to schema file for reliability
    execSync(`npx prisma db push --skip-generate --accept-data-loss --schema "${PRISMA_SCHEMA_PATH}"`, {
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
 * Default connection pool size.
 * PostgreSQL default max_connections is 100.
 * We limit Prisma's pool to leave headroom for:
 * - pg maintenance connections (superuser reserved)
 * - Direct pg client connections (factory reset, etc.)
 * - Other potential connections
 *
 * Can be overridden via DATABASE_CONNECTION_LIMIT env var.
 */
const DEFAULT_CONNECTION_LIMIT = 30;

/**
 * Get the configured connection limit for the database pool.
 */
export function getConnectionLimit(): number {
  const envLimit = process.env.DATABASE_CONNECTION_LIMIT;
  if (envLimit) {
    const parsed = parseInt(envLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_CONNECTION_LIMIT;
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

  // Set DATABASE_URL for Prisma (with connection limit)
  let databaseUrl = getDatabaseUrl();
  const connectionLimit = getConnectionLimit();

  // Add connection_limit to the URL if not already present
  const url = new URL(databaseUrl);
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', connectionLimit.toString());
    databaseUrl = url.toString();
  }

  process.env.DATABASE_URL = databaseUrl;

  logger.info({ url: databaseUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'), connectionLimit }, 'Initializing database');

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
 * Drop and recreate the PostgreSQL database
 * Used for factory reset in development environments where we can't delete the data directory.
 *
 * CRITICAL: This will destroy ALL data. Use only for factory reset.
 */
export async function dropAndRecreateDatabase(): Promise<void> {
  const dbUrl = getDatabaseUrl();
  const parsed = new URL(dbUrl);
  const databaseName = parsed.pathname.slice(1); // Remove leading /

  if (!databaseName || databaseName === 'postgres') {
    throw new Error('Cannot drop the postgres system database');
  }

  // Connect to 'postgres' database for maintenance operations
  parsed.pathname = '/postgres';
  const maintenanceUrl = parsed.toString();

  logger.info({ database: databaseName }, 'Dropping and recreating database');

  const client = new Client({ connectionString: maintenanceUrl });

  try {
    await client.connect();

    // Terminate all connections to target database
    await client.query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `,
      [databaseName]
    );

    // Small delay for connections to fully terminate
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Drop and recreate the database
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    logger.info({ database: databaseName }, 'Database dropped');

    await client.query(`CREATE DATABASE "${databaseName}"`);
    logger.info({ database: databaseName }, 'Database created');

    // Connect to new database to enable citext extension
    const newClient = new Client({ connectionString: dbUrl });
    try {
      await newClient.connect();
      await newClient.query('CREATE EXTENSION IF NOT EXISTS citext');
      logger.info('CITEXT extension enabled');
    } finally {
      await newClient.end();
    }

    logger.info({ database: databaseName }, 'Database dropped and recreated successfully');
  } finally {
    await client.end();
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
 * Execute a transaction with automatic retry on deadlock errors
 *
 * PostgreSQL uses MVCC (Multi-Version Concurrency Control) which provides
 * excellent concurrent access. However, deadlocks can still occur
 * in rare cases with concurrent transactions, so we keep a simple retry.
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

      // Check if it's a PostgreSQL deadlock error (error code 40P01)
      const prismaError = error as { code?: string };
      if (prismaError.code === '40P01' && attempt < maxRetries) {
        logger.warn({ attempt, maxRetries }, 'Deadlock detected, retrying');
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
  Series,
  SeriesProgress,
  SeriesReaderSettingsNew,
} from '@prisma/client';
