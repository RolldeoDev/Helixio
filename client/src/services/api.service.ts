/**
 * API Service
 *
 * Centralized API client for backend communication.
 * All backend requests go through this service.
 */

const API_BASE = '/api';

// =============================================================================
// Types
// =============================================================================

export interface ApiError {
  error: string;
  message?: string;
}

export interface HealthStatus {
  status: string;
  version: string;
  timestamp: string;
  database: {
    libraries: number;
    files: number;
    pendingFiles: number;
    indexedFiles: number;
    orphanedFiles: number;
    quarantinedFiles: number;
  } | null;
}

export interface LibraryStats {
  total: number;
  pending: number;
  indexed: number;
  orphaned: number;
  quarantined: number;
}

export interface Library {
  id: string;
  name: string;
  rootPath: string;
  type: 'western' | 'manga';
  createdAt: string;
  updatedAt: string;
  stats?: LibraryStats;
}

export interface ComicFile {
  id: string;
  libraryId: string;
  path: string;
  relativePath: string;
  filename: string;
  size: number;
  hash: string | null;
  status: 'pending' | 'indexed' | 'orphaned' | 'quarantined';
  modifiedAt: string;
  createdAt: string;
  updatedAt: string;
  metadata?: FileMetadata | null;
}

export interface FileMetadata {
  id: string;
  series: string | null;
  number: string | null;
  title: string | null;
  volume: number | null;
  year: number | null;
  month: number | null;
  writer: string | null;
  penciller: string | null;
  publisher: string | null;
  genre: string | null;
  summary: string | null;
  characters: string | null;
  teams: string | null;
  locations: string | null;
  storyArc: string | null;
}

export interface ScanSummary {
  totalFilesScanned: number;
  newFiles: number;
  movedFiles: number;
  orphanedFiles: number;
  unchangedFiles: number;
  errors: number;
}

export interface ScanResult {
  scanId: string;
  libraryId: string;
  libraryPath: string;
  scanDuration: number;
  summary: ScanSummary;
  changes: {
    newFiles: Array<{ path: string; filename: string; size: number }>;
    movedFiles: Array<{ oldPath: string; newPath: string }>;
    orphanedFiles: Array<{ path: string }>;
  };
  errors: string[];
  autoApplied: boolean;
}

export interface PaginatedResponse<T> {
  files: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// =============================================================================
// HTTP Helpers
// =============================================================================

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
      message: response.statusText,
    }));
    throw new Error(error.message || error.error);
  }
  const json = await response.json();
  // Handle standardized API response format: { success: true, data: T, meta?: {...} }
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    // Merge meta properties (like pagination) into data for backwards compatibility
    if (json.meta && typeof json.meta === 'object') {
      return { ...json.data, ...json.meta } as T;
    }
    return json.data as T;
  }
  return json;
}

async function get<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`);
  return handleResponse<T>(response);
}

async function post<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

async function patch<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

async function del<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'DELETE',
  });
  return handleResponse<T>(response);
}

// =============================================================================
// Health & System
// =============================================================================

export async function getHealth(): Promise<HealthStatus> {
  return get<HealthStatus>('/health');
}

export async function getPaths(): Promise<Record<string, string>> {
  return get<Record<string, string>>('/paths');
}

// =============================================================================
// Libraries
// =============================================================================

export async function getLibraries(): Promise<{ libraries: Library[] }> {
  return get<{ libraries: Library[] }>('/libraries');
}

export async function getLibrary(id: string): Promise<Library> {
  return get<Library>(`/libraries/${id}`);
}

export async function createLibrary(data: {
  name: string;
  rootPath: string;
  type?: 'western' | 'manga';
}): Promise<Library> {
  return post<Library>('/libraries', data);
}

export async function updateLibrary(
  id: string,
  data: { name?: string; type?: 'western' | 'manga' }
): Promise<Library> {
  return patch<Library>(`/libraries/${id}`, data);
}

export async function deleteLibrary(id: string): Promise<{ message: string }> {
  return del<{ message: string }>(`/libraries/${id}`);
}

// =============================================================================
// Library Scanning
// =============================================================================

export async function scanLibrary(libraryId: string): Promise<ScanResult> {
  return post<ScanResult>(`/libraries/${libraryId}/scan`);
}

export async function applyScan(
  libraryId: string,
  scanId: string
): Promise<{ success: boolean; applied: { added: number; moved: number; orphaned: number } }> {
  return post(`/libraries/${libraryId}/scan/${scanId}/apply`);
}

export async function discardScan(
  libraryId: string,
  scanId: string
): Promise<{ message: string }> {
  return del(`/libraries/${libraryId}/scan/${scanId}`);
}

// =============================================================================
// Files
// =============================================================================

export interface GetFilesParams {
  page?: number;
  limit?: number;
  status?: string;
  folder?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export async function getLibraryFiles(
  libraryId: string,
  params: GetFilesParams = {}
): Promise<PaginatedResponse<ComicFile>> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.folder) searchParams.set('folder', params.folder);
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.order) searchParams.set('order', params.order);

  const query = searchParams.toString();
  return get<PaginatedResponse<ComicFile>>(
    `/libraries/${libraryId}/files${query ? `?${query}` : ''}`
  );
}

export async function getLibraryFolders(
  libraryId: string
): Promise<{ folders: string[] }> {
  return get<{ folders: string[] }>(`/libraries/${libraryId}/folders`);
}

export interface FolderRenameResult {
  success: boolean;
  oldPath: string;
  newPath: string;
  filesUpdated: number;
  logId?: string;
  error?: string;
}

export async function renameFolder(
  libraryId: string,
  folderPath: string,
  newName: string
): Promise<FolderRenameResult> {
  return post<FolderRenameResult>(`/libraries/${libraryId}/folders/rename`, {
    folderPath,
    newName,
  });
}

export async function getQuarantinedFiles(
  libraryId: string
): Promise<{ count: number; files: ComicFile[] }> {
  return get<{ count: number; files: ComicFile[] }>(
    `/libraries/${libraryId}/quarantine`
  );
}

export async function getFile(fileId: string): Promise<ComicFile> {
  return get<ComicFile>(`/files/${fileId}`);
}

export async function verifyFile(
  fileId: string
): Promise<{ verified: boolean; exists: boolean; message: string }> {
  return get(`/files/${fileId}/verify`);
}

// =============================================================================
// File Operations
// =============================================================================

export async function moveFile(
  fileId: string,
  destinationPath: string,
  options?: { createDirs?: boolean; overwrite?: boolean }
): Promise<{ success: boolean; source: string; destination: string }> {
  return post(`/files/${fileId}/move`, { destinationPath, ...options });
}

export async function renameFile(
  fileId: string,
  newFilename: string
): Promise<{ success: boolean; source: string; destination: string }> {
  return post(`/files/${fileId}/rename`, { newFilename });
}

export async function deleteFile(
  fileId: string
): Promise<{ success: boolean; source: string }> {
  return del(`/files/${fileId}`);
}

export async function quarantineFile(
  fileId: string,
  reason?: string
): Promise<{ success: boolean; source: string; destination: string }> {
  return post(`/files/${fileId}/quarantine`, { reason });
}

export async function restoreFile(
  fileId: string
): Promise<{ success: boolean; source: string; destination: string }> {
  return post(`/files/${fileId}/restore`);
}

// =============================================================================
// Bulk Operations
// =============================================================================

export async function bulkDeleteFiles(
  fileIds: string[]
): Promise<{ total: number; successful: number; failed: number }> {
  return post('/files/bulk/delete', { fileIds });
}

export async function bulkQuarantineFiles(
  fileIds: string[],
  reason?: string
): Promise<{ total: number; successful: number; failed: number }> {
  return post('/files/bulk/quarantine', { fileIds, reason });
}

// =============================================================================
// Archives
// =============================================================================

export interface ArchiveInfo {
  fileId: string;
  filename: string;
  path: string;
  archive: {
    format: string;
    fileCount: number;
    totalSize: number;
    hasComicInfo: boolean;
    coverPath: string | null;
  };
}

export async function getArchiveInfo(fileId: string): Promise<ArchiveInfo> {
  return get<ArchiveInfo>(`/archives/${fileId}/info`);
}

export async function getArchiveContents(
  fileId: string
): Promise<{
  fileId: string;
  filename: string;
  format: string;
  entries: Array<{ path: string; size: number; isDirectory: boolean }>;
}> {
  return get(`/archives/${fileId}/contents`);
}

export async function validateArchive(
  fileId: string
): Promise<{ fileId: string; valid: boolean; error?: string }> {
  return get(`/archives/${fileId}/validate`);
}

export function getCoverUrl(fileId: string): string {
  return `${API_BASE}/archives/${fileId}/cover`;
}

/**
 * Get URL for a cached API cover by its hash
 * Used when series has coverHash from downloaded API cover
 */
export function getApiCoverUrl(coverHash: string): string {
  return `${API_BASE}/covers/series/${coverHash}`;
}

// =============================================================================
// ComicInfo
// =============================================================================

export interface ComicInfo {
  Title?: string;
  Series?: string;
  Number?: string;
  Volume?: number;
  Year?: number;
  Month?: number;
  Day?: number;
  Writer?: string;
  Penciller?: string;
  Inker?: string;
  Colorist?: string;
  Letterer?: string;
  CoverArtist?: string;
  Publisher?: string;
  Genre?: string;
  Tags?: string;
  Summary?: string;
  Notes?: string;
  PageCount?: number;
  AgeRating?: string;
  Characters?: string;
  Teams?: string;
  Locations?: string;
  StoryArc?: string;
}

export async function getComicInfo(
  fileId: string
): Promise<{ fileId: string; filename: string; comicInfo: ComicInfo }> {
  return get(`/archives/${fileId}/comicinfo`);
}

export async function updateComicInfo(
  fileId: string,
  comicInfo: Partial<ComicInfo>
): Promise<{ success: boolean }> {
  return patch(`/archives/${fileId}/comicinfo`, comicInfo);
}

// =============================================================================
// Conversion
// =============================================================================

export async function getConversionPreview(
  fileId: string
): Promise<{
  fileId: string;
  source: string;
  destination: string;
  canConvert: boolean;
  reason?: string;
}> {
  return get(`/archives/${fileId}/convert/preview`);
}

export async function convertFile(
  fileId: string,
  options?: { deleteOriginal?: boolean }
): Promise<{
  success: boolean;
  source: string;
  destination?: string;
  error?: string;
}> {
  return post(`/archives/${fileId}/convert`, options);
}

export async function getConvertibleFiles(
  libraryId: string
): Promise<{
  files: Array<{ id: string; path: string; filename: string; size: number }>;
  total: number;
  totalSize: number;
}> {
  return get(`/archives/library/${libraryId}/convertible`);
}

export async function batchConvert(
  libraryId: string,
  options?: { deleteOriginal?: boolean; fileIds?: string[] }
): Promise<{
  total: number;
  successful: number;
  failed: number;
}> {
  return post(`/archives/library/${libraryId}/convert/batch`, options);
}

// =============================================================================
// Batch Operations
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

// =============================================================================
// Metadata Fetch Operations
// =============================================================================

export type MetadataSource = 'comicvine' | 'metron' | 'gcd';

export interface MetadataMatch {
  source: MetadataSource;
  sourceId: string;
  type: 'issue' | 'series';
  name: string;
  number?: string;
  publisher?: string;
  year?: number;
  confidence: number;
  coverUrl?: string;
}

export interface MetadataFetchResult {
  fileId: string;
  filename: string;
  query: {
    series?: string;
    issueNumber?: string;
    publisher?: string;
    year?: number;
  };
  bestMatch: MetadataMatch | null;
  alternateMatches: MetadataMatch[];
  status: 'matched' | 'low_confidence' | 'no_match' | 'error';
  error?: string;
}

export interface MetadataFetchResponse {
  total: number;
  matched: number;
  lowConfidence: number;
  noMatch: number;
  errors: number;
  results: MetadataFetchResult[];
  sessionId?: string;
}

// =============================================================================
// Metadata Fetch Logging Types
// =============================================================================

export type MetadataFetchStep =
  | 'parsing'
  | 'searching'
  | 'scoring'
  | 'organizing'
  | 'fetching'
  | 'applying'
  | 'complete'
  | 'error';

export interface MetadataFetchLogEntry {
  timestamp: string;
  sessionId: string;
  step: MetadataFetchStep;
  stepName: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
  overallProgress?: number;
  formatted: string;
}

export interface MetadataFetchAPICall {
  source: 'comicvine' | 'metron' | 'anthropic';
  endpoint: string;
  status: 'pending' | 'success' | 'error' | 'rate_limited';
  duration?: number;
  resultCount?: number;
  error?: string;
  retryCount?: number;
  startTime: string;
  endTime?: string;
}

export interface MetadataFetchSessionSummary {
  filesParsed: number;
  sourcesSearched: string[];
  resultsFound: number;
  bestMatchConfidence?: number;
  appliedSource?: string;
  errors: string[];
}

export interface MetadataFetchSession {
  id: string;
  fileId?: string;
  filename?: string;
  status: 'in_progress' | 'completed' | 'error';
  currentStep: MetadataFetchStep;
  currentStepName: string;
  stepNumber: number;
  totalSteps: number;
  startedAt: string;
  completedAt?: string;
  summary?: MetadataFetchSessionSummary;
  logCount?: number;
}

export interface MetadataFetchSessionDetails {
  session: MetadataFetchSession;
  logs: MetadataFetchLogEntry[];
  apiCalls: MetadataFetchAPICall[];
}

export async function fetchMetadataForFiles(
  fileIds: string[],
  includeSession = true
): Promise<MetadataFetchResponse> {
  return post<MetadataFetchResponse>('/search/fetch-metadata', { fileIds, includeSession });
}

export async function getMetadataFetchSession(
  sessionId: string
): Promise<MetadataFetchSessionDetails> {
  return get<MetadataFetchSessionDetails>(`/search/logs/session/${sessionId}`);
}

export function createMetadataFetchLogStream(
  sessionId: string,
  onLog: (data: { type: string; log?: MetadataFetchLogEntry; status?: string; error?: string }) => void,
  onError?: (error: Event) => void
): EventSource {
  const eventSource = new EventSource(`${API_BASE}/search/logs/stream/${sessionId}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onLog(data);
    } catch (e) {
      console.error('Failed to parse log stream data:', e);
    }
  };

  if (onError) {
    eventSource.onerror = onError;
  }

  return eventSource;
}

export async function applyMetadataBatch(
  matches: Array<{
    fileId: string;
    source: MetadataSource;
    sourceId: string;
    type: 'issue' | 'series';
  }>
): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: Array<{ fileId: string; success: boolean; error?: string }>;
}> {
  return post('/search/apply-batch', { matches });
}

// =============================================================================
// Metadata Approval Types
// =============================================================================

export type ApprovalSessionStatus =
  | 'grouping'
  | 'series_approval'
  | 'fetching_issues'
  | 'file_review'
  | 'applying'
  | 'complete'
  | 'cancelled';

/** Credit entry with optional count */
export interface SeriesCredit {
  id: number;
  name: string;
  count?: number;
}

export interface SeriesMatch {
  source: MetadataSource;
  sourceId: string;
  name: string;
  startYear?: number;
  endYear?: number;
  publisher?: string;
  issueCount?: number;
  description?: string;
  coverUrl?: string;
  confidence: number;
  url?: string;

  // Extended fields for expanded series info
  aliases?: string[];
  shortDescription?: string;
  seriesType?: string;
  volume?: number;
  firstIssueNumber?: string;
  lastIssueNumber?: string;
  imageUrls?: {
    thumb?: string;
    small?: string;
    medium?: string;
  };

  // Rich series data from ComicVine
  characters?: SeriesCredit[]; // Characters appearing in the series
  creators?: SeriesCredit[]; // Writers, artists, etc.
  locations?: SeriesCredit[]; // Locations featured
  objects?: SeriesCredit[]; // Notable objects/items
}

export interface SeriesGroup {
  displayName: string;
  query: {
    series?: string;
    issueNumber?: string;
    publisher?: string;
    year?: number;
  };
  fileCount: number;
  fileIds: string[];
  filenames: string[];
  status: 'pending' | 'searching' | 'approved' | 'skipped';
  searchResults: SeriesMatch[];
  /** Series to use for series-level metadata (name, publisher, etc.) */
  selectedSeries: SeriesMatch | null;
  /** Series to use for issue matching (may differ from selectedSeries for collected editions) */
  issueMatchingSeries: SeriesMatch | null;
  /** Whether this group was pre-approved from series.json */
  preApprovedFromSeriesJson?: boolean;
  /** Whether this group was pre-approved from a database Series with existing external IDs */
  preApprovedFromDatabase?: boolean;
}

export interface FieldChange {
  current: string | number | null;
  proposed: string | number | null;
  approved: boolean;
  edited: boolean;
  editedValue?: string | number;
}

export interface FileChange {
  fileId: string;
  filename: string;
  matchedIssue: {
    source: MetadataSource;
    sourceId: string;
    number: string;
    title?: string;
    coverDate?: string;
  } | null;
  matchConfidence: number;
  fields: Record<string, FieldChange>;
  status: 'matched' | 'unmatched' | 'manual' | 'rejected';
}

export interface ApprovalSession {
  sessionId: string;
  status: ApprovalSessionStatus;
  useLLMCleanup?: boolean;
  fileCount: number;
  seriesGroups: Array<{
    displayName: string;
    query?: {
      series?: string;
      issueNumber?: string;
      publisher?: string;
      year?: number;
    };
    fileCount: number;
    fileIds: string[];
    filenames: string[];
    status: 'pending' | 'searching' | 'approved' | 'skipped';
    searchResults: SeriesMatch[];
    selectedSeries: SeriesMatch | null;
    /** Series to use for issue matching (may differ from selectedSeries for collected editions) */
    issueMatchingSeries?: SeriesMatch | null;
    /** Whether this group was pre-approved from series.json */
    preApprovedFromSeriesJson?: boolean;
    /** Whether this group was pre-approved from a database Series with existing external IDs */
    preApprovedFromDatabase?: boolean;
  }>;
  currentSeriesIndex: number;
  currentSeriesGroup: SeriesGroup | null;
  fileChangesSummary?: {
    total: number;
    matched: number;
    unmatched: number;
    manual: number;
    rejected: number;
  };
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface CreateApprovalSessionOptions {
  useLLMCleanup?: boolean;
  /** File IDs to exclude from processing (already searched/indexed files) */
  excludeFileIds?: string[];
  /** Mixed series mode - ignores series.json and parses each file individually */
  mixedSeries?: boolean;
  /** Search mode: 'quick' (primary source only) or 'full' (all sources with merge) */
  searchMode?: SearchMode;
}

/**
 * Info about files that have already been indexed
 */
export interface IndexedFilesInfo {
  /** Total count of indexed files in the selection */
  indexedCount: number;
  /** IDs of indexed files */
  indexedFileIds: string[];
  /** Files with their indexed status for individual selection */
  files: Array<{
    id: string;
    filename: string;
    isIndexed: boolean;
  }>;
}

export interface SeriesCacheStats {
  totalEntries: number;
  totalSizeMb: number;
  entriesWithIssues: number;
  bySource: {
    comicvine: number;
    metron: number;
  };
  oldestEntry?: string;
  newestEntry?: string;
}

// =============================================================================
// Metadata Approval API
// =============================================================================

/**
 * Get indexed status info for a list of files
 * Returns which files have already been indexed (searched for metadata)
 */
export async function getIndexedFilesInfo(fileIds: string[]): Promise<IndexedFilesInfo> {
  return post<IndexedFilesInfo>('/metadata-approval/indexed-files', { fileIds });
}

/**
 * Create a new metadata approval session
 */
export async function createApprovalSession(
  fileIds: string[],
  options: CreateApprovalSessionOptions = {}
): Promise<ApprovalSession> {
  return post<ApprovalSession>('/metadata-approval/sessions', {
    fileIds,
    useLLMCleanup: options.useLLMCleanup,
    mixedSeries: options.mixedSeries,
  });
}

/** Progress log entry from streaming session creation */
export interface ProgressLogEntry {
  message: string;
  detail?: string;
  timestamp: string;
}

/**
 * Create approval session with streaming progress updates
 * Returns an async generator that yields progress events
 */
export async function* createApprovalSessionWithProgress(
  fileIds: string[],
  options: CreateApprovalSessionOptions = {}
): AsyncGenerator<
  | { type: 'progress'; data: ProgressLogEntry }
  | { type: 'complete'; data: ApprovalSession }
  | { type: 'error'; data: { error: string; message: string } }
> {
  const response = await fetch(`${API_BASE}/metadata-approval/sessions/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileIds,
      useLLMCleanup: options.useLLMCleanup,
      mixedSeries: options.mixedSeries,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    yield { type: 'error', data: { error: 'Request failed', message: error.message || 'Unknown error' } };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', data: { error: 'No response body', message: 'Failed to read response stream' } };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    let currentData = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6);
      } else if (line === '' && currentEvent && currentData) {
        try {
          const parsed = JSON.parse(currentData);
          if (currentEvent === 'progress') {
            yield { type: 'progress', data: parsed as ProgressLogEntry };
          } else if (currentEvent === 'complete') {
            yield { type: 'complete', data: parsed as ApprovalSession };
          } else if (currentEvent === 'error') {
            yield { type: 'error', data: parsed as { error: string; message: string } };
          }
        } catch {
          // Ignore parse errors
        }
        currentEvent = '';
        currentData = '';
      }
    }
  }
}

/**
 * Get the current state of an approval session
 */
export async function getApprovalSession(
  sessionId: string
): Promise<ApprovalSession> {
  return get<ApprovalSession>(`/metadata-approval/sessions/${sessionId}`);
}

/**
 * Delete/cancel an approval session
 */
export async function deleteApprovalSession(
  sessionId: string
): Promise<{ success: boolean; message: string }> {
  return del<{ success: boolean; message: string }>(`/metadata-approval/sessions/${sessionId}`);
}

/**
 * Re-search for series with a custom query
 */
export async function searchSeriesCustom(
  sessionId: string,
  query: string
): Promise<{ query: string; results: SeriesMatch[]; resultCount: number }> {
  return post(`/metadata-approval/sessions/${sessionId}/series/search`, { query });
}

/**
 * Approve the selected series and advance to the next
 * @param seriesId - Series to use for series-level metadata (name, publisher, etc.)
 * @param issueMatchingSeriesId - Series to use for issue matching (optional, defaults to seriesId)
 */
export async function approveSeries(
  sessionId: string,
  seriesId: string,
  issueMatchingSeriesId?: string
): Promise<{
  success: boolean;
  hasMoreSeries: boolean;
  nextSeriesIndex: number;
  status: ApprovalSessionStatus;
  currentSeriesGroup: SeriesGroup | null;
  fileChangesSummary?: ApprovalSession['fileChangesSummary'];
}> {
  return post(`/metadata-approval/sessions/${sessionId}/series/approve`, {
    seriesId,
    issueMatchingSeriesId,
  });
}

/**
 * Skip the current series and advance to the next
 */
export async function skipSeries(
  sessionId: string
): Promise<{
  success: boolean;
  hasMoreSeries: boolean;
  nextSeriesIndex: number;
  status: ApprovalSessionStatus;
  currentSeriesGroup: SeriesGroup | null;
}> {
  return post(`/metadata-approval/sessions/${sessionId}/series/skip`);
}

/**
 * Get all file changes for the session
 */
export async function getFileChanges(
  sessionId: string
): Promise<{
  status: ApprovalSessionStatus;
  fileChanges: FileChange[];
  summary: ApprovalSession['fileChangesSummary'];
}> {
  return get(`/metadata-approval/sessions/${sessionId}/files`);
}

/**
 * Issue data from series cache for manual selection
 */
export interface AvailableIssue {
  id: number;
  name: string | null;
  aliases: string | null;
  issue_number: string;
  cover_date: string | null;
  store_date: string | null;
  deck: string | null;
  description: string | null;
  image: {
    icon_url: string;
    medium_url: string;
    screen_url: string;
    screen_large_url: string;
    small_url: string;
    super_url: string;
    thumb_url: string;
    tiny_url: string;
    original_url: string;
  } | null;
  volume: {
    id: number;
    name: string;
    api_detail_url: string;
    site_detail_url: string;
  } | null;
  api_detail_url: string | null;
  site_detail_url: string | null;
  person_credits?: Array<{ id: number; name: string; role: string }>;
  character_credits?: Array<{ id: number; name: string }>;
  team_credits?: Array<{ id: number; name: string }>;
  location_credits?: Array<{ id: number; name: string }>;
  story_arc_credits?: Array<{ id: number; name: string }>;
}

/**
 * Get available issues for manual selection for a file
 */
export async function getAvailableIssues(
  sessionId: string,
  fileId: string
): Promise<{
  success: boolean;
  seriesName: string;
  source: MetadataSource;
  sourceId: string;
  issues: AvailableIssue[];
  totalCount: number;
  currentMatchedIssueId: string | null;
}> {
  return get(`/metadata-approval/sessions/${sessionId}/files/${fileId}/available-issues`);
}

/**
 * Manually select an issue for a file
 */
export async function manualSelectIssue(
  sessionId: string,
  fileId: string,
  issueSource: MetadataSource,
  issueId: string
): Promise<{ success: boolean; fileChange: FileChange }> {
  return post(`/metadata-approval/sessions/${sessionId}/files/match`, {
    fileId,
    issueSource,
    issueId,
  });
}

/**
 * Update field approvals for a file
 */
export async function updateFieldApprovals(
  sessionId: string,
  fileId: string,
  fieldUpdates: Record<string, { approved?: boolean; editedValue?: string | number }>
): Promise<{ success: boolean; fileChange: FileChange }> {
  return patch(`/metadata-approval/sessions/${sessionId}/files/${fileId}/fields`, fieldUpdates);
}

/**
 * Reject an entire file
 */
export async function rejectFile(
  sessionId: string,
  fileId: string
): Promise<{ success: boolean; fileChange: FileChange }> {
  return post(`/metadata-approval/sessions/${sessionId}/files/${fileId}/reject`);
}

/**
 * Accept all files and all field changes
 */
export async function acceptAllFiles(
  sessionId: string
): Promise<{ success: boolean; fileChanges: FileChange[] }> {
  return post(`/metadata-approval/sessions/${sessionId}/files/accept-all`);
}

/**
 * Reject all files
 */
export async function rejectAllFiles(
  sessionId: string
): Promise<{ success: boolean; fileChanges: FileChange[] }> {
  return post(`/metadata-approval/sessions/${sessionId}/files/reject-all`);
}

/**
 * Apply all approved changes to files
 */
export async function applyApprovedChanges(
  sessionId: string
): Promise<{
  success: boolean;
  total: number;
  successful: number;
  failed: number;
  results: Array<{ fileId: string; filename: string; success: boolean; error?: string }>;
}> {
  return post(`/metadata-approval/sessions/${sessionId}/apply`);
}

/**
 * Get series cache statistics
 */
export async function getSeriesCacheStats(): Promise<SeriesCacheStats> {
  return get<SeriesCacheStats>('/metadata-approval/cache/stats');
}

/**
 * Clean up expired cache entries
 */
export async function cleanSeriesCache(): Promise<{
  success: boolean;
  deleted: number;
  freedMb: number;
}> {
  return post('/metadata-approval/cache/clean');
}

/**
 * Clear entire series cache
 */
export async function clearSeriesCache(): Promise<{
  success: boolean;
  deleted: number;
  freedMb: number;
}> {
  return post('/metadata-approval/cache/clear');
}

// =============================================================================
// Metadata Jobs (Persistent Jobs)
// =============================================================================

export type JobStatus =
  | 'options'
  | 'initializing'
  | 'series_approval'
  | 'fetching_issues'
  | 'file_review'
  | 'applying'
  | 'complete'
  | 'cancelled'
  | 'error';

export interface JobLogEntry {
  id: string;
  step: string;
  message: string;
  detail?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
}

export interface MetadataJob {
  id: string;
  status: JobStatus;
  step: string;
  fileIds: string[];
  options: CreateApprovalSessionOptions;
  session: ApprovalSession | null;
  currentSeriesIndex: number;
  totalFiles: number;
  processedFiles: number;
  error: string | null;
  applyResult: ApplyResult | null;
  createdAt: string;
  updatedAt: string;
  logs: Record<string, JobLogEntry[]>;
  // Progress snapshot for real-time display on reconnect
  currentProgressMessage?: string | null;
  currentProgressDetail?: string | null;
  lastProgressAt?: string | null;
}

export interface ApplyResult {
  total: number;
  successful: number;
  failed: number;
  converted: number;
  conversionFailed: number;
  results: Array<{ fileId: string; filename: string; success: boolean; error?: string; converted?: boolean }>;
}

/**
 * List active metadata jobs
 */
export async function listMetadataJobs(): Promise<{ jobs: MetadataJob[] }> {
  return get('/metadata-jobs');
}

/**
 * List all metadata jobs (including completed)
 */
export async function listAllMetadataJobs(): Promise<{ jobs: MetadataJob[] }> {
  return get('/metadata-jobs/all');
}

/**
 * Create a new metadata job
 */
export async function createMetadataJob(
  fileIds: string[]
): Promise<{ job: MetadataJob }> {
  return post('/metadata-jobs', { fileIds });
}

/**
 * Get metadata job by ID
 */
export async function getMetadataJob(
  jobId: string
): Promise<{ job: MetadataJob }> {
  return get(`/metadata-jobs/${jobId}`);
}

/**
 * Update job options
 */
export async function updateMetadataJobOptions(
  jobId: string,
  options: CreateApprovalSessionOptions
): Promise<{ job: MetadataJob }> {
  return patch(`/metadata-jobs/${jobId}/options`, { options });
}

/**
 * Delete a metadata job
 */
export async function deleteMetadataJob(
  jobId: string
): Promise<{ success: boolean }> {
  return del(`/metadata-jobs/${jobId}`);
}

/**
 * Start a metadata job (enqueues for background processing)
 * Returns immediately - poll getMetadataJob for status updates.
 */
export async function startMetadataJob(
  jobId: string
): Promise<{ status: string; message: string; jobId: string }> {
  return post(`/metadata-jobs/${jobId}/start`);
}

/**
 * Cancel a metadata job
 */
export async function cancelMetadataJob(
  jobId: string
): Promise<{ success: boolean }> {
  return post(`/metadata-jobs/${jobId}/cancel`);
}

/**
 * Abandon a metadata job completely - cancel, cleanup, and delete all data
 */
export async function abandonMetadataJob(
  jobId: string
): Promise<{ success: boolean; message: string }> {
  return post(`/metadata-jobs/${jobId}/abandon`);
}

/**
 * Custom search for current series in job
 * @param jobId - The job ID
 * @param query - The search query string
 * @param source - Optional specific source to search (if not provided, searches all configured sources)
 */
export async function searchJobSeries(
  jobId: string,
  query: string,
  source?: MetadataSource
): Promise<{ results: SeriesMatch[]; job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/search`, { query, source });
}

/**
 * Approve series in job
 * @param selectedSeriesId - Series to use for series-level metadata (name, publisher, etc.)
 * @param issueMatchingSeriesId - Series to use for issue matching (optional, defaults to selectedSeriesId)
 */
export async function approveJobSeries(
  jobId: string,
  selectedSeriesId: string,
  issueMatchingSeriesId?: string
): Promise<{ hasMore: boolean; nextIndex: number; job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/approve-series`, {
    selectedSeriesId,
    issueMatchingSeriesId,
  });
}

/**
 * Skip series in job
 */
export async function skipJobSeries(
  jobId: string
): Promise<{ hasMore: boolean; nextIndex: number; job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/skip-series`);
}

/**
 * Navigate to a series group for review/change (keeps current selection visible)
 * Used when user wants to change series selection from file review - no confirmation needed.
 */
export async function navigateToJobSeriesGroup(
  jobId: string,
  seriesGroupIndex: number
): Promise<{
  success: boolean;
  status: ApprovalSessionStatus;
  currentSeriesIndex: number;
  currentSeriesGroup: SeriesGroup | null;
  job: MetadataJob;
}> {
  return post(`/metadata-jobs/${jobId}/navigate-series/${seriesGroupIndex}`);
}

/**
 * Reset a series group to allow re-selection (clears current selection)
 * Used when user explicitly wants to clear and search fresh.
 */
export async function resetJobSeriesGroup(
  jobId: string,
  seriesGroupIndex: number
): Promise<{
  success: boolean;
  status: ApprovalSessionStatus;
  currentSeriesIndex: number;
  currentSeriesGroup: SeriesGroup | null;
  job: MetadataJob;
}> {
  return post(`/metadata-jobs/${jobId}/reset-series/${seriesGroupIndex}`);
}

/**
 * Get available issues for manual selection in a job
 */
export async function getAvailableIssuesForJob(
  jobId: string,
  fileId: string
): Promise<{
  success: boolean;
  seriesName: string;
  source: MetadataSource;
  sourceId: string;
  issues: AvailableIssue[];
  totalCount: number;
  currentMatchedIssueId: string | null;
}> {
  return get(`/metadata-jobs/${jobId}/files/${fileId}/available-issues`);
}

/**
 * Update field approvals for a file in job
 */
export async function updateJobFileFields(
  jobId: string,
  fileId: string,
  fieldUpdates: Record<string, { approved?: boolean; editedValue?: string | number }>
): Promise<{ fileChange: FileChange; job: MetadataJob }> {
  return patch(`/metadata-jobs/${jobId}/files/${fileId}`, { fieldUpdates });
}

/**
 * Reject a file in job
 */
export async function rejectJobFile(
  jobId: string,
  fileId: string
): Promise<{ fileChange: FileChange; job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/files/${fileId}/reject`);
}

/**
 * Accept all files in job
 */
export async function acceptAllJobFiles(
  jobId: string
): Promise<{ job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/accept-all`);
}

/**
 * Reject all files in job
 */
export async function rejectAllJobFiles(
  jobId: string
): Promise<{ job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/reject-all`);
}

/**
 * Apply changes in job (enqueues for background processing)
 * Returns immediately - poll getMetadataJob for status updates.
 * Automatically converts CBR files to CBZ before applying metadata.
 */
export async function applyJobChanges(
  jobId: string
): Promise<{ status: string; message: string; jobId: string }> {
  return post(`/metadata-jobs/${jobId}/apply`);
}

// =============================================================================
// Cache Operations
// =============================================================================

export type CacheJobType = 'cover' | 'thumbnails' | 'full';
export type CacheJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface CacheJob {
  id: string;
  type: CacheJobType;
  fileIds: string[];
  status: CacheJobStatus;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  currentFile?: string;
  currentProgress?: {
    fileId: string;
    filename: string;
    currentPage: number;
    totalPages: number;
    status: 'extracting' | 'generating' | 'complete' | 'error';
    error?: string;
  };
  errors: Array<{ fileId: string; error: string }>;
}

export interface CacheSummary {
  covers: {
    totalFiles: number;
    totalSize: number;
    libraries: Array<{ libraryId: string; fileCount: number; size: number }>;
  };
  thumbnails: {
    totalFiles: number;
    totalThumbnails: number;
    totalSize: number;
    libraries: Array<{ libraryId: string; fileCount: number; thumbnailCount: number; size: number }>;
  };
  total: {
    size: number;
  };
}

/**
 * Get a cached thumbnail URL
 */
export function getThumbnailUrl(fileId: string, pageNumber: number): string {
  return `${API_BASE}/cache/thumbnails/${fileId}/${pageNumber}`;
}

/**
 * Get the number of cached thumbnails for a file
 */
export async function getThumbnailCount(
  fileId: string
): Promise<{ count: number }> {
  return get(`/cache/thumbnails/${fileId}/count`);
}

/**
 * Generate thumbnails for a file on-demand
 * Used when opening the reader to ensure thumbnails are available
 */
export async function generateThumbnails(
  fileId: string
): Promise<{
  success: boolean;
  pageCount: number;
  generatedCount: number;
  fromCache: number;
  errors: Array<{ page: number; error: string }>;
}> {
  return post(`/cache/thumbnails/${fileId}/generate`, {});
}

/**
 * Rebuild cache for specific files or a folder
 */
export async function rebuildCache(options: {
  fileIds?: string[];
  folderPath?: string;
  libraryId?: string;
  type?: CacheJobType;
}): Promise<{ jobId: string; fileCount: number; type: string; message: string }> {
  return post('/cache/rebuild', options);
}

/**
 * Get all active cache jobs
 */
export async function getCacheJobs(): Promise<{ jobs: CacheJob[]; queuedFiles: number }> {
  return get('/cache/jobs');
}

/**
 * Get a specific cache job
 */
export async function getCacheJob(jobId: string): Promise<{ job: CacheJob }> {
  return get(`/cache/jobs/${jobId}`);
}

/**
 * Cancel a cache job
 */
export async function cancelCacheJob(jobId: string): Promise<{ cancelled: boolean }> {
  return del(`/cache/jobs/${jobId}`);
}

/**
 * Get cache summary statistics
 */
export async function getCacheSummary(): Promise<CacheSummary> {
  return get('/cache/summary');
}

// =============================================================================
// Reading Progress
// =============================================================================

export interface ReadingProgress {
  id?: string;
  fileId: string;
  currentPage: number;
  totalPages: number;
  completed: boolean;
  bookmarks: number[];
  lastReadAt: string | null;
  createdAt?: string;
}

export interface ContinueReadingItem {
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  currentPage: number;
  totalPages: number;
  progress: number;
  lastReadAt: string;
}

export interface LibraryReadingStats {
  totalFiles: number;
  inProgress: number;
  completed: number;
  unread: number;
}

export interface AdjacentFile {
  fileId: string;
  filename: string;
  number?: string;
}

export interface AdjacentFiles {
  previous: AdjacentFile | null;
  next: AdjacentFile | null;
  currentIndex: number;
  totalInSeries: number;
  seriesName: string | null;
}

/**
 * Get reading progress for a file
 */
export async function getReadingProgress(fileId: string): Promise<ReadingProgress> {
  return get<ReadingProgress>(`/reading-progress/${fileId}`);
}

/**
 * Update reading progress for a file
 */
export async function updateReadingProgress(
  fileId: string,
  data: { currentPage: number; totalPages?: number; completed?: boolean }
): Promise<ReadingProgress> {
  const response = await fetch(`${API_BASE}/reading-progress/${fileId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<ReadingProgress>(response);
}

/**
 * Mark a file as completed
 */
export async function markAsCompleted(fileId: string): Promise<ReadingProgress> {
  return post<ReadingProgress>(`/reading-progress/${fileId}/complete`);
}

/**
 * Mark a file as incomplete
 */
export async function markAsIncomplete(fileId: string): Promise<ReadingProgress> {
  return post<ReadingProgress>(`/reading-progress/${fileId}/incomplete`);
}

/**
 * Delete reading progress for a file
 */
export async function deleteReadingProgress(fileId: string): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reading-progress/${fileId}`);
}

/**
 * Add a bookmark to a file
 */
export async function addBookmark(
  fileId: string,
  pageIndex: number
): Promise<ReadingProgress> {
  return post<ReadingProgress>(`/reading-progress/${fileId}/bookmarks`, { pageIndex });
}

/**
 * Remove a bookmark from a file
 */
export async function removeBookmark(
  fileId: string,
  pageIndex: number
): Promise<ReadingProgress> {
  return del<ReadingProgress>(`/reading-progress/${fileId}/bookmarks/${pageIndex}`);
}

/**
 * Get continue reading items
 */
export async function getContinueReading(
  limit = 3,
  libraryId?: string
): Promise<{ items: ContinueReadingItem[] }> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (libraryId) params.set('libraryId', libraryId);
  return get<{ items: ContinueReadingItem[] }>(`/reading-progress/continue-reading?${params}`);
}

/**
 * Get reading progress for all files in a library
 */
export async function getLibraryReadingProgress(
  libraryId: string
): Promise<{ progress: Record<string, { currentPage: number; totalPages: number; completed: boolean }> }> {
  return get(`/reading-progress/library/${libraryId}`);
}

/**
 * Get reading statistics for a library
 */
export async function getLibraryReadingStats(
  libraryId: string
): Promise<LibraryReadingStats> {
  return get<LibraryReadingStats>(`/reading-progress/library/${libraryId}/stats`);
}

/**
 * Get adjacent files (prev/next) in the same series
 */
export async function getAdjacentFiles(fileId: string): Promise<AdjacentFiles> {
  return get<AdjacentFiles>(`/reading-progress/${fileId}/adjacent`);
}

// =============================================================================
// Reader Settings
// =============================================================================

export type ReadingMode = 'single' | 'double' | 'doubleManga' | 'continuous';
export type ReadingDirection = 'ltr' | 'rtl' | 'vertical';
export type ImageScaling = 'fitHeight' | 'fitWidth' | 'fitScreen' | 'original' | 'custom';
export type ImageSplitting = 'none' | 'ltr' | 'rtl';
export type BackgroundColor = 'white' | 'gray' | 'black';
export type ColorCorrection = 'none' | 'sepia-correct' | 'contrast-boost' | 'desaturate' | 'invert';

export interface ReaderSettings {
  id: string;
  mode: ReadingMode;
  direction: ReadingDirection;
  scaling: ImageScaling;
  customWidth: number | null;
  splitting: ImageSplitting;
  background: BackgroundColor;
  brightness: number;
  colorCorrection: ColorCorrection;
  showPageShadow: boolean;
  autoHideUI: boolean;
  preloadCount: number;
  updatedAt: string;
}

export interface UpdateReaderSettingsInput {
  mode?: ReadingMode;
  direction?: ReadingDirection;
  scaling?: ImageScaling;
  customWidth?: number | null;
  splitting?: ImageSplitting;
  background?: BackgroundColor;
  brightness?: number;
  colorCorrection?: ColorCorrection;
  showPageShadow?: boolean;
  autoHideUI?: boolean;
  preloadCount?: number;
}

/**
 * Get current reader settings
 */
export async function getReaderSettings(): Promise<ReaderSettings> {
  return get<ReaderSettings>('/reader-settings');
}

/**
 * Update reader settings
 */
export async function updateReaderSettings(
  settings: UpdateReaderSettingsInput
): Promise<ReaderSettings> {
  const response = await fetch(`${API_BASE}/reader-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return handleResponse<ReaderSettings>(response);
}

/**
 * Reset reader settings to defaults
 */
export async function resetReaderSettings(): Promise<ReaderSettings> {
  return post<ReaderSettings>('/reader-settings/reset');
}

/**
 * Get page URL for reading
 */
export function getPageUrl(fileId: string, pagePath: string): string {
  return `${API_BASE}/archives/${fileId}/page/${encodeURIComponent(pagePath)}`;
}

/**
 * Get resolved reader settings for a specific file (applies hierarchy)
 */
export async function getResolvedReaderSettings(fileId: string): Promise<ReaderSettings> {
  return get<ReaderSettings>(`/reader-settings/resolved/${fileId}`);
}

// =============================================================================
// Library Reader Settings
// =============================================================================

export interface PartialReaderSettings {
  mode?: ReadingMode | null;
  direction?: ReadingDirection | null;
  scaling?: ImageScaling | null;
  customWidth?: number | null;
  splitting?: ImageSplitting | null;
  background?: BackgroundColor | null;
  brightness?: number | null;
  showPageShadow?: boolean | null;
  autoHideUI?: boolean | null;
  preloadCount?: number | null;
}

/**
 * Get library-level reader settings overrides
 */
export async function getLibraryReaderSettings(libraryId: string): Promise<PartialReaderSettings> {
  return get<PartialReaderSettings>(`/reader-settings/library/${libraryId}`);
}

/**
 * Update library-level reader settings overrides
 */
export async function updateLibraryReaderSettings(
  libraryId: string,
  settings: PartialReaderSettings
): Promise<PartialReaderSettings> {
  const response = await fetch(`${API_BASE}/reader-settings/library/${libraryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return handleResponse<PartialReaderSettings>(response);
}

/**
 * Delete library-level reader settings (revert to global defaults)
 */
export async function deleteLibraryReaderSettings(libraryId: string): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reader-settings/library/${libraryId}`);
}

// =============================================================================
// Series Reader Settings
// =============================================================================

/**
 * Get all series that have custom reader settings
 */
export async function getSeriesWithReaderSettings(): Promise<string[]> {
  return get<string[]>('/reader-settings/series');
}

/**
 * Get series-level reader settings overrides
 */
export async function getSeriesReaderSettings(series: string): Promise<PartialReaderSettings> {
  return get<PartialReaderSettings>(`/reader-settings/series/${encodeURIComponent(series)}`);
}

/**
 * Update series-level reader settings overrides
 */
export async function updateSeriesReaderSettings(
  series: string,
  settings: PartialReaderSettings
): Promise<PartialReaderSettings> {
  const response = await fetch(`${API_BASE}/reader-settings/series/${encodeURIComponent(series)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return handleResponse<PartialReaderSettings>(response);
}

/**
 * Delete series-level reader settings (revert to library/global defaults)
 */
export async function deleteSeriesReaderSettings(series: string): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reader-settings/series/${encodeURIComponent(series)}`);
}

// =============================================================================
// Reading Queue
// =============================================================================

export interface QueueItem {
  id: string;
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  position: number;
  addedAt: string;
  currentPage?: number;
  totalPages?: number;
  progress?: number;
}

export interface QueueStatus {
  items: QueueItem[];
  totalCount: number;
  nextUp: QueueItem | null;
}

/**
 * Get the full reading queue with status
 */
export async function getReadingQueue(): Promise<QueueStatus> {
  return get<QueueStatus>('/reading-queue');
}

/**
 * Add a file to the reading queue
 */
export async function addToReadingQueue(
  fileId: string,
  position?: number
): Promise<QueueItem> {
  return post<QueueItem>(`/reading-queue/${fileId}`, position !== undefined ? { position } : {});
}

/**
 * Add multiple files to the reading queue
 */
export async function addManyToReadingQueue(
  fileIds: string[]
): Promise<{ added: number; items: QueueItem[] }> {
  return post<{ added: number; items: QueueItem[] }>('/reading-queue/batch', { fileIds });
}

/**
 * Remove a file from the reading queue
 */
export async function removeFromReadingQueue(fileId: string): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reading-queue/${fileId}`);
}

/**
 * Clear the entire reading queue
 */
export async function clearReadingQueue(): Promise<{ success: boolean }> {
  return del<{ success: boolean }>('/reading-queue');
}

/**
 * Check if a file is in the queue
 */
export async function checkQueueStatus(fileId: string): Promise<{ inQueue: boolean; position: number | null }> {
  return get<{ inQueue: boolean; position: number | null }>(`/reading-queue/check/${fileId}`);
}

/**
 * Get the next item in the queue
 */
export async function getNextInQueue(): Promise<QueueItem | null> {
  return get<QueueItem | null>('/reading-queue/next');
}

/**
 * Get the item after a specific file in the queue
 */
export async function getNextAfterInQueue(fileId: string): Promise<QueueItem | null> {
  return get<QueueItem | null>(`/reading-queue/next-after/${fileId}`);
}

/**
 * Pop the first item from the queue (removes it and returns the file ID)
 */
export async function popFromQueue(): Promise<{ fileId: string | null }> {
  return post<{ fileId: string | null }>('/reading-queue/pop');
}

/**
 * Move an item to a new position in the queue
 */
export async function moveInQueue(fileId: string, position: number): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/reading-queue/${fileId}/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position }),
  });
  return handleResponse<{ success: boolean }>(response);
}

/**
 * Move an item to the front of the queue
 */
export async function moveToFrontOfQueue(fileId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/reading-queue/${fileId}/front`, {
    method: 'PUT',
  });
  return handleResponse<{ success: boolean }>(response);
}

/**
 * Reorder the entire queue
 */
export async function reorderQueue(fileIds: string[]): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/reading-queue/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileIds }),
  });
  return handleResponse<{ success: boolean }>(response);
}

// =============================================================================
// Reading History
// =============================================================================

export interface ReadingSession {
  id: string;
  fileId: string;
  startedAt: string;
  endedAt: string | null;
  startPage: number;
  endPage: number;
  pagesRead: number;
  duration: number;
  completed: boolean;
}

export interface ReadingHistoryItem {
  id: string;
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  startedAt: string;
  endedAt: string | null;
  pagesRead: number;
  duration: number;
  completed: boolean;
}

export interface DailyStats {
  date: string;
  comicsStarted: number;
  comicsCompleted: number;
  pagesRead: number;
  totalDuration: number;
  sessionsCount: number;
}

export interface AllTimeStats {
  totalComicsRead: number;
  totalPagesRead: number;
  totalReadingTime: number;
  averageSessionDuration: number;
  longestSession: number;
  currentStreak: number;
  longestStreak: number;
}

/**
 * Start a reading session
 */
export async function startReadingSession(
  fileId: string,
  startPage: number = 0
): Promise<{ sessionId: string }> {
  return post<{ sessionId: string }>('/reading-history/session/start', { fileId, startPage });
}

/**
 * Update a reading session with current progress
 */
export async function updateReadingSession(
  sessionId: string,
  currentPage: number
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/reading-history/session/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPage }),
  });
  return handleResponse<{ success: boolean }>(response);
}

/**
 * End a reading session
 */
export async function endReadingSession(
  sessionId: string,
  endPage: number,
  completed: boolean = false
): Promise<ReadingSession | null> {
  return post<ReadingSession | null>(`/reading-history/session/${sessionId}/end`, {
    endPage,
    completed,
  });
}

/**
 * Get recent reading history
 */
export async function getReadingHistory(
  limit: number = 20,
  libraryId?: string
): Promise<{ items: ReadingHistoryItem[] }> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (libraryId) params.set('libraryId', libraryId);
  return get<{ items: ReadingHistoryItem[] }>(`/reading-history?${params}`);
}

/**
 * Get reading history for a specific file
 */
export async function getFileReadingHistory(
  fileId: string
): Promise<{ sessions: ReadingSession[] }> {
  return get<{ sessions: ReadingSession[] }>(`/reading-history/file/${fileId}`);
}

/**
 * Clear history for a file
 */
export async function clearFileReadingHistory(
  fileId: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reading-history/file/${fileId}`);
}

/**
 * Clear all reading history
 */
export async function clearAllReadingHistory(): Promise<{ success: boolean }> {
  return del<{ success: boolean }>('/reading-history');
}

/**
 * Get daily reading statistics
 */
export async function getReadingStats(
  startDate?: string,
  endDate?: string
): Promise<{ stats: DailyStats[] }> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return get<{ stats: DailyStats[] }>(`/reading-history/stats?${params}`);
}

/**
 * Get all-time reading statistics
 */
export async function getAllTimeReadingStats(): Promise<AllTimeStats> {
  return get<AllTimeStats>('/reading-history/stats/all-time');
}

// =============================================================================
// Recommendations
// =============================================================================

export interface ComicRecommendation {
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  series: string | null;
  number: string | null;
  publisher: string | null;
  genre: string | null;
  reason: 'series_continuation' | 'same_publisher' | 'same_genre' | 'recently_added';
  reasonDetail?: string;
}

export interface DiscoverComic {
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  series: string | null;
  number: string | null;
  publisher: string | null;
}

export interface RecommendationsResult {
  seriesFromHistory: ComicRecommendation[];
  samePublisherGenre: ComicRecommendation[];
  recentlyAdded: ComicRecommendation[];
}

export interface DiscoverResult {
  comics: DiscoverComic[];
}

/**
 * Get all recommendations
 */
export async function getRecommendations(
  limit = 8,
  libraryId?: string
): Promise<RecommendationsResult> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (libraryId) params.set('libraryId', libraryId);
  return get<RecommendationsResult>(`/recommendations?${params}`);
}

/**
 * Get discover comics (random unread)
 */
export async function getDiscoverComics(
  limit = 12,
  libraryId?: string
): Promise<DiscoverResult> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (libraryId) params.set('libraryId', libraryId);
  return get<DiscoverResult>(`/recommendations/discover?${params}`);
}

// =============================================================================
// Series (Series-Centric Architecture)
// =============================================================================

export interface Series {
  id: string;
  name: string;
  startYear: number | null;
  publisher: string | null;
  summary: string | null;
  deck: string | null;
  endYear: number | null;
  volume: number | null;
  issueCount: number | null;
  genres: string | null;
  tags: string | null;
  ageRating: string | null;
  type: 'western' | 'manga';
  languageISO: string | null;
  characters: string | null;
  teams: string | null;
  locations: string | null;
  storyArcs: string | null;
  coverSource: 'api' | 'user' | 'auto';
  coverUrl: string | null;
  coverHash: string | null;
  coverFileId: string | null;
  primaryFolder: string | null;
  userNotes: string | null;
  aliases: string | null;
  customReadingOrder: string | null;
  lockedFields: string | null;
  comicVineId: string | null;
  metronId: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  _count?: { issues: number };
  progress?: SeriesProgress | null;
  // First issue for cover fallback (User > API > First Issue)
  issues?: Array<{ id: string }>;
}

export interface SeriesProgress {
  id: string;
  seriesId: string;
  totalOwned: number;
  totalRead: number;
  totalInProgress: number;
  lastReadFileId: string | null;
  lastReadIssueNum: number | null;
  lastReadAt: string | null;
  nextUnreadFileId: string | null;
}

export interface SeriesListOptions {
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'startYear' | 'updatedAt' | 'createdAt' | 'issueCount';
  sortOrder?: 'asc' | 'desc';
  search?: string;
  publisher?: string;
  type?: 'western' | 'manga';
  genres?: string[];
  hasUnread?: boolean;
}

export interface SeriesListResult {
  series: Series[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface SeriesCover {
  type: 'api' | 'user' | 'firstIssue' | 'none';
  coverHash?: string;  // Hash for API-downloaded cover (local cache)
  fileId?: string;     // File ID for user-selected or first issue cover
}

export interface SeriesIssue extends ComicFile {
  readingProgress?: {
    currentPage: number;
    totalPages: number;
    completed: boolean;
    lastReadAt: string | null;
  };
}

/**
 * Get paginated list of series
 */
export async function getSeriesList(
  options: SeriesListOptions = {}
): Promise<SeriesListResult> {
  const params = new URLSearchParams();
  if (options.page) params.set('page', options.page.toString());
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);
  if (options.search) params.set('search', options.search);
  if (options.publisher) params.set('publisher', options.publisher);
  if (options.type) params.set('type', options.type);
  if (options.genres) params.set('genres', options.genres.join(','));
  if (options.hasUnread !== undefined) params.set('hasUnread', options.hasUnread.toString());
  return get<SeriesListResult>(`/series?${params}`);
}

/**
 * Search series (for autocomplete)
 */
export async function searchSeries(
  query: string,
  limit = 10
): Promise<{ series: Series[] }> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', limit.toString());
  return get<{ series: Series[] }>(`/series/search?${params}`);
}

/**
 * Get a single series by ID
 */
export async function getSeries(seriesId: string): Promise<{ series: Series }> {
  return get<{ series: Series }>(`/series/${seriesId}`);
}

/**
 * Get issues in a series
 */
export async function getSeriesIssues(
  seriesId: string,
  options: { page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {}
): Promise<{ issues: SeriesIssue[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
  const params = new URLSearchParams();
  if (options.page) params.set('page', options.page.toString());
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);
  return get<{ issues: SeriesIssue[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/series/${seriesId}/issues?${params}`);
}

/**
 * Get series cover
 */
export async function getSeriesCover(seriesId: string): Promise<{ cover: SeriesCover }> {
  return get<{ cover: SeriesCover }>(`/series/${seriesId}/cover`);
}

/**
 * Get next unread issue (Continue Series)
 */
export async function getNextSeriesIssue(seriesId: string): Promise<{ nextIssue: ComicFile | null; message?: string }> {
  return get<{ nextIssue: ComicFile | null; message?: string }>(`/series/${seriesId}/next-issue`);
}

/**
 * Update a series
 */
export async function updateSeries(
  seriesId: string,
  data: Partial<Series>
): Promise<{ series: Series }> {
  return patch<{ series: Series }>(`/series/${seriesId}`, data);
}

/**
 * Get all publishers for filtering
 */
export async function getSeriesPublishers(): Promise<{ publishers: string[] }> {
  return get<{ publishers: string[] }>('/series/publishers');
}

/**
 * Get all genres for filtering
 */
export async function getSeriesGenres(): Promise<{ genres: string[] }> {
  return get<{ genres: string[] }>('/series/genres');
}

/**
 * Get series cover URL for display
 * Returns the URL to fetch the cover image
 */
export function getSeriesCoverUrl(seriesId: string): string {
  return `${API_BASE}/series/${seriesId}/cover-image`;
}

// =============================================================================
// Series Field Locking
// =============================================================================

export interface FieldSource {
  source: 'manual' | 'api' | 'file';
  lockedAt?: string;
}

/**
 * Get field sources for a series
 */
export async function getFieldSources(
  seriesId: string
): Promise<{ fieldSources: Record<string, FieldSource> }> {
  return get<{ fieldSources: Record<string, FieldSource> }>(`/series/${seriesId}/field-sources`);
}

/**
 * Lock a field to prevent auto-updates
 */
export async function lockField(seriesId: string, fieldName: string): Promise<void> {
  await post(`/series/${seriesId}/lock-field`, { fieldName });
}

/**
 * Unlock a field to allow auto-updates
 */
export async function unlockField(seriesId: string, fieldName: string): Promise<void> {
  await del(`/series/${seriesId}/lock-field?fieldName=${encodeURIComponent(fieldName)}`);
}

/**
 * Set series cover
 */
export async function setSeriesCover(
  seriesId: string,
  options: { source?: 'api' | 'user' | 'auto'; fileId?: string; url?: string }
): Promise<{ cover: SeriesCover }> {
  return post<{ cover: SeriesCover }>(`/series/${seriesId}/cover`, options);
}

// =============================================================================
// Series External Metadata Fetch
// =============================================================================

/**
 * Metadata payload from external APIs
 */
export interface SeriesMetadataPayload {
  seriesName?: string;
  publisher?: string;
  startYear?: number;
  endYear?: number;
  issueCount?: number;
  description?: string;
  deck?: string;
  coverUrl?: string;
  seriesType?: string;
  comicVineSeriesId?: string;
  metronSeriesId?: string;
  characters?: string[];
  locations?: string[];
  storyArcs?: string[];
  aliases?: string[];
  genres?: string[];
}

/**
 * Preview field for metadata comparison
 */
export interface MetadataPreviewField {
  field: string;
  label: string;
  currentValue: string | null;
  apiValue: string | null;
  isLocked: boolean;
  diff: 'same' | 'diff' | 'new' | 'removed';
}

/**
 * Preview result for metadata changes
 */
export interface MetadataPreviewResult {
  source: MetadataSource;
  externalId: string;
  fields: MetadataPreviewField[];
  lockedFields: string[];
}

/**
 * Fetch metadata for a series using stored external ID
 * If no external ID exists, returns needsSearch: true
 */
export async function fetchSeriesMetadata(
  seriesId: string
): Promise<{
  metadata?: SeriesMetadataPayload;
  source?: MetadataSource;
  externalId?: string;
  needsSearch?: boolean;
  message?: string;
}> {
  return post(`/series/${seriesId}/fetch-metadata`);
}

/**
 * Fetch metadata for a specific external ID
 * Used after user selects a series from search results
 */
export async function fetchSeriesMetadataByExternalId(
  seriesId: string,
  source: MetadataSource,
  externalId: string
): Promise<{
  metadata?: SeriesMetadataPayload;
  source?: MetadataSource;
  externalId?: string;
}> {
  return post(`/series/${seriesId}/fetch-metadata-by-id`, { source, externalId });
}

/**
 * Preview metadata changes before applying
 * Returns field-by-field comparison with diff indicators
 */
export async function previewSeriesMetadata(
  seriesId: string,
  metadata: SeriesMetadataPayload,
  source: MetadataSource,
  externalId: string
): Promise<{ preview: MetadataPreviewResult }> {
  return post(`/series/${seriesId}/preview-metadata`, { metadata, source, externalId });
}

/**
 * Apply selected metadata fields to a series
 */
export async function applySeriesMetadata(
  seriesId: string,
  options: {
    metadata: SeriesMetadataPayload;
    source: MetadataSource;
    externalId: string | null;
    fields: string[];
  }
): Promise<{
  series: Series;
  fieldsUpdated: string[];
}> {
  return post(`/series/${seriesId}/apply-metadata`, options);
}

/**
 * Unlink a series from an external metadata source
 */
export async function unlinkSeriesExternalId(
  seriesId: string,
  source: MetadataSource
): Promise<{ message: string }> {
  return del(`/series/${seriesId}/external-link?source=${source}`);
}

/**
 * Search external APIs (ComicVine, Metron, GCD) for series
 * @param query - Search query string
 * @param limit - Maximum number of results
 * @param source - Optional source to limit search to a specific provider
 */
export async function searchExternalSeries(
  query: string,
  limit = 10,
  source?: MetadataSource
): Promise<{
  series: SeriesMatch[];
  sources: MetadataSource[];
}> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', limit.toString());
  if (source) {
    params.set('source', source);
  }
  return get(`/series/search-external?${params}`);
}

// =============================================================================
// ComicVine Theme Scraping
// =============================================================================

/**
 * Scrape themes from a ComicVine volume page
 *
 * Since ComicVine's API doesn't expose themes, we use a backend proxy
 * to fetch the HTML page and parse it (avoids CORS issues).
 *
 * @param siteDetailUrl - Full URL to ComicVine volume page (e.g., https://comicvine.gamespot.com/american-vampire/4050-32051/)
 * @returns Array of theme names, or empty array if scraping fails
 */
export async function scrapeComicVineThemes(siteDetailUrl: string): Promise<string[]> {
  if (!siteDetailUrl || !siteDetailUrl.includes('comicvine.gamespot.com')) {
    return [];
  }

  try {
    // Use backend proxy to avoid CORS and Cloudflare issues
    const params = new URLSearchParams();
    params.set('url', siteDetailUrl);

    const response = await get<{
      success: boolean;
      themes: string[];
      count?: number;
      message?: string;
      error?: string;
    }>(`/metadata/scrape-themes?${params}`);

    if (response.success && response.themes) {
      return response.themes;
    }

    if (response.message) {
      console.warn('Theme scraping issue:', response.message);
    }

    return [];
  } catch (err) {
    console.warn('Failed to scrape ComicVine themes:', err);
    return [];
  }
}

// =============================================================================
// Series Merge & Duplicate Detection
// =============================================================================

export type DuplicateConfidence = 'high' | 'medium' | 'low';

export type DuplicateReason =
  | 'same_name'
  | 'similar_name'
  | 'same_comicvine_id'
  | 'same_metron_id'
  | 'same_publisher_similar_name';

/**
 * Series data optimized for merge operations
 */
export interface SeriesForMerge {
  id: string;
  name: string;
  publisher: string | null;
  startYear: number | null;
  endYear: number | null;
  issueCount: number | null;
  ownedIssueCount: number;
  comicVineId: string | null;
  metronId: string | null;
  coverUrl: string | null;
  coverHash: string | null;
  coverFileId: string | null;
  aliases: string | null;
  summary: string | null;
  type: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Duplicate group with confidence scoring
 */
export interface DuplicateGroup {
  id: string;
  series: SeriesForMerge[];
  confidence: DuplicateConfidence;
  reasons: DuplicateReason[];
  primaryReason: DuplicateReason;
}

/**
 * Merge preview response
 */
export interface MergePreview {
  targetSeries: SeriesForMerge;
  sourceSeries: SeriesForMerge[];
  resultingAliases: string[];
  totalIssuesAfterMerge: number;
  warnings: string[];
}

/**
 * Merge result
 */
export interface MergeResult {
  success: boolean;
  targetSeriesId: string;
  mergedSourceIds: string[];
  issuesMoved: number;
  aliasesAdded: string[];
  error?: string;
}

/**
 * Get potential duplicates response
 */
export interface DuplicatesResponse {
  duplicateGroups: DuplicateGroup[];
  totalGroups: number;
  byConfidence: {
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Get potential duplicate series with confidence scoring
 */
export async function getPotentialDuplicates(
  minConfidence?: DuplicateConfidence
): Promise<DuplicatesResponse> {
  const params = new URLSearchParams();
  if (minConfidence) params.set('minConfidence', minConfidence);
  return get<DuplicatesResponse>(`/series/duplicates/enhanced${params.toString() ? `?${params}` : ''}`);
}

/**
 * Preview a merge operation
 */
export async function previewMergeSeries(
  sourceIds: string[],
  targetId: string
): Promise<{ preview: MergePreview }> {
  return post<{ preview: MergePreview }>('/series/merge/preview', { sourceIds, targetId });
}

/**
 * Merge series - moves all issues from source series to target
 * and adds source series names as aliases to target
 */
export async function mergeSeries(
  sourceIds: string[],
  targetId: string
): Promise<{ result: MergeResult }> {
  return post<{ result: MergeResult }>('/series/admin/merge', { sourceIds, targetId });
}

// =============================================================================
// Full Data Mode (Multi-Source Search)
// =============================================================================

export type SearchMode = 'quick' | 'full';

/**
 * Merged series metadata with provenance tracking
 */
export interface MergedSeriesMetadata extends SeriesMatch {
  /** Which source provided each field */
  fieldSources: Record<string, MetadataSource>;
  /** All sources that contributed data */
  contributingSources: MetadataSource[];
}

/**
 * Result of a full data multi-source search
 */
export interface MultiSourceSearchResult {
  /** Results from each source */
  sourceResults: Record<MetadataSource, SeriesMatch[]>;
  /** Best match merged across all sources */
  merged: MergedSeriesMetadata | null;
  /** Search metadata per source */
  sources: {
    [key in MetadataSource]?: {
      searched: boolean;
      available: boolean;
      resultCount: number;
      error?: string;
    };
  };
}

export interface SearchQuery {
  series?: string;
  issueNumber?: string;
  publisher?: string;
  year?: number;
  writer?: string;
}

/**
 * Search for series across all enabled metadata sources (Full Data mode)
 */
export async function searchSeriesFullData(
  query: SearchQuery,
  options: { sources?: MetadataSource[]; limit?: number } = {}
): Promise<MultiSourceSearchResult> {
  return post<MultiSourceSearchResult>('/metadata/search-full', {
    query,
    sources: options.sources,
    limit: options.limit || 10,
  });
}

/** Result from expanding a series with all sources */
export interface ExpandedSeriesResultWithSources {
  merged: MergedSeriesMetadata;
  sourceResults: Record<MetadataSource, SeriesMatch | null>;
}

/**
 * Expand a single series result by fetching from additional sources.
 * Returns both the merged result and per-source SeriesMatch objects.
 */
export async function expandSeriesResult(
  match: SeriesMatch,
  additionalSources?: MetadataSource[]
): Promise<ExpandedSeriesResultWithSources> {
  return post<ExpandedSeriesResultWithSources>('/metadata/expand-result', {
    match,
    additionalSources,
  });
}

/**
 * Get full series metadata merged from all sources
 */
export async function getSeriesMetadataFullData(
  source: MetadataSource,
  sourceId: string
): Promise<MergedSeriesMetadata> {
  return get<MergedSeriesMetadata>(`/metadata/series-full/${source}/${sourceId}`);
}

