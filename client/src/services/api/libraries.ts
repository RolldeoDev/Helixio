/**
 * API Libraries Module
 *
 * Library management, health checks, and scanning operations.
 */

import { get, post, patch, del } from './shared';
import type { HealthStatus, Library, ScanResult } from './shared';

// Re-export types that consumers might need
export type { HealthStatus, Library, ScanResult };

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
