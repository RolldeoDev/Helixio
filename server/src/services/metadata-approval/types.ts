/**
 * Metadata Approval Types
 *
 * Shared type definitions for the metadata approval workflow.
 */

import type { MetadataSource, SeriesMatch, LibraryType } from '../metadata-search.service.js';

// Re-export for convenience
export type { SeriesMatch, MetadataSource, LibraryType };

// =============================================================================
// Session Types
// =============================================================================

export type ApprovalSessionStatus =
  | 'grouping'
  | 'series_approval'
  | 'fetching_issues'
  | 'file_review'
  | 'applying'
  | 'complete'
  | 'cancelled';

/** LLM-parsed file metadata stored per file */
export interface ParsedFileData {
  series?: string;
  number?: string;
  year?: number;
  // Manga-specific fields
  volume?: string;
  chapter?: string;
  contentType?: 'chapter' | 'volume' | 'omake' | 'extra' | 'bonus' | 'oneshot';
}

export interface SeriesGroup {
  /** Detected search query from filenames */
  query: SearchQuery;
  /** Display name for the group (derived from query) */
  displayName: string;
  /** File IDs in this group */
  fileIds: string[];
  /** Filenames for display */
  filenames: string[];
  /** LLM-parsed data for each file (keyed by file ID) - used for issue matching */
  parsedFiles: Record<string, ParsedFileData>;
  /** Search results from API */
  searchResults: SeriesMatch[];
  /** Pagination info for search results */
  searchPagination?: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  /** User-selected series for series-level metadata (name, publisher, etc.) */
  selectedSeries: SeriesMatch | null;
  /** User-selected series for issue matching (may differ from selectedSeries for collected editions) */
  issueMatchingSeries: SeriesMatch | null;
  /** Status of this group */
  status: 'pending' | 'searching' | 'approved' | 'skipped';
  /** Whether this group was pre-approved from an existing series.json file */
  preApprovedFromSeriesJson?: boolean;
  /** Whether this group was pre-approved from a database Series with existing external IDs */
  preApprovedFromDatabase?: boolean;
}

export interface SearchQuery {
  series?: string;
  issueNumber?: string;
  year?: number;
}

// =============================================================================
// Field Change Types
// =============================================================================

export interface FieldChange {
  /** Current value in the file */
  current: string | number | null;
  /** Proposed value from API */
  proposed: string | number | null;
  /** Whether this change is approved */
  approved: boolean;
  /** Whether the user edited the proposed value */
  edited: boolean;
  /** User-edited value (if edited) */
  editedValue?: string | number;
}

export interface FileChange {
  fileId: string;
  filename: string;
  /** Matched issue from API */
  matchedIssue: {
    source: MetadataSource;
    sourceId: string;
    number: string;
    title?: string;
    coverDate?: string;
  } | null;
  /** Confidence of the match (0-1) */
  matchConfidence: number;
  /** Field-by-field changes */
  fields: Record<string, FieldChange>;
  /** Status of this file */
  status: 'matched' | 'unmatched' | 'manual' | 'rejected';
}

// =============================================================================
// Session Types
// =============================================================================

export interface ApprovalSession {
  id: string;
  status: ApprovalSessionStatus;
  fileIds: string[];

  // Library context (used for source prioritization)
  libraryId?: string;
  libraryType?: LibraryType;

  // Options
  useLLMCleanup: boolean;

  // Phase 1: Series groups (wizard through one at a time)
  seriesGroups: SeriesGroup[];
  currentSeriesIndex: number;

  // Phase 2: File changes
  fileChanges: FileChange[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface CreateSessionOptions {
  /** Use LLM to clean up and parse filenames before searching */
  useLLMCleanup?: boolean;
  /** File IDs to exclude from processing (already searched/indexed files) */
  excludeFileIds?: string[];
  /** Mixed series mode - ignores series.json and parses each file individually */
  mixedSeries?: boolean;
}

// =============================================================================
// Callback Types
// =============================================================================

/** Progress callback type for streaming session creation */
export type ProgressCallback = (message: string, detail?: string) => void;

// =============================================================================
// Apply Result Types
// =============================================================================

export interface ApplyResult {
  fileId: string;
  filename: string;
  success: boolean;
  error?: string;
  converted?: boolean;
  renamed?: boolean;
  hadCollision?: boolean;
  originalFilename?: string;
}

export interface ApplyChangesResult {
  total: number;
  successful: number;
  failed: number;
  converted: number;
  conversionFailed: number;
  renamed: number;
  collisions: number;
  results: ApplyResult[];
}
