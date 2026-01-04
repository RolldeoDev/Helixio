/**
 * Library Scanner Types
 *
 * Types for the redesigned 5-phase library scanner.
 */

export interface ScanProgress {
  phase: ScanPhase;
  current: number;
  total: number;
  message: string;
  detail?: string;
}

export type ScanPhase =
  | 'discovery'
  | 'metadata'
  | 'series'
  | 'linking'
  | 'covers'
  | 'complete';

export interface PhaseResult {
  success: boolean;
  processed: number;
  errors: number;
  duration: number;
}

export interface DiscoveryResult extends PhaseResult {
  newFiles: number;
  existingFiles: number;
  orphanedFiles: number;
  /** Files that were modified since last scan (delta scanning) */
  modifiedFiles: number;
}

export interface MetadataResult extends PhaseResult {
  fromComicInfo: number;
  fromFolder: number;
}

export interface SeriesResult extends PhaseResult {
  created: number;
  existing: number;
}

export interface LinkingResult extends PhaseResult {
  linked: number;
}

export interface CoverResult extends PhaseResult {
  extracted: number;
  cached: number;
}

export interface ScanResult {
  libraryId: string;
  success: boolean;
  phases: {
    discovery?: DiscoveryResult;
    metadata?: MetadataResult;
    series?: SeriesResult;
    linking?: LinkingResult;
    covers?: CoverResult;
  };
  totalDuration: number;
  error?: string;
}

export type ProgressCallback = (progress: ScanProgress) => void;

export interface ScanOptions {
  /** Called with progress updates */
  onProgress?: ProgressCallback;
  /** Check if scan should be cancelled */
  shouldCancel?: () => boolean;
  /** Batch size for DB operations (default: 100) */
  batchSize?: number;
  /**
   * Force full rescan - skip delta detection and reprocess all files.
   * When false (default), only files with changed mtime are reprocessed.
   */
  forceFullScan?: boolean;
}
