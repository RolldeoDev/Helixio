/**
 * Comic Classification Service
 *
 * Handles format classification for Western comic files:
 * - Page-count-based inference (< 50 = issue, 50-200 = TPB, > 200 = omnibus)
 * - Filename parsing for format indicators (TPB, Omnibus, etc.)
 * - ComicInfo.xml Format field generation
 */

// =============================================================================
// Types
// =============================================================================

export type ComicFormat = 'issue' | 'tpb' | 'omnibus';

export interface ComicClassificationSettings {
  /** Enable page-based classification */
  enabled: boolean;
  /** Page threshold: below this is an issue */
  issuePageThreshold: number;
  /** Page threshold: above this is an omnibus (between issue and omnibus is TPB) */
  omnibusPageThreshold: number;
  /** Whether filename indicators override page count */
  filenameOverridesPageCount: boolean;
}

export interface ComicClassificationResult {
  /** The classified format */
  format: ComicFormat;
  /** Human-readable format label for ComicInfo.xml */
  formatLabel: string;
  /** How the classification was determined */
  source: 'filename' | 'pagecount';
  /** Confidence score (0-1) */
  confidence: number;
}

export interface ComicFileInput {
  filename: string;
  pageCount: number;
  folderPath?: string;
}

// =============================================================================
// Default Settings
// =============================================================================

const DEFAULT_SETTINGS: ComicClassificationSettings = {
  enabled: true,
  issuePageThreshold: 50,
  omnibusPageThreshold: 200,
  filenameOverridesPageCount: true,
};

// =============================================================================
// Regex Patterns for Format Detection
// =============================================================================

const FORMAT_PATTERNS = {
  // Omnibus patterns
  omnibus: /\b(?:omnibus)\b/i,

  // TPB/Trade patterns
  tpb: /\b(?:tpb|trade\s*paperback|collected\s*edition|collection)\b/i,

  // Volume indicators (often indicate TPB)
  volume: /\b(?:vol\.?|volume)\s*\d+/i,
};

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Detect format from filename patterns
 */
export function detectFormatFromFilename(filename: string): {
  format: ComicFormat | null;
  confidence: number;
} {
  // Remove file extension for parsing
  const baseName = filename.replace(/\.(cbr|cbz|cb7|cbt|pdf|zip|rar|7z)$/i, '');

  // Check for omnibus (highest priority)
  if (FORMAT_PATTERNS.omnibus.test(baseName)) {
    return { format: 'omnibus', confidence: 0.95 };
  }

  // Check for TPB/trade
  if (FORMAT_PATTERNS.tpb.test(baseName)) {
    return { format: 'tpb', confidence: 0.9 };
  }

  // Volume indicators suggest TPB (but lower confidence)
  if (FORMAT_PATTERNS.volume.test(baseName)) {
    return { format: 'tpb', confidence: 0.7 };
  }

  // No format detected from filename
  return { format: null, confidence: 0 };
}

/**
 * Classify format based on page count
 */
export function classifyByPageCount(
  pageCount: number,
  settings: ComicClassificationSettings = DEFAULT_SETTINGS
): ComicFormat {
  if (pageCount < settings.issuePageThreshold) {
    return 'issue';
  } else if (pageCount > settings.omnibusPageThreshold) {
    return 'omnibus';
  } else {
    return 'tpb';
  }
}

/**
 * Get the ComicInfo.xml Format label for a format
 */
export function getFormatLabel(format: ComicFormat): string {
  const labels: Record<ComicFormat, string> = {
    issue: 'Single Issue',
    tpb: 'TPB',
    omnibus: 'Omnibus',
  };
  return labels[format];
}

/**
 * Classify a comic file using filename parsing and page count
 */
export function classifyComicFormat(
  filename: string,
  pageCount: number,
  settings: ComicClassificationSettings = DEFAULT_SETTINGS
): ComicClassificationResult {
  if (!settings.enabled) {
    // When disabled, default to issue
    return {
      format: 'issue',
      formatLabel: 'Single Issue',
      source: 'pagecount',
      confidence: 0.5,
    };
  }

  // First, try to detect format from filename
  const filenameResult = detectFormatFromFilename(filename);

  if (filenameResult.format && settings.filenameOverridesPageCount) {
    // Filename takes precedence
    return {
      format: filenameResult.format,
      formatLabel: getFormatLabel(filenameResult.format),
      source: 'filename',
      confidence: filenameResult.confidence,
    };
  }

  // Use page count classification
  const pageFormat = classifyByPageCount(pageCount, settings);

  // If we have a filename hint but it doesn't override, use it to boost confidence
  let confidence = 0.8;
  if (filenameResult.format && filenameResult.format === pageFormat) {
    confidence = 0.95; // Both sources agree
  }

  return {
    format: pageFormat,
    formatLabel: getFormatLabel(pageFormat),
    source: 'pagecount',
    confidence,
  };
}

/**
 * Batch classify multiple comic files
 */
export function batchClassifyComicFiles(
  files: ComicFileInput[],
  settings: ComicClassificationSettings = DEFAULT_SETTINGS
): Map<string, ComicClassificationResult> {
  const results = new Map<string, ComicClassificationResult>();

  for (const file of files) {
    const result = classifyComicFormat(file.filename, file.pageCount, settings);
    results.set(file.filename, result);
  }

  return results;
}

/**
 * Get default classification settings
 */
export function getDefaultSettings(): ComicClassificationSettings {
  return { ...DEFAULT_SETTINGS };
}

/**
 * Parse ComicInfo.xml Format field to internal format type
 */
export function parseFormatField(formatValue: string | undefined): ComicFormat | null {
  if (!formatValue) return null;

  const lower = formatValue.toLowerCase().trim();

  if (lower === 'omnibus') {
    return 'omnibus';
  }

  if (lower === 'tpb' || lower === 'trade paperback' || lower === 'collected edition') {
    return 'tpb';
  }

  if (lower === 'single issue' || lower === 'issue' || lower === 'floppy') {
    return 'issue';
  }

  return null;
}
