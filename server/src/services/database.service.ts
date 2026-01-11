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
// Prisma Client Instances
// =============================================================================

/**
 * Read pool: Used by API routes for read operations.
 * Has more connections since reads are more frequent and faster.
 */
let readPrisma: PrismaClient | null = null;

/**
 * Write pool: Used by scanner and cover jobs for write operations.
 * Has fewer connections but isolated from read pool to prevent
 * heavy write operations from starving API reads.
 */
let writePrisma: PrismaClient | null = null;

/**
 * Get the read-optimized Prisma client instance.
 * Use this for API routes and read-heavy operations.
 */
export function getReadDatabase(): PrismaClient {
  if (!readPrisma) {
    throw new Error('Read database not initialized. Call initializeDatabase() first.');
  }
  return readPrisma;
}

/**
 * Get the write-optimized Prisma client instance.
 * Use this for scanner, cover jobs, and other write-heavy operations.
 */
export function getWriteDatabase(): PrismaClient {
  if (!writePrisma) {
    throw new Error('Write database not initialized. Call initializeDatabase() first.');
  }
  return writePrisma;
}

/**
 * Get the Prisma client instance.
 * Alias for getReadDatabase() for backward compatibility.
 * Use getReadDatabase() or getWriteDatabase() explicitly for new code.
 */
export function getDatabase(): PrismaClient {
  return getReadDatabase();
}

// =============================================================================
// Schema Sync (for factory reset recovery)
// =============================================================================

/**
 * Check if the database schema has been applied
 * Uses PostgreSQL's information_schema to check for existence of core tables
 */
async function isDatabaseSchemaApplied(): Promise<boolean> {
  if (!readPrisma) {
    return false;
  }

  try {
    // Check if the Library table exists (a core table that should always exist)
    const result = await readPrisma.$queryRaw<Array<{ exists: boolean }>>`
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
 * Connection pool sizes for read/write separation.
 *
 * PostgreSQL default max_connections is 100. We split connections between:
 * - Read pool (30): API routes, stats queries, user requests
 * - Write pool (20): Scanner, cover jobs, background writes
 *
 * Total: 50 connections, leaving headroom for:
 * - pg maintenance connections (superuser reserved)
 * - Direct pg client connections (factory reset, etc.)
 * - Other potential connections
 *
 * This separation prevents write-heavy operations (library scans) from
 * starving read operations (API requests), improving UI responsiveness.
 */
const DEFAULT_READ_CONNECTION_LIMIT = 30;
const DEFAULT_WRITE_CONNECTION_LIMIT = 20;

/**
 * Get the configured connection limit for the read pool.
 */
export function getReadConnectionLimit(): number {
  const envLimit = process.env.DATABASE_READ_CONNECTION_LIMIT;
  if (envLimit) {
    const parsed = parseInt(envLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_READ_CONNECTION_LIMIT;
}

/**
 * Get the configured connection limit for the write pool.
 */
export function getWriteConnectionLimit(): number {
  const envLimit = process.env.DATABASE_WRITE_CONNECTION_LIMIT;
  if (envLimit) {
    const parsed = parseInt(envLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_WRITE_CONNECTION_LIMIT;
}

/**
 * Get the total configured connection limit (read + write).
 * For backward compatibility.
 */
export function getConnectionLimit(): number {
  return getReadConnectionLimit() + getWriteConnectionLimit();
}

/**
 * Create a database URL with a specific connection limit
 */
function createDatabaseUrlWithLimit(baseUrl: string, connectionLimit: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set('connection_limit', connectionLimit.toString());
  return url.toString();
}

/**
 * Initialize the database connections (read and write pools)
 * Must be called before any database operations
 */
export async function initializeDatabase(): Promise<PrismaClient> {
  if (readPrisma && writePrisma) {
    return readPrisma;
  }

  // Ensure app directories exist
  ensureAppDirectories();

  const baseDatabaseUrl = getDatabaseUrl();
  const readConnectionLimit = getReadConnectionLimit();
  const writeConnectionLimit = getWriteConnectionLimit();

  // Create separate URLs for read and write pools
  const readDatabaseUrl = createDatabaseUrlWithLimit(baseDatabaseUrl, readConnectionLimit);
  const writeDatabaseUrl = createDatabaseUrlWithLimit(baseDatabaseUrl, writeConnectionLimit);

  // Set DATABASE_URL for Prisma CLI tools (uses read pool settings)
  process.env.DATABASE_URL = readDatabaseUrl;

  logger.info(
    {
      url: baseDatabaseUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
      readConnections: readConnectionLimit,
      writeConnections: writeConnectionLimit,
      totalConnections: readConnectionLimit + writeConnectionLimit,
    },
    'Initializing database with read/write pool separation'
  );

  const logConfig = process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] as const : ['error'] as const;

  // Create read Prisma client (for API routes)
  readPrisma = new PrismaClient({
    datasources: {
      db: {
        url: readDatabaseUrl,
      },
    },
    log: [...logConfig],
  });

  // Create write Prisma client (for scanner, cover jobs)
  writePrisma = new PrismaClient({
    datasources: {
      db: {
        url: writeDatabaseUrl,
      },
    },
    log: [...logConfig],
  });

  // Connect both clients
  try {
    await Promise.all([readPrisma.$connect(), writePrisma.$connect()]);
    logger.info('Database connected successfully (read and write pools)');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to database');
    throw error;
  }

  // Ensure schema is applied (handles fresh database after factory reset)
  await ensureDatabaseSchema();

  return readPrisma;
}

/**
 * Close the database connections
 * Should be called during graceful shutdown
 */
export async function closeDatabase(): Promise<void> {
  const disconnectPromises: Promise<void>[] = [];

  if (readPrisma) {
    disconnectPromises.push(readPrisma.$disconnect());
  }
  if (writePrisma) {
    disconnectPromises.push(writePrisma.$disconnect());
  }

  if (disconnectPromises.length > 0) {
    await Promise.all(disconnectPromises);
    readPrisma = null;
    writePrisma = null;
    logger.info('Database connections closed (read and write pools)');
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
  return readPrisma !== null && writePrisma !== null;
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
