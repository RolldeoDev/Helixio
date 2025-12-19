/**
 * Rollback Service
 *
 * Provides the ability to reverse file operations using the OperationLog.
 * Supports rolling back individual operations or entire batches.
 *
 * Reversible operations:
 * - move: Swap source and destination
 * - rename: Swap source and destination
 * - quarantine: Restore to original location
 * - restore: Return to quarantine
 *
 * Non-reversible operations:
 * - delete: File content is lost
 * - convert: Original CBR is deleted
 */

import { rename, mkdir, access } from 'fs/promises';
import { dirname, basename, relative } from 'path';
import { getDatabase } from './database.service.js';
import { loadConfig } from './config.service.js';

// =============================================================================
// Types
// =============================================================================

export interface OperationLogEntry {
  id: string;
  operation: string;
  source: string;
  destination: string | null;
  status: string;
  reversible: boolean;
  metadata: string | null;
  error: string | null;
  timestamp: Date;
  batchId: string | null;
}

export interface RollbackResult {
  success: boolean;
  operationId: string;
  operation: string;
  error?: string;
}

export interface RollbackBatchResult {
  batchId: string;
  totalOperations: number;
  rolledBack: number;
  failed: number;
  skipped: number;
  results: RollbackResult[];
}

export interface OperationHistoryEntry {
  id: string;
  operation: string;
  source: string;
  destination: string | null;
  status: string;
  reversible: boolean;
  timestamp: Date;
  canRollback: boolean;
  alreadyRolledBack: boolean;
  batchId: string | null;
  batchType?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists.
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get operation history with rollback status.
 */
export async function getOperationHistory(options: {
  libraryId?: string;
  operation?: string;
  status?: string;
  daysBack?: number;
  limit?: number;
  offset?: number;
}): Promise<{
  operations: OperationHistoryEntry[];
  total: number;
}> {
  const db = getDatabase();
  const config = loadConfig();
  const daysBack = options.daysBack || config.logRetentionDays || 10;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  // Build query conditions
  const where: Record<string, unknown> = {
    timestamp: { gte: cutoffDate },
  };

  if (options.operation) {
    where.operation = options.operation;
  }

  if (options.status) {
    where.status = options.status;
  }

  // Get operations
  const operations = await db.operationLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: options.limit || 100,
    skip: options.offset || 0,
    include: {
      batch: {
        select: {
          id: true,
          type: true,
          libraryId: true,
        },
      },
    },
  });

  // Filter by library if specified
  let filteredOps = operations;
  if (options.libraryId) {
    filteredOps = operations.filter((op) => op.batch?.libraryId === options.libraryId);
  }

  // Check for rolled_back status for each operation
  const rolledBackIds = new Set(
    (
      await db.operationLog.findMany({
        where: {
          operation: 'rollback',
          status: 'success',
        },
        select: { metadata: true },
      })
    )
      .map((op) => {
        try {
          const meta = op.metadata ? JSON.parse(op.metadata) : {};
          return meta.originalOperationId;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  );

  const total = await db.operationLog.count({ where });

  const entries: OperationHistoryEntry[] = filteredOps.map((op) => {
    const alreadyRolledBack = rolledBackIds.has(op.id);
    const canRollback =
      op.reversible && op.status === 'success' && !alreadyRolledBack && op.operation !== 'rollback';

    let metadata: Record<string, unknown> | undefined;
    if (op.metadata) {
      try {
        metadata = JSON.parse(op.metadata);
      } catch {
        metadata = undefined;
      }
    }

    return {
      id: op.id,
      operation: op.operation,
      source: op.source,
      destination: op.destination,
      status: op.status,
      reversible: op.reversible,
      timestamp: op.timestamp,
      canRollback,
      alreadyRolledBack,
      batchId: op.batchId,
      batchType: op.batch?.type,
      metadata,
    };
  });

  return { operations: entries, total };
}

/**
 * Get a single operation by ID.
 */
export async function getOperation(operationId: string): Promise<OperationHistoryEntry | null> {
  const db = getDatabase();

  const op = await db.operationLog.findUnique({
    where: { id: operationId },
    include: {
      batch: {
        select: {
          id: true,
          type: true,
          libraryId: true,
        },
      },
    },
  });

  if (!op) {
    return null;
  }

  // Check if already rolled back
  const rollbackLog = await db.operationLog.findFirst({
    where: {
      operation: 'rollback',
      status: 'success',
      metadata: { contains: operationId },
    },
  });

  const alreadyRolledBack = !!rollbackLog;
  const canRollback =
    op.reversible && op.status === 'success' && !alreadyRolledBack && op.operation !== 'rollback';

  let metadata: Record<string, unknown> | undefined;
  if (op.metadata) {
    try {
      metadata = JSON.parse(op.metadata);
    } catch {
      metadata = undefined;
    }
  }

  return {
    id: op.id,
    operation: op.operation,
    source: op.source,
    destination: op.destination,
    status: op.status,
    reversible: op.reversible,
    timestamp: op.timestamp,
    canRollback,
    alreadyRolledBack,
    batchId: op.batchId,
    batchType: op.batch?.type,
    metadata,
  };
}

// =============================================================================
// Rollback Operations
// =============================================================================

/**
 * Rollback a single operation.
 */
export async function rollbackOperation(operationId: string): Promise<RollbackResult> {
  const db = getDatabase();

  // Get the operation
  const op = await db.operationLog.findUnique({
    where: { id: operationId },
  });

  if (!op) {
    return {
      success: false,
      operationId,
      operation: 'unknown',
      error: 'Operation not found',
    };
  }

  // Check if reversible
  if (!op.reversible) {
    return {
      success: false,
      operationId,
      operation: op.operation,
      error: 'Operation is not reversible',
    };
  }

  // Check if already rolled back
  const existingRollback = await db.operationLog.findFirst({
    where: {
      operation: 'rollback',
      status: 'success',
      metadata: { contains: operationId },
    },
  });

  if (existingRollback) {
    return {
      success: false,
      operationId,
      operation: op.operation,
      error: 'Operation has already been rolled back',
    };
  }

  // Check if original operation was successful
  if (op.status !== 'success') {
    return {
      success: false,
      operationId,
      operation: op.operation,
      error: `Cannot rollback operation with status: ${op.status}`,
    };
  }

  try {
    // Execute rollback based on operation type
    switch (op.operation) {
      case 'move':
      case 'rename':
        await rollbackMoveOperation(op);
        break;

      case 'quarantine':
        await rollbackQuarantineOperation(op);
        break;

      case 'restore':
        await rollbackRestoreOperation(op);
        break;

      case 'metadata_update':
        await rollbackMetadataUpdate(op);
        break;

      default:
        return {
          success: false,
          operationId,
          operation: op.operation,
          error: `Rollback not supported for operation type: ${op.operation}`,
        };
    }

    // Log the rollback
    await db.operationLog.create({
      data: {
        operation: 'rollback',
        source: op.destination || op.source,
        destination: op.source,
        status: 'success',
        reversible: false,
        metadata: JSON.stringify({
          originalOperationId: op.id,
          originalOperation: op.operation,
        }),
        batchId: op.batchId,
      },
    });

    return {
      success: true,
      operationId,
      operation: op.operation,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Log failed rollback
    await db.operationLog.create({
      data: {
        operation: 'rollback',
        source: op.destination || op.source,
        destination: op.source,
        status: 'failed',
        reversible: false,
        error: errorMessage,
        metadata: JSON.stringify({
          originalOperationId: op.id,
          originalOperation: op.operation,
        }),
        batchId: op.batchId,
      },
    });

    return {
      success: false,
      operationId,
      operation: op.operation,
      error: errorMessage,
    };
  }
}

/**
 * Rollback a move/rename operation.
 * Swaps source and destination.
 */
async function rollbackMoveOperation(op: OperationLogEntry): Promise<void> {
  if (!op.destination) {
    throw new Error('Move operation has no destination to rollback from');
  }

  // Check destination (now source) exists
  if (!(await fileExists(op.destination))) {
    throw new Error(`File not found at destination: ${op.destination}`);
  }

  // Check original location is free
  if (await fileExists(op.source)) {
    throw new Error(`Original location is occupied: ${op.source}`);
  }

  // Ensure original directory exists
  await ensureDir(dirname(op.source));

  // Move back
  await rename(op.destination, op.source);

  // Update database record
  const db = getDatabase();
  let metadata: Record<string, unknown> = {};
  if (op.metadata) {
    try {
      metadata = JSON.parse(op.metadata);
    } catch {
      // Ignore
    }
  }

  const fileId = metadata.fileId as string | undefined;
  if (fileId) {
    const file = await db.comicFile.findUnique({
      where: { id: fileId },
      include: { library: true },
    });

    if (file) {
      await db.comicFile.update({
        where: { id: fileId },
        data: {
          path: op.source,
          filename: basename(op.source),
          relativePath: relative(file.library.rootPath, op.source),
        },
      });
    }
  }
}

/**
 * Rollback a quarantine operation.
 * Restores file to original location.
 */
async function rollbackQuarantineOperation(op: OperationLogEntry): Promise<void> {
  if (!op.destination) {
    throw new Error('Quarantine operation has no destination to rollback from');
  }

  // Check quarantine location exists
  if (!(await fileExists(op.destination))) {
    throw new Error(`File not found in quarantine: ${op.destination}`);
  }

  // Check original location is free
  if (await fileExists(op.source)) {
    throw new Error(`Original location is occupied: ${op.source}`);
  }

  // Ensure original directory exists
  await ensureDir(dirname(op.source));

  // Move back
  await rename(op.destination, op.source);

  // Update database record
  const db = getDatabase();
  let metadata: Record<string, unknown> = {};
  if (op.metadata) {
    try {
      metadata = JSON.parse(op.metadata);
    } catch {
      // Ignore
    }
  }

  const fileId = metadata.fileId as string | undefined;
  if (fileId) {
    const file = await db.comicFile.findUnique({
      where: { id: fileId },
      include: { library: true },
    });

    if (file) {
      await db.comicFile.update({
        where: { id: fileId },
        data: {
          path: op.source,
          filename: basename(op.source),
          relativePath: relative(file.library.rootPath, op.source),
          status: 'pending',
        },
      });
    }
  }
}

/**
 * Rollback a restore operation.
 * Returns file to quarantine.
 */
async function rollbackRestoreOperation(op: OperationLogEntry): Promise<void> {
  if (!op.destination) {
    throw new Error('Restore operation has no destination to rollback from');
  }

  // Check current location exists
  if (!(await fileExists(op.destination))) {
    throw new Error(`File not found at restored location: ${op.destination}`);
  }

  // Ensure quarantine directory exists
  await ensureDir(dirname(op.source));

  // Move back to quarantine
  await rename(op.destination, op.source);

  // Update database record
  const db = getDatabase();
  let metadata: Record<string, unknown> = {};
  if (op.metadata) {
    try {
      metadata = JSON.parse(op.metadata);
    } catch {
      // Ignore
    }
  }

  const fileId = metadata.fileId as string | undefined;
  if (fileId) {
    const file = await db.comicFile.findUnique({
      where: { id: fileId },
      include: { library: true },
    });

    if (file) {
      await db.comicFile.update({
        where: { id: fileId },
        data: {
          path: op.source,
          relativePath: relative(file.library.rootPath, op.source),
          status: 'quarantined',
        },
      });
    }
  }
}

/**
 * Rollback a metadata update operation.
 * Restores original metadata.
 */
async function rollbackMetadataUpdate(op: OperationLogEntry): Promise<void> {
  let metadata: Record<string, unknown> = {};
  if (op.metadata) {
    try {
      metadata = JSON.parse(op.metadata);
    } catch {
      throw new Error('Cannot parse original metadata');
    }
  }

  const originalMetadata = metadata.originalMetadata as Record<string, unknown> | undefined;
  if (!originalMetadata) {
    throw new Error('No original metadata stored for rollback');
  }

  // Import dynamically to avoid circular dependency
  const { updateComicInfo } = await import('./comicinfo.service.js');

  // Apply original metadata
  await updateComicInfo(op.source, originalMetadata);

  // Update database metadata cache if exists
  const db = getDatabase();
  const file = await db.comicFile.findFirst({
    where: { path: op.source },
  });

  if (file) {
    await db.fileMetadata.update({
      where: { comicId: file.id },
      data: {
        series: originalMetadata.Series as string | undefined,
        number: originalMetadata.Number as string | undefined,
        title: originalMetadata.Title as string | undefined,
        writer: originalMetadata.Writer as string | undefined,
        publisher: originalMetadata.Publisher as string | undefined,
        year: originalMetadata.Year as number | undefined,
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Rollback all operations in a batch.
 */
export async function rollbackBatch(batchId: string): Promise<RollbackBatchResult> {
  const db = getDatabase();

  // Get all successful, reversible operations in the batch
  const operations = await db.operationLog.findMany({
    where: {
      batchId,
      status: 'success',
      reversible: true,
    },
    orderBy: { timestamp: 'desc' }, // Rollback in reverse order
  });

  const results: RollbackResult[] = [];
  let rolledBack = 0;
  let failed = 0;
  let skipped = 0;

  for (const op of operations) {
    const result = await rollbackOperation(op.id);
    results.push(result);

    if (result.success) {
      rolledBack++;
    } else if (result.error?.includes('already been rolled back')) {
      skipped++;
    } else {
      failed++;
    }
  }

  return {
    batchId,
    totalOperations: operations.length,
    rolledBack,
    failed,
    skipped,
    results,
  };
}

// =============================================================================
// Cleanup Functions
// =============================================================================

/**
 * Cleanup old operation logs (beyond retention period).
 */
export async function cleanupOldOperationLogs(daysToKeep?: number): Promise<number> {
  const db = getDatabase();
  const config = loadConfig();
  const retentionDays = daysToKeep || config.logRetentionDays || 10;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await db.operationLog.deleteMany({
    where: {
      timestamp: { lt: cutoffDate },
    },
  });

  return result.count;
}

/**
 * Get summary statistics for operation history.
 */
export async function getOperationStats(options: {
  libraryId?: string;
  daysBack?: number;
}): Promise<{
  totalOperations: number;
  byOperation: Record<string, number>;
  byStatus: Record<string, number>;
  reversibleCount: number;
  rolledBackCount: number;
}> {
  const db = getDatabase();
  const daysBack = options.daysBack || 10;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const operations = await db.operationLog.findMany({
    where: {
      timestamp: { gte: cutoffDate },
    },
    select: {
      operation: true,
      status: true,
      reversible: true,
    },
  });

  const byOperation: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let reversibleCount = 0;
  let rolledBackCount = 0;

  for (const op of operations) {
    byOperation[op.operation] = (byOperation[op.operation] || 0) + 1;
    byStatus[op.status] = (byStatus[op.status] || 0) + 1;
    if (op.reversible) reversibleCount++;
    if (op.operation === 'rollback' && op.status === 'success') rolledBackCount++;
  }

  return {
    totalOperations: operations.length,
    byOperation,
    byStatus,
    reversibleCount,
    rolledBackCount,
  };
}
