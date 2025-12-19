/**
 * Filename Generator Service
 *
 * Generates standardized filenames based on ComicInfo metadata.
 * Rules are defined in NAMING_CONVENTIONS.md
 *
 * Pattern: {Series} - {Type} {Number} - {Title} ({Year}).{ext}
 *
 * Key Rules:
 * - No hash symbol before issue numbers
 * - Dynamic padding based on series issue count
 * - Keep specific types (TPB, Hardcover, Omnibus, Annual, One-Shot)
 * - Series volume in name: year in parens or "Vol X"
 * - Missing title/year: omit entirely
 * - Separator: space-dash-space
 * - Extensions: always lowercase
 */

import type { ComicInfo } from './comicinfo.service.js';
import { extname, dirname, join } from 'path';
import { access } from 'fs/promises';

// =============================================================================
// Types
// =============================================================================

export type ComicType =
  | 'issue'
  | 'volume'
  | 'tpb'
  | 'hardcover'
  | 'omnibus'
  | 'annual'
  | 'one-shot'
  | 'special';

export interface GeneratedFilename {
  filename: string;
  type: ComicType;
  confidence: number;
  warnings: string[];
}

export interface FilenameGeneratorOptions {
  /** Highest issue number in the series (for dynamic padding) */
  maxIssueNumber?: number;
  /** Series start year (for multi-run series) */
  seriesStartYear?: number;
  /** Series volume number (for multi-run series without year) */
  seriesVolume?: number;
}

// =============================================================================
// Type Detection
// =============================================================================

/**
 * Determine the comic type based on ComicInfo metadata.
 *
 * Detection priority:
 * 1. Format field (most explicit)
 * 2. Title field (e.g., "Volume One", "Book 1", "TPB")
 * 3. Series name (e.g., "Batman TPB", "X-Men Collected Editions")
 * 4. Default to 'issue'
 */
export function detectComicType(comicInfo: ComicInfo): ComicType {
  const format = (comicInfo.Format || '').toLowerCase();
  const title = (comicInfo.Title || '').toLowerCase();
  const series = (comicInfo.Series || '').toLowerCase();

  // Check Format field first (most reliable)
  if (format) {
    if (format.includes('annual')) return 'annual';
    if (format.includes('one-shot') || format.includes('oneshot') || format.includes('one shot')) return 'one-shot';
    if (format.includes('omnibus')) return 'omnibus';
    if (format.includes('hardcover') || format.includes('hard cover') || format === 'hc') return 'hardcover';
    if (format.includes('tpb') || format.includes('trade paperback')) return 'tpb';
    if (format.includes('volume') || format.includes('vol')) return 'volume';
    if (format.includes('special')) return 'special';
  }

  // Check title for collected edition indicators
  // These patterns strongly suggest a TPB/Volume rather than a single issue
  if (title) {
    // Omnibus detection
    if (title.includes('omnibus')) return 'omnibus';

    // Hardcover detection
    if (title.includes('hardcover') || title.includes('hard cover') || /\bhc\b/.test(title)) return 'hardcover';

    // TPB detection - explicit mentions
    if (title.includes('tpb') || title.includes('trade paperback')) return 'tpb';

    // Volume detection - "Volume One", "Volume 1", "Vol. 1", "Book 1", etc.
    // These patterns indicate collected editions, not single issues
    if (/\bvolume\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(title)) return 'volume';
    if (/\bvol\.?\s*\d+\b/i.test(title)) return 'volume';
    if (/\bbook\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(title)) return 'volume';

    // Annual detection
    if (title.includes('annual')) return 'annual';

    // One-shot detection
    if (title.includes('one-shot') || title.includes('oneshot')) return 'one-shot';

    // Special detection
    if (title.includes('special')) return 'special';
  }

  // Check series name for collected edition indicators
  if (series) {
    if (series.includes('omnibus')) return 'omnibus';
    if (series.includes('tpb') || series.includes('trade paperback')) return 'tpb';
    if (series.includes('collected edition')) return 'volume';
    if (/\bhardcover\b/.test(series) || /\bhc\b/.test(series)) return 'hardcover';
  }

  // Default to issue for standard numbered comics
  return 'issue';
}

/**
 * Get the display label for a comic type.
 */
function getTypeLabel(type: ComicType): string {
  switch (type) {
    case 'issue': return 'Issue';
    case 'volume': return 'Volume';
    case 'tpb': return 'TPB';
    case 'hardcover': return 'Hardcover';
    case 'omnibus': return 'Omnibus';
    case 'annual': return 'Annual';
    case 'one-shot': return 'One-Shot';
    case 'special': return 'Special';
  }
}

/**
 * Check if a type uses 2-digit padding (volumes, collected editions)
 */
function usesTwoDigitPadding(type: ComicType): boolean {
  return ['volume', 'tpb', 'hardcover', 'omnibus'].includes(type);
}

/**
 * Check if a type typically doesn't have a number
 */
function isUnnumberedType(type: ComicType): boolean {
  return ['one-shot', 'special'].includes(type);
}

// =============================================================================
// Filename Utilities
// =============================================================================

/**
 * Sanitize a string for use in a filename.
 * Removes characters that are invalid in filenames: < > : " / \ | ? *
 */
function sanitizeFilename(str: string): string {
  return str
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate the required padding digits based on max issue number.
 * Dynamic padding per NAMING_CONVENTIONS.md:
 * - Up to 99: 2 digits
 * - Up to 999: 3 digits
 * - 1000+: 4 digits
 */
function calculatePadding(maxNumber: number, isTwoDigitType: boolean): number {
  if (isTwoDigitType) {
    // Volumes, TPBs, etc. always use 2 digits
    return 2;
  }

  if (maxNumber >= 1000) return 4;
  if (maxNumber >= 100) return 3;
  return 2;
}

/**
 * Pad a number with leading zeros.
 * Handles fractional numbers (e.g., "1.5" -> "001.5")
 */
function padNumber(num: string | number, padding: number): string {
  const numStr = String(num).replace(/^#/, '');

  // Handle fractional numbers like "1.5"
  if (numStr.includes('.')) {
    const [whole, frac] = numStr.split('.');
    const wholeNum = parseInt(whole!, 10);
    if (isNaN(wholeNum)) return numStr;
    return `${String(wholeNum).padStart(padding, '0')}.${frac}`;
  }

  // Handle non-numeric (like "Annual 1") - return as-is
  const parsed = parseInt(numStr, 10);
  if (isNaN(parsed)) return numStr;

  return String(parsed).padStart(padding, '0');
}

/**
 * Format year for filename.
 */
function formatYear(year?: number): string {
  return year ? String(year) : '';
}

/**
 * Build the series name part, including volume indicator for multi-run series.
 */
function buildSeriesName(
  series: string,
  options: FilenameGeneratorOptions
): string {
  const baseName = sanitizeFilename(series);

  // Add series volume indicator if this is a multi-run series
  if (options.seriesStartYear) {
    return `${baseName} (${options.seriesStartYear})`;
  }
  if (options.seriesVolume && options.seriesVolume > 1) {
    return `${baseName} Vol ${options.seriesVolume}`;
  }

  return baseName;
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * Generate a standardized filename from ComicInfo metadata.
 *
 * Pattern: {Series} - {Type} {Number} - {Title} ({Year}).{ext}
 *
 * Rules (from NAMING_CONVENTIONS.md):
 * - No hash symbol before numbers
 * - Dynamic padding based on max issue in series
 * - Keep specific types (TPB, Hardcover, Omnibus, Annual, One-Shot)
 * - Omit missing title/year
 * - Space-dash-space separator
 * - Lowercase extensions
 */
export function generateFilename(
  comicInfo: ComicInfo,
  currentExtension: string = '.cbz',
  options: FilenameGeneratorOptions = {}
): GeneratedFilename {
  const warnings: string[] = [];
  const type = detectComicType(comicInfo);

  // Ensure extension is lowercase
  let ext = currentExtension.toLowerCase();
  if (!ext.startsWith('.')) ext = `.${ext}`;

  // Extract key fields
  const series = comicInfo.Series || '';
  const number = comicInfo.Number || '';
  const title = comicInfo.Title || '';
  const year = comicInfo.Year;

  // Track confidence
  let confidence = 1.0;

  // Validate required fields
  if (!series) {
    warnings.push('Missing series name');
    confidence -= 0.3;
  }

  // Build filename parts
  const seriesPart = series
    ? buildSeriesName(series, options)
    : 'Unknown Series';

  const typeLabel = getTypeLabel(type);
  const isTwoDigit = usesTwoDigitPadding(type);
  const isUnnumbered = isUnnumberedType(type);

  // Calculate padding
  const maxNum = options.maxIssueNumber || 999; // Default to 3-digit padding
  const padding = calculatePadding(maxNum, isTwoDigit);

  // Build the filename
  const parts: string[] = [seriesPart];

  if (isUnnumbered) {
    // One-shots and specials: {Series} - {Type} - {Title} ({Year}).ext
    parts.push(typeLabel);

    if (title) {
      parts.push(sanitizeFilename(title));
    } else {
      warnings.push('Missing title');
      confidence -= 0.2;
    }
  } else if (type === 'annual') {
    // Annuals: {Series} - Annual {Year or Number} ({Year}).ext
    // Try to use year as the annual identifier if available
    const annualId = number || (year ? String(year) : '');

    if (annualId) {
      // If it's a number, pad it; if it's a year, use as-is
      const isYearLike = /^\d{4}$/.test(annualId);
      parts.push(`${typeLabel} ${isYearLike ? annualId : padNumber(annualId, 2)}`);
    } else {
      parts.push(typeLabel);
      warnings.push('Missing annual number/year');
      confidence -= 0.1;
    }

    if (title) {
      parts.push(sanitizeFilename(title));
    }
  } else {
    // Regular numbered types: {Series} - {Type} {Number} - {Title} ({Year}).ext
    if (number) {
      parts.push(`${typeLabel} ${padNumber(number, padding)}`);
    } else {
      parts.push(`${typeLabel} ${padNumber(1, padding)}`);
      warnings.push('Missing number, using default');
      confidence -= 0.2;
    }

    if (title) {
      parts.push(sanitizeFilename(title));
    }
  }

  // Build filename without year first
  let filename = parts.join(' - ');

  // Add year if available
  const yearStr = formatYear(year);
  if (yearStr) {
    filename = `${filename} (${yearStr})${ext}`;
  } else {
    filename = `${filename}${ext}`;
    // Don't warn for missing year on annuals (they often have year in the number)
    if (type !== 'annual') {
      warnings.push('Missing publication year');
      confidence -= 0.1;
    }
  }

  return {
    filename,
    type,
    confidence: Math.max(0, confidence),
    warnings,
  };
}

/**
 * Generate filename from ComicInfo, preserving the original extension.
 */
export function generateFilenameFromPath(
  comicInfo: ComicInfo,
  originalPath: string,
  options: FilenameGeneratorOptions = {}
): GeneratedFilename {
  const ext = extname(originalPath) || '.cbz';
  return generateFilename(comicInfo, ext, options);
}

/**
 * Check if a filename needs to be renamed based on current and generated names.
 */
export function needsRename(
  currentFilename: string,
  generatedFilename: string
): boolean {
  // Normalize for comparison (lowercase, trim)
  const current = currentFilename.toLowerCase().trim();
  const generated = generatedFilename.toLowerCase().trim();
  return current !== generated;
}

// =============================================================================
// Collision Handling
// =============================================================================

/**
 * Check if a file exists at the given path.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a unique filename by adding a numeric suffix if needed.
 * Returns the unique filename and whether a collision was detected.
 */
export async function resolveFilenameCollision(
  directory: string,
  filename: string
): Promise<{ filename: string; hadCollision: boolean }> {
  const fullPath = join(directory, filename);

  // Check if file exists
  if (!(await fileExists(fullPath))) {
    return { filename, hadCollision: false };
  }

  // File exists - add numeric suffix
  const ext = extname(filename);
  const baseName = filename.slice(0, -ext.length);

  let counter = 2;
  let newFilename: string;
  let newPath: string;

  do {
    newFilename = `${baseName} (${counter})${ext}`;
    newPath = join(directory, newFilename);
    counter++;
  } while (await fileExists(newPath));

  return { filename: newFilename, hadCollision: true };
}

/**
 * Generate a filename and resolve any collisions.
 * Returns the final filename and collision information.
 */
export async function generateUniqueFilename(
  comicInfo: ComicInfo,
  originalPath: string,
  options: FilenameGeneratorOptions = {}
): Promise<{
  result: GeneratedFilename;
  finalFilename: string;
  hadCollision: boolean;
}> {
  const result = generateFilenameFromPath(comicInfo, originalPath, options);
  const directory = dirname(originalPath);

  const { filename: finalFilename, hadCollision } = await resolveFilenameCollision(
    directory,
    result.filename
  );

  if (hadCollision) {
    result.warnings.push(`Filename collision resolved: ${result.filename} -> ${finalFilename}`);
  }

  return {
    result,
    finalFilename,
    hadCollision,
  };
}
