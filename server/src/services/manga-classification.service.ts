/**
 * Manga Classification Service
 *
 * Handles smart chapter/volume classification for manga files:
 * - Page-count-based inference (< 60 pages = chapter, 60+ = volume)
 * - Filename parsing for volume/chapter numbers
 * - LLM classification for special cases
 * - Display title generation
 */

import { getMangaClassificationSettings, type MangaClassificationSettings } from './config.service.js';

// =============================================================================
// Types
// =============================================================================

export type MangaContentType = 'chapter' | 'volume' | 'extra' | 'omake' | 'bonus' | 'oneshot';

export interface ParsedMangaNumbers {
  /** Volume number if detected (e.g., "5" from "v5c12") */
  volume?: string;
  /** Chapter number if detected (e.g., "12" from "v5c12") */
  chapter?: string;
  /** Inferred content type from filename patterns */
  contentType: MangaContentType | 'unknown';
  /** Confidence score (0-1) */
  confidence: number;
  /** Raw number extracted (the primary identifier) */
  primaryNumber?: string;
}

export interface MangaClassificationResult {
  /** The classified content type */
  contentType: MangaContentType;
  /** Generated display title (e.g., "Chapter 5", "Volume 2") */
  displayTitle: string;
  /** Volume number if present */
  volume?: string;
  /** Chapter number if present */
  chapter?: string;
  /** Primary number for sorting/display */
  primaryNumber?: string;
  /** How the classification was determined */
  source: 'filename' | 'pagecount' | 'llm';
  /** Confidence score (0-1) */
  confidence: number;
}

export interface MangaFileInput {
  filename: string;
  pageCount: number;
  folderPath?: string;
  seriesName?: string;
}

// =============================================================================
// Regex Patterns
// =============================================================================

const MANGA_PATTERNS = {
  // Volume + Chapter patterns (most specific, check first)
  // Matches: v5c12, Vol.5 Ch.12, Volume 5 Chapter 12, Vol 5 - Ch 12
  volumeChapter: /(?:v|vol\.?|volume)\s*(\d+(?:\.\d+)?)\s*[-\s]*(?:c|ch\.?|chapter)\s*(\d+(?:\.\d+)?)/i,

  // Kavita-style compact: v05c123
  volumeChapterCompact: /v(\d+)c(\d+)/i,

  // Chapter-only patterns
  // Matches: c12, Ch.12, Chapter 12, Ch 12, - 012, #012
  chapterOnly: /(?:^|[\s\-_])(?:c|ch\.?|chapter)\s*#?(\d+(?:\.\d+)?)/i,

  // Standalone number at end (common pattern: "Series Name - 012")
  trailingNumber: /[\s\-_](\d{2,4})(?:\s*(?:\(|\[|$))/,

  // Volume-only patterns
  // Matches: v5, Vol.5, Volume 5, Vol 5
  volumeOnly: /(?:^|[\s\-_])(?:v|vol\.?|volume)\s*#?(\d+(?:\.\d+)?)/i,

  // Special content type patterns
  omake: /\b(?:omake)\b/i,
  extra: /\b(?:extra|bonus|side\s*story|gaiden)\b/i,
  oneshot: /\b(?:one[-\s]?shot|oneshot)\b/i,

  // Decimal chapters (for ordering: 12.5 comes after 12)
  decimalNumber: /(\d+)\.(\d+)/,
};

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Parse a manga filename to extract volume/chapter numbers and content type
 */
export function parseMangaFilename(filename: string): ParsedMangaNumbers {
  // Remove file extension for parsing
  const baseName = filename.replace(/\.(cbr|cbz|cb7|cbt|pdf|zip|rar|7z)$/i, '');

  // Check for special content types first
  if (MANGA_PATTERNS.oneshot.test(baseName)) {
    return {
      contentType: 'oneshot',
      confidence: 0.9,
      primaryNumber: '1',
    };
  }

  if (MANGA_PATTERNS.omake.test(baseName)) {
    const chapterMatch = baseName.match(MANGA_PATTERNS.chapterOnly) ||
                         baseName.match(MANGA_PATTERNS.trailingNumber);
    return {
      contentType: 'omake',
      confidence: 0.85,
      chapter: chapterMatch?.[1],
      primaryNumber: chapterMatch?.[1] || '1',
    };
  }

  if (MANGA_PATTERNS.extra.test(baseName)) {
    const chapterMatch = baseName.match(MANGA_PATTERNS.chapterOnly) ||
                         baseName.match(MANGA_PATTERNS.trailingNumber);
    return {
      contentType: 'extra',
      confidence: 0.85,
      chapter: chapterMatch?.[1],
      primaryNumber: chapterMatch?.[1] || '1',
    };
  }

  // Try volume + chapter (most specific)
  let match = baseName.match(MANGA_PATTERNS.volumeChapter) ||
              baseName.match(MANGA_PATTERNS.volumeChapterCompact);
  if (match) {
    return {
      volume: match[1],
      chapter: match[2],
      contentType: 'chapter', // When both are present, treat as chapter within volume
      confidence: 0.95,
      primaryNumber: match[2], // Use chapter as primary for sorting
    };
  }

  // Try chapter-only
  match = baseName.match(MANGA_PATTERNS.chapterOnly);
  if (match) {
    return {
      chapter: match[1],
      contentType: 'chapter',
      confidence: 0.9,
      primaryNumber: match[1],
    };
  }

  // Try volume-only
  match = baseName.match(MANGA_PATTERNS.volumeOnly);
  if (match) {
    return {
      volume: match[1],
      contentType: 'volume',
      confidence: 0.9,
      primaryNumber: match[1],
    };
  }

  // Try trailing number (common for manga: "Series - 001.cbz")
  match = baseName.match(MANGA_PATTERNS.trailingNumber);
  if (match) {
    // Could be either chapter or volume, we'll use pagecount to decide
    return {
      chapter: match[1],
      contentType: 'unknown',
      confidence: 0.7,
      primaryNumber: match[1],
    };
  }

  // No number found
  return {
    contentType: 'unknown',
    confidence: 0.3,
  };
}

/**
 * Classify content type based on page count
 */
export function classifyByPageCount(
  pageCount: number,
  threshold: number = 60
): 'chapter' | 'volume' {
  return pageCount < threshold ? 'chapter' : 'volume';
}

/**
 * Generate a display title based on content type and number
 */
export function generateDisplayTitle(
  contentType: MangaContentType,
  number?: string
): string {
  if (!number) {
    // If no number, return just the type label
    const labels: Record<MangaContentType, string> = {
      chapter: 'Chapter',
      volume: 'Volume',
      extra: 'Extra',
      omake: 'Omake',
      bonus: 'Bonus',
      oneshot: 'One-Shot',
    };
    return labels[contentType] || 'Unknown';
  }

  // Format number (remove leading zeros for display, but keep decimals)
  const displayNumber = formatNumber(number);

  const labels: Record<MangaContentType, string> = {
    chapter: `Chapter ${displayNumber}`,
    volume: `Volume ${displayNumber}`,
    extra: `Extra ${displayNumber}`,
    omake: `Omake ${displayNumber}`,
    bonus: `Bonus ${displayNumber}`,
    oneshot: 'One-Shot',
  };

  return labels[contentType] || `Chapter ${displayNumber}`;
}

/**
 * Format a number string for display
 * Removes leading zeros but preserves decimal values
 */
function formatNumber(num: string): string {
  // Handle decimal numbers
  if (num.includes('.')) {
    const parts = num.split('.');
    const whole = parts[0] ?? '0';
    const decimal = parts[1] ?? '0';
    return `${parseInt(whole, 10)}.${decimal}`;
  }
  return parseInt(num, 10).toString();
}

/**
 * Classify a manga file using filename parsing and page count
 */
export function classifyMangaFile(
  filename: string,
  pageCount: number,
  settings?: MangaClassificationSettings
): MangaClassificationResult {
  const config = settings || getMangaClassificationSettings();
  const parsed = parseMangaFilename(filename);

  // Determine content type
  let contentType: MangaContentType;
  let source: 'filename' | 'pagecount' = 'filename';

  if (parsed.contentType !== 'unknown') {
    // Filename gave us a clear type
    contentType = parsed.contentType;
    source = 'filename';

    // But if filenameOverridesPageCount is false and we have a numeric-only parse,
    // we should check page count for chapter vs volume
    if (!config.filenameOverridesPageCount &&
        (parsed.contentType === 'chapter' || parsed.contentType === 'volume')) {
      const pageCountType = classifyByPageCount(pageCount, config.volumePageThreshold);
      if (pageCountType !== parsed.contentType) {
        contentType = pageCountType;
        source = 'pagecount';
      }
    }
  } else {
    // Unknown from filename, use page count
    contentType = classifyByPageCount(pageCount, config.volumePageThreshold);
    source = 'pagecount';
  }

  // Determine the primary number to use
  const primaryNumber = parsed.primaryNumber || parsed.chapter || parsed.volume;

  return {
    contentType,
    displayTitle: generateDisplayTitle(contentType, primaryNumber),
    volume: parsed.volume,
    chapter: parsed.chapter,
    primaryNumber,
    source,
    confidence: parsed.confidence,
  };
}

/**
 * Batch classify multiple manga files
 * Uses regex parsing for most files, can defer to LLM for edge cases
 */
export function batchClassifyMangaFiles(
  files: MangaFileInput[],
  settings?: MangaClassificationSettings
): Map<string, MangaClassificationResult> {
  const results = new Map<string, MangaClassificationResult>();
  const config = settings || getMangaClassificationSettings();

  for (const file of files) {
    const result = classifyMangaFile(file.filename, file.pageCount, config);
    results.set(file.filename, result);
  }

  return results;
}

/**
 * Check if a file needs LLM classification (edge cases regex can't handle)
 */
export function needsLLMClassification(parsed: ParsedMangaNumbers): boolean {
  // Low confidence or unknown type might benefit from LLM
  return parsed.confidence < 0.6 || parsed.contentType === 'unknown';
}

/**
 * Get files that need LLM classification from a batch
 */
export function getFilesNeedingLLM(
  files: MangaFileInput[]
): MangaFileInput[] {
  return files.filter(file => {
    const parsed = parseMangaFilename(file.filename);
    return needsLLMClassification(parsed);
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract a sortable numeric value from a number string
 * Handles decimals (12.5), leading zeros (001), and strings
 */
export function getSortableNumber(numberStr?: string): number {
  if (!numberStr) return Infinity;

  const num = parseFloat(numberStr);
  if (!isNaN(num)) return num;

  // Try to extract number from string
  const match = numberStr.match(/(\d+(?:\.\d+)?)/);
  if (match && match[1]) {
    return parseFloat(match[1]);
  }

  return Infinity;
}

/**
 * Compare two manga files for sorting
 * Sorts by: volume (if present) -> chapter/number -> filename
 */
export function compareMangaFiles(
  a: { volume?: string; chapter?: string; primaryNumber?: string; filename: string },
  b: { volume?: string; chapter?: string; primaryNumber?: string; filename: string }
): number {
  // If both have volumes, sort by volume first
  if (a.volume && b.volume) {
    const volA = getSortableNumber(a.volume);
    const volB = getSortableNumber(b.volume);
    if (volA !== volB) return volA - volB;
  }

  // Then by chapter/primary number
  const numA = getSortableNumber(a.primaryNumber || a.chapter);
  const numB = getSortableNumber(b.primaryNumber || b.chapter);
  if (numA !== numB) return numA - numB;

  // Finally by filename
  return a.filename.localeCompare(b.filename);
}
