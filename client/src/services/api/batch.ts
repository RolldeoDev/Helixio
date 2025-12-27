/**
 * API Batch Module
 *
 * Batch operations (rename, move, convert, delete) and rollback operations.
 */

import { get, post, del } from './shared';

// =============================================================================
// Batch Types
// =============================================================================

export type BatchStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';
export type BatchType = 'convert' | 'rename' | 'metadata_update' | 'move' | 'delete';

export interface BatchProgress {
  id: string;
  type: BatchType;
  status: BatchStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  progress: number;
  currentItem?: string;
  lastProcessedPath?: string;
  startedAt?: string;
  completedAt?: string;
  errors: Array<{ filename: string; error: string }>;
}

export interface BatchPreviewItem {
  id: string;
  fileId: string;
  filename: string;
  sourcePath: string;
  destinationPath?: string;
  newFilename?: string;
  action: string;
  status: string;
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
// Rollback Types
// =============================================================================

export interface OperationHistoryEntry {
  id: string;
  operation: string;
  source: string;
  destination: string | null;
  status: string;
  reversible: boolean;
  timestamp: string;
  canRollback: boolean;
  alreadyRolledBack: boolean;
  batchId: string | null;
  batchType?: string;
  metadata?: Record<string, unknown>;
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

export interface OperationStats {
  totalOperations: number;
  byOperation: Record<string, number>;
  byStatus: Record<string, number>;
  reversibleCount: number;
  rolledBackCount: number;
}

// =============================================================================
// Batch Operations
// =============================================================================

export async function getActiveBatch(): Promise<{
  hasActiveBatch: boolean;
  activeBatchId: string | null;
}> {
  return get('/batches/active');
}

export async function getInterruptedBatches(): Promise<{ batches: BatchProgress[] }> {
  return get('/batches/interrupted');
}

export async function getRecentBatches(
  limit?: number
): Promise<{ batches: BatchProgress[] }> {
  const query = limit ? `?limit=${limit}` : '';
  return get(`/batches/recent${query}`);
}

export async function getBatch(batchId: string): Promise<BatchProgress> {
  return get(`/batches/${batchId}`);
}

export async function getLibraryBatches(
  libraryId: string,
  options?: { status?: BatchStatus; limit?: number }
): Promise<{ batches: BatchProgress[] }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', options.limit.toString());
  const query = params.toString();
  return get(`/batches/library/${libraryId}${query ? `?${query}` : ''}`);
}

export async function getBatchOperations(
  batchId: string,
  options?: { status?: string; limit?: number; offset?: number }
): Promise<{
  operations: Array<{
    id: string;
    operation: string;
    source: string;
    destination: string | null;
    status: string;
    error: string | null;
    timestamp: string;
    reversible: boolean;
  }>;
  total: number;
  limit: number;
  offset: number;
}> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());
  const query = params.toString();
  return get(`/batches/${batchId}/operations${query ? `?${query}` : ''}`);
}

// Batch Previews
export async function previewRename(
  fileIds: string[]
): Promise<BatchPreviewResult> {
  return post('/batches/preview/rename', { fileIds });
}

export async function previewMove(
  fileIds: string[],
  destinationFolder: string
): Promise<BatchPreviewResult> {
  return post('/batches/preview/move', { fileIds, destinationFolder });
}

export async function previewMetadataUpdate(
  fileIds: string[],
  metadata: Record<string, unknown>
): Promise<BatchPreviewResult> {
  return post('/batches/preview/metadata', { fileIds, metadata });
}

export async function previewDelete(
  fileIds: string[]
): Promise<BatchPreviewResult> {
  return post('/batches/preview/delete', { fileIds });
}

// Batch Creation and Execution
export async function createBatch(options: {
  type: BatchType;
  libraryId?: string;
  items: Array<{
    fileId: string;
    destination?: string;
    newFilename?: string;
    metadata?: Record<string, unknown>;
  }>;
}): Promise<{ id: string; itemCount: number }> {
  return post('/batches', options);
}

export async function createConversionBatch(
  libraryId: string
): Promise<{ id: string; itemCount: number; totalSize: number }> {
  return post(`/batches/conversion/${libraryId}`);
}

export async function createBatchFromPreview(
  type: string,
  items: BatchPreviewItem[],
  libraryId?: string
): Promise<{ id: string; itemCount: number }> {
  return post('/batches/from-preview', { type, items, libraryId });
}

export async function executeBatch(batchId: string): Promise<BatchProgress> {
  return post(`/batches/${batchId}/execute`);
}

export async function cancelBatch(
  batchId: string
): Promise<{ success: boolean; message: string }> {
  return post(`/batches/${batchId}/cancel`);
}

export async function resumeBatch(batchId: string): Promise<BatchProgress> {
  return post(`/batches/${batchId}/resume`);
}

export async function abandonBatch(
  batchId: string
): Promise<{ success: boolean; message: string }> {
  return post(`/batches/${batchId}/abandon`);
}

export async function retryFailedBatchItems(
  batchId: string
): Promise<{ id: string; itemCount: number }> {
  return post(`/batches/${batchId}/retry`);
}

export async function deleteBatch(
  batchId: string
): Promise<{ success: boolean; message: string }> {
  return del(`/batches/${batchId}`);
}

export async function cleanupOldBatches(
  days?: number
): Promise<{ success: boolean; deletedCount: number; message: string }> {
  const query = days ? `?days=${days}` : '';
  return post(`/batches/cleanup${query}`);
}

// =============================================================================
// Rollback Operations
// =============================================================================

export async function getOperationHistory(options?: {
  libraryId?: string;
  operation?: string;
  status?: string;
  daysBack?: number;
  limit?: number;
  offset?: number;
}): Promise<{ operations: OperationHistoryEntry[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.libraryId) params.set('libraryId', options.libraryId);
  if (options?.operation) params.set('operation', options.operation);
  if (options?.status) params.set('status', options.status);
  if (options?.daysBack) params.set('daysBack', options.daysBack.toString());
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());
  const query = params.toString();
  return get(`/rollback/history${query ? `?${query}` : ''}`);
}

export async function getOperation(
  operationId: string
): Promise<OperationHistoryEntry> {
  return get(`/rollback/history/${operationId}`);
}

export async function getOperationStats(options?: {
  libraryId?: string;
  daysBack?: number;
}): Promise<OperationStats> {
  const params = new URLSearchParams();
  if (options?.libraryId) params.set('libraryId', options.libraryId);
  if (options?.daysBack) params.set('daysBack', options.daysBack.toString());
  const query = params.toString();
  return get(`/rollback/stats${query ? `?${query}` : ''}`);
}

export async function rollbackOperation(
  operationId: string
): Promise<RollbackResult> {
  return post(`/rollback/operation/${operationId}`);
}

export async function rollbackBatch(
  batchId: string
): Promise<RollbackBatchResult> {
  return post(`/rollback/batch/${batchId}`);
}

export async function cleanupOperationLogs(
  days?: number
): Promise<{ success: boolean; deletedCount: number; message: string }> {
  const query = days ? `?days=${days}` : '';
  return post(`/rollback/cleanup${query}`);
}
