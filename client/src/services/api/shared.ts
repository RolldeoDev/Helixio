/**
 * API Shared Module
 *
 * HTTP helpers, constants, and base types shared across all API modules.
 */

export const API_BASE = '/api';

// =============================================================================
// Constants
// =============================================================================

/**
 * Sentinel value to indicate a field should be removed from ComicInfo.xml.
 * This survives JSON.stringify() (unlike undefined) and signals to the
 * backend that the field should be deleted entirely, not just set to empty.
 */
export const REMOVE_FIELD = '__REMOVE_FIELD__' as const;
export type FieldRemoval = typeof REMOVE_FIELD;

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
  cache?: {
    health: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      l1Available: boolean;
      l2Available: boolean;
      message?: string;
    };
    stats: {
      l1: {
        hits: number;
        misses: number;
        sets: number;
        deletes: number;
        errors: number;
        size: number;
        maxSizeBytes: number;
        utilizationPercent: number;
      };
      l2: {
        hits: number;
        misses: number;
        sets: number;
        deletes: number;
        errors: number;
        connected: boolean;
        memoryUsedBytes?: number;
        memoryMaxBytes?: number;
      };
      combined: {
        hitRate: number;
        totalHits: number;
        totalMisses: number;
      };
    };
  };
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
  /** Auto-complete threshold: percentage (0-100), null = disabled */
  autoCompleteThreshold?: number | null;
}

export interface ComicFile {
  id: string;
  libraryId: string;
  path: string;
  relativePath: string;
  filename: string;
  size: number | string; // BigInt serialized as string for files > 2GB
  hash: string | null;
  status: 'pending' | 'indexed' | 'orphaned' | 'quarantined';
  modifiedAt: string;
  createdAt: string;
  updatedAt: string;
  seriesId?: string | null;
  metadata?: FileMetadata | null;
  /** Cover settings */
  coverSource?: 'auto' | 'page' | 'custom';
  coverHash?: string | null;
}

export interface FileMetadata {
  id: string;
  series: string | null;
  number: string | null;
  title: string | null;
  volume: number | null;
  year: number | null;
  month: number | null;
  day: number | null;
  writer: string | null;
  penciller: string | null;
  publisher: string | null;
  genre: string | null;
  summary: string | null;
  characters: string | null;
  teams: string | null;
  locations: string | null;
  storyArc: string | null;
  format: string | null;
  pageCount: number | null;
  // Manga classification fields
  contentType: string | null; // "chapter" | "volume" | "extra" | "omake" | "bonus"
  parsedVolume: string | null; // Volume number from filename (e.g., "5" from v5c12)
  parsedChapter: string | null; // Chapter number from filename (e.g., "12" from v5c12)
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

export async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
      message: response.statusText,
    }));
    // Handle server's standardized error format: { success: false, error: { code, message } }
    const errorMessage =
      errorBody?.error?.message ||  // Server's standard format
      errorBody?.message ||          // Simple message format
      (typeof errorBody?.error === 'string' ? errorBody.error : null) ||  // Simple error format
      `HTTP ${response.status}`;
    throw new Error(errorMessage);
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

export async function get<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`);
  return handleResponse<T>(response);
}

export async function post<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function patch<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function del<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'DELETE',
  });
  return handleResponse<T>(response);
}

export async function put<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}
