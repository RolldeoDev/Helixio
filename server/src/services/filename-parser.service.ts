/**
 * Filename Parser Service
 *
 * Provides both LLM-powered and regex-based filename parsing.
 * Uses LLM when available for complex filenames, falls back to regex patterns.
 */

import { basename, dirname, extname } from 'path';
import {
  ParsedFileMetadata,
  parseFilenamesBatch,
  parseFilename as llmParseFilename,
  isLLMAvailable,
  loadConventions,
  generateSuggestedFilename,
  generateSuggestedFolderName,
  parseFilesWithProgress,
  BatchProgress,
} from './llm.service.js';
import { getNamingConventions } from './config.service.js';

// =============================================================================
// Types
// =============================================================================

export interface ParseOptions {
  /** Use LLM for parsing (if available) */
  useLLM?: boolean;
  /** Include folder path in parsing context */
  includeFolderContext?: boolean;
  /** Session ID for logging */
  sessionId?: string;
}

export interface RenamePreview {
  originalPath: string;
  suggestedFilename: string | null;
  suggestedFolderName: string | null;
  parsedMetadata: ParsedFileMetadata;
  confidence: number;
}

export interface BatchRenameResult {
  total: number;
  parsed: number;
  withSuggestions: number;
  previews: RenamePreview[];
  errors: Array<{ path: string; error: string }>;
}

// Re-export types from llm.service
export type { ParsedFileMetadata, BatchProgress };

// =============================================================================
// Regex-Based Parsing (Fallback)
// =============================================================================

/**
 * Remove noise tokens from a string
 */
function removeNoiseTokens(str: string): { cleaned: string; removed: string[] } {
  const conventions = loadConventions();
  const noiseTokens = conventions.noise_tokens || [];
  const removed: string[] = [];

  let cleaned = str;

  for (const token of noiseTokens) {
    // Escape special regex characters
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');

    if (regex.test(cleaned)) {
      removed.push(token);
      cleaned = cleaned.replace(regex, '');
    }
  }

  // Clean up multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return { cleaned, removed };
}

/**
 * Extract year from string
 */
function extractYear(str: string): { year: number | undefined; remaining: string } {
  // Match year in parentheses at the end: (2011) or (2011-09-21)
  const yearMatch = str.match(/\((\d{4})(?:-\d{2}(?:-\d{2})?)?\)$/);
  if (yearMatch) {
    return {
      year: parseInt(yearMatch[1]!, 10),
      remaining: str.replace(/\(\d{4}(?:-\d{2}(?:-\d{2})?)?\)$/, '').trim(),
    };
  }

  // Match year at end: 2011.cbz
  const endYearMatch = str.match(/(\d{4})\.cb[rz7t]$/i);
  if (endYearMatch) {
    return {
      year: parseInt(endYearMatch[1]!, 10),
      remaining: str.replace(/\d{4}\.cb[rz7t]$/i, '').trim(),
    };
  }

  return { year: undefined, remaining: str };
}

/**
 * Extract date components from string
 */
function extractDate(str: string): {
  year?: number;
  month?: number;
  day?: number;
  remaining: string;
} {
  // Match full date: (2011-09-21)
  const fullDateMatch = str.match(/\((\d{4})-(\d{2})-(\d{2})\)/);
  if (fullDateMatch) {
    return {
      year: parseInt(fullDateMatch[1]!, 10),
      month: parseInt(fullDateMatch[2]!, 10),
      day: parseInt(fullDateMatch[3]!, 10),
      remaining: str.replace(/\(\d{4}-\d{2}-\d{2}\)/, '').trim(),
    };
  }

  // Match year-month: (2011-09)
  const yearMonthMatch = str.match(/\((\d{4})-(\d{2})\)/);
  if (yearMonthMatch) {
    return {
      year: parseInt(yearMonthMatch[1]!, 10),
      month: parseInt(yearMonthMatch[2]!, 10),
      remaining: str.replace(/\(\d{4}-\d{2}\)/, '').trim(),
    };
  }

  // Match just year: (2011)
  const yearResult = extractYear(str);
  return {
    year: yearResult.year,
    remaining: yearResult.remaining,
  };
}

/**
 * Extract issue number from string
 */
function extractIssueNumber(str: string): {
  number: number | string | undefined;
  remaining: string;
} {
  // Match #001 or #1
  const hashMatch = str.match(/#(\d+)/);
  if (hashMatch) {
    return {
      number: parseInt(hashMatch[1]!, 10),
      remaining: str.replace(/#\d+/, '').trim(),
    };
  }

  // Match "Issue 001" or "Issue #001"
  const issueMatch = str.match(/Issue\s*#?\s*(\d+)/i);
  if (issueMatch) {
    return {
      number: parseInt(issueMatch[1]!, 10),
      remaining: str.replace(/Issue\s*#?\s*\d+/i, '').trim(),
    };
  }

  // Match "No. 1" or "No 1"
  const noMatch = str.match(/No\.?\s*(\d+)/i);
  if (noMatch) {
    return {
      number: parseInt(noMatch[1]!, 10),
      remaining: str.replace(/No\.?\s*\d+/i, '').trim(),
    };
  }

  // Match standalone number before dash: "001 -" or "23 -"
  const dashMatch = str.match(/^(\d{1,4})\s*[-–—]/);
  if (dashMatch) {
    return {
      number: parseInt(dashMatch[1]!, 10),
      remaining: str.replace(/^\d{1,4}\s*[-–—]/, '').trim(),
    };
  }

  return { number: undefined, remaining: str };
}

/**
 * Extract volume number from string
 */
function extractVolumeNumber(str: string): {
  number: number | undefined;
  remaining: string;
} {
  // Match "Volume 01" or "Vol. 1" or "Vol 1"
  const volMatch = str.match(/(?:Volume|Vol\.?)\s*(\d+)/i);
  if (volMatch) {
    return {
      number: parseInt(volMatch[1]!, 10),
      remaining: str.replace(/(?:Volume|Vol\.?)\s*\d+/i, '').trim(),
    };
  }

  // Match "TPB 1"
  const tpbMatch = str.match(/TPB\s*(\d+)/i);
  if (tpbMatch) {
    return {
      number: parseInt(tpbMatch[1]!, 10),
      remaining: str.replace(/TPB\s*\d+/i, '').trim(),
    };
  }

  return { number: undefined, remaining: str };
}

/**
 * Determine file type from filename
 */
function determineType(str: string): 'issue' | 'volume' | 'book' | 'special' {
  const lower = str.toLowerCase();

  if (/annual|special|one.?shot/i.test(lower)) {
    return 'special';
  }

  if (/volume|vol\.?|tpb|trade/i.test(lower)) {
    return 'volume';
  }

  if (/book|ogn|graphic.?novel/i.test(lower)) {
    return 'book';
  }

  return 'issue';
}

/**
 * Extract title from remaining string
 */
function extractTitle(str: string): string | undefined {
  // Clean up the string
  let title = str
    .replace(/^[-–—\s]+/, '') // Remove leading dashes
    .replace(/[-–—\s]+$/, '') // Remove trailing dashes
    .replace(/\.cb[rz7t]$/i, '') // Remove extension
    .trim();

  if (title.length === 0) {
    return undefined;
  }

  // Remove common prefixes
  title = title
    .replace(/^Issue\s*/i, '')
    .replace(/^Volume\s*/i, '')
    .replace(/^Book\s*/i, '')
    .trim();

  return title || undefined;
}

/**
 * Extract series name from folder path
 */
function extractSeriesFromFolder(folderPath: string): {
  series?: string;
  year?: number;
  endYear?: number;
  writer?: string;
} {
  const folderName = basename(folderPath);

  // Match "Series Name (2011-2016)"
  const rangeMatch = folderName.match(/^(.+?)\s*\((\d{4})-(\d{4})\)$/);
  if (rangeMatch) {
    const seriesPart = rangeMatch[1]!.trim();
    const startYear = parseInt(rangeMatch[2]!, 10);
    const endYear = parseInt(rangeMatch[3]!, 10);

    // Check for "by Author" pattern
    const byAuthorMatch = seriesPart.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byAuthorMatch) {
      return {
        series: byAuthorMatch[1]!.trim(),
        year: startYear,
        endYear,
        writer: byAuthorMatch[2]!.trim(),
      };
    }

    return { series: seriesPart, year: startYear, endYear };
  }

  // Match "Series Name (2011)"
  const yearMatch = folderName.match(/^(.+?)\s*\((\d{4})\)$/);
  if (yearMatch) {
    const seriesPart = yearMatch[1]!.trim();
    const year = parseInt(yearMatch[2]!, 10);

    const byAuthorMatch = seriesPart.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byAuthorMatch) {
      return {
        series: byAuthorMatch[1]!.trim(),
        year,
        writer: byAuthorMatch[2]!.trim(),
      };
    }

    return { series: seriesPart, year };
  }

  // Just the folder name
  return { series: folderName };
}

/**
 * Parse filename using regex patterns (fallback method)
 */
export function parseFilenameRegex(
  filename: string,
  folderPath?: string
): ParsedFileMetadata {
  const result: ParsedFileMetadata = {
    filename,
    folderPath,
  };

  // Remove extension
  const nameWithoutExt = filename.replace(/\.cb[rz7t]$/i, '');

  // Remove noise tokens
  const { cleaned, removed } = removeNoiseTokens(nameWithoutExt);
  if (removed.length > 0) {
    result.ignoredTokens = removed;
  }

  // Determine type
  result.type = determineType(cleaned);

  // Extract date components
  const dateResult = extractDate(cleaned);
  result.year = dateResult.year;
  result.month = dateResult.month;
  result.day = dateResult.day;
  let remaining = dateResult.remaining;

  // Extract number based on type
  if (result.type === 'volume') {
    const volResult = extractVolumeNumber(remaining);
    result.number = volResult.number;
    remaining = volResult.remaining;
  } else if (result.type === 'issue' || result.type === 'special') {
    const issueResult = extractIssueNumber(remaining);
    result.number = issueResult.number;
    remaining = issueResult.remaining;
  }

  // Extract title
  result.title = extractTitle(remaining);

  // Try to get series from folder path
  if (folderPath) {
    const folderInfo = extractSeriesFromFolder(folderPath);
    result.series = folderInfo.series;
    if (!result.year && folderInfo.year) {
      result.year = folderInfo.year;
    }
    if (folderInfo.writer) {
      result.writer = folderInfo.writer;
    }
  }

  // Set confidence based on what we extracted
  let confidence = 0.3; // Base confidence for regex
  if (result.series) confidence += 0.2;
  if (result.number !== undefined) confidence += 0.2;
  if (result.title) confidence += 0.1;
  if (result.year) confidence += 0.1;
  if (result.ignoredTokens && result.ignoredTokens.length > 0) confidence += 0.1;
  result.confidence = Math.min(confidence, 0.9);

  return result;
}

// =============================================================================
// Main Parsing Functions
// =============================================================================

/**
 * Parse a single filename (uses LLM if available, falls back to regex)
 */
export async function parseFilename(
  filename: string,
  folderPath?: string,
  options: ParseOptions = {}
): Promise<ParsedFileMetadata> {
  const useLLM = options.useLLM !== false && isLLMAvailable();

  if (useLLM) {
    try {
      return await llmParseFilename(filename, folderPath, options.sessionId);
    } catch (err) {
      console.error('LLM parsing failed, falling back to regex:', err);
    }
  }

  return parseFilenameRegex(filename, folderPath);
}

/**
 * Parse multiple filenames in batch
 */
export async function parseFilenames(
  files: Array<{ filename: string; folderPath?: string }>,
  options: ParseOptions = {}
): Promise<ParsedFileMetadata[]> {
  const useLLM = options.useLLM !== false && isLLMAvailable();

  if (useLLM && files.length > 0) {
    try {
      const result = await parseFilenamesBatch(files, { sessionId: options.sessionId });
      if (result.success) {
        return result.results;
      }
      console.error('LLM batch parsing failed:', result.error);
    } catch (err) {
      console.error('LLM batch parsing failed, falling back to regex:', err);
    }
  }

  // Fall back to regex parsing
  return files.map((f) => parseFilenameRegex(f.filename, f.folderPath));
}

/**
 * Parse files with progress tracking
 */
export async function parseFilesWithTracking(
  files: Array<{ filename: string; folderPath?: string }>,
  options: {
    useLLM?: boolean;
    batchSize?: number;
    onProgress?: (progress: BatchProgress) => void;
    sessionId?: string;
  } = {}
): Promise<{
  success: boolean;
  results: ParsedFileMetadata[];
  errors: string[];
}> {
  const useLLM = options.useLLM !== false && isLLMAvailable();

  if (useLLM && files.length > 0) {
    return parseFilesWithProgress(files, {
      batchSize: options.batchSize,
      onProgress: options.onProgress,
      sessionId: options.sessionId,
    });
  }

  // Fall back to regex parsing (instant, no progress needed)
  const results = files.map((f) => parseFilenameRegex(f.filename, f.folderPath));
  return {
    success: true,
    results,
    errors: [],
  };
}

// =============================================================================
// Rename Suggestion Functions
// =============================================================================

/**
 * Generate rename preview for a file
 */
export async function generateRenamePreview(
  filePath: string,
  options: ParseOptions = {}
): Promise<RenamePreview> {
  const filename = basename(filePath);
  const folderPath = dirname(filePath);

  const parsed = await parseFilename(filename, folderPath, options);

  return {
    originalPath: filePath,
    suggestedFilename: generateSuggestedFilename(parsed),
    suggestedFolderName: generateSuggestedFolderName(parsed),
    parsedMetadata: parsed,
    confidence: parsed.confidence || 0,
  };
}

/**
 * Generate rename previews for multiple files
 */
export async function generateBatchRenamePreview(
  filePaths: string[],
  options: ParseOptions & { onProgress?: (progress: BatchProgress) => void } = {}
): Promise<BatchRenameResult> {
  const files = filePaths.map((path) => ({
    filename: basename(path),
    folderPath: dirname(path),
  }));

  const { success, results, errors } = await parseFilesWithTracking(files, options);

  const previews: RenamePreview[] = results.map((parsed, i) => ({
    originalPath: filePaths[i]!,
    suggestedFilename: generateSuggestedFilename(parsed),
    suggestedFolderName: generateSuggestedFolderName(parsed),
    parsedMetadata: parsed,
    confidence: parsed.confidence || 0,
  }));

  return {
    total: filePaths.length,
    parsed: results.length,
    withSuggestions: previews.filter((p) => p.suggestedFilename !== null).length,
    previews,
    errors: errors.map((e) => ({ path: '', error: e })),
  };
}

/**
 * Apply naming convention template to metadata
 */
export function applyNamingTemplate(
  metadata: ParsedFileMetadata,
  templateType: 'issue' | 'volume' | 'book' | 'special'
): string | null {
  return generateSuggestedFilename(metadata, { format: templateType });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if LLM parsing is available
 */
export { isLLMAvailable };

/**
 * Get current naming conventions
 */
export { loadConventions };

/**
 * Generate suggested filename
 */
export { generateSuggestedFilename, generateSuggestedFolderName };
