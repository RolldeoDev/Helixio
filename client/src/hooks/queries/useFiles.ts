/**
 * useFiles Hook
 *
 * React Query hooks for file and folder operations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  invalidateFiles,
  invalidateFile,
  invalidateAfterCoverUpdate,
} from '../../lib/cacheInvalidation';
import {
  getLibraryFiles,
  getAllLibraryFiles,
  getLibraryFolders,
  getAllLibraryFolders,
  getFile,
  getFilePages,
  getFileCoverInfo,
  setFileCover,
  uploadFileCover,
  moveFile,
  renameFile,
  deleteFile,
  quarantineFile,
  restoreFile,
  bulkDeleteFiles,
  bulkQuarantineFiles,
  renameFolder,
  type GetFilesParams,
  type ComicFile,
  type PaginatedResponse,
  type LibraryFolders,
  type FileCoverInfo,
} from '../../services/api/files';

// =============================================================================
// Types
// =============================================================================

export interface UseFilesOptions extends GetFilesParams {
  libraryId?: string | null;
  enabled?: boolean;
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch files for a specific library or all libraries
 */
export function useFiles(options: UseFilesOptions = {}) {
  const { libraryId, enabled = true, ...params } = options;

  // Create a stable params object for the query key
  const queryParams = {
    libraryId: libraryId ?? 'all',
    ...params,
  };

  return useQuery({
    queryKey: queryKeys.files.list(queryParams),
    queryFn: async () => {
      if (libraryId) {
        return getLibraryFiles(libraryId, params);
      }
      return getAllLibraryFiles(params);
    },
    enabled: enabled && (libraryId !== undefined || true),
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single file by ID
 */
export function useFile(fileId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.files.detail(fileId!),
    queryFn: () => getFile(fileId!),
    enabled: !!fileId,
  });
}

/**
 * Fetch pages for a file (for cover selection)
 */
export function useFilePages(fileId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.files.pages(fileId!),
    queryFn: () => getFilePages(fileId!),
    enabled: !!fileId,
    staleTime: 5 * 60 * 1000, // Pages don't change
  });
}

/**
 * Fetch cover info for a file
 */
export function useFileCoverInfo(fileId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.files.coverInfo(fileId!),
    queryFn: () => getFileCoverInfo(fileId!),
    enabled: !!fileId,
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch folders for a specific library
 */
export function useLibraryFolders(libraryId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.libraries.folders(libraryId!),
    queryFn: async () => {
      const response = await getLibraryFolders(libraryId!);
      return response.folders;
    },
    enabled: !!libraryId,
    staleTime: 5 * 60 * 1000, // 5 minutes - folders rarely change
  });
}

/**
 * Fetch folders for all libraries
 */
export function useAllLibraryFolders(enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.libraries.allFolders(),
    queryFn: async () => {
      const response = await getAllLibraryFolders();
      return response.libraries;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - folders rarely change
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Move a file to a new location
 */
export function useMoveFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fileId,
      destinationPath,
      options,
    }: {
      fileId: string;
      destinationPath: string;
      options?: { createDirs?: boolean; overwrite?: boolean };
    }) => moveFile(fileId, destinationPath, options),
    onSuccess: (_, { fileId }) => {
      invalidateFile(fileId);
      invalidateFiles();
      // Folders may have changed
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries.all });
    },
  });
}

/**
 * Rename a file
 */
export function useRenameFile() {
  return useMutation({
    mutationFn: ({ fileId, newFilename }: { fileId: string; newFilename: string }) =>
      renameFile(fileId, newFilename),
    onSuccess: (_, { fileId }) => {
      invalidateFile(fileId);
      invalidateFiles();
    },
  });
}

/**
 * Delete a file
 */
export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteFile,
    onSuccess: () => {
      invalidateFiles();
      // Library counts may have changed
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries.all });
      // Series may need update
      queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
    },
  });
}

/**
 * Quarantine a file
 */
export function useQuarantineFile() {
  return useMutation({
    mutationFn: ({ fileId, reason }: { fileId: string; reason?: string }) =>
      quarantineFile(fileId, reason),
    onSuccess: (_, { fileId }) => {
      invalidateFile(fileId);
      invalidateFiles();
    },
  });
}

/**
 * Restore a quarantined file
 */
export function useRestoreFile() {
  return useMutation({
    mutationFn: restoreFile,
    onSuccess: (_, fileId) => {
      invalidateFile(fileId);
      invalidateFiles();
    },
  });
}

/**
 * Bulk delete files
 */
export function useBulkDeleteFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bulkDeleteFiles,
    onSuccess: () => {
      invalidateFiles();
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
    },
  });
}

/**
 * Bulk quarantine files
 */
export function useBulkQuarantineFiles() {
  return useMutation({
    mutationFn: ({ fileIds, reason }: { fileIds: string[]; reason?: string }) =>
      bulkQuarantineFiles(fileIds, reason),
    onSuccess: () => {
      invalidateFiles();
    },
  });
}

/**
 * Set file cover
 */
export function useSetFileCover() {
  return useMutation({
    mutationFn: ({
      fileId,
      options,
    }: {
      fileId: string;
      options: { source: 'auto' | 'page' | 'custom'; pageIndex?: number; url?: string };
    }) => setFileCover(fileId, options),
    onSuccess: (result, { fileId }) => {
      invalidateAfterCoverUpdate({ fileId, coverHash: result.coverHash });
    },
  });
}

/**
 * Upload custom cover for a file
 */
export function useUploadFileCover() {
  return useMutation({
    mutationFn: ({ fileId, file }: { fileId: string; file: File }) =>
      uploadFileCover(fileId, file),
    onSuccess: (result, { fileId }) => {
      invalidateAfterCoverUpdate({ fileId, coverHash: result.coverHash });
    },
  });
}

/**
 * Rename a folder
 */
export function useRenameFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      libraryId,
      folderPath,
      newName,
    }: {
      libraryId: string;
      folderPath: string;
      newName: string;
    }) => renameFolder(libraryId, folderPath, newName),
    onSuccess: (_, { libraryId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries.folders(libraryId) });
      invalidateFiles();
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Invalidate all file-related queries
 */
export function useInvalidateFiles() {
  return () => {
    invalidateFiles();
  };
}

/**
 * Get a file from cache without fetching
 */
export function useFileFromCache(fileId: string | null | undefined): ComicFile | undefined {
  const queryClient = useQueryClient();

  if (!fileId) return undefined;

  // Try to get from detail cache
  return queryClient.getQueryData<ComicFile>(queryKeys.files.detail(fileId));
}

// Re-export types for convenience
export type {
  ComicFile,
  PaginatedResponse,
  GetFilesParams,
  LibraryFolders,
  FileCoverInfo,
};
