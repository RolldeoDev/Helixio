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
import { extname, dirname, join, basename } from 'path';
import { access, mkdir } from 'fs/promises';
import { getActiveTemplate, type TemplateWithParsedFields } from './template-manager.service.js';
import {
  resolveTemplateString,
  resolvePathSegments,
  buildFolderPath,
  type ResolverContext,
  type CharacterReplacementRules,
} from './template-resolver.service.js';
import { parseTemplate } from './template-parser.service.js';

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
 *
 * @param directory - Directory where the file will be placed
 * @param filename - Desired filename
 * @param excludePath - Optional path to exclude from collision detection (the source file being renamed)
 */
export async function resolveFilenameCollision(
  directory: string,
  filename: string,
  excludePath?: string
): Promise<{ filename: string; hadCollision: boolean }> {
  const fullPath = join(directory, filename);

  // Check if file exists - but not if it's the file we're renaming (excludePath)
  // This prevents detecting the source file as a collision with itself
  const exists = await fileExists(fullPath);
  const isSameFile = excludePath && fullPath.toLowerCase() === excludePath.toLowerCase();

  if (!exists || isSameFile) {
    return { filename, hadCollision: false };
  }

  // File exists (and it's not the source file) - add numeric suffix
  const ext = extname(filename);
  const baseName = filename.slice(0, -ext.length);

  let counter = 2;
  let newFilename: string;
  let newPath: string;

  do {
    newFilename = `${baseName} (${counter})${ext}`;
    newPath = join(directory, newFilename);
    counter++;
    // Also exclude the source file when checking suffixed names
  } while ((await fileExists(newPath)) && !(excludePath && newPath.toLowerCase() === excludePath.toLowerCase()));

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

// =============================================================================
// Template-Based Generation
// =============================================================================

export interface TemplateGeneratorOptions {
  /** Library ID for template lookup */
  libraryId?: string;
  /** Series entity data */
  series?: {
    name?: string;
    publisher?: string;
    startYear?: number;
    endYear?: number;
    volume?: number;
    issueCount?: number;
  };
  /** FileMetadata from database */
  fileMetadata?: {
    issueNumberSort?: number;
    contentType?: string;
    parsedVolume?: string;
    parsedChapter?: string;
  };
  /** Override template (for preview) */
  template?: TemplateWithParsedFields;
}

export interface TemplateGeneratedPath {
  /** Generated filename */
  filename: string;
  /** Generated folder path relative to library root (null if no folder organization) */
  folderPath: string | null;
  /** Full path including folder and filename */
  fullRelativePath: string;
  /** Detected comic type */
  type: ComicType;
  /** Confidence score */
  confidence: number;
  /** Warnings generated during resolution */
  warnings: string[];
  /** Whether any tokens had missing values */
  hadMissingValues: boolean;
  /** Template ID used */
  templateId: string | null;
}

/**
 * Build a resolver context from ComicInfo and options.
 */
function buildResolverContext(
  comicInfo: ComicInfo,
  file: { filename: string; extension: string; path?: string },
  options: TemplateGeneratorOptions = {}
): ResolverContext {
  return {
    comicInfo,
    series: options.series,
    fileMetadata: options.fileMetadata,
    file,
  };
}

/**
 * Generate a filename using the active template for the library.
 * Falls back to hardcoded generation if no template is found.
 */
export async function generateFilenameFromTemplate(
  comicInfo: ComicInfo,
  originalPath: string,
  options: TemplateGeneratorOptions = {}
): Promise<TemplateGeneratedPath> {
  const warnings: string[] = [];
  const ext = extname(originalPath) || '.cbz';
  const originalFilename = basename(originalPath);

  // Get the active template
  let template = options.template;
  if (!template) {
    try {
      template = await getActiveTemplate(options.libraryId) || undefined;
    } catch (e) {
      warnings.push('Failed to load template, using legacy generation');
    }
  }

  // If no template, fall back to legacy generation
  if (!template) {
    const legacyResult = generateFilenameFromPath(comicInfo, originalPath, {
      maxIssueNumber: options.series?.issueCount,
      seriesStartYear: options.series?.startYear,
      seriesVolume: options.series?.volume,
    });

    return {
      filename: legacyResult.filename,
      folderPath: null,
      fullRelativePath: legacyResult.filename,
      type: legacyResult.type,
      confidence: legacyResult.confidence,
      warnings: [...legacyResult.warnings, ...warnings],
      hadMissingValues: legacyResult.warnings.length > 0,
      templateId: null,
    };
  }

  // Build resolver context
  const context = buildResolverContext(
    comicInfo,
    {
      filename: originalFilename,
      extension: ext,
      path: originalPath,
    },
    options
  );

  // Resolve the filename template
  const filenameResult = resolveTemplateString(
    template.filePattern,
    context,
    { characterRules: template.characterRules }
  );

  // Ensure extension is included
  // Check if template already handles extension - if so, trust the template
  // This prevents double-extension bugs like ".cbz.cbz"
  const templateHasExtension = template.filePattern.includes('{Extension}');
  let filename = filenameResult.result;
  if (!templateHasExtension && !filename.toLowerCase().endsWith(ext.toLowerCase())) {
    filename = `${filename}${ext.toLowerCase()}`;
  }

  // Resolve folder segments if configured
  let folderPath: string | null = null;
  if (template.folderSegments && template.folderSegments.length > 0) {
    const segments = resolvePathSegments(
      template.folderSegments,
      context,
      { characterRules: template.characterRules }
    );
    if (segments.length > 0) {
      folderPath = buildFolderPath(segments);
    }
  }

  // Build full relative path
  const fullRelativePath = folderPath
    ? `${folderPath}/${filename}`
    : filename;

  // Detect type for response
  const type = detectComicType(comicInfo);

  // Calculate confidence
  let confidence = 1.0;
  if (filenameResult.hadMissingValues) {
    confidence -= 0.1 * filenameResult.missingTokens.length;
  }
  if (!comicInfo.Series) {
    confidence -= 0.3;
  }

  return {
    filename,
    folderPath,
    fullRelativePath,
    type,
    confidence: Math.max(0, confidence),
    warnings: [...warnings, ...filenameResult.warnings],
    hadMissingValues: filenameResult.hadMissingValues,
    templateId: template.id,
  };
}

/**
 * Generate a unique filename using the template system.
 * Resolves collisions by adding numeric suffixes.
 */
export async function generateUniqueFilenameFromTemplate(
  comicInfo: ComicInfo,
  originalPath: string,
  libraryRootPath: string,
  options: TemplateGeneratorOptions = {}
): Promise<{
  result: TemplateGeneratedPath;
  finalFilename: string;
  finalPath: string;
  hadCollision: boolean;
  needsFolderCreation: boolean;
}> {
  const result = await generateFilenameFromTemplate(comicInfo, originalPath, options);
  const currentDirectory = dirname(originalPath);

  // Determine target directory
  let targetDirectory: string;
  let needsFolderCreation = false;

  if (result.folderPath) {
    // Template specifies folder organization
    targetDirectory = join(libraryRootPath, result.folderPath);

    // Check if folder needs to be created
    try {
      await access(targetDirectory);
    } catch {
      needsFolderCreation = true;
    }
  } else {
    // Keep in current directory
    targetDirectory = currentDirectory;
  }

  // Resolve filename collisions (exclude original path to prevent self-collision)
  const { filename: finalFilename, hadCollision } = await resolveFilenameCollision(
    targetDirectory,
    result.filename,
    originalPath
  );

  if (hadCollision) {
    result.warnings.push(`Filename collision resolved: ${result.filename} -> ${finalFilename}`);
  }

  // Build final path
  const finalPath = join(targetDirectory, finalFilename);

  return {
    result: {
      ...result,
      filename: finalFilename,
      fullRelativePath: result.folderPath
        ? `${result.folderPath}/${finalFilename}`
        : finalFilename,
    },
    finalFilename,
    finalPath,
    hadCollision,
    needsFolderCreation,
  };
}

/**
 * Preview what a template would generate for a file.
 * Does not check for collisions or create folders.
 */
export async function previewTemplateGeneration(
  comicInfo: ComicInfo,
  file: { filename: string; extension: string },
  options: TemplateGeneratorOptions = {}
): Promise<TemplateGeneratedPath> {
  return generateFilenameFromTemplate(
    comicInfo,
    join('/preview', file.filename),
    options
  );
}
