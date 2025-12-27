/**
 * API Archives Module
 *
 * Archive operations, ComicInfo parsing/updating, and file conversion.
 */

import { get, post, patch } from './shared';

// =============================================================================
// Types
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

// =============================================================================
// Archives
// =============================================================================

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

// =============================================================================
// ComicInfo
// =============================================================================

export async function getComicInfo(
  fileId: string
): Promise<{ fileId: string; filename: string; comicInfo: ComicInfo; lockedFields?: string[] }> {
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
