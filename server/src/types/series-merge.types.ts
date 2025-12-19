/**
 * Series Merge Types
 *
 * Types for duplicate detection and series merging functionality.
 */

// Confidence levels for duplicate detection
export type DuplicateConfidence = 'high' | 'medium' | 'low';

// Detection reason for why series are considered duplicates
export type DuplicateReason =
  | 'same_name' // Exact normalized name match
  | 'similar_name' // Fuzzy name match (Levenshtein)
  | 'same_comicvine_id' // Same ComicVine ID, different names
  | 'same_metron_id' // Same Metron ID, different names
  | 'same_publisher_similar_name'; // Same publisher + similar name

// Series data optimized for merge operations
export interface SeriesForMerge {
  id: string;
  name: string;
  publisher: string | null;
  startYear: number | null;
  endYear: number | null;
  issueCount: number | null; // From API (known total)
  ownedIssueCount: number; // Actual owned issues
  comicVineId: string | null;
  metronId: string | null;
  coverUrl: string | null;
  coverHash: string | null;
  coverFileId: string | null;
  aliases: string | null;
  summary: string | null;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

// Duplicate group with confidence scoring
export interface DuplicateGroup {
  id: string; // Unique group ID
  series: SeriesForMerge[]; // Series in this group
  confidence: DuplicateConfidence;
  reasons: DuplicateReason[];
  primaryReason: DuplicateReason;
}

// Merge preview response
export interface MergePreview {
  targetSeries: SeriesForMerge;
  sourceSeries: SeriesForMerge[];
  resultingAliases: string[]; // Combined aliases after merge
  totalIssuesAfterMerge: number;
  warnings: string[]; // Any potential issues
}

// Merge result
export interface MergeResult {
  success: boolean;
  targetSeriesId: string;
  mergedSourceIds: string[];
  issuesMoved: number;
  aliasesAdded: string[];
  error?: string;
}
