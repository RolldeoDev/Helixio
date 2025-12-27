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

/**
 * Get URL for a collection mosaic cover by its hash
 * Used when collection has coverType='auto' with a cached mosaic
 */
export function getCollectionCoverUrl(coverHash: string): string {
  return `${API_BASE}/covers/collection/${coverHash}`;
}

/**
 * Get preview URL for a collection's auto-generated mosaic
 * Returns the image directly for settings drawer preview
 */
export function getCollectionCoverPreviewUrl(collectionId: string): string {
  return `${API_BASE}/collections/${collectionId}/cover/preview`;
}
