/**
 * API Files Module
 *
 * File operations, folder management, cover handling, and URL helpers.
 */

import { API_BASE, get, post, del } from './shared';
import type { ComicFile, PaginatedResponse } from './shared';

// Re-export types that consumers might need
export type { ComicFile, PaginatedResponse };

// =============================================================================
// Types
// =============================================================================

export interface GetFilesParams {
  page?: number;
  limit?: number;
  all?: boolean;  // When true, fetch all items without pagination
  status?: string;
  folder?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  groupBy?: string;
}

export interface LibraryFolders {
  id: string;
  name: string;
  type: string;
  folders: string[];
}

export interface FolderRenameResult {
  success: boolean;
  oldPath: string;
  newPath: string;
  filesUpdated: number;
  logId?: string;
  error?: string;
}

export interface FileCoverInfo {
  id: string;
  coverSource: 'auto' | 'page' | 'custom';
  coverPageIndex: number | null;
  coverHash: string | null;
  coverUrl: string | null;
}

// =============================================================================
// Files
// =============================================================================

export async function getLibraryFiles(
  libraryId: string,
  params: GetFilesParams = {}
): Promise<PaginatedResponse<ComicFile>> {
  const searchParams = new URLSearchParams();
  if (params.all) searchParams.set('all', 'true');
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.folder) searchParams.set('folder', params.folder);
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.order) searchParams.set('order', params.order);
  if (params.groupBy && params.groupBy !== 'none') searchParams.set('groupBy', params.groupBy);

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

/**
 * Get files from ALL libraries with pagination
 */
export async function getAllLibraryFiles(
  params: GetFilesParams = {}
): Promise<PaginatedResponse<ComicFile>> {
  const searchParams = new URLSearchParams();
  if (params.all) searchParams.set('all', 'true');
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.folder) searchParams.set('folder', params.folder);
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.order) searchParams.set('order', params.order);
  if (params.groupBy && params.groupBy !== 'none') searchParams.set('groupBy', params.groupBy);

  const query = searchParams.toString();
  return get<PaginatedResponse<ComicFile>>(
    `/libraries/files${query ? `?${query}` : ''}`
  );
}

/**
 * Get folder structure for ALL libraries
 */
export async function getAllLibraryFolders(): Promise<{ libraries: LibraryFolders[] }> {
  return get<{ libraries: LibraryFolders[] }>('/libraries/folders');
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
// File-Series Linking
// =============================================================================

/**
 * Link a file to a different series
 */
export async function linkFileToSeries(
  fileId: string,
  seriesId: string
): Promise<{ message: string }> {
  // Route is under /api/series/files/:fileId/link-series
  return post(`/series/files/${fileId}/link-series`, { seriesId });
}

/**
 * Unlink a file from its current series
 */
export async function unlinkFileFromSeries(
  fileId: string
): Promise<{ message: string }> {
  // Route is under /api/series/files/:fileId/unlink-series
  return del(`/series/files/${fileId}/unlink-series`);
}

// =============================================================================
// File Cover Management
// =============================================================================

/**
 * Get pages list for an archive (for cover selection)
 */
export async function getFilePages(
  fileId: string
): Promise<{ fileId: string; pages: string[]; pageCount: number }> {
  return get(`/files/${fileId}/pages`);
}

/**
 * Get current cover settings for a file
 */
export async function getFileCoverInfo(fileId: string): Promise<FileCoverInfo> {
  return get(`/files/${fileId}/cover-info`);
}

/**
 * Set cover for a file
 * - source 'auto': Reset to default (first page/cover.jpg)
 * - source 'page': Use specific page index
 * - source 'custom' with url: Download from URL
 */
export async function setFileCover(
  fileId: string,
  options: { source: 'auto' | 'page' | 'custom'; pageIndex?: number; url?: string }
): Promise<{ success: boolean; coverSource: string; coverHash?: string; coverPageIndex?: number }> {
  return post(`/files/${fileId}/cover`, options);
}

/**
 * Upload a custom cover image for a file
 */
export async function uploadFileCover(
  fileId: string,
  file: File
): Promise<{ success: boolean; coverSource: string; coverHash: string }> {
  const formData = new FormData();
  formData.append('cover', file);

  const response = await fetch(`${API_BASE}/files/${fileId}/cover/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || error.message || 'Failed to upload cover');
  }

  return response.json();
}

/**
 * Get page thumbnail URL for cover preview
 */
export function getPageThumbnailUrl(fileId: string, pagePath: string): string {
  return `${API_BASE}/archives/${fileId}/page/${encodeURIComponent(pagePath)}`;
}

// =============================================================================
// Cover URL Helpers
// =============================================================================

/**
 * Get cover URL for a file with optional cache-busting parameter.
 * @param fileId - The file ID
 * @param version - Optional version string (e.g., coverHash or timestamp) for cache-busting
 */
export function getCoverUrl(fileId: string, version?: string | null): string {
  const baseUrl = `${API_BASE}/archives/${fileId}/cover`;
  if (version) {
    return `${baseUrl}?v=${encodeURIComponent(version)}`;
  }
  return baseUrl;
}

/**
 * Get URL for a cached API cover by its hash.
 * The hash itself acts as a cache-buster since different covers have different hashes.
 * Used when series has coverHash from downloaded API cover.
 */
export function getApiCoverUrl(coverHash: string): string {
  return `${API_BASE}/covers/series/${coverHash}`;
}

/**
 * Type for series-like objects that can have cover URLs
 * Supports full Series, RelatedSeriesInfo, and partial series objects
 */
export interface SeriesCoverData {
  coverHash?: string | null;
  coverFileId?: string | null;
  coverSource?: string | null;  // Allow any string to support various series types
  issues?: Array<{ id: string; coverHash?: string | null }>;
  firstIssueId?: string | null;
  /** First issue's coverHash for cache-busting when issue cover changes */
  firstIssueCoverHash?: string | null;
}

/**
 * Resolve cover URL for a series with full fallback chain
 * Priority: API cover (coverHash) > User-set cover (coverFileId) > First issue cover
 *
 * This is the canonical implementation - use this function instead of
 * duplicating the fallback logic in components.
 *
 * Note: This is different from getSeriesCoverUrl(seriesId) in series.ts which
 * returns a server endpoint URL. This function resolves the URL client-side
 * from available series data.
 *
 * @param series - Series-like object with cover data
 * @returns Cover URL string or null if no cover available
 */
export function resolveSeriesCoverUrl(series: SeriesCoverData): string | null {
  // Respect coverSource setting if present
  if (series.coverSource === 'api') {
    if (series.coverHash) return getApiCoverUrl(series.coverHash);
    // Fall through to first issue if no API cover available
  } else if (series.coverSource === 'user') {
    if (series.coverFileId) return getCoverUrl(series.coverFileId);
    // Fall through to first issue if selection is invalid
  }

  // Default/auto mode: Priority fallback chain
  // API cover (local cache) > User-set file > First issue in series
  if (series.coverHash) return getApiCoverUrl(series.coverHash);
  if (series.coverFileId) return getCoverUrl(series.coverFileId);

  // Fallback to first issue cover (with coverHash for cache-busting)
  const firstIssue = series.issues?.[0];
  const firstIssueId = firstIssue?.id || series.firstIssueId;
  const firstIssueCoverHash = firstIssue?.coverHash || series.firstIssueCoverHash;
  if (firstIssueId) return getCoverUrl(firstIssueId, firstIssueCoverHash);

  return null;
}

/**
 * Get URL for a collection mosaic cover by its hash.
 * The hash itself acts as a cache-buster since different covers have different hashes.
 * Used when collection has coverType='auto' with a cached mosaic.
 */
export function getCollectionCoverUrl(coverHash: string): string {
  return `${API_BASE}/covers/collection/${coverHash}`;
}

// =============================================================================
// Cover Version Tracking
// =============================================================================

/**
 * Global cover version cache for cache-busting.
 * Maps fileId -> version (timestamp or hash).
 * Updated when covers are changed and persisted to sessionStorage.
 */
const COVER_VERSION_STORAGE_KEY = 'helixio_cover_versions';

function getCoverVersionCache(): Map<string, string> {
  if (typeof window === 'undefined') return new Map();

  try {
    const stored = sessionStorage.getItem(COVER_VERSION_STORAGE_KEY);
    if (stored) {
      return new Map(JSON.parse(stored));
    }
  } catch {
    // Ignore storage errors
  }
  return new Map();
}

function saveCoverVersionCache(cache: Map<string, string>): void {
  if (typeof window === 'undefined') return;

  try {
    // Keep only last 1000 entries to prevent unbounded growth
    const entries = Array.from(cache.entries());
    if (entries.length > 1000) {
      entries.splice(0, entries.length - 1000);
    }
    sessionStorage.setItem(COVER_VERSION_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Update the cover version for a file/series.
 * Call this after a cover update to ensure cache-busting.
 */
export function updateCoverVersion(id: string, version?: string): void {
  const cache = getCoverVersionCache();
  cache.set(id, version || Date.now().toString());
  saveCoverVersionCache(cache);
}

/**
 * Get the cover version for cache-busting.
 * Returns undefined if no version has been set.
 */
export function getCoverVersion(id: string): string | undefined {
  return getCoverVersionCache().get(id);
}

/**
 * Clear all cover versions (useful for testing or cache reset).
 */
export function clearCoverVersions(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(COVER_VERSION_STORAGE_KEY);
}

/**
 * Get preview URL for a collection's auto-generated mosaic
 * Returns the image directly for settings drawer preview
 */
export function getCollectionCoverPreviewUrl(collectionId: string): string {
  return `${API_BASE}/collections/${collectionId}/cover/preview`;
}
